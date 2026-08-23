import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";

// Pages only. `POST /api/day-plan/generate` deliberately stays out and checks
// the session itself: the redirect below is the right answer for a page and the
// wrong one for a route a React island calls with `fetch`, which would follow it
// and try to parse the sign-in page as JSON.
const PROTECTED_ROUTES = ["/dashboard", "/plan"];

export const onRequest = defineMiddleware(async (context, next) => {
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
