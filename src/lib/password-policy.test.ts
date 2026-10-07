import { describe, expect, it } from "vitest";
import { MIN_PASSWORD_LENGTH, validateNewPassword } from "@/lib/password-policy";

describe("validateNewPassword", () => {
  it("sets the minimum at 8", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
  });

  it("asks for both fields when both are empty", () => {
    expect(validateNewPassword("", "")).toEqual({ password: "Podaj nowe hasło", repeat: "Powtórz nowe hasło" });
  });

  it("rejects 7 characters and names the minimum and what is missing", () => {
    const errors = validateNewPassword("abcdefg", "abcdefg");
    expect(errors.password).toContain("8");
    expect(errors.password).toContain("brakuje jeszcze: 1");
    expect(errors.repeat).toBeUndefined();
  });

  it("accepts exactly 8 matching characters", () => {
    expect(validateNewPassword("abcdefgh", "abcdefgh")).toEqual({});
  });

  it("flags a mismatch on the repeat field", () => {
    expect(validateNewPassword("abcdefgh", "abcdefgX")).toEqual({ repeat: "Hasła nie są takie same" });
  });

  it("does not report a mismatch while the first field is still empty", () => {
    expect(validateNewPassword("", "abcdefgh")).toEqual({ password: "Podaj nowe hasło" });
  });
});
