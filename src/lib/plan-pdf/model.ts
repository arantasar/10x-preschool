import {
  formatAcceptedAt,
  formatDateRange,
  formatMonth,
  formatPlanDate,
  formatWeekRange,
  weeksOfMonth,
  workingDaysOf,
  workingDaysOfMonth,
} from "@/lib/day-plan-dates";
import type { DayPlanView } from "@/types";

/**
 * What goes on paper when a teacher downloads a week or a month, and in which
 * words.
 *
 * `S-13` (FR-020): every working day is printed, a draft says it is one, and an
 * empty day says so rather than vanishing. That is a claim about content, not
 * about geometry, so it lives here - apart from `layout.ts`, which only decides
 * where things go, and from `render.ts`, the one module that knows pdf-lib.
 *
 * Both prints share one shape: a document of week rows, five slots each. A week
 * is one row with five days; a month (`S-14`) is four to six rows whose edge
 * slots are `null` - days of the neighbouring month, which print as nothing.
 *
 * Every Polish string the PDF carries is defined in this file. Text drawn with an
 * embedded font is encoded as glyph ids inside the PDF, so it cannot be grepped
 * out of the bytes; the only place a test can check "the draft is labelled a
 * draft" is this model.
 */

export type PdfLayoutKind = "day-per-page" | "week-per-page" | "month-grid";

export type PrintDayStatus = "accepted" | "draft" | "empty";

/** The label beside a day that has a plan but no acceptance. Text, not colour - it has to survive a b/w printer. */
export const DRAFT_LABEL = "SZKIC — niezatwierdzony";

/** What an empty day says instead of activities. */
export const EMPTY_DAY_NOTE = "Brak planu na ten dzień";

/** Appended to a heading repeated on the page a day or a week continues onto. */
export const CONTINUED_MARK = "(cd.)";

export const PROMPT_PREFIX = "Hasło: ";
export const THEME_PREFIX = "Temat: ";

/** The buttons' visible text, which is also their accessible name. */
export const PDF_BUTTON_LABELS: Readonly<Record<WeekPdfLayoutKind, string>> = {
  "day-per-page": "Pobierz PDF — dzień na stronę",
  "week-per-page": "Pobierz PDF — tydzień na stronie",
};

/** The layouts a week offers. */
export type WeekPdfLayoutKind = Exclude<PdfLayoutKind, "month-grid">;

const FILE_SUFFIXES: Readonly<Record<WeekPdfLayoutKind, string>> = {
  "day-per-page": "dzien-na-strone",
  "week-per-page": "tydzien-na-stronie",
};

/** The layouts a month offers (`S-14`). */
export type MonthPdfLayoutKind = Extract<PdfLayoutKind, "month-grid" | "week-per-page">;

export const MONTH_PDF_BUTTON_LABELS: Readonly<Record<MonthPdfLayoutKind, string>> = {
  "month-grid": "Pobierz PDF — siatka miesiąca",
  "week-per-page": "Pobierz PDF — tygodniami",
};

const MONTH_FILE_SUFFIXES: Readonly<Record<MonthPdfLayoutKind, string>> = {
  "month-grid": "siatka",
  "week-per-page": "tygodniami",
};

/** A grid cell's draft label - {@link DRAFT_LABEL} does not fit a fifth of a page. The legend explains it. */
export const DRAFT_SHORT_LABEL = "SZKIC";

/** The one line under the month grid that says what a dashed frame means. */
export const GRID_LEGEND = "Przerywana ramka i „SZKIC” — plan niezatwierdzony";

/** Ends the last visible line of a grid cell whose text did not fit. */
export const TRUNCATION_MARK = "…";

/** Column headings of the month grid, Monday first. */
export const GRID_WEEKDAYS: readonly string[] = ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek"];

export interface PrintActivity {
  readonly title: string;
  readonly description: string;
}

export interface PrintDay {
  readonly date: string;
  /** `formatPlanDate(date)`. */
  readonly heading: string;
  readonly status: PrintDayStatus;
  /** {@link DRAFT_LABEL}, `Zatwierdzono …`, or `null` for an empty day. */
  readonly statusLabel: string | null;
  /** The hasło. */
  readonly prompt: string | null;
  /** `null` is a valid state - a day planned on its own has no theme - and prints as nothing. */
  readonly theme: string | null;
  readonly activities: readonly PrintActivity[];
  /** {@link EMPTY_DAY_NOTE} for an empty day, `null` otherwise. */
  readonly emptyNote: string | null;
}

