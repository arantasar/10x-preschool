import { WEEK_DAYS } from "@/lib/day-plan-limits";
import {
  A4_LANDSCAPE,
  flowText,
  lineHeight,
  placeLines,
  totalHeight,
  type FlowLine,
  type FontFace,
  type LayoutItem,
  type Measure,
  type PdfLayout,
} from "@/lib/plan-pdf/layout";
import {
  DRAFT_TAG,
  GRID_LEGEND_ITEMS,
  GRID_WEEKDAYS,
  TRUNCATION_MARK,
  type PrintDay,
  type PrintDayStatus,
  type PrintDocument,
} from "@/lib/plan-pdf/model";
import { chip, sheetFrame, tag, textItem } from "@/lib/plan-pdf/sheet";

/**
 * The month on one landscape sheet (`S-14`, drawn as the design's PNG 20 since
 * `S-29`): a row per week, a column per working day, and in each cell only what
 * fits a glance - the date's number, the hasło in a chip, the theme. No
 * activities, not even their titles: three titles in a cell a fifth of a page
 * wide cut every full day (Janusz, 2026-09-27, after looking at the printed
 * grid). The activities are what the "tygodniami" layout is for.
 *
 * A cell says its state by its outline and by text, never by colour alone, so
 * a b/w printer keeps it: a solid frame is accepted, a dashed one with „SZKIC”
 * is a draft, a pale one with two writing lines is a day without a plan. A day
 * of the neighbouring month is hatched and says nothing.
 *
 * Always exactly one page. The theme's size is the largest candidate at which
 * every cell fits; at the 7 pt floor a cell that still does not fit is cut, and
 * its last visible line ends with {@link TRUNCATION_MARK}. The cut is measured
 * with the same {@link Measure} the renderer draws with, so the mark never
 * pushes a line past the cell's edge.
 *
 * `layout.ts` imports this module and this module imports `layout.ts`; nothing
 * here reads an import at module level, only inside functions, so the cycle is
 * harmless whichever side loads first.
 */

/** Candidate theme sizes, largest first. 7 pt is the legibility floor, as for the week. */
export const GRID_SIZES: readonly number[] = [9, 8.5, 8, 7.5, 7];

const GRID_WEEKDAY_SIZE = 8.25;
const GRID_WEEKDAY_TRACKING = 0.9;
const GRID_COLUMN_GAP = 7.5;
const GRID_ROW_GAP = 6;
const GRID_HEADER_GAP = 6;
const GRID_NUMBER_SIZE = 15;
const GRID_CHIP_SIZE = 7.5;
const GRID_TAG_SIZE = 7;
const GRID_RADIUS = 7.5;
const GRID_NOTE_LINE_GAP = 6.75;
const LEGEND_SAMPLE_WIDTH = 13.5;
const LEGEND_SAMPLE_HEIGHT = 8.25;
const LEGEND_GAP = 13.5;
/** Room between a cell's edge and its text. */
export const GRID_CELL_PADDING = 7;

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
  readonly frameItems: LayoutItem[];
  readonly headersBaseline: number;
  readonly footerBaseline: number;
  readonly footerSize: number;
  readonly bodyTop: number;
  readonly bodyBottom: number;
  readonly cells: GridCell[];
}

function gridFrame(doc: PrintDocument, measure: Measure): GridFrame {
  const spec = A4_LANDSCAPE;
  const contentWidth = spec.width - 2 * spec.margin;
  const frame = sheetFrame(
    spec,
    { eyebrow: doc.eyebrow, title: doc.sheetTitle, note: null, continued: false, stacked: true, footerRule: false },
    measure,
  );

  const headersBaseline = frame.contentTop - GRID_WEEKDAY_SIZE;
  const gridTop = headersBaseline - GRID_WEEKDAY_SIZE * 0.3 - GRID_HEADER_GAP;
  const gridBottom = frame.contentBottom;

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
  return {
    frameItems: frame.items,
    headersBaseline,
    footerBaseline: frame.footerBaseline,
    footerSize: frame.footerSize,
    bodyTop: frame.contentTop,
    bodyBottom: frame.contentBottom,
    cells,
  };
}

/** Every slot's rectangle - the layout's own geometry, exported so a test can check what lands inside it. */
export function monthGridCells(doc: PrintDocument, measure: Measure): GridCell[] {
  return gridFrame(doc, measure).cells;
}

/** The outline that says a cell's state. */
function cellOutline(status: PrintDayStatus, x: number, y: number, width: number, height: number, radius: number) {
  const outline: LayoutItem = {
    kind: "box",
    x,
    y,
    width,
    height,
    radius,
    stroke: status === "accepted" ? "frame" : status === "draft" ? "draft" : "soft",
    strokeWidth: status === "draft" ? 0.9 : 0.75,
    dashed: status === "draft",
  };
  return outline;
}

