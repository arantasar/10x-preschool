/**
 * The entire user-facing error vocabulary of the three auth flows - sign-in,
 * sign-up (with its e-mail confirmation) and password reset - in one place.
 *
 * `?error=` in the auth redirects carries a **code**, never a sentence. The
 * routes (`src/pages/api/auth/{signin,signup,forgot-password,confirm,update-password}.ts`)
 * choose the code; the pages (`src/pages/auth/{signin,signup,forgot-password,new-password}.astro`)
 * look it up here at render time.
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

import { SUPPORT_EMAIL } from "@/lib/support-contact";

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
 * Also ours, minted by the password-reset flow.
 *
 * `RESET_SESSION_MISSING`: `/auth/new-password` (or its save route) was reached
 * without a session - the link was never opened, or the session has ended.
 * `RESET_LINK_INVALID`: `/auth/confirm` was opened without a `token_hash`, or
 * with a `type` other than `recovery` - a truncated or foreign link, rejected
 * before Supabase is asked anything.
 */
export const RESET_SESSION_MISSING = "reset_session_missing";
export const RESET_LINK_INVALID = "reset_link_invalid";

/**
 * Also ours, minted by the sign-up confirmation (`/auth/confirm` with
 * `type=email`), and shown on `/auth/signin` - never on the forgot-password page,
 * whose wording is about a new password.
 *
 * `SIGNUP_LINK_INVALID`: the activation link arrived without a `token_hash` - a
 * truncated link, rejected before Supabase is asked anything.
 * `SIGNUP_LINK_EXPIRED`: Supabase answered `otp_expired` - the link is too old
 * or was already used. Renamed from the Supabase code because `otp_expired` is
 * worded for the reset.
 */
export const SIGNUP_LINK_INVALID = "signup_link_invalid";
export const SIGNUP_LINK_EXPIRED = "signup_link_expired";

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
 * Codes reachable from `signInWithPassword`, `signUp`, `resetPasswordForEmail`,
 * `verifyOtp` and `updateUser`, plus our synthetic ones. The 86-value `ErrorCode` union is **open** (`ErrorCode | (string & {})`),
 * so annotating this as `Record<ErrorCode, string>` would buy no exhaustiveness
 * check while forcing entries for MFA, SAML and SSO codes these flows can
 * never produce. The fallback is a runtime lookup miss by design.
 *
 * Some entries are shared by several screens (`validation_failed`,
 * `over_request_rate_limit`, `weak_password`), so their wording has to read
 * correctly on each.
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
  // Supabase's built-in sender refuses any address outside the project's team.
  // Only reachable if custom SMTP is ever switched off. Shown by sign-up; the
  // reset request swallows it (see SILENT_RESET_REQUEST_ERRORS below).
  email_address_not_authorized: `Nie możemy teraz wysłać wiadomości na ten adres. Spróbuj ponownie później albo napisz do nas: ${SUPPORT_EMAIL}.`,
  // Re-signing up with an unconfirmed address makes Supabase send a fresh link,
  // so that is the advice for both - there is no separate "resend" screen.
  [SIGNUP_LINK_INVALID]:
    "Ten link aktywacyjny jest niepełny lub nieprawidłowy. Załóż konto ponownie na ten sam adres, a wyślemy nowy.",
  [SIGNUP_LINK_EXPIRED]:
    "Ten link aktywacyjny wygasł albo został już użyty. Jeśli konto nie jest jeszcze aktywne, załóż je ponownie na ten sam adres, a wyślemy nowy.",

  // --- password reset ------------------------------------------------------
  // Supabase answers an expired *and* an already-used link with the same code;
  // the advice is the same either way.
  otp_expired: "Ten link do ustawienia hasła wygasł albo został już użyty. Wyślij sobie nowy poniżej.",
  same_password: "Nowe hasło musi się różnić od dotychczasowego. Wybierz inne.",
  session_not_found: "Sesja ustawiania hasła wygasła. Poproś o nowy link poniżej.",
  // `secure_password_change`: the session is older than 24 h. A fresh link
  // creates a fresh session, which is all the teacher needs.
  reauthentication_needed:
    "Ze względów bezpieczeństwa hasło można zmienić tylko ze świeżego linku. Poproś o nowy poniżej.",
  [RESET_SESSION_MISSING]: "Aby ustawić nowe hasło, otwórz link z wiadomości e-mail albo poproś o nowy poniżej.",
  [RESET_LINK_INVALID]: "Ten link do ustawienia hasła jest niepełny lub nieprawidłowy. Poproś o nowy poniżej.",

  // --- any screen -------------------------------------------------------
  // From the plan's coverage table; kept, but note that local Supabase answers a
  // malformed address with `validation_failed` instead, so this key has no path
  // confirmed against a running instance. Whether it fires depends on the
  // project's address validator and blocklist settings.
  email_address_invalid: "Ten adres e-mail jest nieprawidłowy. Sprawdź, czy nie ma w nim literówki.",
  validation_failed: "Formularz zawiera nieprawidłowe dane. Popraw je i spróbuj ponownie.",
  over_request_rate_limit: "Za dużo prób z rzędu. Odczekaj chwilę i spróbuj ponownie.",
  captcha_failed: "Nie udało się potwierdzić, że to Ty, a nie robot. Odśwież stronę i spróbuj ponownie.",

  // --- ours ----------------------------------------------------------------
  [CONFIG_MISSING]:
    "Usługa jest chwilowo niedostępna — brakuje konfiguracji serwera. Zgłoś to administratorowi przedszkola.",
  [CONNECTION_FAILED]:
    "Nie udało się połączyć z serwerem. Sprawdź połączenie z internetem i spróbuj ponownie za chwilę.",
};

/**
 * Codes from `resetPasswordForEmail` that only an address **with** an account
 * can produce - the per-address send cooldown, a not-found code should a
 * Supabase version ever emit one, and the built-in sender's refusal of a
 * non-team address (Supabase only tries to send for an existing user, so the
 * refusal itself says "this account exists"). Showing them would tell a
 * stranger which addresses are registered, so the request route treats them as
 * success.
 */
const SILENT_RESET_REQUEST_ERRORS = new Set([
  "over_email_send_rate_limit",
  "user_not_found",
  "email_address_not_authorized",
]);

export function isSilentResetRequestError(code: string | undefined): boolean {
  return code !== undefined && SILENT_RESET_REQUEST_ERRORS.has(code);
}

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
