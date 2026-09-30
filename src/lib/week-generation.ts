/**
 * Who gets replaced when a week is regenerated, and what the teacher is told
 * before it happens.
 *
 * Lives in `src/lib/` and imports nothing heavy at runtime — no zod, no React — for the reason
 * `day-plan-limits` and `day-plan-guards` do: the island needs all of this and
 * must not drag a validator into the client bundle. It is also why it is a
 * module rather than three functions inside `WeekPlanBoard.tsx`: the partition
 * and the sentence are the two things this slice has to get exactly right, and
 * a claim that can only be checked by rendering a React tree is a claim nobody
 * checks.
 *
 * The rule: a day is a target when it has no plan **or** has a plan the
 * teacher has not accepted. Emptiness stopped being the question at `S-09` — a
 * draft is regenerable, and refusing to touch it was the gap that made a
 * teacher open five days one at a time. Acceptance is what is protected, and
 * since `S-10` (FR-013) it is protected by consent rather than absolutely: an
 * accepted day becomes a target only when the teacher says so, in a dialog
 * that names how many accepted days lose their acceptance. The acceptances
 * they agreed to lose - each day with the `accepted_at` they were shown -
 * travel to the writer as `consented`, and the writer refuses any other
 * acceptance it meets.
 */

import {
  IRREVERSIBLE_SENTENCE,
  REGENERATE_CANCEL_LABEL,
  REGENERATE_CONFIRM_LABEL,
  type ConfirmationRequest,
} from "@/lib/confirmations";
import type { AcceptedDayConsent } from "@/types";

export interface WeekDayAcceptance {
  readonly planDate: string;
  /** The day has a saved plan of any kind. */
  readonly planned: boolean;
  /**
   * The saved plan's `accepted_at`, as read back from the row; `null` for a
   * draft or an empty day. The value itself, not a boolean, because consent
   * names the acceptance and the writer compares it verbatim.
   */
  readonly acceptedAt: string | null;
}

export interface WeekPartition {
  /**
   * Days this run will replace, in calendar order: empty days and drafts, plus
   * the accepted days when the teacher included them.
   */
  readonly targets: readonly string[];
  /** Days this run will deliberately leave alone: accepted days left out of scope. */
  readonly untouched: readonly string[];
  /**
   * The accepted days among `targets`, each with the acceptance the teacher
   * was shown — what they agreed to lose, and exactly what the writer is told
   * it may replace. Empty whenever accepted days are out of scope.
   */
  readonly consented: readonly AcceptedDayConsent[];
}

export function partitionWeek(days: readonly WeekDayAcceptance[], includeAccepted: boolean): WeekPartition {
  const targets: string[] = [];
  const untouched: string[] = [];
  const consented: AcceptedDayConsent[] = [];
  for (const day of days) {
    // Acceptance alone decides. A day that is planned but not accepted is a
    // draft, and a draft is exactly what this operation is for.
    if (day.acceptedAt === null) {
      targets.push(day.planDate);
    } else if (includeAccepted) {
      targets.push(day.planDate);
      consented.push({ plan_date: day.planDate, accepted_at: day.acceptedAt });
    } else {
      untouched.push(day.planDate);
    }
  }
  return { targets, untouched, consented };
}

/** True when no day of the week carries a saved plan. */
export function isWeekEmpty(days: readonly WeekDayAcceptance[]): boolean {
  return days.every((day) => !day.planned);
}

// ---------------------------------------------------------------------------
// Polish agreement
// ---------------------------------------------------------------------------
//
// Spelled out rather than generated, for the same reason the outline prompt's
// count table is: three forms across a range of five, each dragging its
// adjective and its verb along. A teacher reads this sentence at the moment
// they are deciding whether to destroy a week's work, and "Zastąpię 1 dni"
// is the kind of detail that makes the rest of the sentence less believable.

/** „1 dzień" / „2 dni" / „5 dni" — accusative, as the sentence needs it. */
function dayCount(count: number): string {
  return count === 1 ? "1 dzień" : `${String(count)} dni`;
}

/**
 * The untouched clause, fully agreed: „1 zatwierdzony dzień zostanie
 * nietknięty." / „2 zatwierdzone dni zostaną nietknięte." /
 * „5 zatwierdzonych dni zostanie nietkniętych."
 */
function untouchedSentence(count: number): string {
  if (count === 1) {
    return "1 zatwierdzony dzień zostanie nietknięty.";
  }
  if (count < 5) {
    return `${String(count)} zatwierdzone dni zostaną nietknięte.`;
  }
  return `${String(count)} zatwierdzonych dni zostanie nietkniętych.`;
}

/**
 * The consented clause: „w tym 1 zatwierdzony — jego zatwierdzenie zostanie
 * cofnięte." / „w tym 2 zatwierdzone — ich …" / „w tym 5 zatwierdzonych — ich …"
 */
