import type { AstroCookieSetOptions } from "astro";

/**
 * The address a reset was requested for, carried from the request route to the
 * "check your inbox" page so the page can name it without putting it in the
 * URL (where it would land in history and server logs).
 *
 * Scoped to `/auth` and short-lived: it only has to survive one redirect, a
 * page view and a few "Wyślij ponownie" presses.
 */
export const RESET_EMAIL_COOKIE = "reset_email";

export const RESET_EMAIL_COOKIE_OPTIONS: AstroCookieSetOptions = {
  path: "/auth",
  httpOnly: true,
  sameSite: "lax",
  secure: !import.meta.env.DEV,
  maxAge: 60 * 15,
};
