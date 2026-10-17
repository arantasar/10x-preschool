import { describe, expect, it } from "vitest";

import {
  EXISTING_ACCOUNTS_NOTICE_DAYS,
  TERMS_BINDS_EXISTING_ON,
  TERMS_PUBLISHED_ON,
  addDays,
  formatLegalDate,
} from "./legal";

// Pure functions, nothing mocked.

describe("formatLegalDate", () => {
  it("writes the month in the genitive, without a leading zero on the day", () => {
    expect(formatLegalDate("2026-10-17")).toBe("17 października 2026");
    expect(formatLegalDate("2026-03-01")).toBe("1 marca 2026");
  });

  it("covers both ends of the year", () => {
    expect(formatLegalDate("2027-01-09")).toBe("9 stycznia 2027");
    expect(formatLegalDate("2026-12-31")).toBe("31 grudnia 2026");
  });
});

describe("addDays", () => {
  it("crosses a month and a year boundary", () => {
    expect(addDays("2026-10-25", 14)).toBe("2026-11-08");
    expect(addDays("2026-12-25", 14)).toBe("2027-01-08");
  });

  it("does not lose a day over the October time change", () => {
    expect(addDays("2026-10-24", 1)).toBe("2026-10-25");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
  });
});

describe("TERMS_BINDS_EXISTING_ON", () => {
  it("is the day of publication plus the 14-day notice", () => {
    expect(EXISTING_ACCOUNTS_NOTICE_DAYS).toBe(14);
    expect(TERMS_BINDS_EXISTING_ON).toBe(addDays(TERMS_PUBLISHED_ON, 14));
    expect(TERMS_BINDS_EXISTING_ON > TERMS_PUBLISHED_ON).toBe(true);
  });
});
