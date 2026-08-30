/**
 * Builders for what OpenRouter puts on the wire.
 *
 * This module deliberately imports nothing from `activity-generator.ts`. The
 * provider's response shape has to be described independently of the code that
 * reads it — a fixture built from the reader's own types would let a test pass
 * by agreeing with itself (anti-pattern #5 in `context/foundation/test-plan.md`).
 *
 * Everything here returns what a stubbed `globalThis.fetch` should hand back:
 * either a `Response`, or a rejection matching the transport failure being
 * reproduced.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A well-formed 200 whose single choice carries `content` verbatim. */
export function contentResponse(content: string, usage?: { cost?: number; model?: string }): Response {
  return jsonResponse({
    model: usage?.model ?? "openai/gpt-5.6-luna",
    usage: { cost: usage?.cost ?? 0.0004 },
    choices: [{ finish_reason: "stop", message: { content } }],
  });
}

/** A 200 carrying a JSON payload as the model's content. */
export function proposalResponse(payload: unknown, usage?: { cost?: number; model?: string }): Response {
  return contentResponse(JSON.stringify(payload), usage);
}

/** A 200 whose single choice reports the given `finish_reason`. */
export function finishReasonResponse(finishReason: string, content = '{"aktywnosci":[{"tytul":"a","opis":'): Response {
  return jsonResponse({
    choices: [{ finish_reason: finishReason, message: { content } }],
  });
}

/** A 200 whose single choice carries a mid-generation provider error. */
export function choiceErrorResponse(code = 502, errorType = "provider_error"): Response {
  return jsonResponse({
    choices: [{ finish_reason: "stop", error: { code, metadata: { error_type: errorType } } }],
  });
}

/** A non-2xx response carrying OpenRouter's error envelope. */
export function errorStatusResponse(status: number, errorType = "rate_limit"): Response {
  return jsonResponse({ error: { code: status, metadata: { error_type: errorType } } }, status);
}

/** A 200 whose body is not JSON at all — an edge proxy's HTML, typically. */
export function unparsableBodyResponse(): Response {
  return new Response("<html><body>502 Bad Gateway</body></html>", {
    status: 200,
    headers: { "content-type": "text/html" },
  });
}

/** A 200 that parses as JSON but carries no `choices` array. */
export function noChoicesResponse(): Response {
  return jsonResponse({ id: "gen-1", object: "chat.completion" });
}

/** What `AbortSignal.timeout` makes `fetch` reject with once the attempt window closes. */
export function timeoutRejection(): DOMException {
  return new DOMException("The operation was aborted due to timeout", "TimeoutError");
}

/** A dropped connection, as `fetch` reports it. */
export function networkRejection(): TypeError {
  return new TypeError("fetch failed");
}
