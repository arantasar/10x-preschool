import { describe, expect, it } from "vitest";

import {
  isDayPlanBody,
  isErrorBody,
  isGeneratedDayBody,
  isOutlineBody,
  isRecord,
  isSaveWeekBody,
} from "./day-plan-guards";

// These are the island's last line of defence against a body that says
// "generation succeeded" and carries nothing. `[].every(...)` is `true`, so an
// empty batch used to narrow as success — the week board marked the day done and
// the teacher was shown a planned day with no activities in it.

function activity(index: number) {
  return { id: `a${String(index)}`, title: `Tytuł ${String(index)}`, description: `Opis ${String(index)}` };
}

function dayPlanBody(overrides: { plan?: Record<string, unknown>; activities?: unknown[] } = {}) {
  return {
    plan: {
      id: "plan-1",
      prompt: "jesień w lesie",
      accepted_at: null,
      current_generation: 2,
      ...overrides.plan,
    },
    activities: overrides.activities ?? [activity(1), activity(2), activity(3)],
  };
}

describe("isDayPlanBody", () => {
  // The distinguishing case: without it every assertion below would pass against
  // a predicate that simply returns false.
  it("accepts a well-formed body", () => {
    expect(isDayPlanBody(dayPlanBody())).toBe(true);
  });

  it("rejects a body whose activities array is empty", () => {
    expect(isDayPlanBody(dayPlanBody({ activities: [] }))).toBe(false);
  });

  it("rejects an activity missing its description", () => {
    expect(isDayPlanBody(dayPlanBody({ activities: [activity(1), { id: "a2", title: "Tytuł 2" }] }))).toBe(false);
  });

  // The half of the drift `DayPlanEditor` never caught: `expected_generation` is
  // built from this field, so an acceptance sent without it attests to nothing.
  it("rejects a plan without `current_generation`", () => {
    const body = dayPlanBody();
    delete (body.plan as Record<string, unknown>).current_generation;

    expect(isDayPlanBody(body)).toBe(false);
  });

  it("accepts an accepted plan and rejects a non-string `accepted_at`", () => {
    expect(isDayPlanBody(dayPlanBody({ plan: { accepted_at: "2026-09-14T10:00:00.000Z" } }))).toBe(true);
    expect(isDayPlanBody(dayPlanBody({ plan: { accepted_at: 17 } }))).toBe(false);
  });

  // Each row is wrapped in its own array: Vitest spreads an `it.each` row that is
  // itself an array into the test's parameters, so a bare `[]` row would supply
  // zero arguments and silently duplicate the `undefined` case instead of ever
  // handing the guard an array.
  it.each([[null], [undefined], [42], ["plan"], [[]], [{}]])("rejects %o", (value: unknown) => {
    expect(isDayPlanBody(value)).toBe(false);
  });
});

describe("isOutlineBody", () => {
  const themes = [
    { plan_date: "2026-09-14", theme: "Poniedziałek" },
    { plan_date: "2026-09-15", theme: "Wtorek" },
  ];

  it("accepts a well-formed outline", () => {
    expect(isOutlineBody({ themes })).toBe(true);
  });

  it('rejects {"themes": []}, which used to render five days with no theme', () => {
    expect(isOutlineBody({ themes: [] })).toBe(false);
  });

  it("rejects a theme entry missing its date", () => {
    expect(isOutlineBody({ themes: [{ theme: "Poniedziałek" }] })).toBe(false);
  });
});

describe("isErrorBody", () => {
  it("accepts the wire envelope", () => {
    expect(isErrorBody({ error: "Coś poszło nie tak.", retryable: true })).toBe(true);
  });

  it("rejects an envelope without `retryable`", () => {
    expect(isErrorBody({ error: "Coś poszło nie tak." })).toBe(false);
  });
});

describe("isRecord", () => {
  it("separates objects from primitives and null", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord("x")).toBe(false);
  });
});

describe("isGeneratedDayBody", () => {
  function generated(overrides: Record<string, unknown> = {}) {
    return {
      plan_date: "2026-09-14",
      theme: "Liście",
      activities: [
        { title: "Tytuł 1", description: "Opis 1" },
        { title: "Tytuł 2", description: "Opis 2" },
      ],
      ...overrides,
    };
  }

  it("accepts a held batch", () => {
    expect(isGeneratedDayBody(generated())).toBe(true);
  });

  it("accepts a null theme — the outline can legitimately have failed", () => {
    expect(isGeneratedDayBody(generated({ theme: null }))).toBe(true);
  });

  it("rejects an empty batch, which would otherwise count towards a complete set", () => {
    expect(isGeneratedDayBody(generated({ activities: [] }))).toBe(false);
  });

  it.each([
    ["a missing plan_date", generated({ plan_date: undefined })],
    ["a numeric theme", generated({ theme: 3 })],
    ["activities that are not an array", generated({ activities: "trzy" })],
    ["an activity without a description", { ...generated(), activities: [{ title: "Tytuł" }] }],
    ["null", null],
  ])("rejects %s", (_name, value) => {
    expect(isGeneratedDayBody(value)).toBe(false);
  });

  // The distinction the whole slice turns on: a held batch is not a saved day,
  // and the two predicates must not accept each other's bodies.
  it("does not accept a saved day plan, which carries a row it does not", () => {
    expect(isGeneratedDayBody(dayPlanBody())).toBe(false);
  });

  it("is not accepted by isDayPlanBody either", () => {
    expect(isDayPlanBody(generated())).toBe(false);
  });
});

describe("isSaveWeekBody", () => {
  it("accepts a map of saved days", () => {
    expect(isSaveWeekBody({ plans: { "2026-09-14": dayPlanBody(), "2026-09-15": dayPlanBody() } })).toBe(true);
  });

  it("rejects an empty map — nothing came back from a write that wrote something", () => {
    expect(isSaveWeekBody({ plans: {} })).toBe(false);
  });

  it("rejects a day whose batch is empty", () => {
    expect(isSaveWeekBody({ plans: { "2026-09-14": dayPlanBody({ activities: [] }) } })).toBe(false);
  });

  it("rejects a day missing current_generation, which accept would later attest to", () => {
    expect(isSaveWeekBody({ plans: { "2026-09-14": dayPlanBody({ plan: { current_generation: undefined } }) } })).toBe(
      false,
    );
  });

  it.each([
    ["no plans key", { days: {} }],
    ["null", null],
    ["an array", { plans: [] }],
  ])("rejects %s", (_name, value) => {
    expect(isSaveWeekBody(value)).toBe(false);
  });
});
