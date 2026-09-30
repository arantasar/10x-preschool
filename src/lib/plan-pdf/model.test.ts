import { describe, expect, it } from "vitest";

import {
  formatAcceptedAt,
  formatMonth,
  formatPlanDate,
  formatWeekRange,
  weeksOfMonth,
  workingDaysOfMonth,
} from "@/lib/day-plan-dates";

import { fullMonth, MONTH, MONTH_DAYS_ISO } from "./__fixtures__/month";
import { planView, WEEK_DAYS_ISO, WEEK_START } from "./__fixtures__/week";
import {
  buildPrintMonth,
  buildPrintWeek,
  DRAFT_LABEL,
  EMPTY_DAY_NOTE,
  monthPdfFileName,
  pdfFileName,
  printDays,
} from "./model";

const ACCEPTED_AT = "2026-09-23T09:31:00Z";

describe("buildPrintWeek", () => {
  it("prints all five working days in calendar order even when nothing is planned", () => {
    const week = buildPrintWeek(WEEK_START, WEEK_DAYS_ISO, {});

    expect(printDays(week).map((day) => day.date)).toEqual(WEEK_DAYS_ISO);
    expect(printDays(week).map((day) => day.heading)).toEqual(WEEK_DAYS_ISO.map(formatPlanDate));
  });

  it("keeps calendar order when the days arrive shuffled", () => {
    const shuffled = [WEEK_DAYS_ISO[3], WEEK_DAYS_ISO[0], WEEK_DAYS_ISO[4], WEEK_DAYS_ISO[1], WEEK_DAYS_ISO[2]];

    expect(printDays(buildPrintWeek(WEEK_START, shuffled, {})).map((day) => day.date)).toEqual(WEEK_DAYS_ISO);
  });

  it("titles the week with its date range", () => {
    expect(buildPrintWeek(WEEK_START, WEEK_DAYS_ISO, {}).title).toBe(`Plan tygodnia — ${formatWeekRange(WEEK_START)}`);
  });

  it("says an unplanned day has no plan, and gives it nothing else", () => {
    const [day] = printDays(buildPrintWeek(WEEK_START, WEEK_DAYS_ISO, {}));

    expect(day.status).toBe("empty");
    expect(day.emptyNote).toBe(EMPTY_DAY_NOTE);
    expect(day.statusLabel).toBeNull();
    expect(day.prompt).toBeNull();
    expect(day.activities).toEqual([]);
  });

  it("labels a plan without acceptance as a working draft", () => {
    const date = WEEK_DAYS_ISO[2];
    const doc = buildPrintWeek(WEEK_START, WEEK_DAYS_ISO, { [date]: planView(date, { acceptedAt: null }) });
    const day = printDays(doc)[2];

    expect(day.status).toBe("draft");
    expect(day.statusLabel).toBe(DRAFT_LABEL);
    expect(day.emptyNote).toBeNull();
  });

  it("labels an accepted plan with when it was accepted, and never as a draft", () => {
    const date = WEEK_DAYS_ISO[0];
    const doc = buildPrintWeek(WEEK_START, WEEK_DAYS_ISO, { [date]: planView(date, { acceptedAt: ACCEPTED_AT }) });
    const day = printDays(doc)[0];

    expect(day.status).toBe("accepted");
    expect(day.statusLabel).toBe(`Zatwierdzono ${formatAcceptedAt(ACCEPTED_AT)}`);
    expect(day.statusLabel).not.toContain("SZKIC");
  });

  it("carries the hasło, and leaves a missing theme missing", () => {
    const date = WEEK_DAYS_ISO[1];
    const doc = buildPrintWeek(WEEK_START, WEEK_DAYS_ISO, {
      [date]: planView(date, { prompt: "Kasztanowe ludziki", theme: null }),
    });
    const day = printDays(doc)[1];

    expect(day.prompt).toBe("Kasztanowe ludziki");
    expect(day.theme).toBeNull();
  });

  it("keeps the activities in the order they were given", () => {
    const date = WEEK_DAYS_ISO[0];
    const activities = [
      { title: "Pierwsza", description: "a" },
      { title: "Druga", description: "b" },
      { title: "Trzecia", description: "c" },
    ];
    const day = printDays(buildPrintWeek(WEEK_START, WEEK_DAYS_ISO, { [date]: planView(date, { activities }) }))[0];

    expect(day.activities).toEqual(activities);
  });
});

describe("pdfFileName", () => {
  it("names the day-per-page file after the Monday", () => {
    expect(pdfFileName(WEEK_START, "day-per-page")).toBe("plan-tygodnia-2026-09-14-dzien-na-strone.pdf");
  });

  it("names the week-per-page file after the Monday", () => {
    expect(pdfFileName(WEEK_START, "week-per-page")).toBe("plan-tygodnia-2026-09-14-tydzien-na-stronie.pdf");
  });
});

