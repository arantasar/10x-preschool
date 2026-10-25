import { WEEK_DAYS } from "@/lib/day-plan-limits";
import { layoutMonthGrid } from "@/lib/plan-pdf/grid-layout";
import {
  CONTINUED_MARK,
  DRAFT_TAG,
  type PdfLayoutKind,
  type PrintDay,
  type PrintDocument,
  type PrintWeekRow,
} from "@/lib/plan-pdf/model";
import { chip, sheetFrame, tag, textItem, type Chip } from "@/lib/plan-pdf/sheet";

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

/** Which of the four embedded faces a text is set in: Young Serif, or Nunito Sans in three styles. */
export type FontFace = "serif" | "regular" | "bold" | "boldItalic";

/**
 * Width of `text` in points at `size`, `tracking` points of letter spacing
 * included - between characters, not after the last one.
 */
export type Measure = (text: string, size: number, face: FontFace, tracking?: number) => number;

/**
 * A colour, by name. The RGB values live in `render.ts`, the one module that
 * draws, so a layout test can say "the draft frame is the draft colour" without
 * knowing what that colour is. Taken from the design package's `print.css`.
 */
export type InkToken = "ink" | "muted" | "accent" | "faint" | "chip" | "frame" | "draft" | "divider" | "soft" | "hatch";

export interface PageSpec {
  readonly width: number;
  readonly height: number;
  readonly margin: number;
}

// Two centimetres around a portrait page; a centimetre around a landscape one,
// where five columns need every point of width they can get - the design's
// 36/38/30 px sheet padding, evened out. Both clear the unprintable edge of an
// ordinary office printer.
export const A4_PORTRAIT: PageSpec = { width: 595.28, height: 841.89, margin: 56.69 };
export const A4_LANDSCAPE: PageSpec = { width: 841.89, height: 595.28, margin: 28 };

/**
 * Everything a sheet is drawn from. Outlines only - nothing here fills an area,
 * so a sheet never depends on the printer drawing backgrounds, and the paper
 * stays white.
 */
export type LayoutItem =
  | {
      readonly kind: "text";
      readonly x: number;
      /** The baseline. */
      readonly y: number;
      readonly text: string;
      readonly size: number;
      readonly face: FontFace;
      readonly color: InkToken;
      /** Letter spacing in points, for the spaced-out capitals of labels. */
      readonly tracking?: number;
    }
  | {
      /** A rectangle's outline, corners rounded by `radius`; `y` is its bottom edge. */
      readonly kind: "box";
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly radius: number;
      readonly stroke: InkToken;
      readonly strokeWidth: number;
      readonly dashed: boolean;
    }
  | {
      readonly kind: "rule";
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
      readonly color: InkToken;
      readonly width: number;
    }
  | {
      /** A rectangle filled with thin diagonal lines - a day of the neighbouring month. */
      readonly kind: "hatch";
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    }
  | {
      /** The temio sign, `size` points square; `x`, `y` is its top-left corner. */
      readonly kind: "mark";
      readonly x: number;
      readonly y: number;
      readonly size: number;
    };

