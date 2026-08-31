import type { APIRoute } from "astro";
import { CONFIG_MISSING, CONNECTION_FAILED } from "@/lib/auth-error-messages";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;
  const password = form.get("password") as string;

  // Structurally parallel to `signin.ts` on purpose - a future reader will diff
  // the two. See that file for why `?error=` carries a code and not a sentence.
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signup?error=${encodeURIComponent(CONFIG_MISSING)}`);
  }
  const { error } = await supabase.auth.signUp({ email, password });

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
