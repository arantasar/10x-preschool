import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SITEVERIFY_URL, verifyHumanToken } from "./bot-check";

const options = { secret: "sekret", action: "contact", remoteIp: "203.0.113.7" };

function answering(body: unknown, status = 200) {
  return vi.fn<typeof fetch>(() => Promise.resolve(new Response(JSON.stringify(body), { status })));
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("verifyHumanToken", () => {
  it("passes a token Turnstile accepts for the same action, sending secret, token and IP", async () => {
    const fetchImpl = answering({ success: true, action: "contact" });

    expect(await verifyHumanToken("token", { ...options, fetchImpl })).toEqual({ ok: true });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(SITEVERIFY_URL);
    const sent = init?.body as FormData;
    expect(sent.get("secret")).toBe("sekret");
    expect(sent.get("response")).toBe("token");
    expect(sent.get("remoteip")).toBe("203.0.113.7");
  });

  it("rejects a token Turnstile refuses", async () => {
    const fetchImpl = answering({ success: false, "error-codes": ["invalid-input-response"] });
    expect(await verifyHumanToken("token", { ...options, fetchImpl })).toEqual({ ok: false, reason: "rejected" });
  });

  it("rejects a valid token earned on another surface", async () => {
    const fetchImpl = answering({ success: true, action: "founding-price" });
    expect(await verifyHumanToken("token", { ...options, fetchImpl })).toEqual({ ok: false, reason: "rejected" });
  });

  it("is unavailable when siteverify answers with an error status", async () => {
    const fetchImpl = answering({}, 500);
    expect(await verifyHumanToken("token", { ...options, fetchImpl })).toEqual({ ok: false, reason: "unavailable" });
  });

  it("is unavailable on a network error", async () => {
    const fetchImpl = vi.fn<typeof fetch>(() => Promise.reject(new TypeError("fetch failed")));
    expect(await verifyHumanToken("token", { ...options, fetchImpl })).toEqual({ ok: false, reason: "unavailable" });
  });

  it("is unavailable on a timeout, and bounds the call with an abort signal", async () => {
    const fetchImpl = vi.fn<typeof fetch>((_url, init) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return Promise.reject(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
    });
    expect(await verifyHumanToken("token", { ...options, fetchImpl })).toEqual({ ok: false, reason: "unavailable" });
  });

  it("calls nothing for a missing token", async () => {
    const fetchImpl = answering({ success: true, action: "contact" });

    expect(await verifyHumanToken("", { ...options, fetchImpl })).toEqual({ ok: false, reason: "missing" });
    expect(await verifyHumanToken(undefined, { ...options, fetchImpl })).toEqual({ ok: false, reason: "missing" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
