import type { FontFace, InkToken, LayoutItem, Measure, PageSpec } from "@/lib/plan-pdf/layout";
import { BRAND_NAME, BRAND_URL, CONTINUED_MARK, GROUP_LABEL, TRUNCATION_MARK } from "@/lib/plan-pdf/model";

/**
 * The frame every printed sheet shares (`S-29`, after the design's PNG 20/21):
 * a header with the eyebrow, the serif title, „Grupa: ____” and the temio sign
 * over a dark rule, and a footer with a note on the left and `temio.pl` on the
 * right. Between them is the body, which is the caller's.
 *
 * Also the one-line pieces several layouts draw - a text item, a line cut to a
 * width with „…”, the hasło chip, the „SZKIC” tag - so the week and the grid
 * draw them alike.
 *
 * Imports only types from `layout.ts`, so there is no cycle at run time.
 */

const TITLE_SIZE = 18;
const STACKED_TITLE_SIZE = 24;
/** The smallest a title shrinks to before it is cut - a "(cd.)" title on a portrait page is the long one. */
const MIN_TITLE_SIZE = 12;
const EYEBROW_SIZE = 8.25;
const EYEBROW_TRACKING = 1.3;
const EYEBROW_GAP = 10;
const SIDE_SIZE = 8.25;
const BRAND_SIZE = 13.5;
const MARK_GAP = 5;
/** The blank the teacher writes the group's name on. */
const GROUP_LINE = 90;
const GROUP_LINE_GAP = 4;
const SIDE_GAP = 16;
const HEADER_RULE_WIDTH = 1.1;
const HEADER_BODY_GAP = 9;
const FOOTER_SIZE = 7.9;
const FOOTER_RULE_GAP = 6;
const FOOTER_BODY_GAP = 8;

export interface SheetHeading {
  readonly eyebrow: string;
  readonly title: string;
  readonly continued: boolean;
  /** The footer's left side; `null` leaves it to the caller (the grid draws its legend there) or empty. */
  readonly note: string | null;
  /**
   * Eyebrow above the title rather than after it on the same baseline. The grid
   * always stacks; a week stacks only when the line would not fit - on a portrait
   * page, or with a long "(cd.)" title.
   */
  readonly stacked?: boolean;
  /** The thin rule over the footer; the grid has none. */
  readonly footerRule?: boolean;
}

export interface SheetFrame {
  readonly items: LayoutItem[];
  /** The body: below the header rule, above the footer. */
  readonly contentTop: number;
  readonly contentBottom: number;
  /** Where the footer's text sits, for a caller that draws its own footer content. */
  readonly footerBaseline: number;
  readonly footerSize: number;
}

export function textItem(
  x: number,
  y: number,
  text: string,
  size: number,
  face: FontFace,
  color: InkToken,
  tracking?: number,
): LayoutItem {
  return tracking === undefined
    ? { kind: "text", x, y, text, size, face, color }
    : { kind: "text", x, y, text, size, face, color, tracking };
}

/**
 * `text` on one line no wider than `width`: itself if it fits, else shortened -
 * whole words first, then characters - until it and {@link TRUNCATION_MARK} do.
 */
export function fitOneLine(
  text: string,
  width: number,
  size: number,
  face: FontFace,
  measure: Measure,
  tracking = 0,
): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (measure(flat, size, face, tracking) <= width) {
    return flat;
  }
  return withTruncationMark(flat, width, size, face, measure, tracking);
}

/**
 * `text` shortened until it and {@link TRUNCATION_MARK} fit `width` - whole
 * words first, then, for a line that is one long word, characters - and always
 * ending with the mark.
 *
 * Both searches halve rather than drop one piece at a time: a hasło may be
 * 2000 characters with no space, and every prefix is a new string the measure
 * cannot have cached - one at a time, that was seconds per chip.
 */
