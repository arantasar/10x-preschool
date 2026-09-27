import { WEEK_DAYS } from "@/lib/day-plan-limits";
import {
  A4_LANDSCAPE,
  flowText,
  lineHeight,
  LINE_HEIGHT,
  placeLines,
  totalHeight,
  type FlowLine,
  type FontWeight,
  type LayoutItem,
  type Measure,
  type PdfLayout,
} from "@/lib/plan-pdf/layout";
import {
  DRAFT_SHORT_LABEL,
  GRID_LEGEND,
  GRID_WEEKDAYS,
  gridDayHeading,
  PROMPT_PREFIX,
  THEME_PREFIX,
  TRUNCATION_MARK,
  type PrintDay,
  type PrintDocument,
} from "@/lib/plan-pdf/model";

/**
 * The month on one landscape sheet (`S-14`): a row per week, a column per
 * working day, and in each cell only what fits a glance - date, draft label,
 * hasło, theme, activity titles. The descriptions are what the "tygodniami"
 * layout is for.
 *
 * Always exactly one page. The text size is the largest candidate at which
 * every cell fits; at the 7 pt floor a cell that still does not fit is cut, and
 * its last visible line ends with {@link TRUNCATION_MARK}. The cut is measured
 * with the same {@link Measure} the renderer draws with, so the mark never
 * pushes a line past the cell's edge.
 *
 * `layout.ts` imports this module and this module imports `layout.ts`; nothing
 * here reads an import at module level, only inside functions, so the cycle is
 * harmless whichever side loads first.
 */

/** Candidate body sizes, largest first. 7 pt is the legibility floor, as for the week. */
export const GRID_SIZES: readonly number[] = [10, 9.5, 9, 8.5, 8, 7.5, 7];

const GRID_TITLE_SIZE = 13;
const GRID_WEEKDAY_SIZE = 9;
const GRID_LEGEND_SIZE = 8;
const GRID_COLUMN_GAP = 8;
const GRID_ROW_GAP = 6;
const GRID_SECTION_GAP = 8;
/** Room between a cell's edge - and its dashed frame - and its text. */
export const GRID_CELL_PADDING = 4;

/** One slot of the grid, as a rectangle in PDF points (origin bottom-left). */
export interface GridCell {
  readonly row: number;
  readonly column: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly day: PrintDay | null;
}

interface GridFrame {
  readonly titleLines: FlowLine[];
  readonly headersTop: number;
  readonly legendLines: FlowLine[];
  readonly legendTop: number;
  readonly cells: GridCell[];
}

function gridFrame(doc: PrintDocument, measure: Measure): GridFrame {
  const spec = A4_LANDSCAPE;
  const contentWidth = spec.width - 2 * spec.margin;
  const top = spec.height - spec.margin;

  const titleLines = flowText(doc.title, contentWidth, GRID_TITLE_SIZE, "bold", measure);
  const headersTop = top - totalHeight(titleLines) - GRID_SECTION_GAP;
  const gridTop = headersTop - GRID_WEEKDAY_SIZE * LINE_HEIGHT - GRID_ROW_GAP;

  const legendLines = flowText(GRID_LEGEND, contentWidth, GRID_LEGEND_SIZE, "regular", measure);
  // Lifted by a padding so the legend's descenders stay inside the margin.
  const legendTop = spec.margin + GRID_CELL_PADDING + totalHeight(legendLines);
  const gridBottom = legendTop + GRID_SECTION_GAP;

  const rowCount = Math.max(1, doc.rows.length);
  const width = (contentWidth - (WEEK_DAYS - 1) * GRID_COLUMN_GAP) / WEEK_DAYS;
  const height = (gridTop - gridBottom - (rowCount - 1) * GRID_ROW_GAP) / rowCount;

  const cells = doc.rows.flatMap((row, rowIndex) =>
    row.slots.map((day, column) => ({
      row: rowIndex,
      column,
      x: spec.margin + column * (width + GRID_COLUMN_GAP),
      y: gridTop - rowIndex * (height + GRID_ROW_GAP) - height,
      width,
      height,
      day,
    })),
  );
  return { titleLines, headersTop, legendLines, legendTop, cells };
}

/** Every slot's rectangle - the layout's own geometry, exported so a test can check what lands inside it. */
export function monthGridCells(doc: PrintDocument, measure: Measure): GridCell[] {
  return gridFrame(doc, measure).cells;
}

