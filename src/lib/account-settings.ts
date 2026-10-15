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

/**
 * One-shot "your account was deleted" notice on `/`. Set by the delete-account
 * route only after `delete_own_account()` succeeded; the landing page deletes it
 * on the render that shows the notice. Scoped to `/` rather than to the settings
 * screen, because a deleted teacher can no longer reach `/ustawienia`.
 */
export const ACCOUNT_DELETED_COOKIE = "account_deleted";

export const ACCOUNT_DELETED_COOKIE_OPTIONS: AstroCookieSetOptions = {
  path: "/",
  httpOnly: true,
  sameSite: "lax",
  secure: !import.meta.env.DEV,
  maxAge: 60,
};

/**
 * The deletion card's own error slot on `/ustawienia`. `?error=` belongs to the
 * change-password form; deletion errors travel as `?delete_error=<code>` with
 * the card's anchor, so the page scrolls to the card that failed.
 */
export const DELETE_ERROR_PARAM = "delete_error";
export const DELETE_ACCOUNT_ANCHOR = "usun-konto";
