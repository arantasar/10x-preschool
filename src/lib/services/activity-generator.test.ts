import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  abortedBodyResponse,
  choiceErrorResponse,
  errorStatusResponse,
  finishReasonResponse,
  networkRejection,
  noChoicesResponse,
  proposalResponse,
  reasoningMandatoryResponse,
  timeoutRejection,
  unparsableBodyResponse,
} from "./__fixtures__/openrouter";
import { ACTIVITY_COUNT, DESCRIPTION_MAX } from "@/lib/day-plan-limits";

// The network boundary is exactly one `fetch` call inside `callOpenRouter`, so
// stubbing `globalThis.fetch` intercepts 100% of the traffic while
// `categorizeStatus`, `GenerationError` and `runWithBudget` all execute for real.
// Nothing in this file mocks a module from `src/lib/` — the only substitutions
// are the network boundary and the env virtual module, and the latter is
// configuration, not a stand-in for code under test.

const env = vi.hoisted((): { apiKey: string | undefined; model: string | undefined } => ({
  apiKey: "test-key",
  model: undefined,
}));

vi.mock("astro:env/server", () => ({
  // Getters, not values: `activity-generator.ts` reads these inside functions,
  // so a per-test change has to be visible without re-importing the module.
  get OPENROUTER_API_KEY() {
    return env.apiKey;
  },
  get OPENROUTER_MODEL() {
    return env.model;
  },
}));

const { GenerationError, generateDayActivities, buildOutlineSystemMessage } = await import("./activity-generator");
const { ALLOWED_MODELS, DEFAULT_MODEL } = await import("./allowed-models");

const KEYWORD = "jesień w lesie";

function validProposal() {
  return {
    aktywnosci: Array.from({ length: ACTIVITY_COUNT }, (_, index) => ({
      tytul: `Aktywność ${String(index + 1)}`,
      opis: `Opis aktywności ${String(index + 1)}`,
    })),
  };
}

/**
 * Stubs `fetch` with a queue of outcome *factories*; a rejection value is thrown,
 * anything else resolved. The last factory is reused once the queue runs out.
 *
 * Factories rather than values, because a `Response` body can only be read once:
 * handing the same instance to a retry makes the second attempt fail as an
 * unparsable body no matter what the fixture said, which quietly turns every
 * retry assertion into a test of the wrong failure class.
 */
function stubFetch(...outcomes: (() => unknown)[]) {
  let index = 0;
  const stub = vi.fn(() => {
    const outcome = outcomes[Math.min(index++, outcomes.length - 1)]();
    return outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome as Response);
  });
  vi.stubGlobal("fetch", stub);
  return stub;
}

/**
 * Settles the generation with fake timers running, so `RETRY_BACKOFF_MS` costs
 * nothing in wall-clock time, and returns the error it rejected with.
 */
async function failureOf(promise: Promise<unknown>): Promise<InstanceType<typeof GenerationError>> {
  const settled = promise.then(
    () => null,
    (error: unknown) => error,
  );
  await vi.runAllTimersAsync();
  const error = await settled;
  expect(error).toBeInstanceOf(GenerationError);
  return error as InstanceType<typeof GenerationError>;
}

