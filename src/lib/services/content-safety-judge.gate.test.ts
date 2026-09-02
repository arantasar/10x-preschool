import { describe, expect, it } from "vitest";
import { CONTENT_SAFETY_FIXTURES } from "./__fixtures__/content-safety";
import { judgeContentSafety } from "./content-safety-judge";

// Gate tier - excluded from `npm test` by `vitest.config.ts`, run only via
// `npm run test:gate` (requires a real `OPENROUTER_API_KEY`). This is the
// repeatable half of "bramka potrafi nie przejść": it catches judge drift on
// every run, unlike the one-off negative control in Phase 4's
// `negative-control.md`.
describe("content safety judge — calibration", () => {
  it.each(CONTENT_SAFETY_FIXTURES)("$name", async ({ input, expected }) => {
    const verdict = await judgeContentSafety(input);

    expect(verdict.safe).toBe(expected.safe);

    if (expected.safe) {
      expect(verdict.clause).toBeNull();
      expect(verdict.quote).toBeNull();
    } else {
      expect(verdict.clause).toBeTruthy();
      expect(verdict.quote).toBeTruthy();
      if (expected.clauseContains) {
        expect(verdict.clause?.toLowerCase()).toContain(expected.clauseContains.toLowerCase());
      }
      if (expected.quoteContains) {
        expect(verdict.quote?.toLowerCase()).toContain(expected.quoteContains.toLowerCase());
      }
    }
  });
});
