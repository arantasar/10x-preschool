import { describe, expect, it } from "vitest";

import { fullMonth, MONTH } from "./__fixtures__/month";
import { fullWeek, planView, prose, WEEK_DAYS_ISO, WEEK_START } from "./__fixtures__/week";
import {
  A4_LANDSCAPE,
  A4_PORTRAIT,
  layoutDocument,
  normalizeText,
  WEEK_COLUMN_GAP,
  WEEK_COLUMN_WIDTH,
  weekColumnX,
  wrapText,
  type LayoutItem,
  type LayoutPage,
  type Measure,
  type PdfLayout,
} from "./layout";
import {
  BRAND_URL,
  buildPrintMonth,
  buildPrintWeek,
  CONTINUED_MARK,
  DRAFT_TAG,
  EMPTY_DAY_NOTE,
  GROUP_LABEL,
  printDays,
  TRUNCATION_MARK,
  WEEK_EYEBROW,
} from "./model";
import { withTruncationMark } from "./sheet";
import type { DayPlanView } from "@/types";

// Deterministic stand-in for a real font: every character half an em wide,
// bold and bold italic a tenth wider, the serif wider still; tracking between
// characters. Close enough to Nunito Sans that the thresholds below describe
// realistic weeks.
const measure: Measure = (text, size, face, tracking = 0) =>
  text.length * size * (face === "serif" ? 0.55 : 0.5) * (face === "regular" ? 1 : 1.1) +
  tracking * Math.max(0, text.length - 1);

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
  return page.items.some((item) => item.kind === "box" && item.dashed);
}

function layout(plans: Record<string, DayPlanView>, kind: PdfLayout["kind"]): PdfLayout {
  return layoutDocument(buildPrintWeek(WEEK_START, WEEK_DAYS_ISO, plans), kind, measure);
}

function width(item: TextItem): number {
  return measure(item.text, item.size, item.face, item.tracking);
}

/** The header sits above the body, the footer under it; everything between is a day's. */
function bodyTexts(page: LayoutPage): TextItem[] {
  return texts(page).filter((item) => item.y < page.body.top && item.y > page.spec.margin + 10);
}

function footerTexts(page: LayoutPage): TextItem[] {
  return texts(page).filter((item) => item.y <= page.spec.margin + 10);
}

function columnOf(item: { readonly x: number }): number {
  return Math.floor((item.x - A4_LANDSCAPE.margin + 1e-6) / (WEEK_COLUMN_WIDTH + WEEK_COLUMN_GAP));
}

function expectInsideMargins(result: PdfLayout): void {
  for (const page of result.pages) {
    const { width: pageWidth, height, margin } = page.spec;
    for (const item of texts(page)) {
      expect(item.x).toBeGreaterThanOrEqual(margin);
      expect(item.x + width(item)).toBeLessThanOrEqual(pageWidth - margin + 1e-6);
      expect(item.y + item.size).toBeLessThanOrEqual(height - margin + 1e-6);
      expect(item.y - 0.3 * item.size).toBeGreaterThanOrEqual(margin - 1e-6);
    }
    for (const item of page.items) {
      if (item.kind !== "box") continue;
      expect(item.x).toBeGreaterThanOrEqual(margin - 1e-6);
      expect(item.y).toBeGreaterThanOrEqual(margin - 1e-6);
      expect(item.x + item.width).toBeLessThanOrEqual(pageWidth - margin + 1e-6);
      expect(item.y + item.height).toBeLessThanOrEqual(height - margin + 1e-6);
    }
  }
}

/** The frame's header sets exactly four texts: eyebrow, title, „Grupa:”, „temio”. */
const HEADER_TEXTS = 4;

/**
 * Every day's text between the header and the footer - and, in a week, inside
 * its own column, chip and tag outlines included. A day's text that overflowed
 * upward would sit with the header, so the header's count is checked too.
 */
function expectInsideBody(result: PdfLayout): void {
  expectInsideMargins(result);
  for (const page of result.pages) {
    expect(texts(page).filter((item) => item.y >= page.body.top)).toHaveLength(HEADER_TEXTS);
    if (result.kind === "week-per-page") {
      for (const item of page.items) {
        if (item.kind !== "box") continue;
        const column = columnOf(item);
        expect(item.x).toBeGreaterThanOrEqual(weekColumnX(column) - 1e-6);
        expect(item.x + item.width).toBeLessThanOrEqual(weekColumnX(column) + WEEK_COLUMN_WIDTH + 1e-6);
        expect(item.y + item.height).toBeLessThanOrEqual(page.body.top + 1e-6);
      }
    }
    for (const item of bodyTexts(page)) {
      expect(item.y + item.size).toBeLessThanOrEqual(page.body.top + 1e-6);
      expect(item.y - 0.3 * item.size).toBeGreaterThanOrEqual(page.body.bottom - 1e-6);
      if (result.kind === "week-per-page") {
        const column = columnOf(item);
        expect(item.x).toBeGreaterThanOrEqual(weekColumnX(column) - 1e-6);
        expect(item.x + width(item)).toBeLessThanOrEqual(weekColumnX(column) + WEEK_COLUMN_WIDTH + 1e-6);
      }
    }
  }
}

