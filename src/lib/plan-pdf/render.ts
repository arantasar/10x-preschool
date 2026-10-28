import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setCharacterSpacing,
  type PDFFont,
  type PDFPage,
  type RGB,
} from "pdf-lib";

import {
  layoutDocument,
  normalizeText,
  type FontFace,
  type InkToken,
  type LayoutItem,
  type Measure,
  type PdfLayout,
} from "@/lib/plan-pdf/layout";
import type { PdfLayoutKind, PrintDay, PrintDocument } from "@/lib/plan-pdf/model";

/**
 * Draws a {@link PrintDocument} as PDF bytes.
 *
 * The one module that imports pdf-lib. It takes font bytes rather than fetching
 * them, so the same code runs in node under vitest (bytes read from
 * `public/fonts`) and in the browser (bytes from `fetch`). The island loads it
 * with a dynamic `import()`, which keeps pdf-lib and fontkit out of the week
 * and month views' initial bundles.
 */

/** The bytes of each face, whole TTF files from `public/fonts`. */
export type PdfFonts = Readonly<Record<FontFace, Uint8Array>>;

/** The palette of the design package's `print.css` - dark „Las” green and its paler relatives. */
const INK: Readonly<Record<InkToken, RGB>> = {
  ink: hex("#1F3B2D"),
  muted: hex("#3E5347"),
  accent: hex("#4F6E4B"),
  faint: hex("#8A968E"),
  chip: hex("#8FA487"),
  frame: hex("#B9C7B1"),
  draft: hex("#6B7A70"),
  divider: hex("#D5CDB8"),
  soft: hex("#E2DBC8"),
  hatch: hex("#F4F1E8"),
};

function hex(value: string): RGB {
  const channel = (offset: number) => parseInt(value.slice(offset, offset + 2), 16) / 255;
  return rgb(channel(1), channel(3), channel(5));
}

const DASH = [3, 2];
const HATCH_STEP = 5;
const HATCH_WIDTH = 0.75;

/** The temio sign from the design package, on a 64-unit square. */
const MARK_PATH = "M32 2C48.6 2 62 15.4 62 32S48.6 62 32 62H12C6.5 62 2 57.5 2 52V32C2 15.4 15.4 2 32 2Z";
const MARK_VIEWBOX = 64;

const FACES: readonly FontFace[] = ["serif", "regular", "bold", "boldItalic"];
/** The faces the teacher's own text is ever set in - every face but the serif. */
const TEXT_FACES: readonly FontFace[] = ["regular", "bold", "boldItalic"];

/**
 * Every string in the document, with characters the fonts cannot draw replaced.
 *
 * Runs before layout, so the width measured is the width drawn. Without it an
 * emoji pasted into a description does not fail - pdf-lib quietly draws the
 * font's empty `.notdef` box - which is worse than failing: the teacher gets a
 * page with holes in it and no sign of why. A `?` at least reads as "something
 * was here".
 */
export function normalizeDocument(doc: PrintDocument, hasGlyph: (char: string) => boolean): PrintDocument {
  const clean = (text: string) => normalizeText(text, hasGlyph);
  const cleanOrNull = (text: string | null) => (text === null ? null : clean(text));
  const day = (printDay: PrintDay): PrintDay => ({
    ...printDay,
    dayNumber: clean(printDay.dayNumber),
    weekday: clean(printDay.weekday),
    prompt: cleanOrNull(printDay.prompt),
    theme: cleanOrNull(printDay.theme),
    emptyNote: cleanOrNull(printDay.emptyNote),
    activities: printDay.activities.map((activity) => ({
      title: clean(activity.title),
      description: clean(activity.description),
    })),
  });
  return {
    title: clean(doc.title),
    eyebrow: clean(doc.eyebrow),
    sheetTitle: clean(doc.sheetTitle),
    rows: doc.rows.map((row) => ({
      ...row,
      heading: clean(row.heading),
      eyebrow: clean(row.eyebrow),
      note: cleanOrNull(row.note),
      slots: row.slots.map((slot) => (slot === null ? null : day(slot))),
    })),
  };
}

