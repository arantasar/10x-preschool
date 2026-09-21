import type { APIContext } from "astro";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { activityRow, planRow, supabaseStub } from "@/lib/services/__fixtures__/supabase";
import { TITLE_MAX } from "@/lib/day-plan-limits";

import { PATCH } from "./[id]";

// Mirrors `week/day.test.ts`: the route's `PATCH` is an exported function, the
// only substitution is `context.locals`, and no module from `src/lib/` is
// mocked — so zod, `updateActivityText` and `readDayPlanById` all execute for
// real against the PostgREST stub.
//
// Four cases, one per branch the route now has, because the claim being pinned
// is the one the island will consume: `acceptance_cleared` reports what the
// *server* saw a moment before the write, and reports it only when there was an
// acceptance to take away. The draft case is what makes that a gate rather than
// a comment — a route setting the marker unconditionally passes every other
// case here.

const ACTIVITY_ID = "33333333-3333-4333-8333-000000000001";
const USER = { id: "22222222-2222-4222-8222-222222222222" };

function request(body: unknown = { title: "Nowy tytuł", description: "Nowy opis" }) {
  return new Request(`https://example.test/api/day-plan/activity/${ACTIVITY_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function call(locals: unknown, body?: unknown): Promise<Response> {
  // Awaited rather than returned: `APIRoute` is declared as
  // `Response | Promise<Response>`, and handing that straight back would be a
  // type error here. Same shape as `week/day.test.ts`.
  return await PATCH({ request: request(body), params: { id: ACTIVITY_ID }, locals } as unknown as APIContext);
}

/**
 * The day as it stands *after* the write: the trigger has already zeroed
 * `accepted_at`, whatever it was before. That is the point of the marker — the
 * plan in the response cannot tell the island which of the two happened.
 */
function savedDay() {
  const plan = planRow({ accepted_at: null });
  return { savedPlan: plan, savedActivities: [activityRow(1, plan), activityRow(2, plan), activityRow(3, plan)] };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PATCH /api/day-plan/activity/[id]", () => {
  it("answers 200 with acceptance_cleared when the plan was accepted before the write", async () => {
    const supabase = supabaseStub({
      ...savedDay(),
      activityBeforeEdit: {
        plan_id: planRow().id,
        day_plans: { accepted_at: "2026-09-14T09:00:00.000Z" },
      },
      updatedActivity: { plan_id: planRow().id },
    });

    const response = await call({ user: USER, supabase: supabase.client });
    const body = (await response.json()) as { acceptance_cleared?: boolean; activities: unknown[] };

    expect(response.status).toBe(200);
    expect(body.acceptance_cleared).toBe(true);
    // The whole plan still comes back, not just the edited proposal.
    expect(body.activities).toHaveLength(3);
    // Not just *that* a write happened, but what it carried. `toHaveBeenCalledTimes`
    // alone passes on a route calling `.update({})`, or one writing the
    // description into the title — the stub hands the payload back untouched
    // either way, so the count says nothing about the contract.
    expect(supabase.update).toHaveBeenCalledTimes(1);
    expect(supabase.update).toHaveBeenCalledWith({ title: "Nowy tytuł", description: "Nowy opis" });
  });

  it("answers 200 without acceptance_cleared when the plan was already a draft", async () => {
    const supabase = supabaseStub({
      ...savedDay(),
      activityBeforeEdit: { plan_id: planRow().id, day_plans: { accepted_at: null } },
      updatedActivity: { plan_id: planRow().id },
    });

    const response = await call({ user: USER, supabase: supabase.client });
    const body = (await response.json()) as { acceptance_cleared?: boolean };

    expect(response.status).toBe(200);
    // Either shape is honest — absent, or present and false. What must not
    // happen is a day that lost nothing being told it did.
    expect(body.acceptance_cleared ?? false).toBe(false);
    expect(supabase.update).toHaveBeenCalledTimes(1);
  });

  it("answers 404 without writing when the proposal is not visible under RLS", async () => {
    const supabase = supabaseStub({ ...savedDay(), activityBeforeEdit: null });

    const response = await call({ user: USER, supabase: supabase.client });
    const body = (await response.json()) as { error: string; retryable: boolean };

    expect(response.status).toBe(404);
    expect(body.retryable).toBe(false);
    // The refusal now arrives from the pre-write read, so another teacher's
    // proposal is never handed to `update` at all.
    expect(supabase.update).not.toHaveBeenCalled();
  });

  it("answers 400 on a body the schema refuses, never touching the database", async () => {
    // Deliberately not `{ title: "   " }`: the schema is `min(1)` with no trim,
    // so a blank-but-present title is a valid body here. The editor refuses it
    // in the island, and this route is not where that bound lives.
    const malformed: unknown[] = [
      { description: "Nowy opis" },
      { title: "", description: "Nowy opis" },
      { title: "a".repeat(TITLE_MAX + 1), description: "Nowy opis" },
      { title: "Nowy tytuł" },
    ];

    for (const payload of malformed) {
      const supabase = supabaseStub({ ...savedDay() });

      const response = await call({ user: USER, supabase: supabase.client }, payload);

      expect(response.status).toBe(400);
      // Not just "did not write": zod refuses before the route reaches Supabase
      // at all, so neither statement of `updateActivityText` is issued.
      expect(supabase.from).not.toHaveBeenCalled();
      expect(supabase.update).not.toHaveBeenCalled();
    }
  });
});
