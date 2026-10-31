// @ts-check
//
// Astro configuration used *only* by the e2e server (`npm run dev:e2e`).
//
// Why a wrapper and not an environment variable: an `OPENROUTER_BASE_URL` would
// be a switch that also exists in production, one bad dashboard edit away from
// sending teachers' prompts somewhere else. Here no such switch exists: the
// `transform` below runs only under `astro dev`, so `astro build` never sees it.
//
// The call goes out from workerd, so `page.route()` cannot catch it; the URL
// itself is rewritten to `tests/e2e/support/llm-stub.mjs`. Everything else stays
// real: session, routes, RLS, saving. `/__e2e-stub` tells Playwright this server
// has the plugin, so a plain `npm run dev` left running is never reused - that
// one would call the real provider with the real key from `.dev.vars`.
//
// It MUST import the real config rather than copy it, for the reason given in
// `astro.config.test.mjs`.
import base from "./astro.config.mjs";

const PROVIDER_URL = "https://openrouter.ai/api/v1/chat/completions";
const STUB_URL = "http://127.0.0.1:4398/v1/chat/completions";

/** @returns {import("vite").Plugin} */
function stubOpenRouter() {
  return {
    name: "temio:e2e-stub-openrouter",
    apply: "serve",
    enforce: "pre",
    transform(code, id) {
      if (!id.split("?")[0].endsWith("/src/lib/services/activity-generator.ts")) return;
      // Throwing, not returning the code unchanged: a URL that moved would
      // otherwise send the suite to the real provider without a word.
      if (!code.includes(PROVIDER_URL)) {
        throw new Error(`astro.config.e2e.mjs: ${PROVIDER_URL} not found in activity-generator.ts`);
      }
      return code.replace(PROVIDER_URL, STUB_URL);
    },
    configureServer(server) {
      server.middlewares.use("/__e2e-stub", (_request, response) => {
        response.statusCode = 200;
        response.end("ok");
      });
    },
  };
}

export default {
  ...base,
  // Fixed: `additional_redirect_urls` in `supabase/config.toml` lists only 4321,
  // and a busy port has to end the run rather than move it.
  server: { port: 4321 },
  vite: {
    ...base.vite,
    // Its own cache, so the two dev servers do not fight over optimized deps
    // (F9, `context/archive/2026-09-29-design-foundation/follow-ups/review-fixes.md`).
    cacheDir: "node_modules/.vite-e2e",
    server: { strictPort: true },
    plugins: [...(base.vite?.plugins ?? []), stubOpenRouter()],
  },
};
