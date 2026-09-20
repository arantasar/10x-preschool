/// <reference types="vitest/config" />
// A separate config, not a `test.projects` entry inside `vitest.config.ts`.
// Measured and load-bearing: `test.projects` defined inline does not inherit
// Astro's Vite plugins from `getViteConfig` - a gate test file under it fails
// on startup with `Error: Cannot find package 'astro:env/server'`, because it
// never has `astro:env/server` module. Calling `getViteConfig` a second time
// from its own file, exactly like `vitest.config.ts` does, is the only path
// that works.
import { getViteConfig } from "astro/config";
import { GATE_SUSPENDED, GATE_SUSPENSION_NOTICE } from "./src/lib/services/gate-suspension";

// Printed from the config rather than only from the suites, because Vitest's
// default reporter collapses the stderr of a file whose tests all skip - so the
// per-suite warning is invisible in exactly the run that needs it most
// (`npm run test:gate` with no flags). The config is evaluated in the main
// process, before any reporter, so this line always lands.
if (GATE_SUSPENDED) {
  // eslint-disable-next-line no-console
  console.warn(`\n⚠️  ${GATE_SUSPENSION_NOTICE}\n`);
}

export default getViteConfig(
  {
    test: {
      environment: "node",
      // The inverse of `vitest.config.ts`'s `exclude`: only the gate tier.
      include: ["src/**/*.gate.test.ts"],
      unstubGlobals: true,
      // A real judge call over the network can run past Vitest's 5s default,
      // especially with reasoning left enabled (`content-safety-judge.ts`).
      // Gate-tier tests are never in the per-edit or default-suite path, so a
      // longer ceiling here costs nothing but a slower `npm run test:gate`.
      testTimeout: 60_000,
      // Vitest runs test *files* in parallel by default, in separate workers.
      // With two real-network gate files (this calibration suite and Phase 4's
      // `content-safety.gate.test.ts`), that meant this file's five sequential
      // judge calls raced the other file's own calibration and matrix calls -
      // invisible to either file on its own, since each one's *internal*
      // concurrency was already deliberately low. Measured live: OpenRouter
      // returns `402 "in_flight_budget_exhausted"` the moment those two files'
      // concurrent Claude Opus calls exceed the account's in-flight credit
      // reservation, even with a positive balance. `fileParallelism: false`
      // serializes gate files against each other; each file's own test-level
      // concurrency (see `GATE_CONCURRENCY` in the matrix file) is unaffected.
      fileParallelism: false,
    },
  },
  // Same reason as `vitest.config.ts` - see `astro.config.test.mjs`.
  { configFile: "./astro.config.test.mjs" },
);
