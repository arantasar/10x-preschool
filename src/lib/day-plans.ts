import type { Activity, CurrentActivity, DayPlan, PlanAcceptance } from "@/types";

/**
 * The only constructor for {@link CurrentActivity}. Keeps the activities whose
 * `generation` matches the plan's `current_generation` and discards the rest.
 *
 * A regenerated plan leaves the previous batch resident in `activities`, so a
 * plain `where plan_id = …` returns both batches and shows stale proposals with
 * no error. The brand on `CurrentActivity` is what stops that: no literal can
 * satisfy it, so the only way to obtain one is to come through here. Reading
 * the whole table stays possible — you just cannot pass the result anywhere
 * that expects the live batch.
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
