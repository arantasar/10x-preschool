import type { DayPlanSummary } from "@/types";

/**
 * The text the month grid and its day preview put on screen and in the
 * accessibility tree.
 *
 * It used to live in `MonthGrid.astro`'s frontmatter. It moved here when the
 * grid became a React island (`S-07`): the island needs it, and a module is
 * where it can be tested - the island itself cannot be rendered in this suite.
 * Imports nothing but a type, so the island can carry it.
 */

export function dayNumber(isoDate: string): string {
  return String(Number(isoDate.slice(8, 10)));
}

/**
 * Cuts `text` to at most `max` characters, ending in an ellipsis when it had to.
 *
 * The trailing whitespace is trimmed before the ellipsis, so a cut that lands
 * right after a space does not read as "słowo …".
 */
export function clipText(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * How much of the hasło or the theme the accessible name carries.
 *
 * The preview card is bounded by the screen and by the reader moving on; a
 * screen reader reading the tile's name is bounded by neither, and reads the
 * whole name before the teacher can act on the tile. `PROMPT_MAX` is 2000 and nothing narrower stands
 * between the textarea and this string, so the bound has to live here.
 */
export const LABEL_PART_MAX = 80;

export function clipForLabel(text: string): string {
  return clipText(text, LABEL_PART_MAX);
}

/**
 * How much of an activity description the day preview shows.
 *
 * Bounded in the text and not only by `line-clamp`: the preview is the tile's
 * `aria-describedby`, and CSS clipping leaves the whole description - up to
 * `DESCRIPTION_MAX`, three times over - in the DOM for a screen reader to read.
 * The same reason `LABEL_PART_MAX` exists.
 */
export const PREVIEW_DESCRIPTION_MAX = 160;

export function joinText(prompt: string, theme: string | null): string {
  return theme === null ? prompt : `${prompt} — ${theme}`;
}

/**
 * The tile's accessible name: which day, what is on it, and what state it is in.
 *
 * The content sits before the state on purpose - a teacher tabbing across a
 * planned week wants to hear which day is which, and "zaakceptowany" is the
 * qualifier on that, not the headline. Each member is clipped: the name is read
 * aloud in full, so an unbounded hasło would bury the state at the end of a
 * paragraph. The day preview keeps the untruncated theme.
 */
export function tileLabel(isoDate: string, summary: DayPlanSummary | undefined): string {
  if (!summary) {
    return `Plan na ${isoDate} — brak planu`;
  }
  const content = joinText(clipForLabel(summary.prompt), summary.theme === null ? null : clipForLabel(summary.theme));
  return `Plan na ${isoDate} — ${content} — ${summary.accepted ? "zaakceptowany" : "roboczy"}`;
}
