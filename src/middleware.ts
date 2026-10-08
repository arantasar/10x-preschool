import { defineMiddleware } from "astro:middleware";
import { CANONICAL_ORIGIN, LEGACY_HOST } from "astro:env/server";
import { canonicalRedirect } from "@/lib/canonical-host";
import { createClient } from "@/lib/supabase";

// Pages only. `POST /api/day-plan/generate` deliberately stays out and checks
// the session itself: the redirect below is the right answer for a page and the
// wrong one for a route a React island calls with `fetch`, which would follow it
// and try to parse the sign-in page as JSON.
const PROTECTED_ROUTES = ["/plan"];

export const onRequest = defineMiddleware(async (context, next) => {
  // First, before the Supabase client: a request that is about to leave for the
  // canonical origin costs no `getUser()` round trip.
  const moved = canonicalRedirect(context.url, context.request.method, LEGACY_HOST, CANONICAL_ORIGIN);
  if (moved) {
    return new Response(null, { status: moved.status, headers: { Location: moved.location } });
  }

  const supabase = createClient(context.request.headers, context.cookies);

  // Handed to the routes as well as used here. It is already built and already
  // bound to this request's cookies; constructing a second one per route would
  // duplicate the cookie plumbing and invite the two to disagree about which
  // session is current.
  context.locals.supabase = supabase;

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    context.locals.user = user ?? null;
  } else {
    context.locals.user = null;
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  return next();
});
