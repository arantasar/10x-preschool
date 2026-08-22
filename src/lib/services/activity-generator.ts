import { OPENROUTER_API_KEY, OPENROUTER_MODEL } from "astro:env/server";
import type { ActivityDraft } from "@/types";
import { dayPlanProposalSchema, toActivityDrafts } from "./day-plan-contract";
import responseJsonSchema from "./prompts/day-plan.schema.json";
import systemPrompt from "./prompts/day-plan.pl.md?raw";

// Both imports above are resolved by Vite at build time: `?raw` becomes a string
// literal and the JSON becomes an object literal. Nothing reads the filesystem at
// runtime, which is what makes them safe under workerd. The same two files are
// read by `scripts/compare-models.sh` in phase 5, so the model comparison and
// production cannot drift apart.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Overridden by `OPENROUTER_MODEL`; frozen for real by the phase-5 comparison.
 *
 * Not the model the research recommended. `google/gemini-3.7-flash` rejects the
 * request outright - "Reasoning is mandatory for this endpoint and cannot be
 * disabled" - so keeping it would mean either paying for reasoning tokens the
 * research set out to avoid, or dropping to `effort: "minimal"`.
 */
const DEFAULT_MODEL = "openai/gpt-5.6-luna";

// The NFR allows a generation to legitimately take 10-30s, so a single attempt is
// given headroom above that. TOTAL_BUDGET_MS then caps the retry path: the plan
// commits to a worst case of roughly 60s, and a naive "retry after a 45s timeout"
// would silently make it 90s. Before retrying we spend only what is left of the
// budget, and skip the retry entirely if too little remains to be worth it.
const ATTEMPT_TIMEOUT_MS = 45_000;
const TOTAL_BUDGET_MS = 60_000;
const MIN_RETRY_BUDGET_MS = 5_000;
const RETRY_BACKOFF_MS = 1_000;

const TEMPERATURE = 0.8;
const MAX_TOKENS = 1200;

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
function categorizeStatus(status: number): GenerationErrorCategory {
  if (status === 401 || status === 402 || status === 403 || status === 404) {
    return "config";
  }
  if (status === 429 || status >= 500) {
    return "transient";
  }
  return "invalid";
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

// `wrangler.jsonc` sets `observability.enabled`, so console output is captured
// without adding a logging dependency the project deliberately does not carry.
/* eslint-disable no-console */
function logInfo(message: string, fields: Record<string, unknown>): void {
  console.info(message, fields);
}

function logError(message: string, fields: Record<string, unknown>): void {
  console.error(message, fields);
}
/* eslint-enable no-console */

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export interface GenerationResult {
  readonly activities: ActivityDraft[];
  /** `usage.cost` from the same response - feeds the open regeneration-limit question. */
  readonly cost: number | null;
  /** Which model actually answered, which can differ from the one requested. */
  readonly modelUsed: string | null;
}

function buildRequestBody(keyword: string) {
  return {
    model: OPENROUTER_MODEL ?? DEFAULT_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: keyword },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "propozycja_dnia", strict: true, schema: responseJsonSchema },
    },
    provider: {
      // NFR: a teacher's content must not be available to operators.
      data_collection: "deny",
      //
      // `require_parameters: true` is deliberately absent, against the advice in
      // `context/foundation/openrouter-api.md` § 2. Every endpoint serving the
      // default model is excluded by it - the request comes back as "No endpoints
      // found that can handle the requested parameters", which is the narrowed-
      // routing failure the same document warns about in § 3.
      //
      // What that costs us: a provider is now free to accept `response_format`
      // and quietly ignore it. Nothing here would notice. What catches it instead
      // is `dayPlanProposalSchema` downstream - prose or an off-contract shape
      // fails validation and surfaces as `invalid`, which is retryable. So the
      // failure stays visible and recoverable; it just moves from routing time to
      // parse time, and costs one wasted call when it happens.
    },
    // Reasoning tokens bill as output and add seconds of latency. This is a short
    // creative task, so they are cost without benefit.
    reasoning: { enabled: false },
    temperature: TEMPERATURE,
    max_tokens: MAX_TOKENS,
  };
}

