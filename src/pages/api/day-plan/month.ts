import type { APIRoute } from "astro";
import { z } from "zod";

import { workingDaysOfMonth } from "@/lib/day-plan-dates";
import { badRequest, json, storeFailure, unauthorized, unconfigured } from "@/lib/services/day-plan-http";
import { readWeekPlans } from "@/lib/services/day-plan-store";
import type { MonthPlansBody } from "@/types";

export const prerender = false;

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

/**
 * Every saved plan, with its current activities, among one month's working
 * days - the data of the month print (`S-14`, FR-021).
 *
 * Called when the teacher clicks "Pobierz PDF" on `/plan/month`, never while
 * the page loads. PRD §Non-Goals rules out fetching a whole month up front; that
 * is about the day preview (`S-07`), which reads one day when it is opened. A
 * print is asked for, and reads what it prints at that moment.
 *
 * The client names a month, not a list of days: the route works the days out
 * itself with {@link workingDaysOfMonth}, so no request can widen the read past
 * one month, or into a neighbouring month's edge days. Which teacher's plans
 * come back is RLS's business, as for `readWeekPlans` in `week.astro` - there is
 * no `user_id` filter here to get wrong.
 *
 * Gate order as in `index.ts`: session, client, parameter.
 */
export const GET: APIRoute = async (context) => {
  if (!context.locals.user) {
    return unauthorized();
  }

  const supabase = context.locals.supabase;
  if (!supabase) {
    return unconfigured();
  }

  const parsed = monthSchema.safeParse(context.url.searchParams.get("month"));
  if (!parsed.success) {
    return badRequest("Podaj poprawny miesiąc.");
  }

  try {
    const saved = await readWeekPlans(supabase, workingDaysOfMonth(parsed.data));
    const body: MonthPlansBody = { month: parsed.data, plans: Object.fromEntries(saved) };
    return json({ ...body }, 200);
  } catch (error) {
    return storeFailure(error);
  }
};
