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
 * `from("activities").select().eq().order()`, `.in(…)` on both for
 * `readWeekPlans`, `from("activities").select().eq().maybeSingle()` and
 * `from("activities").update().eq().select().maybeSingle()` for
 * `updateActivityText`, and `rpc()`. Nothing more. A deeper imitation would
 * start being a second implementation of PostgREST, and a test that passes
 * against it would stop meaning anything about the real one.
 *
 * In particular it does not parse select strings, so it cannot tell you whether
 * the foreign-key hint in `updateActivityText`'s embed is spelled right. That
 * claim belongs to `npm run build` and to the database, not here.
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
  /**
   * What `readWeekPlans` finds — the `.in("plan_date", …)` read the week write
   * route ends with. Separate from `savedPlan`/`savedActivities`, which serve
   * the single-day `.eq().maybeSingle()` path: a stub that answered both from
   * one field could not express "the write landed on three days".
   */
  weekPlans?: DayPlanRow[];
  weekActivities?: ActivityRow[];
  /**
   * What `updateActivityText`'s pre-write read finds on `activities`.
   *
   * The embedded `day_plans` is the acceptance state *before* the edit, which
   * is the one fact the route cannot recover afterwards. `null` expresses the
   * third state: the proposal is not visible under RLS, so the route must
   * refuse before writing anything.
   */
  activityBeforeEdit?: { plan_id: string; day_plans: { accepted_at: string | null } } | null;
  /** The row `update()` hands back. `null` means the update matched nothing. */
  updatedActivity?: { plan_id: string } | null;
}

export interface SupabaseStub {
  client: DayPlanClient;
  /** Every `save_day_plan_generation` call, in order. Assertions run on this. */
  rpc: ReturnType<typeof vi.fn>;
  /**
   * Every `from("activities").update(…)` call. "The route did not write" is a
   * claim about this spy, not about the response body.
   */
  update: ReturnType<typeof vi.fn>;
  /** Every `from(…)` call, so a test can assert a route never reached the database. */
  from: ReturnType<typeof vi.fn>;
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
  const {
    existingPlan = null,
    savedPlan = null,
    savedActivities = [],
    rpcError,
    weekPlans = [],
    weekActivities = [],
    activityBeforeEdit = null,
    updatedActivity = null,
  } = options;

  const rpc = vi.fn(() =>
    Promise.resolve(
      rpcError
        ? { data: null, error: rpcError }
        : { data: savedPlan?.id ?? "11111111-1111-4111-8111-111111111111", error: null },
    ),
  );

  const update = vi.fn(() => ({
    eq: () => ({
      select: () => ({ maybeSingle: () => Promise.resolve({ data: updatedActivity, error: null }) }),
    }),
  }));

  // The same day is read twice on the happy path — once before the write, once
  // to build the response — and the two must not answer alike, or the test could
  // not tell a write that happened from one that did not. Counting `update`
  // alongside `rpc` is what extends that to the edit route; the generation tests
  // never call `update`, so their behaviour is unchanged.
  const wrote = () => rpc.mock.calls.length + update.mock.calls.length > 0;
  const dayPlanResult = () => ({
    data: wrote() ? savedPlan : existingPlan,
    error: null,
  });

  const from = vi.fn((table: string) =>
    table === "day_plans"
      ? {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve(dayPlanResult()) }),
            in: () => Promise.resolve({ data: weekPlans, error: null }),
          }),
        }
      : {
          update,
          select: () => ({
            // `order` serves `readCurrentActivities`, `maybeSingle` the
            // pre-write acceptance read. Both hang off the same `eq` because
            // PostgREST's builder does too; each answers from its own option.
            eq: () => ({
              order: () => Promise.resolve({ data: savedActivities, error: null }),
              maybeSingle: () => Promise.resolve({ data: activityBeforeEdit, error: null }),
            }),
            in: () => ({ order: () => Promise.resolve({ data: weekActivities, error: null }) }),
          }),
        },
  );

  const client = { rpc, from };

  return { client: client as unknown as DayPlanClient, rpc, update, from };
}
