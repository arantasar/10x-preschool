import { describe, expect, it } from "vitest";

import { invalidConfirmRedirect } from "./auth-confirm";

// Pure function, nothing mocked.

describe("invalidConfirmRedirect", () => {
  it("sends a broken activation link to sign-in with the activation code", () => {
    expect(invalidConfirmRedirect("email")).toBe("/auth/signin?error=signup_link_invalid");
  });

  it.each(["recovery", "signup", "magiclink", "", null, undefined])(
    "sends type=%s to the forgot-password page as an invalid reset link",
    (type) => {
      expect(invalidConfirmRedirect(type)).toBe("/auth/forgot-password?error=reset_link_invalid");
    },
  );
});
