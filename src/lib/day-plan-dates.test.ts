import { describe, expect, it } from "vitest";

import { workingDaysOfMonth } from "./day-plan-dates";

function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

describe("workingDaysOfMonth", () => {
  it("gives September 2026 its 22 working days, starting on Tuesday the 1st", () => {
    const days = workingDaysOfMonth("2026-09");

    expect(days).toHaveLength(22);
    expect(days[0]).toBe("2026-09-01");
    expect(weekday(days[0])).toBe(2);
    expect(days[days.length - 1]).toBe("2026-09-30");
  });

  it("starts a month that opens on a Saturday on Monday the 3rd", () => {
    // August 2026 begins on a Saturday.
    expect(workingDaysOfMonth("2026-08")[0]).toBe("2026-08-03");
  });

  it("counts a leap-year February through the 29th", () => {
    const days = workingDaysOfMonth("2028-02");

    expect(days[days.length - 1]).toBe("2028-02-29");
    expect(days).toHaveLength(21);
  });

  it("never gives a weekend, a day outside the month, or a day twice", () => {
    for (const month of ["2026-01", "2026-02", "2026-05", "2026-08", "2026-09", "2026-11", "2026-12", "2028-02"]) {
      const days = workingDaysOfMonth(month);
      for (const day of days) {
        expect(day.startsWith(`${month}-`)).toBe(true);
        expect([0, 6]).not.toContain(weekday(day));
      }
      expect([...days].sort()).toEqual(days);
      expect(new Set(days).size).toBe(days.length);
      expect(days.length).toBeGreaterThanOrEqual(20);
      expect(days.length).toBeLessThanOrEqual(23);
    }
  });
});
