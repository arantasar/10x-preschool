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

/**
 * One-shot "your password was changed" notice for the month page. Set by the
 * save route only after `updateUser` succeeded; the month page deletes it on
 * the first render that shows the notice, so a reload removes it by
 * construction - no sticky query parameter.
 */
export const PASSWORD_RESET_DONE_COOKIE = "password_reset_done";

export const PASSWORD_RESET_DONE_COOKIE_OPTIONS: AstroCookieSetOptions = {
  path: "/plan",
  httpOnly: true,
  sameSite: "lax",
  secure: !import.meta.env.DEV,
  maxAge: 60,
};