export interface EmbeddedPlanFonts {
  readonly fonts: Readonly<Record<FontFace, PDFFont>>;
  /** Whether every face that sets the teacher's text can draw `char`. */
  readonly hasGlyph: (char: string) => boolean;
  /** Width as the embedded fonts will draw it - the measure `layoutDocument` is given. */
  readonly measure: Measure;
}

export async function embedPlanFonts(doc: PDFDocument, fonts: PdfFonts): Promise<EmbeddedPlanFonts> {
  doc.registerFontkit(fontkit);
  // Whole fonts, not `subset: true`: @pdf-lib/fontkit's subsetter broke the
  // glyph mapping of Noto Sans, and every viewer then drew stray letters in
  // place of the text. No test here can see it - the PDF holds glyph ids, not
  // characters - so only a look at the rendered page does. The same holds for
  // Young Serif and Nunito Sans.
  const embedded = {} as Record<FontFace, PDFFont>;
  for (const face of FACES) {
    embedded[face] = await doc.embedFont(fonts[face]);
  }

  // A character counts as drawable only if every face that sets the teacher's
  // text has it, because the same string - a theme, a title - is set in
  // different faces by different layouts. The serif is left out: it sets only
  // what we write (day numbers, ordinals, dates, the brand), and it has no
  // Cyrillic, which Nunito Sans - and Noto Sans before it - prints.
  const sets = TEXT_FACES.map((face) => new Set(embedded[face].getCharacterSet()));
  const hasGlyph = (char: string) => {
    const code = char.codePointAt(0) ?? 0;
    return sets.every((set) => set.has(code));
  };
  return { fonts: embedded, hasGlyph, measure: cachedMeasure(embedded) };
}

/**
 * `widthOfTextAtSize`, remembered per word at 1 pt.
 *
 * Every call runs fontkit's shaping, and wrapping measures each growing
 * candidate line - across up to six sizes for the week-on-one-page search.
 * Uncached, a week of 4000-character descriptions took over twelve seconds.
 * Width is linear in size, and `wrapText` only ever joins words with single
 * spaces, so a line is the sum of its words plus its spaces; the words repeat
 * endlessly across sizes and candidates. Tracking adds a fixed amount between
 * characters, independent of the face.
 */
function cachedMeasure(embedded: Readonly<Record<FontFace, PDFFont>>): Measure {
  const caches = Object.fromEntries(FACES.map((face) => [face, new Map<string, number>()])) as Record<
    FontFace,
    Map<string, number>
  >;
  const unitWidth = (word: string, face: FontFace): number => {
    const cache = caches[face];
    let width = cache.get(word);
    if (width === undefined) {
      width = embedded[face].widthOfTextAtSize(word, 1);
      cache.set(word, width);
    }
    return width;
  };
  return (text, size, face, tracking = 0) => {
    const words = text.split(" ");
    const spaces = (words.length - 1) * unitWidth(" ", face);
    const width = size * words.reduce((sum, word) => sum + (word === "" ? 0 : unitWidth(word, face)), spaces);
    return width + tracking * Math.max(0, Array.from(text).length - 1);
  };
}

/**
 * The document as it will be drawn: filtered to what the fonts have, then laid
 * out with their measure. Separate from {@link renderPlanPdf} so a test can read
 * the laid-out text - the PDF itself carries glyph ids, not characters.
 */
export function prepareDocument(
  doc: PrintDocument,
  kind: PdfLayoutKind,
  { hasGlyph, measure }: EmbeddedPlanFonts,
): { readonly printable: PrintDocument; readonly layout: PdfLayout } {
  const printable = normalizeDocument(doc, hasGlyph);
  return { printable, layout: layoutDocument(printable, kind, measure) };
}

/**
 * Draws laid-out pages, item by item. No decisions about where anything goes -
 * those are all made in the layout - only how each kind of item becomes pdf-lib
 * calls.
 */
