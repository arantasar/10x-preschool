import { describe, expect, it } from "vitest";

import {
  isWeekEmpty,
  partitionWeek,
  replacementConfirmation,
  scopeQuestion,
  type WeekDayAcceptance,
} from "./week-generation";

// The four week compositions the plan names, because they are the four the
// teacher can actually be looking at: a fresh week, a week part-signed-off, a
// week fully signed off, and a week with nothing in it. The sentence and the
// partition are asserted together — a correct count in a sentence that says the
// wrong thing about acceptance is still wrong.

const DATES = ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"];

/** Distinct per day, so a consent carrying the wrong day's acceptance shows. */
function acceptedAt(planDate: string): string {
  return `${planDate}T07:30:00.123+00:00`;
}

/** The consents the writer would get for these days, in the shape it gets them. */
function consents(dates: readonly string[]) {
  return dates.map((planDate) => ({ plan_date: planDate, accepted_at: acceptedAt(planDate) }));
}

function week(spec: readonly ("empty" | "draft" | "accepted")[]): WeekDayAcceptance[] {
  return spec.map((kind, index) => ({
    planDate: DATES[index],
    planned: kind !== "empty",
    acceptedAt: kind === "accepted" ? acceptedAt(DATES[index]) : null,
  }));
}

const FIVE_EMPTY = week(["empty", "empty", "empty", "empty", "empty"]);
const THREE_DRAFT_TWO_ACCEPTED = week(["draft", "draft", "draft", "accepted", "accepted"]);
const FIVE_ACCEPTED = week(["accepted", "accepted", "accepted", "accepted", "accepted"]);
const FIVE_DRAFT = week(["draft", "draft", "draft", "draft", "draft"]);

describe("partitionWeek", () => {
  it("targets every day of an empty week and spares none", () => {
    const partition = partitionWeek(FIVE_EMPTY, false);

    expect(partition.targets).toEqual(DATES);
    expect(partition.untouched).toEqual([]);
    expect(partition.consented).toEqual([]);
  });

  // The case S-09 exists for: a draft is not protected, an acceptance is.
  it("targets drafts and spares accepted days when they are out of scope", () => {
    const partition = partitionWeek(THREE_DRAFT_TWO_ACCEPTED, false);

    expect(partition.targets).toEqual(DATES.slice(0, 3));
    expect(partition.untouched).toEqual(DATES.slice(3));
    expect(partition.consented).toEqual([]);
  });

  // The case S-10 exists for: the teacher said yes, so the accepted days are
  // targets - and they are named with the acceptance the teacher saw, because
  // the writer replaces only that acceptance of that day.
  it("targets every day and names the accepted ones when they are in scope", () => {
    const partition = partitionWeek(THREE_DRAFT_TWO_ACCEPTED, true);

    expect(partition.targets).toEqual(DATES);
    expect(partition.untouched).toEqual([]);
    expect(partition.consented).toEqual(consents(DATES.slice(3)));
  });

  it("targets a full week of drafts — having a plan is no longer a reason to skip", () => {
    expect(partitionWeek(FIVE_DRAFT, false).targets).toEqual(DATES);
    // Nothing accepted, so nothing to consent to, whichever scope was asked.
    expect(partitionWeek(FIVE_DRAFT, true).consented).toEqual([]);
  });

  it("targets and consents to every day of a fully accepted week in scope", () => {
    const partition = partitionWeek(FIVE_ACCEPTED, true);

    expect(partition.targets).toEqual(DATES);
    expect(partition.consented).toEqual(consents(DATES));
    expect(partition.untouched).toEqual([]);
  });

  it("targets nothing in a fully accepted week out of scope", () => {
    const partition = partitionWeek(FIVE_ACCEPTED, false);

    expect(partition.targets).toEqual([]);
    expect(partition.untouched).toEqual(DATES);
  });

  // The guarantee the writer relies on: a scope without accepted days never
  // produces consent, whatever the week holds.
  it.each([
    ["five empty days", FIVE_EMPTY],
    ["three drafts and two accepted", THREE_DRAFT_TWO_ACCEPTED],
    ["five accepted days", FIVE_ACCEPTED],
    ["five drafts", FIVE_DRAFT],
  ])("consents to nothing on %s when accepted days are out of scope", (_name, days) => {
    expect(partitionWeek(days, false).consented).toEqual([]);
  });

  it("keeps calendar order, which the outline then indexes by position", () => {
    const mixed = week(["accepted", "draft", "accepted", "empty", "draft"]);

    expect(partitionWeek(THREE_DRAFT_TWO_ACCEPTED, false).targets).toEqual([DATES[0], DATES[1], DATES[2]]);
    expect(partitionWeek(mixed, true).targets).toEqual(DATES);
    expect(partitionWeek(mixed, true).consented).toEqual(consents([DATES[0], DATES[2]]));
  });
});

describe("scopeQuestion", () => {
  // Anuluj narrows rather than cancels here, which is not what the button's
  // name says - so the sentence has to say what each button does.
  it("names what OK does and what Anuluj does", () => {
    const question = scopeQuestion(2);

    expect(question).toContain("OK — zastąpię także te dni, a ich akceptacja zostanie cofnięta.");
    expect(question).toContain("Anuluj — zastąpię tylko dni niezaakceptowane.");
  });

  // It states no count of what is destroyed, so it must never be the last word.
  it("says a confirmation follows either way", () => {
    expect(scopeQuestion(2)).toContain("W obu przypadkach zapytam jeszcze o potwierdzenie.");
  });

  it.each([
    [1, "1 dzień tego tygodnia jest zaakceptowany."],
    [2, "2 dni tego tygodnia są zaakceptowane."],
    [4, "4 dni tego tygodnia są zaakceptowane."],
  ])("agrees the accepted count at %i", (count, expected) => {
    expect(scopeQuestion(count)).toMatch(new RegExp(`^${expected}`));
  });

  it("speaks of one day in the singular", () => {
    expect(scopeQuestion(1)).toContain("OK — zastąpię także ten dzień, a jego akceptacja zostanie cofnięta.");
  });
});

