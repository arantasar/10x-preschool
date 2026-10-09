import type { APIContext } from "astro";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  anonClient,
  contactMessagesContaining,
  deleteContactMessages,
  teacherClient,
  uniqueStamp,
  type Teacher,
} from "@/lib/services/__fixtures__/supabase-local";

// Route + real client (test plan §6.3). `contact.test.ts` pins the pipeline
// against a stub that accepts any insert; this pins that the insert the route
// actually sends gets past PostgREST and RLS on a table the api roles may
// write but never read. The trap it exists for: `.select()` after `.insert()`
// becomes `insert ... returning`, which needs a select grant anon does not
// have - green against the stub, red here.
//
// Only Turnstile and the mail binding are substituted: both are external, and
// neither has anything to say about the database.
vi.mock("@/lib/services/bot-check", () => ({ verifyHumanToken: () => Promise.resolve({ ok: true }) }));
vi.mock("@/lib/services/email-binding", () => ({ getEmailBinding: () => undefined }));
vi.mock("astro:env/server", () => ({ TURNSTILE_SECRET_KEY: "sekret", CONTACT_TO: undefined }));

const { POST } = await import("./contact");

let teacher: Teacher;
let created: string[] = [];

beforeAll(async () => {
  teacher = await teacherClient("a");
});

afterEach(async () => {
  await deleteContactMessages(created);
  created = [];
});

async function send(locals: { user: { id: string } | null; supabase: unknown }, message: string): Promise<Response> {
  return await POST({
    request: new Request("https://example.test/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "nadawca@example.test",
        topic: "question",
        message,
        website: "",
        turnstileToken: "token",
      }),
    }),
    locals,
  } as unknown as APIContext);
}

describe("POST /api/contact — against the local stack", () => {
  it("stores a message from a visitor without an account", async () => {
    const stamp = uniqueStamp();

    const response = await send({ user: null, supabase: anonClient() }, `Pytanie gościa ${stamp}`);

    expect(response.status).toBe(200);
    const rows = await contactMessagesContaining(stamp);
    created.push(...rows.map((row) => row.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBeNull();
  });

  it("stores a message from a signed-in teacher, attributed to their account", async () => {
    const stamp = uniqueStamp();

    const response = await send(
      { user: { id: teacher.userId }, supabase: teacher.client },
      `Pytanie nauczycielki ${stamp}`,
    );

    expect(response.status).toBe(200);
    const rows = await contactMessagesContaining(stamp);
    created.push(...rows.map((row) => row.id));
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(teacher.userId);
  });
});
