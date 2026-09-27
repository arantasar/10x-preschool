import { describe, expect, it } from "vitest";

import { fullMonth, MONTH } from "./__fixtures__/month";
import { fullWeek, planView, prose, WEEK_DAYS_ISO, WEEK_START } from "./__fixtures__/week";
import {
  A4_LANDSCAPE,
  A4_PORTRAIT,
  layoutDocument,
  normalizeText,
  wrapText,
  type LayoutItem,
  type LayoutPage,
  type Measure,
  type PdfLayout,
} from "./layout";
import { buildPrintMonth, buildPrintWeek, CONTINUED_MARK, DRAFT_LABEL, EMPTY_DAY_NOTE, printDays } from "./model";
import type { DayPlanView } from "@/types";

// Deterministic stand-in for a real font: every character half an em wide,
// bold a tenth wider. Close enough to Noto Sans that the thresholds below
// describe realistic weeks.
const measure: Measure = (text, size, weight) => text.length * size * 0.5 * (weight === "bold" ? 1.1 : 1);

type TextItem = Extract<LayoutItem, { kind: "text" }>;

function texts(page: LayoutPage): TextItem[] {
  return page.items.filter((item): item is TextItem => item.kind === "text");
}

function pageText(page: LayoutPage): string {
  return texts(page)
    .map((item) => item.text)
    .join("\n");
}

function hasDashedBox(page: LayoutPage): boolean {
  return page.items.some((item) => item.kind === "dashed-box");
}

function layout(plans: Record<string, DayPlanView>, kind: PdfLayout["kind"]): PdfLayout {
  return layoutDocument(buildPrintWeek(WEEK_START, WEEK_DAYS_ISO, plans), kind, measure);
}

function expectInsideMargins(result: PdfLayout): void {
  for (const page of result.pages) {
    const { width, height, margin } = page.spec;
    for (const item of texts(page)) {
      expect(item.x).toBeGreaterThanOrEqual(margin);
      expect(item.x + measure(item.text, item.size, item.weight)).toBeLessThanOrEqual(width - margin + 1e-6);
      expect(item.y + item.size).toBeLessThanOrEqual(height - margin + 1e-6);
      expect(item.y - 0.3 * item.size).toBeGreaterThanOrEqual(margin - 1e-6);
    }
    for (const item of page.items) {
      if (item.kind !== "dashed-box") continue;
      expect(item.x).toBeGreaterThanOrEqual(margin - 1e-6);
      expect(item.y).toBeGreaterThanOrEqual(margin - 1e-6);
      expect(item.x + item.width).toBeLessThanOrEqual(width - margin + 1e-6);
      expect(item.y + item.height).toBeLessThanOrEqual(height - margin + 1e-6);
    }
  }
}

describe("wrapText", () => {
  it("breaks at spaces", () => {
    // 10 pt → 5 pt per character; 50 pt fits ten characters.
    expect(wrapText("ala ma kota i psa", 50, 10, "regular", measure)).toEqual(["ala ma", "kota i psa"]);
  });

  it("treats a newline as a hard break, including CRLF", () => {
    expect(wrapText("raz\r\ndwa\ntrzy", 500, 10, "regular", measure)).toEqual(["raz", "dwa", "trzy"]);
  });

  it("breaks a word longer than the column between characters", () => {
    const lines = wrapText("abcdefghijklmnopqrstuvwxy", 50, 10, "regular", measure);

    expect(lines).toEqual(["abcdefghij", "klmnopqrst", "uvwxy"]);
  });

  it("returns no lines for empty or blank text", () => {
    expect(wrapText("", 100, 10, "regular", measure)).toEqual([]);
    expect(wrapText("  \n ", 100, 10, "regular", measure)).toEqual([]);
  });

  it("never returns a line wider than the column", () => {
    const text = `${prose(1500)} ${"x".repeat(80)}\n${prose(300)}`;
    const lines = wrapText(text, 137, 9, "bold", measure);

    expect(lines.length).toBeGreaterThan(10);
    for (const line of lines) {
      expect(measure(line, 9, "bold")).toBeLessThanOrEqual(137);
    }
  });
});