export interface LayoutPage {
  readonly spec: PageSpec;
  readonly items: readonly LayoutItem[];
  /** The body between the sheet's header and footer - what the day content must stay inside. */
  readonly body: { readonly top: number; readonly bottom: number };
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

/**
 * Candidate body sizes for the week-on-one-page layout, largest first. 7 pt is
 * the legibility floor. The start is lower than the day page's 11 pt: the day's
 * heading - number, weekday, chip - takes more of a column than it used to.
 */
export const WEEK_PAGE_SIZES: readonly number[] = [9.5, 9, 8.5, 8, 7.5, 7];

/** Between two columns; the divider runs down its middle. */
export const WEEK_COLUMN_GAP = 15;

/** Width of one of the week's five columns - fixed by `WEEK_DAYS`, not by how many slots hold a day. */
export const WEEK_COLUMN_WIDTH =
  (A4_LANDSCAPE.width - 2 * A4_LANDSCAPE.margin - (WEEK_DAYS - 1) * WEEK_COLUMN_GAP) / WEEK_DAYS;

const DAY_NUMBER_SCALE = 1.6;
const ACTIVITY_NUMBER_SCALE = 1.25;
const ACTIVITY_TITLE_SCALE = 1.05;

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

function breakLongWord(word: string, maxWidth: number, size: number, face: FontFace, measure: Measure): string[] {
  const pieces: string[] = [];
  let current = "";
  for (const char of Array.from(word)) {
    if (current !== "" && measure(current + char, size, face) > maxWidth) {
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
export function wrapText(text: string, maxWidth: number, size: number, face: FontFace, measure: Measure): string[] {
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
      if (measure(candidate, size, face) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current !== "") {
        lines.push(current);
        current = "";
      }
      if (measure(word, size, face) <= maxWidth) {
        current = word;
      } else {
        const pieces = breakLongWord(word, maxWidth, size, face, measure);
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

/**
 * One line box of a day, stacked top to bottom. Most are a line of text; a
 * day's heading row or the rule under its theme are boxes with no text of their
 * own and their items in `extras`.
 */
export interface FlowLine {
  readonly text: string;
  readonly size: number;
  readonly face: FontFace;
  /** Extra space above this line, on top of its line box. */
  readonly spaceBefore: number;
  readonly color?: InkToken;
  /** From the column's left edge - a numbered activity's title hangs after its number. */
  readonly indent?: number;
  /** The line box's height, when it is not `size × LINE_HEIGHT`. */
  readonly height?: number;
  /** Items drawn with the line, from its box's left edge `x` and top `top`. */
  readonly extras?: (x: number, top: number) => LayoutItem[];
}

export function lineHeight(line: FlowLine): number {
  return line.spaceBefore + (line.height ?? line.size * LINE_HEIGHT);
}

export function totalHeight(lines: readonly FlowLine[]): number {
  return lines.reduce((sum, line) => sum + lineHeight(line), 0);
}

interface FlowStyle {
  readonly color?: InkToken;
  readonly indent?: number;
}

export function flowText(
  text: string,
  width: number,
  size: number,
  face: FontFace,
  measure: Measure,
  spaceBefore = 0,
  style: FlowStyle = {},
): FlowLine[] {
  const indent = style.indent ?? 0;
  return wrapText(text, width - indent, size, face, measure).map((line, index) => ({
    text: line,
    size,
    face,
    spaceBefore: index === 0 ? spaceBefore : 0,
    ...style,
  }));
}

interface DayStyle {
  readonly width: number;
  readonly bodySize: number;
}

interface HeaderPiece {
  readonly width: number;
  /** Items for the piece starting at `x`, sitting on `baseline`. */
  readonly draw: (x: number, baseline: number) => LayoutItem[];
}

/** A chip or tag as a piece of the heading row: its outline straddles the baseline. */
function boxedPiece(box: Chip, size: number): HeaderPiece {
  return { width: box.width, draw: (x, baseline) => box.draw(x, baseline - size * 0.42) };
}

/**
 * The day's heading, as the design draws it: the date's number in the serif,
 * the weekday in spaced capitals, „SZKIC” in a dashed tag when the day is a
 * draft, and the hasło in a chip pushed to the right. Repeated at the top of
 * every page the day continues onto, with "(cd.)" after the weekday.
 *
 * The chip stays on the row when it fits whole; otherwise it gets a row of its
 * own under it, cut to the column with „…”. It is always one line - the full
 * hasło can run to 2000 characters, and a column is a fifth of a page.
 */
function dayHeader(day: PrintDay, style: DayStyle, measure: Measure, continued: boolean): FlowLine[] {
  const { width, bodySize: size } = style;
  const numberSize = size * DAY_NUMBER_SCALE;
  const gap = size * 0.5;
  // The design's weekday and chip are a shade larger than its 7.5 pt body;
  // this body starts at 9.5, so they are a shade smaller than it.
  const labelSize = size * 0.85;
  const tracking = labelSize * 0.1;
  const weekday = day.weekday.toLocaleUpperCase("pl-PL");

  const pieces: HeaderPiece[] = [
    {
      width: measure(day.dayNumber, numberSize, "serif"),
      draw: (x, baseline) => [textItem(x, baseline, day.dayNumber, numberSize, "serif", "ink")],
    },
    {
      width: measure(weekday, labelSize, "bold", tracking),
      draw: (x, baseline) => [textItem(x, baseline, weekday, labelSize, "bold", "muted", tracking)],
    },
  ];
  if (continued) {
    pieces.push({
      width: measure(CONTINUED_MARK, labelSize, "regular"),
      draw: (x, baseline) => [textItem(x, baseline, CONTINUED_MARK, labelSize, "regular", "muted")],
    });
  }
  const rowWidth = (row: readonly HeaderPiece[]) =>
    row.reduce((sum, piece) => sum + piece.width, 0) + Math.max(0, row.length - 1) * gap;

  const rows: HeaderPiece[][] = [pieces];
  if (day.status === "draft") {
    const draft = boxedPiece(tag(DRAFT_TAG, labelSize * 0.9, measure), labelSize * 0.9);
    if (rowWidth([...pieces, draft]) <= width) {
      pieces.push(draft);
    } else {
      rows.push([draft]);
    }
  }

  // The chip, right-aligned on the last row if it fits there whole.
  let chipRow: { readonly piece: HeaderPiece; readonly own: boolean } | null = null;
  if (day.prompt !== null) {
    const chipSize = labelSize;
    const last = rows[rows.length - 1];
    const room = width - rowWidth(last) - gap;
    const whole = chip(day.prompt, Number.POSITIVE_INFINITY, chipSize, measure);
    if (whole !== null && whole.width <= room) {
      chipRow = { piece: boxedPiece(whole, chipSize), own: false };
    } else {
      const cut = chip(day.prompt, width, chipSize, measure);
      if (cut !== null) {
        chipRow = { piece: boxedPiece(cut, chipSize), own: true };
      }
    }
  }

  const lines: FlowLine[] = rows.map((row, index) => {
    const rowSize = index === 0 ? numberSize : size;
    const isLast = index === rows.length - 1;
    return {
      text: "",
      size: rowSize,
      face: "regular",
      spaceBefore: index === 0 ? 0 : size * 0.35,
      height: rowSize * 1.2,
      extras: (x, top) => {
        const baseline = top - rowSize;
        const items: LayoutItem[] = [];
        let cursor = x;
        for (const piece of row) {
          items.push(...piece.draw(cursor, baseline));
          cursor += piece.width + gap;
        }
        if (isLast && chipRow !== null && !chipRow.own) {
          items.push(...chipRow.piece.draw(x + width - chipRow.piece.width, baseline));
        }
        return items;
      },
    };
  });
  if (chipRow?.own) {
    const { piece } = chipRow;
    lines.push({
      text: "",
      size,
      face: "regular",
      spaceBefore: size * 0.35,
      height: size * 1.5,
      extras: (x, top) => piece.draw(x, top - size * 1.05),
    });
  }
  return lines;
}

function dayBody(day: PrintDay, style: DayStyle, measure: Measure): FlowLine[] {
  const { width, bodySize: size } = style;
  const lines: FlowLine[] = [];
  if (day.theme !== null) {
    lines.push(...flowText(day.theme, width, size, "boldItalic", measure, size * 0.6, { color: "muted" }));
    lines.push({
      text: "",
      size,
      face: "regular",
      spaceBefore: 0,
      height: size * 0.7,
      extras: (x, top) => [
        {
          kind: "rule",
          x1: x,
          y1: top - size * 0.35,
          x2: x + width,
          y2: top - size * 0.35,
          color: "soft",
          width: 0.75,
        },
      ],
    });
  }
  if (day.emptyNote !== null) {
    lines.push(...flowText(day.emptyNote, width, size, "regular", measure, size * 0.6, { color: "faint" }));
  }
  const titleSize = size * ACTIVITY_TITLE_SCALE;
  const numberSize = size * ACTIVITY_NUMBER_SCALE;
  day.activities.forEach((activity, index) => {
    const ordinal = String(index + 1);
    const indent = measure(ordinal, numberSize, "serif") + size * 0.45;
    const title = flowText(activity.title, width, titleSize, "bold", measure, size * 0.75, { indent });
    if (title.length > 0) {
      title[0] = {
        ...title[0],
        extras: (x, top) => [textItem(x, top - titleSize, ordinal, numberSize, "serif", "accent")],
      };
    }
    lines.push(...title);
    lines.push(...flowText(activity.description, width, size, "regular", measure, size * 0.15));
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

/** Items for `lines` stacked downward from `top`. */
export function placeLines(lines: readonly FlowLine[], x: number, top: number): LayoutItem[] {
  const items: LayoutItem[] = [];
  let cursor = top;
  for (const line of lines) {
    cursor -= line.spaceBefore;
    if (line.extras) {
      items.push(...line.extras(x, cursor));
    }
    if (line.text !== "") {
      // Baseline one em below the top of the line box leaves the rest of the
      // box for descenders.
      items.push(
        textItem(x + (line.indent ?? 0), cursor - line.size, line.text, line.size, line.face, line.color ?? "ink"),
      );
    }
    cursor -= line.height ?? line.size * LINE_HEIGHT;
  }
  return items;
}

/** The dashed outline of a draft - square-cornered, as the layouts have drawn it since `S-13`. */
export function draftBox(x: number, y: number, width: number, height: number): LayoutItem {
  return { kind: "box", x, y, width, height, radius: 0, stroke: "draft", strokeWidth: 1, dashed: true };
}

// ---------------------------------------------------------------------------
// The sheets
// ---------------------------------------------------------------------------

function rowHeading(row: PrintWeekRow, continued: boolean) {
  return { eyebrow: row.eyebrow, title: row.heading, note: row.note, continued };
}

/**
 * Where a row's body starts and ends. Measured on the continued title, so a
 * row's every page lines up - and the continued title is the one that may have
 * to stack its eyebrow, which moves the body down.
 */
function rowBody(spec: PageSpec, row: PrintWeekRow, measure: Measure): { top: number; bottom: number } {
  const frame = sheetFrame(spec, rowHeading(row, true), measure);
  const plain = sheetFrame(spec, rowHeading(row, false), measure);
  return { top: Math.min(frame.contentTop, plain.contentTop), bottom: frame.contentBottom };
}

function layoutDayPerPage(doc: PrintDocument, measure: Measure): PdfLayout {
  const spec = A4_PORTRAIT;
  const style: DayStyle = { width: spec.width - 2 * spec.margin, bodySize: DAY_PAGE_SIZE };

  const pages: LayoutPage[] = [];
  for (const row of doc.rows) {
    const body = rowBody(spec, row, measure);
    for (const day of row.slots) {
      if (day === null) continue;
      const segments = flowSegments(
        (continued) => dayHeader(day, style, measure, continued),
        dayBody(day, style, measure),
        body.top - body.bottom,
      );
      segments.forEach((segment, index) => {
        pages.push({
          spec,
          body,
          items: [
            ...sheetFrame(spec, rowHeading(row, index > 0), measure).items,
            ...placeLines(segment, spec.margin, body.top),
          ],
        });
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

function attemptWeek(
  row: PrintWeekRow,
  size: number,
  available: number,
  measure: Measure,
): { fits: boolean; attempt: WeekAttempt } {
  const style: DayStyle = { width: WEEK_COLUMN_WIDTH, bodySize: size };
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

/** The largest size at which the whole week fits one page - or the smallest, whose columns then continue. */
function chooseWeekAttempt(row: PrintWeekRow, available: number, measure: Measure): WeekAttempt {
  for (const size of WEEK_PAGE_SIZES) {
    const { fits, attempt } = attemptWeek(row, size, available, measure);
    if (fits) {
      return attempt;
    }
  }
  return attemptWeek(row, WEEK_PAGE_SIZES[WEEK_PAGE_SIZES.length - 1], available, measure).attempt;
}

/** Left edge of a week column. */
export function weekColumnX(index: number): number {
  return A4_LANDSCAPE.margin + index * (WEEK_COLUMN_WIDTH + WEEK_COLUMN_GAP);
}

/** One week row on its own pages - a month is several of these, each sized independently. */
function layoutWeekRow(row: PrintWeekRow, measure: Measure): { size: number; pages: LayoutPage[] } {
  const spec = A4_LANDSCAPE;
  const body = rowBody(spec, row, measure);
  const { size, columns } = chooseWeekAttempt(row, body.top - body.bottom, measure);
  const pageCount = Math.max(1, ...columns.map((segments) => segments.length));

  const pages: LayoutPage[] = [];
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const items: LayoutItem[] = [...sheetFrame(spec, rowHeading(row, pageIndex > 0), measure).items];
    for (let column = 1; column < WEEK_DAYS; column++) {
      const x = weekColumnX(column) - WEEK_COLUMN_GAP / 2;
      items.push({ kind: "rule", x1: x, y1: body.top, x2: x, y2: body.bottom, color: "divider", width: 0.75 });
    }
    columns.forEach((segments, dayIndex) => {
      // A shorter column has already ended, and a `null` slot never began;
      // either way this page stays blank there.
      if (row.slots[dayIndex] !== null && pageIndex < segments.length) {
        items.push(...placeLines(segments[pageIndex], weekColumnX(dayIndex), body.top));
      }
    });
    pages.push({ spec, body, items });
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