describe("isWeekEmpty", () => {
  it.each([
    ["five empty days", FIVE_EMPTY, true],
    ["three drafts and two accepted", THREE_DRAFT_TWO_ACCEPTED, false],
    ["five accepted days", FIVE_ACCEPTED, false],
  ])("%s -> %s", (_name, days, expected) => {
    expect(isWeekEmpty(days)).toBe(expected);
  });
});

describe("replacementConfirmation", () => {
  function confirm(days: readonly WeekDayAcceptance[], includeAccepted = false): string | null {
    return replacementConfirmation(partitionWeek(days, includeAccepted), isWeekEmpty(days));
  }

  // Nothing to overwrite, so nothing to ask. A dialog here would be the one
  // that teaches the teacher to dismiss dialogs.
  it("asks nothing on a week with no saved plans", () => {
    expect(confirm(FIVE_EMPTY)).toBeNull();
  });

  it("states both numbers on a mixed week with only the drafts in scope", () => {
    const message = confirm(THREE_DRAFT_TWO_ACCEPTED);

    expect(message).toBe(
      "Zastąpię 3 dni nowymi propozycjami. 2 zaakceptowane dni zostaną nietknięte. Tej operacji nie można cofnąć.",
    );
  });

  // FR-014's "ile z nich jest zaakceptowanych", non-zero for the first time.
  it("states the total and the accepted count on a mixed week with accepted days in scope", () => {
    const message = confirm(THREE_DRAFT_TWO_ACCEPTED, true);

    expect(message).toBe(
      "Zastąpię 5 dni nowymi propozycjami, w tym 2 zaakceptowane — ich akceptacja zostanie cofnięta. " +
        "Tej operacji nie można cofnąć.",
    );
    // Nothing is spared, so nothing may claim to be.
    expect(message).not.toContain("nietknięt");
  });

  it("names a fully accepted week as such", () => {
    const message = confirm(FIVE_ACCEPTED, true);

    expect(message).toBe(
      "Wszystkie dni tego tygodnia są zaakceptowane. " +
        "Zastąpię wszystkie 5 dni nowymi propozycjami, a ich akceptacja zostanie cofnięta. " +
        "Tej operacji nie można cofnąć.",
    );
  });

  // "0 zaakceptowanych dni" would be a reassurance about a thing the teacher
  // never asked about.
  it("omits the untouched sentence when nothing is accepted", () => {
    const message = confirm(FIVE_DRAFT);

    expect(message).toBe("Zastąpię 5 dni nowymi propozycjami. Tej operacji nie można cofnąć.");
    expect(message).not.toContain("zaakceptowan");
  });

  it("always warns that the operation cannot be undone", () => {
    for (const message of [
      confirm(THREE_DRAFT_TWO_ACCEPTED),
      confirm(THREE_DRAFT_TWO_ACCEPTED, true),
      confirm(FIVE_ACCEPTED, true),
      confirm(FIVE_DRAFT),
    ]) {
      expect(message).toContain("nie można cofnąć");
    }
  });

  // Polish agreement, asserted because the sentence is read at the moment the
  // teacher decides whether to destroy a week's work.
  it.each([
    [1, "Zastąpię 1 dzień nowymi propozycjami."],
    [2, "Zastąpię 2 dni nowymi propozycjami."],
    [5, "Zastąpię 5 dni nowymi propozycjami."],
  ])("agrees the target count at %i", (count, expected) => {
    const days = week([...Array<"draft">(count).fill("draft"), ...Array<"empty">(5 - count).fill("empty")]).slice(
      0,
      count,
    );

    expect(replacementConfirmation(partitionWeek(days, false), false)).toContain(expected);
  });

  it.each([
    [1, "1 zaakceptowany dzień zostanie nietknięty."],
    [2, "2 zaakceptowane dni zostaną nietknięte."],
    [4, "4 zaakceptowane dni zostaną nietknięte."],
  ])("agrees the untouched count at %i", (count, expected) => {
    const days = week(["draft", ...Array<"accepted">(count).fill("accepted")] as ("empty" | "draft" | "accepted")[]);

    expect(replacementConfirmation(partitionWeek(days, false), false)).toContain(expected);
  });

  it.each([
    [1, "Zastąpię 2 dni nowymi propozycjami, w tym 1 zaakceptowany — jego akceptacja zostanie cofnięta."],
    [2, "Zastąpię 3 dni nowymi propozycjami, w tym 2 zaakceptowane — ich akceptacja zostanie cofnięta."],
    [4, "Zastąpię 5 dni nowymi propozycjami, w tym 4 zaakceptowane — ich akceptacja zostanie cofnięta."],
  ])("agrees the consented count at %i", (count, expected) => {
    const days = week(["draft", ...Array<"accepted">(count).fill("accepted")] as ("empty" | "draft" | "accepted")[]);

    expect(replacementConfirmation(partitionWeek(days, true), false)).toContain(expected);
  });
});
