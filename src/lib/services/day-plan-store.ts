import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/db/database.types";
import { selectCurrentGeneration } from "@/lib/day-plans";
import type {
  ActivityDraft,
  CurrentActivity,
  DayPlan,
  DayPlanWithCurrentActivities,
  GenerateDayPlanCommand,
} from "@/types";

/**
 * Every read and write of a day plan goes through this module.
 *
 * It lives in `services/` rather than `src/lib/` because it touches two tables -
 * the rule from CLAUDE.md. It is also the first module in the project to reach
 * Supabase from anywhere other than `@/lib/supabase`, so the shape it sets is
 * the one the rest of the project will copy.
 *
 * Two conventions worth stating, because both are load-bearing:
 *
 *   * The client is always the first argument, never a module-level singleton.
 *     The caller's session is what RLS reads, and RLS is the entire isolation
 *     guarantee here (F-01). A hidden client would make "whose rows are these"
 *     an invisible property of the import graph.
 *   * No function filters on `user_id`. That is not an omission - the policies
 *     do it, and a redundant filter in application code would quietly become the
 *     thing people trust instead.
 */

/** The session-bound client from `@/lib/supabase`, with the schema attached. */
export type DayPlanClient = SupabaseClient<Database>;

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Deliberately shaped like `GenerationErrorCategory` in `activity-generator.ts`
 * so a route can answer with the same `{ error, retryable }` envelope regardless
 * of which layer failed - but *not* the same type. `GenerationError` means the
 * model misbehaved; conflating the two would put "OpenRouter is rate limiting
 * you" and "the database refused this write" behind one instanceof check.
 *
 * `not_found` has no counterpart there because generation has no notion of a
 * missing row. It exists so routes can answer 404 without pattern-matching on
 * error strings.
 */
export type StoreErrorCategory = "transient" | "config" | "invalid" | "not_found";

const RETRYABLE_BY_CATEGORY: Record<StoreErrorCategory, boolean> = {
  // A dropped connection or an overloaded database. The same write may land.
  transient: true,
  // Missing credentials, or a privilege the role does not hold. An operator's
  // problem; the teacher clicking again changes nothing.
  config: false,
  // A constraint refused the value. The same write will be refused identically.
  invalid: false,
  // The row is not there, or not this teacher's. Also stable.
  not_found: false,
};

export class StoreError extends Error {
  readonly category: StoreErrorCategory;
  readonly retryable: boolean;
  /** The SQLSTATE or PostgREST code, when the failure carried one. For logs. */
  readonly code?: string;
  /**
   * What the teacher may read, when the category's default is too vague to be
   * useful. Opt-in rather than automatic: `message` carries row ids and provider
   * prose, which belong in a log and not on a screen, so a route never shows it
   * unless a throw site has explicitly said this text is safe.
   */
  readonly userMessage?: string;

  constructor(
    category: StoreErrorCategory,
    message: string,
    options: { code?: string; cause?: unknown; userMessage?: string } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "StoreError";
    this.category = category;
    this.retryable = RETRYABLE_BY_CATEGORY[category];
    this.code = options.code;
    this.userMessage = options.userMessage;
  }
}

/**
 * Maps a PostgREST failure onto a category.
 *
 * Branching on the code rather than the message: the message is provider prose
 * and changes between versions, while these codes are SQLSTATEs the schema
 * itself raises. The three the migrations can produce are spelled out - the
 * generation trigger's two, and the CHECKs from F-01.
 */
function categorize(error: PostgrestError): StoreErrorCategory {
  switch (error.code) {
    // `.maybeSingle()` found more than one row, or `.single()` found none.
    case "PGRST116":
      return "not_found";
    // insufficient_privilege. From the generation trigger this means the plan
    // row is not visible; from anywhere else it means a grant is wrong. Neither
    // is fixed by retrying, and both want an operator to look.
    case "42501":
      return "config";
    // check_violation (the generation invariant, and the length/ordinal bounds),
    // not_null_violation, unique_violation, foreign_key_violation,
    // string_data_right_truncation.
    case "23514":
    case "23502":
    case "23505":
    case "23503":
    case "22001":
      return "invalid";
    default:
      // Unknown codes lean retryable on purpose. A retry costs milliseconds; a
      // wrongly-terminal error costs the teacher a whole generation.
      return "transient";
  }
}

