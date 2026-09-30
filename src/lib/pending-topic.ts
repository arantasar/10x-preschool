import type { AstroCookieSetOptions } from "astro";

/**
 * The hasło a guest typed on the landing, waiting for their first login.
 *
 * It travels in a cookie rather than in the URL because the way from the
 * landing to the planner is not one navigation: sign-up ends on "check your
 * inbox", the session is born only after the confirmation link and a separate
 * sign-in, and no query parameter survives that. The auth pages write it, the
 * sign-in endpoint reads it to pick the landing page, and the week page
 * consumes it - once.
 */
export const PENDING_TOPIC_COOKIE = "pending_topic";

/**
 * Deliberately far below `PROMPT_MAX` (2000). A cookie is capped at ~4 KB and
 * the value is percent-encoded: a Polish letter takes 6 bytes, an emoji 12, so
 * 2000 characters could overflow it. A landing hasło is a word or a phrase; the
 * form's `maxlength` matches this.
 */
export const PENDING_TOPIC_MAX = 200;

export const PENDING_TOPIC_COOKIE_OPTIONS: AstroCookieSetOptions = {
  path: "/",
  httpOnly: true,
  sameSite: "lax",
  secure: !import.meta.env.DEV,
  maxAge: 60 * 60 * 24 * 7,
};

/**
 * Trimmed, whitespace collapsed; `null` for anything not worth carrying -
 * missing, blank, or longer than `PENDING_TOPIC_MAX`. A too-long value is
 * dropped rather than cut: a truncated hasło is a different hasło.
 */
export function normalizePendingTopic(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const topic = raw.replace(/\s+/g, " ").trim();
  if (topic === "" || topic.length > PENDING_TOPIC_MAX) return null;
  return topic;
}
