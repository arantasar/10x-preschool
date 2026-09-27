import { workingDaysOf } from "@/lib/day-plan-dates";
import type { Activity, DayPlanView } from "@/types";

/**
 * Plans for the plan-pdf tests. Not a `*.test.ts` file, so vitest does not
 * collect it; shared by the model, layout and render suites.
 */

export const WEEK_START = "2026-09-14";
export const WEEK_DAYS_ISO = workingDaysOf(WEEK_START);

const SENTENCE_WORDS = "Dzieci siedzą w kole i opowiadają o jesieni, pokazując liście zebrane w parku".split(" ");

/** Prose of exactly `length` characters, made of ordinary words so wrapping behaves as it would on a real plan. */
export function prose(length: number): string {
  let text = "";
  for (let index = 0; text.length < length; index++) {
    text += (text === "" ? "" : " ") + SENTENCE_WORDS[index % SENTENCE_WORDS.length];
  }
  return text.slice(0, length);
}

interface ViewOptions {
  readonly acceptedAt?: string | null;
  readonly theme?: string | null;
  readonly prompt?: string;
  readonly descriptionLength?: number;
  readonly activities?: readonly { title: string; description: string }[];
}

export function planView(planDate: string, options: ViewOptions = {}): DayPlanView {
  const activities =
    options.activities ??
    [1, 2, 3].map((ordinal) => ({
      title: `Zabawa ${ordinal}: spacer po parku`,
      description: prose(options.descriptionLength ?? 400),
    }));
  return {
    plan: {
      id: `plan-${planDate}`,
      user_id: "user",
      plan_date: planDate,
      prompt: options.prompt ?? "Jesień w parku",
      theme: options.theme === undefined ? "Liście i kasztany" : options.theme,
      accepted_at: options.acceptedAt === undefined ? null : options.acceptedAt,
      current_generation: 1,
      created_at: "2026-09-10T08:00:00Z",
      updated_at: "2026-09-10T08:00:00Z",
    },
    activities: activities.map(
      (activity, index): Activity => ({
        id: `activity-${planDate}-${index}`,
        plan_id: `plan-${planDate}`,
        user_id: "user",
        generation: 1,
        ordinal: index + 1,
        created_at: "2026-09-10T08:00:00Z",
        title: activity.title,
        description: activity.description,
      }),
    ),
  };
}

/** Every working day planned alike. */
export function fullWeek(options: ViewOptions = {}): Record<string, DayPlanView> {
  return Object.fromEntries(WEEK_DAYS_ISO.map((date) => [date, planView(date, options)]));
}
