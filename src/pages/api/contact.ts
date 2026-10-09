import type { APIRoute } from "astro";
import { CANONICAL_ORIGIN, CONTACT_TO, TURNSTILE_SECRET_KEY } from "astro:env/server";
import { contactPayloadSchema, type ContactErrorCode } from "@/lib/contact-form";
import { verifyHumanToken } from "@/lib/services/bot-check";
import { sendContactMail } from "@/lib/services/contact-mail";
import { getEmailBinding } from "@/lib/services/email-binding";

export const prerender = false;

/**
 * Far above the largest valid payload (5000 characters of message, at most four
 * UTF-8 bytes each, plus the token and the short fields), far below anything
 * worth parsing on a route anyone can call.
 */
export const CONTACT_BODY_MAX_BYTES = 32 * 1024;

function json(body: { ok: true } | { error: ContactErrorCode }, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/**
 * The contact form (S-19). One pipeline, in a fixed order: parse → honeypot →
 * validate → configuration → bot check → **store** → mail → answer.
 *
 * Storing comes before mailing, so "a real message is never lost" (PRD v3
 * §Warunki jakościowe) rests on Postgres alone: once the row exists, the
 * visitor hears success whatever the e-mail does, and a failed send leaves the
 * row plus a `contact.mail_failed` log line. Answers carry a code, never a
 * sentence - the island translates it (`contactErrorMessage`).
 */
export const POST: APIRoute = async (context) => {
  // Refused before the body is read: a declared size over the cap, or a body
  // that turns out bigger than declared (or declares nothing).
  const declared = Number(context.request.headers.get("Content-Length") ?? "0");
  if (declared > CONTACT_BODY_MAX_BYTES) {
    return json({ error: "validation_failed" }, 413);
  }
  let raw: unknown;
  try {
    const text = await context.request.text();
    if (new TextEncoder().encode(text).byteLength > CONTACT_BODY_MAX_BYTES) {
      return json({ error: "validation_failed" }, 413);
    }
    raw = JSON.parse(text);
  } catch {
    return json({ error: "validation_failed" }, 400);
  }
  if (typeof raw !== "object" || raw === null) {
    return json({ error: "validation_failed" }, 400);
  }

  // The honeypot answers exactly like success: a different status or body would
  // teach a bot which field to leave empty.
  const honeypot = (raw as { website?: unknown }).website;
  if (typeof honeypot === "string" && honeypot.trim() !== "") {
    /* eslint-disable-next-line no-console */
    console.error("contact.honeypot");
    return json({ ok: true });
  }

  const parsed = contactPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: "validation_failed" }, 400);
  }
  const payload = parsed.data;

  const { supabase, user } = context.locals;
  if (!supabase || !TURNSTILE_SECRET_KEY) {
    return json({ error: "config_missing" }, 503);
  }

  // The token must come from a widget on this very host: the form posts to its
  // own origin, so a token earned on a preview or on localhost fails here.
  const host = new URL(context.request.url).hostname;
  const check = await verifyHumanToken(payload.turnstileToken, {
    secret: TURNSTILE_SECRET_KEY,
    action: "contact",
    remoteIp: context.request.headers.get("CF-Connecting-IP"),
    hostname: host,
  });
  if (!check.ok) {
    return check.reason === "unavailable"
      ? json({ error: "bot_check_unavailable" }, 503)
      : json({ error: "bot_check_failed" }, 403);
  }
  // A test secret lets every token through. Expected locally; on the canonical
  // host it means the production secret was set to a test key.
  if (check.testingKey && CANONICAL_ORIGIN && host === new URL(CANONICAL_ORIGIN).hostname) {
    /* eslint-disable-next-line no-console */
    console.error("contact.bot_check_testing_key", { host });
  }

  // No `.select()`: the table is insert-only for the api roles, and reading the
  // row back (`insert ... returning`) needs a select grant that anon does not
  // have (`20261009120000_contact_messages.sql`).
  const { error } = await supabase.from("contact_messages").insert({
    user_id: user?.id ?? null,
    name: payload.name ?? null,
    email: payload.email,
    topic: payload.topic,
    message: payload.message,
  });
  if (error) {
    /* eslint-disable-next-line no-console */
    console.error("contact.save_failed", { code: error.code, message: error.message });
    return json({ error: "save_failed" }, 500);
  }

  const binding = getEmailBinding();
  if (!binding || !CONTACT_TO) {
    /* eslint-disable-next-line no-console */
    console.error("contact.mail_skipped", { binding: Boolean(binding), recipient: Boolean(CONTACT_TO) });
  } else {
    const delivery = sendContactMail(
      binding,
      {
        name: payload.name,
        email: payload.email,
        topic: payload.topic,
        message: payload.message,
        signedIn: Boolean(user),
      },
      CONTACT_TO,
    ).catch((sendError: unknown) => {
      /* eslint-disable-next-line no-console */
      console.error("contact.mail_failed", {
        message: sendError instanceof Error ? sendError.message : String(sendError),
      });
    });
    // The message is already stored, so the visitor does not wait for the mail:
    // on Workers the send finishes after the answer (`waitUntil`). Without an
    // execution context (tests) it is awaited instead.
    const { cfContext } = context.locals;
    if (cfContext) {
      cfContext.waitUntil(delivery);
    } else {
      await delivery;
    }
  }

  return json({ ok: true });
};
