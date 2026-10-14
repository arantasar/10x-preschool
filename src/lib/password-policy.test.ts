import { describe, expect, it } from "vitest";
import { MIN_PASSWORD_LENGTH, validateNewPassword, validatePasswordChange } from "@/lib/password-policy";

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

describe("validatePasswordChange", () => {
  const CURRENT = "stare-haslo-1";
  const NEW = "nowe-haslo-2";

  it("accepts a filled current password and a valid, different new pair", () => {
    expect(validatePasswordChange(CURRENT, NEW, NEW)).toEqual({});
  });

  it("asks for every field when all three are empty", () => {
    expect(validatePasswordChange("", "", "")).toEqual({
      current: "Podaj obecne hasło",
      password: "Podaj nowe hasło",
      repeat: "Powtórz nowe hasło",
    });
  });

  it("asks for the current password alone when only it is missing", () => {
    expect(validatePasswordChange("", NEW, NEW)).toEqual({ current: "Podaj obecne hasło" });
  });

  it("asks for the new password when only it is missing", () => {
    expect(validatePasswordChange(CURRENT, "", NEW)).toEqual({ password: "Podaj nowe hasło" });
  });

  it("asks for the repetition when only it is missing", () => {
    expect(validatePasswordChange(CURRENT, NEW, "")).toEqual({ repeat: "Powtórz nowe hasło" });
  });

  it("rejects a new password shorter than the minimum", () => {
    const errors = validatePasswordChange(CURRENT, "abcdefg", "abcdefg");
    expect(errors.password).toContain("brakuje jeszcze: 1");
    expect(errors.current).toBeUndefined();
    expect(errors.repeat).toBeUndefined();
  });

  it("flags a mismatched repetition", () => {
    expect(validatePasswordChange(CURRENT, NEW, `${NEW}X`)).toEqual({ repeat: "Hasła nie są takie same" });
  });

  it("rejects a new password equal to the current one", () => {
    expect(validatePasswordChange(CURRENT, CURRENT, CURRENT)).toEqual({
      password: "Nowe hasło musi się różnić od obecnego",
    });
  });
});
