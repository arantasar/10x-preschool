import { appendFileSync } from "node:fs";

/**
 * The gate cannot block a merge (`403` on branch protection — `test-plan.md
 * §5`), so its only enforcement is a human reading the check before clicking
 * merge. Every field here exists for that reader: which model, which hasło,
 * which mode, which rubric clause, and — the one that actually does the
 * convincing — a verbatim quote, the sentence a reader recognizes as wrong in a
 * second, the way "Lanie wosku" was recognized.
 */
export interface GateFinding {
  readonly model: string;
  readonly keyword: string;
  readonly mode: string;
  readonly clause: string;
  readonly quote: string;
}

/**
 * Sum of `usage.cost` over a run's calls, in OpenRouter credits (USD).
 * `missing` counts calls that returned no cost - unknown, not free.
 */
export interface GateCost {
  readonly total: number;
  readonly missing: number;
}

/** Every judge verdict in the run, calibration included. `escalations` counts screening verdicts sent to the final judge. */
export interface GateJudgeCost extends GateCost {
  readonly escalations: number;
}

export interface GateReportInput {
  readonly models: readonly string[];
  readonly modes: readonly string[];
  readonly findings: readonly GateFinding[];
  /** `false` when CI narrowed the modes to the prompts a PR changed (`gate-scope.ts`). */
  readonly fullMatrix: boolean;
  readonly generationCost: GateCost;
  readonly judgeCost: GateJudgeCost;
}

function missingNote(missing: number): string {
  return missing === 0 ? "każde wywołanie zwróciło koszt" : `${missing} wywołań bez kosztu w odpowiedzi`;
}

function formatCostLines(generation: GateCost, judge: GateJudgeCost): string {
  return [
    `Koszt generowania: ${generation.total.toFixed(4)} USD (${missingNote(generation.missing)}).`,
    `Koszt sędziego: ${judge.total.toFixed(4)} USD (${missingNote(judge.missing)}; eskalacje do sędziego końcowego: ${judge.escalations}; z kalibracją).`,
  ].join("\n");
}

function formatScopeLine(fullMatrix: boolean): string {
  return fullMatrix
    ? "Zakres: pełna macierz."
    : "Zakres: tylko tryby zmienionych promptów. To nie jest przebieg pełnej macierzy.";
}

/**
 * Human-readable report for stdout and `GITHUB_STEP_SUMMARY`.
 *
 * Always names every model and every mode the run attempted — not just the
 * ones that produced a finding — so "bramka pokryła każdy dopuszczony model"
 * is something the report itself proves, not something that has to be taken on
 * faith from the test file.
 */
export function formatGateReport({
  models,
  modes,
  findings,
  fullMatrix,
  generationCost,
  judgeCost,
}: GateReportInput): string {
  const coverage = [
    `Modele: ${models.join(", ")}`,
    `Tryby: ${modes.join(", ")}`,
    `Hasła × modele × tryby przebiegnięte: ${models.length} model(e), ${modes.length} tryb(y).`,
    formatScopeLine(fullMatrix),
    formatCostLines(generationCost, judgeCost),
  ].join("\n");

  if (findings.length === 0) {
    return ["## Bramka bezpieczeństwa treści — 0 naruszeń", coverage].join("\n\n");
  }

  const rows = findings.map(
    (finding, index) =>
      `${index + 1}. **${finding.model}** / hasło „${finding.keyword}" / tryb \`${finding.mode}\`\n` +
      `   Klauzula: ${finding.clause}\n` +
      `   Cytat: „${finding.quote}"`,
  );

  return [`## Bramka bezpieczeństwa treści — ${findings.length} naruszenie(a)`, coverage, rows.join("\n")].join("\n\n");
}

/**
 * Appends the report to the CI job summary when running under GitHub Actions.
 * Locally `GITHUB_STEP_SUMMARY` is unset, so this is a no-op — the report still
 * reaches the reader through stdout either way.
 */
export function writeGitHubStepSummary(report: string): void {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    return;
  }
  appendFileSync(summaryPath, `\n${report}\n`);
}
