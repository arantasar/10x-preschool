import type { ActivityDraft, DayPlanView, DayTheme } from "@/types";

/**
 * The narrowing predicates both islands use on the bodies they fetch.
 *
 * Narrowed rather than asserted: an unexpected body should become a readable
 * message, not a crash inside the island. `DayPlanView` and not
 * `DayPlanWithCurrentActivities` - the brand on the latter says the batch has
 * been checked against its plan's counter, and a predicate here would be
 * claiming a check that never ran. The server did it before serialising.
 *
 * This module lives in `src/lib/` and deliberately imports no zod, for the same
 * reason `day-plan-limits` exists (see `day-plan-contract.ts:3-7`): the island
 * needs these and must not pull zod into the client bundle.
 *
 * They used to exist as two copies, in `WeekPlanBoard.tsx` and
 * `DayPlanEditor.tsx`, and the copies had drifted: only the week board's version
 * checked `current_generation`. The stricter one won, so `DayPlanEditor` now
 * gets a check it did not have before. That is intended, not a side effect: the
 * field is what `expected_generation` is built from, and an editor holding a
 * body without it would send an acceptance attesting to nothing.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * The empty-array check is the point of this predicate, not a detail of it.
 *
 * `[].every(...)` is `true`, so a body carrying a plan and zero activities
 * narrows as a successful generation, and the teacher is shown a planned day
 * with nothing in it. The bound is "non-empty" rather than `ACTIVITY_COUNT` on
 * purpose - three is the prompt contract's number, enforced by zod on the
 * server, and an island is not where it belongs.
 *
 * Scope, stated because it is easy to over-read: this closes the `fetch` paths
 * only. `save_day_plan_generation` closes the source (migration 20260830092600,
 * `U0003`). The SSR path is still open - `WeekPlanBoard`'s `readyCount` counts
 * `day.plan !== null` and `initialDays` sets `status: plan ? "done" : "empty"`,
 * neither of which looks at `activities.length`. A server-rendered empty day
 * would still read as `done`; it is simply no longer producible.
 */
export function isDayPlanBody(body: unknown): body is DayPlanView {
  if (!isRecord(body) || !isRecord(body.plan) || !Array.isArray(body.activities)) {
    return false;
  }
  const plan = body.plan;
  if (typeof plan.id !== "string" || typeof plan.prompt !== "string") {
    return false;
  }
  if (plan.accepted_at !== null && typeof plan.accepted_at !== "string") {
    return false;
  }
  if (typeof plan.current_generation !== "number") {
    return false;
  }
  if (body.activities.length === 0) {
    return false;
  }
  return body.activities.every(
    (item: unknown) =>
      isRecord(item) &&
      typeof item.id === "string" &&
      typeof item.title === "string" &&
      typeof item.description === "string",
  );
}

/**
 * Same empty-array reasoning as {@link isDayPlanBody}: `{"themes": []}` used to
 * be accepted, and the week board then rendered five days with no theme instead
 * of showing the outline as failed.
 */
export function isOutlineBody(body: unknown): body is { themes: DayTheme[] } {
  if (!isRecord(body) || !Array.isArray(body.themes) || body.themes.length === 0) {
    return false;
  }
  return body.themes.every(
    (item: unknown) => isRecord(item) && typeof item.plan_date === "string" && typeof item.theme === "string",
  );
}

/**
 * The deferred-write day route's body: proposals with no row behind them.
 *
 * `DayPlanView`'s predicate cannot be reused and must not be: that one checks
 * `plan.id` and `current_generation`, which is precisely what an unwritten
 * batch does not have. Conflating the two would let the board render a held
 * batch as a saved day, which is the one distinction this whole slice turns on.
 *
 * The empty-array check carries the same weight it does in
 * {@link isDayPlanBody}: `[].every(...)` is `true`, so without it a day holding
 * nothing would count towards "the set is complete" and the week would be
 * written with a batch the database then refuses with `U0003` - after the
 * teacher had paid for every other day.
 */
export function isGeneratedDayBody(
  body: unknown,
): body is { plan_date: string; theme: string | null; activities: ActivityDraft[] } {
  if (!isRecord(body) || typeof body.plan_date !== "string" || !Array.isArray(body.activities)) {
    return false;
  }
  if (body.theme !== null && typeof body.theme !== "string") {
    return false;
  }
  if (body.activities.length === 0) {
    return false;
  }
  return body.activities.every(
    (item: unknown) => isRecord(item) && typeof item.title === "string" && typeof item.description === "string",
  );
}

/**
 * The atomic write's body: the days it committed, read back from the database.
 *
 * Each value is checked with {@link isDayPlanBody} rather than by hand - these
 * are saved plans and must carry everything a saved plan carries, including the
 * `current_generation` that a later "Akceptuj tydzień" builds
 * `expected_generation` from.
 *
 * An empty `plans` object is refused for the same reason the arrays are: the
 * write route is only ever called with at least one day, so nothing coming back
 * means the read-back found none of what was just committed, and rendering that
 * as success would blank the board.
 */
export function isSaveWeekBody(body: unknown): body is { plans: Record<string, DayPlanView> } {
  if (!isRecord(body) || !isRecord(body.plans)) {
    return false;
  }
  const entries = Object.values(body.plans);
  if (entries.length === 0) {
    return false;
  }
  return entries.every((plan) => isDayPlanBody(plan));
}

export function isErrorBody(body: unknown): body is { error: string; retryable: boolean } {
  return isRecord(body) && typeof body.error === "string" && typeof body.retryable === "boolean";
}
