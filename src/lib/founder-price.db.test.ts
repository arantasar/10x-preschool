import { afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  anonClient,
  deleteFounderPriceSignups,
  founderPriceSignupsFor,
  teacherClient,
  teacherEmail,
  uniqueStamp,
  type Teacher,
} from "@/lib/services/__fixtures__/supabase-local";

// What `POST /api/founder-price` relies on, proven through supabase-js against
// the local stack rather than a stub (`20261019120000_founder_price_signups.sql`):
//   * an insert without `.select()` gets past PostgREST and RLS for anon - with
//     `.select()` it would be `insert ... returning`, which anon cannot do;
//   * a repeat comes back as error code `23505`, the code the route turns into
//     success, so the address stays one row;
//   * a signed-in teacher reads the row with her own address - the
//     "Jesteś na liście" state - and not someone else's.

let teacherA: Teacher;
let teacherB: Teacher;
let listed: string[] = [];

beforeAll(async () => {
  teacherA = await teacherClient("a");
  teacherB = await teacherClient("b");
});

afterEach(async () => {
  await deleteFounderPriceSignups(listed);
  listed = [];
});

describe("founder_price_signups — through supabase-js", () => {
  it("lets a visitor sign up with a plain insert and answers a repeat with 23505", async () => {
    const email = `api-founder-${uniqueStamp()}@example.test`;
    listed.push(email);
    const anon = anonClient();

    const first = await anon.from("founder_price_signups").insert({ email, period: "yearly" });
    const repeat = await anon.from("founder_price_signups").insert({ email, period: "monthly" });

    expect(first.error).toBeNull();
    expect(repeat.error?.code).toBe("23505");
    const rows = await founderPriceSignupsFor(email);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ user_id: null, period: "yearly" });
  });

  it("refuses an insert read back with .select() for a visitor", async () => {
    const email = `api-founder-${uniqueStamp()}@example.test`;
    listed.push(email);

    const { error } = await anonClient().from("founder_price_signups").insert({ email, period: "yearly" }).select("id");

    expect(error).not.toBeNull();
  });

  it("lets a signed-in teacher list her own address and read back only that row", async () => {
    const email = teacherEmail("a");
    listed.push(email);
    // Someone else's row, which teacher a must not see.
    const other = `api-founder-${uniqueStamp()}@example.test`;
    listed.push(other);
    expect(
      (await anonClient().from("founder_price_signups").insert({ email: other, period: "yearly" })).error,
    ).toBeNull();

    const insert = await teacherA.client
      .from("founder_price_signups")
      .insert({ email, user_id: teacherA.userId, period: "monthly" });
    const own = await teacherA.client.from("founder_price_signups").select("email, user_id");

    expect(insert.error).toBeNull();
    expect(own.error).toBeNull();
    expect(own.data).toEqual([{ email, user_id: teacherA.userId }]);
  });

  it("does not show a teacher anyone's row but the one with her address", async () => {
    listed.push(teacherEmail("a"));
    const { error } = await teacherA.client
      .from("founder_price_signups")
      .insert({ email: teacherEmail("a"), user_id: teacherA.userId, period: "yearly" });
    expect(error).toBeNull();

    const seenByB = await teacherB.client.from("founder_price_signups").select("id").limit(1).maybeSingle();

    expect(seenByB.error).toBeNull();
    expect(seenByB.data).toBeNull();
  });
});
