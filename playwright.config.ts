import { defineConfig, devices } from "@playwright/test";
import { BASE_URL } from "./tests/e2e/support/env";
import { TEACHER_A } from "./tests/e2e/support/supabase-admin";

/**
 * Konfiguracja e2e.
 *
 * Warstwa e2e jest w tym projekcie **najdrozsza i najbardziej podatna na
 * migotanie**, wiec zestaw jest maly i przywiazany do ryzyk z
 * `context/foundation/test-plan.md`, a nie do powierzchni aplikacji. Zasady
 * pisania testow: `tests/e2e/E2E-RULES.md`, wzorzec: `tests/e2e/seed.spec.ts`.
 *
 * Serwer dev podnosi sie sam i czyta `.dev.vars` (runtime Cloudflare), czyli
 * celuje w **lokalna** Supabase. To nie jest detal wygody: testy zakladaja konta
 * i kasuja plany dni, wiec wycelowanie ich w projekt produkcyjny skasowaloby
 * prawdziwe dane nauczycieli.
 */
export default defineConfig({
  testDir: "./tests/e2e",

  // Kazdy test ma wlasny dzien i sprzata po sobie, wiec rownoleglosc jest
  // bezpieczna - i jest tez testem tej niezaleznosci.
  fullyParallel: true,

  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["html", { open: "never" }], ["list"]] : "list",

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    // Zrzut ekranu tylko przy porazce: przy zielonym przebiegu to smieci.
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Domyslna tozsamosc zestawu to nauczyciel A. Test, ktory potrzebuje
        // drugiego konta (ryzyko #4), otwiera wlasny kontekst z sesja B -
        // patrz `day-plan-ownership.spec.ts`.
        storageState: TEACHER_A.storageState,
      },
      dependencies: ["setup"],
    },
  ],

  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    // Pierwszy start Astro z adapterem Cloudflare potrafi trwac.
    timeout: 120_000,
  },
});
