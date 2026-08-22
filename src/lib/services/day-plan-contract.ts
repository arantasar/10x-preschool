import { z } from "zod";
import type { ActivityDraft } from "@/types";
import { ACTIVITY_COUNT, DESCRIPTION_MAX, PROMPT_MAX, TITLE_MAX } from "@/lib/day-plan-limits";

// The bounds live in `@/lib/day-plan-limits` because the React island needs them
// too and must not pull zod into the client bundle. See that module for why they
// are what they are.

export { ACTIVITY_COUNT };

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
});

export type GenerateDayPlanRequest = z.infer<typeof generateDayPlanRequestSchema>;
