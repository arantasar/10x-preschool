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

import { POST } from "./accept";

// Route + real client (test plan §6.3), risk #4. `accept.test.ts` pins how the
// route answers an update that matched nothing; this pins that teacher a's
// plan *is* what matches nothing for teacher b - which only RLS can say.
//
// Every "a's plan is untouched" is read as teacher a, through a's own client.
//
// Checked by mutation (local `psql`, restored after): the `day_plans` select
// policy opened to `using (true)` turns the 404 case red - b's update still
// matches nothing (the update policy holds), but the follow-up read now sees
// a's row and the answer becomes 409.

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

async function accept(teacher: Teacher, body: unknown): Promise<Response> {
  return await POST({
    request: new Request("https://example.test/api/day-plan/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    locals: { user: { id: teacher.userId }, supabase: teacher.client },
  } as unknown as APIContext);
}

async function acceptedAtAsOwner(teacher: Teacher, planId: string): Promise<string | null> {
  const { data, error } = await teacher.client.from("day_plans").select("accepted_at").eq("id", planId).single();
  if (error) throw new Error(error.message);
  return data.accepted_at;
}

describe("POST /api/day-plan/accept — another teacher's plan_id", () => {
  it("answers 404 to teacher b accepting teacher a's plan, and a's plan stays „do przejrzenia”", async () => {
    const seeded = await seedDay(a.userId, uniquePlanDate(), {
      prompt: `a ${uniqueStamp()}`,
      activities: activitiesFor("a"),
    });
    created.push(seeded.planId);

    const response = await accept(b, { plan_id: seeded.planId, accepted: true, expected_generation: 1 });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Nie znaleziono tego planu dnia.", retryable: false });
    expect(await acceptedAtAsOwner(a, seeded.planId)).toBeNull();

    // The positive control: the same request from the owner lands. Without it
    // the 404 above would read identically against a route that refuses all.
    const own = await accept(a, { plan_id: seeded.planId, accepted: true, expected_generation: 1 });
    const body = (await own.json()) as { plan: { accepted_at: string | null } };

    expect(own.status).toBe(200);
    expect(body.plan.accepted_at).not.toBeNull();
    expect(await acceptedAtAsOwner(a, seeded.planId)).not.toBeNull();
  });

  it("answers 404 to teacher b withdrawing teacher a's acceptance, and a's plan stays „zatwierdzony”", async () => {
    const seeded = await seedDay(a.userId, uniquePlanDate(), {
      prompt: `a ${uniqueStamp()}`,
      activities: activitiesFor("a"),
      accepted: true,
    });
    created.push(seeded.planId);
    const before = await acceptedAtAsOwner(a, seeded.planId);

    const response = await accept(b, { plan_id: seeded.planId, accepted: false, expected_generation: 1 });

    expect(response.status).toBe(404);
    expect(((await response.json()) as { retryable: boolean }).retryable).toBe(false);
    expect(before).not.toBeNull();
    expect(await acceptedAtAsOwner(a, seeded.planId)).toBe(before);
  });
});
