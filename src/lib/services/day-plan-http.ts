import { StoreError, type StoreErrorCategory } from "./day-plan-store";
import type { DayPlanWithCurrentActivities } from "@/types";

/**
 * The wire envelope every day-plan route answers with.
 *
 * It lives here rather than in each route because there are three of them now -
 * generate, edit, accept - and they must be indistinguishable to the island: it
 * has one response handler, and a status or a message that differs between
 * routes for the same underlying condition would make that handler wrong for one
 * of them. `day-plan-contract.ts` is the same idea for what comes *in*.
 */

/**
 * Success is always the saved plan and its live batch - never the fragment a
 * particular route happened to change.
 *
 * Editing one proposal also clears the plan's `accepted_at`, by trigger, so a
 * response carrying only the edited activity would leave the island holding a
 * plan it believes is still accepted. Both facts have to arrive together.
 */
export type DayPlanSuccessBody = DayPlanWithCurrentActivities;

/**
 * `retryable` is the whole point of this envelope. Without it, "the database is
 * momentarily unreachable" and "that row is not yours" look identical to a
 * teacher, and the island has to guess from a message string whether keeping the
 * retry button makes sense.
 */
export interface DayPlanErrorBody {
  readonly error: string;
  readonly retryable: boolean;
}

export function json(body: DayPlanSuccessBody | DayPlanErrorBody, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * One status per category, so a server log can tell them apart without reading
 * bodies. `invalid` is 500 rather than 400 deliberately: by the time a store
 * call refuses a value, zod has already accepted it against the same bounds the
 * CHECK enforces - so the two disagreeing is our bug, not the caller's.
 */
const STATUS_BY_CATEGORY: Record<StoreErrorCategory, number> = {
  config: 500,
  transient: 503,
  invalid: 500,
  not_found: 404,
  conflict: 409,
};

const MESSAGE_BY_CATEGORY: Record<StoreErrorCategory, string> = {
  config: "Zapisywanie planów jest teraz niedostępne. Skontaktuj się z administratorem.",
  transient: "Nie udało się zapisać zmiany. Spróbuj ponownie za chwilę.",
  invalid: "Nie udało się zapisać zmiany. Odśwież stronę i spróbuj ponownie.",
  // Deliberately vague. A throw site that knows what was missing overrides it
  // with `userMessage`; the default must not guess between a plan and a
  // proposal, because naming the wrong one is worse than naming neither.
  not_found: "Nie znaleziono szukanego elementu.",
  // The one category a teacher can actually resolve: their view of the day is
  // older than the database's, so the message names the action, not the fault.
  conflict: "Ten plan zmienił się w innym miejscu. Odśwież stronę i spróbuj ponownie.",
};

/**
 * Answers 401 as JSON rather than leaving it to `src/middleware.ts`, which
 * redirects to `/auth/signin`. That is right for a page and wrong for a route
 * the island calls with `fetch`: it would follow the redirect and try to parse
 * the sign-in page as JSON, turning "your session expired" into a parse error.
 */
export function unauthorized(): Response {
  return json({ error: "Twoja sesja wygasła. Zaloguj się ponownie.", retryable: false }, 401);
}

export function badRequest(message: string): Response {
  return json({ error: message, retryable: false }, 400);
}

/** Supabase is not configured - a value, not an exception. See `@/lib/supabase`. */
export function unconfigured(): Response {
  return json({ error: MESSAGE_BY_CATEGORY.config, retryable: false }, 500);
}

// `wrangler.jsonc` sets `observability.enabled`, so console output is captured
// without adding a logging dependency the project deliberately does not carry.
// Same shape as `activity-generator.ts`, on purpose: one route can fail in
// either layer, and a reader grepping for `.failed` should find both.
function logError(message: string, fields: Record<string, unknown>): void {
  /* eslint-disable-next-line no-console */
  console.error(message, fields);
}

/**
 * Turns any failure from the store into the envelope. Anything that is not a
 * {@link StoreError} is treated as `transient`: an unrecognised failure is more
 * likely a blip than a permanent condition, and telling a teacher to give up is
 * the more expensive of the two mistakes.
 *
 * This is also where store failures are logged, and the reason it happens here
 * rather than in `toStoreError` is coverage: several `StoreError`s are raised by
 * hand and never touch a `PostgrestError` - the `not_found` from an update that
 * matched nothing, the refusal to replace an accepted plan. Every route funnels
 * through this function, so logging here records all of them exactly once.
 *
 * `code` is the field worth having: without it a `23514` from the generation
 * invariant and a `22001` from an over-long title are the same 500 in the log as
 * they are on the screen. `message` carries row ids and PostgREST prose, which is
 * why it goes to the log and never to the browser - the teacher sees
 * `userMessage`, or the category's default, and nothing else.
 */
export function storeFailure(error: unknown): Response {
  const failure =
    error instanceof StoreError ? error : new StoreError("transient", "Nieoczekiwany błąd zapisu.", { cause: error });

  logError("day-plan-store.failed", {
    category: failure.category,
    code: failure.code,
    retryable: failure.retryable,
    message: failure.message,
  });

  return json(
    { error: failure.userMessage ?? MESSAGE_BY_CATEGORY[failure.category], retryable: failure.retryable },
    STATUS_BY_CATEGORY[failure.category],
  );
}

/**
 * The read every mutating route ends with. A write that succeeds and then reads
 * back nothing is not a 404 - the route holds the id it just wrote - so it is
 * reported as the inconsistency it is rather than as a missing row.
 */
export function requireSaved(saved: DayPlanSuccessBody | null, planId: string): DayPlanSuccessBody {
  if (!saved) {
    throw new StoreError("transient", `Zapisany plan ${planId} nie jest widoczny po zapisie.`);
  }
  return saved;
}
