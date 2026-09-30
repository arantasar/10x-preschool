import type { APIContext } from "astro";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { activityRow, planRow, supabaseStub } from "@/lib/services/__fixtures__/supabase";

import { POST } from "./accept";

// Same shape as `activity/[id].test.ts`: `POST` is an exported function, the
// only substitution is `context.locals`, and no module from `src/lib/` is
// mocked - zod, `setAcceptance`, `readDayPlanById` and `storeFailure` run for
// real against the PostgREST stub.
//
// Rollout phase 3. The route is addressed by `plan_id`, so it is one of the two
// places another account's resource can be named at all (the other is
// `activity/[id]`). An update that matched nothing has three readings the
// teacher must be told apart - it landed, it is theirs but moved on, it is not
// visible - and this file pins the answer to each. That "not visible" is what
// teacher b actually gets for teacher a's plan is `accept.db.test.ts`'s claim,
// on a real client (test plan §6.3).

const PLAN_ID = planRow().id;
const USER = { id: "22222222-2222-4222-8222-222222222222" };

function request(body: unknown): Request {
  return new Request("https://example.test/api/day-plan/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const VALID = { plan_id: PLAN_ID, accepted: true, expected_generation: 1 };

async function call(locals: unknown, body: unknown = VALID): Promise<Response> {
  return await POST({ request: request(body), locals } as unknown as APIContext);
}

function savedDay(acceptedAt: string | null) {
  const plan = planRow({ accepted_at: acceptedAt });
  return { savedPlan: plan, savedActivities: [1, 2, 3].map((ordinal) => activityRow(ordinal, plan)) };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/day-plan/accept — gates", () => {
  it("answers 401 without a session and never reaches the database", async () => {
    const supabase = supabaseStub({ ...savedDay(null), updatedPlan: { id: PLAN_ID } });

    const response = await call({ user: null, supabase: supabase.client });

    expect(response.status).toBe(401);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("answers 500 unconfigured without a client", async () => {
    const response = await call({ user: USER, supabase: undefined });
    const body = (await response.json()) as { error: string; retryable: boolean };

    expect(response.status).toBe(500);
    expect(body.retryable).toBe(false);
  });

  it.each([
    { name: "a body that is not JSON", body: "{nie-json" },
    { name: "a plan_id that is not a uuid", body: { ...VALID, plan_id: "abc" } },
    { name: "a missing `accepted`", body: { plan_id: PLAN_ID, expected_generation: 1 } },
    { name: "a generation below 1", body: { ...VALID, expected_generation: 0 } },
  ])("answers 400 on $name and never reaches the database", async ({ body }) => {
    const supabase = supabaseStub({ ...savedDay(null), updatedPlan: { id: PLAN_ID } });

    const response = await call({ user: USER, supabase: supabase.client }, body);

    expect(response.status).toBe(400);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

// Checked by mutation: `setAcceptance` answering `conflict` where it now answers
// `not_found` turns the 404 case red (409); a store that writes a timestamp
// regardless of `accepted` turns the `accepted: false` case red.
describe("POST /api/day-plan/accept — what an update that matched nothing means", () => {
  it("answers 200 with the plan read back, having written a server timestamp for accepted: true", async () => {
    const acceptedAt = "2026-09-14T09:00:00.000Z";
    const supabase = supabaseStub({ ...savedDay(acceptedAt), updatedPlan: { id: PLAN_ID } });

    const response = await call({ user: USER, supabase: supabase.client });
    const body = (await response.json()) as { plan: { accepted_at: string | null }; activities: unknown[] };

    expect(response.status).toBe(200);
    // What the island renders is the database's value, not the one sent.
    expect(body.plan.accepted_at).toBe(acceptedAt);
    expect(body.activities).toHaveLength(3);
    expect(supabase.dayPlansUpdate).toHaveBeenCalledTimes(1);
    const written = supabase.dayPlansUpdate.mock.calls[0][0] as { accepted_at: string | null };
    expect(written.accepted_at).not.toBeNull();
    expect(Number.isNaN(Date.parse(written.accepted_at ?? ""))).toBe(false);
  });

  it("writes null for accepted: false", async () => {
    const supabase = supabaseStub({ ...savedDay(null), updatedPlan: { id: PLAN_ID } });

    const response = await call({ user: USER, supabase: supabase.client }, { ...VALID, accepted: false });

    expect(response.status).toBe(200);
    expect(supabase.dayPlansUpdate).toHaveBeenCalledWith({ accepted_at: null });
  });

  it("answers 409 when the plan is visible but has moved to another generation", async () => {
    const supabase = supabaseStub({
      ...savedDay(null),
      updatedPlan: null,
      existingPlan: planRow({ current_generation: 2 }),
    });

    const response = await call({ user: USER, supabase: supabase.client });
    const body = (await response.json()) as { error: string; retryable: boolean };

    expect(response.status).toBe(409);
    expect(body.retryable).toBe(false);
  });

  it("answers 404, not retryable, when the plan is not visible - with one update and no second", async () => {
    const supabase = supabaseStub({ ...savedDay(null), updatedPlan: null, existingPlan: null });

    const response = await call({ user: USER, supabase: supabase.client });
    const body = (await response.json()) as { error: string; retryable: boolean };

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: "Nie znaleziono tego planu dnia.", retryable: false });
    expect(supabase.dayPlansUpdate).toHaveBeenCalledTimes(1);
  });
});