describe("buildPrintMonth", () => {
  it("gives September 2026 a row for each of its five weeks, titled with the month", () => {
    const doc = buildPrintMonth(MONTH, {});

    expect(doc.title).toBe(`Plan miesiąca — ${formatMonth(MONTH)}`);
    expect(doc.rows.map((row) => row.weekStart)).toEqual(weeksOfMonth(MONTH));
    expect(doc.rows).toHaveLength(5);
    for (const row of doc.rows) {
      expect(row.slots).toHaveLength(5);
    }
    expect(doc.rows[2].heading).toBe(`${doc.title} · ${formatWeekRange(doc.rows[2].weekStart)}`);
  });

  it("heads a partial week with the month's own days, not the neighbours' left blank", () => {
    const { title, rows } = buildPrintMonth(MONTH, {});

    expect(rows[0].heading).toBe(`${title} · 1 – 4 września 2026`);
    expect(rows[4].heading).toBe(`${title} · 28 – 30 września 2026`);
  });

  it("drops the week a weekend-start month borrows from the previous month", () => {
    // 1 August 2026 is a Saturday: the screen grid opens with 27–31 July, which
    // holds none of August's working days and must not become a blank page.
    const doc = buildPrintMonth("2026-08", {});

    expect(weeksOfMonth("2026-08")[0]).toBe("2026-07-27");
    expect(doc.rows.map((row) => row.weekStart)).toEqual(weeksOfMonth("2026-08").slice(1));
    expect(doc.rows[0].slots[0]?.date).toBe("2026-08-03");
    for (const row of doc.rows) {
      expect(row.slots.some((slot) => slot !== null)).toBe(true);
    }
    expect(printDays(doc).map((day) => day.date)).toEqual(workingDaysOfMonth("2026-08"));
  });

  it("leaves the neighbouring months' days as empty slots, not as days without a plan", () => {
    const [first] = buildPrintMonth(MONTH, {}).rows;
    const last = buildPrintMonth(MONTH, {}).rows[4];

    // Monday 31 August opens the first row; Tuesday 1 September is the month's first day.
    expect(first.slots[0]).toBeNull();
    expect(first.slots[1]?.date).toBe("2026-09-01");
    expect(first.slots[1]?.status).toBe("empty");
    // Thursday 1 and Friday 2 October close the last one.
    expect(last.slots[3]).toBeNull();
    expect(last.slots[4]).toBeNull();
  });

  it("prints every working day of the month and nothing else", () => {
    const days = printDays(buildPrintMonth(MONTH, {}));

    expect(days.map((day) => day.date)).toEqual(MONTH_DAYS_ISO);
    expect(days).toHaveLength(22);
  });

  it("says an unplanned day of the month has no plan", () => {
    const doc = buildPrintMonth(MONTH, { "2026-09-02": planView("2026-09-02") });
    const day = printDays(doc).find((printDay) => printDay.date === "2026-09-03");

    expect(day?.status).toBe("empty");
    expect(day?.emptyNote).toBe(EMPTY_DAY_NOTE);
  });

  it("ignores plans from outside the month, even ones that fall in its grid rows", () => {
    const doc = buildPrintMonth(MONTH, {
      "2026-08-31": planView("2026-08-31"),
      "2026-10-01": planView("2026-10-01"),
    });

    expect(doc.rows[0].slots[0]).toBeNull();
    expect(doc.rows[4].slots[3]).toBeNull();
    expect(printDays(doc).every((day) => day.status === "empty")).toBe(true);
  });

  it("marks a plan without acceptance as a draft, and an accepted one as accepted", () => {
    const plans = {
      ...fullMonth(),
      "2026-09-14": planView("2026-09-14", { acceptedAt: null }),
      "2026-09-15": planView("2026-09-15", { acceptedAt: "2026-09-23T09:31:00Z" }),
    };
    const days = printDays(buildPrintMonth(MONTH, plans));

    expect(days.find((day) => day.date === "2026-09-14")?.status).toBe("draft");
    expect(days.find((day) => day.date === "2026-09-15")?.status).toBe("accepted");
  });
});

describe("monthPdfFileName", () => {
  it("names the grid file after the month", () => {
    expect(monthPdfFileName(MONTH, "month-grid")).toBe("plan-miesiaca-2026-09-siatka.pdf");
  });

  it("names the week-by-week file after the month", () => {
    expect(monthPdfFileName(MONTH, "week-per-page")).toBe("plan-miesiaca-2026-09-tygodniami.pdf");
  });
});
