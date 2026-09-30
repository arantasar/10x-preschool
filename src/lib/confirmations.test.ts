import { describe, expect, it } from "vitest";

import {
  deleteDayPlanConfirmation,
  editApprovedDayConfirmation,
  IRREVERSIBLE_SENTENCE,
  regenerateApprovedDayConfirmation,
  type ConfirmationRequest,
} from "./confirmations";

const APPROVED_SENTENCE = "Ten dzień jest zatwierdzony.";

function text(request: ConfirmationRequest): string {
  return request.body.join(" ");
}

describe("regenerateApprovedDayConfirmation", () => {
  const request = regenerateApprovedDayConfirmation();

  it("says the day is approved and what regenerating costs", () => {
    expect(request.body[0]).toBe(APPROVED_SENTENCE);
    expect(text(request)).toContain("usunie obecne i cofnie zatwierdzenie tego planu");
  });

  it("ends by saying the operation cannot be undone", () => {
    expect(request.body[request.body.length - 1]).toBe(IRREVERSIBLE_SENTENCE);
  });

  it("names both buttons after their outcome and is dangerous", () => {
    expect(request.confirmLabel).toBe("Wygeneruj nowe");
    expect(request.cancelLabel).toBe("Zostaw obecne");
    expect(request.tone).toBe("danger");
  });
});

describe("editApprovedDayConfirmation", () => {
  const request = editApprovedDayConfirmation();

  it("says the day is approved and that saving takes the approval away", () => {
    expect(request.body[0]).toBe(APPROVED_SENTENCE);
    expect(text(request)).toContain("cofnie zatwierdzenie");
    expect(text(request)).toContain("do przejrzenia");
  });

  it("says the approval can be restored, and so is not dangerous", () => {
    expect(text(request)).toContain("Zatwierdzenie można przywrócić jednym kliknięciem.");
    expect(text(request)).not.toContain(IRREVERSIBLE_SENTENCE);
    expect(request.tone).toBe("default");
  });

  it("names both buttons after their outcome", () => {
    expect(request.confirmLabel).toBe("Zapisz i cofnij zatwierdzenie");
    expect(request.cancelLabel).toBe("Wróć do edycji");
  });
});

describe("deleteDayPlanConfirmation", () => {
  const request = deleteDayPlanConfirmation();

  it("names what is lost", () => {
    expect(text(request)).toContain("skasuje hasło i wszystkie propozycje tego dnia");
  });

  // The day view asks the same question of a day under review and an approved
  // one, so it must not claim either state.
  it("does not claim the day is approved", () => {
    expect(text(request)).not.toContain(APPROVED_SENTENCE);
  });

  it("ends by saying the operation cannot be undone", () => {
    expect(request.body[request.body.length - 1]).toBe(IRREVERSIBLE_SENTENCE);
  });

  it("names both buttons after their outcome and is dangerous", () => {
    expect(request.confirmLabel).toBe("Usuń plan");
    expect(request.cancelLabel).toBe("Zostaw");
    expect(request.tone).toBe("danger");
  });
});

describe("every confirmation", () => {
  it.each([
    ["regenerate", regenerateApprovedDayConfirmation()],
    ["edit", editApprovedDayConfirmation()],
    ["delete", deleteDayPlanConfirmation()],
  ])("%s has a title that is a question, a body and two different buttons", (_name, request) => {
    expect(request.title.endsWith("?")).toBe(true);
    expect(request.body.length).toBeGreaterThan(0);
    expect(request.confirmLabel).not.toBe(request.cancelLabel);
    // The browser's own button names say nothing about the outcome.
    expect([request.confirmLabel, request.cancelLabel]).not.toContain("OK");
    expect([request.confirmLabel, request.cancelLabel]).not.toContain("Anuluj");
  });
});
