import type { APIContext } from "astro";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TERMS_NOT_ACCEPTED } from "@/lib/auth-error-messages";
import { TERMS_VERSION } from "@/lib/legal";

import { POST } from "./signup";

// Same harness as `change-password.test.ts`: the exported `POST` runs without an
// HTTP server, with the `context.redirect` it calls. Unlike that route, this one
// builds its own client through `createClient`, so the substitution happens at
// that module (which would otherwise read `astro:env/server`).

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ createClient }));

type SignUpResult = { error: null } | { error: { code?: string; status?: number; message: string } };

const VALID = { email: "nauczycielka@example.test", password: "dobre-haslo-1", confirmPassword: "dobre-haslo-1" };

function call(fields: Record<string, string>, result: SignUpResult = { error: null }) {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);

  const signUp = vi.fn(() => Promise.resolve(result));
  createClient.mockReturnValue({ auth: { signUp } });

  const context = {
    request: new Request("https://example.test/api/auth/signup", { method: "POST", body: form }),
    cookies: {},
    redirect: (location: string) => new Response(null, { status: 302, headers: { Location: location } }),
  };

  return { signUp, response: POST(context as unknown as APIContext) as Promise<Response> };
}

async function location(response: Promise<Response>): Promise<string | null> {
  return (await response).headers.get("Location");
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  createClient.mockReset();
});

describe("POST /api/auth/signup — terms acceptance (Regulamin § 5 ust. 1)", () => {
  it("refuses a form without `terms` and never asks Supabase", async () => {
    const { response, signUp } = call(VALID);

    expect(await location(response)).toBe(`/auth/signup?error=${TERMS_NOT_ACCEPTED}`);
    expect(signUp).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("refuses an empty `terms` like a missing one", async () => {
    const { response, signUp } = call({ ...VALID, terms: "" });

    expect(await location(response)).toBe(`/auth/signup?error=${TERMS_NOT_ACCEPTED}`);
    expect(signUp).not.toHaveBeenCalled();
  });

  it("refuses any other value, e.g. a hand-built `terms=false`", async () => {
    const { response, signUp } = call({ ...VALID, terms: "false" });

    expect(await location(response)).toBe(`/auth/signup?error=${TERMS_NOT_ACCEPTED}`);
    expect(signUp).not.toHaveBeenCalled();
  });

  it("records the accepted version and the moment of acceptance with the account", async () => {
    const before = Date.now();
    const { response, signUp } = call({ ...VALID, terms: "accepted" });

    expect(await location(response)).toBe("/auth/confirm-email");
    expect(signUp).toHaveBeenCalledTimes(1);
    expect(signUp).toHaveBeenCalledWith({
      email: VALID.email,
      password: VALID.password,
      options: {
        emailRedirectTo: "https://example.test/auth/confirm",
        data: { terms_version: TERMS_VERSION, terms_accepted_at: expect.any(String) as string },
      },
    });

    const [args] = signUp.mock.calls[0] as unknown as [{ options: { data: { terms_accepted_at: string } } }];
    const acceptedAt = Date.parse(args.options.data.terms_accepted_at);
    expect(acceptedAt).toBeGreaterThanOrEqual(before);
    expect(acceptedAt).toBeLessThanOrEqual(Date.now());
  });

  it("still maps a Supabase refusal to its code after the terms were accepted", async () => {
    const { response } = call(
      { ...VALID, terms: "accepted" },
      { error: { code: "email_exists", status: 422, message: "User already registered" } },
    );

    expect(await location(response)).toBe("/auth/signup?error=email_exists");
  });
});
