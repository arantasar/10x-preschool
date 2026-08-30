import { OPENROUTER_API_KEY, OPENROUTER_MODEL } from "astro:env/server";
import type { ActivityDraft, DayTheme } from "@/types";
import {
  ATTEMPT_TIMEOUT_MS,
  MIN_RETRY_BUDGET_MS,
  OUTLINE_ATTEMPT_TIMEOUT_MS,
  OUTLINE_TOTAL_BUDGET_MS,
  RETRY_BACKOFF_MS,
  TOTAL_BUDGET_MS,
} from "@/lib/day-plan-limits";
import { formatPlanDate, weekdayLabel } from "@/lib/day-plan-dates";
import { dayPlanProposalSchema, toActivityDrafts, toDayThemes, weekOutlineSchema } from "./day-plan-contract";
import dayResponseJsonSchema from "./prompts/day-plan.schema.json";
import dayPrompt from "./prompts/day-plan.pl.md?raw";
import outlineResponseJsonSchema from "./prompts/week-outline.schema.json";
import outlinePrompt from "./prompts/week-outline.pl.md?raw";

// The prompt and schema imports above are resolved by Vite at build time: `?raw` becomes a string
// literal and the JSON becomes an object literal. Nothing reads the filesystem at
// runtime, which is what makes them safe under workerd. The same two files are
// read by `scripts/compare-models.sh` in phase 5, so the model comparison and
// production cannot drift apart.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

/**
 * Overridden by `OPENROUTER_MODEL`. Frozen by the phase-5 comparison, which
 * graded three candidates over five keywords: see
 * `context/changes/first-day-generation/model-comparison.md`.
 *
 * Chosen over `google/gemini-3.7-flash` - which scored marginally better on
 * Polish cultural competence - because it is 5x cheaper, 2.3x faster, and needs
 * no operational workaround: Gemini rejects the request outright with
 * "Reasoning is mandatory for this endpoint and cannot be disabled".
 *
 * `deepseek/deepseek-v4-flash` was disqualified outright: it proposed melting
 * wax in a room of three-year-olds. It is not a fallback candidate either.
 */
const DEFAULT_MODEL = "openai/gpt-5.6-luna";

// The attempt timeout and the total budget come from `@/lib/day-plan-limits`,
// which the progress indicator reads as well: it derives the moment a retry can
// be announced from the same two numbers. Before retrying we spend only what is
// left of the budget, and skip the retry entirely if too little remains.

const TEMPERATURE = 0.8;

/**
 * Sized for the answer *plus* reasoning tokens, not just the answer.
 *
 * `OPENROUTER_MODEL` exists so the model can change without a deploy, and some
 * endpoints refuse to disable reasoning - those tokens then bill against this
 * same budget. The phase-5 comparison measured Gemini spending 728-972 tokens
 * reasoning: at the previous ceiling of 1200 the JSON was truncated mid-string
 * and came back as `finish_reason: "length"`, which reaches the teacher as a
 * generic `invalid` after a full wait, with nothing in the log naming the cause.
 *
 * This is a ceiling, not a target. The default model stops around 700 tokens and
 * pays nothing for the extra headroom.
 */
const MAX_TOKENS = 4000;

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

export interface WeekOutlineResult {
  readonly themes: DayTheme[];
  readonly cost: number | null;
  readonly modelUsed: string | null;
}

/**
 * The context a day generation is given when it is one day of a week (S-03).
 *
 * Optional as a whole, and with no context the user message is the bare hasło,
 * byte for byte what S-01 sent - which is what the gate's `day` mode measures
 * the other modes against.
 *
 * That baseline is *not* what `/plan?date=` sends. The generate route passes
 * context unconditionally, so a single day travels with its weekday and without
 * a theme (there is no outline to take one from). Three configurations, and the
 * gate covers all three by name - `day`, `day-weekday`, `day-themed`. Adding a
 * fourth means another gate run before merge, per lessons.md #3.
 */
export interface DayGenerationContext {
  readonly planDate: string;
  readonly theme?: string;
}

interface OpenRouterCall {
  /** `JSON.parse` of the model's content. Shape is the caller's to validate. */
  readonly parsed: unknown;
  readonly cost: number | null;
  readonly modelUsed: string | null;
}

function buildRequestBody(userMessage: string, systemMessage: string, schemaName: string, schema: unknown) {
  return {
    model: OPENROUTER_MODEL ?? DEFAULT_MODEL,
    messages: [
      { role: "system", content: systemMessage },
      { role: "user", content: userMessage },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: schemaName, strict: true, schema },
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
      // is the zod schema downstream - prose or an off-contract shape fails
      // validation and surfaces as `invalid`, which is retryable. So the failure
      // stays visible and recoverable; it just moves from routing time to parse
      // time, and costs one wasted call when it happens.
    },
    // Reasoning tokens bill as output and add seconds of latency. This is a short
    // creative task, so they are cost without benefit.
    reasoning: { enabled: false },
    temperature: TEMPERATURE,
    max_tokens: MAX_TOKENS,
  };
}

