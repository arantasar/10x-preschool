import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Konfiguracja e2e, czytana z `.env.e2e` (gitignored) z fallbackiem na
 * `process.env` — dla CI, gdzie sekrety wchodza zmiennymi, nie plikiem.
 *
 * Osobny plik zamiast `.env` albo `.dev.vars` jest celowy. Tamte dwa niosa
 * klucz *publikowalny*, bo taki wlasnie ma aplikacja; testy potrzebuja klucza
 * serwisowego do zakladania kont i sprzatania. Trzymanie go w tym samym pliku
 * co konfiguracja aplikacji to jedna pomylka w imporcie od uruchomienia
 * produkcyjnego kodu z uprawnieniami omijajacymi RLS.
 */

function parseEnvFile(path: string): Record<string, string | undefined> {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return {};
  }

  const entries: Record<string, string | undefined> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    entries[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return entries;
}

const fileEnv = parseEnvFile(resolve(process.cwd(), ".env.e2e"));

function required(name: string): string {
  const value = process.env[name] ?? fileEnv[name];
  if (!value) {
    throw new Error(
      `Brakuje ${name}. Skopiuj .env.e2e.example do .env.e2e i uzupelnij ` +
        `wartosciami z 'npx supabase status' (lokalny stack musi byc uruchomiony).`,
    );
  }
  return value;
}

export const e2eEnv = {
  get supabaseUrl(): string {
    return required("E2E_SUPABASE_URL");
  },
  get supabaseSecretKey(): string {
    return required("E2E_SUPABASE_SECRET_KEY");
  },
  get password(): string {
    return required("E2E_PASSWORD");
  },
};

/**
 * Adres serwera dev, ktory Playwright podnosi i pod ktory chodza testy.
 *
 * `localhost`, nie `127.0.0.1`: `astro dev` nasluchuje wylacznie na `[::1]:4321`
 * (IPv6), wiec odpytywanie adresu IPv4 konczy sie timeoutem `webServer` mimo
 * dzialajacego serwera.
 */
export const BASE_URL = process.env.E2E_BASE_URL ?? fileEnv.E2E_BASE_URL ?? "http://localhost:4321";
