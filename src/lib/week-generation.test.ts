import { describe, expect, it } from "vitest";

import {
  ALL_ACCEPTED_MESSAGE,
  isWeekEmpty,
  partitionWeek,
  replacementConfirmation,
  type WeekDayAcceptance,
} from "./week-generation";

// The four week compositions the plan names, because they are the four the
// teacher can actually be looking at: a fresh week, a week part-signed-off, a
// week fully signed off, and a week with nothing in it. The sentence and the
// partition are asserted together — a correct count in a sentence that says the
// wrong thing about acceptance is still wrong.

const DATES = ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"];

function week(spec: readonly ("empty" | "draft" | "accepted")[]): WeekDayAcceptance[] {
  return spec.map((kind, index) => ({
    planDate: DATES[index],
    planned: kind !== "empty",
    accepted: kind === "accepted",
  }));
}

const FIVE_EMPTY = week(["empty", "empty", "empty", "empty", "empty"]);
const THREE_DRAFT_TWO_ACCEPTED = week(["draft", "draft", "draft", "accepted", "accepted"]);
const FIVE_ACCEPTED = week(["accepted", "accepted", "accepted", "accepted", "accepted"]);
const FIVE_DRAFT = week(["draft", "draft", "draft", "draft", "draft"]);

describe("partitionWeek", () => {
  it("targets every day of an empty week and spares none", () => {
    const partition = partitionWeek(FIVE_EMPTY);

    expect(partition.targets).toEqual(DATES);
    expect(partition.untouched).toEqual([]);
  });

  // The case S-09 exists for: a draft is not protected, an acceptance is.
  it("targets drafts and spares accepted days", () => {
    const partition = partitionWeek(THREE_DRAFT_TWO_ACCEPTED);

    expect(partition.targets).toEqual(DATES.slice(0, 3));
    expect(partition.untouched).toEqual(DATES.slice(3));
  });

  it("targets a full week of drafts — having a plan is no longer a reason to skip", () => {
    expect(partitionWeek(FIVE_DRAFT).targets).toEqual(DATES);
  });

  it("targets nothing when every day is accepted", () => {
    const partition = partitionWeek(FIVE_ACCEPTED);

    expect(partition.targets).toEqual([]);
    expect(partition.untouched).toEqual(DATES);
  });

  it("keeps calendar order, which the outline then indexes by position", () => {
    expect(partitionWeek(THREE_DRAFT_TWO_ACCEPTED).targets).toEqual([DATES[0], DATES[1], DATES[2]]);
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
  function confirm(days: readonly WeekDayAcceptance[]): string | null {
    return replacementConfirmation(partitionWeek(days), isWeekEmpty(days));
  }

  // Nothing to overwrite, so nothing to ask. A dialog here would be the one
  // that teaches the teacher to dismiss dialogs.
  it("asks nothing on a week with no saved plans", () => {
    expect(confirm(FIVE_EMPTY)).toBeNull();
  });

  it("states both numbers on a mixed week", () => {
    const message = confirm(THREE_DRAFT_TWO_ACCEPTED);

    expect(message).toBe(
      "Zastąpię 3 dni nowymi propozycjami. 2 zaakceptowane dni zostaną nietknięte. Tej operacji nie można cofnąć.",
    );
  });

  // "0 zaakceptowanych dni" would be a reassurance about a thing the teacher
  // never asked about.
  it("omits the untouched sentence when nothing is accepted", () => {
    const message = confirm(FIVE_DRAFT);

    expect(message).toBe("Zastąpię 5 dni nowymi propozycjami. Tej operacji nie można cofnąć.");
    expect(message).not.toContain("zaakceptowan");
  });

  it("asks nothing when every day is accepted — that run is refused, not confirmed", () => {
    expect(confirm(FIVE_ACCEPTED)).toBeNull();
  });

  it("always warns that the operation cannot be undone", () => {
    for (const days of [THREE_DRAFT_TWO_ACCEPTED, FIVE_DRAFT]) {
      expect(confirm(days)).toContain("nie można cofnąć");
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

    expect(replacementConfirmation(partitionWeek(days), false)).toContain(expected);
  });

  it.each([
    [1, "1 zaakceptowany dzień zostanie nietknięty."],
    [2, "2 zaakceptowane dni zostaną nietknięte."],
    [4, "4 zaakceptowane dni zostaną nietknięte."],
  ])("agrees the untouched count at %i", (count, expected) => {
    const days = week(["draft", ...Array<"accepted">(count).fill("accepted")] as ("empty" | "draft" | "accepted")[]);

    expect(replacementConfirmation(partitionWeek(days), false)).toContain(expected);
  });
});

describe("ALL_ACCEPTED_MESSAGE", () => {
  // The old copy said "mają już plan", which stops being the operative
  // condition the moment a draft becomes replaceable.
  it("names acceptance as the reason and not the presence of a plan", () => {
    expect(ALL_ACCEPTED_MESSAGE).toContain("zaakceptowane");
    expect(ALL_ACCEPTED_MESSAGE).not.toContain("mają już plan");
  });

  it("names the way out", () => {
    expect(ALL_ACCEPTED_MESSAGE).toContain("Cofnij akceptację");
  });
});
