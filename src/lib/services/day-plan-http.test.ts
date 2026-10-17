import { describe, expect, it } from "vitest";

import { fairUseExceeded } from "./day-plan-http";

// The refusal a teacher reads when the monthly limit is spent (FR-027). The date
// is the part that can go wrong silently: a nominative month ("1 listopad") or a
// day moved by a time zone would still look like a sentence.

describe("fairUseExceeded", () => {
  it("answers 429, not retryable, with the reset day in the body", async () => {
    const response = fairUseExceeded("2026-11-01");

    expect(response.status).toBe(429);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(await response.json()).toEqual({
      error: "Wykorzystano miesięczny limit generowania. Generowanie znów będzie możliwe od 1 listopada.",
      retryable: false,
      limit: { resets_on: "2026-11-01" },
    });
  });

  it("names a January reset in the genitive too", async () => {
    const body = (await fairUseExceeded("2027-01-01").json()) as { error: string };

    expect(body.error).toBe(
      "Wykorzystano miesięczny limit generowania. Generowanie znów będzie możliwe od 1 stycznia.",
    );
  });

  it("does not put a contact link inside the sentence - the island adds it", async () => {
    const body = (await fairUseExceeded("2026-11-01").json()) as { error: string };

    expect(body.error).not.toMatch(/napisz do nas/i);
  });

  it("still answers a true sentence when the date is unreadable", async () => {
    const response = fairUseExceeded("not-a-date");
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(429);
    expect(body.error).toBe(
      "Wykorzystano miesięczny limit generowania. Generowanie znów będzie możliwe od początku następnego miesiąca.",
    );
  });
});
