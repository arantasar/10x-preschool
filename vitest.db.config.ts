// The route + real client tier (test plan §6.3): routes called as functions,
// with `locals.supabase` a real `supabase-js` client signed in as teacher a or
// b against the local stack. It proves the route and RLS at once, which the
// PostgREST stub in `npm test` cannot - the stub returns whatever it is told.
//
// A separate config for the same reason `vitest.gate.config.ts` is one:
// `test.projects` inline does not inherit Astro's Vite plugins. And separate
// from `npm test` because it needs Docker and the stack's keys, which the
// default, keyless, sub-second set must never depend on.
import { getViteConfig } from "astro/config";

export default getViteConfig(
  {
    test: {
      environment: "node",
      // The inverse of `vitest.config.ts`'s entry for this tier.
      include: ["src/**/*.db.test.ts"],
      // Two fixed accounts shared by every file. Files run one after another so
      // no file's cleanup can race another's assertions on the same teacher.
      fileParallelism: false,
      // GoTrue sign-in and a handful of PostgREST round trips per case.
      testTimeout: 30_000,
      hookTimeout: 30_000,
    },
  },
  // Same reason as `vitest.config.ts` - see `astro.config.test.mjs`.
  { configFile: "./astro.config.test.mjs" },
);
