import type { APIRoute } from "astro";
import { CONTACT_TO, TURNSTILE_SECRET_KEY } from "astro:env/server";
import { contactPayloadSchema, type ContactErrorCode } from "@/lib/contact-form";
import { verifyHumanToken } from "@/lib/services/bot-check";
import { sendContactMail } from "@/lib/services/contact-mail";
import { getEmailBinding } from "@/lib/services/email-binding";

export const prerender = false;

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
  let raw: unknown;
  try {
    raw = await context.request.json();
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

  const check = await verifyHumanToken(payload.turnstileToken, {
    secret: TURNSTILE_SECRET_KEY,
    action: "contact",
    remoteIp: context.request.headers.get("CF-Connecting-IP"),
  });
  if (!check.ok) {
    return check.reason === "unavailable"
      ? json({ error: "bot_check_unavailable" }, 503)
      : json({ error: "bot_check_failed" }, 403);
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
    try {
      await sendContactMail(
        binding,
        {
          name: payload.name,
          email: payload.email,
          topic: payload.topic,
          message: payload.message,
          signedIn: Boolean(user),
        },
        CONTACT_TO,
      );
    } catch (sendError) {
      /* eslint-disable-next-line no-console */
      console.error("contact.mail_failed", {
        message: sendError instanceof Error ? sendError.message : String(sendError),
      });
    }
  }

  return json({ ok: true });
};
