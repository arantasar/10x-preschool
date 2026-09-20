import { z } from "zod";
import type { ActivityDraft, DayTheme } from "@/types";
import { ACTIVITY_COUNT, DESCRIPTION_MAX, PROMPT_MAX, THEME_MAX, TITLE_MAX, WEEK_DAYS } from "@/lib/day-plan-limits";

// The bounds live in `@/lib/day-plan-limits` because the React island needs them
// too and must not pull zod into the client bundle. See that module for why they
// are what they are.

export { ACTIVITY_COUNT, WEEK_DAYS };

// ---------------------------------------------------------------------------
// Model output
// ---------------------------------------------------------------------------

/**
 * What the model is asked to return, validated after `JSON.parse`.
 *
 * The JSON Schema sent as `response_format` is an instruction to the model, not
 * a type guarantee in TypeScript - a provider without native strict-mode support
 * may treat it as a strong suggestion. This schema is the actual guarantee, and
 * it is deliberately stricter than `min(1)`: `ACTIVITY_COUNT` is enforced here
 * even though the JSON Schema also asks for it, because `minItems`/`maxItems`
 * are among the constructs strict mode may drop depending on the endpoint.
 *
 * Unknown keys are *stripped*, not rejected - deliberately, and unlike the
 * `additionalProperties: false` in `day-plan.schema.json`. That flag is there to
 * steer the model; this schema decides what a stray field costs. Rejecting would
 * turn one surplus key into a failed generation, and the teacher pays for that
 * in 10-30 seconds plus an error message. Only `tytul` and `opis` are ever read.
 */
export const dayPlanProposalSchema = z.object({
  aktywnosci: z
    .array(
      z.object({
        tytul: z.string().min(1).max(TITLE_MAX),
        opis: z.string().min(1).max(DESCRIPTION_MAX),
      }),
    )
    .length(ACTIVITY_COUNT),
});

export type DayPlanProposal = z.infer<typeof dayPlanProposalSchema>;

/**
 * Maps the model's Polish-named output onto the persistence-facing shape from
 * `@/types`. `ActivityDraft` carries only `title` and `description` - ownership,
 * batch and ordering belong to the persistence layer, which S-01 does not touch.
 */
export function toActivityDrafts(proposal: DayPlanProposal): ActivityDraft[] {
  return proposal.aktywnosci.map((activity) => ({
    title: activity.tytul,
    description: activity.opis,
  }));
}

// ---------------------------------------------------------------------------
// Week outline
// ---------------------------------------------------------------------------

/**
 * The week outline as the model returns it, validated after `JSON.parse`.
 *
 * Same division of labour as {@link dayPlanProposalSchema}: the JSON Schema in
 * `week-outline.schema.json` steers the model, and this decides what is actually
 * accepted. The count is restated here for the reason `ACTIVITY_COUNT` is —
 * `minItems`/`maxItems` are among the constructs strict mode may drop.
 *
 * A factory rather than a constant, because from `S-09` the outline is bought
 * for the days actually being replaced — one to five of them — and a static
 * schema cannot know which. The count is the caller's `dates.length`, so the
 * schema that validates the response is built from the same number the request
 * was built from; there is no second place for them to drift apart.
 *
 * The uniqueness check is the one this schema needs and the day's does not.
 * Items with `dzien` of 1, 2, 2, 4, 5 satisfy every bound in the JSON Schema and
 * still leave Wednesday with no theme and Tuesday with two. Since the themes are
 * mapped onto dates by their day number, that lands as a week where one day
 * silently generates from the hasło alone — the exact failure this whole outline
 * step exists to prevent. It compares against `count` rather than `WEEK_DAYS`
 * for the same reason the bounds do: at a count of two, three distinct numbers
 * are as wrong as two duplicated ones.
 */
export function weekOutlineSchemaFor(count: number) {
  return z.object({
    tematy: z
      .array(
        z.object({
          // Bounded by `count`, not by `WEEK_DAYS`: `toDayThemes` indexes
          // `dates` by `dzien - 1`, so a `dzien` of 5 against a two-day request
          // reads past the end of the array and pins a theme to `undefined`.
          dzien: z.number().int().min(1).max(count),
          temat: z.string().min(1).max(THEME_MAX),
        }),
      )
      .length(count)
      .refine((items) => new Set(items.map((item) => item.dzien)).size === count, {
        message: "each requested day must appear exactly once",
      }),
  });
}

export type WeekOutline = z.infer<ReturnType<typeof weekOutlineSchemaFor>>;