describe("withTruncationMark", () => {
  it("keeps whole words when they fit, then the mark", () => {
    // 10 pt → 5 pt per character; 50 pt fits nine characters and the mark.
    expect(withTruncationMark("ala ma kota i psa", 50, 10, "regular", measure)).toBe(`ala ma${TRUNCATION_MARK}`);
  });

  // A hasło may be 2000 characters with no space. Dropping one character at a
  // time measured ~2000 uncached prefixes - seconds per chip in the browser.
  it("cuts a 2000-character word with a handful of measurements", () => {
    let calls = 0;
    const counting: Measure = (...args) => {
      calls += 1;
      return measure(...args);
    };

    const cut = withTruncationMark("a".repeat(2000), 50, 10, "regular", counting);

    expect(cut).toBe(`${"a".repeat(9)}${TRUNCATION_MARK}`);
    expect(calls).toBeLessThan(30);
  });
});

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

  it("starts each day on its own page, in calendar order, headed by its number", () => {
    const week = buildPrintWeek(WEEK_START, WEEK_DAYS_ISO, fullWeek());
    const result = layoutDocument(week, "day-per-page", measure);

    result.pages.forEach((page, index) => {
      const day = printDays(week)[index];
      const body = bodyTexts(page).map((item) => item.text);
      expect(body).toContain(day.dayNumber);
      expect(body).toContain(day.weekday.toLocaleUpperCase("pl-PL"));
    });
  });

  it("frames every page as a sheet of the week: eyebrow, range, group blank, footer", () => {
    const week = buildPrintWeek(WEEK_START, WEEK_DAYS_ISO, fullWeek({ acceptedAt: "2026-09-23T09:31:00Z" }));
    const result = layoutDocument(week, "day-per-page", measure);

    for (const page of result.pages) {
      const text = pageText(page);
      expect(text).toContain(WEEK_EYEBROW);
      expect(text).toContain(week.rows[0].heading);
      expect(text).toContain(GROUP_LABEL);
      expect(page.items.some((item) => item.kind === "mark")).toBe(true);
      expect(footerTexts(page).map((item) => item.text)).toEqual(
        expect.arrayContaining([BRAND_URL, week.rows[0].note]),
      );
    }
  });

  it("continues an overlong day onto further pages, (cd.) in the title and the day's heading", () => {
    const date = WEEK_DAYS_ISO[1];
    const plans = { ...fullWeek(), [date]: planView(date, { descriptionLength: 4000 }) };
    const week = buildPrintWeek(WEEK_START, WEEK_DAYS_ISO, plans);
    const result = layoutDocument(week, "day-per-page", measure);

    expect(result.pages.length).toBeGreaterThan(5);
    const continuation = result.pages[2];
    const marks = texts(continuation).filter((item) => item.text.includes(CONTINUED_MARK));
    expect(marks.some((item) => item.text === `${week.rows[0].heading} ${CONTINUED_MARK}`)).toBe(true);
    expect(bodyTexts(continuation).map((item) => item.text)).toContain(CONTINUED_MARK);
    expect(bodyTexts(continuation).map((item) => item.text)).toContain(printDays(week)[1].dayNumber);
    expect(pageText(result.pages[1])).not.toContain(CONTINUED_MARK);
    expectInsideBody(result);
  });

  it("tags a draft day „SZKIC” in a dashed outline, on every page it spans", () => {
    const date = WEEK_DAYS_ISO[0];
    const plans = { [date]: planView(date, { acceptedAt: null, descriptionLength: 4000 }) };
    const result = layout(plans, "day-per-page");
    const draftPages = result.pages.filter((page) => bodyTexts(page).some((item) => item.text === "14"));

    expect(draftPages.length).toBeGreaterThan(1);
    for (const page of draftPages) {
      expect(hasDashedBox(page)).toBe(true);
      expect(bodyTexts(page).map((item) => item.text)).toContain(DRAFT_TAG);
    }
  });

  it("neither tags nor outlines an accepted day as a draft", () => {
    const date = WEEK_DAYS_ISO[0];
    const result = layout({ [date]: planView(date, { acceptedAt: "2026-09-23T09:31:00Z" }) }, "day-per-page");

    expect(hasDashedBox(result.pages[0])).toBe(false);
    expect(bodyTexts(result.pages[0]).map((item) => item.text)).not.toContain(DRAFT_TAG);
  });

  it("gives an empty week five pages, each saying the day has no plan", () => {
    const result = layout({}, "day-per-page");

    expect(result.pages).toHaveLength(5);
    for (const page of result.pages) {
      expect(pageText(page)).toContain(EMPTY_DAY_NOTE);
      expect(hasDashedBox(page)).toBe(false);
      expect(footerTexts(page).map((item) => item.text)).toEqual([BRAND_URL]);
    }
  });

  it("keeps every line inside the body", () => {
    expectInsideBody(layout(fullWeek({ descriptionLength: 1500 }), "day-per-page"));
  });
});

