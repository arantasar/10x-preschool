import { describe, expect, it } from "vitest";
import type { ActivityDraft, DayTheme } from "@/types";
import { ALLOWED_MODELS } from "./allowed-models";
import { generateDayActivities, generateWeekOutline, refineActivity } from "./activity-generator";
import { CONTENT_SAFETY_FIXTURES, GATE_KEYWORDS, REFINE_GATE_CASES } from "./__fixtures__/content-safety";
import { judgeContentSafety, type JudgedVerdict, type JudgeInput } from "./content-safety-judge";
import { retryGateCall } from "./gate-retry";
import { gateScopeFor, parseChangedFiles, type GateMode } from "./gate-scope";
import { formatGateReport, writeGitHubStepSummary, type GateFinding } from "./content-safety-report";

// Gate tier - excluded from `npm test`, run only via `npm run test:gate`
// (requires a real `OPENROUTER_API_KEY`). This is the phase's centerpiece: every
// allowed model, every gate keyword, every reachable configuration, judged
// through the *production* path (`generateDayActivities` / `generateWeekOutline`
// with a model override) rather than a re-implementation of message building -
// the mistake `scripts/compare-models.sh` makes.
//
// One file, calibration first: the calibration tests below run before the
// matrix test (Vitest runs a file's tests in order), and the matrix refuses to
// start when any of them failed. Calibration alone, for the price of a few
// judge calls: `npm run test:gate -- -t calibration`.

/**
 * A fixed working week, chosen once so two runs of this gate are comparable -
 * the same reason `scripts/compare-models.sh`'s `WEEK_DATES` is fixed rather
 * than derived from today.
 */
const WEEK_DATES = ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"] as const;

/**
 * The modes this run grades - all of `GATE_MODES` unless CI passed the files a
 * PR changed (`GATE_CHANGED_FILES`, see `gate-scope.ts`). Every allowed model
 * is graded in every scope.
 *
 * `activity` is the refine path (`refine-activity.pl.md`, `follow-up-questions`),
 * driven by `REFINE_GATE_CASES` rather than `GATE_KEYWORDS`: its input is an
 * activity and an instruction, not a hasło. It merged without a run of this
 * gate while the gate was suspended (2026-09-19 to 2026-10-01); its first run
 * was clean on both models (`content-safety-gate-resume`, `gate-runs.md`).
 */
const SCOPE = gateScopeFor(parseChangedFiles(process.env.GATE_CHANGED_FILES));
const inScope = (mode: GateMode): boolean => SCOPE.modes.includes(mode);

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

function activityInput(instruction: string, activity: ActivityDraft): JudgeInput {
  return { kind: "activity", keyword: instruction, activity };
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
): Promise<JudgedVerdict | { readonly failed: true; readonly reason: string }> {
  try {
    return await retryGateCall(() => judgeContentSafety(input));
  } catch (error) {
    return { failed: true, reason: describeError(error) };
  }
}

/** Every judge verdict of the run, calibration included - one judge bill, one line in the report. */
const judgeCost = { total: 0, missing: 0, escalations: 0 };
function addJudgeCost(verdict: JudgedVerdict): void {
  if (verdict.cost === null) {
    judgeCost.missing += 1;
  } else {
    judgeCost.total += verdict.cost;
  }
  if (verdict.escalated) {
    judgeCost.escalations += 1;
  }
}

const calibrationFailures: string[] = [];

interface Combo {
  readonly model: string;
  readonly keyword: string;
}

// The repeatable half of "bramka potrafi nie przejść": it catches judge drift
// on every run, unlike the one-off negative control in `negative-control.md`.
describe("content safety judge — calibration", () => {
  it.each(CONTENT_SAFETY_FIXTURES)("$name", async ({ name, input, expected }) => {
    try {
      const verdict = await judgeContentSafety(input);
      addJudgeCost(verdict);

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
    } catch (error) {
      calibrationFailures.push(name);
      throw error;
    }
  });
});

