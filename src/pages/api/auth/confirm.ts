import type { APIRoute } from "astro";
import { z } from "zod";
import { CONFIG_MISSING, CONNECTION_FAILED, RESET_LINK_INVALID } from "@/lib/auth-error-messages";
import { RESET_EMAIL_COOKIE, RESET_EMAIL_COOKIE_OPTIONS } from "@/lib/reset-request";

export const prerender = false;

const confirmSchema = z.object({
  token_hash: z.string().min(1),
  type: z.literal("recovery"),
});

/**
 * Turn the recovery link's `token_hash` into a session. Only reached by the
 * button on `/auth/confirm`, never by the link itself - see that page for why.
 *
 * `verifyOtp` with a `token_hash` needs no PKCE code verifier, so the link
 * works in a different browser or on a different device than the one the
 * reset was requested from.
 */
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const parsed = confirmSchema.safeParse({ token_hash: form.get("token_hash"), type: form.get("type") });
  if (!parsed.success) {
    return context.redirect(`/auth/forgot-password?error=${RESET_LINK_INVALID}`);
  }

  const { supabase } = context.locals;
  if (!supabase) {
    return context.redirect(`/auth/forgot-password?error=${encodeURIComponent(CONFIG_MISSING)}`);
  }

  const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: parsed.data.token_hash });

  if (error) {
    /* eslint-disable-next-line no-console */
    console.error("auth.reset_confirm.failed", { code: error.code, status: error.status, message: error.message });

    // An expired and an already-used link both come back as `otp_expired`, and
    // the forgot-password page shows it right above the form for a new link.
    const code = error.code ?? "";
    return context.redirect(`/auth/forgot-password?error=${encodeURIComponent(code || CONNECTION_FAILED)}`);
  }

  // The link worked, so "check your inbox" has nothing left to say - and on a
  // shared computer it should not keep naming her address for the next person.
  context.cookies.delete(RESET_EMAIL_COOKIE, { path: RESET_EMAIL_COOKIE_OPTIONS.path });
  return context.redirect("/auth/new-password");
};
