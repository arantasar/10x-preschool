import type { APIContext } from "astro";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { proposalResponse, unparsableBodyResponse } from "@/lib/services/__fixtures__/openrouter";
import { STUB_LEDGER_ID, supabaseStub } from "@/lib/services/__fixtures__/supabase";

// The week outline route and the fair-use limit (S-21). An outline counts no
// day, but it is claimed in the ledger as `outline` - so a teacher over the
// limit is stopped here, at the first click of "Generuj tydzień", not after
// waiting for themes. Same substitutions as the other route tests: the network
// boundary and `context.locals`, nothing from `src/lib/` mocked.

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
  // `fair-use.ts` reads these; unset means its defaults.
  FAIR_USE_DAYS_PER_MONTH: undefined,
  FAIR_USE_REFINES_PER_MONTH: undefined,
  FAIR_USE_REFUNDS_PER_MONTH: undefined,
  FAIR_USE_MODE: undefined,
}));

const { POST } = await import("./outline");

const USER = { id: "22222222-2222-4222-8222-222222222222" };
const DATES = ["2026-09-14", "2026-09-15"];

function validOutline() {
  return {
    tematy: [
      { dzien: 1, temat: "Liście" },
      { dzien: 2, temat: "Grzyby" },
    ],
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

function request(body: unknown = { prompt: "jesień w lesie", dates: DATES }) {
  return new Request("https://example.test/api/day-plan/week/outline", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

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

describe("POST /api/day-plan/week/outline — fair use", () => {
  it("hands back the themes, claims an outline with no planned day, and marks it succeeded", async () => {
    const supabase = supabaseStub();
    stubFetch(() => proposalResponse(validOutline()));

    const response = await call({ request: request(), locals: { user: USER, supabase: supabase.client } });
    const body = (await response.json()) as { themes: { plan_date: string; theme: string }[] };

    expect(response.status).toBe(200);
    expect(body.themes.map((item) => item.plan_date)).toEqual(DATES);
    expect(supabase.claim).toHaveBeenCalledTimes(1);
    expect(supabase.claim.mock.calls[0][1]).toMatchObject({ p_kind: "outline" });
    expect(supabase.ledgerUpdate.mock.calls).toEqual([[{ status: "succeeded" }]]);
    expect(supabase.ledgerUpdateEq).toHaveBeenCalledWith("id", STUB_LEDGER_ID);
  });

  it("over the limit answers 429 with the reset day, before paying the model", async () => {
    const supabase = supabaseStub({ claim: { outcome: "refused", resetsOn: "2026-11-01" } });
    const fetchStub = stubFetch(() => proposalResponse(validOutline()));

    const response = await call({ request: request(), locals: { user: USER, supabase: supabase.client } });
    const body = (await response.json()) as { error: string; retryable: boolean; limit: { resets_on: string } };

    expect(response.status).toBe(429);
    expect(body.retryable).toBe(false);
    expect(body.limit).toEqual({ resets_on: "2026-11-01" });
    expect(body.error).toContain("od 1 listopada");
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("outlines anyway when the claim fails", async () => {
    const supabase = supabaseStub({
      claim: { outcome: "error", error: { code: "PGRST202", message: "not found", details: "", hint: "" } },
    });
    const fetchStub = stubFetch(() => proposalResponse(validOutline()));

    const response = await call({ request: request(), locals: { user: USER, supabase: supabase.client } });

    expect(response.status).toBe(200);
    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(supabase.ledgerUpdate).not.toHaveBeenCalled();
  });

  it("marks the reservation failed when the model fails", async () => {
    const supabase = supabaseStub();
    stubFetch(unparsableBodyResponse);

    const response = await call({ request: request(), locals: { user: USER, supabase: supabase.client } });

    expect(response.status).toBe(502);
    expect(supabase.ledgerUpdate.mock.calls).toEqual([[{ status: "failed" }]]);
  });

  it("claims nothing for a refused request", async () => {
    const supabase = supabaseStub();
    stubFetch(() => proposalResponse(validOutline()));

    const response = await call({
      request: request({ prompt: "jesień", dates: [] }),
      locals: { user: USER, supabase: supabase.client },
    });

    expect(response.status).toBe(400);
    expect(supabase.claim).not.toHaveBeenCalled();
  });
});
