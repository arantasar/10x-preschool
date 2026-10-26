import { describe, expect, it } from "vitest";

import { fullMonth, LONGEST_MONTH, MONTH } from "./__fixtures__/month";
import { planView, prose } from "./__fixtures__/week";
import { GRID_CELL_PADDING, layoutMonthGrid, monthGridCells, type GridCell } from "./grid-layout";
import { A4_LANDSCAPE, type LayoutItem, type LayoutPage, type Measure, type PdfLayout } from "./layout";
import {
  BRAND_URL,
  buildPrintMonth,
  DRAFT_TAG,
  EMPTY_DAY_NOTE,
  GRID_LEGEND_ITEMS,
  GROUP_LABEL,
  MONTH_EYEBROW,
  TRUNCATION_MARK,
  type PrintDocument,
} from "./model";
import type { DayPlanView } from "@/types";

// The same deterministic stand-in as `layout.test.ts`.
const measure: Measure = (text, size, face, tracking = 0) =>
  text.length * size * (face === "serif" ? 0.55 : 0.5) * (face === "regular" ? 1 : 1.1) +
  tracking * Math.max(0, text.length - 1);

type TextItem = Extract<LayoutItem, { kind: "text" }>;
type BoxItem = Extract<LayoutItem, { kind: "box" }>;

const ACCEPTED_AT = "2026-09-23T09:31:00Z";

function texts(page: LayoutPage): TextItem[] {
  return page.items.filter((item): item is TextItem => item.kind === "text");
}

function boxes(page: LayoutPage): BoxItem[] {
  return page.items.filter((item): item is BoxItem => item.kind === "box");
}

function width(item: TextItem): number {
  return measure(item.text, item.size, item.face, item.tracking);
}

function inside(item: { x: number; y: number }, cell: GridCell): boolean {
  return item.x >= cell.x && item.x < cell.x + cell.width && item.y >= cell.y && item.y <= cell.y + cell.height;
}

function cellTexts(page: LayoutPage, cell: GridCell): TextItem[] {
  return texts(page).filter((item) => inside(item, cell));
}

/** The cell's own outline - the box whose corner is the cell's. */
function outlineOf(page: LayoutPage, cell: GridCell): BoxItem | undefined {
  return boxes(page).find((box) => box.x === cell.x && box.y === cell.y && box.width === cell.width);
}

function cellFor(doc: PrintDocument, date: string): GridCell {
  const cell = monthGridCells(doc, measure).find((candidate) => candidate.day?.date === date);
  if (!cell) throw new Error(`no cell for ${date}`);
  return cell;
}

function grid(month: string, plans: Record<string, DayPlanView>): { doc: PrintDocument; layout: PdfLayout } {
  const doc = buildPrintMonth(month, plans);
  return { doc, layout: layoutMonthGrid(doc, measure) };
}

/**
 * 23 working days, each with a 2000-character hasło and a theme longer than
 * any a plan can hold - enough to overflow a cell at the floor. The long titles
 * are there to prove they stay off the grid.
 */
function overflowingMonth(): Record<string, DayPlanView> {
  return fullMonth(LONGEST_MONTH, {
    prompt: prose(2000),
    theme: prose(1000),
    activities: [1, 2, 3].map(() => ({ title: prose(200), description: "opis" })),
  });
}

function expectEverythingInPlace(doc: PrintDocument, layout: PdfLayout): void {
  const [page] = layout.pages;
  const { width: pageWidth, height, margin } = page.spec;
  const cells = monthGridCells(doc, measure);
  for (const item of texts(page)) {
    expect(item.x).toBeGreaterThanOrEqual(margin);
    expect(item.x + width(item)).toBeLessThanOrEqual(pageWidth - margin + 1e-6);
    expect(item.y + item.size).toBeLessThanOrEqual(height - margin + 1e-6);
    expect(item.y - 0.3 * item.size).toBeGreaterThanOrEqual(margin - 1e-6);
    const cell = cells.find((candidate) => inside(item, candidate));
    if (cell) {
      expect(item.x + width(item)).toBeLessThanOrEqual(cell.x + cell.width - GRID_CELL_PADDING + 1e-6);
      expect(item.y + item.size).toBeLessThanOrEqual(cell.y + cell.height - GRID_CELL_PADDING + 1e-6);
      expect(item.y - 0.3 * item.size).toBeGreaterThanOrEqual(cell.y - 1e-6);
    }
  }
  for (const box of boxes(page)) {
    expect(box.x).toBeGreaterThanOrEqual(margin - 1e-6);
    expect(box.x + box.width).toBeLessThanOrEqual(pageWidth - margin + 1e-6);
    expect(box.y).toBeGreaterThanOrEqual(margin - 1e-6);
    const cell = cells.find((candidate) => inside(box, candidate));
    if (cell && box !== outlineOf(page, cell)) {
      expect(box.x + box.width).toBeLessThanOrEqual(cell.x + cell.width - GRID_CELL_PADDING + 1e-6);
      expect(box.y + box.height).toBeLessThanOrEqual(cell.y + cell.height + 1e-6);
    }
  }
}

