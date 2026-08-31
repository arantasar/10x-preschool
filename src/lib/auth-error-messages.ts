/**
 * The entire user-facing error vocabulary of the two auth flows, in one place.
 *
 * `?error=` in the auth redirects carries a **code**, never a sentence. The
 * routes (`src/pages/api/auth/{signin,signup}.ts`) choose the code; the pages
 * (`src/pages/auth/{signin,signup}.astro`) look it up here at render time.
 *
 * Two things follow from that split, and both are the point of this module:
 *
 * 1. A teacher never reads English. Supabase's own `error.message` stops at the
 *    route, where it goes to the server log instead of into the URL.
 * 2. `?error=<any sentence>` cannot render as our own message. An unknown key
 *    misses the lookup and falls back, so a hand-crafted link cannot put
 *    attacker-chosen text inside the error box styled as ours. That is an
 *    invariant of the lookup, not a sanitisation step someone has to remember.
 */

/**
 * Ours, not Supabase's — do not look for these two in `ErrorCode`.
 *
 * `CONFIG_MISSING` is minted when `createClient` returns `null` (no
 * `SUPABASE_URL` / `SUPABASE_KEY`), so nothing was ever asked of Supabase.
 * `CONNECTION_FAILED` is minted when an `AuthError` arrives with no `code`,
 * which per the SDK's own declaration means the failure happened before any
 * response was received (`@supabase/auth-js` `lib/errors.d.ts`).
 */
export const CONFIG_MISSING = "config_missing";
export const CONNECTION_FAILED = "connection_failed";

/**
 * Shown for anything the map does not know: an unmapped Supabase code, a code
 * from a flow we deliberately did not cover (MFA, SSO, OAuth), or a value
 * someone put in the URL by hand.
 *
 * Deliberately distinct from {@link CONNECTION_FAILED}'s wording — "we could
 * not reach the server" and "something went wrong" are different pieces of
 * advice, and collapsing them is what the two-message decision ruled out.
 */
export const GENERIC_AUTH_ERROR_MESSAGE =
  "Coś poszło nie tak. Spróbuj ponownie za chwilę, a jeśli problem się powtórzy — zgłoś go administratorowi przedszkola.";

/**
 * Codes reachable from `signInWithPassword` and `signUp`, plus our two synthetic
 * ones. The 86-value `ErrorCode` union is **open** (`ErrorCode | (string & {})`),
 * so annotating this as `Record<ErrorCode, string>` would buy no exhaustiveness
 * check while forcing entries for MFA, SAML and SSO codes these two flows can
 * never produce. The fallback is a runtime lookup miss by design.
 *
 * Some entries are shared by both screens (`validation_failed`,
 * `over_request_rate_limit`), so their wording has to read correctly on either.
 */
export const AUTH_ERROR_MESSAGES: Record<string, string> = {
  // --- sign-in -------------------------------------------------------------
  // Says nothing about whether the address is registered: telling a stranger
  // "that account exists, wrong hasło" is an account-enumeration oracle.
  invalid_credentials: "Nieprawidłowy adres e-mail lub hasło. Sprawdź dane i spróbuj ponownie.",
  email_not_confirmed:
    "To konto nie zostało jeszcze potwierdzone. Otwórz link aktywacyjny z wiadomości, którą do Ciebie wysłaliśmy.",
  user_banned: "To konto zostało zablokowane. Skontaktuj się z administratorem przedszkola.",

  // --- sign-up -------------------------------------------------------------
  weak_password: "Hasło jest za słabe. Wybierz dłuższe i połącz w nim litery, cyfry oraz znaki specjalne.",
  // Two codes, one meaning: different Supabase versions word the same refusal
  // differently, and the teacher's next move is identical in both cases.
  email_exists: "Konto z tym adresem już istnieje. Przejdź do logowania.",
  user_already_exists: "Konto z tym adresem już istnieje. Przejdź do logowania.",
  signup_disabled: "Zakładanie nowych kont jest teraz wyłączone. Skontaktuj się z administratorem przedszkola.",
  email_provider_disabled:
    "Logowanie adresem e-mail i hasłem jest teraz wyłączone. Skontaktuj się z administratorem przedszkola.",
  over_email_send_rate_limit:
    "Wysłaliśmy już zbyt wiele wiadomości na ten adres. Odczekaj kilka minut i spróbuj ponownie.",

  // --- either screen -------------------------------------------------------
  // From the plan's coverage table; kept, but note that local Supabase answers a
  // malformed address with `validation_failed` instead, so this key has no path
  // confirmed against a running instance. Whether it fires depends on the
  // project's address validator and blocklist settings.
  email_address_invalid: "Ten adres e-mail jest nieprawidłowy. Sprawdź, czy nie ma w nim literówki.",
  validation_failed: "Formularz zawiera nieprawidłowe dane. Sprawdź adres e-mail i hasło, a potem spróbuj ponownie.",
  over_request_rate_limit: "Za dużo prób z rzędu. Odczekaj chwilę i spróbuj ponownie.",
  captcha_failed: "Nie udało się potwierdzić, że to Ty, a nie robot. Odśwież stronę i spróbuj ponownie.",

  // --- ours ----------------------------------------------------------------
  [CONFIG_MISSING]:
    "Usługa jest chwilowo niedostępna — brakuje konfiguracji serwera. Zgłoś to administratorowi przedszkola.",
  [CONNECTION_FAILED]:
    "Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie za chwilę.",
};

/**
 * Resolve a `?error=` code to Polish text. Never returns `undefined`, never
 * returns English, never returns its own input.
 *
 * `null` is accepted because `searchParams.get()` returns it — but note that the
 * pages must skip the call entirely when the parameter is absent, since
 * `ServerError` hides itself only on a falsy message and this function is
 * contractually non-empty.
 *
 * The lookup goes through `Object.hasOwn` rather than a bare index read so that
 * `?error=constructor` (and friends) miss like any other unknown key instead of
 * reaching up the prototype chain.
 */
export function authErrorMessage(code: string | null | undefined): string {
  if (!code) return GENERIC_AUTH_ERROR_MESSAGE;
  return Object.hasOwn(AUTH_ERROR_MESSAGES, code) ? AUTH_ERROR_MESSAGES[code] : GENERIC_AUTH_ERROR_MESSAGE;
}
