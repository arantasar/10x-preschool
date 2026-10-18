/**
 * Every price, date and comparison row `/cennik` prints (S-22, FR-028), in one
 * place, so the page's wording points here instead of repeating numbers and
 * `pricing.test.ts` can check that no sentence false today slips in.
 *
 * The rule for this file (PRD v3 §Business Logic): every row must be true on
 * the day the page goes live. Today Temio is free; the plans below apply from
 * `PAYMENTS_START_ON`, which the page says above the cards. Never a claim of unlimited use
 * (Basic has a fair-use limit, footnote 1), never Pro (FR-028), and a
 * refinement never uses up days (FR-037).
 */

import { addDays, formatLegalDate } from "@/lib/legal";

/**
 * The day payments start. Equals the constant in `start_trial_entitlement`
 * (`supabase/migrations/20261018160000_trial_until_launch.sql`, 2027-01-31)
 * plus one day. Payments delayed means a new migration moving that constant
 * and the retention date below, and this file, in one pr.
 */
export const PAYMENTS_START_ON = "2027-02-01";

/** The last day of full access for an account created before payments (S-30). */
export const BEFORE_PAYMENTS_ACCESS_UNTIL = addDays(PAYMENTS_START_ON, -1);

/**
 * After this day pg_cron deletes the founder-price list. Equals the date in the
 * `founder-price-signups-retention` job
 * (`supabase/migrations/20261019120000_founder_price_signups.sql`) and in
 * Polityka prywatności pkt 2.8.
 */
export const FOUNDER_LIST_RETENTION_UNTIL = "2027-08-31";

/** „1 lutego 2027” - how the page names the start of payments. */
export const PAYMENTS_START_LABEL = formatLegalDate(PAYMENTS_START_ON);

/** A value the billing toggle swaps; yearly is the default (FR-028). */
export interface Swap {
  readonly yearly: string;
  readonly monthly: string;
}

export const BASIC_PRICE: Swap = { yearly: "159 zł", monthly: "19,99 zł" };
export const BASIC_PERIOD: Swap = { yearly: "/ rok", monthly: "/ miesiąc" };
// 159 / 12 = 13,25.
export const BASIC_NOTE: Swap = {
  yearly: "Płatność raz w roku · ok. 13,25 zł miesięcznie",
  monthly: "Płatność co miesiąc",
};
export const FOUNDER_PRICE: Swap = { yearly: "119 zł / rok", monthly: "14,99 zł / miesiąc" };
export const FOUNDER_NOTE = "na zawsze, dopóki subskrypcja trwa bez przerwy.";

export interface PlanCardData {
  readonly name: string;
  readonly subtitle: string;
  readonly features: readonly string[];
}

export const FREE_PLAN: PlanCardData = {
  name: "Darmowy",
  subtitle: "Jeden tydzień planu w każdym miesiącu.",
  features: [
    "5 dni roboczych planowania z hasła w miesiącu",
    "Edycja, zatwierdzanie i usuwanie dni",
    "Kalendarz miesiąca i druk tygodnia oraz miesiąca",
  ],
};
export const FREE_PRICE = "0 zł";
export const FREE_PERIOD = "na zawsze";
export const FREE_NOTE = "Pierwszy miesiąc od rejestracji: pełny Basic";

export const BASIC_PLAN: PlanCardData = {
  name: "Basic",
  subtitle: "Cały miesiąc planu, każdego miesiąca.",
  features: ["Planowanie z hasła na cały miesiąc", "Wszystko, co w planie Darmowym"],
};

/**
 * A comparison cell: `true` → ✓, `null` → „nie dotyczy”, or text - an optional
 * bold lead, plain text, a footnote mark, an optional ✓ before it and a smaller
 * second line. Structured rather than HTML, so the table renders no markup
 * strings.
 */
export type ComparisonCell =
  | true
  | null
  | { strong?: string; text?: string; note?: number; sub?: string; check?: boolean };

