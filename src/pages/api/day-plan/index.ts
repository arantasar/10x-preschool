import type { APIRoute } from "astro";
import { json, storeFailure, unauthorized, unconfigured, badRequest } from "@/lib/services/day-plan-http";
import { readDayPlan, StoreError } from "@/lib/services/day-plan-store";
import { z } from "zod";

export const prerender = false;

const planDateSchema = z.iso.date();

/**
 * Reads one day, for the island to reconcile against after a failed mutation.
 *
 * `plan.astro` does this read server-side on every page load, and for the happy
 * path that is enough - each mutation answers with the whole plan, so the island
 * never has to ask. This route exists for the one case where it does: a write
 * whose outcome the island does not know. `saveGeneration` retries once and is
 * knowingly not idempotent, so a lost response can leave a batch committed that
 * the screen has never shown. Offering "Spróbuj ponownie" over a stale view then
 * invites the teacher to pay for a second generation of a day that already has
 * one.
 *
 * Read-only, so unlike the mutating routes there is no zod-validated body - just
 * the day, held to the same shape `plan.astro` accepts.
 */
export const GET: APIRoute = async (context) => {
  if (!context.locals.user) {
    return unauthorized();
  }

  const supabase = context.locals.supabase;
  if (!supabase) {
    return unconfigured();
  }

  const parsed = planDateSchema.safeParse(context.url.searchParams.get("date"));
  if (!parsed.success) {
    return badRequest("Podaj poprawną datę.");
  }

  try {
    const saved = await readDayPlan(supabase, parsed.data);
    // A day with no plan is a fact, not a failure - but the success body has no
    // way to say "nothing here", so it is spelled 404 and the island reads it as
    // "this day is empty" rather than as an error to show.
    if (!saved) {
      throw new StoreError("not_found", `No plan for ${parsed.data}.`, {
        userMessage: "Ten dzień nie ma jeszcze planu.",
      });
    }
    return json(saved, 200);
  } catch (error) {
    return storeFailure(error);
  }
};
