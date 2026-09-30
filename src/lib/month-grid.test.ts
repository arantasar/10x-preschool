import { describe, expect, it } from "vitest";

import { weeksOfMonth } from "./day-plan-dates";
import {
  acceptedCountLabel,
  clipText,
  LABEL_PART_MAX,
  monthCounts,
  monthRows,
  PREVIEW_DESCRIPTION_MAX,
  tileLabel,
  weekendLinkText,
  weekendPlans,
  weekLinkLabel,
} from "./month-grid";
import type { DayPlanSummary } from "@/types";

function plan(planDate: string, prompt: string, accepted = false, theme: string | null = null): DayPlanSummary {
  return { plan_date: planDate, prompt, accepted, theme };
}

describe("tileLabel", () => {
  it("names an empty day as having no plan", () => {
    expect(tileLabel("2026-11-09", undefined)).toBe("Plan na 2026-11-09 — brak planu");
  });

  it("puts the content before the state, with the theme when there is one", () => {
    expect(
      tileLabel("2026-11-09", { plan_date: "2026-11-09", prompt: "Dinozaury", accepted: true, theme: "Tropy" }),
    ).toBe("Plan na 2026-11-09 — Dinozaury — Tropy — zatwierdzony");
  });

  it("keeps a single member for a day without a theme", () => {
    expect(tileLabel("2026-11-09", { plan_date: "2026-11-09", prompt: "Jesień", accepted: false, theme: null })).toBe(
      "Plan na 2026-11-09 — Jesień — do przejrzenia",
    );
  });

  it("clips an overlong hasło so the state is not buried", () => {
    const label = tileLabel("2026-11-09", {
      plan_date: "2026-11-09",
      prompt: "a".repeat(500),
      accepted: false,
      theme: null,
    });
    expect(label).toBe(`Plan na 2026-11-09 — ${"a".repeat(LABEL_PART_MAX - 1)}… — do przejrzenia`);
  });
});

describe("clipText", () => {
  it("passes text within the bound through untouched", () => {
    expect(clipText("Krótki opis", PREVIEW_DESCRIPTION_MAX)).toBe("Krótki opis");
    expect(clipText("x".repeat(10), 10)).toBe("x".repeat(10));
  });

  it("cuts to the bound, ellipsis included", () => {
    const clipped = clipText("y".repeat(PREVIEW_DESCRIPTION_MAX * 3), PREVIEW_DESCRIPTION_MAX);
    expect(clipped).toHaveLength(PREVIEW_DESCRIPTION_MAX);
    expect(clipped.endsWith("…")).toBe(true);
  });

  it("does not leave a space before the ellipsis", () => {
    expect(clipText("słowo drugie trzecie", 7)).toBe("słowo…");
  });
});

