import type { APIRoute } from "astro";
import { z } from "zod";
import { SETTINGS_PATH, PASSWORD_CHANGED_COOKIE, PASSWORD_CHANGED_COOKIE_OPTIONS } from "@/lib/account-settings";
import {
  CONFIG_MISSING,
  CONNECTION_FAILED,
  CURRENT_PASSWORD_INVALID,
  PASSWORD_CHANGE_FAILED,
} from "@/lib/auth-error-messages";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-policy";

export const prerender = false;

// Mirrors `validatePasswordChange`, which the form runs first. The server is the
// authority; a triple that slipped past the client gets the generic form error.
const changeSchema = z
  .object({ current: z.string().min(1), password: z.string().min(MIN_PASSWORD_LENGTH), repeat: z.string() })
  .refine((data) => data.password === data.repeat && data.password !== data.current);

function fail(code: string) {
  return `${SETTINGS_PATH}?error=${encodeURIComponent(code)}`;
}

/**
 * Change the signed-in teacher's password and cut off every other device.
 *
 * The order is the security contract:
 *
 * 1. `signInWithPassword` with the **session's** e-mail proves the current
 *    password - the form has no e-mail field, and an address from the request
 *    would make this route a credential oracle for any account. The fresh
 *    session also satisfies `secure_password_change`, which refuses
 *    `updateUser` from a session older than 24 h. A failure writes no cookies,
 *    so the teacher's current session is untouched.
 * 2. `updateUser` saves the new password. Nothing has changed before this point.
 * 3. `signOut({ scope: "others" })` revokes every other session, including this
 *    device's previous one - harmless, the browser already holds the fresh
 *    cookies. Never called before step 2 succeeded.
 */
export const POST: APIRoute = async (context) => {
  const { supabase, user } = context.locals;
  if (!supabase) {
    return context.redirect(fail(CONFIG_MISSING));
  }
  if (!user?.email) {
    return context.redirect("/auth/signin");
  }

  const form = await context.request.formData();
  const parsed = changeSchema.safeParse({
    current: form.get("current"),
    password: form.get("password"),
    repeat: form.get("repeat"),
  });
  if (!parsed.success) {
    return context.redirect(fail("validation_failed"));
  }

  const { current, password } = parsed.data;

  const { error: reauthError } = await supabase.auth.signInWithPassword({ email: user.email, password: current });
  if (reauthError) {
    /* eslint-disable-next-line no-console */
    console.error("auth.change_password.reauth_failed", { code: reauthError.code, status: reauthError.status });

    const code = reauthError.code === "invalid_credentials" ? CURRENT_PASSWORD_INVALID : reauthError.code;
    return context.redirect(fail(code ?? CONNECTION_FAILED));
  }

  const { error: updateError } = await supabase.auth.updateUser({ password });
  if (updateError) {
    /* eslint-disable-next-line no-console */
    console.error("auth.change_password.failed", {
      code: updateError.code,
      status: updateError.status,
      message: updateError.message,
    });

    // Unreachable after a fresh sign-in; if it ever appears, the reset wording
    // for this code ("a fresh link") would send the teacher the wrong way.
    const code = updateError.code === "reauthentication_needed" ? PASSWORD_CHANGE_FAILED : updateError.code;
    return context.redirect(fail(code ?? CONNECTION_FAILED));
  }

  // The password is changed from here on, whatever happens next. A failed
  // sign-out of the other sessions is logged, but it neither undoes nor hides
  // the change - the same rule as `update-password.ts`.
  const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
  if (signOutError) {
    /* eslint-disable-next-line no-console */
    console.error("auth.change_password.signout_others_failed", {
      code: signOutError.code,
      status: signOutError.status,
      message: signOutError.message,
    });
  }

  context.cookies.set(PASSWORD_CHANGED_COOKIE, "1", PASSWORD_CHANGED_COOKIE_OPTIONS);
  return context.redirect(SETTINGS_PATH);
};
