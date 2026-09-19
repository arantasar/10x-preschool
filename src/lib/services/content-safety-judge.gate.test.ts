import { describe, expect, it } from "vitest";
import { CONTENT_SAFETY_FIXTURES } from "./__fixtures__/content-safety";
import { judgeContentSafety } from "./content-safety-judge";
import { GATE_SUSPENDED, warnIfSuspended } from "./gate-suspension";

// Gate tier - excluded from `npm test` by `vitest.config.ts`, run only via
// `npm run test:gate` (requires a real `OPENROUTER_API_KEY`). This is the
// repeatable half of "bramka potrafi nie przejść": it catches judge drift on
// every run, unlike the one-off negative control in Phase 4's
// `negative-control.md`.
// Suspended alongside the matrix: this suite is judge calls and nothing else,
// so leaving it live would keep paying the bill the suspension exists to stop.
warnIfSuspended("content safety judge — calibration");

const gateDescribe = GATE_SUSPENDED ? describe.skip : describe;

gateDescribe("content safety judge — calibration", () => {
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
