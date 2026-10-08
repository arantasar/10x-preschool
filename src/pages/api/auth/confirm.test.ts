import type { APIContext } from "astro";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PENDING_TOPIC_COOKIE } from "@/lib/pending-topic";
import { RESET_EMAIL_COOKIE } from "@/lib/reset-request";

import { POST } from "./confirm";

// The route's `POST` is an exported function, so it runs without an HTTP server.
// The only substitution is `context.locals.supabase` - the same injection point
// `src/pages/api/day-plan/generate.test.ts` uses - plus the two `context`
// methods the route calls, `redirect` and `cookies.delete`.

type VerifyResult = { error: null } | { error: { code?: string; status?: number; message: string } };

function call(
  fields: Record<string, string>,
  verify: VerifyResult = { error: null },
  options: { supabase?: boolean; pendingTopic?: string } = {},
) {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) form.set(name, value);

  const verifyOtp = vi.fn(() => Promise.resolve(verify));
  const deleteCookie = vi.fn();
  const context = {
    request: new Request("https://example.test/api/auth/confirm", { method: "POST", body: form }),
    locals: { supabase: options.supabase === false ? null : { auth: { verifyOtp } } },
    cookies: {
      delete: deleteCookie,
      get: (name: string) =>
        name === PENDING_TOPIC_COOKIE && options.pendingTopic !== undefined
          ? { value: options.pendingTopic }
          : undefined,
    },
    redirect: (location: string) => new Response(null, { status: 302, headers: { Location: location } }),
  };

  return {
    verifyOtp,
    deleteCookie,
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

describe("POST /api/auth/confirm — sign-up activation (type=email)", () => {
  it("verifies as type email and lands the teacher on the month", async () => {
    const { response, verifyOtp, deleteCookie } = call({ token_hash: "abc", type: "email" });

    expect(await location(response)).toBe("/plan/month");
    expect(verifyOtp).toHaveBeenCalledWith({ type: "email", token_hash: "abc" });
    expect(deleteCookie).not.toHaveBeenCalled();
  });

  it("lands on the week when a hasło from the landing is waiting, like sign-in does", async () => {
    const { response } = call(
      { token_hash: "abc", type: "email" },
      { error: null },
      { pendingTopic: "jesień w lesie" },
    );

    expect(await location(response)).toBe("/plan/week");
  });

  it("ignores an empty pending hasło and lands on the month", async () => {
    const { response } = call({ token_hash: "abc", type: "email" }, { error: null }, { pendingTopic: "   " });

    expect(await location(response)).toBe("/plan/month");
  });

  it("reports a missing server config on sign-in, not on the reset page", async () => {
    const { response } = call({ token_hash: "abc", type: "email" }, { error: null }, { supabase: false });

    expect(await location(response)).toBe("/auth/signin?error=config_missing");
  });

  it("falls back to connection_failed when Supabase gives no code", async () => {
    const { response } = call({ token_hash: "abc", type: "email" }, { error: { message: "fetch failed" } });

    expect(await location(response)).toBe("/auth/signin?error=connection_failed");
  });

  it("sends an expired or reused link to sign-in with the activation code, not the reset one", async () => {
    const { response } = call(
      { token_hash: "abc", type: "email" },
      { error: { code: "otp_expired", status: 403, message: "Email link is invalid or has expired" } },
    );

    expect(await location(response)).toBe("/auth/signin?error=signup_link_expired");
  });

  it("forwards any other Supabase code to sign-in", async () => {
    const { response } = call(
      { token_hash: "abc", type: "email" },
      { error: { code: "over_request_rate_limit", status: 429, message: "x" } },
    );

    expect(await location(response)).toBe("/auth/signin?error=over_request_rate_limit");
  });

  it("rejects a link without a token before asking Supabase", async () => {
    const { response, verifyOtp } = call({ type: "email" });

    expect(await location(response)).toBe("/auth/signin?error=signup_link_invalid");
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/confirm — password reset (type=recovery), unchanged", () => {
  it("verifies as type recovery, clears the reset cookie and goes to the new-password form", async () => {
    const { response, verifyOtp, deleteCookie } = call({ token_hash: "abc", type: "recovery" });

    expect(await location(response)).toBe("/auth/new-password");
    expect(verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "abc" });
    expect(deleteCookie).toHaveBeenCalledWith(RESET_EMAIL_COOKIE, expect.anything());
  });

  it("keeps an expired reset link on the forgot-password page with Supabase's code", async () => {
    const { response } = call(
      { token_hash: "abc", type: "recovery" },
      { error: { code: "otp_expired", status: 403, message: "x" } },
    );

    expect(await location(response)).toBe("/auth/forgot-password?error=otp_expired");
  });

  it("rejects a recovery link without a token", async () => {
    const { response, verifyOtp } = call({ type: "recovery" });

    expect(await location(response)).toBe("/auth/forgot-password?error=reset_link_invalid");
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});

describe("POST /api/auth/confirm — anything else", () => {
  it.each(["signup", "magiclink", ""])("rejects type=%s as an invalid reset link", async (type) => {
    const { response, verifyOtp } = call({ token_hash: "abc", type });

    expect(await location(response)).toBe("/auth/forgot-password?error=reset_link_invalid");
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});
