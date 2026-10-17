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
 * `updateActivityText`, `from("day_plans").update().eq().eq().select().maybeSingle()`
 * for `setAcceptance`, `from("day_plans").delete().eq().select().maybeSingle()`
 * for `deleteDayPlan`, and `rpc()`. Nothing more.
 *
 * The fair-use ledger (`fair-use.ts`) is answered on its own spies: `rpc` is
 * dispatched by function name, so `claim_generation` lands on `claim` and
 * `save_day_plan_generation` stays on `rpc`; `from("generation_ledger")` lands
 * on `ledgerUpdate` and never on `from`. That keeps every existing assertion -
 * "rpc called once", "from never called" - a claim about the plan tables, as
 * it was written, while the ledger gets assertions of its own.
 *
 * What it cannot do is prove ownership. The routes never filter on `user_id` -
 * RLS does, behind the session in the client - so a stub "of another account"
 * returns whatever it was told to. Route tests here pin how a route *answers*
 * an empty result; that the empty result is what another account actually gets
 * is the `*.db.test.ts` tier's claim (test plan §6.3). A deeper imitation would
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
  /** Makes the `.in("plan_date", …)` read fail, as `readWeekPlans`' first query. */
  weekPlansError?: StubPostgrestError;
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
  /**
   * The row `setAcceptance`'s conditional `day_plans` update hands back. `null`
   * means it matched nothing - and then the store's follow-up read answers from
   * `existingPlan`, because nothing was written: a plan there means "it moved on"
   * (409), `null` means "not visible" (404).
   */
  updatedPlan?: { id: string } | null;
  /** Makes that update fail instead. */
  updatedPlanError?: StubPostgrestError;
  /** The row `deleteDayPlan`'s `delete()` hands back. `null` means it matched nothing. */
  deletedPlan?: { id: string } | null;
  /** Makes that delete fail instead. */
  deleteError?: StubPostgrestError;
  /**
   * What `claim_generation` answers. Allowed with {@link STUB_LEDGER_ID} by
   * default, so a route test that does not care about the limit never meets it.
   */
  claim?: StubClaim;
}

export const STUB_LEDGER_ID = "44444444-4444-4444-8444-444444444444";

export type StubClaim =
  | { outcome: "allowed"; ledgerId?: string }
  | { outcome: "refused"; resetsOn: string }
  | { outcome: "error"; error: StubPostgrestError };

export interface SupabaseStub {
  client: DayPlanClient;
  /** Every `rpc()` call other than `claim_generation`, in order. Assertions run on this. */
  rpc: ReturnType<typeof vi.fn>;
  /** Every `claim_generation` call, with its arguments. */
  claim: ReturnType<typeof vi.fn>;
  /**
   * Every `from("generation_ledger").update(values)` call, and the `.eq` it was
   * addressed by - how a route marked its reservation.
   */
  ledgerUpdate: ReturnType<typeof vi.fn>;
  ledgerUpdateEq: ReturnType<typeof vi.fn>;
  /**
   * Every `from("activities").update(…)` call. "The route did not write" is a
   * claim about this spy, not about the response body.
   */
  update: ReturnType<typeof vi.fn>;
  /** Every `from(…)` call, so a test can assert a route never reached the database. */
  from: ReturnType<typeof vi.fn>;
  /** Every `from("day_plans").select().in(column, values)` call - which days a range read asked for. */
  dayPlansIn: ReturnType<typeof vi.fn>;
  /** Every `from("day_plans").update(values)` call - what an acceptance change wrote. */
  dayPlansUpdate: ReturnType<typeof vi.fn>;
  /** Every `from("day_plans").delete()` call. "Not retried" is a claim about this count. */
  delete: ReturnType<typeof vi.fn>;
  /** Every `.eq(column, value)` hung off `delete()` - which day a delete addressed. */
  deleteEq: ReturnType<typeof vi.fn>;
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
    weekPlansError,
    activityBeforeEdit = null,
    updatedActivity = null,
    updatedPlan = null,
    updatedPlanError,
    deletedPlan = null,
    deleteError,
    claim: claimAnswer = { outcome: "allowed" },
  } = options;

  const claim = vi.fn((_name: string, _args: Record<string, unknown>) => {
    switch (claimAnswer.outcome) {
      case "allowed":
        return Promise.resolve({
          data: [{ ledger_id: claimAnswer.ledgerId ?? STUB_LEDGER_ID, allowed: true, resets_on: "2026-11-01" }],
          error: null,
        });
      case "refused":
        return Promise.resolve({
          data: [{ ledger_id: null, allowed: false, resets_on: claimAnswer.resetsOn }],
          error: null,
        });
      case "error":
        return Promise.resolve({ data: null, error: claimAnswer.error });
    }
  });

  const ledgerUpdateEq = vi.fn((_column: string, _value: string) => Promise.resolve({ data: null, error: null }));
  const ledgerUpdate = vi.fn((_values: Record<string, unknown>) => ({ eq: ledgerUpdateEq }));

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
  //
  // An acceptance change counts only when its update landed on a row. An update
  // that matched nothing wrote nothing, so the read `setAcceptance` follows it
  // with must still see the day as it was - `existingPlan`.
  let planUpdateLanded = false;
  const wrote = () => rpc.mock.calls.length + update.mock.calls.length > 0 || planUpdateLanded;
  const dayPlanResult = () => ({
    data: wrote() ? savedPlan : existingPlan,
    error: null,
  });

  const dayPlansIn = vi.fn((_column: string, _values: readonly string[]) =>
    Promise.resolve(weekPlansError ? { data: null, error: weekPlansError } : { data: weekPlans, error: null }),
  );

  const dayPlansUpdate = vi.fn((_values: Record<string, unknown>) => {
    const answer = () => {
      if (updatedPlanError) {
        return Promise.resolve({ data: null, error: updatedPlanError });
      }
      planUpdateLanded = updatedPlan !== null;
      return Promise.resolve({ data: updatedPlan, error: null });
    };
    return {
      eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: answer }) }) }),
    };
  });

  const deleteEq = vi.fn((_column: string, _value: string) => ({
    select: () => ({
      maybeSingle: () =>
        Promise.resolve(deleteError ? { data: null, error: deleteError } : { data: deletedPlan, error: null }),
    }),
  }));
  const deleteSpy = vi.fn(() => ({ eq: deleteEq }));

  const from = vi.fn((table: string) =>
    table === "day_plans"
      ? {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve(dayPlanResult()) }),
            in: dayPlansIn,
          }),
          update: dayPlansUpdate,
          delete: deleteSpy,
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

  const client = {
    rpc: (name: string, args: Record<string, unknown>) =>
      name === "claim_generation" ? claim(name, args) : (rpc as (...a: unknown[]) => unknown)(name, args),
    from: (table: string) => (table === "generation_ledger" ? { update: ledgerUpdate } : from(table)),
  };

  return {
    client: client as unknown as DayPlanClient,
    rpc,
    claim,
    ledgerUpdate,
    ledgerUpdateEq,
    update,
    from,
    dayPlansIn,
    dayPlansUpdate,
    delete: deleteSpy,
    deleteEq,
  };
}
