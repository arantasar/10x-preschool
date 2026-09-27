import { WEEK_DAYS } from "@/lib/day-plan-limits";
import { layoutMonthGrid } from "@/lib/plan-pdf/grid-layout";
import {
  CONTINUED_MARK,
  printDays,
  PROMPT_PREFIX,
  THEME_PREFIX,
  type PdfLayoutKind,
  type PrintDay,
  type PrintDocument,
  type PrintWeekRow,
} from "@/lib/plan-pdf/model";

/**
 * Where everything in a {@link PrintDocument} goes, in PDF points.
 *
 * Line breaking, pagination, the "(cd.)" continuation and the font-size search
 * for the week-on-one-page layout all live here, and none of it imports pdf-lib.
 * Text width is injected as a {@link Measure}: the tests pass a deterministic
 * fake, `render.ts` passes one built from the embedded fonts. Line height is a
 * fixed multiple of the size, not the font's `heightAtSize`, so this module and
 * the renderer cannot disagree about it.
 *
 * Coordinates are PDF's own - origin bottom-left, `y` of a text item is its
 * baseline - so the renderer draws without converting anything.
 */

export type FontWeight = "regular" | "bold";

/** Width of `text` in points at `size`. */
export type Measure = (text: string, size: number, weight: FontWeight) => number;

export interface PageSpec {
  readonly width: number;
  readonly height: number;
  readonly margin: number;
}

// Two centimetres around a portrait page; under one around a landscape one,
// where five columns need every point of width they can get. 24 pt still clears
// the unprintable edge of an ordinary office printer.
export const A4_PORTRAIT: PageSpec = { width: 595.28, height: 841.89, margin: 56.69 };
export const A4_LANDSCAPE: PageSpec = { width: 841.89, height: 595.28, margin: 24 };

export type LayoutItem =
  | {
      readonly kind: "text";
      readonly x: number;
      readonly y: number;
      readonly text: string;
      readonly size: number;
      readonly weight: FontWeight;
    }
  | {
      readonly kind: "dashed-box";
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    };

export interface LayoutPage {
  readonly spec: PageSpec;
  readonly items: readonly LayoutItem[];
}

export interface PdfLayout {
  readonly kind: PdfLayoutKind;
  /** The body size used; where each week row picks its own, the smallest of them. */
  readonly bodySize: number;
  readonly pages: readonly LayoutPage[];
}

/** Line box height as a multiple of the font size. */
export const LINE_HEIGHT = 1.25;

/** Body size of the day-per-page layout: full descriptions, comfortable reading. */
export const DAY_PAGE_SIZE = 11;

/** Candidate body sizes for the week-on-one-page layout, largest first. 7 pt is the legibility floor. */
export const WEEK_PAGE_SIZES: readonly number[] = [11, 10.5, 10, 9.5, 9, 8.5, 8, 7.5, 7];

// Room between the dashed draft frame and the text inside it. Every day is
// inset by it, framed or not, so accepting a day does not move its text.
const DAY_PAGE_PADDING = 8;
const WEEK_PAGE_PADDING = 4;
const WEEK_COLUMN_GAP = 8;
const DAY_PAGE_HEADING_SCALE = 1.4;
const WEEK_TITLE_SIZE = 13;

/**
 * Text as it may be measured and drawn: `\r\n` and lone `\r` become `\n`, tabs
 * become spaces, a run of blank lines becomes one, and characters the font has
 * no glyph for become `?`.
 *
 * The glyph check is the renderer's to supply - only it knows the font - but it
 * must run before layout, or the width measured and the width drawn disagree
 * (and pdf-lib throws on a character it cannot encode).
 */
export function normalizeText(text: string, hasGlyph: (char: string) => boolean = () => true): string {
  // A run of blank lines keeps one: pasted text can carry hundreds, and each
  // would otherwise be a printed line - whole "(cd.)" pages of nothing.
  const unified = text
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .replace(/\n(?: *\n)+/g, "\n\n");
  return Array.from(unified, (char) => (char === "\n" || hasGlyph(char) ? char : "?")).join("");
}

