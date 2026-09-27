import { workingDaysOfMonth } from "@/lib/day-plan-dates";
import type { DayPlanView } from "@/types";

import { planView } from "./week";

/**
 * Months for the plan-pdf tests. Not a `*.test.ts` file, so vitest does not
 * collect it.
 *
 * September 2026 starts on a Tuesday and ends on a Wednesday, so its first grid
 * row opens with Monday 31 August and its last closes with 1-2 October - both
 * edges of the "slot outside the month" case in one month. December 2026 has 23
 * working days, the most a month can have.
 */

export const MONTH = "2026-09";
export const MONTH_DAYS_ISO = workingDaysOfMonth(MONTH);
export const LONGEST_MONTH = "2026-12";

type ViewOptions = Parameters<typeof planView>[1];

/** Every working day of `month` planned alike. */
export function fullMonth(month: string = MONTH, options: ViewOptions = {}): Record<string, DayPlanView> {
  return Object.fromEntries(workingDaysOfMonth(month).map((date) => [date, planView(date, options)]));
}
