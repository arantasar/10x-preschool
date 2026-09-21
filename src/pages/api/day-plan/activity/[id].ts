import type { APIRoute } from "astro";
import { updateActivityRequestSchema } from "@/lib/services/day-plan-contract";
import { badRequest, json, requireSaved, storeFailure, unauthorized, unconfigured } from "@/lib/services/day-plan-http";
import { readDayPlanById, updateActivityText } from "@/lib/services/day-plan-store";
import { z } from "zod";

export const prerender = false;

const activityIdSchema = z.uuid();

/**
 * Rewrites the title and description of one proposal (FR-008).
 *
 * Granularity is one activity and one Save button, not the whole batch. That is
 * what makes Cancel mean something: the teacher's previous text is still on the
 * server until they choose otherwise, which an autosaving editor could not
 * promise.
 *
 * Authorization is RLS's, not this route's. A row belonging to another account
 * is invisible rather than forbidden, so the update touches nothing and the
 * answer is 404 - "not yours" would confirm the row exists.
 */
export const PATCH: APIRoute = async (context) => {
  if (!context.locals.user) {
    return unauthorized();
  }

  const supabase = context.locals.supabase;
  if (!supabase) {
    return unconfigured();
  }

  const activityId = activityIdSchema.safeParse(context.params.id);
  if (!activityId.success) {
    return badRequest("Nieprawidłowy identyfikator propozycji.");
  }

  let payload: unknown;
  try {
    payload = await context.request.json();
  } catch {
    return badRequest("Nieprawidłowe żądanie.");
  }

  // The same bounds the CHECK constraints hold, read from `day-plan-limits`.
  const parsed = updateActivityRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return badRequest("Tytuł może mieć do 200 znaków, a opis do 4000. Oba są wymagane.");
  }

  try {
    const { planId, wasAccepted } = await updateActivityText(supabase, activityId.data, parsed.data);
    // The plan comes back too, not just the activity: the edit clears
    // `accepted_at` by trigger, and the island must see both facts at once or it
    // will keep rendering a plan it thinks is still accepted.
    //
    // `acceptance_cleared` is the second half of that: the plan alone says the
    // day is a draft now, not that *this* save is what made it one. The island
    // could only guess that from its own `accepted_at`, and a stale copy would
    // guess wrong in exactly the case FR-017 exists for - so the answer comes
    // from what the server read a moment before the write, not from the browser.
    const saved = requireSaved(await readDayPlanById(supabase, planId), planId);
    return json({ ...saved, acceptance_cleared: wasAccepted }, 200);
  } catch (error) {
    return storeFailure(error);
  }
};
