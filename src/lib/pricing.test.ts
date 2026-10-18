import { describe, expect, it } from "vitest";

import { formatLegalDate } from "@/lib/legal";

import {
  BASIC_NOTE,
  BASIC_PLAN,
  BEFORE_PAYMENTS_ACCESS_UNTIL,
  FOUNDER_LIST_RETENTION_UNTIL,
  FREE_NOTE,
  FREE_PLAN,
  PAYMENTS_START_LABEL,
  PAYMENTS_START_ON,
  PLAN_COMPARISON,
  comparisonNoteMarks,
  comparisonTexts,
} from "./pricing";

/** Everything the page prints from this module. */
function everyText(): string[] {
  return [
    ...comparisonTexts(),
    ...[FREE_PLAN, BASIC_PLAN].flatMap((plan) => [plan.name, plan.subtitle, ...plan.features]),
    FREE_NOTE,
    BASIC_NOTE.yearly,
    BASIC_NOTE.monthly,
  ];
}

describe("pricing — dates", () => {
  it("names the start of payments as the page prints it", () => {
    expect(formatLegalDate(PAYMENTS_START_ON)).toBe("1 lutego 2027");
    expect(PAYMENTS_START_LABEL).toBe("1 lutego 2027");
  });

  it("starts payments the day after accounts from before payments lose full access (S-30)", () => {
    expect(BEFORE_PAYMENTS_ACCESS_UNTIL).toBe("2027-01-31");
  });

  it("keeps the list until the date in the retention job", () => {
    expect(FOUNDER_LIST_RETENTION_UNTIL).toBe("2027-08-31");
  });
});

describe("pricing — nothing false today", () => {
  it("never says „bez limitu” - Basic has a fair-use limit", () => {
    for (const text of everyText()) expect(text.toLowerCase()).not.toContain("bez limitu");
  });

  it("never mentions a Pro plan (FR-028)", () => {
    for (const text of everyText()) expect(text).not.toMatch(/\bPro\b/);
  });

  it("does not count a refinement against the pool of days (FR-037)", () => {
    const refinement = PLAN_COMPARISON.groups
      .flatMap((group) => group.rows)
      .find((row) => row.label === "Poprawka aktywności poleceniem");
    expect(refinement).toBeDefined();
    const cells = JSON.stringify([refinement?.free, refinement?.basic]);
    expect(cells).not.toMatch(/liczy się do puli/);
    for (const text of everyText()) expect(text).not.toMatch(/liczą się do (miesięcznej )?puli/);
    expect(PLAN_COMPARISON.notes[1]).toContain("nie zużywa dni z puli");
  });

  it("states the yearly price per month as 159 / 12", () => {
    expect(BASIC_NOTE.yearly).toContain("13,25 zł");
  });

  it("has one footnote for every footnote mark in the table", () => {
    const marks = [...new Set(comparisonNoteMarks())].sort();
    expect(marks).toEqual(PLAN_COMPARISON.notes.map((_, index) => index + 1));
  });
});
