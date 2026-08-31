// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  output: "server",
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  adapter: cloudflare(),
  // On by default in Astro 6, but the signed-in app's only state-changing form -
  // the sign-out POST in `src/components/AppHeader.astro` - has no CSRF
  // token of its own and rests entirely on this check. Stated explicitly so a
  // future default change or a `security` edit cannot remove it silently.
  security: { checkOrigin: true },
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      // optional for the same reason as SUPABASE_*: a required secret would make
      // every CI build depend on a repository secret, and would surface a missing
      // key as an exception instead of the config-status message.
      OPENROUTER_API_KEY: envField.string({ context: "server", access: "secret", optional: true }),
      // Stays optional: validation belongs to `src/lib/services/allowed-models.ts`,
      // which checks the value against the allow-list on every request and
      // reports an off-list model as a config failure. Making it required here
      // would tie every CI build to a repository secret, for the reason stated
      // above OPENROUTER_API_KEY.
      OPENROUTER_MODEL: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
});
