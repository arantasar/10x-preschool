import type { APIRoute } from "astro";
import { GenerationError, refineActivity } from "@/lib/services/activity-generator";
import { refineActivityRequestSchema } from "@/lib/services/day-plan-contract";
import { badRequest, generationFailure, json, unauthorized, unconfigured } from "@/lib/services/day-plan-http";
import type { ActivityDraft } from "@/types";

export const prerender = false;

/**
 * Rewrites one activity on the teacher's instruction and hands it back
 * **unsaved** (`follow-up-questions`).
 *
 * The same "proposal without a row" shape `week/day.ts` introduced: the result
 * lands in the teacher's open draft, and the save is the existing
 * `PATCH /api/day-plan/activity/[id]` - which already carries the confirm on an
 * accepted day, the acceptance trigger and the "Akceptuj ponownie" banner. A
 * route that wrote here would have to repeat all of that, and would overwrite
 * a description with no undo (PRD v2).
 *
 * **No `id`, and no read of the stored activity, deliberately.** The
 * instruction applies to the draft the teacher is looking at, which may already
 * hold an earlier unsaved result - that is what lets them iterate ("now shorten
 * it to two verses"). Reading the stored row would refine text they have moved
 * past, and nothing here is written, so there is no row whose ownership needs
 * checking. The save route checks it under RLS when the teacher clicks "Zapisz".
 *
 * Session is checked here rather than in `src/middleware.ts` for the reason
 * `day-plan-http.ts` records: this route is called with `fetch`.
 */

/** What the island puts back into the draft. */
export type RefinedActivityResponse = ActivityDraft;

const TOO_LONG_MESSAGE =
  "Poprawiona aktywność wyszła za długa — opis może mieć do 4000 znaków. Spróbuj węższego polecenia.";

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

  const parsed = refineActivityRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return badRequest("Polecenie to jedna linia tekstu, do 500 znaków; tytuł do 200, opis do 4000 znaków.");
  }

  // Nothing here touches Supabase, and the check stays anyway, for the reason
  // `week/day.ts` gives: the proposal only matters if it can be saved, and a
  // teacher whose database is unreachable should not pay for it first.
  if (!context.locals.supabase) {
    return unconfigured();
  }

  try {
    const refined = await refineActivity(
      { title: parsed.data.title, description: parsed.data.description },
      parsed.data.instruction,
    );

    const body: RefinedActivityResponse = refined.activity;
    return json({ ...body }, 200);
  } catch (error) {
    // Already logged by `refineActivity` with its status and errorType. The one
    // invalid answer with a cause the teacher can act on gets its own sentence.
    const tooLong = error instanceof GenerationError && error.errorType === "description_too_long";
    return generationFailure(error, tooLong ? TOO_LONG_MESSAGE : undefined);
  }
};
