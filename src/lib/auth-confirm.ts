import { RESET_LINK_INVALID, SIGNUP_LINK_INVALID } from "@/lib/auth-error-messages";

/**
 * Where `/auth/confirm` (the GET page) and `/api/auth/confirm` (its POST) send a
 * link they reject before asking Supabase anything - a missing `token_hash` or a
 * `type` we do not handle. One rule for both, so the page and the route cannot
 * drift apart.
 *
 * An activation link (`type=email`) goes to sign-in with its own code; anything
 * else keeps the reset flow's answer, because a foreign or truncated type is
 * most likely a mangled recovery link.
 */
export function invalidConfirmRedirect(type: unknown): string {
  return type === "email"
    ? `/auth/signin?error=${SIGNUP_LINK_INVALID}`
    : `/auth/forgot-password?error=${RESET_LINK_INVALID}`;
}
