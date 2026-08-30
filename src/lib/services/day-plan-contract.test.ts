import { describe, expect, it } from "vitest";

import { dayPlanProposalSchema, toDayThemes, weekOutlineSchema } from "./day-plan-contract";
import { ACTIVITY_COUNT, DESCRIPTION_MAX, TITLE_MAX, WEEK_DAYS } from "@/lib/day-plan-limits";

// `dayPlanProposalSchema` is the only thing in the codebase that enforces
// ACTIVITY_COUNT: the JSON Schema sent as `response_format` is an instruction to
// the model, and `save_day_plan_generation` happily writes any batch length. If
// this schema stops refusing, an off-contract response reaches the database.

function activity(index: number) {
  return { tytul: `Aktywność ${String(index)}`, opis: `Opis aktywności ${String(index)}` };
}

function activities(count: number) {
  return { aktywnosci: Array.from({ length: count }, (_, index) => activity(index + 1)) };
}

describe("dayPlanProposalSchema", () => {
  it(`accepts exactly ${String(ACTIVITY_COUNT)} activities`, () => {
    const result = dayPlanProposalSchema.safeParse(activities(ACTIVITY_COUNT));

    expect(result.success).toBe(true);
  });

  it.each([0, 2, 4])("rejects a batch of %i activities", (count) => {
    const result = dayPlanProposalSchema.safeParse(activities(count));

    expect(result.success).toBe(false);
  });

  it("rejects a missing `aktywnosci` field", () => {
    const result = dayPlanProposalSchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it("rejects a title over TITLE_MAX", () => {
    const proposal = activities(ACTIVITY_COUNT);
    proposal.aktywnosci[0].tytul = "a".repeat(TITLE_MAX + 1);

    expect(dayPlanProposalSchema.safeParse(proposal).success).toBe(false);
  });

  it("rejects a description over DESCRIPTION_MAX", () => {
    const proposal = activities(ACTIVITY_COUNT);
    proposal.aktywnosci[0].opis = "a".repeat(DESCRIPTION_MAX + 1);

    expect(dayPlanProposalSchema.safeParse(proposal).success).toBe(false);
  });

  it("accepts a title and description exactly at the bound", () => {
    const proposal = activities(ACTIVITY_COUNT);
    proposal.aktywnosci[0].tytul = "a".repeat(TITLE_MAX);
    proposal.aktywnosci[0].opis = "a".repeat(DESCRIPTION_MAX);

    expect(dayPlanProposalSchema.safeParse(proposal).success).toBe(true);
  });
});

describe("weekOutlineSchema", () => {
  function themes(days: readonly number[]) {
    return { tematy: days.map((dzien) => ({ dzien, temat: `Temat ${String(dzien)}` })) };
  }

  it("accepts each working day exactly once", () => {
    expect(weekOutlineSchema.safeParse(themes([1, 2, 3, 4, 5])).success).toBe(true);
  });

  it("rejects a duplicated day, which would leave Wednesday with no theme", () => {
    expect(weekOutlineSchema.safeParse(themes([1, 2, 2, 4, 5])).success).toBe(false);
  });

  it(`rejects fewer than ${String(WEEK_DAYS)} themes`, () => {
    expect(weekOutlineSchema.safeParse(themes([1, 2, 3, 4])).success).toBe(false);
  });
});

describe("toDayThemes", () => {
  const DATES = ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"];

  // Pinned to dates rather than to day numbers, because that is what the mapping
  // actually promises: the schema guarantees the five numbers are distinct, not
  // that the model listed them in order, and an out-of-order response would
  // otherwise put Friday's theme on Monday.
  it("pins each theme to its date, whatever order the model listed them in", () => {
    const parsed = weekOutlineSchema.parse({
      tematy: [
        { dzien: 3, temat: "Środa" },
        { dzien: 1, temat: "Poniedziałek" },
        { dzien: 5, temat: "Piątek" },
        { dzien: 2, temat: "Wtorek" },
        { dzien: 4, temat: "Czwartek" },
      ],
    });

    expect(toDayThemes(parsed, DATES)).toEqual([
      { plan_date: "2026-09-14", theme: "Poniedziałek" },
      { plan_date: "2026-09-15", theme: "Wtorek" },
      { plan_date: "2026-09-16", theme: "Środa" },
      { plan_date: "2026-09-17", theme: "Czwartek" },
      { plan_date: "2026-09-18", theme: "Piątek" },
    ]);
  });
});
