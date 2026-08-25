import { WEEK_DAYS } from "@/lib/day-plan-limits";

/**
 * Which day `/plan` is showing.
 *
 * S-03 added the week and the month to what "which day" can mean, but the rule
 * is unchanged: whatever the URL says, one function decides what it resolves to.
 *
 * This moved out of the island in S-02 because the server now needs it too: the
 * page resolves `?date=` before rendering, so a saved plan is on screen in the
 * first paint rather than after a fetch. Both sides must agree on what "today"
 * and "a valid date" mean, and a copied implementation is exactly the kind of
 * thing that drifts silently.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_MONTH = /^\d{4}-\d{2}$/;

/**
 * Today as the *teacher* reckons it, not as the server does.
 *
 * `new Date().toISOString().slice(0, 10)` is UTC, and this runs on Cloudflare
 * Workers, whose clock is UTC with no request-time knowledge of where the caller
 * is. For a teacher in Poland that is wrong for the first two hours after
 * midnight: at 00:30 CEST it is still the previous day in UTC, so the page would
 * open on yesterday.
 *
 * Europe/Warsaw is hard-coded rather than guessed, and that is a product
 * decision showing through: the PRD, the prompt and every string in this app are
 * Polish, for Polish preschools. If that ever stops being true, this is the line
 * that has to learn about time zones properly - not a `?date=` default sprinkled
 * through the callers.
 */
export function todayIsoDate(): string {
  // en-CA formats as YYYY-MM-DD, which is the shape we want; `sv-SE` would do
  // as well. Neither is a locale choice - both are just ISO-shaped output.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(new Date());
}

/**
 * The day a request is asking for: `?date=YYYY-MM-DD` when it is a real date,
 * today otherwise.
 *
 * Falls back rather than erroring, because a mistyped query string is not worth
 * an error page - the teacher gets today and a date picker. The round-trip check
 * is what rejects a well-shaped impossibility like `2026-02-31`, which the regex
 * alone would wave through and Postgres would then refuse.
 */
export function resolvePlanDate(value: string | null | undefined): string {
  if (!value || !ISO_DATE.test(value)) {
    return todayIsoDate();
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return todayIsoDate();
  }
  return value;
}