describe("layoutMonthGrid — one sheet", () => {
  it("puts a typical month on one landscape page above the 7 pt floor", () => {
    const { layout } = grid(MONTH, fullMonth());

    expect(layout.kind).toBe("month-grid");
    expect(layout.pages).toHaveLength(1);
    expect(layout.pages[0].spec).toBe(A4_LANDSCAPE);
    expect(layout.pages[0].spec.width).toBeGreaterThan(layout.pages[0].spec.height);
    expect(layout.bodySize).toBeGreaterThan(7);
  });

  it("puts an empty month on one page", () => {
    const { layout } = grid(MONTH, {});

    expect(layout.pages).toHaveLength(1);
    expect(layout.pages[0].spec).toBe(A4_LANDSCAPE);
  });

  it("keeps even the fullest possible month - six rows - on one page, at 7 pt", () => {
    const { doc, layout } = grid(LONGEST_MONTH, overflowingMonth());

    expect(doc.rows.length).toBeGreaterThanOrEqual(5);
    expect(layout.pages).toHaveLength(1);
    expect(layout.pages[0].spec).toBe(A4_LANDSCAPE);
    expect(layout.bodySize).toBe(7);
  });

  it("heads the sheet with the eyebrow above the month, the group blank and the footer url", () => {
    const { doc, layout } = grid(MONTH, {});
    const text = texts(layout.pages[0]);
    const eyebrow = text.find((item) => item.text === MONTH_EYEBROW);
    const title = text.find((item) => item.text === doc.sheetTitle);

    expect(doc.sheetTitle).toBe("Wrzesień 2026");
    expect(eyebrow?.y).toBeGreaterThan(title?.y ?? Number.POSITIVE_INFINITY);
    expect(text.map((item) => item.text)).toEqual(expect.arrayContaining([GROUP_LABEL, BRAND_URL]));
    expect(layout.pages[0].items.some((item) => item.kind === "mark")).toBe(true);
  });

  it("carries a legend with a sample outline for each of the three states", () => {
    const { layout } = grid(MONTH, {});
    const [page] = layout.pages;
    const text = texts(page).map((item) => item.text);
    const lowest = Math.min(...monthGridCells(buildPrintMonth(MONTH, {}), measure).map((cell) => cell.y));
    const samples = boxes(page).filter((box) => box.y + box.height < lowest);

    for (const { label } of GRID_LEGEND_ITEMS) {
      expect(text).toContain(label);
    }
    expect(samples.map((box) => [box.stroke, box.dashed])).toEqual([
      ["frame", false],
      ["draft", true],
      ["soft", false],
    ]);
  });

  it("keeps every line inside the page margins and inside its own cell", () => {
    for (const [month, plans] of [
      [MONTH, {}],
      [MONTH, fullMonth()],
      [LONGEST_MONTH, overflowingMonth()],
    ] as const) {
      const { doc, layout } = grid(month, plans);
      expectEverythingInPlace(doc, layout);
    }
  });
});

