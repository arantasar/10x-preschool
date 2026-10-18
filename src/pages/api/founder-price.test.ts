import type { APIContext } from "astro";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

// The two seams the route reaches beyond `locals`: the bot check (network) and
// the runtime configuration. Everything else is the route's own logic.
const verifyHumanToken = vi.fn();
const env = {
  TURNSTILE_SECRET_KEY: "sekret" as string | undefined,
  CANONICAL_ORIGIN: "https://temio.example" as string | undefined,
};

vi.mock("@/lib/services/bot-check", () => ({ verifyHumanToken }));
vi.mock("astro:env/server", () => ({
  get TURNSTILE_SECRET_KEY() {
    return env.TURNSTILE_SECRET_KEY;
  },
  get CANONICAL_ORIGIN() {
    return env.CANONICAL_ORIGIN;
  },
}));

const { FOUNDER_PRICE_BODY_MAX_BYTES, POST } = await import("./founder-price");

const ADDRESS = "ania@przedszkole.pl";

const valid = {
  email: ADDRESS,
  period: "yearly",
  website: "",
  turnstileToken: "token",
};

type InsertResult = { error: null } | { error: { code: string; message: string } };

function call(
  body: unknown,
  options: {
    user?: { id: string; email?: string } | null;
    supabase?: boolean;
    insert?: InsertResult;
    url?: string;
    headers?: Record<string, string>;
  } = {},
) {
  const insert = vi.fn(() => Promise.resolve(options.insert ?? { error: null }));
  const from = vi.fn(() => ({ insert }));
  const context = {
    request: new Request(options.url ?? "https://example.test/api/founder-price", {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.7", ...options.headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    locals: {
      user: options.user ?? null,
      supabase: options.supabase === false ? null : { from },
    },
  };
  return { insert, from, response: POST(context as unknown as APIContext) as Promise<Response> };
}

async function answer(response: Promise<Response>): Promise<{ status: number; body: unknown }> {
  const resolved = await response;
  return { status: resolved.status, body: await resolved.json() };
}

let logged: MockInstance<typeof console.error>;

beforeEach(() => {
  logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
  env.TURNSTILE_SECRET_KEY = "sekret";
  env.CANONICAL_ORIGIN = "https://temio.example";
  verifyHumanToken.mockResolvedValue({ ok: true, testingKey: false });
});

afterEach(() => {
  vi.restoreAllMocks();
  verifyHumanToken.mockReset();
});

/** Every argument of every `console.error` call, as one string. */
function everythingLogged(): string {
  return JSON.stringify(logged.mock.calls);
}

describe("POST /api/founder-price — success", () => {
  it("checks the token for the founder_price action, stores the normalised address and answers ok", async () => {
    const { response, insert, from } = call({ ...valid, email: "  Ania@Przedszkole.PL ", period: "monthly" });

    expect(await answer(response)).toEqual({ status: 200, body: { ok: true } });
    expect(verifyHumanToken).toHaveBeenCalledWith("token", {
      secret: "sekret",
      action: "founder_price",
      remoteIp: "203.0.113.7",
      hostname: "example.test",
    });
    expect(from).toHaveBeenCalledWith("founder_price_signups");
    expect(insert).toHaveBeenCalledWith({ email: ADDRESS, user_id: null, period: "monthly" });
  });

  it("takes a signed-in teacher's address from her session, not from the body", async () => {
    const { response, insert } = call(
      { ...valid, email: "ktos-inny@example.test" },
      { user: { id: "u-1", email: "Nauczycielka@Przedszkole.pl" } },
    );

    expect(await answer(response)).toEqual({ status: 200, body: { ok: true } });
    expect(insert).toHaveBeenCalledWith({ email: "nauczycielka@przedszkole.pl", user_id: "u-1", period: "yearly" });
  });

  it("needs no address in the body for a signed-in teacher", async () => {
    const { response, insert } = call(
      { period: "yearly", website: "", turnstileToken: "token" },
      { user: { id: "u-1", email: "nauczycielka@przedszkole.pl" } },
    );

    expect(await answer(response)).toEqual({ status: 200, body: { ok: true } });
    expect(insert).toHaveBeenCalledOnce();
  });

  it("answers a repeat (a unique violation) with the same success, without the address in the log", async () => {
    const { response, insert } = call(valid, { insert: { error: { code: "23505", message: "duplicate key" } } });

    expect(await answer(response)).toEqual({ status: 200, body: { ok: true } });
    expect(insert).toHaveBeenCalledOnce();
    expect(logged).toHaveBeenCalledWith("founder_price.duplicate", { signedIn: false });
    expect(everythingLogged()).not.toContain(ADDRESS);
  });
});

describe("POST /api/founder-price — honeypot", () => {
  it("answers exactly like success and runs nothing else", async () => {
    const { response, insert } = call({ ...valid, website: "https://spam.example" });

    expect(await answer(response)).toEqual({ status: 200, body: { ok: true } });
    expect(verifyHumanToken).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledWith("founder_price.honeypot");
  });
});

describe("POST /api/founder-price — refusals before anything is stored", () => {
  it("answers validation_failed to a body that is not JSON", async () => {
    const { response, insert } = call("nie json");
    expect(await answer(response)).toEqual({ status: 400, body: { error: "validation_failed" } });
    expect(insert).not.toHaveBeenCalled();
  });

  it("answers validation_failed to an invalid payload, without asking Turnstile", async () => {
    const { response, insert } = call({ ...valid, period: "weekly" });
    expect(await answer(response)).toEqual({ status: 400, body: { error: "validation_failed" } });
    expect(verifyHumanToken).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("answers validation_failed to a visitor without a session who sent no address", async () => {
    const { response, insert } = call({ period: "yearly", website: "", turnstileToken: "token" });
    expect(await answer(response)).toEqual({ status: 400, body: { error: "validation_failed" } });
    expect(verifyHumanToken).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("answers config_missing without a Supabase client", async () => {
    const { response } = call(valid, { supabase: false });
    expect(await answer(response)).toEqual({ status: 503, body: { error: "config_missing" } });
    expect(verifyHumanToken).not.toHaveBeenCalled();
  });

  it("answers config_missing without a Turnstile secret", async () => {
    env.TURNSTILE_SECRET_KEY = undefined;
    const { response, insert } = call(valid);
    expect(await answer(response)).toEqual({ status: 503, body: { error: "config_missing" } });
    expect(verifyHumanToken).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it.each(["missing", "rejected"])(
    "answers bot_check_failed when the bot check is %s, and stores nothing",
    async (reason) => {
      verifyHumanToken.mockResolvedValue({ ok: false, reason });
      const { response, insert } = call(valid);

      expect(await answer(response)).toEqual({ status: 403, body: { error: "bot_check_failed" } });
      expect(insert).not.toHaveBeenCalled();
    },
  );

  it("answers bot_check_unavailable when the check cannot run, and stores nothing", async () => {
    verifyHumanToken.mockResolvedValue({ ok: false, reason: "unavailable" });
    const { response, insert } = call(valid);

    expect(await answer(response)).toEqual({ status: 503, body: { error: "bot_check_unavailable" } });
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("POST /api/founder-price — after the bot check", () => {
  it("answers save_failed when the insert fails for any other reason, without the address in the log", async () => {
    const { response } = call(valid, { insert: { error: { code: "42501", message: "denied" } } });

    expect(await answer(response)).toEqual({ status: 500, body: { error: "save_failed" } });
    expect(logged).toHaveBeenCalledWith("founder_price.save_failed", { code: "42501", message: "denied" });
    expect(everythingLogged()).not.toContain(ADDRESS);
  });
});

describe("POST /api/founder-price — request size", () => {
  it("refuses a declared body over the cap without reading it", async () => {
    const { response, insert } = call(valid, {
      headers: { "Content-Length": String(FOUNDER_PRICE_BODY_MAX_BYTES + 1) },
    });

    expect(await answer(response)).toEqual({ status: 413, body: { error: "validation_failed" } });
    expect(verifyHumanToken).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("refuses a body over the cap even when the size header understates it", async () => {
    const { response, insert } = call({ ...valid, turnstileToken: "x".repeat(FOUNDER_PRICE_BODY_MAX_BYTES) });

    expect(await answer(response)).toEqual({ status: 413, body: { error: "validation_failed" } });
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("POST /api/founder-price — Turnstile test keys", () => {
  it("warns when a test secret answers on the canonical host", async () => {
    verifyHumanToken.mockResolvedValue({ ok: true, testingKey: true });

    const { response } = call(valid, { url: "https://temio.example/api/founder-price" });

    expect(await answer(response)).toEqual({ status: 200, body: { ok: true } });
    expect(logged).toHaveBeenCalledWith("founder_price.bot_check_testing_key", { host: "temio.example" });
  });

  it("stays quiet about a test secret anywhere else", async () => {
    verifyHumanToken.mockResolvedValue({ ok: true, testingKey: true });

    await call(valid).response;

    expect(logged).not.toHaveBeenCalledWith("founder_price.bot_check_testing_key", expect.anything());
  });
});
