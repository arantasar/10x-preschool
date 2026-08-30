import type { APIContext } from "astro";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { errorStatusResponse, proposalResponse, unparsableBodyResponse } from "@/lib/services/__fixtures__/openrouter";
import { activityRow, planRow, supabaseStub } from "@/lib/services/__fixtures__/supabase";
import { ACTIVITY_COUNT, DESCRIPTION_MAX } from "@/lib/day-plan-limits";

// The route's `POST` is an exported function, so it runs without an HTTP server.
// The only substitutions are the network boundary (`globalThis.fetch`) and
// `context.locals` — no module from `src/lib/` is mocked, which is what keeps
// zod, `callOpenRouter`, `runWithBudget` and `day-plan-store` executing for real.

const env = vi.hoisted((): { apiKey: string | undefined; model: string | undefined } => ({
  apiKey: "test-key",
  model: undefined,
}));

vi.mock("astro:env/server", () => ({
  get OPENROUTER_API_KEY() {
    return env.apiKey;
  },
  get OPENROUTER_MODEL() {
    return env.model;
  },
}));

const { POST } = await import("./generate");

const PLAN_DATE = "2026-09-14";
const USER = { id: "22222222-2222-4222-8222-222222222222" };

function validProposal() {
  return {
    aktywnosci: Array.from({ length: ACTIVITY_COUNT }, (_, index) => ({
      tytul: `Aktywność ${String(index + 1)}`,
      opis: `Opis aktywności ${String(index + 1)}`,
    })),
  };
}

function stubFetch(...outcomes: (() => unknown)[]) {
  let index = 0;
  const stub = vi.fn(() => {
    const outcome = outcomes[Math.min(index++, outcomes.length - 1)]();
    return outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome as Response);
  });
  vi.stubGlobal("fetch", stub);
  return stub;
}

function request(body: Record<string, unknown> = { plan_date: PLAN_DATE, prompt: "jesień w lesie" }) {
  return new Request("https://example.test/api/day-plan/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Runs the route with fake timers draining, so a retry's backoff costs no wall-clock time. */
async function call(context: { request: Request; locals: unknown }): Promise<Response> {
  const settled = POST(context as unknown as APIContext);
  await vi.runAllTimersAsync();
  return await settled;
}

beforeEach(() => {
  env.apiKey = "test-key";
  vi.useFakeTimers();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("POST /api/day-plan/generate — the model's answer never reaches the write unvalidated", () => {
  const offContract: { name: string; payload: unknown }[] = [
    { name: "two activities instead of three", payload: { aktywnosci: validProposal().aktywnosci.slice(0, 2) } },
    { name: "zero activities", payload: { aktywnosci: [] } },
    { name: "no `aktywnosci` field at all", payload: { propozycje: validProposal().aktywnosci } },
    {
      name: "a description over DESCRIPTION_MAX",
      payload: (() => {
        const proposal = validProposal();
        proposal.aktywnosci[0].opis = "a".repeat(DESCRIPTION_MAX + 1);
        return proposal;
      })(),
    },
  ];

  it.each(offContract)("refuses $name with 502 and never calls rpc", async ({ payload }) => {
    const supabase = supabaseStub();
    stubFetch(() => proposalResponse(payload));

    const response = await call({ request: request(), locals: { user: USER, supabase: supabase.client } });

    expect(response.status).toBe(502);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("refuses an unrecognizable provider body with 502 and never calls rpc", async () => {
    const supabase = supabaseStub();
    const fetchStub = stubFetch(unparsableBodyResponse);

    const response = await call({ request: request(), locals: { user: USER, supabase: supabase.client } });
    const body = (await response.json()) as { error: string; retryable: boolean };

    expect(response.status).toBe(502);
    // The phase-2 split, seen from the teacher's side: not "przeciążona", and not
    // a second paid attempt.
    expect(body.error).toContain("Coś poszło nie tak");
    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("answers 503 on a transient provider failure and never calls rpc", async () => {
    const supabase = supabaseStub();
    const fetchStub = stubFetch(() => errorStatusResponse(500));

    const response = await call({ request: request(), locals: { user: USER, supabase: supabase.client } });
    const body = (await response.json()) as { error: string; retryable: boolean };

    expect(response.status).toBe(503);
    expect(body.retryable).toBe(true);
    expect(fetchStub).toHaveBeenCalledTimes(2);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  // Without this case the whole block above would pass against a route that never
  // writes anything at all — the same reasoning `rls_isolation.test.sql:152-156`
  // states for its positive block.
  it("writes exactly once, with exactly three activities, when the answer is on contract", async () => {
    const saved = planRow();
    const supabase = supabaseStub({
      savedPlan: saved,
      savedActivities: [1, 2, 3].map((ordinal) => activityRow(ordinal, saved)),
    });
    stubFetch(() => proposalResponse(validProposal()));

    const response = await call({ request: request(), locals: { user: USER, supabase: supabase.client } });
    const body = (await response.json()) as { activities: unknown[] };

    expect(response.status).toBe(200);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    const args = supabase.rpc.mock.calls[0][1] as { p_activities: unknown[] };
    expect(args.p_activities).toHaveLength(ACTIVITY_COUNT);
    expect(args.p_activities[0]).toEqual({ title: "Aktywność 1", description: "Opis aktywności 1" });
    expect(body.activities).toHaveLength(ACTIVITY_COUNT);
  });

  it("answers 401 without a session and never reaches the provider", async () => {
    const supabase = supabaseStub();
    const fetchStub = stubFetch(() => proposalResponse(validProposal()));

    const response = await call({ request: request(), locals: { user: null, supabase: supabase.client } });

    expect(response.status).toBe(401);
    expect(fetchStub).not.toHaveBeenCalled();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
