import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { FULL_MATRIX, GATE_MODES, gateScopeFor, parseChangedFiles } from "./gate-scope";

const FULL = { modes: GATE_MODES, full: true };

describe("gateScopeFor", () => {
  it("grades the full matrix when no file list is given (local run)", () => {
    expect(gateScopeFor(null)).toEqual(FULL);
  });

  it.each([
    ["src/lib/services/prompts/day-plan.pl.md", ["day-weekday", "day-themed"]],
    ["src/lib/services/prompts/week-outline.pl.md", ["day-themed", "week"]],
    ["src/lib/services/prompts/refine-activity.pl.md", ["activity"]],
    ["src/lib/services/prompts/refine-activity.schema.json", ["activity"]],
  ])("narrows %s to the modes it feeds", (file, modes) => {
    expect(gateScopeFor([file, "src/pages/plan/week.astro"])).toEqual({ modes, full: false });
  });

  it("unions the modes of several prompts, in matrix order", () => {
    expect(
      gateScopeFor(["src/lib/services/prompts/refine-activity.pl.md", "src/lib/services/prompts/week-outline.pl.md"]),
    ).toEqual({ modes: ["day-themed", "week", "activity"], full: false });
  });

  it("is the full matrix when the prompts together cover every mode", () => {
    expect(
      gateScopeFor([
        "src/lib/services/prompts/day-plan.pl.md",
        "src/lib/services/prompts/week-outline.pl.md",
        "src/lib/services/prompts/refine-activity.pl.md",
      ]),
    ).toEqual(FULL);
  });

  it.each([
    "src/lib/services/prompts/content-safety-rubric.pl.md",
    "src/lib/services/prompts/new-mode.pl.md",
    "src/lib/services/content-safety-judge.ts",
    "src/lib/services/content-safety-report.ts",
    "src/lib/services/allowed-models.ts",
    "src/lib/services/__fixtures__/content-safety.ts",
    "src/lib/services/gate-retry.ts",
    "src/lib/services/gate-scope.ts",
    "src/lib/services/activity-generator.ts",
    "src/lib/services/generation-error.ts",
    "src/lib/day-plan-limits.ts",
    "vitest.gate.config.ts",
  ])("widens to the full matrix when %s changes, even next to a single prompt", (file) => {
    expect(gateScopeFor(["src/lib/services/prompts/refine-activity.pl.md", file])).toEqual(FULL);
  });

  it("falls back to the full matrix when nothing in the list is gate-relevant", () => {
    expect(gateScopeFor(["src/pages/api/day-plan/refine.ts"])).toEqual(FULL);
  });
});

describe("FULL_MATRIX", () => {
  // The same expression decides whether CI runs the gate at all (`ci.yml`) and
  // how much of it (`gateScopeFor`). Two hand-kept copies that drift either
  // skip the gate or narrow it, both silently.
  it("is the path filter in ci.yml, character for character", () => {
    const ci = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(ci).toContain(`'${FULL_MATRIX.source.replaceAll("\\/", "/")}'`);
  });
});

describe("parseChangedFiles", () => {
  it("reads one path per line and drops blanks", () => {
    expect(parseChangedFiles("a.ts\n\n  b.ts  \n")).toEqual(["a.ts", "b.ts"]);
  });

  it.each([undefined, "", "\n \n"])("treats %j as no list", (raw) => {
    expect(parseChangedFiles(raw)).toBeNull();
  });
});