function toStoreError(error: PostgrestError, what: string): StoreError {
  return new StoreError(categorize(error), `${what}: ${error.message}`, { code: error.code, cause: error });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

function toJsonActivities(activities: readonly ActivityDraft[]): Json {
  // Rebuilt rather than passed through, so a future field on `ActivityDraft`
  // does not silently start travelling to Postgres. The function reads exactly
  // `title` and `description`.
  return activities.map((activity) => ({ title: activity.title, description: activity.description }));
}

async function callSaveGeneration(supabase: DayPlanClient, command: GenerateDayPlanCommand): Promise<string> {
  const { data, error } = await supabase.rpc("save_day_plan_generation", {
    p_plan_date: command.plan_date,
    p_prompt: command.prompt,
    p_activities: toJsonActivities(command.activities),
  });

  if (error) {
    throw toStoreError(error, "Nie udało się zapisać planu dnia");
  }
  if (typeof data !== "string") {
    throw new StoreError("invalid", "Zapis planu dnia nie zwrócił identyfikatora.");
  }
  return data;
}

/**
 * Writes one generation batch and returns the plan's id.
 *
 * The whole write is one RPC because it has to be one transaction: the counter
 * bump, the removal of the superseded batch and the insert of the new one are
 * not separable, and PostgREST gives the client no transaction to put them in.
 * See `20260823095136_day_plan_generation_write_contract.sql`.
 *
 * Retried once, on any failure. The asymmetry is what justifies it: this write
 * happens *after* a generation the teacher already waited 10-30 seconds and paid
 * tokens for, and the realistic failure here is a connection blip rather than a
 * standing condition. The retry costs milliseconds, so it is worth taking even
 * for the categories that will certainly fail again. A second failure is the
 * answer.
 *
 * Not idempotent, and knowingly so: if the first call committed and only its
 * response was lost, the retry writes a second generation of the same three
 * proposals. The teacher sees the right plan; `current_generation` is one higher
 * than the number of times they pressed the button. That is the cheap side of
 * this trade - the expensive side would be losing the batch entirely.
 */
export async function saveGeneration(supabase: DayPlanClient, command: GenerateDayPlanCommand): Promise<string> {
  try {
    return await callSaveGeneration(supabase, command);
  } catch (firstFailure) {
    if (!(firstFailure instanceof StoreError)) {
      throw firstFailure;
    }
    return callSaveGeneration(supabase, command);
  }
}

/**
 * Rewrites the text of one proposal and returns the id of the plan it belongs
 * to, so the caller can read the plan back.
 *
 * Nothing here clears the plan's acceptance. That is
 * `activities_edit_clears_acceptance`'s job, and it is a trigger rather than a
 * second statement precisely so a partial failure cannot leave corrected text
 * sitting on an accepted plan.
 *
 * A row belonging to another account is invisible under RLS, so the update
 * affects nothing and no error is raised - which is why the empty result is
 * checked explicitly. It answers `not_found`, not a privilege error: telling a
 * caller "that exists but is not yours" is an existence oracle.
 */
export async function updateActivityText(
  supabase: DayPlanClient,
  activityId: string,
  text: { title: string; description: string },
): Promise<string> {
  const { data, error } = await supabase
    .from("activities")
    .update({ title: text.title, description: text.description })
    .eq("id", activityId)
    .select("plan_id")
    .maybeSingle();

  if (error) {
    throw toStoreError(error, "Nie udało się zapisać propozycji");
  }
  if (!data) {
    throw new StoreError("not_found", `Activity ${activityId} is not visible to the caller.`, {
      userMessage: "Nie znaleziono tej propozycji.",
    });
  }
  return data.plan_id;
}

/**
 * Accepts a plan, or withdraws an acceptance.
 *
 * The timestamp comes from this server, not the browser - a teacher's clock is
 * not evidence of anything. It is still not the database's clock, which matters
 * for exactly one constraint: `day_plans_accepted_after_created` refuses an
 * `accepted_at` earlier than `created_at`. Reaching that needs a plan accepted
 * within milliseconds of its creation *and* a backwards clock skew between this
 * worker and Postgres; a human pressing a button cannot get there. If it ever
 * did, it surfaces as `invalid` with the constraint named, not as a bad row.
 */
export async function setAcceptance(supabase: DayPlanClient, planId: string, accepted: boolean): Promise<void> {
  const { data, error } = await supabase
    .from("day_plans")
    .update({ accepted_at: accepted ? new Date().toISOString() : null })
    .eq("id", planId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw toStoreError(error, "Nie udało się zmienić stanu planu");
  }
  if (!data) {
    throw new StoreError("not_found", `Plan ${planId} is not visible to the caller.`, {
      userMessage: "Nie znaleziono tego planu dnia.",
    });
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * The plan for one day, with only its live proposals - or `null` when the
 * teacher has no plan for that day yet.
 *
 * The single read path in the project, used by SSR and by every mutating route
 * to build its response. Two queries rather than an embedded select, because
 * `selectCurrentGeneration` has to see the plan's counter and the unfiltered
 * batch together; it is the only constructor of `CurrentActivity` and nothing
 * may route around it.
 *
 * `.maybeSingle()` is safe on `plan_date` alone: `unique (user_id, plan_date)`
 * plus RLS means a teacher has at most one row per day.
 */
export async function readDayPlan(
  supabase: DayPlanClient,
  planDate: string,
): Promise<DayPlanWithCurrentActivities | null> {
  const { data: plan, error: planError } = await supabase
    .from("day_plans")
    .select("*")
    .eq("plan_date", planDate)
    .maybeSingle();

  if (planError) {
    throw toStoreError(planError, "Nie udało się odczytać planu dnia");
  }
  if (!plan) {
    return null;
  }

  return { plan, activities: await readCurrentActivities(supabase, plan) };
}

/** As {@link readDayPlan}, but addressed by plan id - what a mutating route has. */
export async function readDayPlanById(
  supabase: DayPlanClient,
  planId: string,
): Promise<DayPlanWithCurrentActivities | null> {
  const { data: plan, error: planError } = await supabase.from("day_plans").select("*").eq("id", planId).maybeSingle();

  if (planError) {
    throw toStoreError(planError, "Nie udało się odczytać planu dnia");
  }
  if (!plan) {
    return null;
  }

  return { plan, activities: await readCurrentActivities(supabase, plan) };
}

async function readCurrentActivities(supabase: DayPlanClient, plan: DayPlan): Promise<CurrentActivity[]> {
  // Ordered here rather than in the island: `ordinal` is the model's ordering,
  // and it is the database's answer to "in what order", not the client's.
  const { data, error } = await supabase.from("activities").select("*").eq("plan_id", plan.id).order("ordinal");

  if (error) {
    throw toStoreError(error, "Nie udało się odczytać propozycji");
  }
  return selectCurrentGeneration(plan, data);
}
