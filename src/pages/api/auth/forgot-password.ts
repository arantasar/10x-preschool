import type { APIRoute } from "astro";
import { z } from "zod";
import { CONFIG_MISSING, CONNECTION_FAILED, isSilentResetRequestError } from "@/lib/auth-error-messages";
import { RESET_EMAIL_COOKIE, RESET_EMAIL_COOKIE_OPTIONS } from "@/lib/reset-request";

export const prerender = false;

const requestSchema = z.object({ email: z.string().trim().pipe(z.email()) });

/**
 * Ask Supabase for a recovery e-mail - without ever telling the visitor whether
 * the address has an account. Structurally parallel to `signin.ts`; see that
 * file for why `?error=` carries a code and not a sentence.
 */
export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const parsed = requestSchema.safeParse({ email: form.get("email") });
  if (!parsed.success) {
    return context.redirect("/auth/forgot-password?error=validation_failed");
  }
  const { email } = parsed.data;

  const { supabase } = context.locals;
  if (!supabase) {
    return context.redirect(`/auth/forgot-password?error=${encodeURIComponent(CONFIG_MISSING)}`);
  }

  // The recovery template builds its link from `{{ .RedirectTo }}`. This origin
  // must be in the project's redirect allow-list, or Supabase silently swaps in
  // Site URL and the link lands on `/` (`supabase/config.toml`, and the
  // dashboard in production).
  const redirectTo = `${new URL(context.request.url).origin}/auth/confirm`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

  if (error) {
    // The per-address cooldown can only fire for an address that has an account,
    // so showing it would be an account-enumeration oracle. It takes the success
    // path below, and the log is the only trace - under its own name, because the
    // project-wide e-mail quota answers with the same code, and then a teacher is
    // told to check an inbox that will stay empty.
    const silenced = isSilentResetRequestError(error.code);
    /* eslint-disable-next-line no-console */
    console.error(silenced ? "auth.reset_request.silenced" : "auth.reset_request.failed", {
      code: error.code,
      status: error.status,
      message: error.message,
    });

    if (!silenced) {
      const code = error.code ?? "";
      return context.redirect(`/auth/forgot-password?error=${encodeURIComponent(code || CONNECTION_FAILED)}`);
    }
  }

  context.cookies.set(RESET_EMAIL_COOKIE, email, RESET_EMAIL_COOKIE_OPTIONS);
  return context.redirect("/auth/forgot-password/sent");
};
