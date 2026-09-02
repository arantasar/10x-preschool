import { GenerationError } from "./generation-error";

/**
 * The set of models `OPENROUTER_MODEL` may name.
 *
 * This lives in its own file rather than as a constant in `activity-generator.ts`
 * for two reasons. The content-safety gate's CI path filter sits on this file, and
 * `activity-generator.ts` changes roughly weekly — the gate would then run on
 * edits that have nothing to do with safety. And the list is the gate's referent:
 * "every allowed model" needs one committed place that says which those are.
 *
 * The cost of this module, stated deliberately because it is a real loss:
 * `OPENROUTER_MODEL` existed so the model could change without a deploy. It no
 * longer can. A new model now needs a commit, a gate run, and a deploy. That is
 * exactly the price `lessons.md` #3 asks for — the prompt is the only layer
 * standing between the model and a teacher, so a model the gate has never graded
 * must not be reachable by editing a Cloudflare dashboard field.
 *
 * `deepseek/deepseek-v4-flash` is **not** on this list and is not a fallback
 * candidate: in the phase-5 comparison it proposed melting wax in a room of
 * three-year-olds. `scripts/compare-models.sh` still names it, and correctly so —
 * that script grades *candidates*, which is a different job from this list.
 */
export const ALLOWED_MODELS = ["openai/gpt-5.6-luna", "google/gemini-3.7-flash"] as const;

export type AllowedModel = (typeof ALLOWED_MODELS)[number];

/**
 * Frozen by the phase-5 comparison, which graded three candidates over five
 * keywords: see `context/archive/2026-08-22-first-day-generation/model-comparison.md`.
 *
 * Chosen over `google/gemini-3.7-flash` - which scored marginally better on
 * Polish cultural competence - because it is 5x cheaper, 2.3x faster, and needs
 * no operational workaround: Gemini rejects the request outright with
 * "Reasoning is mandatory for this endpoint and cannot be disabled". Gemini stays
 * on the allowed list as the graded second choice, not as the default.
 */
export const DEFAULT_MODEL: AllowedModel = "openai/gpt-5.6-luna";

export function isAllowedModel(model: string): model is AllowedModel {
  return (ALLOWED_MODELS as readonly string[]).includes(model);
}

/**
 * Resolves the model an actual request should carry.
 *
 * Three cases: no configured value falls back to {@link DEFAULT_MODEL}; a value
 * on the list is used as given; a value off the list is a **named configuration
 * failure**, not a silent fallback. Falling back would be the worst option here -
 * it would hide the very substitution this module exists to make visible.
 */
export function resolveModel(configured?: string | null): AllowedModel {
  if (configured === undefined || configured === null || configured === "") {
    return DEFAULT_MODEL;
  }
  if (isAllowedModel(configured)) {
    return configured;
  }
  throw new GenerationError(
    "config",
    `Model "${configured}" nie jest dopuszczony. Dozwolone modele: ${ALLOWED_MODELS.join(", ")}.`,
  );
}
