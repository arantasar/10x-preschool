import { describe, expect, it } from "vitest";

import { fullMonth, LONGEST_MONTH, MONTH } from "./__fixtures__/month";
import { planView, prose } from "./__fixtures__/week";
import { GRID_CELL_PADDING, layoutMonthGrid, monthGridCells, type GridCell } from "./grid-layout";
import { A4_LANDSCAPE, type LayoutItem, type LayoutPage, type Measure, type PdfLayout } from "./layout";
import {
  buildPrintMonth,
  DRAFT_LABEL,
  DRAFT_SHORT_LABEL,
  EMPTY_DAY_NOTE,
  GRID_LEGEND,
  TRUNCATION_MARK,
  type PrintDocument,
} from "./model";
import type { DayPlanView } from "@/types";

// The same deterministic stand-in as `layout.test.ts`: every character half an
// em wide, bold a tenth wider.
const measure: Measure = (text, size, weight) => text.length * size * 0.5 * (weight === "bold" ? 1.1 : 1);

type TextItem = Extract<LayoutItem, { kind: "text" }>;
type BoxItem = Extract<LayoutItem, { kind: "dashed-box" }>;

function texts(page: LayoutPage): TextItem[] {
  return page.items.filter((item): item is TextItem => item.kind === "text");
}

function boxes(page: LayoutPage): BoxItem[] {
  return page.items.filter((item): item is BoxItem => item.kind === "dashed-box");
}

function inside(item: TextItem, cell: GridCell): boolean {
  return item.x >= cell.x && item.x < cell.x + cell.width && item.y >= cell.y && item.y <= cell.y + cell.height;
}

function cellTexts(page: LayoutPage, cell: GridCell): TextItem[] {
  return texts(page).filter((item) => inside(item, cell));
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

/** 23 working days, each with a 2000-character hasło and three 200-character titles. */
function overflowingMonth(): Record<string, DayPlanView> {
  return fullMonth(LONGEST_MONTH, {
    prompt: prose(2000),
    activities: [1, 2, 3].map(() => ({ title: prose(200), description: "opis" })),
  });
}

function expectEverythingInPlace(doc: PrintDocument, layout: PdfLayout): void {
  const [page] = layout.pages;
  const { width, height, margin } = page.spec;
  const cells = monthGridCells(doc, measure);
  for (const item of texts(page)) {
    expect(item.x).toBeGreaterThanOrEqual(margin);
    expect(item.x + measure(item.text, item.size, item.weight)).toBeLessThanOrEqual(width - margin + 1e-6);
    expect(item.y + item.size).toBeLessThanOrEqual(height - margin + 1e-6);
    expect(item.y - 0.3 * item.size).toBeGreaterThanOrEqual(margin - 1e-6);
    const cell = cells.find((candidate) => inside(item, candidate));
    if (cell) {
      expect(item.x + measure(item.text, item.size, item.weight)).toBeLessThanOrEqual(
        cell.x + cell.width - GRID_CELL_PADDING + 1e-6,
      );
      expect(item.y - 0.3 * item.size).toBeGreaterThanOrEqual(cell.y - 1e-6);
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

  it("puts an empty month on one page, every working day saying it has no plan", () => {
    const { layout } = grid(MONTH, {});
    const text = texts(layout.pages[0]).map((item) => item.text);

    expect(layout.pages).toHaveLength(1);
    expect(text.filter((line) => line === EMPTY_DAY_NOTE)).toHaveLength(22);
  });

  it("keeps even the fullest possible month on one page, at 7 pt", () => {
    const { layout } = grid(LONGEST_MONTH, overflowingMonth());

    expect(layout.pages).toHaveLength(1);
    expect(layout.bodySize).toBe(7);
  });

  it("carries the legend", () => {
    const { layout } = grid(MONTH, {});

    expect(texts(layout.pages[0]).map((item) => item.text)).toContain(GRID_LEGEND);
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
    "2026-09-15": planView("2026-09-15", { acceptedAt: "2026-09-23T09:31:00Z" }),
  };

  it("frames a draft cell whole and labels it", () => {
    const { doc, layout } = grid(MONTH, plans);
    const [page] = layout.pages;
    const cell = cellFor(doc, "2026-09-14");

    expect(boxes(page)).toEqual([{ kind: "dashed-box", x: cell.x, y: cell.y, width: cell.width, height: cell.height }]);
    expect(cellTexts(page, cell).map((item) => item.text)).toContain(DRAFT_SHORT_LABEL);
  });

  it("neither frames nor labels an accepted cell", () => {
    const { doc, layout } = grid(MONTH, plans);
    const [page] = layout.pages;
    const cell = cellFor(doc, "2026-09-15");
    const text = cellTexts(page, cell).map((item) => item.text);

    expect(boxes(page).some((box) => box.x === cell.x && box.y === cell.y)).toBe(false);
    expect(text).not.toContain(DRAFT_SHORT_LABEL);
    expect(text.join("\n")).not.toContain(DRAFT_LABEL);
  });

  it("shows the hasło, the theme and the three titles, but no description", () => {
    const { doc, layout } = grid(MONTH, {
      "2026-09-15": planView("2026-09-15", {
        acceptedAt: "2026-09-23T09:31:00Z",
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

    expect(text).toEqual(["15 września", "Hasło: Kasztany", "Temat: Ludziki", "1. Pierwsza", "2. Druga", "3. Trzecia"]);
  });

  it("says an unplanned day of the month has no plan, and draws nothing in a slot outside it", () => {
    const { doc, layout } = grid(MONTH, {});
    const [page] = layout.pages;
    const cells = monthGridCells(doc, measure);
    const outside = cells.filter((cell) => cell.day === null);

    expect(cellTexts(page, cellFor(doc, "2026-09-01")).map((item) => item.text)).toContain(EMPTY_DAY_NOTE);
    // 31 August opens the first row, 1-2 October close the last.
    expect(outside.map((cell) => [cell.row, cell.column])).toEqual([
      [0, 0],
      [4, 3],
      [4, 4],
    ]);
    for (const cell of outside) {
      expect(cellTexts(page, cell)).toEqual([]);
      expect(boxes(page).some((box) => box.x === cell.x && box.y === cell.y)).toBe(false);
    }
  });

  it("cuts a cell that does not fit at 7 pt, ending its last line with the mark inside the cell", () => {
    const { doc, layout } = grid(LONGEST_MONTH, overflowingMonth());
    const cell = cellFor(doc, "2026-12-01");
    const lines = cellTexts(layout.pages[0], cell);
    const last = lines[lines.length - 1];

    expect(last.text.endsWith(TRUNCATION_MARK)).toBe(true);
    expect(measure(last.text, last.size, last.weight)).toBeLessThanOrEqual(cell.width - 2 * GRID_CELL_PADDING);
    expect(lines.slice(0, -1).some((line) => line.text.endsWith(TRUNCATION_MARK))).toBe(false);
  });

  it("does not mark a cell that fits", () => {
    const { layout } = grid(MONTH, fullMonth());

    expect(texts(layout.pages[0]).some((item) => item.text.endsWith(TRUNCATION_MARK))).toBe(false);
  });
});
