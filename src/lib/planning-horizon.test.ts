import { describe, expect, it } from "vitest";
import { checkGenerationDates, generationWindow, horizonMessage } from "@/lib/planning-horizon";

describe("generationWindow", () => {
  it("runs from the Monday before the previous month to the Sunday after the next one", () => {
    // 1 Sep 2026 is a Tuesday, 30 Nov 2026 a Monday.
    expect(generationWindow("2026-10-18")).toEqual({ first: "2026-08-31", last: "2026-12-06" });
  });

  it("is the same on the first and the last day of a month, and jumps the day after", () => {
    expect(generationWindow("2026-10-01")).toEqual(generationWindow("2026-10-31"));
    // From November: previous month October (1 Oct is a Thursday), next month
    // December (31 Dec is a Thursday).
    expect(generationWindow("2026-11-01")).toEqual({ first: "2026-09-28", last: "2027-01-03" });
  });

  it("crosses the year boundary", () => {
    // 1 Nov 2026 is a Sunday; 31 Jan 2027 a Sunday.
    expect(generationWindow("2026-12-15")).toEqual({ first: "2026-10-26", last: "2027-01-31" });
    // 1 Dec 2026 is a Tuesday; 28 Feb 2027 a Sunday.
    expect(generationWindow("2027-01-10")).toEqual({ first: "2026-11-30", last: "2027-02-28" });
  });

  it("ends February on the right day in leap and common years", () => {
    // 29 Feb 2028 is a Tuesday → padded to Sunday 5 March.
    expect(generationWindow("2028-01-20").last).toBe("2028-03-05");
    // 28 Feb 2029 is a Wednesday → Sunday 4 March.
    expect(generationWindow("2029-01-20").last).toBe("2029-03-04");
  });

  it("does not pad when the previous month starts on a Monday or the next ends on a Sunday", () => {
    // 1 Feb 2027 is a Monday; 31 Mar 2027 a Wednesday.
    expect(generationWindow("2027-03-10").first).toBe("2027-02-01");
    // 31 Jan 2027 is a Sunday.
    expect(generationWindow("2026-12-01").last).toBe("2027-01-31");
  });
});

describe("checkGenerationDates", () => {
  const today = "2026-10-18";

  it("accepts the window's own edges and refuses the day beyond each", () => {
    expect(checkGenerationDates(["2026-08-31"], today)).toBeNull();
    expect(checkGenerationDates(["2026-12-06"], today)).toBeNull();
    expect(checkGenerationDates(["2026-08-30"], today)).toEqual({ kind: "too_old", firstAllowed: "2026-08-31" });
    expect(checkGenerationDates(["2026-12-07"], today)).toEqual({ kind: "too_far", opensOn: "2026-11-01" });
  });

  it("lets a padding-week day through and names the right month for one past it", () => {
    expect(checkGenerationDates(["2026-12-03"], today)).toBeNull();
    // From November the window ends 3 Jan 2027, so 12 Jan opens on 1 December.
    expect(checkGenerationDates(["2027-01-12"], today)).toEqual({ kind: "too_far", opensOn: "2026-12-01" });
    // A day in a padding week of a later month opens a month earlier than its own.
    // From December the window ends 31 Jan; from November it ends 3 Jan.
    expect(checkGenerationDates(["2027-01-02"], today)).toEqual({ kind: "too_far", opensOn: "2026-11-01" });
  });

  it("refuses a set if any one date is outside, and the furthest date decides", () => {
    expect(checkGenerationDates(["2026-11-30", "2026-12-07"], today)).toEqual({
      kind: "too_far",
      opensOn: "2026-11-01",
    });
    expect(checkGenerationDates(["2026-12-07", "2027-03-15"], today)).toEqual({
      kind: "too_far",
      opensOn: "2027-02-01",
    });
  });

  it("prefers too_far over too_old when both happen", () => {
    expect(checkGenerationDates(["2026-01-05", "2027-01-12"], today)).toEqual({
      kind: "too_far",
      opensOn: "2026-12-01",
    });
  });

  it("returns null for an empty set", () => {
    expect(checkGenerationDates([], today)).toBeNull();
  });
});

describe("horizonMessage", () => {
  it("names the opening day in the genitive, with the year", () => {
    expect(horizonMessage({ kind: "too_far", opensOn: "2026-12-01" }, "day")).toBe(
      "Ten dzień będzie można zaplanować od 1 grudnia 2026.",
    );
    expect(horizonMessage({ kind: "too_far", opensOn: "2026-11-01" }, "week")).toBe(
      "Ten tydzień będzie można zaplanować od 1 listopada 2026.",
    );
  });

  it("says what is still possible for days before the window", () => {
    expect(horizonMessage({ kind: "too_old", firstAllowed: "2026-08-31" }, "day")).toBe(
      "Plany można generować od 31 sierpnia 2026 — wcześniejsze dni możesz przeglądać, poprawiać i drukować, ale nie generować.",
    );
    expect(horizonMessage({ kind: "too_old", firstAllowed: "2026-08-31" }, "week")).toContain("wcześniejsze tygodnie");
  });
});
