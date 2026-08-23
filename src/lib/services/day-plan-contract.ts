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
 * accepted. `WEEK_DAYS` is restated here for the reason `ACTIVITY_COUNT` is —
 * `minItems`/`maxItems` are among the constructs strict mode may drop.
 *
 * The uniqueness check is the one this schema needs and the day's does not. Five
 * items with `dzien` of 1, 2, 2, 4, 5 satisfy every bound in the JSON Schema and
 * still leave Wednesday with no theme and Tuesday with two. Since the themes are
 * mapped onto dates by their day number, that lands as a week where one day
 * silently generates from the hasło alone — the exact failure this whole outline
 * step exists to prevent.
 */
export const weekOutlineSchema = z.object({
  tematy: z
    .array(
      z.object({
        dzien: z.number().int().min(1).max(WEEK_DAYS),
        temat: z.string().min(1).max(THEME_MAX),
      }),
    )
    .length(WEEK_DAYS)
    .refine((items) => new Set(items.map((item) => item.dzien)).size === WEEK_DAYS, {
      message: "each working day must appear exactly once",
    }),
});

export type WeekOutline = z.infer<typeof weekOutlineSchema>;

/**
 * Pins each theme to the date it belongs to.
 *
 * Sorted by `dzien` rather than trusting array order: the schema guarantees the
 * five numbers are distinct, not that the model listed them in order, and an
 * out-of-order response would otherwise pin Friday's theme to Monday.
 *
 * `dates` is the working week in calendar order, so `dzien - 1` indexes it.
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
 * The generation route's request body. `prompt` is bounded to the same range as
 * `day_plans.prompt` so a hasło that S-01 accepts cannot become a value S-02
 * fails to store.
 */
export const generateDayPlanRequestSchema = z.object({
  plan_date: z.iso.date(),
  prompt: z.string().min(1).max(PROMPT_MAX),
  // Carries the teacher's answer to "this deletes the current proposals and
  // withdraws your acceptance". Defaults to false so an older client, or a
  // request that simply omits it, gets the refusal rather than the deletion -
  // the schema enforces it either way (`save_day_plan_generation`, U0001).
  confirm_replace: z.boolean().default(false),
});

export type GenerateDayPlanRequest = z.infer<typeof generateDayPlanRequestSchema>;

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
