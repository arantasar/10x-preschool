import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { accessCard, readAccountEntitlement } from "./account-entitlement";
import type { DayPlanClient } from "./services/day-plan-store";
import type { AccountEntitlement } from "@/types";

// The card must never say more than is true today, and the settings page must
// never break on the read. So: the date boundary (inclusive, like every date
// here), no row meaning no card, and every failure of the read becoming "no
// row" *and* a log line - a silent fallback would hide a missing migration.

const TRIAL: AccountEntitlement = { plan: "basic", accessUntil: "2026-11-17", source: "trial" };

describe("accessCard", () => {
  it("shows nothing for an account without a row", () => {
    expect(accessCard(null, "2026-10-18")).toBeNull();
  });

  it("shows the date while access lasts", () => {
    expect(accessCard(TRIAL, "2026-10-18")).toEqual({ untilLabel: "17 listopada 2026" });
  });

  it("still shows the card on the last day - the date is inclusive", () => {
    expect(accessCard(TRIAL, "2026-11-17")).toEqual({ untilLabel: "17 listopada 2026" });
  });

  it("shows nothing the day after", () => {
    expect(accessCard(TRIAL, "2026-11-18")).toBeNull();
  });

  it("names the month in the Polish genitive", () => {
    expect(accessCard({ ...TRIAL, accessUntil: "2027-01-31", source: "owner" }, "2026-10-18")).toEqual({
      untilLabel: "31 stycznia 2027",
    });
  });
});

interface ReadAnswer {
  data: unknown;
  error: unknown;
}

function client(answer: ReadAnswer | (() => Promise<ReadAnswer>)) {
  const maybeSingle = vi.fn(typeof answer === "function" ? answer : () => Promise.resolve(answer));
  const select = vi.fn(() => ({ maybeSingle }));
  const from = vi.fn(() => ({ select }));
  return { supabase: { from } as unknown as DayPlanClient, from, select };
}

let log: MockInstance<(...args: unknown[]) => void>;

beforeEach(() => {
  log = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  log.mockRestore();
});

function logged(event: string): unknown[][] {
  return log.mock.calls.filter(([message]) => message === event);
}

describe("readAccountEntitlement", () => {
  it("reads the teacher's own row from account_entitlements", async () => {
    const { supabase, from } = client({
      data: { plan: "basic", access_until: "2026-11-17", source: "trial" },
      error: null,
    });

    await expect(readAccountEntitlement(supabase)).resolves.toEqual(TRIAL);
    expect(from).toHaveBeenCalledWith("account_entitlements");
    expect(log).not.toHaveBeenCalled();
  });

  it("returns null without a log when there is no row", async () => {
    const { supabase } = client({ data: null, error: null });

    await expect(readAccountEntitlement(supabase)).resolves.toBeNull();
    expect(log).not.toHaveBeenCalled();
  });

  it("returns null and logs on a PostgREST error", async () => {
    const { supabase } = client({ data: null, error: { code: "42P01", message: "relation does not exist" } });

    await expect(readAccountEntitlement(supabase)).resolves.toBeNull();
    expect(logged("account_entitlement.read_failed")).toEqual([["account_entitlement.read_failed", { code: "42P01" }]]);
  });

  it("returns null and logs on a thrown exception", async () => {
    const { supabase } = client(() => Promise.reject(new Error("network down")));

    await expect(readAccountEntitlement(supabase)).resolves.toBeNull();
    expect(logged("account_entitlement.read_failed")).toEqual([
      ["account_entitlement.read_failed", { code: "exception" }],
    ]);
  });

  it.each([
    ["an unknown plan", { plan: "pro", access_until: "2026-11-17", source: "trial" }],
    ["an unknown source", { plan: "basic", access_until: "2026-11-17", source: "gift" }],
    ["a date that is not YYYY-MM-DD", { plan: "basic", access_until: "17.11.2026", source: "trial" }],
  ])("returns null and logs on %s", async (_, row) => {
    const { supabase } = client({ data: row, error: null });

    await expect(readAccountEntitlement(supabase)).resolves.toBeNull();
    expect(logged("account_entitlement.read_failed")).toEqual([
      ["account_entitlement.read_failed", { code: "unexpected_shape" }],
    ]);
  });
});