describe("layoutDocument — week per page", () => {
  // Three activities of 400 characters: 1200 a day, about what the design
  // measured real model output at (~1300).
  const TYPICAL = 400;

  it("fits a typical week on one landscape page at no more than 9.5 pt, above the 7 pt floor", () => {
    const result = layout(fullWeek({ descriptionLength: TYPICAL }), "week-per-page");

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].spec).toBe(A4_LANDSCAPE);
    expect(result.pages[0].spec.width).toBeGreaterThan(result.pages[0].spec.height);
    expect(result.bodySize).toBeLessThanOrEqual(9.5);
    expect(result.bodySize).toBeGreaterThan(7);
  });

  it("uses the largest size for a light week", () => {
    const result = layout(
      { [WEEK_DAYS_ISO[0]]: planView(WEEK_DAYS_ISO[0], { descriptionLength: 100 }) },
      "week-per-page",
    );

    expect(result.bodySize).toBe(9.5);
  });

  it("shrinks the text for a nearly full week, and still fits one page", () => {
    const typical = layout(fullWeek({ descriptionLength: TYPICAL }), "week-per-page");
    const nearlyFull = layout(fullWeek({ descriptionLength: 500 }), "week-per-page");

    expect(nearlyFull.bodySize).toBeLessThan(typical.bodySize);
    expect(nearlyFull.bodySize).toBeGreaterThanOrEqual(7);
    expect(nearlyFull.pages).toHaveLength(1);
  });

  it("stops at 7 pt and continues the columns, (cd.) in the title and each continued day's heading", () => {
    const week = buildPrintWeek(WEEK_START, WEEK_DAYS_ISO, fullWeek({ descriptionLength: 4000 }));
    const result = layoutDocument(week, "week-per-page", measure);

    expect(result.bodySize).toBe(7);
    expect(result.pages.length).toBeGreaterThanOrEqual(2);
    for (const page of result.pages) {
      expect(page.spec).toBe(A4_LANDSCAPE);
    }
    const second = result.pages[1];
    expect(pageText(second)).toContain(`${week.rows[0].heading} ${CONTINUED_MARK}`);
    expect(bodyTexts(second).filter((item) => item.text === CONTINUED_MARK)).toHaveLength(5);
    for (const day of printDays(week)) {
      expect(bodyTexts(second).map((item) => item.text)).toContain(day.dayNumber);
    }
    expect(pageText(result.pages[0])).not.toContain(CONTINUED_MARK);
  });

  it("puts every day on the page by its number - the draft tagged, the empty days noted", () => {
    const [monday, , wednesday] = WEEK_DAYS_ISO;
    const plans = {
      [monday]: planView(monday, { acceptedAt: "2026-09-23T09:31:00Z" }),
      [wednesday]: planView(wednesday, { acceptedAt: null }),
    };
    const week = buildPrintWeek(WEEK_START, WEEK_DAYS_ISO, plans);
    const [page] = layout(plans, "week-per-page").pages;
    const body = bodyTexts(page);

    printDays(week).forEach((day, index) => {
      expect(body.some((item) => item.text === day.dayNumber && columnOf(item) === index)).toBe(true);
    });
    const dashed = page.items.filter((item) => item.kind === "box" && item.dashed);
    expect(dashed).toHaveLength(1);
    const draftTags = body.filter((item) => item.text === DRAFT_TAG);
    expect(draftTags.map(columnOf)).toEqual([2]);
    expect(body.filter((item) => item.text === EMPTY_DAY_NOTE).map(columnOf)).toEqual([1, 3, 4]);
    expect(footerTexts(page).map((item) => item.text)).toContain(week.rows[0].note);
  });

  it("no longer frames a draft column - the tag and the footer say it", () => {
    const date = WEEK_DAYS_ISO[0];
    const [page] = layout({ [date]: planView(date, { acceptedAt: null }) }, "week-per-page").pages;
    const dashed = page.items.filter((item) => item.kind === "box" && item.dashed);

    expect(dashed).toHaveLength(1);
    for (const box of dashed) {
      if (box.kind !== "box") continue;
      expect(box.width).toBeLessThan(WEEK_COLUMN_WIDTH / 2);
    }
  });

  it("cuts a very long hasło to one line ending with the mark, inside its column", () => {
    const date = WEEK_DAYS_ISO[3];
    const result = layout({ [date]: planView(date, { prompt: `Hasło ${prose(2000)}` }) }, "week-per-page");
    const [page] = result.pages;
    const chipTexts = bodyTexts(page).filter((item) => item.text.startsWith("Hasło"));

    expect(chipTexts).toHaveLength(1);
    expect(chipTexts[0].text.endsWith(TRUNCATION_MARK)).toBe(true);
    expect(columnOf(chipTexts[0])).toBe(3);
    expectInsideBody(result);
  });

  it("keeps a short hasło whole, beside the day's number", () => {
    const date = WEEK_DAYS_ISO[0];
    const plans = { [date]: planView(date, { prompt: "Kasztany", acceptedAt: "2026-09-23T09:31:00Z" }) };
    const [page] = layout(plans, "week-per-page").pages;
    const body = bodyTexts(page);
    const number = body.find((item) => item.text === "14");
    const chipText = body.find((item) => item.text === "Kasztany");

    expect(chipText).toBeDefined();
    expect(chipText?.y).toBeCloseTo(number?.y ?? Number.NaN, 6);
  });

  it("keeps every line inside the body and inside its own column, at every size", () => {
    for (const length of [100, TYPICAL, 500, 4000]) {
      expectInsideBody(layout(fullWeek({ descriptionLength: length, prompt: prose(80) }), "week-per-page"));
    }
  });

  it("says in every page's footer whether the week is final", () => {
    const week = buildPrintWeek(WEEK_START, WEEK_DAYS_ISO, fullWeek({ descriptionLength: 4000 }));
    const result = layoutDocument(week, "week-per-page", measure);

    for (const page of result.pages) {
      expect(footerTexts(page).map((item) => item.text)).toEqual(
        expect.arrayContaining([week.rows[0].note, BRAND_URL]),
      );
    }
  });
});

