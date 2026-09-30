import type { APIContext } from "astro";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  activitiesFor,
  cleanup,
  plusDays,
  seedDay,
  teacherClient,
  uniquePlanDate,
  uniqueStamp,
  type Teacher,
} from "@/lib/services/__fixtures__/supabase-local";

import { DELETE, GET } from "./index";

// Route + real client (test plan §6.3), risks #4 and #7. This route is
// addressed by date, so it cannot name another teacher's row at all: date plus
// session is always the caller's row. Ownership here is therefore not a refusal
// but "teacher b's request on day d sees and changes only b's own row, and
// teacher a's row on d is untouched" - read back as a, through a's client.
//
// Checked by mutation (local `psql`, restored after), measured 2026-09-30:
//   * `day_plans` select policy opened to `using (true)` -> both GET cases red
//     (b is answered with a's plan), and the first DELETE case red (a's own
//     client now sees b's row on d);
//   * `day_plans` select + delete policies opened -> all four red.

let a: Teacher;
let b: Teacher;
let created: string[] = [];

beforeAll(async () => {
  a = await teacherClient("a");
  b = await teacherClient("b");
});

afterEach(async () => {
  await cleanup(created);
  created = [];
});

type Handler = typeof GET;

async function call(handler: Handler, teacher: Teacher, date: string): Promise<Response> {
  const url = new URL("https://example.test/api/day-plan");
  url.searchParams.set("date", date);
  return await handler({
    request: new Request(url, { method: handler === GET ? "GET" : "DELETE" }),
    url,
    locals: { user: { id: teacher.userId }, supabase: teacher.client },
  } as unknown as APIContext);
}

/** The day as the teacher's own client sees it: prompt and proposal count, or null. */
async function dayAsOwner(teacher: Teacher, date: string) {
  const { data, error } = await teacher.client
    .from("day_plans")
    .select("prompt, activities!activities_plan_id_user_id_fkey(id)")
    .eq("plan_date", date)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { prompt: data.prompt, activities: data.activities.length } : null;
}

async function seed(teacher: Teacher, date: string, prompt: string) {
  const seeded = await seedDay(teacher.userId, date, { prompt, activities: activitiesFor(prompt) });
  created.push(seeded.planId);
  return seeded;
}

describe("GET /api/day-plan — by date, across two teachers", () => {
  it("answers 404 to teacher b on a day only teacher a has, with nothing of a's in the body", async () => {
    const date = uniquePlanDate();
    const prompt = `a ${uniqueStamp()}`;
    await seed(a, date, prompt);

    const response = await call(GET, b, date);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual({ error: "Ten dzień nie ma jeszcze planu.", retryable: false });
    expect(text).not.toContain(prompt);

    // The positive control: the owner reads the same day.
    const own = await call(GET, a, date);
    expect(own.status).toBe(200);
    expect(((await own.json()) as { plan: { prompt: string } }).plan.prompt).toBe(prompt);
  });

  it("answers teacher b with b's own plan on a day both teachers have", async () => {
    const date = uniquePlanDate();
    const promptA = `a ${uniqueStamp()}`;
    const promptB = `b ${uniqueStamp()}`;
    await seed(a, date, promptA);
    await seed(b, date, promptB);

    const asB = await call(GET, b, date);
    const asA = await call(GET, a, date);

    expect(asB.status).toBe(200);
    expect(((await asB.json()) as { plan: { prompt: string } }).plan.prompt).toBe(promptB);
    expect(asA.status).toBe(200);
    expect(((await asA.json()) as { plan: { prompt: string } }).plan.prompt).toBe(promptA);
  });
});

describe("DELETE /api/day-plan — by date, across two teachers", () => {
  // What `.maybeSingle()` does *not* do. Measured against the local stack with
  // the select + delete policies opened (2026-09-30, CLI 2.98.2): teacher a's
  // `delete().eq("plan_date", d).select("id").maybeSingle()` reaches both
  // teachers' rows on d, PostgREST answers 406 PGRST116 ("Results contain 2
  // rows") - and **both rows stay deleted**. Nothing is rolled back. The store
  // maps PGRST116 to `not_found`, so the route tells a "Ten dzień nie ma planu
  // do usunięcia." after deleting a's day and b's. The singular response is
  // therefore no defence in depth behind RLS; RLS is the only line, and this
  // case is what holds it. Recorded in next-actions.md as an owned item, not
  // fixed in rollout phase 3.
  it("deletes exactly teacher a's day: not a's next day, not b's same day", async () => {
    const date = uniquePlanDate();
    const promptA = `a ${uniqueStamp()}`;
    const promptNext = `a+1 ${uniqueStamp()}`;
    const promptB = `b ${uniqueStamp()}`;
    await seed(a, date, promptA);
    await seed(a, plusDays(date, 1), promptNext);
    await seed(b, date, promptB);

    const response = await call(DELETE, a, date);

    expect(response.status).toBe(204);
    expect(await dayAsOwner(a, date)).toBeNull();
    expect(await dayAsOwner(a, plusDays(date, 1))).toEqual({ prompt: promptNext, activities: 3 });
    expect(await dayAsOwner(b, date)).toEqual({ prompt: promptB, activities: 3 });
  });

  it("answers 404 to teacher b deleting a day only teacher a has, and a's day stays", async () => {
    const date = uniquePlanDate();
    const prompt = `a ${uniqueStamp()}`;
    await seed(a, date, prompt);

    const response = await call(DELETE, b, date);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Ten dzień nie ma planu do usunięcia.", retryable: false });
    expect(await dayAsOwner(a, date)).toEqual({ prompt, activities: 3 });
  });
});
