import { readFile } from "node:fs/promises";

import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";

import { fullWeek, planView, WEEK_DAYS_ISO, WEEK_START } from "./__fixtures__/week";
import { buildPrintWeek, printDays, type PdfLayoutKind } from "./model";
import { embedPlanFonts, normalizeDocument, prepareDocument, renderPlanPdf, type PdfFonts } from "./render";
import type { DayPlanView } from "@/types";

// Real font files, not a stub: the claim under test is that the whole chain -
// fontkit, subsetting, Polish glyphs - works on the bytes the browser will get.
let fonts: PdfFonts;

beforeAll(async () => {
  const [regular, bold] = await Promise.all([
    readFile("public/fonts/NotoSans-Regular.ttf"),
    readFile("public/fonts/NotoSans-Bold.ttf"),
  ]);
  fonts = { regular: new Uint8Array(regular), bold: new Uint8Array(bold) };
});

async function render(plans: Record<string, DayPlanView>, kind: PdfLayoutKind): Promise<Uint8Array> {
  return renderPlanPdf(buildPrintWeek(WEEK_START, WEEK_DAYS_ISO, plans), kind, fonts);
}

async function pages(bytes: Uint8Array) {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((page) => page.getSize());
}

const POLISH = "ąćęłńóśźż ĄĆĘŁŃÓŚŹŻ";

describe("renderPlanPdf", () => {
  it("produces a PDF", async () => {
    const bytes = await render(fullWeek(), "day-per-page");

    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("gives a typical week five portrait pages, one per day", async () => {
    const sizes = await pages(await render(fullWeek(), "day-per-page"));

    expect(sizes).toHaveLength(5);
    for (const { width, height } of sizes) {
      expect(height).toBeGreaterThan(width);
    }
  });

  it("fits a typical week on one landscape page", async () => {
    const sizes = await pages(await render(fullWeek({ descriptionLength: 400 }), "week-per-page"));

    expect(sizes).toHaveLength(1);
    expect(sizes[0].width).toBeGreaterThan(sizes[0].height);
  });

  it("draws every Polish letter, lower and upper case, in both weights", async () => {
    const date = WEEK_DAYS_ISO[0];
    const plans = {
      [date]: planView(date, {
        prompt: POLISH,
        theme: POLISH,
        activities: [{ title: POLISH, description: `${POLISH}\n${POLISH}` }],
      }),
    };

    for (const kind of ["day-per-page", "week-per-page"] as const) {
      await expect(render(plans, kind)).resolves.toBeInstanceOf(Uint8Array);
    }
  });

  it("does not fail on emoji or characters the font lacks", async () => {
    const date = WEEK_DAYS_ISO[0];
    const plans = {
      [date]: planView(date, {
        prompt: "Jesień 🍂 w parku",
        activities: [{ title: "Liście 🍁", description: "Kasztany 🌰 i 漢字 oraz \u{10FFFD}\ttabulator" }],
      }),
    };

    for (const kind of ["day-per-page", "week-per-page"] as const) {
      const sizes = await pages(await render(plans, kind));
      expect(sizes.length).toBeGreaterThan(0);
    }
  });

  // pdf-lib does not throw on a glyph the font lacks - it draws an empty box -
  // so "does not fail" above cannot tell a filtered string from an unfiltered
  // one. This is the assertion that can.
  it("replaces what the real fonts cannot draw, and keeps every Polish letter", async () => {
    const { hasGlyph } = await embedPlanFonts(await PDFDocument.create(), fonts);
    const date = WEEK_DAYS_ISO[0];
    const week = buildPrintWeek(WEEK_START, WEEK_DAYS_ISO, {
      [date]: planView(date, {
        prompt: `Jesień 🍂 ${POLISH}`,
        activities: [{ title: "Liście 🍁", description: "Kasztany 🌰 i 漢字" }],
      }),
    });

    const [day] = printDays(normalizeDocument(week, hasGlyph));

    expect(day.prompt).toBe(`Jesień ? ${POLISH}`);
    expect(day.activities[0]).toEqual({ title: "Liście ?", description: "Kasztany ? i ??" });
  });

  // The test above proves the filter works; this one that the renderer's path
  // runs it. Without it the layout would carry the emoji the font cannot draw.
  it("lays out the filtered text, not the raw one", async () => {
    const embedded = await embedPlanFonts(await PDFDocument.create(), fonts);
    const date = WEEK_DAYS_ISO[0];
    const week = buildPrintWeek(WEEK_START, WEEK_DAYS_ISO, {
      [date]: planView(date, { activities: [{ title: "Liście 🍁", description: "Kasztany 🌰" }] }),
    });

    for (const kind of ["day-per-page", "week-per-page"] as const) {
      const text = prepareDocument(week, kind, embedded)
        .layout.pages.flatMap((page) => page.items)
        .map((item) => (item.kind === "text" ? item.text : ""))
        .join("\n");
      expect(text).toContain("Kasztany ?");
      expect(text).not.toMatch(/🍁|🌰/u);
    }
  });

  it("gives an empty week five pages", async () => {
    expect(await pages(await render({}, "day-per-page"))).toHaveLength(5);
  });
});
