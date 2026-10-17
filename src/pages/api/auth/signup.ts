import type { APIRoute } from "astro";
import { CONFIG_MISSING, CONNECTION_FAILED, TERMS_NOT_ACCEPTED } from "@/lib/auth-error-messages";
import { TERMS_VERSION } from "@/lib/legal";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;
  const password = form.get("password") as string;

  // Regulamin § 5 ust. 1: no account without accepted terms. Checked here, not
  // only in the island - a form sent without JavaScript skips its validation.
  // Before the client is built, so a refused request never reaches Supabase.
  if (!form.get("terms")) {
    return context.redirect(`/auth/signup?error=${encodeURIComponent(TERMS_NOT_ACCEPTED)}`);
  }

  // Structurally parallel to `signin.ts` on purpose - a future reader will diff
  // the two. See that file for why `?error=` carries a code and not a sentence.
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signup?error=${encodeURIComponent(CONFIG_MISSING)}`);
  }
  // The confirmation template builds its link from `{{ .RedirectTo }}`, the same
  // way `forgot-password.ts` does for the reset: this origin's `/auth/confirm`
  // must be in the project's redirect allow-list, or Supabase silently swaps in
  // Site URL.
  const emailRedirectTo = `${new URL(context.request.url).origin}/auth/confirm`;
  // A trace of which terms the teacher accepted and when, kept with the account.
  // Not proof: `user_metadata` is writable by its owner's own session
  // (`updateUser({ data })`), so nothing may rest on it for access decisions.
  const data = { terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString() };
  const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo, data } });

  if (error) {
    /* eslint-disable-next-line no-console */
    console.error("auth.signup.failed", { code: error.code, status: error.status, message: error.message });

    // A missing code and an empty one are the same case, and `??` only catches the
    // first. An empty code would redirect to a bare `?error=`, which the page reads
    // as falsy and renders as no error box at all - a silently blank form.
    const code = error.code ?? "";
    return context.redirect(`/auth/signup?error=${encodeURIComponent(code || CONNECTION_FAILED)}`);
  }

  return context.redirect("/auth/confirm-email");
};
