import { afterEach, describe, expect, it } from "vitest";

import { todayIsoDate } from "@/lib/day-plan-dates";
import { deleteAccount, newTeacher, uniqueStamp } from "@/lib/services/__fixtures__/supabase-local";

// The sign-up path pgTAP cannot walk: there, the suite runs as `postgres`, which
// bypasses rls and is not a member of `supabase_auth_admin`. Here the account
// is created by gotrue itself, so the trigger runs as the role it runs as in
// production - a missing grant or policy for that role fails `createUser` and
// turns this file red. The row is then read through the new teacher's own
// client, so rls decides what she sees.

/** The same day of the next month, clamped to its last day: 31.01 -> 28/29.02. */
function plusOneMonth(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const target = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}

/** Accounts created before payments start get access until this day (S-30). */
const BEFORE_PAYMENTS_UNTIL = "2027-01-31";

/** The later of two ISO dates - string order is date order. */
function laterOf(a: string, b: string): string {
  return a > b ? a : b;
}

const created: string[] = [];

afterEach(async () => {
  while (created.length > 0) {
    const userId = created.pop();
    if (userId) await deleteAccount(userId);
  }
});

describe("account entitlement at sign-up", () => {
  it("gives an account created through gotrue access until the later of a month and 31.01.2027, readable by its owner", async () => {
    const teacher = await newTeacher(`api-trial-${uniqueStamp()}@example.test`);
    created.push(teacher.userId);

    const { data, error } = await teacher.client
      .from("account_entitlements")
      .select("user_id, plan, access_until, source");

    expect(error).toBeNull();
    expect(data).toEqual([
      {
        user_id: teacher.userId,
        plan: "basic",
        access_until: laterOf(plusOneMonth(todayIsoDate()), BEFORE_PAYMENTS_UNTIL),
        source: "trial",
      },
    ]);
  });
});
