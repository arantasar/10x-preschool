import type { APIRoute } from "astro";
import { z } from "zod";
import { CONFIG_MISSING, CONNECTION_FAILED, RESET_SESSION_MISSING } from "@/lib/auth-error-messages";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-policy";
import { PASSWORD_RESET_DONE_COOKIE, PASSWORD_RESET_DONE_COOKIE_OPTIONS } from "@/lib/reset-request";

export const prerender = false;

// Mirrors `validateNewPassword`, which the form runs first. The server is the
// authority; a pair that slipped past the client gets the generic form error.
const updateSchema = z
  .object({ password: z.string().min(MIN_PASSWORD_LENGTH), repeat: z.string() })
  .refine((data) => data.password === data.repeat);

/**
 * Save the new password, cut off every other device signed in to the account,
 * and take the teacher to her month.
 */
/** `updateUser` codes that mean "this session cannot set a password any more". */
const SESSION_ERRORS = new Set(["session_not_found", "reauthentication_needed"]);

export const POST: APIRoute = async (context) => {
  const { supabase, user } = context.locals;
  if (!supabase) {
    return context.redirect(`/auth/new-password?error=${encodeURIComponent(CONFIG_MISSING)}`);
  }
  if (!user) {
    return context.redirect(`/auth/forgot-password?error=${RESET_SESSION_MISSING}`);
  }

  const form = await context.request.formData();
  const parsed = updateSchema.safeParse({ password: form.get("password"), repeat: form.get("repeat") });
  if (!parsed.success) {
    return context.redirect("/auth/new-password?error=validation_failed");
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    /* eslint-disable-next-line no-console */
    console.error("auth.update_password.failed", { code: error.code, status: error.status, message: error.message });

    // Without a usable session `/auth/new-password` would only bounce to the
    // forgot-password form with its own code, hiding this one - send her there
    // directly, where the message sits right above the form for a new link.
    const code = error.code ?? "";
    const target = SESSION_ERRORS.has(code) ? "/auth/forgot-password" : "/auth/new-password";
    return context.redirect(`${target}?error=${encodeURIComponent(code || CONNECTION_FAILED)}`);
  }

  // The password is changed from here on, whatever happens next. A failed
  // sign-out of the other sessions is logged, but it neither undoes nor hides
  // the change: the teacher still goes to her month.
  const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
  if (signOutError) {
    /* eslint-disable-next-line no-console */
    console.error("auth.update_password.signout_others_failed", {
      code: signOutError.code,
      status: signOutError.status,
      message: signOutError.message,
    });
  }

  context.cookies.set(PASSWORD_RESET_DONE_COOKIE, "1", PASSWORD_RESET_DONE_COOKIE_OPTIONS);
  return context.redirect("/plan/month");
};
