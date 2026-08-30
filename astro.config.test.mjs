// @ts-check
//
// Astro configuration used *only* by Vitest, via `getViteConfig(..., { configFile })`.
//
// Why this file exists: Vitest injects `resolve.external` into the `ssr`
// environment, and `@cloudflare/vite-plugin` rejects that in `configResolved`,
// aborting the whole run with a Startup Error before a single test executes:
//
//   Error: The following environment options are incompatible with the
//   Cloudflare Vite plugin: "ssr" environment: resolve.external: [...]
//
// Passing `{ adapter: undefined, integrations: [] }` as `inlineAstroConfig` does
// NOT help — Astro still loads `astro.config.mjs` from disk and merges it, and
// the plugin comes back with the same error. Pointing `configFile` at this
// adapter-free config is the only path that works.
//
// It MUST import the real config rather than copy it: the `env` schema lives in
// `astro.config.mjs` and is what gives tests `astro:env/server`. A copy would
// drift on the first new variable.
import base from "./astro.config.mjs";

export default { ...base, adapter: undefined, integrations: [] };
