import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/db/database.types";
import { formatPlanDate } from "@/lib/day-plan-dates";
import { selectCurrentGeneration } from "@/lib/day-plans";
import type {
  ActivityDraft,
  CurrentActivity,
  DayPlan,
  DayPlanSummary,
  DayPlanWithCurrentActivities,
  GenerateDayPlanCommand,
  GenerateWeekPlanCommand,
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
 * error strings. `conflict` is the same idea for 409: a write the schema refused
 * on purpose, which the teacher can resolve, as against `invalid`, which is ours.
 */
export type StoreErrorCategory = "transient" | "config" | "invalid" | "not_found" | "conflict";

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
  // The schema refused a destructive write the caller had not confirmed. Retrying
  // the same request repeats the refusal; the teacher has to look and decide.
  conflict: false,
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
 * itself raises. The ones the migrations can produce are spelled out - the
 * generation trigger's two, the write function's refusal, and the CHECKs from
 * F-01.
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
    // U0001: save_day_plan_generation refusing to supersede an accepted plan
    // without p_confirm_replace. U0002: the same function declining to touch a
    // day that already has a plan, which is the week generation's skip policy.
    // Both are deliberate refusals rather than broken values, and both are the
    // teacher's to resolve - but they are separate codes because they are
    // separate answers, and the route says different things about them.
    case "U0001":
    case "U0002":
      return "conflict";
    // U0003: save_day_plan_generation refusing an empty batch. Not `conflict` -
    // there is nothing for the teacher to decide - and explicitly not left to
    // the `default` below, which leans retryable: telling the teacher "spróbuj
    // ponownie za chwilę" about a batch the schema will refuse identically would
    // be a lie. It is `invalid` for the reason day-plan-http gives that category:
    // zod already accepted the value against the same bound, so the two
    // disagreeing is our bug, not the caller's.
    //
    // What this does *not* do is stop the write from being re-issued.
    // `saveGeneration` retries every StoreError but `conflict`, so a U0003 - like
    // `not_found` and `config` - is sent to Postgres twice before it surfaces.
    // Harmless (nothing was written either time) and deliberate: the retry is
    // there to buy back a generation the teacher already paid 10-30s for, and it
    // is not worth a category-by-category exception list. The category decides
    // what the teacher is *told*, not how many times we ask.
    case "U0003":
      return "invalid";
    // check_violation (the generation invariant, and the length/ordinal bounds),
    // not_null_violation, unique_violation, foreign_key_violation,
    // string_data_right_truncation.
    case "23514":
    case "23502":
    case "23505":
    case "23503":
    case "22001":
      return "invalid";
    // invalid_datetime_format and datetime_field_overflow. Only the week writer
    // can raise these - it casts `plan_date` out of jsonb, where the single-day
    // writer gets a typed argument PostgREST has already checked. Named here
    // rather than left to the `default` below for the reason U0003 is: the
    // default leans retryable, and "spróbuj ponownie za chwilę" about a date
    // that will never parse is a lie the teacher waits out twice.
    case "22007":
    case "22008":
      return "invalid";
    default:
      // Unknown codes lean retryable on purpose. A retry costs milliseconds; a
      // wrongly-terminal error costs the teacher a whole generation.
      return "transient";
  }
}

/**
 * The one message a category default cannot cover.
 *
 * `conflict`'s default talks about refreshing a stale page, which is right for
 * U0001 and wrong for U0002: nothing is stale there and nothing needs
 * refreshing - the day was simply already planned and was left exactly as it
 * was. The cheap pre-check in `generate.ts` names this itself; this is the same
 * sentence for the race the pre-check cannot see, so both paths answer alike.
 */
const MESSAGE_BY_CODE: Readonly<Record<string, string>> = {
  U0002: "Ten dzień ma już plan — nie został nadpisany.",
};

function toStoreError(error: PostgrestError, what: string): StoreError {
  return new StoreError(categorize(error), `${what}: ${error.message}`, {
    code: error.code,
    cause: error,
    userMessage: error.code ? MESSAGE_BY_CODE[error.code] : undefined,
  });
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
    p_confirm_replace: command.confirm_replace,
    // Both are omitted rather than nulled when the caller has nothing to say.
    // `p_theme` absent means "keep whatever theme this day already has", which
    // is what a single-day regeneration wants; sending null would erase it.
    ...(command.theme === undefined ? {} : { p_theme: command.theme }),
    ...(command.require_absent === undefined ? {} : { p_require_absent: command.require_absent }),
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
 * Retried once, on any failure but a `conflict`. The asymmetry is what justifies
 * it: this write happens *after* a generation the teacher already waited 10-30
 * seconds and paid tokens for, and the realistic failure here is a connection
 * blip rather than a standing condition. The retry costs milliseconds, so it is
 * worth taking even for the categories that will certainly fail again. A second
 * failure is the answer.
 *
 * `conflict` is the exception because it is not a failure at all: the schema
 * refused to destroy an acceptance nobody confirmed, and repeating the request
 * would only ask the same question twice.
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
    // A refusal is not a blip. Re-issuing it would repeat the same answer and,
    // worse, muddy the one category whose whole point is that the teacher - not
    // the retry - decides what happens next.
    if (firstFailure.category === "conflict") {
      throw firstFailure;
    }
    return callSaveGeneration(supabase, command);
  }
}

