import { beforeAll, describe, expect, it } from "vitest";
import type { ActivityDraft, DayTheme } from "@/types";
import { ALLOWED_MODELS } from "./allowed-models";
import { generateDayActivities, generateWeekOutline } from "./activity-generator";
import { CONTENT_SAFETY_FIXTURES, GATE_KEYWORDS } from "./__fixtures__/content-safety";
import { judgeContentSafety, type JudgeInput, type SafetyVerdict } from "./content-safety-judge";
import { retryGateCall } from "./gate-retry";
import { formatGateReport, writeGitHubStepSummary, type GateFinding } from "./content-safety-report";

// Gate tier - excluded from `npm test`, run only via `npm run test:gate`
// (requires a real `OPENROUTER_API_KEY`). This is the phase's centerpiece: every
// allowed model, every gate keyword, every reachable configuration, judged
// through the *production* path (`generateDayActivities` / `generateWeekOutline`
// with a model override) rather than a re-implementation of message building -
// the mistake `scripts/compare-models.sh` makes.

/**
 * A fixed working week, chosen once so two runs of this gate are comparable -
 * the same reason `scripts/compare-models.sh`'s `WEEK_DATES` is fixed rather
 * than derived from today.
 */
const WEEK_DATES = ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"] as const;

/**
 * The three reachable day configurations plus the week outline -
 * `activity-generator.ts:100-111` and the S-03 implementation review: coverage
 * counts per configuration, not per prompt.
 */
const GATE_MODES = ["day", "day-weekday", "day-themed", "week"] as const;
type GateMode = (typeof GATE_MODES)[number];

/**
 * How many `{model, keyword}` combos run at once. Bounded by OpenRouter's
 * *in-flight* credit reservation, not by the account's total balance - measured
 * live: at concurrency 8 the matrix threw `402
 * "in_flight_budget_exhausted"` on the majority of `google/gemini-3.7-flash`
 * calls (5x pricier per token than the default model, per `allowed-models.ts`)
 * and on concurrent judge calls, even though the account had credits left and
 * every *sequential* call succeeded. This is deliberately conservative rather
 * than tuned to the exact ceiling - the ceiling scales with account balance
 * (`remedy_hint` in the 402 body), so a fixed high number would be a time bomb
 * for whichever account funds the CI secret.
 */
const GATE_CONCURRENCY = 3;

/** Runs `items` through `fn`, at most `limit` in flight at once. */
async function mapWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) {
        return;
      }
      await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

function dayInput(keyword: string, activities: readonly ActivityDraft[]): JudgeInput {
  return { kind: "day", keyword, activities };
}

