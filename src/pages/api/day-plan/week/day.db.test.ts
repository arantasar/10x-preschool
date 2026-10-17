import type { APIContext } from "astro";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { proposalResponse } from "@/lib/services/__fixtures__/openrouter";
import { deleteLedgerRows, seedLedger, teacherClient, type Teacher } from "@/lib/services/__fixtures__/supabase-local";
import { ACTIVITY_COUNT } from "@/lib/day-plan-limits";

// Route + real client (test plan §6.3) for the fair-use limit (S-21). The risk
// lives in the database, so this is where it is checked: the week board fires
// five `week/day` calls at once, and a check-then-write in the route would let
// all five through at 148/150. `claim_generation` serialises one account's
// claims under an advisory lock - five parallel calls must admit exactly two,
// leave exactly 150 rows, and never make another account wait its turn.
//
// Only the model is substituted - the test is about the ledger, not OpenRouter.
// supabase-js uses the same global `fetch`, so every other URL goes through to
// the real one.

vi.mock("astro:env/server", () => ({
  OPENROUTER_API_KEY: "test-key",
  OPENROUTER_MODEL: undefined,
  // Defaults: 150 days, 300 refines, 30 refunds, enforce.
  FAIR_USE_DAYS_PER_MONTH: undefined,
  FAIR_USE_REFINES_PER_MONTH: undefined,
  FAIR_USE_REFUNDS_PER_MONTH: undefined,
  FAIR_USE_MODE: undefined,
}));

const { POST } = await import("./day");

const DAY_LIMIT = 150;
const DATES = ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"];

function validProposal() {
  return {
    aktywnosci: Array.from({ length: ACTIVITY_COUNT }, (_, index) => ({
      tytul: `Aktywność ${String(index + 1)}`,
      opis: `Opis aktywności ${String(index + 1)}`,
    })),
  };
}

let a: Teacher;
let b: Teacher;

beforeAll(async () => {
  a = await teacherClient("a");
  b = await teacherClient("b");
});

beforeEach(async () => {
  await deleteLedgerRows(a.userId);
  await deleteLedgerRows(b.userId);

  const realFetch = globalThis.fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      return url.includes("openrouter.ai")
        ? Promise.resolve(proposalResponse(validProposal()))
        : realFetch(input, init);
    }),
  );
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await deleteLedgerRows(a.userId);
  await deleteLedgerRows(b.userId);
});

async function generateDay(teacher: Teacher, planDate: string): Promise<Response> {
  return await POST({
    request: new Request("https://example.test/api/day-plan/week/day", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan_date: planDate, prompt: "jesień w lesie" }),
    }),
    locals: { user: { id: teacher.userId }, supabase: teacher.client },
  } as unknown as APIContext);
}

/** This month's `day` rows, read through the teacher's own client - RLS decides. */
async function dayRows(teacher: Teacher): Promise<{ status: string }[]> {
  const { data, error } = await teacher.client.from("generation_ledger").select("status").eq("kind", "day");
  if (error) {
    throw new Error(`Nie udało się odczytać księgi: ${error.message}`);
  }
  return data;
}

describe("POST /api/day-plan/week/day — fair use against the real ledger", () => {
  it("five parallel days at 148/150 admit exactly two, and another account is not held up", async () => {
    await seedLedger(a.userId, DAY_LIMIT - 2, "day");

    const [aResponses, bResponse] = await Promise.all([
      Promise.all(DATES.map((date) => generateDay(a, date))),
      generateDay(b, DATES[0]),
    ]);

    const statuses = aResponses.map((response) => response.status).sort();
    expect(statuses).toEqual([200, 200, 429, 429, 429]);

    const refused = aResponses.find((response) => response.status === 429);
    const body = (await refused?.json()) as { retryable: boolean; limit: { resets_on: string } };
    expect(body.retryable).toBe(false);
    expect(body.limit.resets_on).toMatch(/^\d{4}-\d{2}-01$/);

    const rows = await dayRows(a);
    expect(rows).toHaveLength(DAY_LIMIT);
    // The two admitted reservations were finished after the model answered.
    expect(rows.filter((row) => row.status === "reserved")).toHaveLength(0);

    expect(bResponse.status).toBe(200);
    expect(await dayRows(b)).toEqual([{ status: "succeeded" }]);
  });
});
