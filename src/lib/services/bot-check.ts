/**
 * The server-side half of Cloudflare Turnstile: is the token a browser handed
 * us one a human earned? Knows nothing about any form - every public surface
 * that takes data from people without an account calls this with its own
 * `action` (the contact form: `"contact"`; the founding-price sign-up in S-22
 * will pass its own). PRD v3 §Warunki jakościowe: bot messages never reach the
 * owner, on either surface.
 *
 * Never throws. A network failure or a timeout is `unavailable`, which the
 * caller turns into "try again" - fail closed, because a check that cannot run
 * is not a pass.
 */

export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const TIMEOUT_MS = 5000;

export type BotCheckResult = { ok: true } | { ok: false; reason: "missing" | "rejected" | "unavailable" };

export interface BotCheckOptions {
  secret: string;
  /** The widget's `action`; a token earned on another surface is rejected. */
  action: string;
  /** `CF-Connecting-IP`, when the request has one. */
  remoteIp?: string | null;
  fetchImpl?: typeof fetch;
}

interface SiteverifyResponse {
  success?: boolean;
  action?: string;
  "error-codes"?: string[];
  metadata?: { result_with_testing_key?: boolean };
}

export async function verifyHumanToken(
  token: string | null | undefined,
  { secret, action, remoteIp, fetchImpl = fetch }: BotCheckOptions,
): Promise<BotCheckResult> {
  if (!token) {
    return { ok: false, reason: "missing" };
  }

  const body = new FormData();
  body.set("secret", secret);
  body.set("response", token);
  if (remoteIp) body.set("remoteip", remoteIp);

  let result: SiteverifyResponse;
  try {
    const response = await fetchImpl(SITEVERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      /* eslint-disable-next-line no-console */
      console.error("bot_check.unavailable", { status: response.status });
      return { ok: false, reason: "unavailable" };
    }
    result = (await response.json()) as SiteverifyResponse;
  } catch (error) {
    /* eslint-disable-next-line no-console */
    console.error("bot_check.unavailable", { error: error instanceof Error ? error.name : String(error) });
    return { ok: false, reason: "unavailable" };
  }

  // Turnstile's test keys (local dev, e2e) answer without an `action`, and say
  // so in `metadata`. Only then may it be absent; a real key always echoes it.
  const testingKeyWithoutAction = result.metadata?.result_with_testing_key === true && result.action === undefined;
  if (result.success !== true || (result.action !== action && !testingKeyWithoutAction)) {
    /* eslint-disable-next-line no-console */
    console.error("bot_check.rejected", { action, got: result.action, codes: result["error-codes"] });
    return { ok: false, reason: "rejected" };
  }
  return { ok: true };
}
