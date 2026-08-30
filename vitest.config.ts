/// <reference types="vitest/config" />
// The triple-slash reference above is load-bearing: without it `tsc --noEmit`
// reports `TS2353: 'test' does not exist in type 'UserConfig'`, because Astro's
// `ViteUserConfig` does not carry Vitest's `test` key on its own.
import { getViteConfig } from "astro/config";

export default getViteConfig(
  {
    test: {
      // Astro 6 dropped component rendering in client-like environments; every
      // test in this suite exercises server code or pure functions.
      environment: "node",
      // Tests are co-located next to the module they cover.
      include: ["src/**/*.test.ts"],
      // Undoes `vi.stubGlobal("fetch", ...)` between tests automatically, so a
      // stubbed network boundary cannot leak into the next case.
      unstubGlobals: true,
    },
  },
  // See `astro.config.test.mjs` for why the adapter-free config is mandatory.
  { configFile: "./astro.config.test.mjs" },
);
