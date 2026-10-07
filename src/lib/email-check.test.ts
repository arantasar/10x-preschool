import { describe, expect, it } from "vitest";

import { emailError } from "./email-check";

describe("emailError", () => {
  it("asks for an address when the field is empty or blank", () => {
    expect(emailError("")).toBe("Podaj adres e-mail");
    expect(emailError("   ")).toBe("Podaj adres e-mail");
  });

  it.each(["nauczyciel", "nauczyciel@", "nauczyciel@przedszkole", "na uczyciel@przedszkole.pl"])(
    "rejects %s as malformed",
    (email) => {
      expect(emailError(email)).toBe("Podaj poprawny adres e-mail");
    },
  );

  it("accepts a well-formed address", () => {
    expect(emailError("nauczyciel@przedszkole.pl")).toBeUndefined();
  });
});
