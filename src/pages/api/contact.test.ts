import type { APIContext } from "astro";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The three seams the route reaches beyond `locals`: the bot check (network),
// the mail binding (`cloudflare:workers`, which Vitest cannot resolve) and the
// runtime configuration. Everything else is the route's own logic.
const verifyHumanToken = vi.fn();
const getEmailBinding = vi.fn();
const env = {
  TURNSTILE_SECRET_KEY: "sekret" as string | undefined,
  CONTACT_TO: "w@example.test" as string | undefined,
};

vi.mock("@/lib/services/bot-check", () => ({ verifyHumanToken }));
vi.mock("@/lib/services/email-binding", () => ({ getEmailBinding }));
vi.mock("astro:env/server", () => ({
  get TURNSTILE_SECRET_KEY() {
    return env.TURNSTILE_SECRET_KEY;
  },
  get CONTACT_TO() {
    return env.CONTACT_TO;
  },
}));

const { POST } = await import("./contact");

const valid = {
  name: "Ola",
  email: "ola@przedszkole.pl",
  topic: "question",
  message: "Jak wydrukować cały miesiąc?",
  website: "",
  turnstileToken: "token",
};

type InsertResult = { error: null } | { error: { code: string; message: string } };

function call(
  body: unknown,
  options: { user?: { id: string } | null; supabase?: boolean; insert?: InsertResult } = {},
) {
  const insert = vi.fn(() => Promise.resolve(options.insert ?? { error: null }));
  const from = vi.fn(() => ({ insert }));
  const context = {
    request: new Request("https://example.test/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.7" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    locals: { user: options.user ?? null, supabase: options.supabase === false ? null : { from } },
  };
  return { insert, from, response: POST(context as unknown as APIContext) as Promise<Response> };
}

async function answer(response: Promise<Response>): Promise<{ status: number; body: unknown }> {
  const resolved = await response;
  return { status: resolved.status, body: await resolved.json() };
}

let send: ReturnType<typeof vi.fn>;
let logged: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
  env.TURNSTILE_SECRET_KEY = "sekret";
  env.CONTACT_TO = "w@example.test";
  verifyHumanToken.mockResolvedValue({ ok: true });
  send = vi.fn(() => Promise.resolve({ messageId: "m" }));
  getEmailBinding.mockReturnValue({ send });
});

afterEach(() => {
  vi.restoreAllMocks();
  verifyHumanToken.mockReset();
  getEmailBinding.mockReset();
});

describe("POST /api/contact — success", () => {
  it("checks the token for the contact action, stores the message, mails the owner and answers ok", async () => {
    const { response, insert, from } = call(valid);

    expect(await answer(response)).toEqual({ status: 200, body: { ok: true } });
    expect(verifyHumanToken).toHaveBeenCalledWith("token", {
      secret: "sekret",
      action: "contact",
      remoteIp: "203.0.113.7",
    });
    expect(from).toHaveBeenCalledWith("contact_messages");
    expect(insert).toHaveBeenCalledWith({
      user_id: null,
      name: "Ola",
      email: "ola@przedszkole.pl",
      topic: "question",
      message: "Jak wydrukować cały miesiąc?",
    });
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0]).toMatchObject({ to: "w@example.test", replyTo: "ola@przedszkole.pl" });
  });

  it("attributes the message to a signed-in sender", async () => {
    const { response, insert } = call(valid, { user: { id: "u-1" } });

    await response;
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "u-1" }));
    expect(send.mock.calls[0][0]).toMatchObject({ text: expect.stringContaining("Zalogowany: tak") as unknown });
  });
});

describe("POST /api/contact — honeypot", () => {
  it("answers exactly like success and runs nothing else", async () => {
    const { response, insert } = call({ ...valid, website: "https://spam.example" });

    expect(await answer(response)).toEqual({ status: 200, body: { ok: true } });
    expect(verifyHumanToken).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});

describe("POST /api/contact — refusals before anything is stored", () => {
  it("answers validation_failed to a body that is not JSON", async () => {
    const { response, insert } = call("nie json");
    expect(await answer(response)).toEqual({ status: 400, body: { error: "validation_failed" } });
    expect(insert).not.toHaveBeenCalled();
  });

  it("answers validation_failed to an invalid payload, without asking Turnstile", async () => {
    const { response, insert } = call({ ...valid, message: "krótka" });
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
      expect(send).not.toHaveBeenCalled();
    },
  );

  it("answers bot_check_unavailable when the check cannot run, and stores nothing", async () => {
    verifyHumanToken.mockResolvedValue({ ok: false, reason: "unavailable" });
    const { response, insert } = call(valid);

    expect(await answer(response)).toEqual({ status: 503, body: { error: "bot_check_unavailable" } });
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("POST /api/contact — after the bot check", () => {
  it("answers save_failed when the insert fails, and never mails", async () => {
    const { response } = call(valid, { insert: { error: { code: "42501", message: "denied" } } });

    expect(await answer(response)).toEqual({ status: 500, body: { error: "save_failed" } });
    expect(send).not.toHaveBeenCalled();
  });

  it("still answers ok when the mail fails after the message was stored", async () => {
    send.mockRejectedValue(new Error("E_DELIVERY_FAILED"));
    const { response, insert } = call(valid);

    expect(await answer(response)).toEqual({ status: 200, body: { ok: true } });
    expect(insert).toHaveBeenCalledOnce();
    expect(logged).toHaveBeenCalledWith("contact.mail_failed", { message: "E_DELIVERY_FAILED" });
  });

  it("stores and answers ok without mailing when the recipient or the binding is missing", async () => {
    env.CONTACT_TO = undefined;
    const first = call(valid);
    expect(await answer(first.response)).toEqual({ status: 200, body: { ok: true } });
    expect(first.insert).toHaveBeenCalledOnce();

    env.CONTACT_TO = "w@example.test";
    getEmailBinding.mockReturnValue(undefined);
    const second = call(valid);
    expect(await answer(second.response)).toEqual({ status: 200, body: { ok: true } });
    expect(second.insert).toHaveBeenCalledOnce();

    expect(send).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledWith("contact.mail_skipped", expect.anything());
  });
});