describe("normalizeText", () => {
  it("replaces characters the font cannot draw, and keeps Polish ones", () => {
    const hasGlyph = (char: string) => (char.codePointAt(0) ?? 0) < 0x2000;

    expect(normalizeText("Zażółć 🍂 gęślą\tjaźń", hasGlyph)).toBe("Zażółć ? gęślą jaźń");
  });

  it("keeps one blank line out of a run, and leaves a single break alone", () => {
    expect(normalizeText(`a${"\n".repeat(500)}b`)).toBe("a\n\nb");
    expect(normalizeText("a\r\n \r\n  \n\nb")).toBe("a\n\nb");
    expect(normalizeText("a\nb\n\nc")).toBe("a\nb\n\nc");
  });
});

describe("layoutDocument — day per page", () => {
  it("gives five short days exactly five portrait pages", () => {
    const result = layout(fullWeek(), "day-per-page");

    expect(result.pages).toHaveLength(5);
    for (const page of result.pages) {
      expect(page.spec).toBe(A4_PORTRAIT);
    }
    expect(result.bodySize).toBe(11);
  });

  it("starts each day on its own page, in calendar order", () => {
    const week = buildPrintWeek(WEEK_START, WEEK_DAYS_ISO, fullWeek());
    const result = layoutDocument(week, "day-per-page", measure);

    result.pages.forEach((page, index) => {
      expect(pageText(page)).toContain(printDays(week)[index].heading);
    });
  });

  it("continues an overlong day onto further pages marked (cd.)", () => {
    const date = WEEK_DAYS_ISO[1];
    const plans = { ...fullWeek(), [date]: planView(date, { descriptionLength: 4000 }) };
    const result = layout(plans, "day-per-page");
    const heading = printDays(buildPrintWeek(WEEK_START, WEEK_DAYS_ISO, plans))[1].heading;

    expect(result.pages.length).toBeGreaterThan(5);
    const continuation = result.pages[2];
    expect(pageText(continuation)).toContain(`${heading} ${CONTINUED_MARK}`);
    expect(pageText(result.pages[1])).not.toContain(CONTINUED_MARK);
    expectInsideMargins(result);
  });

  it("frames and labels a draft day, on every page it spans", () => {
    const date = WEEK_DAYS_ISO[0];
    const plans = { [date]: planView(date, { acceptedAt: null, descriptionLength: 4000 }) };
    const result = layout(plans, "day-per-page");
    const draftPages = result.pages.filter((page) =>
      pageText(page).includes(printDays(buildPrintWeek(WEEK_START, WEEK_DAYS_ISO, plans))[0].heading),
    );

    expect(draftPages.length).toBeGreaterThan(1);
    for (const page of draftPages) {
      expect(hasDashedBox(page)).toBe(true);
      expect(pageText(page)).toContain(DRAFT_LABEL);
    }
  });

  it("neither frames nor labels an accepted day as a draft", () => {
    const date = WEEK_DAYS_ISO[0];
    const result = layout({ [date]: planView(date, { acceptedAt: "2026-09-23T09:31:00Z" }) }, "day-per-page");

    expect(hasDashedBox(result.pages[0])).toBe(false);
    expect(pageText(result.pages[0])).not.toContain(DRAFT_LABEL);
  });

  it("gives an empty week five pages, each saying the day has no plan", () => {
    const result = layout({}, "day-per-page");

    expect(result.pages).toHaveLength(5);
    for (const page of result.pages) {
      expect(pageText(page)).toContain(EMPTY_DAY_NOTE);
      expect(hasDashedBox(page)).toBe(false);
    }
  });

  it("keeps every line inside the margins", () => {
    expectInsideMargins(layout(fullWeek({ descriptionLength: 1500 }), "day-per-page"));
  });
});

