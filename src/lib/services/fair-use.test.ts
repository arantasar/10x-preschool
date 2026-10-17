import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import type { DayPlanClient } from "./day-plan-store";

// The fair-use service's one promise is Guardrail 1: no failure of the ledger or
// of its configuration ever stops a teacher from generating. Every failure path
// is therefore a test here, and each asserts both halves - the claim is allowed
// *and* the failure is logged, because a fail-open nobody can see is a limit
// that silently stopped existing.

const env = vi.hoisted((): { days?: string; refines?: string; refunds?: string; mode?: string } => ({}));

vi.mock("astro:env/server", () => ({
  // Getters: `fair-use.ts` reads configuration on every call.
  get FAIR_USE_DAYS_PER_MONTH() {
    return env.days;
  },
  get FAIR_USE_REFINES_PER_MONTH() {
    return env.refines;
  },
  get FAIR_USE_REFUNDS_PER_MONTH() {
    return env.refunds;
  },
  get FAIR_USE_MODE() {
    return env.mode;
  },
}));

const { claimGeneration, finishGeneration, readFairUseConfig, FAIR_USE_DEFAULTS } = await import("./fair-use");

const LEDGER_ID = "44444444-4444-4444-8444-444444444444";

interface RpcAnswer {
  data: unknown;
  error: unknown;
}

