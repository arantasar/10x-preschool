import type { APIContext } from "astro";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PASSWORD_CHANGED_COOKIE } from "@/lib/account-settings";

import { POST } from "./change-password";

// Same harness as `confirm.test.ts`: the exported `POST` runs without an HTTP
// server, with `context.locals.supabase` substituted and the two `context`
// methods the route calls, `redirect` and `cookies.set`.

type AuthResult = { error: null } | { error: { code?: string; status?: number; message: string } };

const SESSION_EMAIL = "nauczycielka@example.test";
const VALID = { current: "stare-haslo-1", password: "nowe-haslo-2", repeat: "nowe-haslo-2" };

function call(
  fields: Record<string, string>,
  results: { signIn?: AuthResult; update?: AuthResult; signOut?: AuthResult } = {},
  options: { supabase?: boolean; user?: { email?: string } | null } = {},
) {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);

  const order: string[] = [];
  const signInWithPassword = vi.fn(() => {
    order.push("signIn");
    return Promise.resolve(results.signIn ?? { error: null });
  });
  const updateUser = vi.fn(() => {
    order.push("update");
    return Promise.resolve(results.update ?? { error: null });
  });
  const signOut = vi.fn(() => {
    order.push("signOut");
    return Promise.resolve(results.signOut ?? { error: null });
  });
  const setCookie = vi.fn();

  const context = {
    request: new Request("https://example.test/api/auth/change-password", { method: "POST", body: form }),
    locals: {
      supabase: options.supabase === false ? null : { auth: { signInWithPassword, updateUser, signOut } },
      user: options.user === undefined ? { email: SESSION_EMAIL } : options.user,
    },
    cookies: { set: setCookie },
    redirect: (location: string) => new Response(null, { status: 302, headers: { Location: location } }),
  };

  return {
    order,
    signInWithPassword,
    updateUser,
    signOut,
    setCookie,
    response: POST(context as unknown as APIContext) as Promise<Response>,
  };
}

async function location(response: Promise<Response>): Promise<string | null> {
  return (await response).headers.get("Location");
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/auth/change-password — success", () => {
  it("re-signs in, saves, signs out the others in that order, then confirms on the settings screen", async () => {
    const { response, order, updateUser, signOut, setCookie } = call(VALID);

    expect(await location(response)).toBe("/ustawienia");
    expect(order).toEqual(["signIn", "update", "signOut"]);
    expect(updateUser).toHaveBeenCalledWith({ password: VALID.password });
    expect(signOut).toHaveBeenCalledWith({ scope: "others" });
    // Spelled out rather than compared with the exported options, so dropping
    // a flag from the constant fails here too.
    expect(setCookie).toHaveBeenCalledWith(PASSWORD_CHANGED_COOKIE, "1", {
      path: "/ustawienia",
      httpOnly: true,
      sameSite: "lax",
      secure: expect.any(Boolean) as boolean,
      maxAge: 60,
    });
  });

  it("signs in with the session's e-mail, never with an address from the form", async () => {
    const { response, signInWithPassword } = call({ ...VALID, email: "ktos-inny@example.test" });

    await response;
    expect(signInWithPassword).toHaveBeenCalledWith({ email: SESSION_EMAIL, password: VALID.current });
  });

  it("still confirms the change when signing out the other sessions fails", async () => {
    const { response, setCookie } = call(VALID, {
      signOut: { error: { code: "unexpected_failure", status: 500, message: "x" } },
    });

    expect(await location(response)).toBe("/ustawienia");
    expect(setCookie).toHaveBeenCalledWith(PASSWORD_CHANGED_COOKIE, "1", expect.anything());
  });
});

describe("POST /api/auth/change-password — a wrong current password changes nothing", () => {
  it("maps invalid_credentials to current_password_invalid and stops before the update", async () => {
    const { response, updateUser, signOut, setCookie } = call(VALID, {
      signIn: { error: { code: "invalid_credentials", status: 400, message: "Invalid login credentials" } },
    });

    expect(await location(response)).toBe("/ustawienia?error=current_password_invalid");
    expect(updateUser).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("forwards another sign-in code as is", async () => {
    const { response, updateUser } = call(VALID, {
      signIn: { error: { code: "over_request_rate_limit", status: 429, message: "x" } },
    });

    expect(await location(response)).toBe("/ustawienia?error=over_request_rate_limit");
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("falls back to connection_failed when the sign-in error has no code", async () => {
    const { response } = call(VALID, { signIn: { error: { message: "fetch failed" } } });

    expect(await location(response)).toBe("/ustawienia?error=connection_failed");
  });
});

describe("POST /api/auth/change-password — a failed update signs nobody out", () => {
  it("forwards same_password without signing out or confirming", async () => {
    const { response, signOut, setCookie } = call(VALID, {
      update: { error: { code: "same_password", status: 422, message: "x" } },
    });

    expect(await location(response)).toBe("/ustawienia?error=same_password");
    expect(signOut).not.toHaveBeenCalled();
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("maps reauthentication_needed to password_change_failed, not the reset wording", async () => {
    const { response, signOut } = call(VALID, {
      update: { error: { code: "reauthentication_needed", status: 400, message: "x" } },
    });

    expect(await location(response)).toBe("/ustawienia?error=password_change_failed");
    expect(signOut).not.toHaveBeenCalled();
  });

  it("falls back to connection_failed when the update error has no code", async () => {
    const { response } = call(VALID, { update: { error: { message: "fetch failed" } } });

    expect(await location(response)).toBe("/ustawienia?error=connection_failed");
  });
});

describe("POST /api/auth/change-password — guards", () => {
  it("sends a request without a user to sign-in", async () => {
    const { response, signInWithPassword } = call(VALID, {}, { user: null });

    expect(await location(response)).toBe("/auth/signin");
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("sends a user without an e-mail to sign-in", async () => {
    const { response, signInWithPassword } = call(VALID, {}, { user: {} });

    expect(await location(response)).toBe("/auth/signin");
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("reports a missing server config", async () => {
    const { response } = call(VALID, {}, { supabase: false });

    expect(await location(response)).toBe("/ustawienia?error=config_missing");
  });

  it.each([
    ["no current password", { ...VALID, current: "" }],
    ["a short new password", { ...VALID, password: "krótkie", repeat: "krótkie" }],
    ["a mismatched repetition", { ...VALID, repeat: "inne-haslo-3" }],
    ["a new password equal to the current one", { current: "to-samo-1", password: "to-samo-1", repeat: "to-samo-1" }],
  ])("rejects %s without asking Supabase", async (_label, fields) => {
    const { response, signInWithPassword, updateUser, signOut } = call(fields);

    expect(await location(response)).toBe("/ustawienia?error=validation_failed");
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });
});
