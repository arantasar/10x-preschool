import type { APIContext } from "astro";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { activityRow, planRow, supabaseStub } from "@/lib/services/__fixtures__/supabase";
import { ACTIVITY_COUNT, DESCRIPTION_MAX, PROMPT_MAX, TITLE_MAX, WEEK_DAYS } from "@/lib/day-plan-limits";

// The write route touches no model, so there is no `fetch` to stub — the only
// substitution is `context.locals`. `day-plan-store` executes for real against
// the PostgREST stub, which means `saveWeekGeneration`'s retry asymmetry is
// exercised rather than described.
//
// What this file is really holding: these batches arrive from a *client*. Every
// bound the single-day path enforces has to be enforced here too, and has to be
// enforced *before* the store is reached — a 400 that arrives after the write
// would be a bound in name only.

const { POST } = await import("./save");

const USER = { id: "22222222-2222-4222-8222-222222222222" };
const DATES = ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"];

function batch(count = ACTIVITY_COUNT) {
  return Array.from({ length: count }, (_, index) => ({
    title: `Aktywność ${String(index + 1)}`,
    description: `Opis aktywności ${String(index + 1)}`,
  }));
}

function day(planDate: string, overrides: Record<string, unknown> = {}) {
  return { plan_date: planDate, theme: `Temat ${planDate}`, activities: batch(), ...overrides };
}

function body(overrides: Record<string, unknown> = {}) {
  return { prompt: "jesień w lesie", days: [day(DATES[0]), day(DATES[1])], ...overrides };
}

function request(payload: unknown = body()) {
  return new Request("https://example.test/api/day-plan/week/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function call(context: { request: Request; locals: unknown }): Promise<Response> {
  return POST(context as unknown as APIContext);
}

/** A stub whose read-back returns the two days the default body writes. */
function writtenWeek() {
  const first = planRow({ plan_date: DATES[0], current_generation: 2 });
  const second = planRow({ id: "11111111-1111-4111-8111-111111111112", plan_date: DATES[1], current_generation: 1 });
  return supabaseStub({
    weekPlans: [first, second],
    weekActivities: [
      ...[1, 2, 3].map((ordinal) => activityRow(ordinal, first)),
      ...[1, 2, 3].map((ordinal) => activityRow(ordinal, second)),
    ],
  });
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/day-plan/week/save — the write", () => {
  it("calls the week writer exactly once, with confirm_replace false", async () => {
    const supabase = writtenWeek();

    const response = await call({ request: request(), locals: { user: USER, supabase: supabase.client } });

    expect(response.status).toBe(200);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    const [fn, args] = supabase.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(fn).toBe("save_week_plan_generation");
    // Never true in this slice: accepted days are S-10's.
    expect(args.p_confirm_replace).toBe(false);
    expect(args.p_days).toHaveLength(2);
  });

  it("answers with the days read back from the database, not the request", async () => {
    const supabase = writtenWeek();

    const response = await call({ request: request(), locals: { user: USER, supabase: supabase.client } });
    const parsed = (await response.json()) as { plans: Record<string, { plan: { current_generation: number } }> };

    expect(Object.keys(parsed.plans).sort()).toEqual([DATES[0], DATES[1]]);
    // The read-back's counter, which the request never carried.
    expect(parsed.plans[DATES[0]].plan.current_generation).toBe(2);
  });
});

