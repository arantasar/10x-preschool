import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";

import { readPlanFonts } from "./__fixtures__/fonts";
import { fullMonth, LONGEST_MONTH, MONTH } from "./__fixtures__/month";
import { fullWeek, planView, prose, WEEK_DAYS_ISO, WEEK_START } from "./__fixtures__/week";
import { buildPrintMonth, buildPrintWeek, printDays, TRUNCATION_MARK, type PdfLayoutKind } from "./model";
import { A4_LANDSCAPE, type FontFace, type PdfLayout } from "./layout";
import { drawLayout, embedPlanFonts, normalizeDocument, prepareDocument, renderPlanPdf, type PdfFonts } from "./render";
import type { DayPlanView } from "@/types";

// Real font files, not a stub: the claim under test is that the whole chain -
// fontkit, embedding, Polish glyphs - works on the bytes the browser will get.
let fonts: PdfFonts;

beforeAll(async () => {
  fonts = await readPlanFonts();
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

  it("draws every Polish letter, lower and upper case, in every face", async () => {
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

  // Young Serif has no Cyrillic, but it never sets the teacher's text; a
  // Ukrainian song in a description printed before S-29 and must still print.
  it("keeps Cyrillic, which every face but the serif has", async () => {
    const { hasGlyph } = await embedPlanFonts(await PDFDocument.create(), fonts);
    const date = WEEK_DAYS_ISO[0];
    const week = buildPrintWeek(WEEK_START, WEEK_DAYS_ISO, {
      [date]: planView(date, { activities: [{ title: "Piosenka", description: "Пісенька «Привіт»" }] }),
    });

    const [day] = printDays(normalizeDocument(week, hasGlyph));

    expect(day.activities[0].description).toBe("Пісенька «Привіт»");
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

  // `hasGlyph` is the intersection of the text faces, so a letter one lacked
  // would come out as `?` in all of them; the serif sets Polish month names.
  // This says none of the four lacks one.
  it("has every Polish letter in each of the four faces", async () => {
    const pdf = await PDFDocument.create();
    const { fonts: embedded } = await embedPlanFonts(pdf, fonts);

    for (const face of ["serif", "regular", "bold", "boldItalic"] as const satisfies readonly FontFace[]) {
      const set = new Set(embedded[face].getCharacterSet());
      for (const char of Array.from(POLISH.replace(" ", ""))) {
        expect(set.has(char.codePointAt(0) ?? 0), `${face} ${char}`).toBe(true);
      }
    }
  });
});

describe("embedPlanFonts — measure", () => {
  // A spaced-out label is drawn with the PDF's character spacing; if the
  // measure left it out, a chip or the „SZKIC” tag would outgrow its outline.
  it("adds the letter spacing between characters, not after the last one", async () => {
    const { measure } = await embedPlanFonts(await PDFDocument.create(), fonts);

    expect(measure("SZKIC", 10, "bold", 1.5)).toBeCloseTo(measure("SZKIC", 10, "bold") + 4 * 1.5, 6);
    expect(measure("Ą", 10, "bold", 1.5)).toBeCloseTo(measure("Ą", 10, "bold"), 6);
  });

  it("measures each face with its own widths", async () => {
    const { measure } = await embedPlanFonts(await PDFDocument.create(), fonts);
    const widths = (["serif", "regular", "bold", "boldItalic"] as const).map((face) => measure("Wrzesień", 20, face));

    expect(new Set(widths).size).toBe(4);
  });
});

describe("drawLayout", () => {
  it("draws every kind of item without throwing", async () => {
    const pdf = await PDFDocument.create();
    const { fonts: embedded } = await embedPlanFonts(pdf, fonts);
    const layout: PdfLayout = {
      kind: "week-per-page",
      bodySize: 9,
      pages: [
        {
          spec: A4_LANDSCAPE,
          body: { top: 500, bottom: 40 },
          items: [
            { kind: "text", x: 40, y: 500, text: POLISH, size: 24, face: "serif", color: "ink" },
            { kind: "text", x: 40, y: 470, text: POLISH, size: 10, face: "regular", color: "muted" },
            { kind: "text", x: 40, y: 450, text: "PONIEDZIAŁEK", size: 9, face: "bold", color: "muted", tracking: 1 },
            { kind: "text", x: 40, y: 430, text: POLISH, size: 10, face: "boldItalic", color: "accent" },
            {
              kind: "box",
              x: 40,
              y: 300,
              width: 120,
              height: 80,
              radius: 8,
              stroke: "frame",
              strokeWidth: 1,
              dashed: false,
            },
            {
              kind: "box",
              x: 180,
              y: 300,
              width: 120,
              height: 80,
              radius: 8,
              stroke: "draft",
              strokeWidth: 1,
              dashed: true,
            },
            { kind: "rule", x1: 40, y1: 280, x2: 300, y2: 280, color: "divider", width: 1 },
            { kind: "hatch", x: 320, y: 300, width: 120, height: 80 },
            { kind: "mark", x: 460, y: 380, size: 18 },
          ],
        },
      ],
    };

    drawLayout(pdf, layout, embedded);
    const bytes = await pdf.save();

    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(await pages(bytes)).toHaveLength(1);
  });
});

describe("renderPlanPdf — a month", () => {
  it("draws a typical month's grid on one landscape page", async () => {
    const bytes = await renderPlanPdf(buildPrintMonth(MONTH, fullMonth()), "month-grid", fonts);
    const sizes = await pages(bytes);

    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(sizes).toHaveLength(1);
    expect(sizes[0].width).toBeGreaterThan(sizes[0].height);
  });

  it("draws a month week by week, one landscape page per week", async () => {
    const doc = buildPrintMonth(MONTH, fullMonth(MONTH, { descriptionLength: 300 }));
    const sizes = await pages(await renderPlanPdf(doc, "week-per-page", fonts));

    expect(sizes).toHaveLength(doc.rows.length);
    for (const { width, height } of sizes) {
      expect(width).toBeGreaterThan(height);
    }
  });

  it("draws an empty month's grid on one page", async () => {
    expect(await pages(await renderPlanPdf(buildPrintMonth(MONTH, {}), "month-grid", fonts))).toHaveLength(1);
  });

  it("keeps an overflowing month on one page, cut with a mark the fonts can draw", async () => {
    const plans = fullMonth(LONGEST_MONTH, {
      prompt: prose(2000),
      activities: [1, 2, 3].map(() => ({ title: prose(200), description: "opis" })),
    });
    const doc = buildPrintMonth(LONGEST_MONTH, plans);
    const embedded = await embedPlanFonts(await PDFDocument.create(), fonts);
    const text = prepareDocument(doc, "month-grid", embedded)
      .layout.pages.flatMap((page) => page.items)
      .map((item) => (item.kind === "text" ? item.text : ""));

    expect(await pages(await renderPlanPdf(doc, "month-grid", fonts))).toHaveLength(1);
    expect(text.some((line) => line.endsWith(TRUNCATION_MARK))).toBe(true);
  });

  it("has the truncation mark and the legend's quotes in every face", async () => {
    const { hasGlyph } = await embedPlanFonts(await PDFDocument.create(), fonts);

    for (const char of [TRUNCATION_MARK, "„", "”", "—", "·"]) {
      expect(hasGlyph(char)).toBe(true);
    }
  });

  it("draws Polish letters in the grid and week by week", async () => {
    const plans = {
      "2026-09-14": planView("2026-09-14", {
        prompt: POLISH,
        theme: POLISH,
        activities: [{ title: POLISH, description: POLISH }],
      }),
    };

    for (const kind of ["month-grid", "week-per-page"] as const) {
      await expect(renderPlanPdf(buildPrintMonth(MONTH, plans), kind, fonts)).resolves.toBeInstanceOf(Uint8Array);
    }
  });
});
