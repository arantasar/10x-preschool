import { z } from "zod";
import { SUPPORT_EMAIL } from "@/lib/support-contact";

/**
 * The contact form's contract (S-19), shared by the route (`POST /api/contact`)
 * and the island (`src/components/contact/ContactForm.tsx`): the payload, the
 * topics with their Polish labels, and the error vocabulary.
 *
 * The bounds mirror the check constraints on `public.contact_messages`
 * (`supabase/migrations/20261009120000_contact_messages.sql`); change both
 * together, or the route will accept what the database refuses.
 */

export const CONTACT_NAME_MAX = 100;
export const CONTACT_EMAIL_MAX = 254;
export const CONTACT_MESSAGE_MIN = 10;
export const CONTACT_MESSAGE_MAX = 5000;

/** In the order the select shows them. „Płatności i faktury” arrives with payments. */
export const CONTACT_TOPICS = [
  { value: "question", label: "Pytanie o działanie" },
  { value: "bug", label: "Zgłoszenie błędu" },
  { value: "idea", label: "Pomysł na funkcję" },
  { value: "account", label: "Konto i logowanie" },
  { value: "other", label: "Inne" },
] as const;

export type ContactTopic = (typeof CONTACT_TOPICS)[number]["value"];

const topicValues = CONTACT_TOPICS.map((topic) => topic.value) as [ContactTopic, ...ContactTopic[]];

export function topicLabel(topic: ContactTopic): string {
  return CONTACT_TOPICS.find((entry) => entry.value === topic)?.label ?? topic;
}

export const contactPayloadSchema = z.object({
  // Optional: an empty field is the same as no name.
  name: z
    .string()
    .trim()
    .max(CONTACT_NAME_MAX)
    .optional()
    .transform((value) => (value === "" ? undefined : value)),
  email: z.string().trim().max(CONTACT_EMAIL_MAX).pipe(z.email()),
  topic: z.enum(topicValues),
  message: z.string().trim().min(CONTACT_MESSAGE_MIN).max(CONTACT_MESSAGE_MAX),
  // The honeypot. The route reads it before this schema runs; it is here so the
  // shape of the payload is written down in one place.
  website: z.string().optional(),
  turnstileToken: z.string().optional(),
});

export type ContactPayload = z.infer<typeof contactPayloadSchema>;

/** What `POST /api/contact` answers with instead of a sentence. */
export type ContactErrorCode =
  | "validation_failed"
  | "bot_check_failed"
  | "bot_check_unavailable"
  | "config_missing"
  | "save_failed";

const MESSAGES: Record<ContactErrorCode, string> = {
  validation_failed: "Sprawdź pola formularza — coś jest niepełne albo za długie.",
  bot_check_failed: "Nie udało się potwierdzić, że nie jesteś automatem. Spróbuj wysłać jeszcze raz.",
  bot_check_unavailable: "Nie udało się sprawdzić formularza. Spróbuj ponownie za chwilę.",
  config_missing: "Formularz jest chwilowo niedostępny. Napisz do nas e-mailem.",
  save_failed: "Nie udało się zapisać wiadomości. Spróbuj ponownie za chwilę.",
};

const FALLBACK = "Nie udało się wysłać wiadomości. Spróbuj ponownie za chwilę.";

/**
 * Shown by the island, not the route, when Turnstile cannot run in this browser
 * at all (the script is blocked or fails to load): retrying the form would
 * never succeed, so it names the mailbox instead.
 */
export const CONTACT_WIDGET_FAILED_MESSAGE = `Nie udało się wczytać zabezpieczenia formularza (np. przez blokadę treści w przeglądarce). Napisz do nas e-mailem: ${SUPPORT_EMAIL}.`;

/**
 * The Polish sentence for a code from the route. An unknown code falls back to
 * a generic message, so nothing but our own wording can reach the error box.
 */
export function contactErrorMessage(code: string): string {
  return Object.hasOwn(MESSAGES, code) ? MESSAGES[code as ContactErrorCode] : FALLBACK;
}
