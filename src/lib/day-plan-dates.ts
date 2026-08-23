/**
 * Which day `/plan` is showing.
 *
 * This moved out of the island in S-02 because the server now needs it too: the
 * page resolves `?date=` before rendering, so a saved plan is on screen in the
 * first paint rather than after a fetch. Both sides must agree on what "today"
 * and "a valid date" mean, and a copied implementation is exactly the kind of
 * thing that drifts silently.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Today as the *teacher* reckons it, not as the server does.
 *
 * `new Date().toISOString().slice(0, 10)` is UTC, and this runs on Cloudflare
 * Workers, whose clock is UTC with no request-time knowledge of where the caller
 * is. For a teacher in Poland that is wrong for the first two hours after
 * midnight: at 00:30 CEST it is still the previous day in UTC, so the page would
 * open on yesterday.
 *
 * Europe/Warsaw is hard-coded rather than guessed, and that is a product
 * decision showing through: the PRD, the prompt and every string in this app are
 * Polish, for Polish preschools. If that ever stops being true, this is the line
 * that has to learn about time zones properly - not a `?date=` default sprinkled
 * through the callers.
 */
export function todayIsoDate(): string {
  // en-CA formats as YYYY-MM-DD, which is the shape we want; `sv-SE` would do
  // as well. Neither is a locale choice - both are just ISO-shaped output.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(new Date());
}

/**
 * The day a request is asking for: `?date=YYYY-MM-DD` when it is a real date,
 * today otherwise.
 *
 * Falls back rather than erroring, because a mistyped query string is not worth
 * an error page - the teacher gets today and a date picker. The round-trip check
 * is what rejects a well-shaped impossibility like `2026-02-31`, which the regex
 * alone would wave through and Postgres would then refuse.
 */
export function resolvePlanDate(value: string | null | undefined): string {
  if (!value || !ISO_DATE.test(value)) {
    return todayIsoDate();
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return todayIsoDate();
  }
  return value;
}

/** `2026-09-14` as `poniedziałek, 14 września 2026`. For headings, not inputs. */
export function formatPlanDate(isoDate: string): string {
  return new Intl.DateTimeFormat("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

/**
 * When a plan was accepted, as `23 sierpnia, 11:31`.
 *
 * The time zone is pinned for the same reason as in {@link todayIsoDate}, but
 * here the cost of leaving it out is sharper than an off-by-one day: this string
 * is rendered on the server *and* re-rendered during hydration. Workers run in
 * UTC and the teacher's browser does not, so an unpinned formatter prints 09:31
 * server-side and 11:31 a moment later - a hydration mismatch, and two hours
 * wrong until React patches it.
 *
 * The timestamp itself comes from the database. Only its rendering is decided
 * here.
 */
export function formatAcceptedAt(acceptedAt: string): string {
  return new Intl.DateTimeFormat("pl-PL", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Warsaw",
  }).format(new Date(acceptedAt));
}