export function drawLayout(pdf: PDFDocument, layout: PdfLayout, fonts: Readonly<Record<FontFace, PDFFont>>): void {
  for (const layoutPage of layout.pages) {
    const page = pdf.addPage([layoutPage.spec.width, layoutPage.spec.height]);
    for (const item of layoutPage.items) {
      drawItem(page, item, fonts);
    }
  }
}

function drawItem(page: PDFPage, item: LayoutItem, fonts: Readonly<Record<FontFace, PDFFont>>): void {
  switch (item.kind) {
    case "text": {
      const tracked = item.tracking !== undefined && item.tracking !== 0;
      // `drawText` has no letter spacing; the PDF operator does, scoped to this
      // one string by the graphics-state push and pop around it.
      if (tracked) {
        page.pushOperators(pushGraphicsState(), setCharacterSpacing(item.tracking ?? 0));
      }
      page.drawText(item.text, {
        x: item.x,
        y: item.y,
        size: item.size,
        font: fonts[item.face],
        color: INK[item.color],
      });
      if (tracked) {
        page.pushOperators(popGraphicsState());
      }
      return;
    }
    case "box":
      // No `color`: an outline only.
      page.drawSvgPath(roundedRectPath(item.width, item.height, item.radius), {
        x: item.x,
        y: item.y + item.height,
        borderColor: INK[item.stroke],
        borderWidth: item.strokeWidth,
        borderDashArray: item.dashed ? DASH : undefined,
      });
      return;
    case "rule":
      page.drawLine({
        start: { x: item.x1, y: item.y1 },
        end: { x: item.x2, y: item.y2 },
        thickness: item.width,
        color: INK[item.color],
      });
      return;
    case "hatch":
      drawHatch(page, item.x, item.y, item.width, item.height);
      return;
    case "mark":
      page.drawSvgPath(MARK_PATH, { x: item.x, y: item.y, scale: item.size / MARK_VIEWBOX, color: INK.ink });
      return;
  }
}

// Quarter circles as cubic Béziers: the control points sit this fraction of the
// radius from each end.
const KAPPA = 0.5523;

/**
 * A rectangle with rounded corners as an SVG path. `drawSvgPath` measures `y`
 * downward from its anchor - the top-left corner - and `drawRectangle` has no
 * corner radius.
 */
function roundedRectPath(width: number, height: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  const k = r * KAPPA;
  return [
    `M ${r} 0`,
    `H ${width - r}`,
    `C ${width - r + k} 0 ${width} ${r - k} ${width} ${r}`,
    `V ${height - r}`,
    `C ${width} ${height - r + k} ${width - r + k} ${height} ${width - r} ${height}`,
    `H ${r}`,
    `C ${r - k} ${height} 0 ${height - r + k} 0 ${height - r}`,
    `V ${r}`,
    `C 0 ${r - k} ${r - k} 0 ${r} 0`,
    "Z",
  ].join(" ");
}

/**
 * Diagonal lines rising left to right, cut to the rectangle by arithmetic
 * rather than a clipping path: each is `y = x + b`, kept between the edges.
 */
function drawHatch(page: PDFPage, x: number, y: number, width: number, height: number): void {
  const right = x + width;
  const top = y + height;
  for (let b = y - right + HATCH_STEP; b < top - x; b += HATCH_STEP) {
    const startX = Math.max(x, y - b);
    const endX = Math.min(right, top - b);
    if (endX > startX) {
      page.drawLine({
        start: { x: startX, y: startX + b },
        end: { x: endX, y: endX + b },
        thickness: HATCH_WIDTH,
        color: INK.hatch,
      });
    }
  }
}

export async function renderPlanPdf(doc: PrintDocument, kind: PdfLayoutKind, fonts: PdfFonts): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const embeddedFonts = await embedPlanFonts(pdf, fonts);
  const { printable, layout } = prepareDocument(doc, kind, embeddedFonts);

  pdf.setTitle(printable.title);
  pdf.setLanguage("pl");
  drawLayout(pdf, layout, embeddedFonts.fonts);

  return pdf.save();
}
