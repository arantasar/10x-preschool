import type { DayPlanClient } from "@/lib/services/day-plan-store";
import type { AccountEntitlement } from "@/types";

/**
 * The account's plan state as `/ustawienia` shows it (S-23).
 *
 * Two halves, kept apart on purpose: {@link accessCard} decides what the card
 * says and is a pure function of the row and today; {@link readAccountEntitlement}
 * only fetches, and turns every failure into "no row". The page therefore has no
 * error handling of its own - a broken read hides the card, it never breaks the
 * settings page.
 *
 * What the card may say is narrow. Payments do not exist yet and the Regulamin
 * says Temio is free, so the card names a date of full access and that every
 * feature is free today - never a plan name, a trial or a price. Those words
 * arrive with S-22/S-25, when they become true.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Same shape as `fair-use.ts`: `wrangler.jsonc` sets `observability.enabled`,
// so console output is the log.
function logEvent(message: string, fields: Record<string, unknown>): void {
  /* eslint-disable-next-line no-console */
  console.error(message, fields);
}

function errorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return "exception";
}

/**
 * The access card, or `null` when there is nothing true to show: no row (an
 * account from before payments) or a date already past. `accessUntil` is
 * inclusive, so the card is still there on its last day.
 */
export function accessCard(entitlement: AccountEntitlement | null, today: string): { untilLabel: string } | null {
  if (!entitlement || entitlement.accessUntil < today) {
    return null;
  }
  const untilLabel = new Intl.DateTimeFormat("pl-PL", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${entitlement.accessUntil}T00:00:00Z`));
  return { untilLabel };
}

/**
 * The signed-in teacher's own row, through her client - rls returns hers and
 * no one else's. Never throws: an error, an exception or a row of an
 * unexpected shape is `null` plus `account_entitlement.read_failed`.
 */
export async function readAccountEntitlement(supabase: DayPlanClient): Promise<AccountEntitlement | null> {
  try {
    const { data, error } = await supabase
      .from("account_entitlements")
      .select("plan, access_until, source")
      .maybeSingle();

    if (error) {
      logEvent("account_entitlement.read_failed", { code: errorCode(error) });
      return null;
    }
    if (data === null) {
      return null;
    }

    const { plan, access_until: accessUntil, source } = data;
    if (plan !== "basic" || (source !== "trial" && source !== "owner") || !ISO_DATE.test(accessUntil)) {
      logEvent("account_entitlement.read_failed", { code: "unexpected_shape" });
      return null;
    }
    return { plan, accessUntil, source };
  } catch (error) {
    logEvent("account_entitlement.read_failed", { code: errorCode(error) });
    return null;
  }
}