describe("layoutMonthGrid — cells", () => {
  const plans = {
    "2026-09-14": planView("2026-09-14", { acceptedAt: null }),
    "2026-09-15": planView("2026-09-15", { acceptedAt: ACCEPTED_AT }),
  };

  it("outlines a draft cell with a dashed frame and tags it „SZKIC”", () => {
    const { doc, layout } = grid(MONTH, plans);
    const [page] = layout.pages;
    const cell = cellFor(doc, "2026-09-14");

    expect(outlineOf(page, cell)).toMatchObject({ dashed: true, stroke: "draft" });
    expect(cellTexts(page, cell).map((item) => item.text)).toContain(DRAFT_TAG);
  });

  it("outlines an accepted cell with a solid frame, and no tag", () => {
    const { doc, layout } = grid(MONTH, plans);
    const [page] = layout.pages;
    const cell = cellFor(doc, "2026-09-15");

    expect(outlineOf(page, cell)).toMatchObject({ dashed: false, stroke: "frame" });
    expect(cellTexts(page, cell).map((item) => item.text)).not.toContain(DRAFT_TAG);
  });

  it("shows the day's number, the hasło and the theme, but no activity - neither title nor description", () => {
    const { doc, layout } = grid(MONTH, {
      "2026-09-15": planView("2026-09-15", {
        acceptedAt: ACCEPTED_AT,
        prompt: "Kasztany",
        theme: "Ludziki",
        activities: [
          { title: "Pierwsza", description: "OPIS-PIERWSZEJ" },
          { title: "Druga", description: "OPIS-DRUGIEJ" },
          { title: "Trzecia", description: "OPIS-TRZECIEJ" },
        ],
      }),
    });
    const text = cellTexts(layout.pages[0], cellFor(doc, "2026-09-15")).map((item) => item.text);

    expect(text).toEqual(["15", "Kasztany", "Ludziki"]);
  });

  it("gives a day without a plan a pale frame and two lines to write on, not a sentence", () => {
    const { doc, layout } = grid(MONTH, {});
    const [page] = layout.pages;
    const cell = cellFor(doc, "2026-09-01");
    const rules = page.items.filter((item) => item.kind === "rule" && inside({ x: item.x1, y: item.y1 }, cell));

    expect(outlineOf(page, cell)).toMatchObject({ dashed: false, stroke: "soft" });
    expect(rules).toHaveLength(2);
    expect(cellTexts(page, cell).map((item) => item.text)).toEqual(["1"]);
    expect(texts(page).map((item) => item.text)).not.toContain(EMPTY_DAY_NOTE);
  });

  it("hatches a slot outside the month and prints nothing in it - not a day, not a frame", () => {
    const { doc, layout } = grid(MONTH, {});
    const [page] = layout.pages;
    const outside = monthGridCells(doc, measure).filter((cell) => cell.day === null);
    const hatches = page.items.filter((item) => item.kind === "hatch");

    // 31 August opens the first row, 1-2 October close the last.
    expect(outside.map((cell) => [cell.row, cell.column])).toEqual([
      [0, 0],
      [4, 3],
      [4, 4],
    ]);
    expect(hatches).toHaveLength(3);
    for (const cell of outside) {
      expect(hatches.some((item) => item.x === cell.x && item.y === cell.y)).toBe(true);
      expect(cellTexts(page, cell)).toEqual([]);
      expect(outlineOf(page, cell)).toBeUndefined();
    }
  });

  it("cuts a very long hasło to one line in its chip, ending with the mark", () => {
    const { doc, layout } = grid(MONTH, {
      "2026-09-15": planView("2026-09-15", { acceptedAt: ACCEPTED_AT, prompt: `Hasło ${prose(2000)}`, theme: null }),
    });
    const lines = cellTexts(layout.pages[0], cellFor(doc, "2026-09-15")).filter((item) =>
      item.text.startsWith("Hasło"),
    );

    expect(lines).toHaveLength(1);
    expect(lines[0].text.endsWith(TRUNCATION_MARK)).toBe(true);
  });

  it("cuts a theme that does not fit at 7 pt, ending its last line with the mark inside the cell", () => {
    const { doc, layout } = grid(LONGEST_MONTH, overflowingMonth());
    const cell = cellFor(doc, "2026-12-01");
    const lines = cellTexts(layout.pages[0], cell).filter((item) => item.face === "regular");
    const last = lines[lines.length - 1];

    expect(lines.length).toBeGreaterThan(1);
    expect(last.text.endsWith(TRUNCATION_MARK)).toBe(true);
    expect(width(last)).toBeLessThanOrEqual(cell.width - 2 * GRID_CELL_PADDING);
    expect(lines.slice(0, -1).some((line) => line.text.endsWith(TRUNCATION_MARK))).toBe(false);
  });

  it("does not mark a cell that fits", () => {
    const { layout } = grid(MONTH, fullMonth());

    expect(texts(layout.pages[0]).some((item) => item.text.endsWith(TRUNCATION_MARK))).toBe(false);
  });
});