describe("content safety gate — live matrix", () => {
  it(
    "każdy dopuszczony model × każde hasło × każdy osiągalny tryb jest bezpieczny",
    async () => {
      // State sequencing (Critical Implementation Details): a judge that
      // mis-scores a known fixture must stop the run, not produce a green
      // matrix it scored - the worst outcome the gate could produce.
      if (calibrationFailures.length > 0) {
        throw new Error(
          `Sędzia oblał kalibrację (${calibrationFailures.join("; ")}) — macierz żywych wywołań wstrzymana.`,
        );
      }

      const findings: GateFinding[] = [];

      // Summed over every successful generation call; a `null` cost is missing
      // data, counted separately rather than as zero.
      const generationCost = { total: 0, missing: 0 };
      function addCost(cost: number | null): void {
        if (cost === null) {
          generationCost.missing += 1;
        } else {
          generationCost.total += cost;
        }
      }

      function record(mode: GateMode, model: string, keyword: string, clause: string, quote: string): void {
        findings.push({ model, keyword, mode, clause, quote });
      }

      async function judge(mode: GateMode, model: string, keyword: string, input: JudgeInput): Promise<void> {
        const verdict = await judgeSafely(input);
        if ("failed" in verdict) {
          record(mode, model, keyword, "Awaria sędziego", verdict.reason);
          return;
        }
        addJudgeCost(verdict);
        if (!verdict.safe) {
          record(mode, model, keyword, verdict.clause ?? "(brak nazwy klauzuli)", verdict.quote ?? "(brak cytatu)");
        }
      }

      const combos: Combo[] = ALLOWED_MODELS.flatMap((model) => GATE_KEYWORDS.map((keyword) => ({ model, keyword })));

      // `day-themed` needs the outline for its theme, so the outline is
      // generated whenever either of the two is in scope; it is only *judged*
      // as `week` when `week` is.
      const needsOutline = inScope("week") || inScope("day-themed");
      const dayModes = needsOutline || inScope("day-weekday");

      await mapWithConcurrency(dayModes ? combos : [], GATE_CONCURRENCY, async ({ model, keyword }) => {
        const [outline, dayWeekday] = await Promise.allSettled([
          needsOutline
            ? generateWeekOutline(keyword, WEEK_DATES, { model })
            : Promise.reject(new Error("poza zakresem")),
          inScope("day-weekday")
            ? generateDayActivities(keyword, { planDate: WEEK_DATES[0] }, { model })
            : Promise.reject(new Error("poza zakresem")),
        ]);

        if (outline.status === "fulfilled") {
          addCost(outline.value.cost);
          if (inScope("week")) {
            await judge("week", model, keyword, weekInput(keyword, outline.value.themes));
          }
        } else if (needsOutline) {
          record("week", model, keyword, "Awaria wywołania", String(outline.reason));
        }

        if (dayWeekday.status === "fulfilled") {
          addCost(dayWeekday.value.cost);
          await judge("day-weekday", model, keyword, dayInput(keyword, dayWeekday.value.activities));
        } else if (inScope("day-weekday")) {
          record("day-weekday", model, keyword, "Awaria wywołania", String(dayWeekday.reason));
        }

        // `day-themed` reuses the outline this pair already paid for, rather than
        // requesting a second one - the theme a real week generation would hand
        // this day. Skipped, not failed, when the outline itself failed: a
        // themed run without its own model's theme would measure a configuration
        // that cannot occur in production (`scripts/compare-models.sh`'s
        // precedent for the same skip).
        if (inScope("day-themed") && outline.status === "fulfilled") {
          const theme = outline.value.themes[0]?.theme;
          if (theme) {
            const themed = await generateDayActivities(keyword, { planDate: WEEK_DATES[0], theme }, { model }).then(
              (value) => ({ status: "fulfilled" as const, value }),
              (reason: unknown) => ({ status: "rejected" as const, reason }),
            );
            if (themed.status === "fulfilled") {
              addCost(themed.value.cost);
              await judge("day-themed", model, keyword, dayInput(keyword, themed.value.activities));
            } else {
              record("day-themed", model, keyword, "Awaria wywołania", String(themed.reason));
            }
          }
        }
      });

      // The refine path: every allowed model × every fixed case, through the
      // production `refineActivity`. The case name stands in the report's
      // hasło column; the instruction itself reaches the judge in its input.
      const refineCombos = inScope("activity")
        ? ALLOWED_MODELS.flatMap((model) => REFINE_GATE_CASES.map((refineCase) => ({ model, refineCase })))
        : [];
      await mapWithConcurrency(refineCombos, GATE_CONCURRENCY, async ({ model, refineCase }) => {
        try {
          const refined = await refineActivity(refineCase.activity, refineCase.instruction, { model });
          addCost(refined.cost);
          await judge("activity", model, refineCase.name, activityInput(refineCase.instruction, refined.activity));
        } catch (error) {
          record("activity", model, refineCase.name, "Awaria wywołania", describeError(error));
        }
      });

      const report = formatGateReport({
        models: ALLOWED_MODELS,
        modes: SCOPE.modes,
        findings,
        fullMatrix: SCOPE.full,
        generationCost,
        judgeCost,
      });
      // eslint-disable-next-line no-console -- the report is the gate's actual product; it must reach stdout.
      console.log(report);
      writeGitHubStepSummary(report);

      for (const model of ALLOWED_MODELS) {
        expect(report).toContain(model);
      }
      for (const mode of SCOPE.modes) {
        expect(report).toContain(mode);
      }

      expect(findings).toEqual([]);
    },
    10 * 60_000,
  );
});
