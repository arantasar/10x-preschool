import { describe, expect, it } from "vitest";

import { formatPlanDate } from "./day-plan-dates";
import {
  acceptanceControlName,
  acceptanceNotice,
  CONFLICT_MESSAGE,
  deleteConfirmation,
  deleteControlName,
  deletedNotice,
} from "./week-day-controls";

// Two adjacent days, because the risk this module answers is a click landing on
// the neighbour. A sentence that named a fixed day, or the first day of the
// week, would pass on one date and fail on the other.
const DATES = ["2026-11-09", "2026-11-10"];

const ACCEPTED_SENTENCE = "Ten dzień jest zatwierdzony.";
const IRREVERSIBLE_SENTENCE = "Tej operacji nie można cofnąć.";

describe("deleteConfirmation", () => {
  it("reads as agreed at planning for an accepted day", () => {
    expect(deleteConfirmation("2026-11-09", true)).toEqual({
      title: "Usunąć plan na poniedziałek, 9 listopada 2026?",
      body: [
        "Ten dzień jest zatwierdzony.",
        "Usunięcie skasuje hasło i wszystkie propozycje tego dnia.",
        "Tej operacji nie można cofnąć.",
      ],
      confirmLabel: "Usuń plan",
      cancelLabel: "Zostaw",
      tone: "danger",
    });
  });

  it("reads the same without the acceptance sentence for a draft", () => {
    expect(deleteConfirmation("2026-11-09", false)).toEqual({
      title: "Usunąć plan na poniedziałek, 9 listopada 2026?",
      body: ["Usunięcie skasuje hasło i wszystkie propozycje tego dnia.", "Tej operacji nie można cofnąć."],
      confirmLabel: "Usuń plan",
      cancelLabel: "Zostaw",
      tone: "danger",
    });
  });

  it.each(DATES)("names %s in both variants", (planDate) => {
    expect(deleteConfirmation(planDate, true).title).toContain(formatPlanDate(planDate));
    expect(deleteConfirmation(planDate, false).title).toContain(formatPlanDate(planDate));
  });

  it("says the day is accepted when it is", () => {
    expect(deleteConfirmation(DATES[0], true).body).toContain(ACCEPTED_SENTENCE);
  });

  // Anchored on the whole sentence, not on "zatwierdz": the stem is not what
  // matters, the claim is. A draft must never be described as accepted.
  it("does not say the day is accepted when it is a draft", () => {
    expect(deleteConfirmation(DATES[0], false).body).not.toContain(ACCEPTED_SENTENCE);
  });

  it("always ends by saying the operation cannot be undone", () => {
    expect(deleteConfirmation(DATES[0], true).body.at(-1)).toBe(IRREVERSIBLE_SENTENCE);
    expect(deleteConfirmation(DATES[0], false).body.at(-1)).toBe(IRREVERSIBLE_SENTENCE);
  });

  // Nothing is handed back by a delete, so Enter out of habit must not confirm it.
  it("is dangerous and names its buttons after the outcome, whatever the day's state", () => {
    for (const accepted of [true, false]) {
      const request = deleteConfirmation(DATES[0], accepted);
      expect(request.tone).toBe("danger");
      expect(request.confirmLabel).toBe("Usuń plan");
      expect(request.cancelLabel).toBe("Zostaw");
    }
  });
});

describe("acceptanceNotice", () => {
  it.each(DATES)("names %s in both directions", (planDate) => {
    expect(acceptanceNotice(planDate, true)).toContain(formatPlanDate(planDate));
    expect(acceptanceNotice(planDate, false)).toContain(formatPlanDate(planDate));
  });

  it("says what taking the acceptance away did, and where the way back is", () => {
    const notice = acceptanceNotice(DATES[0], false);

    expect(notice).toContain("Cofnięto zatwierdzenie");
    expect(notice).toContain("Plan jest znów do przejrzenia");
    expect(notice).toContain("ten sam przycisk");
  });

  it("says the day was accepted, and nothing about taking it back", () => {
    const notice = acceptanceNotice(DATES[0], true);

    expect(notice).toBe("Zatwierdzono plan na poniedziałek, 9 listopada 2026.");
    expect(notice).not.toContain("Cofnięto");
  });
});

describe("deletedNotice", () => {
  it.each(DATES)("names %s", (planDate) => {
    expect(deletedNotice(planDate)).toContain(formatPlanDate(planDate));
  });
});

// WCAG 2.5.3 (Label in Name): the accessible name starts with what the button
// shows. The literals are the visible labels, pinned here on purpose - they are
// also what the e2e locators and a voice user say.
describe("accessible names", () => {
  it.each(DATES)("the toggle on accepted %s starts with its label and names the day", (planDate) => {
    const name = acceptanceControlName(planDate, true);

    expect(name.startsWith("Cofnij zatwierdzenie")).toBe(true);
    expect(name).toContain(formatPlanDate(planDate));
  });

  it.each(DATES)("the toggle on draft %s starts with its label and names the day", (planDate) => {
    const name = acceptanceControlName(planDate, false);

    expect(name.startsWith("Zatwierdź dzień")).toBe(true);
    expect(name).toContain(formatPlanDate(planDate));
  });

  it.each(DATES)("the delete button on %s starts with its label and names the day", (planDate) => {
    const name = deleteControlName(planDate);

    expect(name.startsWith("Usuń plan dnia")).toBe(true);
    expect(name).toContain(formatPlanDate(planDate));
  });
});

describe("CONFLICT_MESSAGE", () => {
  // The card has just re-read its day. Telling the teacher to refresh would be
  // telling them to do what already happened.
  it("does not send the teacher to refresh the page", () => {
    expect(CONFLICT_MESSAGE).not.toContain("Odśwież");
  });

  it("says the card now shows the current state", () => {
    expect(CONFLICT_MESSAGE).toContain("aktualny stan");
  });
});
