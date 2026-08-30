import { describe, expect, it } from "vitest";

import { isDayPlanBody, isErrorBody, isOutlineBody, isRecord } from "./day-plan-guards";

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

  it.each([null, undefined, 42, "plan", [], {}])("rejects %o", (value) => {
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
