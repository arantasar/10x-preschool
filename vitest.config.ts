// Importing anything from `vitest/config` - `configDefaults` here - applies its
// ambient module augmentation of Vite's `UserConfig` with the `test` key, same
// as the triple-slash `/// <reference types="vitest/config" />` this replaces.
// Without either, `tsc --noEmit` reports `TS2353: 'test' does not exist in type
// 'UserConfig'`, because Astro's `ViteUserConfig` does not carry it on its own.
import { getViteConfig } from "astro/config";
import { configDefaults } from "vitest/config";

export default getViteConfig(
  {
    test: {
      // Astro 6 dropped component rendering in client-like environments; every
      // test in this suite exercises server code or pure functions.
      environment: "node",
      // Tests are co-located next to the module they cover.
      include: ["src/**/*.test.ts"],
      // The content-safety gate tier (`vitest.gate.config.ts`) needs a real
      // `OPENROUTER_API_KEY` and runs in CI only when prompts/models change - it
      // must never join this default, keyless, sub-second set. Spreading
      // `configDefaults.exclude` rather than replacing it, because setting
      // `exclude` at all overrides Vitest's own default exclusions
      // (`node_modules`, `dist`, ...), and this array is meant to add to them,
      // not narrow them.
      exclude: [...configDefaults.exclude, "src/**/*.gate.test.ts"],
      // Undoes `vi.stubGlobal("fetch", ...)` between tests automatically, so a
      // stubbed network boundary cannot leak into the next case.
      unstubGlobals: true,
    },
  },
  // See `astro.config.test.mjs` for why the adapter-free config is mandatory.
  { configFile: "./astro.config.test.mjs" },
);
