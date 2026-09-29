/**
 * Who gets replaced when a week is regenerated, and what the teacher is told
 * before it happens.
 *
 * Lives in `src/lib/` and imports nothing — no zod, no React — for the reason
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
 * that names how many accepted days lose their acceptance. The dates they
 * agreed to travel to the writer as `consented`, and the writer refuses any
 * other accepted day it meets.
 */

export interface WeekDayAcceptance {
  readonly planDate: string;
  /** The day has a saved plan of any kind. */
  readonly planned: boolean;
  /** The saved plan carries `accepted_at`. */
  readonly accepted: boolean;
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
   * The accepted dates among `targets` — what the teacher agreed to lose, and
   * exactly what the writer is told it may replace. Empty whenever accepted
   * days are out of scope.
   */
  readonly consented: readonly string[];
}

export function partitionWeek(days: readonly WeekDayAcceptance[], includeAccepted: boolean): WeekPartition {
  const targets: string[] = [];
  const untouched: string[] = [];
  const consented: string[] = [];
  for (const day of days) {
    // `accepted` alone decides. A day that is planned but not accepted is a
    // draft, and a draft is exactly what this operation is for.
    if (!day.accepted) {
      targets.push(day.planDate);
    } else if (includeAccepted) {
      targets.push(day.planDate);
      consented.push(day.planDate);
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
 * The untouched clause, fully agreed: „1 zaakceptowany dzień zostanie
 * nietknięty." / „2 zaakceptowane dni zostaną nietknięte." /
 * „5 zaakceptowanych dni zostanie nietkniętych."
 */
function untouchedSentence(count: number): string {
  if (count === 1) {
    return "1 zaakceptowany dzień zostanie nietknięty.";
  }
  if (count < 5) {
    return `${String(count)} zaakceptowane dni zostaną nietknięte.`;
  }
  return `${String(count)} zaakceptowanych dni zostanie nietkniętych.`;
}

/**
 * The consented clause: „w tym 1 zaakceptowany — jego akceptacja zostanie
 * cofnięta." / „w tym 2 zaakceptowane — ich …" / „w tym 5 zaakceptowanych — ich …"
 */
function consentedClause(count: number): string {
  if (count === 1) {
    return "w tym 1 zaakceptowany — jego akceptacja zostanie cofnięta.";
  }
  if (count < 5) {
    return `w tym ${String(count)} zaakceptowane — ich akceptacja zostanie cofnięta.`;
  }
  return `w tym ${String(count)} zaakceptowanych — ich akceptacja zostanie cofnięta.`;
}

/**
 * The scope question for a week that has both accepted days and days that are
 * not: are the accepted ones in this run too?
 *
 * A native `confirm` has only OK and Anuluj, and here Anuluj does not cancel —
 * it narrows the run to the drafts. That is not what the button's name says,
 * so the sentence names both outcomes in words, and says that a second dialog
 * follows either way. The caller must honour that: a run never starts from
 * this dialog alone, because it states no count of what is destroyed.
 *
 * Only for a mixed week. With nothing accepted there is nothing to ask, and
 * with everything accepted "only the drafts" is a run over no days.
 */
export function scopeQuestion(acceptedCount: number): string {
  const fact =
    acceptedCount === 1
      ? "1 dzień tego tygodnia jest zaakceptowany."
      : acceptedCount < 5
        ? `${String(acceptedCount)} dni tego tygodnia są zaakceptowane.`
        : `${String(acceptedCount)} dni tego tygodnia jest zaakceptowanych.`;
  const include =
    acceptedCount === 1
      ? "OK — zastąpię także ten dzień, a jego akceptacja zostanie cofnięta."
      : "OK — zastąpię także te dni, a ich akceptacja zostanie cofnięta.";
  return [
    fact,
    include,
    "Anuluj — zastąpię tylko dni niezaakceptowane.",
    "W obu przypadkach zapytam jeszcze o potwierdzenie.",
  ].join(" ");
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
 * zaakceptowanych". When accepted days are in scope (`S-10`) that second
 * number is the one stated, together with what it costs — the acceptance is
 * withdrawn. When they are out of scope it is zero by construction, so the
 * second number is the days being *spared* instead, as `S-09` recorded. Both
 * are the honest reading of guardrail #2's "uczciwe co do liczby i stanu dni".
 *
 * A fully accepted week gets its own opening sentence: "w tym 5
 * zaakceptowanych" out of 5 buries the one fact that matters, that nothing in
 * the week survives as the teacher signed it off.
 *
 * The undo sentence is not decoration. This package adds confirmations, not
 * history (PRD §Non-Goals): once the write lands, the superseded batch is gone.
 */
export function replacementConfirmation(partition: WeekPartition, weekIsEmpty: boolean): string | null {
  if (weekIsEmpty || partition.targets.length === 0) {
    return null;
  }

  const consented = partition.consented.length;
  if (consented > 1 && consented === partition.targets.length) {
    return [
      "Wszystkie dni tego tygodnia są zaakceptowane.",
      `Zastąpię wszystkie ${String(consented)} dni nowymi propozycjami, a ich akceptacja zostanie cofnięta.`,
      "Tej operacji nie można cofnąć.",
    ].join(" ");
  }

  const replaced = `Zastąpię ${dayCount(partition.targets.length)} nowymi propozycjami`;
  const sentences = [consented > 0 ? `${replaced}, ${consentedClause(consented)}` : `${replaced}.`];
  // Omitted rather than printed as "0 zaakceptowanych dni", which reads as a
  // reassurance about something the teacher never asked about.
  if (partition.untouched.length > 0) {
    sentences.push(untouchedSentence(partition.untouched.length));
  }
  sentences.push("Tej operacji nie można cofnąć.");
  return sentences.join(" ");
}