export interface PrintWeekRow {
  readonly weekStart: string;
  /** Page heading in the week-per-page layout; for a printed week it is {@link PrintDocument.title}. */
  readonly heading: string;
  /** `WEEK_DAYS` slots in calendar order; `null` is a day outside the document - no heading, no label, no frame. */
  readonly slots: readonly (PrintDay | null)[];
}

export interface PrintDocument {
  /** `Plan tygodnia — 14–18 września 2026`. */
  readonly title: string;
  readonly rows: readonly PrintWeekRow[];
}

/** `Zatwierdzono 23 września, 11:31`. */
export function acceptedLabel(acceptedAt: string): string {
  return `Zatwierdzono ${formatAcceptedAt(acceptedAt)}`;
}

function printDay(date: string, view: DayPlanView | undefined): PrintDay {
  const heading = formatPlanDate(date);
  if (!view) {
    return {
      date,
      heading,
      status: "empty",
      statusLabel: null,
      prompt: null,
      theme: null,
      activities: [],
      emptyNote: EMPTY_DAY_NOTE,
    };
  }
  const acceptedAt = view.plan.accepted_at;
  return {
    date,
    heading,
    status: acceptedAt === null ? "draft" : "accepted",
    statusLabel: acceptedAt === null ? DRAFT_LABEL : acceptedLabel(acceptedAt),
    prompt: view.plan.prompt,
    theme: view.plan.theme,
    activities: view.activities.map(({ title, description }) => ({ title, description })),
    emptyNote: null,
  };
}

/**
 * The week as it goes on paper: a document of one row.
 *
 * `plans` has the shape of `WeekPlanView.plans` - absent key means a free day -
 * but the island builds it from its own `day.plan` state, never from the SSR
 * props and never from an unsaved batch. This function cannot tell the
 * difference, which is why the rule is the caller's.
 */
export function buildPrintWeek(
  weekStart: string,
  days: readonly string[],
  plans: Readonly<Partial<Record<string, DayPlanView>>>,
): PrintDocument {
  const title = `Plan tygodnia — ${formatWeekRange(weekStart)}`;
  return {
    title,
    rows: [{ weekStart, heading: title, slots: [...days].sort().map((date) => printDay(date, plans[date])) }],
  };
}

/** Every printed day, in document order - the pages of the day-per-page layout. */
export function printDays(doc: PrintDocument): PrintDay[] {
  return doc.rows.flatMap((row) => row.slots.filter((slot): slot is PrintDay => slot !== null));
}

/**
 * The month as it goes on paper: a row for every week that holds one of its
 * working days, and a {@link PrintDay} in every slot whose date is one of them.
 *
 * The other slots - the neighbouring months' days in the first and last rows -
 * are `null`, not empty days: they print as nothing, because saying "Brak planu"
 * about 31 August on September's plan would be a claim about the wrong month.
 * Keys of `plans` outside the month are ignored for the same reason, and a row's
 * heading names only the month's own days in it.
 *
 * Rows come from {@link weeksOfMonth} minus the ones with no slot at all: a month
 * that starts on a Saturday or Sunday opens with the previous month's last week,
 * which the screen grid shows but paper would spend a blank sheet (or a blank
 * grid row) on.
 */
export function buildPrintMonth(month: string, plans: Readonly<Partial<Record<string, DayPlanView>>>): PrintDocument {
  const title = `Plan miesiąca — ${formatMonth(month)}`;
  const inMonth = new Set(workingDaysOfMonth(month));
  const rows: PrintWeekRow[] = [];
  for (const weekStart of weeksOfMonth(month)) {
    const own = workingDaysOf(weekStart).filter((date) => inMonth.has(date));
    if (own.length === 0) continue;
    rows.push({
      weekStart,
      heading: `${title} · ${formatDateRange(own[0], own[own.length - 1])}`,
      slots: workingDaysOf(weekStart).map((date) => (inMonth.has(date) ? printDay(date, plans[date]) : null)),
    });
  }
  return { title, rows };
}

/** `2026-09-14` as `14 września` - a grid cell's heading. */
export function gridDayHeading(date: string): string {
  return new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

/** `plan-miesiaca-2026-09-siatka.pdf`, `plan-miesiaca-2026-09-tygodniami.pdf`. */
export function monthPdfFileName(month: string, kind: MonthPdfLayoutKind): string {
  return `plan-miesiaca-${month}-${MONTH_FILE_SUFFIXES[kind]}.pdf`;
}

/** `plan-tygodnia-2026-09-14-dzien-na-strone.pdf`. */
export function pdfFileName(weekStart: string, kind: WeekPdfLayoutKind): string {
  return `plan-tygodnia-${weekStart}-${FILE_SUFFIXES[kind]}.pdf`;
}
