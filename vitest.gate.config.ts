/// <reference types="vitest/config" />
// A separate config, not a `test.projects` entry inside `vitest.config.ts`.
// Measured and load-bearing: `test.projects` defined inline does not inherit
// Astro's Vite plugins from `getViteConfig` - a gate test file under it fails
// on startup with `Error: Cannot find package 'astro:env/server'`, because it
// never has `astro:env/server` module. Calling `getViteConfig` a second time
// from its own file, exactly like `vitest.config.ts` does, is the only path
// that works.
import { getViteConfig } from "astro/config";

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
    },
  },
  // Same reason as `vitest.config.ts` - see `astro.config.test.mjs`.
  { configFile: "./astro.config.test.mjs" },
);
