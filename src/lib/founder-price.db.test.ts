import { afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  anonClient,
  deleteFounderPriceSignups,
  founderPriceSignupsFor,
  teacherClient,
  uniqueStamp,
  type Teacher,
} from "@/lib/services/__fixtures__/supabase-local";

// What `POST /api/founder-price` relies on, proven through supabase-js against
// the local stack rather than a stub (`20261019120000_founder_price_signups.sql`):
//   * an insert without `.select()` gets past PostgREST and RLS for anon - with
//     `.select()` it would be `insert ... returning`, which anon cannot do;
//   * a repeat comes back as error code `23505`, the code the route turns into
//     success, so the address stays one row;
//   * a signed-in session can neither write nor read the list - the list is
//     for people without an account (FR-036), and the route's `signed_in`
//     refusal is not the only wall.

let teacher: Teacher;
let listed: string[] = [];

beforeAll(async () => {
  teacher = await teacherClient("a");
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
    expect(rows[0]).toMatchObject({ period: "yearly" });
  });

  it("refuses an insert read back with .select() for a visitor", async () => {
    const email = `api-founder-${uniqueStamp()}@example.test`;
    listed.push(email);

    const { error } = await anonClient().from("founder_price_signups").insert({ email, period: "yearly" }).select("id");

    expect(error).not.toBeNull();
  });

  it("refuses a signed-in teacher both writing and reading the list", async () => {
    const email = `api-founder-${uniqueStamp()}@example.test`;
    listed.push(email);
    expect((await anonClient().from("founder_price_signups").insert({ email, period: "yearly" })).error).toBeNull();
    const own = `api-founder-${uniqueStamp()}-teacher@example.test`;
    listed.push(own);

    const insert = await teacher.client.from("founder_price_signups").insert({ email: own, period: "yearly" });
    const read = await teacher.client.from("founder_price_signups").select("id");

    expect(insert.error?.code).toBe("42501");
    expect(read.error?.code).toBe("42501");
    expect(await founderPriceSignupsFor(own)).toHaveLength(0);
  });
});
