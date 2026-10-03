import { describe, expect, it } from "vitest";

import { formatGateReport, type GateFinding, type GateReportInput } from "./content-safety-report";

// Pure function, no network. The live matrix (`content-safety.gate.test.ts`)
// asserts `expect(report).toContain(model)` / `toContain(mode)` on this output,
// so those properties are pinned here too, where they cost nothing to check.

const MODELS = ["openai/gpt-5.6-luna", "google/gemini-3.7-flash"];
const MODES = ["day-weekday", "day-themed", "week", "activity"];

const FINDING: GateFinding = {
  model: "google/gemini-3.7-flash",
  keyword: "Andrzejki",
  mode: "day-weekday",
  clause: "Ogień i gorące substancje",
  quote: "Nauczyciel topi wosk",
};

function input(overrides: Partial<GateReportInput> = {}): GateReportInput {
  return {
    models: MODELS,
    modes: MODES,
    findings: [],
    fullMatrix: true,
    generationCost: { total: 0.12345, missing: 0 },
    judgeCost: { total: 0.0456, missing: 0, escalations: 2 },
    ...overrides,
  };
}

describe("formatGateReport", () => {
  describe.each([
    ["zielona", [] as GateFinding[]],
    ["czerwona", [FINDING]],
  ])("gałąź %s", (_branch, findings) => {
    it("names every model and every mode from the input", () => {
      const report = formatGateReport(input({ findings }));

      for (const model of MODELS) {
        expect(report).toContain(model);
      }
      for (const mode of MODES) {
        expect(report).toContain(mode);
      }
    });

    it("prints the generation cost and the judge cost with its escalations", () => {
      const report = formatGateReport(input({ findings }));

      expect(report).toContain("Koszt generowania: 0.1235 USD");
      expect(report).toContain("Koszt sędziego: 0.0456 USD");
      expect(report).toContain("eskalacje do sędziego końcowego: 2");
    });

    it("names how many generation and judge calls returned no cost", () => {
      const report = formatGateReport(
        input({
          findings,
          generationCost: { total: 0.5, missing: 3 },
          judgeCost: { total: 0.1, missing: 4, escalations: 0 },
        }),
      );

      expect(report).toContain("3 wywołań bez kosztu");
      expect(report).toContain("4 wywołań bez kosztu");
    });

    it("says outright when a run was not the full matrix", () => {
      expect(formatGateReport(input({ findings }))).toContain("Zakres: pełna macierz.");
      expect(formatGateReport(input({ findings, fullMatrix: false }))).toContain(
        "To nie jest przebieg pełnej macierzy.",
      );
    });
  });

  it("says every call returned a cost when none is missing", () => {
    expect(formatGateReport(input())).toContain("każde wywołanie zwróciło koszt");
  });

  it("heads a clean run with zero violations and a red run with the finding", () => {
    expect(formatGateReport(input())).toContain("0 naruszeń");

    const red = formatGateReport(input({ findings: [FINDING] }));
    expect(red).toContain("1 naruszenie(a)");
    expect(red).toContain(FINDING.quote);
  });
});
