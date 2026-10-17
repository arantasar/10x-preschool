import {
  FAIR_USE_DAYS_PER_MONTH,
  FAIR_USE_MODE,
  FAIR_USE_REFINES_PER_MONTH,
  FAIR_USE_REFUNDS_PER_MONTH,
} from "astro:env/server";

import type { DayPlanClient } from "./day-plan-store";

/**
 * The monthly fair-use limit (S-21, prd-v3 FR-027, FR-038): the one place in
 * application code that talks to `public.generation_ledger`.
 *
 * Every route that calls a model claims a ledger row before the call and
 * finishes it after. The counting and the refusal live in the database
 * (`claim_generation`, migration 20261017150000), under a per-account lock, so
 * the week board's five parallel days cannot slip past the limit together.
 *
 * **Fail-open is this module's contract, not a convenience.** Guardrail 1: a
 * broken ledger must never stop a teacher from generating. Any failure - an RPC
 * error, a missing function after a merge without `db push`, an exception, an
 * unreadable answer, a bad configuration value - becomes "allowed, without a
 * reservation" plus a log line. The routes therefore carry no error handling of
 * their own for the ledger, and must not grow any.
 */

export type GenerationKind = "day" | "outline" | "refine";

export type GenerationOutcome = "succeeded" | "failed";

/**
 * `ledgerId: null` on an allowed claim means fail-open: there is no row to
 * finish, and {@link finishGeneration} does nothing with it.
 */
export type FairUseClaim = { allowed: true; ledgerId: string | null } | { allowed: false; resetsOn: string };

export type FairUseMode = "enforce" | "observe";

export interface FairUseConfig {
  daysPerMonth: number;
  refinesPerMonth: number;
  refundsPerMonth: number;
  mode: FairUseMode;
}

export const FAIR_USE_DEFAULTS: FairUseConfig = {
  daysPerMonth: 150,
  refinesPerMonth: 300,
  refundsPerMonth: 30,
  mode: "enforce",
};

// The ceiling of postgres `int`: a larger value would make the rpc fail on every
// call, which fail-open would then hide as a silent limit.
const MAX_LIMIT = 2_147_483_647;

// Same shape as `day-plan-http.ts`: `wrangler.jsonc` sets
// `observability.enabled`, so console output is the log.
function logEvent(message: string, fields: Record<string, unknown>): void {
  /* eslint-disable-next-line no-console */
  console.error(message, fields);
}

function parseLimit(variable: string, raw: string | undefined, fallback: number): number {
  const value = raw?.trim() ?? "";
  if (value === "") {
    return fallback;
  }
  if (/^\d+$/.test(value)) {
    const parsed = Number(value);
    if (parsed >= 1 && parsed <= MAX_LIMIT) {
      return parsed;
    }
  }
  logEvent("fair_use.config_invalid", { variable });
  return fallback;
}

function parseMode(raw: string | undefined): FairUseMode {
  const value = raw?.trim() ?? "";
  if (value === "") {
    return FAIR_USE_DEFAULTS.mode;
  }
  if (value === "enforce" || value === "observe") {
    return value;
  }
  logEvent("fair_use.config_invalid", { variable: "FAIR_USE_MODE" });
  return FAIR_USE_DEFAULTS.mode;
}

/**
 * Read on every call, never cached in module state: a Worker isolate does not
 * promise to keep it, and a dashboard change should apply to the next request.
 */
export function readFairUseConfig(): FairUseConfig {
  return {
    daysPerMonth: parseLimit("FAIR_USE_DAYS_PER_MONTH", FAIR_USE_DAYS_PER_MONTH, FAIR_USE_DEFAULTS.daysPerMonth),
    refinesPerMonth: parseLimit(
      "FAIR_USE_REFINES_PER_MONTH",
      FAIR_USE_REFINES_PER_MONTH,
      FAIR_USE_DEFAULTS.refinesPerMonth,
    ),
    refundsPerMonth: parseLimit(
      "FAIR_USE_REFUNDS_PER_MONTH",
      FAIR_USE_REFUNDS_PER_MONTH,
      FAIR_USE_DEFAULTS.refundsPerMonth,
    ),
    mode: parseMode(FAIR_USE_MODE),
  };
}

function errorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return "exception";
}

/**
 * Reserves one generation, or refuses it over the limit.
 *
 * `planDate` is the day the generation is for; the outline has none. It is
 * stored for S-27 and counted by nothing yet.
 *
 * Observe mode passes `p_enforce = false`: the function then reserves a row
 * even over the limit and still reports `allowed = false`. That answer is
 * turned into an allowed claim here, logged as `fair_use.would_limit` - the
 * calibration data the mode exists to collect.
 */
export async function claimGeneration(
  supabase: DayPlanClient,
  kind: GenerationKind,
  planDate?: string,
): Promise<FairUseClaim> {
  try {
    const config = readFairUseConfig();
    const { data, error } = await supabase.rpc("claim_generation", {
      p_kind: kind,
      // Left out for an outline, which has no planned day: the function's
      // `p_plan_date` defaults to null.
      p_plan_date: planDate,
      p_day_limit: config.daysPerMonth,
      p_refine_limit: config.refinesPerMonth,
      p_refund_allowance: config.refundsPerMonth,
      p_enforce: config.mode === "enforce",
    });

    if (error) {
      logEvent("fair_use.claim_failed", { kind, code: errorCode(error) });
      return { allowed: true, ledgerId: null };
    }

    const row = Array.isArray(data) ? (data[0] as Partial<(typeof data)[number]> | undefined) : undefined;
    if (!row || typeof row.allowed !== "boolean") {
      logEvent("fair_use.claim_failed", { kind, code: "empty" });
      return { allowed: true, ledgerId: null };
    }

    const ledgerId = typeof row.ledger_id === "string" ? row.ledger_id : null;

    if (row.allowed) {
      return { allowed: true, ledgerId };
    }

    if (config.mode === "observe") {
      logEvent("fair_use.would_limit", { kind, resets_on: row.resets_on });
      return { allowed: true, ledgerId };
    }

    if (typeof row.resets_on !== "string" || row.resets_on === "") {
      logEvent("fair_use.claim_failed", { kind, code: "no_resets_on" });
      return { allowed: true, ledgerId: null };
    }

    logEvent("fair_use.limit_reached", { kind, resets_on: row.resets_on });
    return { allowed: false, resetsOn: row.resets_on };
  } catch (error) {
    logEvent("fair_use.claim_failed", { kind, code: errorCode(error) });
    return { allowed: true, ledgerId: null };
  }
}

/**
 * Marks a reservation `succeeded` or `failed`. RLS and the transition trigger
 * do the rest. Never throws: a failure here is logged as
 * `fair_use.finish_failed` and the row stays `reserved`, which counts like a
 * success - an error on the side of counting, not of a free generation.
 */
export async function finishGeneration(
  supabase: DayPlanClient,
  ledgerId: string | null,
  outcome: GenerationOutcome,
): Promise<void> {
  if (ledgerId === null) {
    return;
  }
  try {
    const { error } = await supabase.from("generation_ledger").update({ status: outcome }).eq("id", ledgerId);
    if (error) {
      logEvent("fair_use.finish_failed", { outcome, code: errorCode(error) });
    }
  } catch (error) {
    logEvent("fair_use.finish_failed", { outcome, code: errorCode(error) });
  }
}