describe("layoutDocument — a month, week per page", () => {
  it("gives a typical month one landscape page per week, each titled with its week and the month", () => {
    const doc = buildPrintMonth(MONTH, fullMonth(MONTH, { descriptionLength: 300 }));
    const result = layoutDocument(doc, "week-per-page", measure);

    expect(result.pages).toHaveLength(doc.rows.length);
    result.pages.forEach((page, index) => {
      expect(page.spec).toBe(A4_LANDSCAPE);
      expect(pageText(page)).toContain(doc.rows[index].heading);
      expect(pageText(page)).toContain(doc.rows[index].eyebrow);
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
    expectInsideBody(result);
  });

  it("leaves the column of a day outside the month blank", () => {
    const doc = buildPrintMonth(MONTH, {});
    const [firstWeek] = layoutDocument(doc, "week-per-page", measure).pages;

    // Monday 31 August: nothing in the first column.
    expect(bodyTexts(firstWeek).filter((item) => columnOf(item) === 0)).toEqual([]);
    expect(hasDashedBox(firstWeek)).toBe(false);
    expect(pageText(firstWeek).split(EMPTY_DAY_NOTE)).toHaveLength(5);
  });

  it("gives each week's page that week's own footer note", () => {
    const doc = buildPrintMonth(MONTH, { "2026-09-08": planView("2026-09-08", { acceptedAt: null }) });
    const result = layoutDocument(doc, "week-per-page", measure);

    expect(footerTexts(result.pages[1]).map((item) => item.text)).toContain(doc.rows[1].note);
    expect(footerTexts(result.pages[0]).map((item) => item.text)).toEqual([BRAND_URL]);
  });

  it("gives a month that starts on a Saturday no page without a day on it", () => {
    // August 2026: 3–7, 10–14, 17–21, 24–28, 31 - five weeks, not the six rows of the screen grid.
    const result = layoutDocument(buildPrintMonth("2026-08", {}), "week-per-page", measure);

    expect(result.pages).toHaveLength(5);
    for (const page of result.pages) {
      expect(pageText(page)).toContain(EMPTY_DAY_NOTE);
    }
  });
});
