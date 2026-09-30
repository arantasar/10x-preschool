import type { APIContext } from "astro";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { activityRow, planRow, supabaseStub } from "@/lib/services/__fixtures__/supabase";

import { DELETE, GET } from "./index";

// Same shape as `activity/[id].test.ts`: the route's methods are exported
// functions, the only substitution is `context.locals`, and no module from
// `src/lib/` is mocked - zod, `readDayPlan`, `deleteDayPlan` and
// `storeFailure` run for real against the PostgREST stub.
//
// Rollout phase 3. What this file pins is how the route *answers*: its gates
// (session, client, date) in order, and how an empty or failed store result
// becomes a status. It does not pin whose rows those are - the stub returns
// what it is told, so "teacher b cannot see or delete teacher a's day" is
// `index.db.test.ts`'s claim, on a real client (test plan §6.3).

const PLAN_DATE = "2026-09-14";
const USER = { id: "22222222-2222-4222-8222-222222222222" };

type Handler = typeof GET;

async function call(handler: Handler, locals: unknown, date: string | null = PLAN_DATE): Promise<Response> {
  const url = new URL("https://example.test/api/day-plan");
  if (date !== null) {
    url.searchParams.set("date", date);
  }
  return await handler({
    request: new Request(url, { method: handler === GET ? "GET" : "DELETE" }),
    url,
    locals,
  } as unknown as APIContext);
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each([
  { method: "GET", handler: GET },
  { method: "DELETE", handler: DELETE },
])("$method /api/day-plan — gates, in order", ({ handler }) => {
  it("answers 401 without a session and never reaches the database", async () => {
    const supabase = supabaseStub({ existingPlan: planRow(), deletedPlan: { id: planRow().id } });

    const response = await call(handler, { user: null, supabase: supabase.client });

    expect(response.status).toBe(401);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("answers 500 unconfigured without a client", async () => {
    const response = await call(handler, { user: USER, supabase: undefined });
    const body = (await response.json()) as { error: string; retryable: boolean };

    expect(response.status).toBe(500);
    expect(body.retryable).toBe(false);
    expect(body.error).toContain("Skontaktuj się z administratorem");
  });

  it.each([
    { name: "a missing date", date: null },
    { name: "a malformed date", date: "14.09.2026" },
    { name: "an impossible date", date: "2026-02-30" },
  ])("answers 400 on $name and never reaches the database", async ({ date }) => {
    const supabase = supabaseStub({ existingPlan: planRow(), deletedPlan: { id: planRow().id } });

    const response = await call(handler, { user: USER, supabase: supabase.client }, date);

    expect(response.status).toBe(400);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe("GET /api/day-plan", () => {
  it("answers 200 with the day's plan and its live proposals", async () => {
    const plan = planRow();
    const supabase = supabaseStub({
      existingPlan: plan,
      savedActivities: [1, 2, 3].map((ordinal) => activityRow(ordinal, plan)),
    });

    const response = await call(GET, { user: USER, supabase: supabase.client });
    const body = (await response.json()) as { plan: { id: string; prompt: string }; activities: unknown[] };

    expect(response.status).toBe(200);
    expect(body.plan.id).toBe(plan.id);
    expect(body.plan.prompt).toBe(plan.prompt);
    expect(body.activities).toHaveLength(3);
  });

  it("answers 404, not retryable, for a day with no plan", async () => {
    const supabase = supabaseStub({ existingPlan: null });

    const response = await call(GET, { user: USER, supabase: supabase.client });
    const body = (await response.json()) as { error: string; retryable: boolean };

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: "Ten dzień nie ma jeszcze planu.", retryable: false });
  });
});

// Risk #7 on the route. Checked by mutation: a retry added to `deleteDayPlan`
// (on any error, as `saveGeneration` does) turns the "exactly once" case red;
// `.eq("plan_date", …)` fed anything but the query's date turns the first red.
describe("DELETE /api/day-plan", () => {
  it("answers 204 with no body, having deleted by the date from the query", async () => {
    const supabase = supabaseStub({ deletedPlan: { id: planRow().id } });

    const response = await call(DELETE, { user: USER, supabase: supabase.client });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(supabase.delete).toHaveBeenCalledTimes(1);
    expect(supabase.deleteEq).toHaveBeenCalledTimes(1);
    expect(supabase.deleteEq).toHaveBeenCalledWith("plan_date", PLAN_DATE);
  });

  it("answers 404, not retryable, when the delete matched nothing", async () => {
    const supabase = supabaseStub({ deletedPlan: null });

    const response = await call(DELETE, { user: USER, supabase: supabase.client });
    const body = (await response.json()) as { error: string; retryable: boolean };

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: "Ten dzień nie ma planu do usunięcia.", retryable: false });
  });

  // Not retried, deliberately (`deleteDayPlan`'s doc): a retry after a lost
  // response would find the row gone and turn a success into a 404. And never
  // 204 on a failure - the island would drop a day the database still holds.
  it("answers 503 on a transient failure, without a second delete", async () => {
    const supabase = supabaseStub({
      deleteError: { code: "08006", message: "connection failure", details: "", hint: "" },
    });

    const response = await call(DELETE, { user: USER, supabase: supabase.client });
    const body = (await response.json()) as { error: string; retryable: boolean };

    expect(response.status).toBe(503);
    expect(body.retryable).toBe(true);
    expect(supabase.delete).toHaveBeenCalledTimes(1);
  });
});