export interface ComparisonRow {
  readonly label: string;
  readonly hint?: string;
  readonly free: ComparisonCell;
  readonly basic: ComparisonCell;
}

export interface ComparisonGroup {
  readonly title: string;
  readonly rows: readonly ComparisonRow[];
}

export const PLAN_COMPARISON: { groups: readonly ComparisonGroup[]; notes: readonly string[] } = {
  groups: [
    {
      title: "Cena i start",
      rows: [
        {
          label: "Cena",
          free: { text: "0 zł" },
          basic: { strong: "159 zł za rok", text: " (domyślnie) albo 19,99 zł miesięcznie" },
        },
        {
          label: "Cena założycielska",
          free: null,
          basic: {
            strong: "119 zł za rok",
            text: " albo 14,99 zł miesięcznie, na zawsze, dopóki subskrypcja trwa bez przerwy",
          },
        },
        { label: "Pierwszy miesiąc od rejestracji", free: { text: "pełny Basic, bez karty" }, basic: null },
      ],
    },
    {
      title: "Planowanie",
      rows: [
        {
          label: "Planowanie z hasła",
          hint: "dzień, tydzień, ponowne generowanie",
          free: { strong: "5 dni roboczych w miesiącu", sub: "jeden tydzień" },
          basic: { strong: "cały miesiąc", note: 1 },
        },
        {
          label: "Poprawka aktywności poleceniem",
          free: { check: true, text: "nie zużywa dni", note: 2 },
          basic: { check: true, text: "nie zużywa dni", note: 2 },
        },
        { label: "Edycja, zatwierdzanie, usuwanie dni", free: true, basic: true },
        { label: "Podgląd aktywności w kalendarzu miesiąca", free: true, basic: true },
      ],
    },
    {
      title: "Druk i Twoje plany",
      rows: [
        { label: "Druk tygodnia", free: true, basic: true },
        { label: "Druk miesiąca", free: true, basic: true },
        { label: "Twoje plany po zakończeniu Basic", free: { text: "zostają: odczyt, edycja, druk" }, basic: null },
      ],
    },
    {
      title: "Płatność",
      rows: [
        {
          label: "Płatność",
          free: null,
          basic: {
            text: "karta (subskrypcja, anulujesz w każdej chwili) albo BLIK / przelew",
            note: 3,
            sub: "miesiąc lub rok szkolny, bez odnowienia",
          },
        },
      ],
    },
  ],
  notes: [
    "Z limitem rozsądnego użycia — przy zwykłym planowaniu go nie odczujesz.",
    "Poprawka aktywności poleceniem nie zużywa dni z puli planowania. Ma własny limit rozsądnego użycia, którego przy zwykłej pracy nie odczujesz.",
    "BLIK i przelew opłacają wybrany okres z góry i nie odnawiają się automatycznie.",
  ],
};

/** The footnote marks the table uses, for the tests. */
export function comparisonNoteMarks(): number[] {
  return PLAN_COMPARISON.groups.flatMap((group) =>
    group.rows.flatMap((row) =>
      [row.free, row.basic].flatMap((cell) => (cell && cell !== true && cell.note ? [cell.note] : [])),
    ),
  );
}

/** Every string the comparison table prints, for the tests. */
export function comparisonTexts(): string[] {
  const cell = (value: ComparisonCell): string[] =>
    value === true || value === null
      ? []
      : [`${value.strong ?? ""}${value.text ?? ""}`, ...(value.sub ? [value.sub] : [])];
  return [
    ...PLAN_COMPARISON.groups.flatMap((group) => [
      group.title,
      ...group.rows.flatMap((row) => [
        row.label,
        ...(row.hint ? [row.hint] : []),
        ...cell(row.free),
        ...cell(row.basic),
      ]),
    ]),
    ...PLAN_COMPARISON.notes,
  ];
}