/**
 * The date the week writer refused on, lifted out of its exception message.
 *
 * The function raises `plan for 2026-05-11 is accepted; …`, and that date is
 * the only thing in the refusal a teacher can act on. Anchored on the
 * surrounding prose rather than on a bare date, so an id or a timestamp
 * elsewhere in the message cannot be mistaken for it.
 */
const REFUSED_PLAN_DATE = /plan for (\d{4}-\d{2}-\d{2}) is accepted/;

/**
 * `conflict` on the week path, said with the day it happened on.
 *
 * The category default - "Ten plan zmienił się w innym miejscu" - is written
 * for one day and is close to useless for five: it tells the teacher something
 * was refused and not which day to go and look at. Falls back to `undefined`
 * (i.e. to that default) when the message is not the shape we expect, because a
 * wrong date on screen is worse than a vague sentence.
 */
function weekConflictMessage(error: PostgrestError): string | undefined {
  if (error.code !== "U0001") {
    return undefined;
  }
  const isoDate = REFUSED_PLAN_DATE.exec(error.message)?.[1];
  if (isoDate === undefined) {
    return undefined;
  }
  return `${formatPlanDate(isoDate)} — ten dzień jest zaakceptowany, więc nic nie zostało zapisane. Cofnij jego akceptację albo wygeneruj tydzień bez niego.`;
}

async function callSaveWeekGeneration(supabase: DayPlanClient, command: GenerateWeekPlanCommand): Promise<void> {
  const { error } = await supabase.rpc("save_week_plan_generation", {
    p_prompt: command.prompt,
    p_days: command.days.map((day) => ({
      plan_date: day.plan_date,
      // Omitted rather than nulled when the caller has nothing to say, exactly
      // as `p_theme` is on the single-day path: the writer coalesces an absent
      // theme onto the one the day already carries, and a null would erase it.
      ...(day.theme === undefined ? {} : { theme: day.theme }),
      activities: toJsonActivities(day.activities),
    })),
    p_confirm_replace: command.confirm_replace,
  });

  if (error) {
    // The message carries the `plan_date` the function refused on, and that is
    // the point: across five days "a plan is accepted" names nothing the
    // teacher can act on. `toStoreError` keeps it in `message`, which is for
    // the log only - `storeFailure` never puts `message` on a screen - so the
    // date reaches the teacher through `userMessage` or not at all.
    const failure = toStoreError(error, "Nie udało się zapisać planów tygodnia");
    const named = weekConflictMessage(error);
    if (named === undefined) {
      throw failure;
    }
    throw new StoreError(failure.category, failure.message, {
      code: failure.code,
      cause: error,
      userMessage: named,
    });
  }
}

/**
 * Writes a whole week's generation batches as one transaction.
 *
 * Returns nothing, unlike {@link saveGeneration}: the week's caller reads the
 * days back through `readWeekPlans` rather than holding plan ids, so handing
 * back a list of ids would only invite the island to trust its own copy of what
 * was written instead of the database's.
 *
 * Retried once on anything but a `conflict`, on the same asymmetry
 * {@link saveGeneration} records and for a sharper version of the same reason:
 * this write lands after the teacher has waited for — and paid for — up to five
 * generations, so losing the set to a connection blip is the expensive outcome
 * and a second round trip is the cheap one. Not idempotent, knowingly: a lost
 * response followed by a successful retry leaves every day one generation
 * higher than the teacher pressed for, showing the right plan.
 *
 * `conflict` is the exception because it is a refusal rather than a failure —
 * an accepted day nobody confirmed. Repeating it would ask the same question
 * twice and tell the teacher nothing new.
 */
export async function saveWeekGeneration(supabase: DayPlanClient, command: GenerateWeekPlanCommand): Promise<void> {
  try {
    await callSaveWeekGeneration(supabase, command);
    return;
  } catch (firstFailure) {
    if (!(firstFailure instanceof StoreError)) {
      throw firstFailure;
    }
    if (firstFailure.category === "conflict") {
      throw firstFailure;
    }
    return callSaveWeekGeneration(supabase, command);
  }
}

