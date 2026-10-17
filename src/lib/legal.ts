/**
 * Versions and dates of the two legal documents (S-20, FR-025), and where they
 * live. The pages (`/regulamin`, `/polityka-prywatnosci`) print these in their
 * header, and the sign-up route records `TERMS_VERSION` with the account - so a
 * new version of the terms is a change to this file and to the Markdown in
 * `src/content/legal/`, nothing else.
 *
 * The texts themselves carry no dates: they refer to the date in the page
 * header, so there is one source for each value.
 */

export const TERMS_PATH = "/regulamin";
export const PRIVACY_PATH = "/polityka-prywatnosci";

export const TERMS_VERSION = "1.0";
/** What the sign-up checkbox sends as `terms`; the route accepts nothing else. */
export const TERMS_ACCEPTED_VALUE = "accepted";
/** Day of publication (ISO `YYYY-MM-DD`): binds accounts created from this day on. */
export const TERMS_PUBLISHED_ON = "2026-10-17";

export const PRIVACY_VERSION = "1.2";
export const PRIVACY_PUBLISHED_ON = "2026-10-17";

/**
 * Notice period for accounts that existed before a version was published: the
 * e-mail goes out on the day of publication, the terms bind them this many days
 * later (Regulamin § 13 ust. 2, § 14 ust. 5).
 */
export const EXISTING_ACCOUNTS_NOTICE_DAYS = 14;

/** Adds whole days to an ISO date, in UTC, so no time zone can shift the day. */
export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Shown under both generation forms (week and day). Regulamin § 6 ust. 1 says
 * the Serwis marks proposals as written by AI - this sentence is that marking.
 * Information, not a link-out: the teacher needs the fact, not the document.
 */
export const AI_PROPOSALS_NOTICE = "Propozycje przygotowuje sztuczna inteligencja. Sprawdź je przed zajęciami.";

/** Day from which the terms bind accounts created before `TERMS_PUBLISHED_ON`. */
export const TERMS_BINDS_EXISTING_ON = addDays(TERMS_PUBLISHED_ON, EXISTING_ACCOUNTS_NOTICE_DAYS);

// Genitive, as the month reads after a day number. Spelled out rather than taken
// from `Intl`, whose Polish output depends on the runtime's ICU data.
const MONTHS_GENITIVE = [
  "stycznia",
  "lutego",
  "marca",
  "kwietnia",
  "maja",
  "czerwca",
  "lipca",
  "sierpnia",
  "września",
  "października",
  "listopada",
  "grudnia",
] as const;

/** `2026-10-17` → „17 października 2026”. */
export function formatLegalDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return `${String(day)} ${MONTHS_GENITIVE[month - 1]} ${String(year)}`;
}
