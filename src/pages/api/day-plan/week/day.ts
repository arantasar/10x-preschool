import type { APIRoute } from "astro";
import { generateDayActivities } from "@/lib/services/activity-generator";
import { generateWeekDayRequestSchema } from "@/lib/services/day-plan-contract";
import { badRequest, generationFailure, json, unauthorized, unconfigured } from "@/lib/services/day-plan-http";
import type { ActivityDraft } from "@/types";

export const prerender = false;

/**
 * Generates one day of a week run and hands the batch back **unsaved**.
 *
 * This is the state `/api/day-plan/generate` deliberately declares does not
 * exist ("a proposal without a row"), and it is introduced here rather than as
 * a flag on that route so that route's invariant survives intact: it still
 * always writes, and nothing about it changes.
 *
 * The reason the state has to exist at all is atomicity. Replacing a week is
 * all-or-nothing (FR-012, guardrail #3), and "all" cannot be known until every
 * targeted day has generated. A route that wrote as it went would leave three
 * days replaced and two on their old batch the moment the fourth call failed -
 * which is exactly the outcome `S-09` exists to remove. So the island holds the
 * batches and `week/save.ts` commits them in one transaction.
 *
 * What this route gives up in exchange is honest and bounded: proposals live
 * only in browser memory until the write, so closing the tab loses them. No row
 * was touched, so nothing is inconsistent - but the board has to say so rather
 * than let it be discovered.
 *
 * **No pre-check against the stored plan, deliberately.** `generate.ts` reads
 * the day first to avoid paying for a generation the writer would refuse; here
 * there is nothing to refuse, because nothing is written. The accepted-day
 * refusal belongs to `week/save.ts` and to `save_week_plan_generation` beneath
 * it, which is where the teacher's acceptance is actually at risk.
 *
 * Session is checked here rather than in `src/middleware.ts` for the reason
 * `day-plan-http.ts` records: this route is called with `fetch`, and a redirect
 * would arrive as a JSON parse error instead of "your session expired".
 */

/** What the island holds until the week is complete. */
export interface GeneratedDayResponse {
  readonly plan_date: string;
  /** Echoed back so the island does not have to re-pair themes with dates. */
  readonly theme: string | null;
  readonly activities: readonly ActivityDraft[];
}

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return unauthorized();
  }

  let payload: unknown;
  try {
    payload = await context.request.json();
  } catch {
    return badRequest("Nieprawidłowe żądanie.");
  }

  const parsed = generateWeekDayRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return badRequest("Podaj poprawną datę oraz hasło — jedna linia tekstu, od 1 do 2000 znaków.");
  }

  // Nothing here touches Supabase, and the check stays anyway, for the reason
  // `week/outline.ts` gives: a teacher whose database is unreachable cannot
  // store what this generation leads to, and letting them pay for up to five
  // generations first would be the expensive way to find that out.
  if (!context.locals.supabase) {
    return unconfigured();
  }

  try {
    const generated = await generateDayActivities(parsed.data.prompt, {
      planDate: parsed.data.plan_date,
      theme: parsed.data.theme,
    });

    const body: GeneratedDayResponse = {
      plan_date: parsed.data.plan_date,
      theme: parsed.data.theme ?? null,
      activities: generated.activities,
    };
    return json({ ...body }, 200);
  } catch (error) {
    // Already logged by `generateDayActivities` with its status and errorType.
    return generationFailure(error);
  }
};
