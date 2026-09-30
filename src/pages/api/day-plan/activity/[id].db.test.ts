import type { APIContext } from "astro";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  activitiesFor,
  cleanup,
  seedDay,
  teacherClient,
  uniquePlanDate,
  uniqueStamp,
  type Teacher,
} from "@/lib/services/__fixtures__/supabase-local";

import { PATCH } from "./[id]";

// Route + real client (test plan §6.3), risk #4. `[id].test.ts` pins that an
// invisible proposal is answered 404 before any write; this pins that teacher
// a's proposal *is* invisible to teacher b - and that nothing of a's moved,
// read back as teacher a.
//
// Checked by mutation (local `psql`, restored after), measured 2026-09-30:
//   * `activities` select + update policies opened to `using (true)` -> red.
//     b's pre-read now sees a's proposal, the update is then refused by the
//     update policy's `with check` (42501), and the route answers 500
//     "Skontaktuj się z administratorem" instead of 404. a's text survives -
//     but the answer is the misleading one only a real database can show.
//   * the update policy opened *alone* -> stays green, correctly: the pre-read
//     goes through the select policy, sees nothing, and refuses before any
//     write. This case holds the select policy's line, not the update's.

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

async function edit(teacher: Teacher, activityId: string, text: { title: string; description: string }) {
  return await PATCH({
    request: new Request(`https://example.test/api/day-plan/activity/${activityId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(text),
    }),
    params: { id: activityId },
    locals: { user: { id: teacher.userId }, supabase: teacher.client },
  } as unknown as APIContext);
}

async function readAsOwner(teacher: Teacher, activityId: string, planId: string) {
  const { data: activity, error } = await teacher.client
    .from("activities")
    .select("title, description")
    .eq("id", activityId)
    .single();
  if (error) throw new Error(error.message);
  const { data: plan, error: planError } = await teacher.client
    .from("day_plans")
    .select("accepted_at")
    .eq("id", planId)
    .single();
  if (planError) throw new Error(planError.message);
  return { ...activity, accepted_at: plan.accepted_at };
}

describe("PATCH /api/day-plan/activity/[id] — another teacher's proposal", () => {
  it("answers 404 to teacher b, and teacher a's proposal and acceptance are untouched", async () => {
    const stamp = uniqueStamp();
    const seeded = await seedDay(a.userId, uniquePlanDate(), {
      prompt: `a ${stamp}`,
      activities: activitiesFor(stamp),
      accepted: true,
    });
    created.push(seeded.planId);
    const target = seeded.activityIds[0];
    const before = await readAsOwner(a, target, seeded.planId);

    const response = await edit(b, target, { title: "Przejęte przez b", description: "Nie powinno się zapisać" });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Nie znaleziono tej propozycji.", retryable: false });
    // The acceptance is part of the claim: an edit that landed would have
    // cleared it by trigger even with the text restored.
    expect(before.accepted_at).not.toBeNull();
    expect(await readAsOwner(a, target, seeded.planId)).toEqual(before);

    // The positive control: the owner's edit of the same proposal lands.
    const own = await edit(a, target, { title: `Poprawione ${stamp}`, description: "Nowy opis" });

    expect(own.status).toBe(200);
    expect((await readAsOwner(a, target, seeded.planId)).title).toBe(`Poprawione ${stamp}`);
  });
});