beforeEach(() => {
  env.apiKey = "test-key";
  env.model = undefined;
  vi.useFakeTimers();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("generateDayActivities — happy path", () => {
  it("returns three drafts and calls the provider exactly once", async () => {
    const fetchStub = stubFetch(() =>
      proposalResponse(validProposal(), { cost: 0.0007, model: "openai/gpt-5.6-luna" }),
    );

    const result = await generateDayActivities(KEYWORD);

    expect(result.activities).toHaveLength(ACTIVITY_COUNT);
    expect(result.activities[0]).toEqual({ title: "Aktywność 1", description: "Opis aktywności 1" });
    expect(result.cost).toBe(0.0007);
    expect(result.modelUsed).toBe("openai/gpt-5.6-luna");
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });
});

describe("generateDayActivities — failure classes", () => {
  // Two attempts prove the retry survived the phase-2 split; one attempt proves
  // the teacher is not being billed for a request that cannot come back different.
  const cases: { name: string; outcome: () => unknown; category: string; retryable: boolean; calls: number }[] = [
    { name: "dropped connection", outcome: networkRejection, category: "transient", retryable: true, calls: 2 },
    { name: "attempt timeout", outcome: timeoutRejection, category: "transient", retryable: true, calls: 2 },
    {
      name: "429 rate limit",
      outcome: () => errorStatusResponse(429),
      category: "transient",
      retryable: true,
      calls: 2,
    },
    { name: "500 upstream", outcome: () => errorStatusResponse(500), category: "transient", retryable: true, calls: 2 },
    {
      name: "401 bad key",
      outcome: () => errorStatusResponse(401, "auth"),
      category: "config",
      retryable: false,
      calls: 1,
    },
    { name: "unparsable body", outcome: unparsableBodyResponse, category: "invalid", retryable: true, calls: 1 },
    // The body never finished arriving. Transport, not a provider fault - and the
    // one case a bare `.catch(() => null)` used to hide behind "unrecognizable
    // shape", losing the retry it deserves.
    { name: "aborted body read", outcome: abortedBodyResponse, category: "transient", retryable: true, calls: 2 },
    { name: "200 without choices", outcome: noChoicesResponse, category: "invalid", retryable: true, calls: 1 },
    {
      name: "finish_reason error",
      outcome: () => finishReasonResponse("error"),
      category: "transient",
      retryable: true,
      calls: 2,
    },
    {
      name: "choice-level provider error",
      outcome: () => choiceErrorResponse(),
      category: "transient",
      retryable: true,
      calls: 2,
    },
    {
      name: "finish_reason length",
      outcome: () => finishReasonResponse("length"),
      category: "invalid",
      retryable: true,
      calls: 1,
    },
    {
      name: "empty content",
      outcome: () => finishReasonResponse("stop", ""),
      category: "invalid",
      retryable: true,
      calls: 1,
    },
    {
      name: "content that is not JSON",
      outcome: () => finishReasonResponse("stop", "Oto trzy propozycje na jesienny dzień."),
      category: "invalid",
      retryable: true,
      calls: 1,
    },
    {
      name: "two activities instead of three",
      outcome: () => proposalResponse({ aktywnosci: validProposal().aktywnosci.slice(0, 2) }),
      category: "invalid",
      retryable: true,
      calls: 1,
    },
    {
      name: "description over DESCRIPTION_MAX",
      outcome: () => {
        const proposal = validProposal();
        proposal.aktywnosci[0].opis = "a".repeat(DESCRIPTION_MAX + 1);
        return proposalResponse(proposal);
      },
      category: "invalid",
      retryable: true,
      calls: 1,
    },
  ];

  it.each(cases)("$name → $category, $calls fetch call(s)", async ({ outcome, category, retryable, calls }) => {
    const fetchStub = stubFetch(outcome);

    const failure = await failureOf(generateDayActivities(KEYWORD));

    expect(failure.category).toBe(category);
    expect(failure.retryable).toBe(retryable);
    expect(fetchStub).toHaveBeenCalledTimes(calls);
  });

  it("tells an off-contract body apart from a body that never arrived", async () => {
    stubFetch(unparsableBodyResponse);
    const offContract = await failureOf(generateDayActivities(KEYWORD));

    stubFetch(abortedBodyResponse);
    const neverArrived = await failureOf(generateDayActivities(KEYWORD));

    expect(offContract.errorType).toBe("unparsable_response_body");
    expect(neverArrived.errorType).toBe("response_body_aborted");
    expect(offContract.category).not.toBe(neverArrived.category);
  });

  it("names the unparsable body differently from a mid-generation break", async () => {
    stubFetch(unparsableBodyResponse);
    const unparsable = await failureOf(generateDayActivities(KEYWORD));

    stubFetch(() => finishReasonResponse("error"));
    const brokeOff = await failureOf(generateDayActivities(KEYWORD));

    expect(unparsable.errorType).toBe("unparsable_response_body");
    expect(unparsable.message).not.toBe(brokeOff.message);
  });

  it("names a truncated response under its own errorType", async () => {
    stubFetch(() => finishReasonResponse("length"));

    const failure = await failureOf(generateDayActivities(KEYWORD));

    expect(failure.errorType).toBe("truncated_response");
  });

  // The row in the table above is not distinguishing on its own: its content is
  // cut mid-string, so `JSON.parse` would refuse it anyway. This is the case that
  // only the dedicated branch catches — a response that stopped at the token
  // ceiling and still happens to parse. Accepting it would hand the teacher
  // whatever fragment fit inside MAX_TOKENS as if it were the whole answer.
  it("refuses a truncated response even when its content parses", async () => {
    const fetchStub = stubFetch(() => finishReasonResponse("length", JSON.stringify(validProposal())));

    const failure = await failureOf(generateDayActivities(KEYWORD));

    expect(failure.category).toBe("invalid");
    expect(failure.errorType).toBe("truncated_response");
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it("recovers when the first attempt is transient and the second succeeds", async () => {
    const fetchStub = stubFetch(
      () => errorStatusResponse(500),
      () => proposalResponse(validProposal()),
    );

    const promise = generateDayActivities(KEYWORD);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.activities).toHaveLength(ACTIVITY_COUNT);
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  it("refuses without an API key and never touches the network", async () => {
    env.apiKey = undefined;
    const fetchStub = stubFetch(() => proposalResponse(validProposal()));

    const failure = await failureOf(generateDayActivities(KEYWORD));

    expect(failure.category).toBe("config");
    expect(fetchStub).not.toHaveBeenCalled();
  });
});

/**
 * `google/gemini-3.7-flash` 400s outright on `reasoning: { enabled: false }`
 * (`isReasoningMandatoryError` in `activity-generator.ts`) — discovered live by
 * the content-safety gate's matrix (Phase 4), not by this suite. `scripts/
 * compare-models.sh:284-296` already retries once without the flag; this is
 * that same workaround, ported into the path production and the gate both run.
 */
describe("the reasoning-mandatory fallback", () => {
  function requestBodyOf(stub: ReturnType<typeof stubFetch>, call: number): { reasoning?: unknown } {
    const [, init] = stub.mock.calls[call] as unknown as [unknown, RequestInit];
    return JSON.parse(init.body as string) as { reasoning?: unknown };
  }

  it("retries once without the reasoning flag and succeeds", async () => {
    const fetchStub = stubFetch(reasoningMandatoryResponse, () => proposalResponse(validProposal()));

    const result = await generateDayActivities(KEYWORD);

    expect(result.activities).toHaveLength(ACTIVITY_COUNT);
    expect(fetchStub).toHaveBeenCalledTimes(2);
    expect(requestBodyOf(fetchStub, 0).reasoning).toEqual({ enabled: false });
    expect(requestBodyOf(fetchStub, 1).reasoning).toBeUndefined();
  });

  it("does not loop when the fallback also fails", async () => {
    const fetchStub = stubFetch(reasoningMandatoryResponse);

    const failure = await failureOf(generateDayActivities(KEYWORD));

    expect(failure.category).toBe("invalid");
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 400 that has nothing to do with reasoning", async () => {
    const fetchStub = stubFetch(() => errorStatusResponse(400, "bad_request"));

    const failure = await failureOf(generateDayActivities(KEYWORD));

    expect(failure.category).toBe("invalid");
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });
});

/**
 * The allow-list on the wire.
 *
 * These exist so the content-safety gate can drive the production request path
 * once per allowed model rather than rebuilding the request — and so an off-list
 * model is refused before anyone pays for the call.
 */
describe("the model the request carries", () => {
  // `stubFetch` declares no parameters, so `mock.calls` is typed as empty
  // tuples; the request init has to be recovered through `unknown`.
  function bodyOf(stub: ReturnType<typeof stubFetch>): { model: string } {
    const [call] = stub.mock.calls as unknown as [unknown, RequestInit][];
    return JSON.parse(call[1].body as string) as { model: string };
  }

  it("sends DEFAULT_MODEL when OPENROUTER_MODEL is unset", async () => {
    const fetchStub = stubFetch(() => proposalResponse(validProposal()));

    await generateDayActivities(KEYWORD);

    expect(bodyOf(fetchStub).model).toBe(DEFAULT_MODEL);
  });

  it.each(ALLOWED_MODELS)("sends %s when it is configured", async (model) => {
    env.model = model;
    const fetchStub = stubFetch(() => proposalResponse(validProposal()));

    await generateDayActivities(KEYWORD);

    expect(bodyOf(fetchStub).model).toBe(model);
  });

  it.each(ALLOWED_MODELS)("sends %s when it is passed as a per-call override", async (model) => {
    const fetchStub = stubFetch(() => proposalResponse(validProposal()));

    await generateDayActivities(KEYWORD, undefined, { model });

    expect(bodyOf(fetchStub).model).toBe(model);
  });

  it("lets a per-call override win over the configured value", async () => {
    env.model = DEFAULT_MODEL;
    const other = ALLOWED_MODELS.find((candidate) => candidate !== DEFAULT_MODEL);
    const fetchStub = stubFetch(() => proposalResponse(validProposal()));

    await generateDayActivities(KEYWORD, undefined, { model: other });

    expect(bodyOf(fetchStub).model).toBe(other);
  });

  // A counter, not the absence of an exception: the point is that an off-list
  // model costs nothing, not merely that it throws (test-plan.md §6.2).
  it("refuses a configured model that is off the list before touching the network", async () => {
    env.model = "deepseek/deepseek-v4-flash";
    const fetchStub = stubFetch(() => proposalResponse(validProposal()));

    const failure = await failureOf(generateDayActivities(KEYWORD));

    expect(failure.category).toBe("config");
    expect(failure.message).toContain("deepseek/deepseek-v4-flash");
    expect(fetchStub).not.toHaveBeenCalled();
  });

  // The gate must not be able to certify a model production would refuse, so an
  // override goes through the same predicate as a configured value.
  it("refuses an off-list per-call override before touching the network", async () => {
    const fetchStub = stubFetch(() => proposalResponse(validProposal()));

    const failure = await failureOf(generateDayActivities(KEYWORD, undefined, { model: "meta/llama-4" }));

    expect(failure.category).toBe("config");
    expect(fetchStub).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// The outline prompt's count placeholders
// ---------------------------------------------------------------------------
//
// The prompt is the only content-safety layer there is (`lessons.md`), so what
// reaches the model is worth asserting directly rather than inferring from a
// generation that happened to succeed. These run no request.

describe("buildOutlineSystemMessage", () => {
  it.each([
    [1, "jeden temat dzienny", "jeden temat"],
    [2, "dwa tematy dzienne", "dwa tematy"],
    [5, "pięć tematów dziennych", "pięć tematów"],
  ])("uses the Polish agreement for %i days", (count, daily, plain) => {
    const message = buildOutlineSystemMessage(count);

    expect(message).toContain(daily);
    expect(message).toContain(plain);
    expect(message).toContain(`od 1 do ${String(count)}`);
  });

  it("leaves no placeholder unfilled at any supported count", () => {
    for (const count of [1, 2, 3, 4, 5]) {
      expect(buildOutlineSystemMessage(count)).not.toContain("{{");
    }
  });

  // The safety and language sections are the reason this file is reviewed at
  // all; the count edit must not have moved a word of them.
  it("keeps the age, safety and language instruction intact", () => {
    const message = buildOutlineSystemMessage(2);

    expect(message).toContain("dzieci w wieku **3–6 lat**");
    expect(message).toContain("**bezpieczny**");
    expect(message).toContain("Piszesz **wyłącznie po polsku**");
    expect(message).toContain("## Hasło nieodpowiednie dla wieku");
  });

  it.each([[0], [6]])("refuses a count of %i rather than sending an unfilled prompt", (count) => {
    expect(() => buildOutlineSystemMessage(count)).toThrow(GenerationError);
  });
});
