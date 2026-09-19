/**
 * The one switch that suspends the content-safety gate.
 *
 * Suspended by decision on 2026-09-19, during `week-regeneration-replace`: the
 * gate is the most expensive thing this repository can run - every allowed
 * model × every gate keyword × every reachable mode, each verdict costing a
 * judge call on top - and the OpenRouter account funding it ran dry mid-slice
 * (`402` on every `google/gemini-3.7-flash` call). Suspending it is a cost
 * decision, and it is the owner's to make.
 *
 * **What this costs, stated plainly so nobody has to rediscover it.**
 * `lessons.md` §3 records that when a prompt is the only layer of content
 * safety - which it is here, there is no runtime judge in the write path - the
 * gate must re-run across every allowed model before a prompt change merges.
 * That rule is not repealed by this flag; it is unenforced while the flag is
 * on. A prompt edit merged in this state has been graded by nobody.
 *
 * **Deliberately a skip, not a deletion, and deliberately not a silent pass.**
 * The suites still exist, still compile, and still run in full the moment the
 * flag flips. Vitest reports a skipped test as skipped rather than passed, and
 * `ci.yml`'s gate job annotates any PR touching a prompt with a warning - so a
 * suspended gate reads as suspended everywhere it is looked at, which is the
 * one property that makes it safe to leave off on purpose.
 *
 * To run it for real, locally or in CI:
 *
 * ```sh
 * RUN_CONTENT_SAFETY_GATE=1 npm run test:gate
 * ```
 */

export const GATE_SUSPENDED = process.env.RUN_CONTENT_SAFETY_GATE !== "1";

export const GATE_SUSPENSION_NOTICE =
  "BRAMKA BEZPIECZEŃSTWA TREŚCI ZAWIESZONA (decyzja 2026-09-19, koszt). " +
  "Nic nie zostało ocenione. Uruchom: RUN_CONTENT_SAFETY_GATE=1 npm run test:gate";

/**
 * Prints the notice once per suspended suite.
 *
 * `console.warn` rather than `console.info`: a suspended safety gate is not a
 * routine fact about the run, and the two streams are read differently by
 * whoever is scrolling past.
 */
export function warnIfSuspended(suite: string): void {
  if (!GATE_SUSPENDED) {
    return;
  }
  // eslint-disable-next-line no-console
  console.warn(`[${suite}] ${GATE_SUSPENSION_NOTICE}`);
}