function weekInput(keyword: string, themes: readonly DayTheme[]): JudgeInput {
  return { kind: "week", keyword, themes };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * `content-safety-judge.ts` deliberately carries no retry policy of its own -
 * its own comment names this phase as the owner of "retry transient transport
 * failures only, never a safety verdict" for the live matrix. Retry policy
 * itself lives in `gate-retry.ts` (transient transport failures, plus the
 * matrix's own 402 in-flight-budget collisions); a verdict the judge actually
 * returned - safe or not - is never retried, because a retried verdict is a
 * gate hunting for green.
 */
async function judgeSafely(
  input: JudgeInput,
): Promise<SafetyVerdict | { readonly failed: true; readonly reason: string }> {
  try {
    return await retryGateCall(() => judgeContentSafety(input));
  } catch (error) {
    return { failed: true, reason: describeError(error) };
  }
}

interface Combo {
  readonly model: string;
  readonly keyword: string;
}

describe("content safety gate — live matrix", () => {
  // State sequencing (Critical Implementation Details): the judge is graded on
  // every calibration fixture *before* the live matrix runs. A judge that
  // mis-scores a known fixture must stop the run, not produce a green matrix it
  // scored - that would be the worst outcome the gate could produce.
  beforeAll(async () => {
    for (const fixture of CONTENT_SAFETY_FIXTURES) {
      const verdict = await judgeContentSafety(fixture.input);
      if (verdict.safe !== fixture.expected.safe) {
        throw new Error(
          `Sędzia oblał kalibrację na fixture "${fixture.name}" (oczekiwano safe=${fixture.expected.safe}, ` +
            `otrzymano safe=${verdict.safe}) — macierz żywych wywołań wstrzymana.`,
        );
      }
    }
  }, 120_000);

  it(
    "każdy dopuszczony model × każde hasło × każdy osiągalny tryb jest bezpieczny",
    async () => {
      const findings: GateFinding[] = [];

      function record(mode: GateMode, model: string, keyword: string, clause: string, quote: string): void {
        findings.push({ model, keyword, mode, clause, quote });
      }

      async function judge(mode: GateMode, model: string, keyword: string, input: JudgeInput): Promise<void> {
        const verdict = await judgeSafely(input);
        if ("failed" in verdict) {
          record(mode, model, keyword, "Awaria sędziego", verdict.reason);
        } else if (!verdict.safe) {
          record(mode, model, keyword, verdict.clause ?? "(brak nazwy klauzuli)", verdict.quote ?? "(brak cytatu)");
        }
      }

      const combos: Combo[] = ALLOWED_MODELS.flatMap((model) => GATE_KEYWORDS.map((keyword) => ({ model, keyword })));

      await mapWithConcurrency(combos, GATE_CONCURRENCY, async ({ model, keyword }) => {
        const [outline, day, dayWeekday] = await Promise.allSettled([
          generateWeekOutline(keyword, WEEK_DATES, { model }),
          generateDayActivities(keyword, undefined, { model }),
          generateDayActivities(keyword, { planDate: WEEK_DATES[0] }, { model }),
        ]);

        if (outline.status === "fulfilled") {
          await judge("week", model, keyword, weekInput(keyword, outline.value.themes));
        } else {
          record("week", model, keyword, "Awaria wywołania", String(outline.reason));
        }

        if (day.status === "fulfilled") {
          await judge("day", model, keyword, dayInput(keyword, day.value.activities));
        } else {
          record("day", model, keyword, "Awaria wywołania", String(day.reason));
        }

        if (dayWeekday.status === "fulfilled") {
          await judge("day-weekday", model, keyword, dayInput(keyword, dayWeekday.value.activities));
        } else {
          record("day-weekday", model, keyword, "Awaria wywołania", String(dayWeekday.reason));
        }

        // `day-themed` reuses the outline this pair already paid for, rather than
        // requesting a second one - the theme a real week generation would hand
        // this day. Skipped, not failed, when the outline itself failed: a
        // themed run without its own model's theme would measure a configuration
        // that cannot occur in production (`scripts/compare-models.sh`'s
        // precedent for the same skip).
        if (outline.status === "fulfilled") {
          const theme = outline.value.themes[0]?.theme;
          if (theme) {
            const themed = await generateDayActivities(keyword, { planDate: WEEK_DATES[0], theme }, { model }).then(
              (value) => ({ status: "fulfilled" as const, value }),
              (reason: unknown) => ({ status: "rejected" as const, reason }),
            );
            if (themed.status === "fulfilled") {
              await judge("day-themed", model, keyword, dayInput(keyword, themed.value.activities));
            } else {
              record("day-themed", model, keyword, "Awaria wywołania", String(themed.reason));
            }
          }
        }
      });

      const report = formatGateReport({ models: ALLOWED_MODELS, modes: GATE_MODES, findings });
      // eslint-disable-next-line no-console -- the report is the gate's actual product; it must reach stdout.
      console.log(report);
      writeGitHubStepSummary(report);

      for (const model of ALLOWED_MODELS) {
        expect(report).toContain(model);
      }
      for (const mode of GATE_MODES) {
        expect(report).toContain(mode);
      }

      expect(findings).toEqual([]);
    },
    10 * 60_000,
  );
});
