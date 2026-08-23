import type { APIRoute } from "astro";
import { acceptPlanRequestSchema } from "@/lib/services/day-plan-contract";
import { badRequest, json, requireSaved, storeFailure, unauthorized, unconfigured } from "@/lib/services/day-plan-http";
import { readDayPlanById, setAcceptance } from "@/lib/services/day-plan-store";

export const prerender = false;

/**
 * Accepts a day plan, or withdraws an acceptance (FR-009).
 *
 * One route and a boolean rather than two routes: withdrawing is the same fact
 * with the other value, and the teacher's own edit already withdraws it from the
 * database side. Keeping both paths writing one column one way is what stops the
 * two from drifting.
 *
 * The `accepted_at` the island renders is the one read back from the row, never
 * the timestamp this route sent - and certainly never the browser's clock.
 *
 * `expected_generation` makes the write conditional on the caller having seen the
 * batch they are signing off on. Without it a stale tab could put an acceptance
 * on proposals that replaced the ones on its screen.
 */
export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return unauthorized();
  }

  const supabase = context.locals.supabase;
  if (!supabase) {
    return unconfigured();
  }

  let payload: unknown;
  try {
    payload = await context.request.json();
  } catch {
    return badRequest("Nieprawidłowe żądanie.");
  }

  const parsed = acceptPlanRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return badRequest("Nieprawidłowe żądanie.");
  }

  try {
    await setAcceptance(supabase, parsed.data.plan_id, parsed.data.accepted, parsed.data.expected_generation);
    return json(requireSaved(await readDayPlanById(supabase, parsed.data.plan_id), parsed.data.plan_id), 200);
  } catch (error) {
    return storeFailure(error);
  }
};
