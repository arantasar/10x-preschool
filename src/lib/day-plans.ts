import type { Activity, CurrentActivity, DayPlan, PlanAcceptance } from "@/types";

/**
 * The only constructor for {@link CurrentActivity}. Keeps the activities whose
 * `generation` matches the plan's `current_generation` and discards the rest.
 *
 * `save_day_plan_generation` deletes the superseded batch as it writes the new
 * one, so a plain `where plan_id = …` will usually return exactly the live batch.
 * "Usually" is the reason this function exists: the counter, not the delete, is
 * what defines which rows are current, and a row that does not match it renders
 * as a stale proposal with no error to mark it. The brand on `CurrentActivity` is
 * what stops that reaching a caller — no literal can satisfy it, so the only way
 * to obtain one is to come through here. Reading the whole table stays possible —
 * you just cannot pass the result anywhere that expects the live batch.
 */
export function selectCurrentGeneration(plan: DayPlan, activities: readonly Activity[]): CurrentActivity[] {
  return activities.filter((activity): activity is CurrentActivity => activity.generation === plan.current_generation);
}

/**
 * Splits the two facts `accepted_at` carries in one nullable column, so a
 * consumer branches on a name instead of on a null check.
 */
export function acceptanceOf(plan: DayPlan): PlanAcceptance {
  return plan.accepted_at === null
    ? { status: "draft", acceptedAt: null }
    : { status: "accepted", acceptedAt: plan.accepted_at };
}