export function withTruncationMark(
  text: string,
  width: number,
  size: number,
  face: FontFace,
  measure: Measure,
  tracking = 0,
): string {
  const fits = (candidate: string) => measure(candidate + TRUNCATION_MARK, size, face, tracking) <= width;
  const words = text.split(" ").filter((word) => word !== "");
  const keptWords = longestFitting(words.length, (count) => fits(words.slice(0, count).join(" ")));
  const chars = Array.from(words.slice(0, Math.max(1, keptWords)).join(" "));
  const keptChars = longestFitting(chars.length, (count) => fits(chars.slice(0, count).join("")));
  return chars.slice(0, keptChars).join("").trimEnd() + TRUNCATION_MARK;
}

/** The largest `count` in 0…`total` for which `fits(count)` holds, `fits` growing false with `count`. */
function longestFitting(total: number, fits: (count: number) => boolean): number {
  let low = 0;
  let high = total;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (fits(middle)) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low;
}

/** The hasło as a pill: one line, its outline in the chip colour. */
export interface Chip {
  readonly text: string;
  readonly width: number;
  readonly height: number;
  /** Items with the pill's bottom-left corner at `x`, `y`. */
  readonly draw: (x: number, y: number) => LayoutItem[];
}

export function chip(text: string, maxWidth: number, size: number, measure: Measure): Chip | null {
  const padding = size * 0.75;
  const room = maxWidth - 2 * padding;
  const fitted = fitOneLine(text, room, size, "bold", measure);
  // A bare „…” still says there was a hasło; only no room even for that drops the chip.
  if (fitted === "" || measure(fitted, size, "bold") > room) {
    return null;
  }
  const width = measure(fitted, size, "bold") + 2 * padding;
  const height = size * 1.5;
  return {
    text: fitted,
    width,
    height,
    draw: (x, y) => [
      { kind: "box", x, y, width, height, radius: height / 2, stroke: "chip", strokeWidth: 0.75, dashed: false },
      textItem(x + padding, y + size * 0.42, fitted, size, "bold", "ink"),
    ],
  };
}

/** {@link DRAFT_TAG}-style label in a small dashed outline: text, not colour, says "draft". */
export function tag(text: string, size: number, measure: Measure): Chip {
  const tracking = size * 0.12;
  const padding = size * 0.5;
  const width = measure(text, size, "bold", tracking) + 2 * padding;
  const height = size * 1.45;
  return {
    text,
    width,
    height,
    draw: (x, y) => [
      { kind: "box", x, y, width, height, radius: 2.5, stroke: "muted", strokeWidth: 0.75, dashed: true },
      textItem(x + padding, y + size * 0.4, text, size, "bold", "muted", tracking),
    ],
  };
}

