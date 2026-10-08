import { describe, expect, it } from "vitest";

import {
  AUTH_ERROR_MESSAGES,
  GENERIC_AUTH_ERROR_MESSAGE,
  authErrorMessage,
  isSilentResetRequestError,
} from "./auth-error-messages";

// Nothing is mocked here: the module is pure and imports nothing. Per
// `test-plan.md` §6.1 that is exactly the layer an error mapping belongs to.

const MAPPED_CODES = Object.keys(AUTH_ERROR_MESSAGES);

// Words that would betray an untranslated Supabase message leaking through.
// The guard is on the class of failure, not on one string: any English wording
// that slips into the table trips it, whichever entry it lands in.
const ENGLISH_STOP_WORDS = ["invalid", "password", "credentials", "email", "user", "failed"];

describe("authErrorMessage", () => {
  // The distinguishing case. Without it every assertion in this file would pass
  // against a function that returns the fallback unconditionally — delete one
  // entry from the map and this block, and only this block, goes red.
  it.each(MAPPED_CODES)("translates %s to its own Polish message", (code) => {
    const message = authErrorMessage(code);

    expect(message).toBe(AUTH_ERROR_MESSAGES[code]);
    expect(message.length).toBeGreaterThan(0);
    expect(message).not.toBe(GENERIC_AUTH_ERROR_MESSAGE);
  });

  it("covers the twenty-four codes the three auth flows can reach", () => {
    expect(MAPPED_CODES).toHaveLength(24);
  });

  it.each(["signup_link_invalid", "signup_link_expired", "email_address_not_authorized"])(
    "maps the sign-up confirmation code %s",
    (code) => {
      expect(Object.hasOwn(AUTH_ERROR_MESSAGES, code)).toBe(true);
      expect(authErrorMessage(code)).not.toBe(GENERIC_AUTH_ERROR_MESSAGE);
    },
  );

  // The activation link's failure lands on sign-in, so its message must not be
  // the reset wording that `otp_expired` carries.
  it("words an expired activation link differently from an expired reset link", () => {
    expect(authErrorMessage("signup_link_expired")).not.toBe(authErrorMessage("otp_expired"));
    expect(authErrorMessage("signup_link_expired")).toContain("aktywacyjny");
  });

  it.each([
    "otp_expired",
    "same_password",
    "session_not_found",
    "reauthentication_needed",
    "reset_session_missing",
    "reset_link_invalid",
  ])("maps the password-reset code %s", (code) => {
    expect(Object.hasOwn(AUTH_ERROR_MESSAGES, code)).toBe(true);
    expect(authErrorMessage(code)).not.toBe(GENERIC_AUTH_ERROR_MESSAGE);
  });

  it("falls back for a real Supabase code from a flow we did not map", () => {
    expect(authErrorMessage("mfa_challenge_expired")).toBe(GENERIC_AUTH_ERROR_MESSAGE);
  });

  it("falls back for undefined", () => {
    expect(authErrorMessage(undefined)).toBe(GENERIC_AUTH_ERROR_MESSAGE);
  });

  it("falls back for null, which is what searchParams.get() returns", () => {
    expect(authErrorMessage(null)).toBe(GENERIC_AUTH_ERROR_MESSAGE);
  });

  it("falls back for an empty string", () => {
    expect(authErrorMessage("")).toBe(GENERIC_AUTH_ERROR_MESSAGE);
  });

  // Regression test for the injection hole this change closes: before the code
  // contract, `?error=<sentence>` rendered the sentence inside our own error box,
  // styled as our own message. A ready-made phishing carrier.
  it("does not render an injected sentence — the phishing regression", () => {
    const injected = "Twoje konto wygasło - zadzwoń pod 500600700";

    expect(authErrorMessage(injected)).toBe(GENERIC_AUTH_ERROR_MESSAGE);
    expect(authErrorMessage(injected)).not.toContain("500600700");
  });

  // A bare `AUTH_ERROR_MESSAGES[code]` would answer this one with a function.
  it.each(["constructor", "__proto__", "toString"])("falls back for the prototype key %s", (key) => {
    expect(authErrorMessage(key)).toBe(GENERIC_AUTH_ERROR_MESSAGE);
  });
});

describe("the Polish copy contract", () => {
  it.each([
    ...MAPPED_CODES.map((code) => [code, AUTH_ERROR_MESSAGES[code]]),
    ["<fallback>", GENERIC_AUTH_ERROR_MESSAGE],
  ])("%s carries no English", (_code, message) => {
    for (const word of ENGLISH_STOP_WORDS) {
      expect(message).not.toMatch(new RegExp(`\\b${word}\\b`, "i"));
    }
  });
});

describe("isSilentResetRequestError", () => {
  // Both of these can only happen for an address that has an account, so
  // showing them would be an account-enumeration oracle.
  it.each(["over_email_send_rate_limit", "user_not_found"])("swallows %s", (code) => {
    expect(isSilentResetRequestError(code)).toBe(true);
  });

  // Address-independent failures: the teacher needs to see these.
  it.each([
    "over_request_rate_limit",
    "validation_failed",
    "email_address_invalid",
    "connection_failed",
    "config_missing",
  ])("shows %s", (code) => {
    expect(isSilentResetRequestError(code)).toBe(false);
  });

  it("shows a missing code", () => {
    expect(isSilentResetRequestError(undefined)).toBe(false);
  });
});
