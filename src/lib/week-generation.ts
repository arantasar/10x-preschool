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
 * The rule that replaced the old one: a day is a target when it has no plan
 * **or** has a plan the teacher has not accepted. Emptiness stopped being the
 * question at `S-09` — a draft is regenerable, and refusing to touch it was the
 * gap that made a teacher open five days one at a time. Acceptance is what is
 * protected now, and in this slice it is protected absolutely: `S-10` (FR-013)
 * is what extends the operation to accepted days.
 */

export interface WeekDayAcceptance {
  readonly planDate: string;
  /** The day has a saved plan of any kind. */
  readonly planned: boolean;
  /** The saved plan carries `accepted_at`. */
  readonly accepted: boolean;
}

export interface WeekPartition {
  /** Days this run will replace: empty days and unaccepted drafts. */
  readonly targets: readonly string[];
  /** Days this run will deliberately leave alone: the accepted ones. */
  readonly untouched: readonly string[];
}

export function partitionWeek(days: readonly WeekDayAcceptance[]): WeekPartition {
  const targets: string[] = [];
  const untouched: string[] = [];
  for (const day of days) {
    // `accepted` alone decides. A day that is planned but not accepted is a
    // draft, and a draft is exactly what this operation is for.
    if (day.accepted) {
      untouched.push(day.planDate);
    } else {
      targets.push(day.planDate);
    }
  }
  return { targets, untouched };
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
 * What the teacher confirms before anything is spent — or `null` when there is
 * nothing to confirm.
 *
 * `null` for a week with no saved plans at all: there is nothing to replace and
 * nothing to warn about, and a dialog that asks permission to overwrite nothing
 * teaches the teacher to dismiss the one that matters.
 *
 * Both numbers, always, when there is something to replace. FR-014's literal
 * wording asks for "ile dni zostanie zastąpionych i ile z nich jest
 * zaakceptowanych", which is zero by construction while accepted days are out
 * of scope — so the second number here is the days being *spared* instead. That
 * is the divergence the plan recorded, and it is the honest reading of
 * guardrail #2's "uczciwe co do liczby i stanu dni".
 *
 * The undo sentence is not decoration. This package adds confirmations, not
 * history (PRD §Non-Goals): once the write lands, the superseded batch is gone.
 */
export function replacementConfirmation(partition: WeekPartition, weekIsEmpty: boolean): string | null {
  if (weekIsEmpty || partition.targets.length === 0) {
    return null;
  }

  const sentences = [`Zastąpię ${dayCount(partition.targets.length)} nowymi propozycjami.`];
  // Omitted rather than printed as "0 zaakceptowanych dni", which reads as a
  // reassurance about something the teacher never asked about.
  if (partition.untouched.length > 0) {
    sentences.push(untouchedSentence(partition.untouched.length));
  }
  sentences.push("Tej operacji nie można cofnąć.");
  return sentences.join(" ");
}

/**
 * Why a run was refused before a single token was spent.
 *
 * The old message said "Wszystkie dni tego tygodnia mają już plan", which stops
 * being the operative condition at `S-09`: a week full of drafts now generates
 * happily. The only thing that can refuse a whole week is that every day is
 * accepted, so that is what the message names — together with the way out,
 * because "cofnij akceptację" is a thing the teacher can actually do.
 */
export const ALL_ACCEPTED_MESSAGE =
  "Wszystkie dni tego tygodnia są zaakceptowane — nic nie zostanie zastąpione. " +
  "Cofnij akceptację dnia, żeby wygenerować go jeszcze raz.";