describe("monthRows", () => {
  it("drops a week whose working days all lie in the previous month", () => {
    // August 2026 starts on a Saturday: `weeksOfMonth` opens with 27 July.
    const weeks = weeksOfMonth("2026-08");
    expect(weeks[0]).toBe("2026-07-27");

    const rows = monthRows("2026-08", weeks, []);
    expect(rows.map((row) => row.monday)).toEqual([
      "2026-08-03",
      "2026-08-10",
      "2026-08-17",
      "2026-08-24",
      "2026-08-31",
    ]);
  });

  it("never yields more than five rows", () => {
    for (let monthNumber = 1; monthNumber <= 12; monthNumber++) {
      for (const year of [2026, 2027, 2028]) {
        const month = `${String(year)}-${String(monthNumber).padStart(2, "0")}`;
        expect(monthRows(month, weeksOfMonth(month), []).length).toBeLessThanOrEqual(5);
      }
    }
  });

  it("marks the days of a neighbouring month and names only its own in the range", () => {
    // October 2026 starts on a Thursday and ends on a Saturday.
    const rows = monthRows("2026-10", weeksOfMonth("2026-10"), []);

    expect(rows[0].days.map((day) => day.inMonth)).toEqual([false, false, false, true, true]);
    expect(rows[0].days.map((day) => day.date)).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
    ]);
    expect(rows[0].rangeLabel).toBe("1–2 października");
    expect(rows[1].rangeLabel).toBe("5–9 października");
    expect(rows[4].rangeLabel).toBe("26–30 października");
  });

  it("names a single in-month day without a range", () => {
    // August 2026 ends on a Monday.
    const rows = monthRows("2026-08", weeksOfMonth("2026-08"), []);
    expect(rows[rows.length - 1].rangeLabel).toBe("31 sierpnia");
  });

  it("has no heading and is empty when the week has no plans", () => {
    const [row] = monthRows("2026-10", ["2026-10-05"], []);
    expect(row.heading).toBeNull();
    expect(row.isEmpty).toBe(true);
    expect(weekLinkLabel(row)).toBe("Tydzień 5–9 października — bez tematu");
  });

  it("uses the one hasło of a week planned in one go", () => {
    const summaries = ["2026-10-05", "2026-10-06", "2026-10-07"].map((date) => plan(date, "Dinozaury"));
    const [row] = monthRows("2026-10", ["2026-10-05"], summaries);

    expect(row.heading).toBe("Dinozaury");
    expect(row.isEmpty).toBe(false);
    expect(row.days.map((day) => day.summary?.plan_date)).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      undefined,
      undefined,
    ]);
    expect(weekLinkLabel(row)).toBe("Tydzień 5–9 października — Dinozaury");
  });

  it("joins different hasła in the order the week first uses them", () => {
    const summaries = [
      plan("2026-10-08", "Kosmos"),
      plan("2026-10-05", "Jesień"),
      plan("2026-10-06", "Kosmos"),
      plan("2026-10-07", "Jesień"),
    ];
    const [row] = monthRows("2026-10", ["2026-10-05"], summaries);
    expect(row.heading).toBe("Jesień, Kosmos");
  });

  it("clips each hasło on its own", () => {
    const summaries = [plan("2026-10-05", "a".repeat(200)), plan("2026-10-06", "Kosmos")];
    const [row] = monthRows("2026-10", ["2026-10-05"], summaries);
    expect(row.heading).toBe(`${"a".repeat(LABEL_PART_MAX - 1)}…, Kosmos`);
  });

  it("ignores a plan on a neighbouring month's day when naming the week", () => {
    // 30 September sits in the first row of October, as a blank.
    const [row] = monthRows("2026-10", ["2026-09-28"], [plan("2026-09-30", "Wrzesień")]);
    expect(row.heading).toBeNull();
    expect(row.isEmpty).toBe(true);
  });
});

describe("monthCounts", () => {
  it("counts the month's working days by state", () => {
    const summaries = [
      plan("2026-10-01", "Jesień", true),
      plan("2026-10-02", "Jesień", true),
      plan("2026-10-05", "Dinozaury"),
      // A weekend plan and a neighbouring month's plan: neither is counted.
      plan("2026-10-10", "Sobota", true),
      plan("2026-09-30", "Wrzesień", true),
    ];
    // October 2026 has 22 working days.
    expect(monthCounts("2026-10", summaries)).toEqual({ accepted: 2, draft: 1, empty: 19 });
  });

  it("counts every working day as empty in an unplanned month", () => {
    expect(monthCounts("2026-10", [])).toEqual({ accepted: 0, draft: 0, empty: 22 });
  });
});

describe("acceptedCountLabel", () => {
  it("agrees the adjective with the number", () => {
    expect(acceptedCountLabel(0)).toBe("0 zatwierdzonych");
    expect(acceptedCountLabel(1)).toBe("1 zatwierdzony");
    expect(acceptedCountLabel(2)).toBe("2 zatwierdzone");
    expect(acceptedCountLabel(4)).toBe("4 zatwierdzone");
    expect(acceptedCountLabel(5)).toBe("5 zatwierdzonych");
    expect(acceptedCountLabel(12)).toBe("12 zatwierdzonych");
    expect(acceptedCountLabel(21)).toBe("21 zatwierdzonych");
    expect(acceptedCountLabel(22)).toBe("22 zatwierdzone");
  });
});

describe("weekendPlans", () => {
  it("returns the month's Saturday and Sunday plans in calendar order", () => {
    const summaries = [
      plan("2026-10-11", "Niedziela"),
      plan("2026-10-05", "Dinozaury"),
      plan("2026-10-10", "Sobota"),
      // A weekend of the neighbouring month.
      plan("2026-11-01", "Listopad"),
    ];
    expect(weekendPlans("2026-10", summaries).map((summary) => summary.plan_date)).toEqual([
      "2026-10-10",
      "2026-10-11",
    ]);
  });

  it("is empty when no weekend is planned", () => {
    expect(weekendPlans("2026-10", [plan("2026-10-05", "Dinozaury")])).toEqual([]);
  });
});

describe("weekendLinkText", () => {
  it("shows the short weekday and the day number", () => {
    expect(weekendLinkText("2026-10-10")).toBe("sob. 10");
    expect(weekendLinkText("2026-10-11")).toBe("niedz. 11");
  });
});
