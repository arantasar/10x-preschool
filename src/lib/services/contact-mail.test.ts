import { describe, expect, it, vi } from "vitest";

import { buildContactMail, CONTACT_FROM, sendContactMail } from "./contact-mail";

const base = {
  email: "ola@przedszkole.pl",
  topic: "bug" as const,
  message: "Nie drukuje się miesiąc.",
  signedIn: true,
};

describe("buildContactMail", () => {
  it("addresses the owner from the form's sender and lets a reply reach the visitor", () => {
    const mail = buildContactMail(base, "wlasciciel@example.test");

    expect(mail.to).toBe("wlasciciel@example.test");
    expect(mail.from).toEqual(CONTACT_FROM);
    expect(mail.replyTo).toBe("ola@przedszkole.pl");
    expect(mail.subject).toBe("Temio · Zgłoszenie błędu · Nie drukuje się miesiąc.");
  });

  it("collapses newlines and truncates the subject preview to 60 characters", () => {
    const message = `Pierwsza linia\n\ndruga linia   ${"x".repeat(80)}`;
    const subject = buildContactMail({ ...base, message }, "w@example.test").subject;

    expect(subject).not.toMatch(/\n/);
    const preview = subject.split(" · ")[2];
    expect(preview).toBe(`${message.replace(/\s+/g, " ").slice(0, 60)}…`);
  });

  it("lists the sender's details and keeps the message verbatim, as plain text only", () => {
    const message = "<script>alert(1)</script>\nDruga linia";
    const mail = buildContactMail({ ...base, name: "Ola", message, signedIn: false }, "w@example.test");

    expect(mail.text).toContain("Imię: Ola");
    expect(mail.text).toContain("E-mail: ola@przedszkole.pl");
    expect(mail.text).toContain("Temat: Zgłoszenie błędu");
    expect(mail.text).toContain("Zalogowany: nie");
    expect(mail.text.endsWith(message)).toBe(true);
    expect(mail).not.toHaveProperty("html");
  });

  it("marks a missing name with a dash", () => {
    expect(buildContactMail(base, "w@example.test").text).toContain("Imię: —");
  });
});

describe("sendContactMail", () => {
  it("hands the built mail to the binding", async () => {
    const send = vi.fn(() => Promise.resolve({ messageId: "x" }));
    await sendContactMail({ send }, base, "w@example.test");
    expect(send).toHaveBeenCalledWith(buildContactMail(base, "w@example.test"));
  });
});
