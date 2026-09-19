import type { APIRoute } from "astro";
import { saveWeekPlanRequestSchema } from "@/lib/services/day-plan-contract";
import { readWeekPlans, saveWeekGeneration } from "@/lib/services/day-plan-store";
import { badRequest, json, storeFailure, unauthorized, unconfigured } from "@/lib/services/day-plan-http";
import type { DayPlanView } from "@/types";

export const prerender = false;

/**
 * Commits a completed set of week batches as **one transaction**.
 *
 * The all-or-nothing half of `S-09`. Either every targeted day carries the new
 * hasło or none does, and that guarantee lives in
 * `save_week_plan_generation` - the only place a transaction spanning five days
 * can exist, since PostgREST gives the client none. This route is the door to
 * it and nothing more: it validates, calls, and reads back.
 *
 * **It must be called once, with the whole set.** Calling it per day as batches
 * arrive would reintroduce exactly the partial week the RPC exists to prevent -
 * the transaction would be one day wide again. The island holds every batch
 * until the set is complete; that ordering is a correctness condition, not a
 * preference.
 *
 * **The batches are client-supplied and are validated as such.** They travel
 * from `week/day.ts` through the island's memory before arriving here, so
 * `saveWeekPlanRequestSchema` holds them to the same bounds the single-day path
 * enforces - `ACTIVITY_COUNT` per day, the title and description CHECKs, the
 * single-line hasło. Same trust boundary `/api/day-plan/activity/[id]` has for
 * FR-008 edits, and no new one: content safety has never been a runtime filter
 * in this project, it is a CI gate over the prompts.
 *
 * `confirm_replace` is hard-coded `false`. Accepted days are out of reach in
 * this slice (FR-013 is `S-10`), so the writer refuses any accepted day in the
 * set with `U0001`, which surfaces here as a `409`. The island's confirmation
 * dialog is what makes that refusal rare; it is not what makes it safe - the
 * island's `accepted_at` can be stale, and the writer's `for update` is the
 * thing that cannot be.
 */

/**
 * The written days, read back from the database rather than echoed.
 *
 * `Partial` is load-bearing for the same reason it is on `WeekPlanView.plans`:
 * without it the index signature promises a `DayPlanView` for every string, and
 * the island's check for a day the write did not return reads to the compiler
 * as dead code.
 */
export interface SaveWeekResponse {
  readonly plans: Readonly<Partial<Record<string, DayPlanView>>>;
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

  const parsed = saveWeekPlanRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return badRequest("Nieprawidłowy zestaw dni do zapisania.");
  }

  const supabase = context.locals.supabase;
  if (!supabase) {
    return unconfigured();
  }

  try {
    await saveWeekGeneration(supabase, {
      prompt: parsed.data.prompt,
      days: parsed.data.days,
      // Never `true` in this slice. The parameter exists so `S-10` (FR-013)
      // flips a boolean instead of rewriting the writer.
      confirm_replace: false,
    });

    // Read back rather than echoing the request: the response is what the board
    // replaces its rows from, and the request is the island's own optimism.
    // Only `current_generation`, `accepted_at` and the stored theme can say
    // what actually landed.
    const saved = await readWeekPlans(
      supabase,
      parsed.data.days.map((day) => day.plan_date),
    );

    const body: SaveWeekResponse = { plans: Object.fromEntries(saved) };
    return json({ ...body }, 200);
  } catch (error) {
    // A `U0001` from an accepted day arrives here as `conflict` -> 409, with the
    // refused `plan_date` carried in the logged message by `toStoreError`.
    return storeFailure(error);
  }
};
