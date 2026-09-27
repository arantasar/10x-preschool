import { formatAcceptedAt, formatPlanDate, formatWeekRange } from "@/lib/day-plan-dates";
import type { DayPlanView } from "@/types";

/**
 * What goes on paper when a teacher downloads a week, and in which words.
 *
 * `S-13` (FR-020): every working day is printed, a draft says it is one, and an
 * empty day says so rather than vanishing. That is a claim about content, not
 * about geometry, so it lives here - apart from `layout.ts`, which only decides
 * where things go, and from `render.ts`, the one module that knows pdf-lib.
 *
 * Every Polish string the PDF carries is defined in this file. Text drawn with an
 * embedded font is encoded as glyph ids inside the PDF, so it cannot be grepped
 * out of the bytes; the only place a test can check "the draft is labelled a
 * draft" is this model.
 */

export type PdfLayoutKind = "day-per-page" | "week-per-page";

export type PrintDayStatus = "accepted" | "draft" | "empty";

/** The label beside a day that has a plan but no acceptance. Text, not colour - it has to survive a b/w printer. */
export const DRAFT_LABEL = "SZKIC ROBOCZY — niezaakceptowany";

/** What an empty day says instead of activities. */
export const EMPTY_DAY_NOTE = "Brak planu na ten dzień";

/** Appended to a heading repeated on the page a day or a week continues onto. */
export const CONTINUED_MARK = "(cd.)";

export const PROMPT_PREFIX = "Hasło: ";
export const THEME_PREFIX = "Temat: ";

/** The buttons' visible text, which is also their accessible name. */
export const PDF_BUTTON_LABELS: Readonly<Record<PdfLayoutKind, string>> = {
  "day-per-page": "Pobierz PDF — dzień na stronę",
  "week-per-page": "Pobierz PDF — tydzień na stronie",
};

const FILE_SUFFIXES: Readonly<Record<PdfLayoutKind, string>> = {
  "day-per-page": "dzien-na-strone",
  "week-per-page": "tydzien-na-stronie",
};

export interface PrintActivity {
  readonly title: string;
  readonly description: string;
}

export interface PrintDay {
  readonly date: string;
  /** `formatPlanDate(date)`. */
  readonly heading: string;
  readonly status: PrintDayStatus;
  /** {@link DRAFT_LABEL}, `Zaakceptowano …`, or `null` for an empty day. */
  readonly statusLabel: string | null;
  /** The hasło. */
  readonly prompt: string | null;
  /** `null` is a valid state - a day planned on its own has no theme - and prints as nothing. */
  readonly theme: string | null;
  readonly activities: readonly PrintActivity[];
  /** {@link EMPTY_DAY_NOTE} for an empty day, `null` otherwise. */
  readonly emptyNote: string | null;
}

export interface PrintWeek {
  readonly weekStart: string;
  /** `Plan tygodnia — 14–18 września 2026`. */
  readonly title: string;
  /** Every working day, in calendar order. */
  readonly days: readonly PrintDay[];
}

/** `Zaakceptowano 23 września, 11:31`. */
export function acceptedLabel(acceptedAt: string): string {
  return `Zaakceptowano ${formatAcceptedAt(acceptedAt)}`;
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
 * The week as it goes on paper.
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
): PrintWeek {
  return {
    weekStart,
    title: `Plan tygodnia — ${formatWeekRange(weekStart)}`,
    days: [...days].sort().map((date) => printDay(date, plans[date])),
  };
}

/** `plan-tygodnia-2026-09-14-dzien-na-strone.pdf`. */
export function pdfFileName(weekStart: string, kind: PdfLayoutKind): string {
  return `plan-tygodnia-${weekStart}-${FILE_SUFFIXES[kind]}.pdf`;
}
