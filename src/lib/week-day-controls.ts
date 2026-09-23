import { formatPlanDate } from "@/lib/day-plan-dates";

/**
 * Every sentence and every accessible name that says which day a week-board
 * operation is about.
 *
 * `S-11` puts acceptance and deletion on the week board, where five cards stand
 * side by side and a click can land on the neighbour. The Socratic round kept
 * FR-015 on one condition: the operation names its day, rather than trusting
 * that the teacher hit the right card. This module is where that naming lives.
 *
 * A module and not a handful of functions inside `WeekPlanBoard.tsx`, for the
 * reason `week-generation.ts` is one: the delete dialog is the only thing
 * standing in front of an irreversible operation, and a claim that can only be
 * checked by rendering a React tree is a claim nobody checks. Imports nothing
 * but the date formatter - no zod, no React - so the island can carry it.
 */

/** The visible labels. Each accessible name below starts with one of these. */
export const ACCEPT_DAY_LABEL = "Akceptuj dzień";
export const UNACCEPT_DAY_LABEL = "Cofnij akceptację";
export const DELETE_DAY_LABEL = "Usuń plan dnia";

/**
 * What the teacher confirms before a day is deleted from the week.
 *
 * The acceptance sentence only when the day is accepted: guardrail #2 asks the
 * confirmation to be honest about the day's state, and saying "accepted" of a
 * draft would teach the teacher to skim the one sentence that matters. The
 * state comes from the island's copy and can be stale - deletion does not check
 * it, by the `S-05` decision this inherits (no `expected_generation` on delete).
 *
 * Unconditional, unlike acceptance: there is no undo (PRD v2 §Non-Goals), so
 * the last sentence is not decoration.
 */
export function deleteConfirmation(planDate: string, accepted: boolean): string {
  const sentences = [`Usunąć plan na ${formatPlanDate(planDate)}?`];
  if (accepted) {
    sentences.push("Ten dzień jest zaakceptowany.");
  }
  sentences.push("Usunięcie skasuje hasło i wszystkie propozycje tego dnia.", "Tej operacji nie można cofnąć.");
  return sentences.join(" ");
}

/**
 * What the card says after acceptance was toggled from the week.
 *
 * No dialog stands in front of this operation - it is reversible - so the
 * naming happens after the fact instead. Taking an acceptance away also says
 * where the way back is, because "one click to undo" is only true if the
 * teacher can see which click.
 */
export function acceptanceNotice(planDate: string, accepted: boolean): string {
  const day = formatPlanDate(planDate);
  if (accepted) {
    return `Zaakceptowano plan na ${day}.`;
  }
  return `Cofnięto akceptację planu na ${day}. Plan wrócił do roboczego — akceptację przywraca ten sam przycisk.`;
}

/** What the card says once its day has been deleted. */
export function deletedNotice(planDate: string): string {
  return `Usunięto plan na ${formatPlanDate(planDate)}.`;
}

/**
 * The toggle's accessible name: the visible label first, then the day.
 *
 * Label first because WCAG 2.5.3 (Label in Name) asks that what a voice user
 * reads off the screen is what activates the control. The date is what makes
 * five identical buttons five different ones - to a screen reader, and to an
 * e2e locator asserting that a click hit the day it names.
 */
export function acceptanceControlName(planDate: string, accepted: boolean): string {
  return `${accepted ? UNACCEPT_DAY_LABEL : ACCEPT_DAY_LABEL}: ${formatPlanDate(planDate)}`;
}

/** The delete button's accessible name. Same rule as {@link acceptanceControlName}. */
export function deleteControlName(planDate: string): string {
  return `${DELETE_DAY_LABEL}: ${formatPlanDate(planDate)}`;
}

/**
 * The acceptance route's 409, as the week board says it.
 *
 * The route's own message tells the teacher to refresh the page. On the week
 * board that stopped being true: the card re-reads its day straight after the
 * refusal, so what is on screen is already the current state.
 */
export const CONFLICT_MESSAGE =
  "Ten dzień zmienił się w innym miejscu, więc akceptacja nie została zmieniona. " +
  "Karta pokazuje teraz jego aktualny stan.";