function consentedClause(count: number): string {
  if (count === 1) {
    return "w tym 1 zatwierdzony — jego zatwierdzenie zostanie cofnięte.";
  }
  if (count < 5) {
    return `w tym ${String(count)} zatwierdzone — ich zatwierdzenie zostanie cofnięte.`;
  }
  return `w tym ${String(count)} zatwierdzonych — ich zatwierdzenie zostanie cofnięte.`;
}

/**
 * The scope question for a week that has both accepted days and days that are
 * not: are the accepted ones in this run too?
 *
 * Declining does not cancel - it narrows the run to the days that are not
 * accepted. A native `confirm` could only offer OK and Anuluj for that, so the
 * sentence used to explain both; the application's own window names the two
 * buttons after what they do instead, and closing it (Escape) is the same
 * answer as the narrowing button. The caller must honour the last sentence: a
 * run never starts from this window alone, because it states no count of what
 * is destroyed.
 *
 * Only for a mixed week. With nothing accepted there is nothing to ask, and
 * with everything accepted "only the drafts" is a run over no days.
 */
export function scopeQuestion(acceptedCount: number): ConfirmationRequest {
  const fact =
    acceptedCount === 1
      ? "1 dzień tego tygodnia jest zatwierdzony."
      : acceptedCount < 5
        ? `${String(acceptedCount)} dni tego tygodnia są zatwierdzone.`
        : `${String(acceptedCount)} dni tego tygodnia jest zatwierdzonych.`;
  const include =
    acceptedCount === 1
      ? "Mogę zastąpić także ten dzień — jego zatwierdzenie zostanie wtedy cofnięte."
      : "Mogę zastąpić także te dni — ich zatwierdzenie zostanie wtedy cofnięte.";
  return {
    title: "Zastąpić także zatwierdzone dni?",
    body: [
      fact,
      `${include} Albo zastąpię tylko dni niezatwierdzone.`,
      "W obu przypadkach zapytam jeszcze o potwierdzenie.",
    ],
    confirmLabel: "Zastąp także zatwierdzone",
    cancelLabel: "Tylko do przejrzenia",
    // Neither answer destroys anything yet - the count window that follows is
    // the one that does, and it is the dangerous one.
    tone: "default",
  };
}

/**
 * What the teacher confirms before anything is spent — or `null` when there is
 * nothing to confirm.
 *
 * `null` for a week with no saved plans at all: there is nothing to replace and
 * nothing to warn about, and a dialog that asks permission to overwrite nothing
 * teaches the teacher to dismiss the one that matters.
 *
 * Both numbers, always, when there is something to replace. FR-014's literal
 * wording asks for "ile dni zostanie zastąpionych i ile z nich jest
 * zatwierdzonych". When accepted days are in scope (`S-10`) that second
 * number is the one stated, together with what it costs — the acceptance is
 * withdrawn. When they are out of scope it is zero by construction, so the
 * second number is the days being *spared* instead, as `S-09` recorded. Both
 * are the honest reading of guardrail #2's "uczciwe co do liczby i stanu dni".
 *
 * A fully accepted week gets its own opening sentence: "w tym 5
 * zatwierdzonych" out of 5 buries the one fact that matters, that nothing in
 * the week survives as the teacher signed it off.
 *
 * The undo sentence is not decoration. This package adds confirmations, not
 * history (PRD §Non-Goals): once the write lands, the superseded batch is gone.
 */
export function replacementConfirmation(partition: WeekPartition, weekIsEmpty: boolean): ConfirmationRequest | null {
  if (weekIsEmpty || partition.targets.length === 0) {
    return null;
  }

  return {
    title: "Wygenerować nowe propozycje?",
    body: replacementSentences(partition),
    confirmLabel: REGENERATE_CONFIRM_LABEL,
    cancelLabel: REGENERATE_CANCEL_LABEL,
    tone: "danger",
  };
}

function replacementSentences(partition: WeekPartition): string[] {
  const consented = partition.consented.length;
  if (consented > 1 && consented === partition.targets.length) {
    return [
      "Wszystkie dni tego tygodnia są zatwierdzone.",
      `Zastąpię wszystkie ${String(consented)} dni nowymi propozycjami, a ich zatwierdzenie zostanie cofnięte.`,
      IRREVERSIBLE_SENTENCE,
    ];
  }

  const replaced = `Zastąpię ${dayCount(partition.targets.length)} nowymi propozycjami`;
  const sentences = [consented > 0 ? `${replaced}, ${consentedClause(consented)}` : `${replaced}.`];
  // Omitted rather than printed as "0 zatwierdzonych dni", which reads as a
  // reassurance about something the teacher never asked about.
  if (partition.untouched.length > 0) {
    sentences.push(untouchedSentence(partition.untouched.length));
  }
  sentences.push(IRREVERSIBLE_SENTENCE);
  return sentences;
}
