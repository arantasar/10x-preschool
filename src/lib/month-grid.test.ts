import { describe, expect, it } from "vitest";

import { clipText, LABEL_PART_MAX, PREVIEW_DESCRIPTION_MAX, tileLabel } from "./month-grid";

describe("tileLabel", () => {
  it("names an empty day as having no plan", () => {
    expect(tileLabel("2026-11-09", undefined)).toBe("Plan na 2026-11-09 — brak planu");
  });

  it("puts the content before the state, with the theme when there is one", () => {
    expect(
      tileLabel("2026-11-09", { plan_date: "2026-11-09", prompt: "Dinozaury", accepted: true, theme: "Tropy" }),
    ).toBe("Plan na 2026-11-09 — Dinozaury — Tropy — zaakceptowany");
  });

  it("keeps a single member for a day without a theme", () => {
    expect(tileLabel("2026-11-09", { plan_date: "2026-11-09", prompt: "Jesień", accepted: false, theme: null })).toBe(
      "Plan na 2026-11-09 — Jesień — roboczy",
    );
  });

  it("clips an overlong hasło so the state is not buried", () => {
    const label = tileLabel("2026-11-09", {
      plan_date: "2026-11-09",
      prompt: "a".repeat(500),
      accepted: false,
      theme: null,
    });
    expect(label).toBe(`Plan na 2026-11-09 — ${"a".repeat(LABEL_PART_MAX - 1)}… — roboczy`);
  });
});

describe("clipText", () => {
  it("passes text within the bound through untouched", () => {
    expect(clipText("Krótki opis", PREVIEW_DESCRIPTION_MAX)).toBe("Krótki opis");
    expect(clipText("x".repeat(10), 10)).toBe("x".repeat(10));
  });

  it("cuts to the bound, ellipsis included", () => {
    const clipped = clipText("y".repeat(PREVIEW_DESCRIPTION_MAX * 3), PREVIEW_DESCRIPTION_MAX);
    expect(clipped).toHaveLength(PREVIEW_DESCRIPTION_MAX);
    expect(clipped.endsWith("…")).toBe(true);
  });

  it("does not leave a space before the ellipsis", () => {
    expect(clipText("słowo drugie trzecie", 7)).toBe("słowo…");
  });
});
