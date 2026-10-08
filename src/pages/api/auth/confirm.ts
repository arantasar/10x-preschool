import type { APIRoute } from "astro";
import { z } from "zod";
import {
  CONFIG_MISSING,
  CONNECTION_FAILED,
  RESET_LINK_INVALID,
  SIGNUP_LINK_EXPIRED,
  SIGNUP_LINK_INVALID,
} from "@/lib/auth-error-messages";
import { RESET_EMAIL_COOKIE, RESET_EMAIL_COOKIE_OPTIONS } from "@/lib/reset-request";

export const prerender = false;

const confirmSchema = z.object({
  token_hash: z.string().min(1),
  type: z.enum(["recovery", "email"]),
});

/**
 * Turn a mailed `token_hash` into a session - the recovery link (`type=recovery`)
 * or the sign-up activation link (`type=email`). Only reached by the button on
 * `/auth/confirm`, never by the link itself - see that page for why.
 *
 * `verifyOtp` with a `token_hash` needs no PKCE code verifier, so the link
 * works in a different browser or on a different device than the one the
 * mail was requested from.
 *
 * A failed activation goes to `/auth/signin`, not to the forgot-password page:
 * that page's form and wording are about a new password.
 */
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const parsed = confirmSchema.safeParse({ token_hash: form.get("token_hash"), type: form.get("type") });
  if (!parsed.success) {
    if (form.get("type") === "email") {
      return context.redirect(`/auth/signin?error=${SIGNUP_LINK_INVALID}`);
    }
    return context.redirect(`/auth/forgot-password?error=${RESET_LINK_INVALID}`);
  }
  const { token_hash, type } = parsed.data;
  const errorPage = type === "email" ? "/auth/signin" : "/auth/forgot-password";

  const { supabase } = context.locals;
  if (!supabase) {
    return context.redirect(`${errorPage}?error=${encodeURIComponent(CONFIG_MISSING)}`);
  }

  const { error } = await supabase.auth.verifyOtp({ type, token_hash });

  if (error) {
    /* eslint-disable-next-line no-console */
    console.error(type === "email" ? "auth.signup_confirm.failed" : "auth.reset_confirm.failed", {
      code: error.code,
      status: error.status,
      message: error.message,
    });

    // An expired and an already-used link both come back as `otp_expired`. On the
    // forgot-password page that sits right above the form for a new link; an
    // activation link gets its own code, because `otp_expired` is worded for the reset.
    let code = error.code ?? "";
    if (type === "email" && code === "otp_expired") code = SIGNUP_LINK_EXPIRED;
    return context.redirect(`${errorPage}?error=${encodeURIComponent(code || CONNECTION_FAILED)}`);
  }

  if (type === "email") {
    return context.redirect("/plan/month");
  }

  // The link worked, so "check your inbox" has nothing left to say - and on a
  // shared computer it should not keep naming her address for the next person.
  context.cookies.delete(RESET_EMAIL_COOKIE, { path: RESET_EMAIL_COOKIE_OPTIONS.path });
  return context.redirect("/auth/new-password");
};
