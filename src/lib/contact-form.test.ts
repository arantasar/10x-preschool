import { describe, expect, it } from "vitest";

import { SUPPORT_EMAIL } from "./support-contact";

import {
  CONTACT_MESSAGE_MAX,
  CONTACT_NAME_MAX,
  CONTACT_TOPICS,
  CONTACT_WIDGET_FAILED_MESSAGE,
  contactErrorMessage,
  contactPayloadSchema,
  topicLabel,
} from "./contact-form";

const valid = { email: "nauczycielka@przedszkole.pl", topic: "question", message: "Jak wydrukować miesiąc?" };

describe("contactPayloadSchema", () => {
  it("accepts a minimal message and trims its strings", () => {
    const parsed = contactPayloadSchema.parse({ ...valid, email: "  a@b.pl ", message: "  Dziesięć znaków.  " });
    expect(parsed.email).toBe("a@b.pl");
    expect(parsed.message).toBe("Dziesięć znaków.");
    expect(parsed.name).toBeUndefined();
  });

  it("treats an empty name as no name", () => {
    expect(contactPayloadSchema.parse({ ...valid, name: "   " }).name).toBeUndefined();
    expect(contactPayloadSchema.parse({ ...valid, name: " Ola " }).name).toBe("Ola");
  });

  it("refuses a message under 10 characters after trimming", () => {
    expect(contactPayloadSchema.safeParse({ ...valid, message: "   krótka  " }).success).toBe(false);
  });

  it("matches the database bounds exactly", () => {
    expect(contactPayloadSchema.safeParse({ ...valid, message: "x".repeat(CONTACT_MESSAGE_MAX) }).success).toBe(true);
    expect(contactPayloadSchema.safeParse({ ...valid, message: "x".repeat(CONTACT_MESSAGE_MAX + 1) }).success).toBe(
      false,
    );
    expect(contactPayloadSchema.safeParse({ ...valid, name: "x".repeat(CONTACT_NAME_MAX) }).success).toBe(true);
    expect(contactPayloadSchema.safeParse({ ...valid, name: "x".repeat(CONTACT_NAME_MAX + 1) }).success).toBe(false);
  });

  it("refuses an unknown topic and a malformed address", () => {
    expect(contactPayloadSchema.safeParse({ ...valid, topic: "payments" }).success).toBe(false);
    expect(contactPayloadSchema.safeParse({ ...valid, email: "nie-adres" }).success).toBe(false);
  });

  it("offers exactly the topics the database accepts", () => {
    expect(CONTACT_TOPICS.map((topic) => topic.value)).toEqual(["question", "bug", "idea", "account", "other"]);
    expect(topicLabel("bug")).toBe("Zgłoszenie błędu");
  });
});

describe("contactErrorMessage", () => {
  it("translates every code the route mints", () => {
    for (const code of [
      "validation_failed",
      "bot_check_failed",
      "bot_check_unavailable",
      "config_missing",
      "save_failed",
    ]) {
      expect(contactErrorMessage(code)).not.toBe(contactErrorMessage("unknown"));
    }
  });

  it("falls back to a generic sentence for anything else, including prototype keys", () => {
    expect(contactErrorMessage("<b>dowolne zdanie</b>")).toBe(contactErrorMessage("unknown"));
    expect(contactErrorMessage("toString")).toBe(contactErrorMessage("unknown"));
  });
});

describe("CONTACT_WIDGET_FAILED_MESSAGE", () => {
  it("points to the mailbox, since the form cannot succeed without its bot check", () => {
    expect(CONTACT_WIDGET_FAILED_MESSAGE).toContain(SUPPORT_EMAIL);
  });
});
