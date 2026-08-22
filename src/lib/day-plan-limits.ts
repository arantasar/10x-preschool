/**
 * Numbers shared by the generation service, its route and the React island.
 *
 * They sit in their own module because the three callers cannot share either of
 * the obvious homes: `activity-generator.ts` imports `astro:env/server` and can
 * never be reached from the browser, and importing `day-plan-contract.ts` into
 * the island would drag zod into the client bundle for the sake of one integer.
 * A copied constant is exactly the kind of thing that drifts silently, and the
 * character counter drifting away from the route's validation would show up as
 * a rejected hasło the teacher was told was fine.
 */

// ---------------------------------------------------------------------------
// Input bounds
// ---------------------------------------------------------------------------
// These mirror the CHECK constraints from
// `supabase/migrations/20260720162247_bound_plan_and_activity_input.sql`.
// S-01 writes nothing to the database, so nothing here is enforced by Postgres
// yet - which is exactly why the bounds have to live in the contract. A model
// that returns a 300-character title would otherwise pass S-01 and only fail on
// the CHECK in S-02: a different slice, a different commit, a different
// debugging context.
//
// If the migration changes, these change with it. They are the same knob.

export const TITLE_MAX = 200;
export const DESCRIPTION_MAX = 4000;
export const PROMPT_MAX = 2000;

/** How many proposals one generation returns. Mirrors `day-plan.schema.json`. */
export const ACTIVITY_COUNT = 3;

// ---------------------------------------------------------------------------
// Generation timing
// ---------------------------------------------------------------------------
// The NFR allows a generation to legitimately take 10-30s, so a single attempt is
// given headroom above that. TOTAL_BUDGET_MS then caps the retry path: the plan
// commits to a worst case of roughly 60s, and a naive "retry after a 45s timeout"
// would silently make it 90s.

export const ATTEMPT_TIMEOUT_MS = 45_000;
export const TOTAL_BUDGET_MS = 60_000;
export const MIN_RETRY_BUDGET_MS = 5_000;
export const RETRY_BACKOFF_MS = 1_000;

/**
 * When the progress indicator may state that a retry is under way.
 *
 * This is a deduction, not a guess: a first attempt that had not failed would
 * have either answered or hit {@link ATTEMPT_TIMEOUT_MS} by now, so a request
 * still in flight past that point plus the backoff is provably on its second
 * attempt. A transient failure can of course happen earlier - the indicator then
 * simply keeps showing a generic stage, which is honest but less specific.
 */
export const RETRY_VISIBLE_AFTER_MS = ATTEMPT_TIMEOUT_MS + RETRY_BACKOFF_MS;
