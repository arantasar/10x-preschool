declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
    /**
     * The request's Supabase client, built once in `src/middleware.ts` and bound
     * to this request's cookies - so every query a route makes runs under the
     * caller's session, which is what RLS reads.
     *
     * `null` when the project is unconfigured, mirroring `createClient` in
     * `@/lib/supabase`: missing configuration is a value here, not an exception
     * thrown from module scope. Routes must handle it.
     */
    supabase: ReturnType<typeof import("@/lib/supabase").createClient>;
    /**
     * The Worker's execution context, set by `@astrojs/cloudflare` v13 on every
     * request (the replacement for `Astro.locals.runtime.ctx`). Only the slice
     * this app uses; absent under Vitest.
     */
    cfContext?: { waitUntil(promise: Promise<unknown>): void };
  }
}

/**
 * The Worker's bindings, as `@astrojs/cloudflare` v13 exposes them. Typed loosely
 * on purpose - the project does not generate `wrangler types` - and read in
 * exactly one place, `src/lib/services/email-binding.ts`, which narrows what it
 * needs. Vitest cannot resolve this module; tests mock that file instead.
 */
declare module "cloudflare:workers" {
  export const env: Record<string, unknown>;
}
