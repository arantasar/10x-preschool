import type { APIRoute } from "astro";
import { CONFIG_MISSING, CONNECTION_FAILED } from "@/lib/auth-error-messages";
import { createClient } from "@/lib/supabase";

export const POST: APIRoute = async (context) => {
  const form = await context.request.formData();
  const email = form.get("email") as string;
  const password = form.get("password") as string;

  // `?error=` carries a code, never a sentence: the page translates it at render
  // through `@/lib/auth-error-messages`. Free text here would put Supabase's
  // English on a Polish screen - and would let a hand-crafted link render any
  // sentence inside our own error box.
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/auth/signin?error=${encodeURIComponent(CONFIG_MISSING)}`);
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // The English wording is the only thing that says *why* the call failed, so
    // it goes to the log rather than to the teacher. `wrangler.jsonc` sets
    // `observability.enabled`, so console output is captured.
    /* eslint-disable-next-line no-console */
    console.error("auth.signin.failed", { code: error.code, status: error.status, message: error.message });

    // A missing `code` is not a guess: per `@supabase/auth-js` `lib/errors.d.ts`
    // it means the failure happened before any response was received. An *empty*
    // code is the same case and `??` alone would not catch it - it would redirect
    // to a bare `?error=`, which the page reads as falsy and renders as no error
    // box at all, leaving the teacher with a silently blank form.
    const code = error.code ?? "";
    return context.redirect(`/auth/signin?error=${encodeURIComponent(code || CONNECTION_FAILED)}`);
  }

  // Straight to the month - the app's home screen. Going through `/` would
  // work too (it redirects a signed-in user), but at the cost of one extra hop
  // on the most-travelled path.
  return context.redirect("/plan/month");
};
