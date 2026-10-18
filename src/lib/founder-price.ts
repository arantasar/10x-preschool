import { z } from "zod";
import { PRIVACY_PATH } from "@/lib/legal";
import { SUPPORT_EMAIL } from "@/lib/support-contact";

/**
 * The founder-price sign-up's contract (S-22), shared by the route
 * (`POST /api/founder-price`) and the island
 * (`src/components/billing/FounderPriceForm.tsx`): the payload, the bot-check
 * action and the error vocabulary.
 *
 * The bounds and the normalised address mirror the check constraints on
 * `public.founder_price_signups`
 * (`supabase/migrations/20261019120000_founder_price_signups.sql`); change both
 * together, or the route will accept what the database refuses.
 */

export const FOUNDER_PRICE_EMAIL_MAX = 254;

/** The billing periods the pricing page's toggle offers, in the database's words. */
export const FOUNDER_PRICE_PERIODS = ["yearly", "monthly"] as const;

export type FounderPricePeriod = (typeof FOUNDER_PRICE_PERIODS)[number];

/** Turnstile's `action` for this form - the widget and `verifyHumanToken` must agree. */
export const FOUNDER_PRICE_BOT_ACTION = "founder_price";

export const founderPricePayloadSchema = z.object({
  // Lowercased before the database, which refuses anything else: one address,
  // one person.
  email: z.string().trim().toLowerCase().max(FOUNDER_PRICE_EMAIL_MAX).pipe(z.email()),
  period: z.enum(FOUNDER_PRICE_PERIODS),
  // The honeypot. The route reads it before this schema runs; it is here so the
  // shape of the payload is written down in one place.
  website: z.string().optional(),
  turnstileToken: z.string().optional(),
});

export type FounderPricePayload = z.infer<typeof founderPricePayloadSchema>;

/** What `POST /api/founder-price` answers with instead of a sentence. */
export type FounderPriceErrorCode =
  | "validation_failed"
  | "signed_in"
  | "bot_check_failed"
  | "bot_check_unavailable"
  | "config_missing"
  | "save_failed";

const MESSAGES: Record<FounderPriceErrorCode, string> = {
  validation_failed: "Sprawdź adres e-mail — wygląda na niepełny.",
  // The page shows a signed-in teacher no form; this reaches only a session
  // that started in another tab after the page loaded.
  signed_in: "Twoje konto ma już cenę założycielską — zapis nie jest potrzebny. Odśwież stronę.",
  bot_check_failed: "Nie udało się potwierdzić, że nie jesteś automatem. Spróbuj zapisać się jeszcze raz.",
  bot_check_unavailable: "Nie udało się sprawdzić formularza. Spróbuj ponownie za chwilę.",
  config_missing: `Zapis jest chwilowo niedostępny. Napisz do nas: ${SUPPORT_EMAIL}.`,
  save_failed: "Nie udało się zapisać adresu. Spróbuj ponownie za chwilę.",
};

const FALLBACK = "Nie udało się wysłać zapisu. Spróbuj ponownie za chwilę.";

/**
 * Shown by the island, not the route, when Turnstile cannot run in this browser
 * at all (the script is blocked or fails to load): retrying would never
 * succeed, so it names the mailbox instead.
 */
export const FOUNDER_PRICE_WIDGET_FAILED_MESSAGE = `Nie udało się wczytać zabezpieczenia formularza (np. przez blokadę treści w przeglądarce). Napisz do nas, a dopiszemy Cię do listy: ${SUPPORT_EMAIL}.`;

/**
 * The Polish sentence for a code from the route. An unknown code falls back to
 * a generic message, so nothing but our own wording can reach the error box.
 */
export function founderPriceErrorMessage(code: string): string {
  return Object.hasOwn(MESSAGES, code) ? MESSAGES[code as FounderPriceErrorCode] : FALLBACK;
}

/**
 * The privacy-policy point the consent sentence links to (pkt 2.8). The anchor
 * is the slug Astro gives the heading „2.8. Zapis na cenę założycielską”.
 */
export const FOUNDER_PRICE_PRIVACY_HREF = `${PRIVACY_PATH}#28-zapis-na-cenę-założycielską`;

/** Said once the address is on the list. */
export const FOUNDER_PRICE_LISTED_NOTE =
  "Płatności jeszcze nie działają, więc nic dziś nie płacisz. Napiszemy, gdy ruszą — cena założycielska będzie na Ciebie czekać.";
