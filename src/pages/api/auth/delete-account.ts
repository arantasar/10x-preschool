import type { APIRoute } from "astro";
import { z } from "zod";
import {
  ACCOUNT_DELETED_COOKIE,
  ACCOUNT_DELETED_COOKIE_OPTIONS,
  DELETE_ACCOUNT_ANCHOR,
  DELETE_ERROR_PARAM,
  SETTINGS_PATH,
} from "@/lib/account-settings";
import {
  ACCOUNT_DELETE_FAILED,
  CONFIG_MISSING,
  CONNECTION_FAILED,
  CURRENT_PASSWORD_INVALID,
} from "@/lib/auth-error-messages";

export const prerender = false;

// The form's only field. An e-mail in the request is ignored by construction:
// the schema does not read one.
const deleteSchema = z.object({ current: z.string().min(1) });

function fail(code: string) {
  return `${SETTINGS_PATH}?${DELETE_ERROR_PARAM}=${encodeURIComponent(code)}#${DELETE_ACCOUNT_ANCHOR}`;
}

/**
 * Delete the signed-in teacher's account and every plan with it (FR-024).
 *
 * The order is the security contract:
 *
 * 1. `signInWithPassword` with the **session's** e-mail proves the current
 *    password - the proof of intent that an open session on a shared preschool
 *    computer does not give. An address from the request would make this route a
 *    credential oracle for any account. A failure writes no cookies and deletes
 *    nothing.
 * 2. `rpc("delete_own_account")` removes the caller's `auth.users` row; plans,
 *    proposals and every session go with it through the foreign keys. The
 *    function takes no id - it deletes `auth.uid()` - so nothing in this request
 *    can name another account. A failure deletes nothing; the fresh session from
 *    step 1 is harmless.
 * 3. `signOut({ scope: "local" })` clears this browser's `sb-*` cookies. The
 *    server-side session is already gone with the user row, so GoTrue may answer
 *    with an error; the SDK still drops the local session on 401/403/404, and
 *    any other error is only logged - the account is deleted either way.
 * 4. The one-shot `account_deleted` cookie, and home.
 *
 * No per-account attempt limit, by decision (lessons.md, "Logowanie z Workera
 * nie niesie IP klienta"): the route is reachable only with a valid session, so
 * a guesser already holds the account, and change-password allows the same
 * guessing. Revisit at S-25, the first moment an account carries money.
 *
 * Like change-password, the form has no CSRF token: it rests on
 * `security.checkOrigin` in `astro.config.mjs`.
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
  const parsed = deleteSchema.safeParse({ current: form.get("current") });
  if (!parsed.success) {
    return context.redirect(fail("validation_failed"));
  }

  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.current,
  });
  if (reauthError) {
    /* eslint-disable-next-line no-console */
    console.error("auth.delete_account.reauth_failed", { code: reauthError.code, status: reauthError.status });

    const code = reauthError.code === "invalid_credentials" ? CURRENT_PASSWORD_INVALID : reauthError.code;
    return context.redirect(fail(code ?? CONNECTION_FAILED));
  }

  const { error: deleteError } = await supabase.rpc("delete_own_account");
  if (deleteError) {
    /* eslint-disable-next-line no-console */
    console.error("auth.delete_account.failed", { code: deleteError.code, message: deleteError.message });
    return context.redirect(fail(ACCOUNT_DELETE_FAILED));
  }

  // The account is gone from here on, whatever happens next.
  const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
  if (signOutError) {
    /* eslint-disable-next-line no-console */
    console.error("auth.delete_account.signout_failed", {
      code: signOutError.code,
      status: signOutError.status,
      message: signOutError.message,
    });
  }

  /* eslint-disable-next-line no-console */
  console.info("auth.delete_account.done", { userId: user.id });

  context.cookies.set(ACCOUNT_DELETED_COOKIE, "1", ACCOUNT_DELETED_COOKIE_OPTIONS);
  return context.redirect("/");
};