function breakLongWord(word: string, maxWidth: number, size: number, weight: FontWeight, measure: Measure): string[] {
  const pieces: string[] = [];
  let current = "";
  for (const char of Array.from(word)) {
    if (current !== "" && measure(current + char, size, weight) > maxWidth) {
      pieces.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  if (current !== "") {
    pieces.push(current);
  }
  return pieces;
}

/**
 * `text` broken into lines no wider than `maxWidth`.
 *
 * Breaks at spaces; `\n` is a hard break (a blank line survives as `""`); a word
 * wider than the column is broken between characters. Empty text is no lines.
 */
export function wrapText(text: string, maxWidth: number, size: number, weight: FontWeight, measure: Measure): string[] {
  const trimmed = normalizeText(text).trim();
  if (trimmed === "") {
    return [];
  }
  const lines: string[] = [];
  for (const paragraph of trimmed.split("\n")) {
    const words = paragraph.split(" ").filter((word) => word !== "");
    let current = "";
    for (const word of words) {
      const candidate = current === "" ? word : `${current} ${word}`;
      if (measure(candidate, size, weight) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current !== "") {
        lines.push(current);
        current = "";
      }
      if (measure(word, size, weight) <= maxWidth) {
        current = word;
      } else {
        const pieces = breakLongWord(word, maxWidth, size, weight, measure);
        lines.push(...pieces.slice(0, -1));
        current = pieces[pieces.length - 1] ?? "";
      }
    }
    lines.push(current);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Flowing a day into a column
// ---------------------------------------------------------------------------

export interface FlowLine {
  readonly text: string;
  readonly size: number;
  readonly weight: FontWeight;
  /** Extra space above this line, on top of its line box. */
  readonly spaceBefore: number;
}

export function lineHeight(line: FlowLine): number {
  return line.spaceBefore + line.size * LINE_HEIGHT;
}

export function totalHeight(lines: readonly FlowLine[]): number {
  return lines.reduce((sum, line) => sum + lineHeight(line), 0);
}

export function flowText(
  text: string,
  width: number,
  size: number,
  weight: FontWeight,
  measure: Measure,
  spaceBefore = 0,
): FlowLine[] {
  return wrapText(text, width, size, weight, measure).map((line, index) => ({
    text: line,
    size,
    weight,
    spaceBefore: index === 0 ? spaceBefore : 0,
  }));
}

interface DayStyle {
  readonly width: number;
  readonly bodySize: number;
  readonly headingSize: number;
}

/** Day heading and state label - repeated at the top of every page the day continues onto. */
function dayHeader(day: PrintDay, style: DayStyle, measure: Measure, continued: boolean): FlowLine[] {
  const heading = continued ? `${day.heading} ${CONTINUED_MARK}` : day.heading;
  const lines = flowText(heading, style.width, style.headingSize, "bold", measure);
  if (day.statusLabel !== null) {
    lines.push(...flowText(day.statusLabel, style.width, style.bodySize, "bold", measure, style.bodySize * 0.3));
  }
  return lines;
}

function dayBody(day: PrintDay, style: DayStyle, measure: Measure): FlowLine[] {
  const { width, bodySize: size } = style;
  const lines: FlowLine[] = [];
  if (day.emptyNote !== null) {
    lines.push(...flowText(day.emptyNote, width, size, "regular", measure, size * 0.5));
  }
  if (day.prompt !== null) {
    lines.push(...flowText(`${PROMPT_PREFIX}${day.prompt}`, width, size, "regular", measure, size * 0.5));
  }
  if (day.theme !== null) {
    lines.push(...flowText(`${THEME_PREFIX}${day.theme}`, width, size, "regular", measure));
  }
  day.activities.forEach((activity, index) => {
    lines.push(...flowText(`${index + 1}. ${activity.title}`, width, size, "bold", measure, size * 0.6));
    lines.push(...flowText(activity.description, width, size, "regular", measure));
  });
  return lines;
}

/**
 * The day cut into segments no taller than `available`, each under its own
 * header. A segment always takes at least one body line, so an absurdly tall
 * line overflows instead of looping forever.
 */
function flowSegments(
  header: (continued: boolean) => FlowLine[],
  body: readonly FlowLine[],
  available: number,
): FlowLine[][] {
  const segments: FlowLine[][] = [];
  let current = header(false);
  let height = totalHeight(current);
  let placed = 0;
  for (const line of body) {
    if (placed > 0 && height + lineHeight(line) > available) {
      segments.push(current);
      current = header(true);
      height = totalHeight(current);
      placed = 0;
    }
    current.push(line);
    height += lineHeight(line);
    placed += 1;
  }
  segments.push(current);
  return segments;
}

/** Text items for `lines` stacked downward from `top`. */
export function placeLines(lines: readonly FlowLine[], x: number, top: number): LayoutItem[] {
  const items: LayoutItem[] = [];
  let cursor = top;
  for (const line of lines) {
    cursor -= line.spaceBefore;
    if (line.text !== "") {
      // Baseline one em below the top of the line box leaves the rest of the
      // box for descenders.
      items.push({ kind: "text", x, y: cursor - line.size, text: line.text, size: line.size, weight: line.weight });
    }
    cursor -= line.size * LINE_HEIGHT;
  }
  return items;
}

/** A day segment inside its frame area: text inset by `padding`, dashed frame when the day is a draft. */
function placeDaySegment(
  day: PrintDay,
  lines: readonly FlowLine[],
  x: number,
  top: number,
  width: number,
  padding: number,
): LayoutItem[] {
  const items = placeLines(lines, x + padding, top - padding);
  if (day.status === "draft") {
    const height = totalHeight(lines) + 2 * padding;
    items.push({ kind: "dashed-box", x, y: top - height, width, height });
  }
  return items;
}

// ---------------------------------------------------------------------------
// The two layouts
// ---------------------------------------------------------------------------

function layoutDayPerPage(doc: PrintDocument, measure: Measure): PdfLayout {
  const spec = A4_PORTRAIT;
  const contentWidth = spec.width - 2 * spec.margin;
  const top = spec.height - spec.margin;
  const style: DayStyle = {
    width: contentWidth - 2 * DAY_PAGE_PADDING,
    bodySize: DAY_PAGE_SIZE,
    headingSize: DAY_PAGE_SIZE * DAY_PAGE_HEADING_SCALE,
  };
  const titleLines = flowText(doc.title, contentWidth, DAY_PAGE_SIZE - 1, "regular", measure);
  const titleGap = DAY_PAGE_SIZE;
  const dayTop = top - totalHeight(titleLines) - titleGap;
  const available = dayTop - spec.margin - 2 * DAY_PAGE_PADDING;

  const pages: LayoutPage[] = [];
  for (const day of printDays(doc)) {
    const segments = flowSegments(
      (continued) => dayHeader(day, style, measure, continued),
      dayBody(day, style, measure),
      available,
    );
    for (const segment of segments) {
      pages.push({
        spec,
        items: [
          ...placeLines(titleLines, spec.margin, top),
          ...placeDaySegment(day, segment, spec.margin, dayTop, contentWidth, DAY_PAGE_PADDING),
        ],
      });
    }
  }
  return { kind: "day-per-page", bodySize: DAY_PAGE_SIZE, pages };
}

interface WeekAttempt {
  readonly size: number;
  /** One per slot; an empty list for a `null` slot, which draws nothing. */
  readonly columns: readonly FlowLine[][][];
}

/** Width of one of the week's five columns - fixed by `WEEK_DAYS`, not by how many slots hold a day. */
const WEEK_COLUMN_WIDTH =
  (A4_LANDSCAPE.width - 2 * A4_LANDSCAPE.margin - (WEEK_DAYS - 1) * WEEK_COLUMN_GAP) / WEEK_DAYS;

function attemptWeek(row: PrintWeekRow, size: number, measure: Measure): { fits: boolean; attempt: WeekAttempt } {
  const spec = A4_LANDSCAPE;
  const style: DayStyle = { width: WEEK_COLUMN_WIDTH - 2 * WEEK_PAGE_PADDING, bodySize: size, headingSize: size };
  const available = columnTop(row, measure) - spec.margin - 2 * WEEK_PAGE_PADDING;

  let fits = true;
  const columns = row.slots.map((day) => {
    if (day === null) {
      return [];
    }
    const header = (continued: boolean) => dayHeader(day, style, measure, continued);
    const body = dayBody(day, style, measure);
    if (totalHeight([...header(false), ...body]) > available) {
      fits = false;
    }
    return flowSegments(header, body, available);
  });
  return { fits, attempt: { size, columns } };
}

function weekTitleLines(row: PrintWeekRow, measure: Measure, continued: boolean): FlowLine[] {
  const spec = A4_LANDSCAPE;
  const title = continued ? `${row.heading} ${CONTINUED_MARK}` : row.heading;
  return flowText(title, spec.width - 2 * spec.margin, WEEK_TITLE_SIZE, "bold", measure);
}

/** Where the columns start. Measured on the longer, continued title so every page lines up. */
function columnTop(row: PrintWeekRow, measure: Measure): number {
  const spec = A4_LANDSCAPE;
  return spec.height - spec.margin - totalHeight(weekTitleLines(row, measure, true)) - WEEK_COLUMN_GAP;
}

/** The largest size at which the whole week fits one page - or the smallest, whose columns then continue. */
function chooseWeekAttempt(row: PrintWeekRow, measure: Measure): WeekAttempt {
  for (const size of WEEK_PAGE_SIZES) {
    const { fits, attempt } = attemptWeek(row, size, measure);
    if (fits) {
      return attempt;
    }
  }
  return attemptWeek(row, WEEK_PAGE_SIZES[WEEK_PAGE_SIZES.length - 1], measure).attempt;
}

/** One week row on its own pages - a month is several of these, each sized independently. */
function layoutWeekRow(row: PrintWeekRow, measure: Measure): { size: number; pages: LayoutPage[] } {
  const spec = A4_LANDSCAPE;
  const { size, columns } = chooseWeekAttempt(row, measure);

  const top = columnTop(row, measure);
  const pageCount = Math.max(1, ...columns.map((segments) => segments.length));

  const pages: LayoutPage[] = [];
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const items: LayoutItem[] = placeLines(
      weekTitleLines(row, measure, pageIndex > 0),
      spec.margin,
      spec.height - spec.margin,
    );
    columns.forEach((segments, dayIndex) => {
      const day = row.slots[dayIndex];
      // A shorter column has already ended, and a `null` slot never began;
      // either way this page stays blank there.
      if (day !== null && pageIndex < segments.length) {
        const x = spec.margin + dayIndex * (WEEK_COLUMN_WIDTH + WEEK_COLUMN_GAP);
        items.push(...placeDaySegment(day, segments[pageIndex], x, top, WEEK_COLUMN_WIDTH, WEEK_PAGE_PADDING));
      }
    });
    pages.push({ spec, items });
  }
  return { size, pages };
}

function layoutWeekPerPage(doc: PrintDocument, measure: Measure): PdfLayout {
  const rows = doc.rows.map((row) => layoutWeekRow(row, measure));
  return {
    kind: "week-per-page",
    bodySize: Math.min(...rows.map((row) => row.size)),
    pages: rows.flatMap((row) => row.pages),
  };
}

export function layoutDocument(doc: PrintDocument, kind: PdfLayoutKind, measure: Measure): PdfLayout {
  switch (kind) {
    case "day-per-page":
      return layoutDayPerPage(doc, measure);
    case "week-per-page":
      return layoutWeekPerPage(doc, measure);
    case "month-grid":
      return layoutMonthGrid(doc, measure);
  }
}