function client(answer: RpcAnswer | (() => Promise<RpcAnswer>), updateError: unknown = null) {
  const rpc = vi.fn(typeof answer === "function" ? answer : () => Promise.resolve(answer));
  const eq = vi.fn(() => Promise.resolve({ data: null, error: updateError }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  return { supabase: { rpc, from } as unknown as DayPlanClient, rpc, from, update, eq };
}

function allowedRow(ledgerId: string | null = LEDGER_ID) {
  return { data: [{ ledger_id: ledgerId, allowed: true, resets_on: "2026-11-01" }], error: null };
}

function refusedRow(ledgerId: string | null = null) {
  return { data: [{ ledger_id: ledgerId, allowed: false, resets_on: "2026-11-01" }], error: null };
}

let log: MockInstance<(...args: unknown[]) => void>;

beforeEach(() => {
  env.days = undefined;
  env.refines = undefined;
  env.refunds = undefined;
  env.mode = undefined;
  log = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  log.mockRestore();
});

function logged(event: string): unknown[][] {
  return log.mock.calls.filter(([message]) => message === event);
}

describe("claimGeneration", () => {
  it("passes the configured limits and the planned day to claim_generation", async () => {
    env.days = "40";
    env.refines = "80";
    env.refunds = "5";
    const { supabase, rpc } = client(allowedRow());

    await claimGeneration(supabase, "day", "2026-11-02");

    expect(rpc).toHaveBeenCalledWith("claim_generation", {
      p_kind: "day",
      p_plan_date: "2026-11-02",
      p_day_limit: 40,
      p_refine_limit: 80,
      p_refund_allowance: 5,
      p_enforce: true,
    });
  });

  it("sends a null planned day for an outline", async () => {
    const { supabase, rpc } = client(allowedRow());

    await claimGeneration(supabase, "outline");

    expect(rpc).toHaveBeenCalledWith("claim_generation", expect.objectContaining({ p_plan_date: null }));
  });

  it("an allowed claim carries the reservation's id", async () => {
    const { supabase } = client(allowedRow());

    expect(await claimGeneration(supabase, "day", "2026-11-02")).toEqual({ allowed: true, ledgerId: LEDGER_ID });
    expect(log).not.toHaveBeenCalled();
  });

  it("a refusal carries the reset day and is logged for calibration", async () => {
    const { supabase } = client(refusedRow());

    expect(await claimGeneration(supabase, "refine")).toEqual({ allowed: false, resetsOn: "2026-11-01" });
    expect(logged("fair_use.limit_reached")).toEqual([
      ["fair_use.limit_reached", { kind: "refine", resets_on: "2026-11-01" }],
    ]);
  });

  it("fails open on an rpc error, and logs it", async () => {
    const { supabase } = client({ data: null, error: { code: "PGRST202", message: "function not found" } });

    expect(await claimGeneration(supabase, "day", "2026-11-02")).toEqual({ allowed: true, ledgerId: null });
    expect(logged("fair_use.claim_failed")).toEqual([["fair_use.claim_failed", { kind: "day", code: "PGRST202" }]]);
  });

  it("fails open when the client throws, and logs it", async () => {
    const { supabase } = client(() => Promise.reject(new Error("network down")));

    expect(await claimGeneration(supabase, "outline")).toEqual({ allowed: true, ledgerId: null });
    expect(logged("fair_use.claim_failed")).toEqual([
      ["fair_use.claim_failed", { kind: "outline", code: "exception" }],
    ]);
  });

  it("fails open on an empty answer, and logs it", async () => {
    const { supabase } = client({ data: [], error: null });

    expect(await claimGeneration(supabase, "day")).toEqual({ allowed: true, ledgerId: null });
    expect(logged("fair_use.claim_failed")).toHaveLength(1);
  });

  it("fails open on a refusal without a reset day, rather than answering a sentence with no date", async () => {
    const { supabase } = client({ data: [{ ledger_id: null, allowed: false, resets_on: null }], error: null });

    expect(await claimGeneration(supabase, "day")).toEqual({ allowed: true, ledgerId: null });
    expect(logged("fair_use.claim_failed")).toHaveLength(1);
  });

  it("observe mode never refuses: it asks for no enforcement and keeps the reservation", async () => {
    env.mode = "observe";
    const { supabase, rpc } = client(refusedRow(LEDGER_ID));

    expect(await claimGeneration(supabase, "day", "2026-11-02")).toEqual({ allowed: true, ledgerId: LEDGER_ID });
    expect(rpc).toHaveBeenCalledWith("claim_generation", expect.objectContaining({ p_enforce: false }));
    expect(logged("fair_use.would_limit")).toHaveLength(1);
    expect(logged("fair_use.limit_reached")).toHaveLength(0);
  });
});

describe("readFairUseConfig", () => {
  it("uses the defaults when nothing is set, without logging", () => {
    expect(readFairUseConfig()).toEqual(FAIR_USE_DEFAULTS);
    expect(FAIR_USE_DEFAULTS).toEqual({
      daysPerMonth: 150,
      refinesPerMonth: 300,
      refundsPerMonth: 30,
      mode: "enforce",
    });
    expect(log).not.toHaveBeenCalled();
  });

  it("treats an empty value as unset", () => {
    env.days = "  ";
    env.mode = "";

    expect(readFairUseConfig()).toEqual(FAIR_USE_DEFAULTS);
    expect(log).not.toHaveBeenCalled();
  });

  it.each([
    ["not a number", "sto"],
    ["a fraction", "1.5"],
    ["zero", "0"],
    ["negative", "-3"],
    ["over postgres int", "3000000000"],
  ])("falls back to the default and logs the variable for %s", (_name, value) => {
    env.days = value;

    expect(readFairUseConfig().daysPerMonth).toBe(150);
    expect(logged("fair_use.config_invalid")).toEqual([
      ["fair_use.config_invalid", { variable: "FAIR_USE_DAYS_PER_MONTH" }],
    ]);
  });

  it("an unknown mode falls back to enforce and is logged", () => {
    env.mode = "off";

    expect(readFairUseConfig().mode).toBe("enforce");
    expect(logged("fair_use.config_invalid")).toEqual([["fair_use.config_invalid", { variable: "FAIR_USE_MODE" }]]);
  });

  it("a bad value never stops a claim", async () => {
    env.refines = "dużo";
    const { supabase, rpc } = client(allowedRow());

    expect(await claimGeneration(supabase, "refine")).toEqual({ allowed: true, ledgerId: LEDGER_ID });
    expect(rpc).toHaveBeenCalledWith("claim_generation", expect.objectContaining({ p_refine_limit: 300 }));
  });
});

describe("finishGeneration", () => {
  it("marks the reservation with the outcome", async () => {
    const { supabase, from, update, eq } = client(allowedRow());

    await finishGeneration(supabase, LEDGER_ID, "failed");

    expect(from).toHaveBeenCalledWith("generation_ledger");
    expect(update).toHaveBeenCalledWith({ status: "failed" });
    expect(eq).toHaveBeenCalledWith("id", LEDGER_ID);
  });

  it("does nothing for a fail-open claim", async () => {
    const { supabase, from, rpc } = client(allowedRow());

    await finishGeneration(supabase, null, "succeeded");

    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("logs an update error and does not throw", async () => {
    const { supabase } = client(allowedRow(), { code: "U0004", message: "transition" });

    await expect(finishGeneration(supabase, LEDGER_ID, "succeeded")).resolves.toBeUndefined();
    expect(logged("fair_use.finish_failed")).toEqual([
      ["fair_use.finish_failed", { outcome: "succeeded", code: "U0004" }],
    ]);
  });

  it("logs a thrown error and does not throw", async () => {
    const { supabase, from } = client(allowedRow());
    from.mockImplementation(() => {
      throw new Error("boom");
    });

    await expect(finishGeneration(supabase, LEDGER_ID, "failed")).resolves.toBeUndefined();
    expect(logged("fair_use.finish_failed")).toHaveLength(1);
  });
});