/** One request. Throws {@link GenerationError}; never retries. */
async function attemptGeneration(keyword: string, timeoutMs: number): Promise<GenerationResult> {
  let response: Response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "X-OpenRouter-Title": "10xPreschool",
      },
      body: JSON.stringify(buildRequestBody(keyword)),
    });
  } catch (cause) {
    // A timeout or a dropped connection. Both are worth another attempt.
    throw new GenerationError("transient", "Nie udało się połączyć z OpenRouter.", { cause });
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const errorType = extractErrorType(body);
    throw new GenerationError(categorizeStatus(response.status), `OpenRouter zwrócił status ${response.status}.`, {
      status: response.status,
      errorType,
    });
  }

  const data: unknown = await response.json().catch(() => null);
  const choice = firstChoice(data);

  // A 200 is not proof of success: OpenRouter reports partial failures inside an
  // otherwise valid response, next to a fragment of content. Checking this before
  // parsing is what stops a "successful" generation from handing the teacher an
  // empty screen with nothing in the log.
  if (!choice || choice.finish_reason === "error" || choice.error) {
    throw new GenerationError("transient", "OpenRouter przerwał generowanie w trakcie.", {
      status: choice?.error?.code,
      errorType: choice?.error?.metadata?.error_type,
    });
  }

  const content = choice.message?.content;
  if (typeof content !== "string" || content.length === 0) {
    throw new GenerationError("invalid", "OpenRouter zwrócił pustą odpowiedź.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (cause) {
    throw new GenerationError("invalid", "Odpowiedź modelu nie jest poprawnym JSON-em.", { cause });
  }

  // The JSON Schema steers the model; this is what actually guarantees the shape.
  const result = dayPlanProposalSchema.safeParse(parsed);
  if (!result.success) {
    throw new GenerationError("invalid", "Odpowiedź modelu nie spełnia kontraktu.", {
      cause: result.error,
    });
  }

  const usage = extractUsage(data);
  return {
    activities: toActivityDrafts(result.data),
    cost: usage.cost,
    modelUsed: usage.model,
  };
}

/**
 * Generates activity proposals for one teacher-supplied keyword.
 *
 * Retries once, and only for `transient` failures - the categories that a second
 * identical request can plausibly fix. The retry is bounded by the remaining
 * share of {@link TOTAL_BUDGET_MS} so that a slow first attempt cannot double the
 * teacher's wait.
 */
export async function generateDayActivities(keyword: string): Promise<GenerationResult> {
  if (!OPENROUTER_API_KEY) {
    // Mirrors `createClient` in `@/lib/supabase`: missing configuration is a
    // named condition, not an exception thrown from module scope.
    throw new GenerationError("config", "OpenRouter nie jest skonfigurowany.");
  }

  const startedAt = Date.now();

  try {
    return await runAndLog(keyword, ATTEMPT_TIMEOUT_MS, 1, startedAt);
  } catch (error) {
    const failure = asGenerationError(error);
    const elapsed = Date.now() - startedAt;
    const remaining = TOTAL_BUDGET_MS - elapsed - RETRY_BACKOFF_MS;

    if (failure.category !== "transient" || remaining < MIN_RETRY_BUDGET_MS) {
      throw failure;
    }

    await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));
    return runAndLog(keyword, remaining, 2, startedAt);
  }
}

async function runAndLog(
  keyword: string,
  timeoutMs: number,
  attempt: number,
  startedAt: number,
): Promise<GenerationResult> {
  try {
    const result = await attemptGeneration(keyword, timeoutMs);
    logInfo("generation.succeeded", {
      attempt,
      elapsedMs: Date.now() - startedAt,
      cost: result.cost,
      model: result.modelUsed,
    });
    return result;
  } catch (error) {
    const failure = asGenerationError(error);
    logError("generation.failed", {
      attempt,
      elapsedMs: Date.now() - startedAt,
      category: failure.category,
      status: failure.status,
      errorType: failure.errorType,
      message: failure.message,
    });
    throw failure;
  }
}

function asGenerationError(error: unknown): GenerationError {
  return error instanceof GenerationError
    ? error
    : new GenerationError("invalid", "Nieoczekiwany błąd generowania.", { cause: error });
}

// ---------------------------------------------------------------------------
// Response shape helpers
// ---------------------------------------------------------------------------
// The response is `unknown` until proven otherwise: it is a third-party payload
// that may itself be an error envelope, so it is narrowed rather than asserted.

interface OpenRouterChoice {
  finish_reason?: string;
  message?: { content?: unknown };
  error?: { code?: number; metadata?: { error_type?: string } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function firstChoice(data: unknown): OpenRouterChoice | null {
  if (!isRecord(data) || !Array.isArray(data.choices)) {
    return null;
  }
  const choice: unknown = data.choices[0];
  return isRecord(choice) ? choice : null;
}

function extractErrorType(body: unknown): string | undefined {
  if (!isRecord(body) || !isRecord(body.error)) {
    return undefined;
  }
  const metadata = body.error.metadata;
  if (!isRecord(metadata) || typeof metadata.error_type !== "string") {
    return undefined;
  }
  return metadata.error_type;
}

function extractUsage(data: unknown): { cost: number | null; model: string | null } {
  if (!isRecord(data)) {
    return { cost: null, model: null };
  }
  const usage = data.usage;
  const cost = isRecord(usage) && typeof usage.cost === "number" ? usage.cost : null;
  const model = typeof data.model === "string" ? data.model : null;
  return { cost, model };
}
