import { describe, expect, it } from "vitest";

import { ALLOWED_MODELS, DEFAULT_MODEL, isAllowedModel, resolveModel } from "./allowed-models";
import { GenerationError } from "./generation-error";

// Nothing here touches `astro:env/server`: the allow-list is deliberately a
// plain module so both the runtime and the content-safety gate can read it
// without an Astro environment.

describe("resolveModel", () => {
  it.each([
    ["nothing configured", undefined, DEFAULT_MODEL],
    ["an empty value", "", DEFAULT_MODEL],
    ["a value on the list", "google/gemini-3.7-flash", "google/gemini-3.7-flash"],
    ["the default itself", DEFAULT_MODEL, DEFAULT_MODEL],
  ])("resolves %s to %s", (_name, configured, expected) => {
    expect(resolveModel(configured)).toBe(expected);
  });

  // The whole point of the module: an off-list value must be a loud config
  // failure, never a silent fallback to the default. A fallback would hide the
  // substitution this list exists to make visible.
  it("refuses a model that is not on the list", () => {
    const off = "deepseek/deepseek-v4-flash";

    expect(() => resolveModel(off)).toThrow(GenerationError);

    let thrown: unknown;
    try {
      resolveModel(off);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(GenerationError);
    const failure = thrown as GenerationError;
    expect(failure.category).toBe("config");
    expect(failure.retryable).toBe(false);
    // The reader has to learn which value was rejected and what was allowed
    // instead — a bare "bad model" sends them back to the dashboard blind.
    expect(failure.message).toContain(off);
    for (const allowed of ALLOWED_MODELS) {
      expect(failure.message).toContain(allowed);
    }
  });

  it("does not fall back to the default for an off-list value", () => {
    expect(() => resolveModel("openai/gpt-5.6-lunar")).toThrow(GenerationError);
  });
});

describe("the allow-list itself", () => {
  // Without this the list and the default can drift apart at the first edit,
  // and every request would then throw on a value nobody configured.
  it("contains DEFAULT_MODEL", () => {
    expect(ALLOWED_MODELS).toContain(DEFAULT_MODEL);
    expect(isAllowedModel(DEFAULT_MODEL)).toBe(true);
  });

  // The model that proposed melting wax to three-year-olds in the phase-5
  // comparison. `scripts/compare-models.sh` still grades it as a candidate;
  // configuration must not be able to reach it.
  it("excludes the disqualified model", () => {
    expect(isAllowedModel("deepseek/deepseek-v4-flash")).toBe(false);
  });

  it("has no duplicates and no empty entries", () => {
    expect(new Set(ALLOWED_MODELS).size).toBe(ALLOWED_MODELS.length);
    for (const model of ALLOWED_MODELS) {
      expect(model).toMatch(/^\S+\/\S+$/);
    }
  });
});
