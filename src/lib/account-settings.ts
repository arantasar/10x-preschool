import type { AstroCookieSetOptions } from "astro";

/**
 * The account-settings screen. Shared by the middleware (`PROTECTED_ROUTES`),
 * the header's avatar link and the change-password route's redirects.
 */
export const SETTINGS_PATH = "/ustawienia";

/**
 * One-shot "your password was changed" notice for the settings screen. Set by
 * the change-password route only after `updateUser` succeeded; the page deletes
 * it on the first render that shows the notice, so a reload removes it by
 * construction - the same pattern as `PASSWORD_RESET_DONE_COOKIE`, scoped to
 * this screen instead of `/plan`.
 */
export const PASSWORD_CHANGED_COOKIE = "password_changed";

export const PASSWORD_CHANGED_COOKIE_OPTIONS: AstroCookieSetOptions = {
  path: SETTINGS_PATH,
  httpOnly: true,
  sameSite: "lax",
  secure: !import.meta.env.DEV,
  maxAge: 60,
};
