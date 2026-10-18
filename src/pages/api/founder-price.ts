import type { APIRoute } from "astro";
import { CANONICAL_ORIGIN, TURNSTILE_SECRET_KEY } from "astro:env/server";
import { FOUNDER_PRICE_BOT_ACTION, founderPricePayloadSchema, type FounderPriceErrorCode } from "@/lib/founder-price";
import { verifyHumanToken } from "@/lib/services/bot-check";

export const prerender = false;

/**
 * Far above the largest valid payload (an address of 254 characters, the
 * token and two short fields), far below anything worth parsing on a route
 * anyone can call.
 */
export const FOUNDER_PRICE_BODY_MAX_BYTES = 4 * 1024;

function json(body: { ok: true } | { error: FounderPriceErrorCode }, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/**
 * The founder-price sign-up (S-22). One pipeline, in a fixed order: parse →
 * honeypot → validate → address → configuration → bot check → store → answer.
 *
 * The address of a signed-in teacher comes from her session, never from the
 * body: otherwise she could put any address on the list under her account.
 * A repeat of an address already listed is a unique violation, answered as
 * success - the visitor cannot tell who is on the list, and the row stays one.
 * No e-mail is sent (the launch e-mail is S-25), and no log line carries the
 * address. Answers carry a code, never a sentence - the island translates it
 * (`founderPriceErrorMessage`).
 */
export const POST: APIRoute = async (context) => {
  // Refused before the body is read: a declared size over the cap, or a body
  // that turns out bigger than declared (or declares nothing).
  const declared = Number(context.request.headers.get("Content-Length") ?? "0");
  if (declared > FOUNDER_PRICE_BODY_MAX_BYTES) {
    return json({ error: "validation_failed" }, 413);
  }
  let raw: unknown;
  try {
    const text = await context.request.text();
    if (new TextEncoder().encode(text).byteLength > FOUNDER_PRICE_BODY_MAX_BYTES) {
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
    console.error("founder_price.honeypot");
    return json({ ok: true });
  }

  const parsed = founderPricePayloadSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: "validation_failed" }, 400);
  }
  const payload = parsed.data;

  const { supabase, user } = context.locals;
  // Signed in: her session's address and account, whatever the body says. The
  // insert policy for authenticated refuses anything else anyway.
  const email = user ? user.email?.trim().toLowerCase() : payload.email;
  if (!email) {
    return json({ error: "validation_failed" }, 400);
  }

  if (!supabase || !TURNSTILE_SECRET_KEY) {
    return json({ error: "config_missing" }, 503);
  }

  // The token must come from a widget on this very host: the form posts to its
  // own origin, so a token earned on a preview or on localhost fails here.
  const host = new URL(context.request.url).hostname;
  const check = await verifyHumanToken(payload.turnstileToken, {
    secret: TURNSTILE_SECRET_KEY,
    action: FOUNDER_PRICE_BOT_ACTION,
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
    console.error("founder_price.bot_check_testing_key", { host });
  }

  // No `.select()`: anon may insert but not read, and reading the row back
  // (`insert ... returning`) needs a select grant that anon does not have. No
  // upsert either: a plain insert keeps the table insert-only for writes
  // (`20261019120000_founder_price_signups.sql`).
  const { error } = await supabase.from("founder_price_signups").insert({
    email,
    user_id: user?.id ?? null,
    period: payload.period,
  });
  if (error) {
    // Already on the list: the same success, nothing changes.
    if (error.code === "23505") {
      /* eslint-disable-next-line no-console */
      console.error("founder_price.duplicate", { signedIn: Boolean(user) });
      return json({ ok: true });
    }
    /* eslint-disable-next-line no-console */
    console.error("founder_price.save_failed", { code: error.code, message: error.message });
    return json({ error: "save_failed" }, 500);
  }

  return json({ ok: true });
};