/** `2026-09-14` as `poniedziałek, 14 września 2026`. For headings, not inputs. */
export function formatPlanDate(isoDate: string): string {
  return new Intl.DateTimeFormat("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

/**
 * The same calendar date, shifted by whole days.
 *
 * UTC throughout, which is what makes it safe: these are calendar dates, not
 * instants, so there is no local midnight to fall the wrong side of and no DST
 * transition to lose an hour to. `Europe/Warsaw` matters when deciding *which*
 * day today is ({@link todayIsoDate}); it does not matter when counting days
 * forward from one.
 */
function addDays(isoDate: string, days: number): string {
  const shifted = new Date(`${isoDate}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

/**
 * The Monday of the week a date falls in - the day `/plan/week?from=` names.
 *
 * Any date in the week resolves to the same Monday, so a link built from
 * Thursday and one built from Monday open the same page. That is deliberate:
 * the month grid links a whole row to one week, and `?from=` should not be a
 * value the caller has to get exactly right.
 *
 * Falls back to the current week rather than erroring, for the reason
 * {@link resolvePlanDate} does - it is the function this delegates that decision
 * to, so a mistyped query string means "this week", never an error page.
 */
export function resolveWeekStart(value: string | null | undefined): string {
  const date = resolvePlanDate(value);
  // getUTCDay(): 0 is Sunday. `(day + 6) % 7` turns that into days since Monday,
  // which is what makes Sunday belong to the week that is ending rather than the
  // one about to start.
  const daysSinceMonday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(date, -daysSinceMonday);
}

/**
 * The five working days of a week, Monday first.
 *
 * Weekends are absent by definition, not by filtering: S-03 generates the
 * working week, and a teacher who needs a Saturday plans it from `/plan?date=`.
 */
export function workingDaysOf(weekStart: string): string[] {
  return Array.from({ length: WEEK_DAYS }, (_unused, index) => addDays(weekStart, index));
}

/** `2026-09` — the month `/plan/month?month=` names. Falls back to this month. */
export function resolveMonth(value: string | null | undefined): string {
  if (value && ISO_MONTH.test(value)) {
    const month = Number(value.slice(5, 7));
    if (month >= 1 && month <= 12) {
      return value;
    }
  }
  return todayIsoDate().slice(0, 7);
}

/**
 * The Mondays of every week that touches a month - the rows of the month grid.
 *
 * Weeks, not days, because the grid's unit of action is a week: each row links
 * to `/plan/week?from=`. A month spans five or six such rows and the first and
 * last routinely reach into the neighbouring months, which is why this is
 * derived rather than assumed.
 */
export function weeksOfMonth(month: string): string[] {
  const firstDay = `${month}-01`;
  const lastDay = addDays(addMonths(month, 1), -1);
  const weeks: string[] = [];
  for (let monday = resolveWeekStart(firstDay); monday <= lastDay; monday = addDays(monday, 7)) {
    weeks.push(monday);
  }
  return weeks;
}

/** `2026-09` shifted by whole months, as the first of that month. */
export function addMonths(month: string, months: number): string {
  const shifted = new Date(`${month}-01T00:00:00Z`);
  shifted.setUTCMonth(shifted.getUTCMonth() + months);
  return shifted.toISOString().slice(0, 10).slice(0, 7) + "-01";
}

/** `2026-09` as `wrzesień 2026`. For headings, not inputs. */
export function formatMonth(month: string): string {
  return new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${month}-01T00:00:00Z`),
  );
}

/**
 * The working week as `14–18 września 2026`, or `28 września – 2 października
 * 2026` when it straddles two months.
 *
 * The two forms exist because the short one is a lie across a month boundary,
 * and a week heading that says `28–2 września` is worse than a long one.
 */
export function formatWeekRange(weekStart: string): string {
  const days = workingDaysOf(weekStart);
  const first = days[0];
  const last = days[days.length - 1];
  const sameMonth = first.slice(0, 7) === last.slice(0, 7);

  const dayOnly = new Intl.DateTimeFormat("pl-PL", { day: "numeric", timeZone: "UTC" });
  const dayAndMonth = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", timeZone: "UTC" });
  const full = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

  const start = sameMonth
    ? dayOnly.format(new Date(`${first}T00:00:00Z`))
    : dayAndMonth.format(new Date(`${first}T00:00:00Z`));
  return `${start} – ${full.format(new Date(`${last}T00:00:00Z`))}`;
}

/**
 * `2026-09-14` as `poniedziałek`. For the week board's headings and, more to the
 * point, for the model: a day generation is told which day of the week it is
 * planning, so five days from one hasło can differ by more than the roll of the
 * temperature.
 *
 * Pinned to UTC like {@link formatPlanDate} and for the same reason — the input
 * is a calendar date, not an instant, and reading it in the worker's zone would
 * shift it.
 */
export function weekdayLabel(isoDate: string): string {
  return new Intl.DateTimeFormat("pl-PL", { weekday: "long", timeZone: "UTC" }).format(
    new Date(`${isoDate}T00:00:00Z`),
  );
}

/**
 * When a plan was accepted, as `23 sierpnia, 11:31`.
 *
 * The time zone is pinned for the same reason as in {@link todayIsoDate}, but
 * here the cost of leaving it out is sharper than an off-by-one day: this string
 * is rendered on the server *and* re-rendered during hydration. Workers run in
 * UTC and the teacher's browser does not, so an unpinned formatter prints 09:31
 * server-side and 11:31 a moment later - a hydration mismatch, and two hours
 * wrong until React patches it.
 *
 * The timestamp itself comes from the database. Only its rendering is decided
 * here.
 */
export function formatAcceptedAt(acceptedAt: string): string {
  return new Intl.DateTimeFormat("pl-PL", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Warsaw",
  }).format(new Date(acceptedAt));
}
