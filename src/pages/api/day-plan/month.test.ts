import type { APIContext } from "astro";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { activityRow, planRow, supabaseStub } from "@/lib/services/__fixtures__/supabase";
import { workingDaysOfMonth } from "@/lib/day-plan-dates";

import { GET } from "./month";

// Same shape as `week/day.test.ts`: the route's `GET` is called directly, the
// only substitution is `context.locals`, and nothing under `src/lib/` is mocked -
// zod, `workingDaysOfMonth`, `readWeekPlans` and `storeFailure` all run for real.
//
// The claim worth the most here is the range: the route reads exactly the
// month's working days, never the neighbouring months' edge days its grid rows
// reach into, and never a list the client chose.

const USER = { id: "22222222-2222-4222-8222-222222222222" };
const MONTH = "2026-09";

function context(month: string | null, locals: { user: unknown; supabase: unknown }): APIContext {
  const url = new URL("https://example.test/api/day-plan/month");
  if (month !== null) {
    url.searchParams.set("month", month);
  }
  return { url, request: new Request(url), locals } as unknown as APIContext;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/day-plan/month — refusals", () => {
  it("answers 401 without a session and never reaches the database", async () => {
    const supabase = supabaseStub();

    const response = await GET(context(MONTH, { user: null, supabase: supabase.client }));

    expect(response.status).toBe(401);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("answers as unconfigured without a Supabase client", async () => {
    const response = await GET(context(MONTH, { user: USER, supabase: null }));

    expect(response.status).toBe(500);
    expect(((await response.json()) as { retryable: boolean }).retryable).toBe(false);
  });

  it.each([null, "2026-13", "2026-9", "abc", "2026-00", "2026-09-01"])(
    "answers 400 for month %s and never reaches the database",
    async (month) => {
      const supabase = supabaseStub();

      const response = await GET(context(month, { user: USER, supabase: supabase.client }));

      expect(response.status).toBe(400);
      expect(((await response.json()) as { error: string }).error).toBe("Podaj poprawny miesiąc.");
      expect(supabase.from).not.toHaveBeenCalled();
    },
  );
});

describe("GET /api/day-plan/month — the read", () => {
  it("asks for exactly the month's working days and returns the plans found, keyed by date", async () => {
    const monday = planRow({ id: "11111111-1111-4111-8111-000000000001", plan_date: "2026-09-14" });
    const wednesday = planRow({
      id: "11111111-1111-4111-8111-000000000003",
      plan_date: "2026-09-16",
      accepted_at: "2026-09-15T10:00:00.000Z",
    });
    const supabase = supabaseStub({
      weekPlans: [monday, wednesday],
      weekActivities: [1, 2, 3].flatMap((ordinal) => [activityRow(ordinal, monday), activityRow(ordinal, wednesday)]),
    });

    const response = await GET(context(MONTH, { user: USER, supabase: supabase.client }));
    const body = (await response.json()) as {
      month: string;
      plans: Record<string, { plan: { plan_date: string }; activities: unknown[] }>;
    };

    expect(response.status).toBe(200);
    expect(body.month).toBe(MONTH);
    expect(Object.keys(body.plans).sort()).toEqual(["2026-09-14", "2026-09-16"]);
    expect(body.plans["2026-09-16"].activities).toHaveLength(3);

    expect(supabase.dayPlansIn).toHaveBeenCalledTimes(1);
    const [column, dates] = supabase.dayPlansIn.mock.calls[0] as [string, string[]];
    expect(column).toBe("plan_date");
    expect(dates).toEqual(workingDaysOfMonth(MONTH));
    // Monday 31 August opens September's first grid row; the read must not.
    expect(dates).not.toContain("2026-08-31");
    expect(dates).not.toContain("2026-10-02");
  });

  it("answers an unplanned month with an empty map, not an error", async () => {
    const supabase = supabaseStub();

    const response = await GET(context(MONTH, { user: USER, supabase: supabase.client }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ month: MONTH, plans: {} });
  });

  it("answers a failed read with the store's status", async () => {
    const supabase = supabaseStub({
      weekPlansError: { code: "08006", message: "connection failure", details: "", hint: "" },
    });

    const response = await GET(context(MONTH, { user: USER, supabase: supabase.client }));

    expect(response.status).toBe(503);
    expect(((await response.json()) as { retryable: boolean }).retryable).toBe(true);
  });
});
