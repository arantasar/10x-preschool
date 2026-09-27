import fontkit from "@pdf-lib/fontkit";
import { grayscale, PDFDocument, type PDFFont } from "pdf-lib";

import { layoutDocument, normalizeText, type FontWeight, type Measure, type PdfLayout } from "@/lib/plan-pdf/layout";
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

export interface PdfFonts {
  readonly regular: Uint8Array;
  readonly bold: Uint8Array;
}

const DRAFT_FRAME_DASH = [4, 3];
const DRAFT_FRAME_COLOR = grayscale(0.3);
const TEXT_COLOR = grayscale(0);

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
    heading: clean(printDay.heading),
    statusLabel: cleanOrNull(printDay.statusLabel),
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
    rows: doc.rows.map((row) => ({
      ...row,
      heading: clean(row.heading),
      slots: row.slots.map((slot) => (slot === null ? null : day(slot))),
    })),
  };
}

export interface EmbeddedPlanFonts {
  readonly fonts: Readonly<Record<FontWeight, PDFFont>>;
  /** Whether both weights can draw `char`. */
  readonly hasGlyph: (char: string) => boolean;
  /** Width as the embedded fonts will draw it - the measure `layoutDocument` is given. */
  readonly measure: Measure;
}

export async function embedPlanFonts(doc: PDFDocument, fonts: PdfFonts): Promise<EmbeddedPlanFonts> {
  doc.registerFontkit(fontkit);
  // Whole fonts, not `subset: true`: @pdf-lib/fontkit's subsetter breaks the
  // glyph mapping of Noto Sans, and every viewer then draws stray letters in
  // place of the text. No test here can see it - the PDF holds glyph ids, not
  // characters - so only a look at the rendered page does.
  const embedded: Record<FontWeight, PDFFont> = {
    regular: await doc.embedFont(fonts.regular),
    bold: await doc.embedFont(fonts.bold),
  };

  // A character counts as drawable only if both weights have it, because the
  // same string can be set in either.
  const regularSet = new Set(embedded.regular.getCharacterSet());
  const boldSet = new Set(embedded.bold.getCharacterSet());
  const hasGlyph = (char: string) => {
    const code = char.codePointAt(0) ?? 0;
    return regularSet.has(code) && boldSet.has(code);
  };
  return { fonts: embedded, hasGlyph, measure: cachedMeasure(embedded) };
}

/**
 * `widthOfTextAtSize`, remembered per word at 1 pt.
 *
 * Every call runs fontkit's shaping, and wrapping measures each growing
 * candidate line - across up to nine sizes for the week-on-one-page search.
 * Uncached, a week of 4000-character descriptions took over twelve seconds.
 * Width is linear in size, and `wrapText` only ever joins words with single
 * spaces, so a line is the sum of its words plus its spaces; the words repeat
 * endlessly across sizes and candidates.
 */
function cachedMeasure(embedded: Readonly<Record<FontWeight, PDFFont>>): Measure {
  const caches: Record<FontWeight, Map<string, number>> = { regular: new Map(), bold: new Map() };
  const unitWidth = (word: string, weight: FontWeight): number => {
    const cache = caches[weight];
    let width = cache.get(word);
    if (width === undefined) {
      width = embedded[weight].widthOfTextAtSize(word, 1);
      cache.set(word, width);
    }
    return width;
  };
  return (text, size, weight) => {
    const words = text.split(" ");
    const spaces = (words.length - 1) * unitWidth(" ", weight);
    return size * words.reduce((sum, word) => sum + (word === "" ? 0 : unitWidth(word, weight)), spaces);
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

export async function renderPlanPdf(doc: PrintDocument, kind: PdfLayoutKind, fonts: PdfFonts): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const embeddedFonts = await embedPlanFonts(pdf, fonts);
  const embedded = embeddedFonts.fonts;
  const { printable, layout } = prepareDocument(doc, kind, embeddedFonts);

  pdf.setTitle(printable.title);
  pdf.setLanguage("pl");

  for (const layoutPage of layout.pages) {
    const page = pdf.addPage([layoutPage.spec.width, layoutPage.spec.height]);
    for (const item of layoutPage.items) {
      if (item.kind === "text") {
        page.drawText(item.text, {
          x: item.x,
          y: item.y,
          size: item.size,
          font: embedded[item.weight],
          color: TEXT_COLOR,
        });
      } else {
        // No `color`: an outline only, so the frame never depends on the
        // printer drawing backgrounds.
        page.drawRectangle({
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
          borderWidth: 1,
          borderColor: DRAFT_FRAME_COLOR,
          borderDashArray: DRAFT_FRAME_DASH,
        });
      }
    }
  }

  return pdf.save();
}