/**
 * What {@link updateActivityText} hands back: the plan to read again, and
 * whether that plan was accepted a moment before the write.
 *
 * `wasAccepted` cannot be recovered afterwards - `accepted_at` is null both
 * after a withdrawal and when there never was one - which is the whole reason
 * the read runs first.
 */
export interface ActivityTextUpdate {
  readonly planId: string;
  /** The plan's acceptance state immediately before the write. */
  readonly wasAccepted: boolean;
}

/**
 * Rewrites the text of one proposal and returns the id of the plan it belongs
 * to, so the caller can read the plan back - together with whether this edit is
 * the one that took an acceptance away.
 *
 * Nothing here clears the plan's acceptance. That is
 * `activities_edit_clears_acceptance`'s job, and it is a trigger rather than a
 * second statement precisely so a partial failure cannot leave corrected text
 * sitting on an accepted plan. What this function adds is only the *report*: the
 * acceptance state is read before the update because after it the information is
 * gone for good, `accepted_at` being null in both of the cases that matter.
 *
 * The read reaches `day_plans` through the composite key
 * `activities_plan_id_user_id_fkey` on `(plan_id, user_id)`. PostgREST cannot
 * resolve a bare `day_plans(...)` embed across a two-column foreign key, so the
 * constraint is named in the select rather than left to inference.
 *
 * A row belonging to another account is invisible under RLS, so both statements
 * see nothing and no error is raised - which is why the empty results are
 * checked explicitly. They answer `not_found`, not a privilege error: telling a
 * caller "that exists but is not yours" is an existence oracle. The refusal now
 * arrives from the read, i.e. *before* the write, rather than from an update
 * that touched nothing.
 *
 * The gap between the read and the update is knowingly not a transaction:
 * another tab accepting or withdrawing in between changes what the teacher is
 * *told*, never what is written, because the zeroing is the trigger's decision
 * on the row's actual state.
 */
export async function updateActivityText(
  supabase: DayPlanClient,
  activityId: string,
  text: { title: string; description: string },
): Promise<ActivityTextUpdate> {
  const { data: before, error: beforeError } = await supabase
    .from("activities")
    .select("plan_id, day_plans!activities_plan_id_user_id_fkey(accepted_at)")
    .eq("id", activityId)
    .maybeSingle();

  if (beforeError) {
    throw toStoreError(beforeError, "Nie udało się odczytać propozycji");
  }
  if (!before) {
    throw new StoreError("not_found", `Activity ${activityId} is not visible to the caller.`, {
      userMessage: "Nie znaleziono tej propozycji.",
    });
  }

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
  return { planId: data.plan_id, wasAccepted: acceptedAtOf(before.day_plans) !== null };
}

/**
 * The `accepted_at` out of the embedded plan, whichever shape PostgREST's
 * typings give the embed.
 *
 * A forward embed across a non-unique foreign key is typed as a to-one object
 * here, but the same select would be an array if the constraint's uniqueness
 * ever changed. Reading both shapes costs two lines and means a regenerated
 * `database.types.ts` cannot turn this into a silent `undefined`.
 *
 * `null` is the third shape, and it is unreachable today rather than impossible:
 * the two `authenticated` SELECT policies use the identical predicate
 * `(select auth.uid()) = user_id`, so an activity the caller can see always has
 * a plan the caller can see. Were those to drift apart, a bare property read
 * would throw inside the route's `try` and surface as a generic 500 instead of
 * the `not_found` this path is built to answer - so the null is absorbed here.
 */
