import type { APIContext } from "astro";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ACCOUNT_DELETED_COOKIE } from "@/lib/account-settings";

import { POST } from "./delete-account";

// Same harness as `change-password.test.ts`, with `rpc` added to the mock
// client: the exported `POST` runs without an HTTP server, with
// `context.locals.supabase` substituted and the two `context` methods the route
// calls, `redirect` and `cookies.set`.

type AuthResult = { error: null } | { error: { code?: string; status?: number; message: string } };
type RpcResult = { error: null } | { error: { code?: string; message: string } };

const SESSION_EMAIL = "nauczycielka@example.test";
const VALID = { current: "obecne-haslo-1" };

function call(
  fields: Record<string, string>,
  results: { signIn?: AuthResult; rpc?: RpcResult; signOut?: AuthResult } = {},
  options: { supabase?: boolean; user?: { id?: string; email?: string } | null } = {},
) {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);

  const order: string[] = [];
  const signInWithPassword = vi.fn(() => {
    order.push("signIn");
    return Promise.resolve(results.signIn ?? { error: null });
  });
  const rpc = vi.fn(() => {
    order.push("rpc");
    return Promise.resolve(results.rpc ?? { error: null });
  });
  const signOut = vi.fn(() => {
    order.push("signOut");
    return Promise.resolve(results.signOut ?? { error: null });
  });
  const setCookie = vi.fn();

  const context = {
    request: new Request("https://example.test/api/auth/delete-account", { method: "POST", body: form }),
    locals: {
      supabase: options.supabase === false ? null : { auth: { signInWithPassword, signOut }, rpc },
      user: options.user === undefined ? { id: "user-1", email: SESSION_EMAIL } : options.user,
    },
    cookies: { set: setCookie },
    redirect: (location: string) => new Response(null, { status: 302, headers: { Location: location } }),
  };

  return {
    order,
    signInWithPassword,
    rpc,
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
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/auth/delete-account — success", () => {
  it("re-signs in, deletes, signs out locally in that order, then lands on / with the notice", async () => {
    const { response, order, rpc, signOut, setCookie } = call(VALID);

    expect(await location(response)).toBe("/");
    expect(order).toEqual(["signIn", "rpc", "signOut"]);
    expect(rpc).toHaveBeenCalledWith("delete_own_account");
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    // Spelled out rather than compared with the exported options, so dropping
    // a flag from the constant fails here too.
    expect(setCookie).toHaveBeenCalledWith(ACCOUNT_DELETED_COOKIE, "1", {
      path: "/",
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

  it("still confirms the deletion when the local sign-out fails", async () => {
    const { response, setCookie } = call(VALID, {
      signOut: { error: { code: "unexpected_failure", status: 500, message: "x" } },
    });

    expect(await location(response)).toBe("/");
    expect(setCookie).toHaveBeenCalledWith(ACCOUNT_DELETED_COOKIE, "1", expect.anything());
  });
});

describe("POST /api/auth/delete-account — a wrong password deletes nothing", () => {
  it("maps invalid_credentials to current_password_invalid and stops before the delete", async () => {
    const { response, rpc, signOut, setCookie } = call(VALID, {
      signIn: { error: { code: "invalid_credentials", status: 400, message: "Invalid login credentials" } },
    });

    expect(await location(response)).toBe("/ustawienia?delete_error=current_password_invalid#usun-konto");
    expect(rpc).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(setCookie).not.toHaveBeenCalled();
  });

  it("forwards another sign-in code as is", async () => {
    const { response, rpc } = call(VALID, {
      signIn: { error: { code: "over_request_rate_limit", status: 429, message: "x" } },
    });

    expect(await location(response)).toBe("/ustawienia?delete_error=over_request_rate_limit#usun-konto");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("falls back to connection_failed when the sign-in error has no code", async () => {
    const { response, rpc } = call(VALID, { signIn: { error: { message: "fetch failed" } } });

    expect(await location(response)).toBe("/ustawienia?delete_error=connection_failed#usun-konto");
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/delete-account — a failed delete signs nobody out", () => {
  it("answers account_delete_failed without signing out or confirming", async () => {
    const { response, signOut, setCookie } = call(VALID, {
      rpc: { error: { code: "42501", message: "permission denied for table users" } },
    });

    expect(await location(response)).toBe("/ustawienia?delete_error=account_delete_failed#usun-konto");
    expect(signOut).not.toHaveBeenCalled();
    expect(setCookie).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/delete-account — guards", () => {
  it("sends a request without a user to sign-in", async () => {
    const { response, signInWithPassword, rpc } = call(VALID, {}, { user: null });

    expect(await location(response)).toBe("/auth/signin");
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("sends a user without an e-mail to sign-in", async () => {
    const { response, rpc } = call(VALID, {}, { user: { id: "user-1" } });

    expect(await location(response)).toBe("/auth/signin");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reports a missing server config", async () => {
    const { response } = call(VALID, {}, { supabase: false });

    expect(await location(response)).toBe("/ustawienia?delete_error=config_missing#usun-konto");
  });

  it("rejects an empty password without asking Supabase", async () => {
    const { response, signInWithPassword, rpc, signOut, setCookie } = call({ current: "" });

    expect(await location(response)).toBe("/ustawienia?delete_error=validation_failed#usun-konto");
    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(setCookie).not.toHaveBeenCalled();
  });
});
