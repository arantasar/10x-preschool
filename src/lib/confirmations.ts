/**
 * What a confirmation window says: a title, the paragraphs under it, and two
 * buttons named after what they do.
 *
 * The questions used to be strings handed to `window.confirm`, whose buttons
 * are the browser's "OK" and "Anuluj". The application's own window
 * (`ConfirmDialog`) names both outcomes instead - which matters most where
 * declining is not "stop": in the week's scope question it narrows the run.
 *
 * Data and not JSX, for the reason `week-generation.ts` and
 * `week-day-controls.ts` are modules: these windows are the only thing standing
 * in front of irreversible operations, and a claim that can only be checked by
 * rendering a React tree is a claim nobody checks. The week's questions live in
 * those two modules, next to the rules they state; the day view's three live
 * here. Imports nothing, so the islands can carry it.
 */
export interface ConfirmationRequest {
  readonly title: string;
  /** Paragraphs, in order. */
  readonly body: readonly string[];
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  /**
   * `danger` for an operation that cannot be undone. The window then opens with
   * the focus on the safe button, so Enter pressed out of habit destroys nothing.
   */
  readonly tone: "default" | "danger";
}

/** The sentence every irreversible operation ends on. The e2e suite looks for it. */
export const IRREVERSIBLE_SENTENCE = "Tej operacji nie można cofnąć.";

/** Every window that deletes a plan offers the same two ways out. */
export const DELETE_CONFIRM_LABEL = "Usuń plan";
export const DELETE_CANCEL_LABEL = "Zostaw";

/** Every window that replaces proposals with newly generated ones. */
export const REGENERATE_CONFIRM_LABEL = "Wygeneruj nowe";
export const REGENERATE_CANCEL_LABEL = "Zostaw obecne";

/**
 * Regenerating a day that is approved (`DayPlanEditor.generate`).
 *
 * Asked only on an approved plan: on one still under review the teacher is
 * iterating and has invested nothing in what is there. The window names what it
 * costs rather than asking a generic "are you sure?".
 */
export function regenerateApprovedDayConfirmation(): ConfirmationRequest {
  return {
    title: "Wygenerować nowe propozycje?",
    body: [
      "Ten dzień jest zatwierdzony.",
      "Wygenerowanie nowych propozycji usunie obecne i cofnie zatwierdzenie tego planu.",
      IRREVERSIBLE_SENTENCE,
    ],
    confirmLabel: REGENERATE_CONFIRM_LABEL,
    cancelLabel: REGENERATE_CANCEL_LABEL,
    tone: "danger",
  };
}

/**
 * Saving an edit on a day that is approved (`DayPlanEditor.saveDraft`, FR-017).
 *
 * Not `danger`: the approval comes back in one click, and the window says so.
 * Declining keeps the editor open with the teacher's text in it, which is what
 * the cancel button is named after.
 */
export function editApprovedDayConfirmation(): ConfirmationRequest {
  return {
    title: "Zapisać zmianę?",
    body: [
      "Ten dzień jest zatwierdzony.",
      "Zapisanie zmiany cofnie zatwierdzenie i plan będzie znów do przejrzenia.",
      "Zatwierdzenie można przywrócić jednym kliknięciem.",
    ],
    confirmLabel: "Zapisz i cofnij zatwierdzenie",
    cancelLabel: "Wróć do edycji",
    tone: "default",
  };
}

/**
 * Deleting the day from the day view (`DayPlanEditor.deletePlan`).
 *
 * Unconditional, whatever the day's state: deleting hands back nothing, and
 * there is no schema-side refusal behind the window - it is the whole protection
 * against a misclick. The week's counterpart, which also names the day, is
 * `deleteConfirmation` in `week-day-controls.ts`.
 */
export function deleteDayPlanConfirmation(): ConfirmationRequest {
  return {
    title: "Usunąć plan dnia?",
    body: [
      "Usunięcie planu dnia skasuje hasło i wszystkie propozycje tego dnia.",
      "Dzień wróci do stanu sprzed planowania.",
      IRREVERSIBLE_SENTENCE,
    ],
    confirmLabel: DELETE_CONFIRM_LABEL,
    cancelLabel: DELETE_CANCEL_LABEL,
    tone: "danger",
  };
}
