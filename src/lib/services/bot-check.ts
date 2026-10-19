/**
 * The server-side half of Cloudflare Turnstile: is the token a browser handed
 * us one a human earned? Knows nothing about any form - every public surface
 * that takes data from people without an account calls this with its own
 * `action` (today only the contact form: `"contact"`). PRD v3 §Warunki
 * jakościowe: bot messages never reach the owner.
 *
 * Never throws. A network failure or a timeout is `unavailable`, which the
 * caller turns into "try again" - fail closed, because a check that cannot run
 * is not a pass.
 */

export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const TIMEOUT_MS = 5000;

/** `testingKey`: Turnstile answered for a test secret - fine locally, a misconfiguration in production. */
export type BotCheckResult =
  | { ok: true; testingKey: boolean }
  | { ok: false; reason: "missing" | "rejected" | "unavailable" };

export interface BotCheckOptions {
  secret: string;
  /** The widget's `action`; a token earned on another surface is rejected. */
  action: string;
  /** `CF-Connecting-IP`, when the request has one. */
  remoteIp?: string | null;
  /**
   * The host the token must have been earned on - the page that posts to the
   * route, so a token from a preview or `localhost` widget is refused on
   * production. Not checked for testing-key results, which report a fixed
   * placeholder host.
   */
  hostname?: string | null;
  fetchImpl?: typeof fetch;
}

interface SiteverifyResponse {
  success?: boolean;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
  metadata?: { result_with_testing_key?: boolean };
}

export async function verifyHumanToken(
  token: string | null | undefined,
  { secret, action, remoteIp, hostname, fetchImpl = fetch }: BotCheckOptions,
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

  // Turnstile's test keys (local dev, e2e) answer without an `action` and with a
  // placeholder `hostname`, and say so in `metadata`. Only then may the two be
  // off; a real key always echoes both.
  const testingKey = result.metadata?.result_with_testing_key === true;
  const actionOk = result.action === action || (testingKey && result.action === undefined);
  const hostnameOk = !hostname || testingKey || result.hostname === hostname;
  if (result.success !== true || !actionOk || !hostnameOk) {
    /* eslint-disable-next-line no-console */
    console.error("bot_check.rejected", {
      action,
      got: result.action,
      hostname: result.hostname,
      codes: result["error-codes"],
    });
    return { ok: false, reason: "rejected" };
  }
  return { ok: true, testingKey };
}
