import { vi } from "vitest";

import type { Database } from "@/db/database.types";
import type { DayPlanClient } from "@/lib/services/day-plan-store";

/**
 * A Supabase client stand-in, injected through `context.locals`.
 *
 * `day-plan-store.ts` takes its client as the first argument and never as a
 * module singleton, so `locals` is the injection point the project's own
 * convention already provides — no production code changes to make the routes
 * testable.
 *
 * It reproduces PostgREST exactly as deep as the functions actually called need
 * it: `from("day_plans").select().eq().maybeSingle()`,
 * `from("activities").select().eq().order()`, and `rpc()`. Nothing more. A
 * deeper imitation would start being a second implementation of PostgREST, and a
 * test that passes against it would stop meaning anything about the real one.
 */

export type DayPlanRow = Database["public"]["Tables"]["day_plans"]["Row"];
export type ActivityRow = Database["public"]["Tables"]["activities"]["Row"];

/** A PostgREST error as `day-plan-store.ts` narrows it. */
export interface StubPostgrestError {
  code: string;
  message: string;
  details: string;
  hint: string;
  name?: string;
}

export interface SupabaseStubOptions {
  /** What `readDayPlan` finds before the write. `null` means "this day has no plan yet". */
  existingPlan?: DayPlanRow | null;
  /** What `readDayPlan` finds after a successful write. */
  savedPlan?: DayPlanRow | null;
  /** The batch belonging to `savedPlan`. */
  savedActivities?: ActivityRow[];
  /** Makes `rpc` answer with a refusal instead of a plan id. */
  rpcError?: StubPostgrestError;
}

export interface SupabaseStub {
  client: DayPlanClient;
  /** Every `save_day_plan_generation` call, in order. Assertions run on this. */
  rpc: ReturnType<typeof vi.fn>;
}

export function planRow(overrides: Partial<DayPlanRow> = {}): DayPlanRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    user_id: "22222222-2222-4222-8222-222222222222",
    plan_date: "2026-09-14",
    prompt: "jesień w lesie",
    theme: null,
    accepted_at: null,
    current_generation: 1,
    created_at: "2026-09-14T08:00:00.000Z",
    updated_at: "2026-09-14T08:00:00.000Z",
    ...overrides,
  };
}

export function activityRow(ordinal: number, plan: DayPlanRow): ActivityRow {
  return {
    id: `33333333-3333-4333-8333-00000000000${String(ordinal)}`,
    user_id: plan.user_id,
    plan_id: plan.id,
    generation: plan.current_generation,
    ordinal,
    title: `Aktywność ${String(ordinal)}`,
    description: `Opis aktywności ${String(ordinal)}`,
    created_at: plan.created_at,
  };
}

export function supabaseStub(options: SupabaseStubOptions = {}): SupabaseStub {
  const { existingPlan = null, savedPlan = null, savedActivities = [], rpcError } = options;

  const rpc = vi.fn(() =>
    Promise.resolve(
      rpcError
        ? { data: null, error: rpcError }
        : { data: savedPlan?.id ?? "11111111-1111-4111-8111-111111111111", error: null },
    ),
  );

  // The same date is read twice on the happy path — once as the pre-check before
  // the model is called, once to build the response — and the two must not
  // answer alike, or the test could not tell a write that happened from one that
  // did not.
  const dayPlanResult = () => ({
    data: rpc.mock.calls.length === 0 ? existingPlan : savedPlan,
    error: null,
  });

  const client = {
    rpc,
    from: (table: string) => ({
      select: () =>
        table === "day_plans"
          ? { eq: () => ({ maybeSingle: () => Promise.resolve(dayPlanResult()) }) }
          : { eq: () => ({ order: () => Promise.resolve({ data: savedActivities, error: null }) }) },
    }),
  };

  return { client: client as unknown as DayPlanClient, rpc };
}
