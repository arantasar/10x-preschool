import { describe, expect, it } from "vitest";

import { formatAcceptedAt, formatPlanDate, formatWeekRange } from "@/lib/day-plan-dates";

import { planView, WEEK_DAYS_ISO, WEEK_START } from "./__fixtures__/week";
import { buildPrintWeek, DRAFT_LABEL, EMPTY_DAY_NOTE, pdfFileName } from "./model";

const ACCEPTED_AT = "2026-09-23T09:31:00Z";

describe("buildPrintWeek", () => {
  it("prints all five working days in calendar order even when nothing is planned", () => {
    const week = buildPrintWeek(WEEK_START, WEEK_DAYS_ISO, {});

    expect(week.days.map((day) => day.date)).toEqual(WEEK_DAYS_ISO);
    expect(week.days.map((day) => day.heading)).toEqual(WEEK_DAYS_ISO.map(formatPlanDate));
  });

  it("keeps calendar order when the days arrive shuffled", () => {
    const shuffled = [WEEK_DAYS_ISO[3], WEEK_DAYS_ISO[0], WEEK_DAYS_ISO[4], WEEK_DAYS_ISO[1], WEEK_DAYS_ISO[2]];

    expect(buildPrintWeek(WEEK_START, shuffled, {}).days.map((day) => day.date)).toEqual(WEEK_DAYS_ISO);
  });

  it("titles the week with its date range", () => {
    expect(buildPrintWeek(WEEK_START, WEEK_DAYS_ISO, {}).title).toBe(`Plan tygodnia — ${formatWeekRange(WEEK_START)}`);
  });

  it("says an unplanned day has no plan, and gives it nothing else", () => {
    const [day] = buildPrintWeek(WEEK_START, WEEK_DAYS_ISO, {}).days;

    expect(day.status).toBe("empty");
    expect(day.emptyNote).toBe(EMPTY_DAY_NOTE);
    expect(day.statusLabel).toBeNull();
    expect(day.prompt).toBeNull();
    expect(day.activities).toEqual([]);
  });

  it("labels a plan without acceptance as a working draft", () => {
    const date = WEEK_DAYS_ISO[2];
    const day = buildPrintWeek(WEEK_START, WEEK_DAYS_ISO, { [date]: planView(date, { acceptedAt: null }) }).days[2];

    expect(day.status).toBe("draft");
    expect(day.statusLabel).toBe(DRAFT_LABEL);
    expect(day.emptyNote).toBeNull();
  });

  it("labels an accepted plan with when it was accepted, and never as a draft", () => {
    const date = WEEK_DAYS_ISO[0];
    const day = buildPrintWeek(WEEK_START, WEEK_DAYS_ISO, { [date]: planView(date, { acceptedAt: ACCEPTED_AT }) })
      .days[0];

    expect(day.status).toBe("accepted");
    expect(day.statusLabel).toBe(`Zaakceptowano ${formatAcceptedAt(ACCEPTED_AT)}`);
    expect(day.statusLabel).not.toContain("SZKIC");
  });

  it("carries the hasło, and leaves a missing theme missing", () => {
    const date = WEEK_DAYS_ISO[1];
    const day = buildPrintWeek(WEEK_START, WEEK_DAYS_ISO, {
      [date]: planView(date, { prompt: "Kasztanowe ludziki", theme: null }),
    }).days[1];

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
    const day = buildPrintWeek(WEEK_START, WEEK_DAYS_ISO, { [date]: planView(date, { activities }) }).days[0];

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
