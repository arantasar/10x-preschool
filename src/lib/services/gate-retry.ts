import { GenerationError } from "./generation-error";

/**
 * Retries the reservation collision the gate's own concurrent matrix produces
 * (`402 "in_flight_budget_exhausted"`) - live in the Phase 4 run: `judgeSafely`
 * only retried `category === "transient"`, but `categorizeStatus` maps 402 to
 * `config`, correctly, for the real "out of credits / bad key" case a single
 * production request can hit (retrying that wastes the teacher's time for
 * nothing - `generation-error.ts`). The gate's `GATE_CONCURRENCY` workers can
 * momentarily collide on OpenRouter's per-account in-flight reservation even
 * with a healthy balance and a valid key, which is a different, self-clearing
 * 402 - see `content-safety.gate.test.ts`'s `GATE_CONCURRENCY` comment. Only
 * status 402 gets this carve-out; a real 401/403/404 config failure is not
 * retried.
 *
 * One retry, same policy as the existing `transient` case: never retries a
 * verdict the call actually returned, only a call that never produced one.
 */
export async function retryGateCall<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (firstError) {
    const retryable =
      firstError instanceof GenerationError && (firstError.category === "transient" || firstError.status === 402);
    if (!retryable) {
      throw firstError;
    }
    return call();
  }
}
