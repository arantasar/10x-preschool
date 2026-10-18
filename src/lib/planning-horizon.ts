import { addDays, addMonths, resolveWeekStart, todayIsoDate } from "@/lib/day-plan-dates";

/**
 * Which days a teacher may *generate* a plan for (S-31).
 *
 * The window runs from the start of the previous month to the end of the next
 * one, both counted from today in Europe/Warsaw, and padded on each side to a
 * whole week (Monday to Sunday). The padding is what keeps a working week either
 * entirely inside the window or entirely outside it, so the week board never
 * has a week with some days locked.
 *
 * Saved plans are not affected: viewing, editing, refining, accepting, deleting
 * and printing know nothing about this module. Only the routes that put a model
 * behind a date ask it - and the pages ask the same function, so what the page
 * says and what the server refuses cannot drift apart.
 *
 * A constant in code, not configuration: it is a product rule, and a merge to
 * `master` is already a deploy.
 */

export type HorizonRefusal =
  | { readonly kind: "too_far"; readonly opensOn: string }
  | { readonly kind: "too_old"; readonly firstAllowed: string };

export type HorizonScope = "day" | "week";

/** The first and last day (inclusive) a plan may be generated for, seen from `today`. */
export function generationWindow(today: string): { first: string; last: string } {
  const month = today.slice(0, 7);
  const first = resolveWeekStart(addMonths(month, -1));
  const lastOfNextMonth = addDays(addMonths(month, 2), -1);
  const last = addDays(resolveWeekStart(lastOfNextMonth), 6);
  return { first, last };
}

/**
 * The first of the earliest month from which `date` falls inside the window.
 *
 * The window depends only on today's month, so the answer is always a first of
 * the month. A month's window covers the whole of the month after it, plus at
 * most six padding days of the one after that - which leaves two candidates,
 * two months before `date` and one month before it.
 */
function opensOn(date: string): string {
  const month = date.slice(0, 7);
  const earlier = addMonths(month, -2);
  return generationWindow(earlier).last >= date ? earlier : addMonths(month, -1);
}

/**
 * `null` when every date may be generated today, the refusal otherwise.
 *
 * With dates on both sides of the window, `too_far` wins: its `opensOn` tells
 * the teacher when to come back, while `too_old` only tells her she cannot. The
 * furthest date decides `opensOn`, because the whole set opens only when the
 * last of it does.
 */
export function checkGenerationDates(dates: readonly string[], today: string = todayIsoDate()): HorizonRefusal | null {
  const { first, last } = generationWindow(today);

  let furthest: string | null = null;
  let tooOld = false;
  for (const date of dates) {
    if (date > last && (furthest === null || date > furthest)) {
      furthest = date;
    } else if (date < first) {
      tooOld = true;
    }
  }

  if (furthest !== null) {
    return { kind: "too_far", opensOn: opensOn(furthest) };
  }
  if (tooOld) {
    return { kind: "too_old", firstAllowed: first };
  }
  return null;
}

// Genitive month with the year - `1 grudnia 2026` - which is what `pl-PL` gives
// for day + long month + year. Read in UTC: the input is a calendar date.
const HORIZON_DATE_FORMAT = new Intl.DateTimeFormat("pl-PL", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function formatHorizonDate(isoDate: string): string {
  return HORIZON_DATE_FORMAT.format(new Date(`${isoDate}T00:00:00Z`));
}

/** The sentence a teacher reads - in the route's 422 and in the page's notice alike. */
export function horizonMessage(refusal: HorizonRefusal, scope: HorizonScope): string {
  if (refusal.kind === "too_far") {
    const subject = scope === "day" ? "Ten dzień" : "Ten tydzień";
    return `${subject} będzie można zaplanować od ${formatHorizonDate(refusal.opensOn)}.`;
  }
  const earlier = scope === "day" ? "wcześniejsze dni" : "wcześniejsze tygodnie";
  return `Plany można generować od ${formatHorizonDate(refusal.firstAllowed)} — ${earlier} możesz przeglądać, poprawiać i drukować, ale nie generować.`;
}
