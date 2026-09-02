/**
 * The generation failure type, extracted from `activity-generator.ts` so that
 * `allowed-models.ts` can throw it without the two modules importing each other:
 * the generator resolves its model through the allow-list, and the allow-list
 * reports an off-list value as a `config` failure. `activity-generator.ts`
 * re-exports everything here, so existing importers are unaffected.
 */

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * OpenRouter distinguishes nine status codes; a teacher needs to know only one
 * thing - whether clicking again can help. These three categories are that
 * question, and nothing finer.
 */
export type GenerationErrorCategory = "transient" | "config" | "invalid";

const RETRYABLE_BY_CATEGORY: Record<GenerationErrorCategory, boolean> = {
  // Rate limits, upstream hiccups, timeouts: the same request may well succeed.
  transient: true,
  // Missing credits or a bad key. Retrying burns the teacher's time for nothing.
  config: false,
  // Malformed or out-of-bounds output. A fresh roll of the model often lands
  // inside the contract, so this is worth another try - just not automatically.
  invalid: true,
};

export class GenerationError extends Error {
  readonly category: GenerationErrorCategory;
  readonly retryable: boolean;
  /** Upstream HTTP status, when the failure had one. */
  readonly status?: number;
  /** OpenRouter's normalized `error.metadata.error_type`, when present. */
  readonly errorType?: string;

  constructor(
    category: GenerationErrorCategory,
    message: string,
    options: { status?: number; errorType?: string; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "GenerationError";
    this.category = category;
    this.retryable = RETRYABLE_BY_CATEGORY[category];
    this.status = options.status;
    this.errorType = options.errorType;
  }
}

/**
 * Maps an upstream status onto a category. The status is the structural signal -
 * it is the axis OpenRouter's own error table is written against - while
 * `error_type` is carried alongside for the log. `provider_code` is deliberately
 * ignored: it is the raw upstream code and differs per provider, so branching on
 * it would make the behaviour depend on which provider happened to serve us.
 */
export function categorizeStatus(status: number): GenerationErrorCategory {
  if (status === 401 || status === 402 || status === 403 || status === 404) {
    return "config";
  }
  if (status === 429 || status >= 500) {
    return "transient";
  }
  return "invalid";
}
