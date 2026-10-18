import { describe, expect, it } from "vitest";

import { SUPPORT_EMAIL } from "./support-contact";

import {
  FOUNDER_PRICE_EMAIL_MAX,
  FOUNDER_PRICE_WIDGET_FAILED_MESSAGE,
  founderPriceErrorMessage,
  founderPricePayloadSchema,
} from "./founder-price";

describe("founderPricePayloadSchema", () => {
  it("normalises the address the way the database demands: trimmed and lowercase", () => {
    const parsed = founderPricePayloadSchema.parse({ email: "  Test+Ania@Example.COM ", period: "yearly" });
    expect(parsed.email).toBe("test+ania@example.com");
  });

  it("accepts a payload without an address - the route decides whether it needs one", () => {
    expect(founderPricePayloadSchema.parse({ period: "monthly" }).email).toBeUndefined();
  });

  it("accepts only the two billing periods the toggle offers", () => {
    expect(founderPricePayloadSchema.safeParse({ period: "yearly" }).success).toBe(true);
    expect(founderPricePayloadSchema.safeParse({ period: "monthly" }).success).toBe(true);
    expect(founderPricePayloadSchema.safeParse({ period: "weekly" }).success).toBe(false);
    expect(founderPricePayloadSchema.safeParse({}).success).toBe(false);
  });

  it("refuses a malformed address and one over the database bound", () => {
    expect(founderPricePayloadSchema.safeParse({ email: "nie-adres", period: "yearly" }).success).toBe(false);
    const long = `${"x".repeat(FOUNDER_PRICE_EMAIL_MAX - "@example.test".length + 1)}@example.test`;
    expect(founderPricePayloadSchema.safeParse({ email: long, period: "yearly" }).success).toBe(false);
  });
});

describe("founderPriceErrorMessage", () => {
  it("translates every code the route answers with", () => {
    for (const code of ["validation_failed", "bot_check_failed", "bot_check_unavailable", "save_failed"]) {
      expect(founderPriceErrorMessage(code)).not.toBe(founderPriceErrorMessage("unknown"));
    }
    expect(founderPriceErrorMessage("config_missing")).toContain(SUPPORT_EMAIL);
  });

  it("falls back to our own sentence for anything else", () => {
    expect(founderPriceErrorMessage("<b>dowolny tekst</b>")).toBe(founderPriceErrorMessage("toString"));
    expect(founderPriceErrorMessage("toString")).toMatch(/^Nie udało się wysłać zapisu/);
  });

  it("names the mailbox when the widget cannot run", () => {
    expect(FOUNDER_PRICE_WIDGET_FAILED_MESSAGE).toContain(SUPPORT_EMAIL);
  });
});