describe("POST /api/day-plan/week/save — client-supplied batches are validated as such", () => {
  const rejected: { name: string; payload: unknown }[] = [
    {
      name: "an activities array longer than ACTIVITY_COUNT",
      payload: body({ days: [day(DATES[0], { activities: batch(ACTIVITY_COUNT + 1) })] }),
    },
    {
      name: "an activities array shorter than ACTIVITY_COUNT",
      payload: body({ days: [day(DATES[0], { activities: batch(ACTIVITY_COUNT - 1) })] }),
    },
    { name: "an empty activities array", payload: body({ days: [day(DATES[0], { activities: [] })] }) },
    {
      name: "a title over TITLE_MAX",
      payload: body({
        days: [day(DATES[0], { activities: [{ title: "a".repeat(TITLE_MAX + 1), description: "ok" }, ...batch(2)] })],
      }),
    },
    {
      name: "a description over DESCRIPTION_MAX",
      payload: body({
        days: [
          day(DATES[0], { activities: [{ title: "ok", description: "a".repeat(DESCRIPTION_MAX + 1) }, ...batch(2)] }),
        ],
      }),
    },
    {
      name: "an empty title",
      payload: body({ days: [day(DATES[0], { activities: [{ title: "", description: "ok" }, ...batch(2)] })] }),
    },
    { name: "no days at all", payload: body({ days: [] }) },
    {
      name: `more than ${String(WEEK_DAYS)} days`,
      payload: body({ days: [...DATES, "2026-09-19"].map((d) => day(d)) }),
    },
    { name: "the same plan_date twice", payload: body({ days: [day(DATES[0]), day(DATES[0])] }) },
    { name: "a plan_date that is not a date", payload: body({ days: [day("wtorek")] }) },
    { name: "a blank hasło", payload: body({ prompt: "   " }) },
    { name: "a hasło over PROMPT_MAX", payload: body({ prompt: "a".repeat(PROMPT_MAX + 1) }) },
  ];

  it.each(rejected)("answers 400 on $name and never reaches the store", async ({ payload }) => {
    const supabase = writtenWeek();

    const response = await call({ request: request(payload), locals: { user: USER, supabase: supabase.client } });

    expect(response.status).toBe(400);
    // The half of the claim that matters: refused *before* any write.
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});

describe("POST /api/day-plan/week/save — refusals and failures", () => {
  it("answers 401 without a session and never reaches the store", async () => {
    const supabase = writtenWeek();

    const response = await call({ request: request(), locals: { user: null, supabase: supabase.client } });

    expect(response.status).toBe(401);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("answers 400 on a body that is not JSON", async () => {
    const supabase = writtenWeek();
    const bad = new Request("https://example.test/api/day-plan/week/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ nie-json",
    });

    const response = await call({ request: bad, locals: { user: USER, supabase: supabase.client } });

    expect(response.status).toBe(400);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("answers the unconfigured 500 when Supabase is missing", async () => {
    const response = await call({ request: request(), locals: { user: USER, supabase: null } });
    const parsed = (await response.json()) as { retryable: boolean };

    expect(response.status).toBe(500);
    expect(parsed.retryable).toBe(false);
  });

  // U0001: an accepted day in the set, unconfirmed. The teacher resolves this,
  // not a retry — which is why `saveWeekGeneration` must not re-issue it.
  it("surfaces a store conflict as 409 and does not retry it", async () => {
    const supabase = supabaseStub({
      rpcError: {
        code: "U0001",
        message: "plan for 2026-09-15 is accepted; regeneration must be confirmed",
        details: "",
        hint: "",
      },
    });

    const response = await call({ request: request(), locals: { user: USER, supabase: supabase.client } });
    const parsed = (await response.json()) as { error: string; retryable: boolean };

    expect(response.status).toBe(409);
    expect(parsed.retryable).toBe(false);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    // The refused day reaches the teacher, not just the log. Across five days
    // the category default ("Ten plan zmienił się w innym miejscu") names
    // nothing to go and look at, which is the whole reason the function
    // interpolates the date into its exception.
    expect(parsed.error).toContain("15 września 2026");
  });

  // The date is lifted out of the function's prose with a regex, so the two can
  // drift apart. When they do, the teacher must get the vague sentence rather
  // than a wrong date.
  it("falls back to the category default when the refusal does not name a date", async () => {
    const supabase = supabaseStub({
      rpcError: { code: "U0001", message: "plan is accepted; regeneration must be confirmed", details: "", hint: "" },
    });

    const response = await call({ request: request(), locals: { user: USER, supabase: supabase.client } });
    const parsed = (await response.json()) as { error: string; retryable: boolean };

    expect(response.status).toBe(409);
    expect(parsed.error).toBe("Ten plan zmienił się w innym miejscu. Odśwież stronę i spróbuj ponownie.");
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
  });

  // U0003 is `invalid`, and `invalid` *is* retried once — the asymmetry
  // `saveWeekGeneration` documents: only `conflict` is exempt.
  it("answers 500 on an empty-batch refusal, after one retry", async () => {
    const supabase = supabaseStub({
      rpcError: { code: "U0003", message: "activity batch for 2026-09-14 is empty", details: "", hint: "" },
    });

    const response = await call({ request: request(), locals: { user: USER, supabase: supabase.client } });

    expect(response.status).toBe(500);
    expect(supabase.rpc).toHaveBeenCalledTimes(2);
  });
});