/**
 * Pins each theme to the date it belongs to.
 *
 * Sorted by `dzien` rather than trusting array order: the schema guarantees the
 * numbers are distinct, not that the model listed them in order, and an
 * out-of-order response would otherwise pin the last day's theme to the first.
 *
 * `dates` is the requested days in calendar order, so `dzien - 1` indexes it —
 * which holds for a two-day subset exactly as it held for the whole week, since
 * `weekOutlineSchemaFor` bounds `dzien` by the same count `dates` has.
 */
export function toDayThemes(outline: WeekOutline, dates: readonly string[]): DayTheme[] {
  return [...outline.tematy]
    .sort((left, right) => left.dzien - right.dzien)
    .map((item, index) => ({ plan_date: dates[index], theme: item.temat }));
}

// ---------------------------------------------------------------------------
// Route input
// ---------------------------------------------------------------------------

/**
 * The two Unicode categories a hasło has no use for: `Cc`, the C0/C1 range that
 * the newline and the tab live in, and `Cf`, the invisible format characters -
 * zero-width joiners and the bidirectional overrides.
 *
 * Both are refused rather than stripped. The teacher's free text is interpolated
 * raw into the system prompt's user message, one field per line
 * (`buildDayUserMessage`), so a newline inside `prompt` does not corrupt a
 * string - it *forges a line*, and the line it forges most cheaply is `Temat
 * dnia:`, the one slot `day-plan.pl.md` declares superior to the hasło itself.
 * Silently deleting the character would leave the caller believing the rest of
 * their instruction had been read; refusing says what happened.
 */
const CONTROL_CHARACTERS = /[\p{Cc}\p{Cf}]/u;

/**
 * A teacher-written field that reaches the model: one line of text, trimmed.
 *
 * The trim runs *before* the bounds rather than after, which is the whole point
 * of it being here. `"   "` used to pass `min(1)` on the server and `char_length
 * between 1 and 2000` in the database, and was refused only by the island's own
 * `prompt.trim()` - the textbook "validated in the form, therefore validated"
 * mistake, since the island sends the untrimmed value anyway
 * (`WeekPlanBoard.tsx:139,175`).
 *
 * The upper bound is unchanged and stays the same knob as the CHECK it mirrors:
 * this narrows what the route accepts, it never widens it, so a hasło that gets
 * past here still cannot be one the database refuses to store.
 */
function singleLineText(max: number) {
  return z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !CONTROL_CHARACTERS.test(value), {
      // Deliberately does not name the offending character or its position. The
      // message is UI copy a teacher reads, not a diagnostic - and a refusal that
      // reports precisely which byte it disliked is a probe oracle.
      message: "Hasło musi być pojedynczą linią tekstu.",
    });
}

/**
 * The generation route's request body. `prompt` is bounded to the same range as
 * `day_plans.prompt` so a hasło that S-01 accepts cannot become a value S-02
 * fails to store.
 */
export const generateDayPlanRequestSchema = z.object({
  plan_date: z.iso.date(),
  prompt: singleLineText(PROMPT_MAX),
  // Carries the teacher's answer to "this deletes the current proposals and
  // withdraws your acceptance". Defaults to false so an older client, or a
  // request that simply omits it, gets the refusal rather than the deletion -
  // the schema enforces it either way (`save_day_plan_generation`, U0001).
  confirm_replace: z.boolean().default(false),
  // This day's slice of a week outline. Optional rather than nullable: absent
  // means "keep whatever theme this day already has", which is exactly what a
  // single-day regeneration from `/plan?date=` means. A nullable field would
  // let an older client erase the theme by sending null.
  theme: singleLineText(THEME_MAX).optional(),
  // The week generation's skip policy: refuse rather than replace a day that is
  // already planned. Defaults to false, so the single-day route keeps its
  // existing behaviour and only a caller that opts in gets the refusal
  // (`save_day_plan_generation`, U0002).
  only_if_absent: z.boolean().default(false),
});

export type GenerateDayPlanRequest = z.infer<typeof generateDayPlanRequestSchema>;

/**
 * The week outline route's request body.
 *
 * The dates travel with the hasło rather than being derived server-side from a
 * week start, because the model is shown them: it plans "poniedziałek, 14
 * września" and not "day 1".
 *
 * A range rather than exactly `WEEK_DAYS` since `S-09`: a run that replaces two
 * unaccepted days buys two themes, not five, and paying for three the teacher
 * will never see is the cost the old bound imposed. The upper bound stays, and
 * stays for its original reason — a caller must not be able to ask for a
 * ten-day outline the response schema would then refuse after the model had
 * already been paid. The lower bound is `1` rather than `0` for the same shape
 * of reason: an outline over no days is a request with nothing to answer.
 */
export const weekOutlineRequestSchema = z.object({
  prompt: singleLineText(PROMPT_MAX),
  dates: z.array(z.iso.date()).min(1).max(WEEK_DAYS),
});