/** The cell's top row: the number, then the chip, and the draft tag at the right edge. */
function cellTopRow(day: PrintDay, cell: GridCell, measure: Measure): LayoutItem[] {
  const left = cell.x + GRID_CELL_PADDING;
  const right = cell.x + cell.width - GRID_CELL_PADDING;
  const baseline = cell.y + cell.height - GRID_CELL_PADDING - GRID_NUMBER_SIZE;
  const gap = 4.5;
  const items: LayoutItem[] = [
    textItem(left, baseline, day.dayNumber, GRID_NUMBER_SIZE, "serif", day.status === "empty" ? "faint" : "ink"),
  ];
  let chipRight = right;
  if (day.status === "draft") {
    const draft = tag(DRAFT_TAG, GRID_TAG_SIZE, measure);
    items.push(...draft.draw(right - draft.width, baseline - GRID_TAG_SIZE * 0.4));
    chipRight = right - draft.width - gap;
  }
  if (day.prompt !== null) {
    const chipLeft = left + measure(day.dayNumber, GRID_NUMBER_SIZE, "serif") + gap;
    const pill = chip(day.prompt, chipRight - chipLeft, GRID_CHIP_SIZE, measure);
    if (pill !== null) {
      items.push(...pill.draw(chipLeft, baseline - GRID_CHIP_SIZE * 0.42));
    }
  }
  return items;
}

/** Height of a cell's top row, from the cell's top edge to where the theme may start. */
const TOP_ROW = GRID_CELL_PADDING + GRID_NUMBER_SIZE * 1.3;

function themeLines(day: PrintDay, width: number, size: number, measure: Measure): FlowLine[] {
  return day.theme === null ? [] : flowText(day.theme, width, size, "regular", measure);
}

/**
 * `text` shortened until it and the mark fit `width`: whole words first, then -
 * for a line that is one long word - characters.
 */
function withTruncationMark(text: string, width: number, size: number, face: FontFace, measure: Measure): string {
  const fits = (candidate: string) => measure(candidate + TRUNCATION_MARK, size, face) <= width;
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
    if (height + lineHeight(line) > available) {
      break;
    }
    kept.push(line);
    height += lineHeight(line);
  }
  if (kept.length < lines.length && kept.length > 0) {
    const last = kept[kept.length - 1];
    kept[kept.length - 1] = { ...last, text: withTruncationMark(last.text, width, last.size, last.face, measure) };
  }
  return kept;
}

/** Two pale lines at the bottom of an empty day's cell, to write on. */
function noteLines(cell: GridCell): LayoutItem[] {
  const x1 = cell.x + GRID_CELL_PADDING;
  const x2 = cell.x + cell.width - GRID_CELL_PADDING;
  return [0, 1].map((index) => {
    const y = cell.y + GRID_CELL_PADDING + index * GRID_NOTE_LINE_GAP;
    return { kind: "rule", x1, y1: y, x2, y2: y, color: "soft", width: 0.75 } satisfies LayoutItem;
  });
}

function legend(frame: GridFrame, measure: Measure): LayoutItem[] {
  const items: LayoutItem[] = [];
  const size = frame.footerSize;
  let x = A4_LANDSCAPE.margin;
  for (const { status, label } of GRID_LEGEND_ITEMS) {
    items.push(cellOutline(status, x, frame.footerBaseline - 1, LEGEND_SAMPLE_WIDTH, LEGEND_SAMPLE_HEIGHT, 2.25));
    x += LEGEND_SAMPLE_WIDTH + 4.5;
    items.push(textItem(x, frame.footerBaseline, label, size, "regular", "muted"));
    x += measure(label, size, "regular") + LEGEND_GAP;
  }
  return items;
}

export function layoutMonthGrid(doc: PrintDocument, measure: Measure): PdfLayout {
  const spec = A4_LANDSCAPE;
  const frame = gridFrame(doc, measure);
  const { cells } = frame;
  const textWidth = (cell: GridCell) => cell.width - 2 * GRID_CELL_PADDING;
  const available = (cell: GridCell) => cell.height - TOP_ROW - GRID_CELL_PADDING;

  const linesAt = (size: number) =>
    cells.map((cell) => (cell.day === null ? [] : themeLines(cell.day, textWidth(cell), size, measure)));
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

  const items: LayoutItem[] = [...frame.frameItems];
  // The first row's cells give the columns; every row has all five slots.
  cells.slice(0, WEEK_DAYS).forEach((cell, column) => {
    const weekday = GRID_WEEKDAYS[column].toLocaleUpperCase("pl-PL");
    items.push(
      textItem(
        cell.x + GRID_CELL_PADDING,
        frame.headersBaseline,
        weekday,
        GRID_WEEKDAY_SIZE,
        "bold",
        "muted",
        GRID_WEEKDAY_TRACKING,
      ),
    );
  });
  cells.forEach((cell, index) => {
    const { day } = cell;
    if (day === null) {
      items.push({ kind: "hatch", x: cell.x, y: cell.y, width: cell.width, height: cell.height });
      return;
    }
    items.push(cellOutline(day.status, cell.x, cell.y, cell.width, cell.height, GRID_RADIUS));
    items.push(...cellTopRow(day, cell, measure));
    if (day.status === "empty") {
      items.push(...noteLines(cell));
      return;
    }
    const cellText = truncateLines(lines[index], available(cell), textWidth(cell), measure);
    items.push(...placeLines(cellText, cell.x + GRID_CELL_PADDING, cell.y + cell.height - TOP_ROW));
  });
  items.push(...legend(frame, measure));

  return {
    kind: "month-grid",
    bodySize: size,
    pages: [{ spec, items, body: { top: frame.bodyTop, bottom: frame.bodyBottom } }],
  };
}
