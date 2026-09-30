import { workingDaysOf, workingDaysOfMonth } from "@/lib/day-plan-dates";
import type { DayPlanSummary } from "@/types";

/**
 * The text the month grid and its day preview put on screen and in the
 * accessibility tree.
 *
 * It used to live in `MonthGrid.astro`'s frontmatter. It moved here when the
 * grid became a React island (`S-07`): the island needs it, and a module is
 * where it can be tested - the island itself cannot be rendered in this suite.
 * Imports only date arithmetic and a type, so the island can carry it.
 */

export function dayNumber(isoDate: string): string {
  return String(Number(isoDate.slice(8, 10)));
}

/**
 * Cuts `text` to at most `max` characters, ending in an ellipsis when it had to.
 *
 * The trailing whitespace is trimmed before the ellipsis, so a cut that lands
 * right after a space does not read as "słowo …".
 */
export function clipText(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * How much of the hasło or the theme the accessible name carries.
 *
 * The preview card is bounded by the screen and by the reader moving on; a
 * screen reader reading the tile's name is bounded by neither, and reads the
 * whole name before the teacher can act on the tile. `PROMPT_MAX` is 2000 and nothing narrower stands
 * between the textarea and this string, so the bound has to live here.
 */
export const LABEL_PART_MAX = 80;

export function clipForLabel(text: string): string {
  return clipText(text, LABEL_PART_MAX);
}

/**
 * How much of an activity description the day preview shows.
 *
 * Bounded in the text and not only by `line-clamp`: the preview is the tile's
 * `aria-describedby`, and CSS clipping leaves the whole description - up to
 * `DESCRIPTION_MAX`, three times over - in the DOM for a screen reader to read.
 * The same reason `LABEL_PART_MAX` exists.
 */
export const PREVIEW_DESCRIPTION_MAX = 160;

export function joinText(prompt: string, theme: string | null): string {
  return theme === null ? prompt : `${prompt} — ${theme}`;
}

/**
 * The tile's accessible name: which day, what is on it, and what state it is in.
 *
 * The content sits before the state on purpose - a teacher tabbing across a
 * planned week wants to hear which day is which, and "zatwierdzony" is the
 * qualifier on that, not the headline. Each member is clipped: the name is read
 * aloud in full, so an unbounded hasło would bury the state at the end of a
 * paragraph. The day preview keeps the untruncated theme.
 */
export function tileLabel(isoDate: string, summary: DayPlanSummary | undefined): string {
  if (!summary) {
    return `Plan na ${isoDate} — brak planu`;
  }
  const content = joinText(clipForLabel(summary.prompt), summary.theme === null ? null : clipForLabel(summary.theme));
  return `Plan na ${isoDate} — ${content} — ${summary.accepted ? "zatwierdzony" : "do przejrzenia"}`;
}

/** One cell of a row: a working day, in the month or not, planned or not. */
export interface MonthGridDay {
  readonly date: string;
  /** `false` for a day of a neighbouring month - rendered as a blank, never as a link. */
  readonly inMonth: boolean;
  readonly summary: DayPlanSummary | undefined;
}

/** One week of the month grid: Monday to Friday, with what its row header says. */
export interface MonthGridRow {
  readonly monday: string;
  /** The row's working days that lie in the month: „5–9 października", „1–2 października". */
  readonly rangeLabel: string;
  /** The week's hasła, or `null` when nothing is planned - the UI then says „Bez tematu". */
  readonly heading: string | null;
  /** No working day of the row that lies in the month has a plan. */
  readonly isEmpty: boolean;
  readonly days: readonly MonthGridDay[];
}

function dayAndMonth(isoDate: string): string {
  return new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${isoDate}T00:00:00Z`),
  );
}

/**
 * The rows of the month grid, Monday to Friday.
 *
 * `weeks` comes from `weeksOfMonth`, which counts a week as touching the month
 * when any of its seven days does. A month that starts at a weekend therefore
 * gets a first week whose working days all lie in the month before (August 2026
 * opens with 27-31 July) - that row is dropped here, since it would be a row of
 * five blanks. It is also what caps the grid at five rows.
 *
 * Everything the row header says is computed from the row's in-month working
 * days only: a plan on 30 September must not name the first week of October.
 */
export function monthRows(
  month: string,
  weeks: readonly string[],
  summaries: readonly DayPlanSummary[],
): MonthGridRow[] {
  const byDate = new Map(summaries.map((summary) => [summary.plan_date, summary]));
  const rows: MonthGridRow[] = [];

  for (const monday of weeks) {
    const days = workingDaysOf(monday).map((date) => ({
      date,
      inMonth: date.slice(0, 7) === month,
      summary: byDate.get(date),
    }));
    const ours = days.filter((day) => day.inMonth);
    if (ours.length === 0) {
      continue;
    }

    const first = ours[0].date;
    const last = ours[ours.length - 1].date;
    const rangeLabel = first === last ? dayAndMonth(last) : `${dayNumber(first)}–${dayAndMonth(last)}`;

    // Distinct hasła in the order the week first uses them. Clipped one by one,
    // for the reason `LABEL_PART_MAX` exists: the heading is part of the row
    // link's accessible name.
    const prompts: string[] = [];
    for (const day of ours) {
      if (day.summary && !prompts.includes(day.summary.prompt)) {
        prompts.push(day.summary.prompt);
      }
    }

    rows.push({
      monday,
      rangeLabel,
      heading: prompts.length === 0 ? null : prompts.map(clipForLabel).join(", "),
      isEmpty: prompts.length === 0,
      days,
    });
  }
  return rows;
}

/** The accessible name of a row header: which week, and what it is about. */
export function weekLinkLabel(row: MonthGridRow): string {
  return `Tydzień ${row.rangeLabel} — ${row.heading ?? "bez tematu"}`;
}

export interface MonthCounts {
  readonly accepted: number;
  readonly draft: number;
  readonly empty: number;
}

/** The legend's numbers: the month's working days by state. Weekends are not counted. */
export function monthCounts(month: string, summaries: readonly DayPlanSummary[]): MonthCounts {
  const byDate = new Map(summaries.map((summary) => [summary.plan_date, summary]));
  const counts = { accepted: 0, draft: 0, empty: 0 };
  for (const date of workingDaysOfMonth(month)) {
    const summary = byDate.get(date);
    if (!summary) {
      counts.empty += 1;
    } else if (summary.accepted) {
      counts.accepted += 1;
    } else {
      counts.draft += 1;
    }
  }
  return counts;
}

/** „1 zatwierdzony" / „3 zatwierdzone" / „10 zatwierdzonych" - a month runs to 23, so 22-24 matter. */
export function acceptedCountLabel(count: number): string {
  if (count === 1) {
    return "1 zatwierdzony";
  }
  const lastDigit = count % 10;
  const lastTwo = count % 100;
  const few = lastDigit >= 2 && lastDigit <= 4 && !(lastTwo >= 12 && lastTwo <= 14);
  return `${String(count)} ${few ? "zatwierdzone" : "zatwierdzonych"}`;
}

/**
 * Plans on the month's Saturdays and Sundays, in calendar order.
 *
 * The grid has no weekend columns, and a plan made from `/plan?date=` for a
 * Saturday must not vanish from the month because of that - the grid lists
 * these under itself.
 */
export function weekendPlans(month: string, summaries: readonly DayPlanSummary[]): DayPlanSummary[] {
  return summaries
    .filter((summary) => {
      if (summary.plan_date.slice(0, 7) !== month) {
        return false;
      }
      const weekday = new Date(`${summary.plan_date}T00:00:00Z`).getUTCDay();
      return weekday === 0 || weekday === 6;
    })
    .sort((a, b) => a.plan_date.localeCompare(b.plan_date));
}

/** `2026-10-10` as „sob. 10" - the visible text of a weekend plan's link. */
export function weekendLinkText(isoDate: string): string {
  const weekday = new Intl.DateTimeFormat("pl-PL", { weekday: "short", timeZone: "UTC" }).format(
    new Date(`${isoDate}T00:00:00Z`),
  );
  return `${weekday} ${dayNumber(isoDate)}`;
}