export type WeekOutlineRequest = z.infer<typeof weekOutlineRequestSchema>;

/**
 * The deferred-write day route's request body (`/api/day-plan/week/day`).
 *
 * The same three fields `generateDayPlanRequestSchema` accepts, minus the two
 * that only mean something to a writer: there is no `confirm_replace` and no
 * `only_if_absent`, because that route writes nothing and so has nothing to
 * confirm or to refuse. The bounds are `singleLineText` for the same reason
 * they are there — reached through the same helper rather than restated, so a
 * hasło this route accepts cannot be one the write then refuses.
 */
export const generateWeekDayRequestSchema = z.object({
  plan_date: z.iso.date(),
  prompt: singleLineText(PROMPT_MAX),
  // Optional, not nullable, exactly as on the day route: this day's slice of
  // the week outline when there is one, absent when the outline failed and the
  // day is going on the hasło alone.
  theme: singleLineText(THEME_MAX).optional(),
});

export type GenerateWeekDayRequest = z.infer<typeof generateWeekDayRequestSchema>;

/**
 * One day inside a week write.
 *
 * These batches come from the *client*, which is the whole reason this schema
 * is as strict as it is. Everything else the model produces is validated the
 * moment it leaves `generateDayActivities`; this arrives over HTTP from an
 * island holding whatever it holds, and sits on the same trust boundary
 * `/api/day-plan/activity/[id]` already has for FR-008 edits. `ACTIVITY_COUNT`
 * rather than a range, because that is what the day path enforces and a week
 * write must not be the cheaper door into the same table.
 */
const weekDayBatchSchema = z.object({
  plan_date: z.iso.date(),
  theme: singleLineText(THEME_MAX).optional(),
  activities: z
    .array(
      z.object({
        title: z.string().min(1).max(TITLE_MAX),
        description: z.string().min(1).max(DESCRIPTION_MAX),
      }),
    )
    .length(ACTIVITY_COUNT),
});

/**
 * The atomic week write's request body (`/api/day-plan/week/save`).
 *
 * `days` is bounded `1..WEEK_DAYS` on both sides: a write with no days has
 * nothing to commit, and one with six is not a working week. The writer refuses
 * both on its own (`U0003`), but reaching it costs a round trip to say what a
 * schema can say here.
 *
 * The uniqueness refine is the same guard `weekOutlineSchemaFor` carries, for
 * the same class of bug one layer down: the writer upserts per element, so the
 * same `plan_date` twice would bump that day's `current_generation` twice and
 * delete the batch the first pass had just inserted. The day would end up
 * correct and its counter would not, which is the kind of wrong that surfaces
 * much later, in `expected_generation`.
 */
export const saveWeekPlanRequestSchema = z.object({
  prompt: singleLineText(PROMPT_MAX),
  days: z
    .array(weekDayBatchSchema)
    .min(1)
    .max(WEEK_DAYS)
    .refine((days) => new Set(days.map((day) => day.plan_date)).size === days.length, {
      message: "each plan_date must appear at most once",
    }),
});

export type SaveWeekPlanRequest = z.infer<typeof saveWeekPlanRequestSchema>;

/**
 * The edit route's request body (FR-008).
 *
 * The bounds are `activities_title_length` and `activities_description_length`
 * read through `day-plan-limits`, not restated - a title this schema accepts and
 * the CHECK refuses would reach the teacher as a 500 on text they were told was
 * fine. Only the two columns F-01 grants `authenticated` an UPDATE on are here:
 * `ordinal` is display order the teacher does not set by hand, and everything
 * else is withheld by the column grant anyway.
 */
export const updateActivityRequestSchema = z.object({
  title: z.string().min(1).max(TITLE_MAX),
  description: z.string().min(1).max(DESCRIPTION_MAX),
});

export type UpdateActivityRequest = z.infer<typeof updateActivityRequestSchema>;

/**
 * The acceptance route's request body (FR-009).
 *
 * `accepted` is a boolean rather than two routes, because withdrawing an
 * acceptance is the same fact with the other value - and because the teacher's
 * own edit already withdraws it via trigger. One shape for both keeps those two
 * paths writing the same column the same way.
 */
export const acceptPlanRequestSchema = z.object({
  plan_id: z.uuid(),
  accepted: z.boolean(),
  // Which batch the teacher believes they are signing off on. Accept is the one
  // verb that would otherwise succeed against proposals the caller has never
  // seen: a tab holding a superseded view still renders its "Akceptuj plan"
  // button, and without this the acceptance would attest to whatever the current
  // batch happens to be. Editing that same stale view already 404s, because the
  // rows are gone; this gives accept the same honesty.
  expected_generation: z.number().int().min(1),
});

export type AcceptPlanRequest = z.infer<typeof acceptPlanRequestSchema>;
