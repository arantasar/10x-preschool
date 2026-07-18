import type { Database } from "@/db/database.types";

type Tables = Database["public"]["Tables"];

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------
// Derived from the generated schema rather than restated, so a migration that
// changes a column breaks compilation here before it reaches a call site.

/** One teacher's plan for one day: the hasło it grew from, and its accepted state. */
export type DayPlan = Tables["day_plans"]["Row"];

/** A single generated proposal belonging to a day plan's generation batch. */
export type Activity = Tables["activities"]["Row"];

export type DayPlanInsert = Tables["day_plans"]["Insert"];
export type ActivityInsert = Tables["activities"]["Insert"];

// ---------------------------------------------------------------------------
// The current-generation invariant
// ---------------------------------------------------------------------------
// A regenerated plan leaves the previous batch resident in `activities`, so a
// plain `where plan_id = …` returns both batches and shows stale proposals with
// no error. Rather than documenting that and hoping, `CurrentActivity` is a
// branded type that no literal can satisfy: the only way to obtain one is
// `selectCurrentGeneration`, which does the comparison against the plan's own
// counter. Reading the whole table stays possible — you just cannot pass the
// result anywhere that expects the current batch.

declare const currentGenerationBrand: unique symbol;

/** An {@link Activity} proven to belong to its plan's live generation. */
export type CurrentActivity = Activity & { readonly [currentGenerationBrand]: true };

/**
 * The only constructor for {@link CurrentActivity}. Keeps the activities whose
 * `generation` matches the plan's `current_generation` and discards the rest.
 */
export function selectCurrentGeneration(plan: DayPlan, activities: readonly Activity[]): CurrentActivity[] {
  return activities.filter((activity): activity is CurrentActivity => activity.generation === plan.current_generation);
}

// ---------------------------------------------------------------------------
// Read models
// ---------------------------------------------------------------------------

/** What a teacher sees for a given day: the plan, and only its live proposals. */
export interface DayPlanWithCurrentActivities {
  readonly plan: DayPlan;
  readonly activities: readonly CurrentActivity[];
}

// ---------------------------------------------------------------------------
// Acceptance
// ---------------------------------------------------------------------------

/**
 * `accepted_at` carries two facts in one nullable column. This splits them so a
 * consumer branches on a name instead of on a null check.
 */
export type PlanAcceptance =
  | { readonly status: "draft"; readonly acceptedAt: null }
  | { readonly status: "accepted"; readonly acceptedAt: string };

export function acceptanceOf(plan: DayPlan): PlanAcceptance {
  return plan.accepted_at === null
    ? { status: "draft", acceptedAt: null }
    : { status: "accepted", acceptedAt: plan.accepted_at };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * One proposal as generated, before it belongs to a plan. Ownership, batch and
 * ordering are the persistence layer's to assign — a caller that could set
 * `user_id` or `generation` here could contradict the plan it is written into.
 */
export type ActivityDraft = Pick<ActivityInsert, "title" | "description">;

/**
 * Create a day plan, or replace its proposals with a fresh batch. Both are the
 * same shape: a hasło and the activities it produced.
 */
export type GenerateDayPlanCommand = Pick<DayPlanInsert, "plan_date" | "prompt"> & {
  readonly activities: readonly ActivityDraft[];
};
