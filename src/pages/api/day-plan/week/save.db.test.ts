import type { APIContext } from "astro";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  activitiesFor,
  cleanup,
  plusDays,
  seedDay,
  teacherClient,
  uniqueStamp,
  type Teacher,
} from "@/lib/services/__fixtures__/supabase-local";

import { POST } from "./save";

// Route + real client (test plan §6.3), risks #3 and #4 together. Teacher a
// has an accepted day; teacher b writes a week over that date with no consent.
// b has nothing accepted there, so there is nothing to consent to: the write
// succeeds for b, and a's accepted day - read back as a - keeps its hasło,
// counter, acceptance and batch. This route stands in for `generate` on the
// real client because it calls no model (`generate`'s test stubs
// `globalThis.fetch`, the same boundary `supabase-js` talks through).
//
// Checked by mutation (local `psql`, restored after): the week writer made
// `security definer` with the `for update` read's `user_id = auth.uid()`
// dropped answers b with 409 on a's acceptance, and this case goes red.

let a: Teacher;
let b: Teacher;
let created: string[] = [];

beforeAll(async () => {
  a = await teacherClient("a");
  b = await teacherClient("b");
});

// The planning horizon (S-31) refuses `uniquePlanDate()`'s far-future days, so
// the clock is pinned and the day is drawn from inside that window instead:
// from 2026-09-15 the window is 2026-07-27 … 2026-11-01. Only `Date` is faked,
// and only after sign-in - a clock in the past leaves the session valid, where
// one in 2100 would make supabase-js treat it as expired.
const NOW = new Date("2026-09-15T10:00:00+02:00");
const WINDOW_FIRST = "2026-07-27";
const WINDOW_DAYS = 98;

/** A day inside the pinned window; random so a leftover row from an aborted run is unlikely to collide. */
function planDateInWindow(): string {
  return plusDays(WINDOW_FIRST, Math.floor(Math.random() * WINDOW_DAYS));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

afterEach(async () => {
  vi.useRealTimers();
  await cleanup(created);
  created = [];
});

async function saveWeek(teacher: Teacher, body: unknown): Promise<Response> {
  return await POST({
    request: new Request("https://example.test/api/day-plan/week/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    locals: { user: { id: teacher.userId }, supabase: teacher.client },
  } as unknown as APIContext);
}

async function dayAsOwner(teacher: Teacher, date: string) {
  const { data: plan, error } = await teacher.client
    .from("day_plans")
    .select("id, prompt, current_generation, accepted_at")
    .eq("plan_date", date)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!plan) return null;
  const { data: activities, error: activitiesError } = await teacher.client
    .from("activities")
    .select("title")
    .eq("plan_id", plan.id)
    .order("ordinal");
  if (activitiesError) throw new Error(activitiesError.message);
  return { ...plan, titles: activities.map((activity) => activity.title) };
}

describe("POST /api/day-plan/week/save — a second teacher's week over an accepted day", () => {
  it("writes teacher b's day and leaves teacher a's accepted day exactly as it was", async () => {
    const date = planDateInWindow();
    const stampA = uniqueStamp();
    const stampB = uniqueStamp();
    const seeded = await seedDay(a.userId, date, {
      prompt: `a ${stampA}`,
      activities: activitiesFor(stampA),
      accepted: true,
    });
    created.push(seeded.planId);
    const before = await dayAsOwner(a, date);

    const response = await saveWeek(b, {
      prompt: `b ${stampB}`,
      days: [{ plan_date: date, activities: activitiesFor(stampB) }],
    });

    const mine = await dayAsOwner(b, date);
    if (mine) created.push(mine.id);

    expect(response.status).toBe(200);
    // The positive control: b's write really landed, as b's own row.
    expect(mine).toMatchObject({ prompt: `b ${stampB}`, current_generation: 1, accepted_at: null });
    expect(before).not.toBeNull();
    expect(before?.accepted_at).not.toBeNull();
    expect(await dayAsOwner(a, date)).toEqual(before);
  });
});