describe("layoutDocument — week per page", () => {
  it("fits a typical week on one landscape page above the 7 pt floor", () => {
    const result = layout(fullWeek({ descriptionLength: 500 }), "week-per-page");

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].spec).toBe(A4_LANDSCAPE);
    expect(result.pages[0].spec.width).toBeGreaterThan(result.pages[0].spec.height);
    expect(result.bodySize).toBeGreaterThan(7);
  });

  it("uses the largest size for a light week", () => {
    const result = layout(
      { [WEEK_DAYS_ISO[0]]: planView(WEEK_DAYS_ISO[0], { descriptionLength: 100 }) },
      "week-per-page",
    );

    expect(result.bodySize).toBe(11);
  });

  it("shrinks the text for a nearly full week, and still fits one page", () => {
    const typical = layout(fullWeek({ descriptionLength: 500 }), "week-per-page");
    const nearlyFull = layout(fullWeek({ descriptionLength: 600 }), "week-per-page");

    expect(nearlyFull.bodySize).toBeLessThan(typical.bodySize);
    expect(nearlyFull.bodySize).toBeGreaterThanOrEqual(7);
    expect(nearlyFull.pages).toHaveLength(1);
  });

  it("stops at 7 pt and continues the columns when even that does not fit", () => {
    const result = layout(fullWeek({ descriptionLength: 4000 }), "week-per-page");

    expect(result.bodySize).toBe(7);
    expect(result.pages.length).toBeGreaterThanOrEqual(2);
    for (const page of result.pages) {
      expect(page.spec).toBe(A4_LANDSCAPE);
    }
    expect(pageText(result.pages[1])).toContain(CONTINUED_MARK);
    expect(pageText(result.pages[0])).not.toContain(CONTINUED_MARK);
  });

  it("puts every day on the page, drafts framed and empty days noted", () => {
    const [monday, , wednesday] = WEEK_DAYS_ISO;
    const plans = {
      [monday]: planView(monday, { acceptedAt: "2026-09-23T09:31:00Z" }),
      [wednesday]: planView(wednesday, { acceptedAt: null }),
    };
    const week = buildPrintWeek(WEEK_START, WEEK_DAYS_ISO, plans);
    const [page] = layout(plans, "week-per-page").pages;
    const text = pageText(page);

    for (const day of printDays(week)) {
      expect(text).toContain(day.heading.split(",")[0]);
    }
    expect(page.items.filter((item) => item.kind === "dashed-box")).toHaveLength(1);
    expect(text.split(EMPTY_DAY_NOTE)).toHaveLength(4);
    expect(text).toContain(DRAFT_LABEL);
  });

  it("keeps every line inside the margins, at every size", () => {
    for (const length of [100, 500, 600, 4000]) {
      expectInsideMargins(layout(fullWeek({ descriptionLength: length }), "week-per-page"));
    }
  });
});

describe("layoutDocument — a month, week per page", () => {
  const firstColumnEnd = A4_LANDSCAPE.margin + (A4_LANDSCAPE.width - 2 * A4_LANDSCAPE.margin) / 5;

  it("gives a typical month one landscape page per week, each headed by its week", () => {
    const doc = buildPrintMonth(MONTH, fullMonth(MONTH, { descriptionLength: 300 }));
    const result = layoutDocument(doc, "week-per-page", measure);

    expect(result.pages).toHaveLength(doc.rows.length);
    result.pages.forEach((page, index) => {
      expect(page.spec).toBe(A4_LANDSCAPE);
      expect(pageText(page)).toContain(doc.rows[index].heading);
    });
  });

  it("starts every week on a new page, even when one continues", () => {
    const plans = { ...fullMonth(), "2026-09-08": planView("2026-09-08", { descriptionLength: 4000 }) };
    const doc = buildPrintMonth(MONTH, plans);
    const result = layoutDocument(doc, "week-per-page", measure);
    const firstPages = doc.rows.map((row) =>
      result.pages.findIndex(
        (page) => pageText(page).includes(row.heading) && !pageText(page).includes(`${row.heading} ${CONTINUED_MARK}`),
      ),
    );

    expect(result.pages.length).toBeGreaterThan(doc.rows.length);
    expect(firstPages.every((index) => index >= 0)).toBe(true);
    expect([...firstPages].sort((a, b) => a - b)).toEqual(firstPages);
    expect(new Set(firstPages).size).toBe(doc.rows.length);
    expectInsideMargins(result);
  });

  it("leaves the column of a day outside the month blank", () => {
    const doc = buildPrintMonth(MONTH, {});
    const [firstWeek] = layoutDocument(doc, "week-per-page", measure).pages;

    // Monday 31 August: nothing in the first column but the page title.
    expect(texts(firstWeek).filter((item) => item.x > A4_LANDSCAPE.margin && item.x < firstColumnEnd)).toEqual([]);
    expect(hasDashedBox(firstWeek)).toBe(false);
    expect(pageText(firstWeek).split(EMPTY_DAY_NOTE)).toHaveLength(5);
  });
});