/**
 * One request to OpenRouter, parsed but not validated. Throws
 * {@link GenerationError}; never retries.
 *
 * Everything above the contract lives here, because it is identical for both
 * contracts: the transport failure, the nine upstream statuses, the 200 that
 * carries a partial failure, the empty content and the unparseable body. What
 * differs between a day and a week outline is only which zod schema the parsed
 * value is then held to - and that stays with the caller.
 */
async function callOpenRouter(body: unknown, timeoutMs: number): Promise<OpenRouterCall> {
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
      body: JSON.stringify(body),
    });
  } catch (cause) {
    // A timeout or a dropped connection. Both are worth another attempt.
    throw new GenerationError("transient", "Nie udało się połączyć z OpenRouter.", { cause });
  }

  if (!response.ok) {
    const errorBody: unknown = await response.json().catch(() => null);
    const errorType = extractErrorType(errorBody);
    throw new GenerationError(categorizeStatus(response.status), `OpenRouter zwrócił status ${response.status}.`, {
      status: response.status,
      errorType,
    });
  }

  // Two different failures reach this catch and they are not the same class, so
  // `.catch(() => null)` would be lying by omission. A `SyntaxError` means the
  // bytes arrived and were not JSON - the provider answered off-contract, and an
  // identical second request is not going to come back different. Anything else
  // means the body never finished arriving: `AbortSignal.timeout` aborts the
  // response *stream*, not just the headers, so a provider that stalls midway
  // through the body lands here rather than in the `fetch` catch above. That one
  // is transport, it is transient, and it keeps the retry it has always had.
  let data: unknown;
  try {
    data = await response.json();
  } catch (cause) {
    if (cause instanceof SyntaxError) {
      throw new GenerationError("invalid", "Odpowiedź OpenRoutera nie jest poprawnym JSON-em.", {
        errorType: "unparsable_response_body",
        cause,
      });
    }
    throw new GenerationError("transient", "Połączenie z OpenRouter przerwane w trakcie odbierania odpowiedzi.", {
      errorType: "response_body_aborted",
      cause,
    });
  }

  const choice = firstChoice(data);

  // A 200 that parses but carries no recognizable `choices` array is not a
  // transient failure: the provider answered, just with something outside the
  // contract. It used to share a branch with the two signals below, which bought
  // it a paid retry of a request that was never going to come back different,
  // and showed the teacher "usluga jest chwilowo przeciazona" for a provider
  // that was not overloaded at all.
  if (!choice) {
    throw new GenerationError("invalid", "Odpowiedź OpenRoutera nie ma rozpoznawalnego kształtu.", {
      errorType: "unrecognized_response_shape",
    });
  }

  // A 200 is not proof of success: OpenRouter reports partial failures inside an
  // otherwise valid response, next to a fragment of content. Checking this before
  // parsing is what stops a "successful" generation from handing the teacher an
  // empty screen with nothing in the log. Unlike the branch above, this is the
  // provider honestly reporting that it broke off mid-generation - a second
  // attempt can plausibly succeed, so it stays `transient`.
  if (choice.finish_reason === "error" || choice.error) {
    throw new GenerationError("transient", "OpenRouter przerwał generowanie w trakcie.", {
      status: choice.error?.code,
      errorType: choice.error?.metadata?.error_type,
    });
  }

  // The truncation documented on MAX_TOKENS above, finally named. The content is
  // present but cut mid-string, so `JSON.parse` would fail a step later and reach
  // the teacher as a generic `invalid` with nothing in the log pointing at the
  // token ceiling. Not retryable in practice: an identical request with the same
  // MAX_TOKENS truncates again, so it is `invalid` rather than `transient`.
  if (choice.finish_reason === "length") {
    throw new GenerationError("invalid", "Odpowiedź modelu została ucięta na limicie tokenów.", {
      errorType: "truncated_response",
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

  const usage = extractUsage(data);
  return { parsed, cost: usage.cost, modelUsed: usage.model };
}

/**
 * The user message for one day.
 *
 * No context means the bare hasło - identical to what S-01 sent, so the
 * single-day route's behaviour is unchanged. With context the model is told
 * which weekday it is planning and, when the day belongs to a week outline,
 * which slice of the hasło is its own. Without that, five calls carrying one
 * hasło return five variants of the same idea (S-01 review, finding F4).
 */
function buildDayUserMessage(keyword: string, context?: DayGenerationContext): string {
  if (!context) {
    return keyword;
  }
  const lines = [`Hasło: ${keyword}`, `Dzień tygodnia: ${weekdayLabel(context.planDate)}`];
  if (context.theme) {
    lines.push(`Temat dnia: ${context.theme}`);
  }
  return lines.join("\n");
}

function buildOutlineUserMessage(keyword: string, dates: readonly string[]): string {
  const days = dates.map((date, index) => `${String(index + 1)}. ${formatPlanDate(date)}`).join("\n");
  return `Hasło: ${keyword}\nDni robocze tygodnia:\n${days}`;
}

/**
 * Runs one attempt, retries once, and logs both outcomes.
 *
 * Shared by both contracts because the policy is the same: retry only
 * `transient` failures - the categories a second identical request can plausibly
 * fix - and bound the retry by what is left of the total budget, so a slow first
 * attempt cannot double the teacher's wait. Only the budgets differ, and they
 * are arguments.
 */
async function runWithBudget<T>(
  operation: string,
  attemptTimeoutMs: number,
  totalBudgetMs: number,
  attempt: (timeoutMs: number) => Promise<T>,
  fields: (result: T) => Record<string, unknown>,
): Promise<T> {
  const startedAt = Date.now();

  const runAndLog = async (timeoutMs: number, attemptNumber: number): Promise<T> => {
    try {
      const result = await attempt(timeoutMs);
      logInfo(`${operation}.succeeded`, {
        attempt: attemptNumber,
        elapsedMs: Date.now() - startedAt,
        ...fields(result),
      });
      return result;
    } catch (error) {
      const failure = asGenerationError(error);
      logError(`${operation}.failed`, {
        attempt: attemptNumber,
        elapsedMs: Date.now() - startedAt,
        category: failure.category,
        status: failure.status,
        errorType: failure.errorType,
        message: failure.message,
      });
      throw failure;
    }
  };

  try {
    return await runAndLog(attemptTimeoutMs, 1);
  } catch (error) {
    const failure = asGenerationError(error);
    const remaining = totalBudgetMs - (Date.now() - startedAt) - RETRY_BACKOFF_MS;

    if (failure.category !== "transient" || remaining < MIN_RETRY_BUDGET_MS) {
      throw failure;
    }

    await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));
    return runAndLog(remaining, 2);
  }
}

