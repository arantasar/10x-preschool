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
  }
}