export function sheetFrame(spec: PageSpec, heading: SheetHeading, measure: Measure): SheetFrame {
  const left = spec.margin;
  const right = spec.width - spec.margin;
  const top = spec.height - spec.margin;
  const items: LayoutItem[] = [];

  const title = heading.continued ? `${heading.title} ${CONTINUED_MARK}` : heading.title;
  const brandWidth = measure(BRAND_NAME, BRAND_SIZE, "serif");
  const labelWidth = measure(GROUP_LABEL, SIDE_SIZE, "regular");
  const groupWidth = labelWidth + GROUP_LINE_GAP + GROUP_LINE;
  const eyebrowWidth = measure(heading.eyebrow, EYEBROW_SIZE, "bold", EYEBROW_TRACKING);

  // The inline header holds, left to right: title, eyebrow, group blank, sign.
  const inlineRoom = right - left - (BRAND_SIZE + MARK_GAP + brandWidth) - SIDE_GAP - groupWidth - SIDE_GAP;
  const inlineFits = measure(title, TITLE_SIZE, "serif") + EYEBROW_GAP + eyebrowWidth <= inlineRoom;
  const stacked = heading.stacked ?? !inlineFits;

  let titleBaseline: number;
  let titleSize: number;
  if (stacked) {
    const eyebrowBaseline = top - EYEBROW_SIZE;
    items.push(textItem(left, eyebrowBaseline, heading.eyebrow, EYEBROW_SIZE, "bold", "accent", EYEBROW_TRACKING));
    titleSize = fittedTitleSize(title, STACKED_TITLE_SIZE, right - left - groupWidth - SIDE_GAP, measure);
    titleBaseline = eyebrowBaseline - EYEBROW_SIZE * 0.6 - titleSize * 0.8;
    // Sign at the top right, the group blank under it on the title's baseline.
    pushBrand(items, right, top - BRAND_SIZE, brandWidth);
    pushGroup(items, right - groupWidth, titleBaseline, labelWidth);
  } else {
    titleSize = TITLE_SIZE;
    titleBaseline = top - TITLE_SIZE;
    const brandLeft = right - brandWidth - MARK_GAP - BRAND_SIZE;
    pushBrand(items, right, titleBaseline, brandWidth);
    pushGroup(items, brandLeft - SIDE_GAP - groupWidth, titleBaseline, labelWidth);
  }
  const shownTitle = fitOneLine(title, right - left - groupWidth - SIDE_GAP, titleSize, "serif", measure);
  items.push(textItem(left, titleBaseline, shownTitle, titleSize, "serif", "ink"));
  if (!stacked) {
    const eyebrowX = left + measure(shownTitle, titleSize, "serif") + EYEBROW_GAP;
    items.push(textItem(eyebrowX, titleBaseline, heading.eyebrow, EYEBROW_SIZE, "bold", "accent", EYEBROW_TRACKING));
  }

  const headerRule = titleBaseline - titleSize * 0.3 - 6;
  items.push({
    kind: "rule",
    x1: left,
    y1: headerRule,
    x2: right,
    y2: headerRule,
    color: "ink",
    width: HEADER_RULE_WIDTH,
  });

  // The footer's descenders stay inside the margin.
  const footerBaseline = spec.margin + FOOTER_SIZE * 0.3;
  const urlWidth = measure(BRAND_URL, FOOTER_SIZE, "regular");
  items.push(textItem(right - urlWidth, footerBaseline, BRAND_URL, FOOTER_SIZE, "regular", "muted"));
  if (heading.note !== null) {
    const note = fitOneLine(heading.note, right - left - urlWidth - SIDE_GAP, FOOTER_SIZE, "regular", measure);
    items.push(textItem(left, footerBaseline, note, FOOTER_SIZE, "regular", "muted"));
  }
  const footerTop = footerBaseline + FOOTER_SIZE + FOOTER_RULE_GAP;
  if (heading.footerRule ?? true) {
    items.push({ kind: "rule", x1: left, y1: footerTop, x2: right, y2: footerTop, color: "divider", width: 0.75 });
  }

  return {
    items,
    contentTop: headerRule - HEADER_BODY_GAP,
    contentBottom: footerTop + FOOTER_BODY_GAP,
    footerBaseline,
    footerSize: FOOTER_SIZE,
  };
}

function fittedTitleSize(title: string, size: number, width: number, measure: Measure): number {
  const natural = measure(title, size, "serif");
  return natural <= width ? size : Math.max(MIN_TITLE_SIZE, (size * width) / natural);
}

/** The temio sign and name, ending at `right`, on `baseline`. */
function pushBrand(items: LayoutItem[], right: number, baseline: number, brandWidth: number): void {
  const textX = right - brandWidth;
  const markSize = BRAND_SIZE * 0.85;
  items.push({ kind: "mark", x: textX - MARK_GAP - markSize, y: baseline + markSize - 0.5, size: markSize });
  items.push(textItem(textX, baseline, BRAND_NAME, BRAND_SIZE, "serif", "ink"));
}

/** „Grupa:” and a blank line after it, from `x`. */
function pushGroup(items: LayoutItem[], x: number, baseline: number, labelWidth: number): void {
  items.push(textItem(x, baseline, GROUP_LABEL, SIDE_SIZE, "regular", "muted"));
  const lineStart = x + labelWidth + GROUP_LINE_GAP;
  items.push({
    kind: "rule",
    x1: lineStart,
    y1: baseline - 1,
    x2: lineStart + GROUP_LINE,
    y2: baseline - 1,
    color: "muted",
    width: 0.5,
  });
}
