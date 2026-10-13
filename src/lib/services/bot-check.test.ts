import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SITEVERIFY_URL, verifyHumanToken } from "./bot-check";

const options = { secret: "sekret", action: "contact", remoteIp: "203.0.113.7", hostname: "temio.pl" };

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
    const fetchImpl = answering({ success: true, action: "contact", hostname: "temio.pl" });

    expect(await verifyHumanToken("token", { ...options, fetchImpl })).toEqual({ ok: true, testingKey: false });

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
    const fetchImpl = answering({ success: true, action: "founding-price", hostname: "temio.pl" });
    expect(await verifyHumanToken("token", { ...options, fetchImpl })).toEqual({ ok: false, reason: "rejected" });
  });

  it("accepts a testing-key result, which carries no action, but not a real result without one", async () => {
    const testing = answering({
      success: true,
      hostname: "example.com",
      metadata: { result_with_testing_key: true },
    });
    expect(await verifyHumanToken("token", { ...options, fetchImpl: testing })).toEqual({ ok: true, testingKey: true });

    const real = answering({ success: true, hostname: "temio.pl" });
    expect(await verifyHumanToken("token", { ...options, fetchImpl: real })).toEqual({ ok: false, reason: "rejected" });

    const testingOtherAction = answering({
      success: true,
      action: "founding-price",
      metadata: { result_with_testing_key: true },
    });
    expect(await verifyHumanToken("token", { ...options, fetchImpl: testingOtherAction })).toEqual({
      ok: false,
      reason: "rejected",
    });
  });

  it("rejects a token earned on another host, and checks nothing when no host is expected", async () => {
    const preview = answering({ success: true, action: "contact", hostname: "preview.workers.dev" });
    expect(await verifyHumanToken("token", { ...options, fetchImpl: preview })).toEqual({
      ok: false,
      reason: "rejected",
    });

    const anyHost = answering({ success: true, action: "contact", hostname: "preview.workers.dev" });
    expect(await verifyHumanToken("token", { ...options, hostname: undefined, fetchImpl: anyHost })).toEqual({
      ok: true,
      testingKey: false,
    });
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