function acceptedAtOf(
  embedded: { accepted_at: string | null } | { accepted_at: string | null }[] | null,
): string | null {
  if (embedded === null) return null;
  return Array.isArray(embedded) ? (embedded[0]?.accepted_at ?? null) : embedded.accepted_at;
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
export async function setAcceptance(
  supabase: DayPlanClient,
  planId: string,
  accepted: boolean,
  expectedGeneration: number,
): Promise<void> {
  const { data, error } = await supabase
    .from("day_plans")
    .update({ accepted_at: accepted ? new Date().toISOString() : null })
    .eq("id", planId)
    .eq("current_generation", expectedGeneration)
    .select("id")
    .maybeSingle();

  if (error) {
    throw toStoreError(error, "Nie udało się zmienić stanu planu");
  }
  if (data) {
    return;
  }

  // Nothing matched, and the two reasons want different answers: the plan is
  // not this teacher's (or not there at all), or it is theirs and has moved on
  // since their page was rendered. Only the second is worth a refresh, so the
  // failure path pays for one read to tell them apart. The success path does not.
  const { data: existing } = await supabase
    .from("day_plans")
    .select("current_generation")
    .eq("id", planId)
    .maybeSingle();

  if (existing) {
    throw new StoreError(
      "conflict",
      `Plan ${planId} moved to generation ${String(existing.current_generation)}; caller expected ${String(expectedGeneration)}.`,
    );
  }

  throw new StoreError("not_found", `Plan ${planId} is not visible to the caller.`, {
    userMessage: "Nie znaleziono tego planu dnia.",
  });
}

/**
 * Deletes one day's plan, addressed by date.
 *
 * Addressed by date rather than by id for the same reason `readDayPlan` is:
 * `unique (user_id, plan_date)` plus RLS means a teacher has at most one row per
 * day, so the date names it as precisely as the id does - and it is what the
 * screen doing the deleting already holds.
 *
 * The proposals go with it, by `on delete cascade` on
 * `activities_plan_id_user_id_fkey`. This function does not know about them and
 * must not: a second statement here could half-succeed, and the schema has
 * carried that guarantee since F-01.
 *
 * A row that is not visible under RLS - another teacher's, or none at all - is
 * not an error but a delete that touches nothing, which is why the empty result
 * is checked explicitly. It answers `not_found` rather than a privilege failure,
 * on the same reasoning as `updateActivityText`: saying "that exists but is not
 * yours" is an existence oracle.
 *
 * Not retried, unlike `saveGeneration`. There the retry buys back a generation
 * the teacher waited 10-30 seconds and paid tokens for; here a retry after a
 * lost response would find the row already gone and turn a success into
 * "Ten dzień nie ma planu do usunięcia."
 */
export async function deleteDayPlan(supabase: DayPlanClient, planDate: string): Promise<void> {
  const { data, error } = await supabase
    .from("day_plans")
    .delete()
    .eq("plan_date", planDate)
    .select("id")
    .maybeSingle();

  if (error) {
    throw toStoreError(error, "Nie udało się usunąć planu dnia");
  }
  if (!data) {
    throw new StoreError("not_found", `No plan for ${planDate} is visible to the caller.`, {
      userMessage: "Ten dzień nie ma planu do usunięcia.",
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

/**
 * Every saved plan in a set of days, keyed by date.
 *
 * Two queries for the whole week rather than five round trips: the plans in one
 * `in (…)`, then their activities in another, and `selectCurrentGeneration` per
 * plan. That last part is why this cannot be a simple embedded select - the
 * brand on `CurrentActivity` is only earned by comparing a batch against its own
 * plan's counter, and this read has to stay inside that funnel like every other.
 *
 * A day with no plan has no key. The caller distinguishes "free" from "failed"
 * by whether this threw, never by a null in the map.
 */
export async function readWeekPlans(
  supabase: DayPlanClient,
  dates: readonly string[],
): Promise<Map<string, DayPlanWithCurrentActivities>> {
  const result = new Map<string, DayPlanWithCurrentActivities>();
  if (dates.length === 0) {
    return result;
  }

  const { data: plans, error: planError } = await supabase
    .from("day_plans")
    .select("*")
    .in("plan_date", [...dates]);

  if (planError) {
    throw toStoreError(planError, "Nie udało się odczytać planów tygodnia");
  }
  if (plans.length === 0) {
    return result;
  }

  const { data: activities, error: activityError } = await supabase
    .from("activities")
    .select("*")
    .in(
      "plan_id",
      plans.map((plan) => plan.id),
    )
    .order("ordinal");

  if (activityError) {
    throw toStoreError(activityError, "Nie udało się odczytać propozycji tygodnia");
  }

  for (const plan of plans) {
    const own = activities.filter((activity) => activity.plan_id === plan.id);
    result.set(plan.plan_date, { plan, activities: selectCurrentGeneration(plan, own) });
  }
  return result;
}

/**
 * Which days of a range have a plan, and whether it is accepted.
 *
 * The month grid's read. It stops at `day_plans` on purpose - see
 * {@link DayPlanSummary}.
 */
export async function readMonthSummary(
  supabase: DayPlanClient,
  fromDate: string,
  toDate: string,
): Promise<DayPlanSummary[]> {
  const { data, error } = await supabase
    .from("day_plans")
    .select("plan_date, prompt, accepted_at, theme")
    .gte("plan_date", fromDate)
    .lte("plan_date", toDate)
    .order("plan_date");

  if (error) {
    throw toStoreError(error, "Nie udało się odczytać planów miesiąca");
  }

  return data.map((row) => ({
    plan_date: row.plan_date,
    prompt: row.prompt,
    accepted: row.accepted_at !== null,
    theme: row.theme,
  }));
}
