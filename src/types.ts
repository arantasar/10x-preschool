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
// `save_day_plan_generation` deletes the superseded batch in the same write that
// creates its replacement, so in practice a plan's rows are one generation. The
// brand does not rest on that. It rests on the counter being the definition of
// "current": a row whose `generation` does not match `current_generation` is not
// live, whatever put it there — a direct write outside the RPC, or a read taken
// while a regeneration was in flight — and it renders as a stale proposal with no
// error to mark it. So `CurrentActivity` is a branded type that no literal can
// satisfy: the only way to obtain one is `selectCurrentGeneration` in
// `@/lib/day-plans`, which does the comparison. Reading the whole table stays
// possible — you just cannot pass the result anywhere that expects the live batch.

declare const currentGenerationBrand: unique symbol;

/** An {@link Activity} proven to belong to its plan's live generation. */
export type CurrentActivity = Activity & { readonly [currentGenerationBrand]: true };

// ---------------------------------------------------------------------------
// Read models
// ---------------------------------------------------------------------------

/** What a teacher sees for a given day: the plan, and only its live proposals. */
export interface DayPlanWithCurrentActivities {
  readonly plan: DayPlan;
  readonly activities: readonly CurrentActivity[];
}

/**
 * The same read model, minus the brand - what a browser is allowed to hold.
 *
 * `CurrentActivity` is earned by passing through `selectCurrentGeneration`, and
 * a client cannot earn it: JSON arriving from `fetch` has been through no such
 * check, and a type predicate claiming otherwise would be a lie the compiler
 * cannot catch. So the island reads this instead. Assignment goes one way -
 * {@link DayPlanWithCurrentActivities} is a `DayPlanView`, not the reverse -
 * which is what keeps the server from quietly accepting unbranded activities
 * where it means the live batch.
 */
export interface DayPlanView {
  readonly plan: DayPlan;
  readonly activities: readonly Activity[];
}

// ---------------------------------------------------------------------------
// Week and month read models
// ---------------------------------------------------------------------------

/**
 * What `/plan/week` hands its island.
 *
 * A plain record rather than a `Map`, because this crosses the SSR boundary as
 * JSON. Days with no plan are simply absent from `plans` - "this day is empty"
 * is the absence of a key, not a null, so the island cannot confuse "no plan"
 * with "a plan that failed to load".
 */
export interface WeekPlanView {
  /** The Monday the week is addressed by. */
  readonly weekStart: string;
  /** The five working days, in calendar order. */
  readonly days: readonly string[];
  /**
   * Saved plans, keyed by `plan_date`. Absent key means the day is free.
   *
   * `Partial` is load-bearing, not decoration: without it the index signature
   * promises a `DayPlanView` for every string, and the `?? null` that turns a
   * missing day into an empty card reads to the compiler as dead code.
   */
  readonly plans: Readonly<Partial<Record<string, DayPlanView>>>;
}

/**
 * One day as the month grid needs it: enough to say "planned" or "accepted",
 * and nothing more.
 *
 * Deliberately without activities. A month is up to 31 days and the grid shows
 * none of their contents, so reading the proposals would be up to 31 batches
 * fetched to render a coloured dot. The theme is the exception that proves the
 * shape: one more column of the same row, not a second read.
 */
export interface DayPlanSummary {
  readonly plan_date: string;
  readonly prompt: string;
  readonly accepted: boolean;
  /**
   * This day's slice of a week outline, or `null` when it has none.
   *
   * `null` is a permanent, valid state rather than missing data - a day planned
   * on its own from `/plan?date=` never gets a theme and never will. Consumers
   * fall back to showing the hasło alone; none of them flags the absence.
   */
  readonly theme: string | null;
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
 * One day's slice of a week outline: which day, and the narrowing of the hasło
 * assigned to it.
 *
 * `plan_date` rather than an index, because the index only means anything next
 * to the week it was generated for. Once the outline is split across five
 * independent generation requests — which is how a week is generated — the date
 * is the only thing tying a theme back to the day it belongs to.
 */
export interface DayTheme {
  readonly plan_date: string;
  readonly theme: string;
}

/**
 * Create a day plan, or replace its proposals with a fresh batch. Both are the
 * same shape: a hasło and the activities it produced.
 */
export type GenerateDayPlanCommand = Pick<DayPlanInsert, "plan_date" | "prompt"> & {
  readonly activities: readonly ActivityDraft[];
  /** The teacher has agreed to lose the current batch and their acceptance. */
  readonly confirm_replace: boolean;
  /**
   * This day's slice of a week outline, when the generation came from one.
   *
   * Omitted rather than nulled by a single-day regeneration: the writer keeps
   * whatever theme the day already carries when this is absent, so a day
   * regenerated from `/plan?date=` stays pinned to its week.
   */
  readonly theme?: string;
  /**
   * Refuse rather than replace if this day already has a plan.
   *
   * The week generation's skip policy, enforced by the writer rather than by the
   * caller. A week is generated from a view of which days were free, and that
   * view can be stale by the time five parallel requests land.
   */
  readonly require_absent?: boolean;
};

/**
 * One day inside a week write: which day, the proposals it holds, and the
 * theme the outline gave it.
 *
 * `theme` is optional on the same reasoning as {@link GenerateDayPlanCommand}'s
 * — absent means "keep whatever theme this day already has", not "clear it".
 * In practice the week path always has one, because the outline runs first;
 * the option exists so the writer's contract does not differ between the two
 * paths.
 */
export type GenerateWeekDayCommand = Pick<DayPlanInsert, "plan_date"> & {
  readonly activities: readonly ActivityDraft[];
  readonly theme?: string;
};

/**
 * Replace several days of one week with freshly generated batches, as one
 * transaction.
 *
 * The hasło is the week's, not the day's — every day in a week run carries the
 * same one, which is why it sits here rather than on
 * {@link GenerateWeekDayCommand}.
 *
 * The per-day member reuses `ActivityDraft` deliberately: the week path must
 * not be able to accept a proposal shape the day path would reject.
 *
 * There is no `require_absent` counterpart. This command replaces by design —
 * the caller chooses which days to send by acceptance, and a day it does not
 * send is a day the writer never touches. `confirm_replace` is the accepted-day
 * gate, and in this slice nothing ever sets it to `true`.
 */
export type GenerateWeekPlanCommand = Pick<DayPlanInsert, "prompt"> & {
  readonly days: readonly GenerateWeekDayCommand[];
  /** The teacher has agreed to lose the accepted days' batches and acceptance. */
  readonly confirm_replace: boolean;
};