function requireConfigured(): void {
  if (!OPENROUTER_API_KEY) {
    // Mirrors `createClient` in `@/lib/supabase`: missing configuration is a
    // named condition, not an exception thrown from module scope.
    throw new GenerationError("config", "OpenRouter nie jest skonfigurowany.");
  }
}

/**
 * Generates activity proposals for one teacher-supplied keyword.
 *
 * `context` is what makes this usable as one day of a week; omitting it gives
 * exactly the S-01 request. See {@link buildDayUserMessage}.
 */
export async function generateDayActivities(
  keyword: string,
  context?: DayGenerationContext,
): Promise<GenerationResult> {
  requireConfigured();

  return runWithBudget(
    "generation",
    ATTEMPT_TIMEOUT_MS,
    TOTAL_BUDGET_MS,
    async (timeoutMs) => {
      const call = await callOpenRouter(
        buildRequestBody(buildDayUserMessage(keyword, context), dayPrompt, "propozycja_dnia", dayResponseJsonSchema),
        timeoutMs,
      );

      // The JSON Schema steers the model; this is what actually guarantees the shape.
      const result = dayPlanProposalSchema.safeParse(call.parsed);
      if (!result.success) {
        throw new GenerationError("invalid", "Odpowiedź modelu nie spełnia kontraktu.", { cause: result.error });
      }

      return {
        activities: toActivityDrafts(result.data),
        cost: call.cost,
        modelUsed: call.modelUsed,
      };
    },
    (result) => ({ cost: result.cost, model: result.modelUsed }),
  );
}

/**
 * Splits one hasło into a theme per working day (S-03).
 *
 * Deliberately cheap and short: five clauses, not fifteen paragraphs. It runs
 * before the five day generations and every second it takes is a second none of
 * them has started, which is why it carries its own, tighter budget rather than
 * the day's.
 *
 * Returns themes already pinned to dates - `dates` is the working week in
 * calendar order and the model's day numbers index it, so nothing downstream has
 * to know what "day 3" meant.
 */
export async function generateWeekOutline(keyword: string, dates: readonly string[]): Promise<WeekOutlineResult> {
  requireConfigured();

  return runWithBudget(
    "outline",
    OUTLINE_ATTEMPT_TIMEOUT_MS,
    OUTLINE_TOTAL_BUDGET_MS,
    async (timeoutMs) => {
      const call = await callOpenRouter(
        buildRequestBody(
          buildOutlineUserMessage(keyword, dates),
          outlinePrompt,
          "szkic_tygodnia",
          outlineResponseJsonSchema,
        ),
        timeoutMs,
      );

      const result = weekOutlineSchema.safeParse(call.parsed);
      if (!result.success) {
        throw new GenerationError("invalid", "Szkic tygodnia nie spełnia kontraktu.", { cause: result.error });
      }

      return {
        themes: toDayThemes(result.data, dates),
        cost: call.cost,
        modelUsed: call.modelUsed,
      };
    },
    (result) => ({ cost: result.cost, model: result.modelUsed, days: result.themes.length }),
  );
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