function cellLines(day: PrintDay, width: number, size: number, measure: Measure): FlowLine[] {
  const lines = flowText(gridDayHeading(day.date), width, size, "bold", measure);
  if (day.status === "draft") {
    lines.push(...flowText(DRAFT_SHORT_LABEL, width, size, "bold", measure));
  }
  if (day.emptyNote !== null) {
    lines.push(...flowText(day.emptyNote, width, size, "regular", measure));
  }
  if (day.prompt !== null) {
    lines.push(...flowText(`${PROMPT_PREFIX}${day.prompt}`, width, size, "regular", measure, size * 0.3));
  }
  if (day.theme !== null) {
    lines.push(...flowText(`${THEME_PREFIX}${day.theme}`, width, size, "regular", measure));
  }
  day.activities.forEach((activity, index) => {
    lines.push(...flowText(`${index + 1}. ${activity.title}`, width, size, "regular", measure, size * 0.3));
  });
  return lines;
}

/**
 * `text` shortened until it and the mark fit `width`: whole words first, then -
 * for a line that is one long word - characters.
 */
function withTruncationMark(text: string, width: number, size: number, weight: FontWeight, measure: Measure): string {
  const fits = (candidate: string) => measure(candidate + TRUNCATION_MARK, size, weight) <= width;
  const words = text.split(" ").filter((word) => word !== "");
  while (words.length > 1 && !fits(words.join(" "))) {
    words.pop();
  }
  const chars = Array.from(words.join(" "));
  while (chars.length > 0 && !fits(chars.join(""))) {
    chars.pop();
  }
  return chars.join("").trimEnd() + TRUNCATION_MARK;
}

/** As many of `lines` as fit `available`; if any were left out, the last one kept ends with the mark. */
function truncateLines(lines: readonly FlowLine[], available: number, width: number, measure: Measure): FlowLine[] {
  const kept: FlowLine[] = [];
  let height = 0;
  for (const line of lines) {
    // At least one line, so an absurdly short cell still says whose day it is.
    if (kept.length > 0 && height + lineHeight(line) > available) {
      break;
    }
    kept.push(line);
    height += lineHeight(line);
  }
  if (kept.length < lines.length) {
    const last = kept[kept.length - 1];
    kept[kept.length - 1] = { ...last, text: withTruncationMark(last.text, width, last.size, last.weight, measure) };
  }
  return kept;
}

export function layoutMonthGrid(doc: PrintDocument, measure: Measure): PdfLayout {
  const spec = A4_LANDSCAPE;
  const { titleLines, headersTop, legendLines, legendTop, cells } = gridFrame(doc, measure);
  const textWidth = (cell: GridCell) => cell.width - 2 * GRID_CELL_PADDING;
  const available = (cell: GridCell) => cell.height - 2 * GRID_CELL_PADDING;

  const linesAt = (size: number) =>
    cells.map((cell) => (cell.day === null ? [] : cellLines(cell.day, textWidth(cell), size, measure)));
  const fitsAt = (lines: FlowLine[][]) =>
    lines.every((cellText, index) => totalHeight(cellText) <= available(cells[index]));

  const floor = GRID_SIZES[GRID_SIZES.length - 1];
  let size = floor;
  let lines = linesAt(floor);
  for (const candidate of GRID_SIZES) {
    const attempt = candidate === floor ? lines : linesAt(candidate);
    if (fitsAt(attempt)) {
      size = candidate;
      lines = attempt;
      break;
    }
  }

  const items: LayoutItem[] = [...placeLines(titleLines, spec.margin, spec.height - spec.margin)];
  // The first row's cells give the columns; every row has all five slots.
  cells.slice(0, WEEK_DAYS).forEach((cell, column) => {
    const weekday = flowText(GRID_WEEKDAYS[column], textWidth(cell), GRID_WEEKDAY_SIZE, "bold", measure);
    items.push(...placeLines(weekday, cell.x + GRID_CELL_PADDING, headersTop));
  });
  cells.forEach((cell, index) => {
    if (cell.day === null) {
      return;
    }
    const cellText = truncateLines(lines[index], available(cell), textWidth(cell), measure);
    items.push(...placeLines(cellText, cell.x + GRID_CELL_PADDING, cell.y + cell.height - GRID_CELL_PADDING));
    if (cell.day.status === "draft") {
      // The whole cell, not the height of its text: the grid stays a grid of
      // equal rectangles, and a frame is recognisable at a glance.
      items.push({ kind: "dashed-box", x: cell.x, y: cell.y, width: cell.width, height: cell.height });
    }
  });
  items.push(...placeLines(legendLines, spec.margin, legendTop));

  return { kind: "month-grid", bodySize: size, pages: [{ spec, items }] };
}
