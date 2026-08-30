import type { DayPlanView } from "@/types";

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
 * `[].every(...)` is `true`, so a body carrying a plan and zero activities used
 * to narrow as a successful generation: the week board marked the day `done`,
 * `readyCount` counted it as ready, and the teacher was shown a planned day with
 * nothing in it. The bound is "non-empty" rather than `ACTIVITY_COUNT` on
 * purpose - three is the prompt contract's number, enforced by zod on the
 * server, and an island is not where it belongs.
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
export function isOutlineBody(body: unknown): body is { themes: { plan_date: string; theme: string }[] } {
  if (!isRecord(body) || !Array.isArray(body.themes) || body.themes.length === 0) {
    return false;
  }
  return body.themes.every(
    (item: unknown) => isRecord(item) && typeof item.plan_date === "string" && typeof item.theme === "string",
  );
}

export function isErrorBody(body: unknown): body is { error: string; retryable: boolean } {
  return isRecord(body) && typeof body.error === "string" && typeof body.retryable === "boolean";
}
