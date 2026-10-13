import { topicLabel, type ContactTopic } from "@/lib/contact-form";
import type { EmailSender, OutgoingEmail } from "@/lib/services/email-binding";

/**
 * Turns a stored contact message into the owner's notification e-mail.
 *
 * Plain text only, on purpose: the content comes from anyone on the internet,
 * and without an `html` part nothing in it can ever be interpreted as markup in
 * the owner's mail client. Reply-To is the visitor, so "Odpowiedz" answers them.
 */

/** The binding's only allowed sender (`allowed_sender_addresses` in `wrangler.jsonc`). */
export const CONTACT_FROM = { email: "formularz@temio.pl", name: "Temio — formularz" } as const;

const SUBJECT_PREVIEW = 60;

export interface ContactMailInput {
  name?: string;
  email: string;
  topic: ContactTopic;
  message: string;
  signedIn: boolean;
}

export function buildContactMail(msg: ContactMailInput, to: string): OutgoingEmail {
  const oneLine = msg.message.replace(/\s+/g, " ").trim();
  const preview = oneLine.length > SUBJECT_PREVIEW ? `${oneLine.slice(0, SUBJECT_PREVIEW)}…` : oneLine;

  const text = [
    `Imię: ${msg.name ?? "—"}`,
    `E-mail: ${msg.email}`,
    `Temat: ${topicLabel(msg.topic)}`,
    `Zalogowany: ${msg.signedIn ? "tak" : "nie"}`,
    "",
    msg.message,
  ].join("\n");

  return {
    to,
    from: { ...CONTACT_FROM },
    replyTo: msg.email,
    subject: `Temio · ${topicLabel(msg.topic)} · ${preview}`,
    text,
  };
}

export async function sendContactMail(binding: EmailSender, msg: ContactMailInput, to: string): Promise<void> {
  await binding.send(buildContactMail(msg, to));
}
