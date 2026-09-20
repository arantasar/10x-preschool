import { useRef, useState } from "react";
import { Check, CircleAlert, Sparkles } from "lucide-react";
import { WeekDayCard, type DayState } from "@/components/plan/WeekDayCard";
import { Button } from "@/components/ui/button";
import { PROMPT_MAX, WEEK_DAYS } from "@/lib/day-plan-limits";
import { cn } from "@/lib/utils";
import { isDayPlanBody, isErrorBody, isGeneratedDayBody, isOutlineBody, isSaveWeekBody } from "@/lib/day-plan-guards";
import {
  ALL_ACCEPTED_MESSAGE,
  isWeekEmpty,
  partitionWeek,
  replacementConfirmation,
  type WeekDayAcceptance,
} from "@/lib/week-generation";
import type { ActivityDraft, DayPlanView, WeekPlanView } from "@/types";

/**
 * The orchestrator. One hasło in, one week replaced - or none of it.
 *
 * Reshaped at `S-09`. It used to generate only the days that had no row at all,
 * badge the rest `pominięty`, and treat "three saved, two failed" as a normal
 * outcome. Both of those stopped being true:
 *
 *   * **Targets are chosen by acceptance, not by emptiness.** A draft is
 *     replaceable; an accepted day is not (until `S-10`). See
 *     `@/lib/week-generation`, where the partition and the confirmation
 *     sentence live so they can be tested without rendering anything.
 *   * **The write is all-or-nothing.** Days are generated through
 *     `/api/day-plan/week/day`, which writes nothing, and the batches are held
 *     *here* until every target has one. Only then does
 *     `/api/day-plan/week/save` fire, once, and commit them in a single
 *     transaction. A run that dies halfway leaves every row exactly as it was.
 *
 * What that buys, and what it costs, in one place:
 *
 *   * Per-day progress and per-day retry survive - the island still drives, so
 *     one transient rate limit does not discard four generations the teacher
 *     already paid for. That is why the orchestration did not move into a
 *     single server route.
 *   * Between generation and the write, the proposals exist **only in this
 *     island's memory**. Closing the tab loses them, and nothing was written,
 *     which is the correct outcome - but it has to be on screen rather than
 *     discovered, which is what the `held` status and the banner below are for.
 *
 * Concurrency is per day, as before: `DayPlanEditor` guards with a single
 * `inFlight` ref because its mutations touch one plan, and a global guard here
 * would make the first day block the other four. The week-level ref still
 * covers the outline, the write and the week buttons.
 *
 * Nothing here retries by itself. `generateDayActivities` already retries once
 * inside the route, and a second layer of automatic retries on top of five
 * parallel calls is how a rate limit turns into a bill.
 */

interface WeekPlanBoardProps {
  readonly week: WeekPlanView;
}

type Busy = "idle" | "outlining" | "generating" | "saving" | "accepting";

interface Failure {
  readonly message: string;
  readonly signInRequired: boolean;
}

/** One day of the payload `/api/day-plan/week/save` expects. */
interface WeekWriteDay {
  readonly plan_date: string;
  readonly theme?: string;
  readonly activities: readonly ActivityDraft[];
}

export default function WeekPlanBoard({ week }: WeekPlanBoardProps) {
  const [days, setDays] = useState<Record<string, DayState>>(() => initialDays(week));
  const [prompt, setPrompt] = useState(() => firstPrompt(week));
  const [promptError, setPromptError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState<Busy>("idle");
  const [failure, setFailure] = useState<Failure | null>(null);

  // Per day, not per island. Five generations run at once and each one owns only
  // its own row; a shared flag here would serialise the week for no reason.
  const inFlight = useRef<Set<string>>(new Set());
  // Guards the outline and the two week-level buttons - the operations that
  // really are one-at-a-time.
  const weekInFlight = useRef(false);
  // Guards the write alone, and is taken synchronously by `writeWeek` itself.
  // `weekInFlight` cannot do this job: `retryDay` deliberately does not hold it
  // while generating, so two retries finishing close together would both see a
  // complete held set and both POST the write. Two transactions bump every
  // day's `current_generation` twice, which strands the island's
  // `expected_generation` and 409s the whole week on accept.
  const writeInFlight = useRef(false);
  // How many single-day retries are generating right now. `retryDay` may run
  // several at once by design, but a *week* run must not start on top of them:
  // it would regenerate under a new hasło while a retry still holds the old one
  // captured at its call, and whichever write lands last decides `prompt` for
  // every day.
  const retriesInFlight = useRef(0);

  const isBusy = busy !== "idle";
  const dayList = week.days.map((date) => days[date]);
  // `plan !== null` throughout: a held batch has no row, so it is not a ready
  // day and is not acceptable. Counting it would offer "Akceptuj tydzień" for
  // proposals the database has never seen.
  const readyCount = dayList.filter((day) => day.plan !== null).length;
  const acceptableCount = dayList.filter((day) => day.plan !== null && !day.plan.plan.accepted_at).length;
  const heldCount = dayList.filter((day) => day.batch !== null).length;
  // Every day this run could target - i.e. every unaccepted day - must be
  // holding a batch before the write may be re-issued. Writing whatever happens
  // to be held while one day is still failed would commit a partial week, which
  // is the one outcome this whole slice exists to make impossible.
  const heldSetIsComplete =
    heldCount > 0 && dayList.every((day) => day.plan?.plan.accepted_at != null || day.batch !== null);

  function patchDay(planDate: string, patch: Partial<DayState>): void {
    setDays((current) => ({ ...current, [planDate]: { ...current[planDate], ...patch } }));
  }

  /**
   * Generates one day and holds the batch. Writes nothing.
   *
   * Returns rather than throws: the caller is `Promise.allSettled` over up to
   * five of these, and a rejection there would say nothing the row does not
   * already say.
   *
   * The 409 branch this used to have is gone with the route it belonged to.
   * `/api/day-plan/week/day` touches no row, so it has no conflict to report,
   * and "skipped" is no longer an outcome of generating - a day is either a
   * target or it was never in the run.
   */
  async function generateDay(planDate: string, theme: string | null, keyword: string): Promise<void> {
    if (inFlight.current.has(planDate)) return;
    inFlight.current.add(planDate);
    // `batch: null` clears any batch this day was already holding. The day is
    // being regenerated, so that batch is superseded - and leaving it would let
    // a *failed* regeneration fall back to stale proposals that the write would
    // then commit as if they were this run's.
    patchDay(planDate, { status: "generating", batch: null, error: null, retryable: false, theme });

    try {
      const response = await fetch("/api/day-plan/week/day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_date: planDate,
          prompt: keyword,
          ...(theme === null ? {} : { theme }),
        }),
      });
      const body: unknown = await response.json().catch(() => null);

      if (response.ok && isGeneratedDayBody(body)) {
        // Into `batch`, never into `plan`: there is no row behind these yet,
        // and the distinction is what keeps `readyCount` and "Akceptuj
        // tydzień" from counting a day nothing has written.
        patchDay(planDate, {
          status: "held",
          batch: body.activities,
          theme: body.theme,
          error: null,
          retryable: false,
        });
        return;
      }

      if (response.status === 401) {
        setFailure({ message: "Twoja sesja wygasła. Zaloguj się ponownie.", signInRequired: true });
        patchDay(planDate, { status: "failed", error: "Sesja wygasła.", retryable: false });
        return;
      }

      patchDay(planDate, {
        status: "failed",
        error: isErrorBody(body) ? body.error : "Nie udało się wygenerować tego dnia.",
        retryable: isErrorBody(body) ? body.retryable : true,
      });
    } catch {
      patchDay(planDate, {
        status: "failed",
        error: "Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.",
        retryable: true,
      });
    } finally {
      inFlight.current.delete(planDate);
    }
  }

  /**
   * Commits every held batch as one transaction, once the set is complete.
   *
   * Reads the batches out of `setDays` rather than taking them as an argument,
   * because the two callers reach this from different places - the end of a
   * week run, and the retry of a single failed day - and both must see the same
   * state React actually holds rather than a copy captured earlier.
   *
   * Returns without writing if any target is still missing a batch. That is the
   * guard that keeps the transaction whole: a write fired as batches arrive
   * would be one day wide again, which is exactly the partial week this slice
   * removes.
   *
   * Takes `writeInFlight` here rather than at the call sites, and takes it
   * before the first `await` so it is set for every later caller in this tick
   * and every later microtask. The call sites cannot do this themselves:
   * `retryDay` reaches this after a 10-30s generation, so a check it made
   * before that generation says nothing about now.
   */
  async function writeWeek(targets: readonly string[], keyword: string): Promise<void> {
    if (writeInFlight.current) return;
    writeInFlight.current = true;
    try {
      await writeWeekOnce(targets, keyword);
    } finally {
      writeInFlight.current = false;
    }
  }

  async function writeWeekOnce(targets: readonly string[], keyword: string): Promise<void> {
    const held = await new Promise<WeekWriteDay[] | null>((resolve) => {
      // Read through `setDays` rather than from the `days` closure: the two
      // callers reach this from different places - the end of a week run and
      // the retry of a single day - and both must see the state React actually
      // holds, not a copy captured before the last batch landed. The updater
      // returns `current` unchanged; it is a read, not a write.
      setDays((current) => {
        const entries: WeekWriteDay[] = [];
        for (const date of targets) {
          const batch = current[date].batch;
          if (batch === null) {
            resolve(null);
            return current;
          }
          const theme = current[date].theme;
          entries.push({
            plan_date: date,
            ...(theme === null ? {} : { theme }),
            activities: batch,
          });
        }
        resolve(entries);
        return current;
      });
    });

    if (held === null) {
      return;
    }

    setBusy("saving");
    for (const date of targets) {
      patchDay(date, { status: "saving" });
    }

    try {
      const response = await fetch("/api/day-plan/week/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: keyword, days: held }),
      });
      const body: unknown = await response.json().catch(() => null);

      if (response.ok && isSaveWeekBody(body)) {
        // The response replaces the rows wholesale. It was read back from the
        // database, so it is the only thing that knows the new
        // `current_generation` - and the island's own copy of what it sent is
        // exactly the optimism this is here to discard.
        const saved = body.plans;
        setDays((current) => {
          const next = { ...current };
          for (const date of targets) {
            const plan = saved[date];
            next[date] = plan
              ? {
                  ...next[date],
                  status: "done",
                  plan,
                  batch: null,
                  theme: plan.plan.theme,
                  error: null,
                  retryable: false,
                }
              : // A target the write did not return. Nothing to show and
                // nothing was lost that is not already gone; say so rather than
                // leave the row claiming "Zapisuję…".
                {
                  ...next[date],
                  status: "failed",
                  error: "Ten dzień nie wrócił z zapisu. Odśwież stronę.",
                  retryable: false,
                };
          }
          return next;
        });
        return;
      }

      // The write failed, so *nothing* was written - the transaction saw to
      // that. The batches are still held, so the rows go back to `held` rather
      // than to `failed`, and the "Zapisz tydzień" button below can re-issue
      // the write alone. Pressing "Generuj tydzień" would regenerate and charge
      // for it again, which is exactly what holding the batches is meant to
      // avoid.
      setFailure({
        message: isErrorBody(body) ? body.error : "Nie udało się zapisać tygodnia.",
        signInRequired: response.status === 401,
      });
      for (const date of targets) {
        patchDay(date, { status: "held" });
      }
    } catch {
      setFailure({
        message: "Brak połączenia z serwerem. Tydzień nie został zapisany — propozycje wciąż są na ekranie.",
        signInRequired: false,
      });
      for (const date of targets) {
        patchDay(date, { status: "held" });
      }
    }
  }

  function generateWeek(): void {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setPromptError("Wpisz hasło tygodnia, np. „Dinozaury”.");
      return;
    }
    if (prompt.length > PROMPT_MAX) {
      setPromptError(`Hasło może mieć najwyżej ${String(PROMPT_MAX)} znaków.`);
      return;
    }
    setPromptError(undefined);
    if (weekInFlight.current) return;
    // A retry generating right now holds the *old* hasło, captured when it was
    // pressed. Letting a week run start alongside it means two hasła in flight
    // over one week, and the write that lands last sets `prompt` for every day.
    if (retriesInFlight.current > 0) return;

    // Acceptance decides, not emptiness. See `@/lib/week-generation`.
    const acceptance = weekAcceptance(week.days, days);
    const partition = partitionWeek(acceptance);

    // The only condition that can refuse a whole week now. "Wszystkie dni mają
    // już plan" was the old test and is no longer true of anything: a week of
    // drafts generates.
    if (partition.targets.length === 0) {
      setFailure({ message: ALL_ACCEPTED_MESSAGE, signInRequired: false });
      return;
    }

    // An affordance, not the guard. The island's `accepted_at` can be stale, so
    // `save_week_plan_generation` still refuses an unconfirmed accepted day
    // with U0001 - the dialog is what makes that refusal rare, not what makes
    // it safe. Same division as `DayPlanEditor.generate()`.
    const confirmation = replacementConfirmation(partition, isWeekEmpty(acceptance));
    if (confirmation !== null && !window.confirm(confirmation)) {
      return;
    }

    const targets = partition.targets;
    const untouched = partition.untouched;

    weekInFlight.current = true;
    setFailure(null);
    setBusy("outlining");

    void (async () => {
      try {
        // Outlined for the targets only, which is what `S-09` narrowed the
        // route's contract to 1..5 for. Asking for the whole week would buy
        // themes for accepted days that nothing will ever apply them to.
        const response = await fetch("/api/day-plan/week/outline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, dates: targets }),
        });
        const body: unknown = await response.json().catch(() => null);

        if (!response.ok || !isOutlineBody(body)) {
          setFailure({
            message: isErrorBody(body) ? body.error : "Nie udało się ułożyć planu tygodnia.",
            signInRequired: response.status === 401,
          });
          return;
        }

        const themeByDate = new Map(body.themes.map((theme) => [theme.plan_date, theme.theme]));
        setDays((current) => {
          const next = { ...current };
          for (const date of targets) {
            next[date] = { ...next[date], theme: themeByDate.get(date) ?? null };
          }
          // Marked only once the run is genuinely under way, so the badge means
          // what it says: this run reached them and deliberately left them
          // alone. Marking them before the outline would have a failed outline
          // report successful skips.
          for (const date of untouched) {
            next[date] = { ...next[date], status: "skipped" };
          }
          return next;
        });

        setBusy("generating");
        // All targets at once, so the week costs the slowest day rather than
        // the sum. Nothing is written by any of them.
        await Promise.allSettled(targets.map((date) => generateDay(date, themeByDate.get(date) ?? null, prompt)));

        // One write, after the whole set is in hand. `writeWeek` returns
        // without writing if any target failed, leaving the successes held for
        // a per-day retry.
        await writeWeek(targets, prompt);
      } catch {
        // The outline's own `fetch` - `response.json()` is already guarded. Left
        // uncaught this rejects the void-ed promise and the button simply returns
        // to idle, telling the teacher nothing at all.
        setFailure({
          message: "Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.",
          signInRequired: false,
        });
      } finally {
        weekInFlight.current = false;
        setBusy("idle");
      }
    })();
  }

  /**
   * Retries one day, and only that day - then writes the week if that completed
   * the set.
   *
   * Deliberately does not take `weekInFlight` while generating: two days
   * failing on one rate limit is the ordinary case, and a global lock here would
   * make the teacher retry them one after another. The week-level lock is still
   * *read*, so a retry cannot start on top of a running week.
   *
   * `generateDay`'s per-day guard is *not* the only collision that matters,
   * which is what this function used to assume. Two retries own different days
   * and so never meet there, but they converge on one week-level write, and a
   * week run started alongside them carries a different hasło. Those two are
   * held off by `writeInFlight` (taken inside `writeWeek`) and by
   * `retriesInFlight` (read by `generateWeek`) respectively - not by a check
   * made here before a 10-30s generation, which says nothing about the state
   * that generation returns into.
   *
   * The write it may trigger is what makes a partial run recoverable: four days
   * paid for and one rate-limited is one retry away from a committed week,
   * rather than four generations thrown away.
   */
  function retryDay(planDate: string): void {
    if (weekInFlight.current) return;
    const keyword = prompt;

    // Registered synchronously, before the generation starts. A week run
    // checks this counter, so the window between "this retry began" and "this
    // retry wrote" is never one a `generateWeek` can start inside.
    retriesInFlight.current += 1;
    setBusy("generating");

    void (async () => {
      try {
        await generateDay(planDate, days[planDate].theme, keyword);

        // The set this day belongs to, recomputed from the board: the accepted
        // days are still out, and every other day either holds a batch or is the
        // one that just failed again.
        const targets = weekAcceptance(week.days, days)
          .filter((day) => !day.accepted)
          .map((day) => day.planDate);

        // `writeWeek` takes `writeInFlight` itself, so two retries completing
        // together produce one write, not two.
        await writeWeek(targets, keyword);
      } finally {
        retriesInFlight.current -= 1;
        // Only the last retry standing clears the banner. Clearing it
        // unconditionally would re-enable every control while a sibling retry
        // was still generating.
        if (retriesInFlight.current === 0) {
          setBusy("idle");
        }
      }
    })();
  }

  /**
   * Re-issues the write for a set that is already generated and still held.
   *
   * The counterpart to `retryDay` for the other half of a run: a write can fail
   * on a connection blip after every day has been paid for, and the batches are
   * right there. Regenerating them to recover would burn five generations to
   * work around one failed round trip.
   */
  function retryWrite(): void {
    if (weekInFlight.current) return;
    const targets = weekAcceptance(week.days, days)
      .filter((day) => !day.accepted)
      .map((day) => day.planDate);

    weekInFlight.current = true;
    setFailure(null);
    void (async () => {
      try {
        await writeWeek(targets, prompt);
      } finally {
        weekInFlight.current = false;
        setBusy("idle");
      }
    })();
  }

  function acceptWeek(): void {
    if (weekInFlight.current) return;
    const pending = week.days
      .map((date) => days[date])
      .filter((day): day is DayState & { plan: DayPlanView } => day.plan !== null && !day.plan.plan.accepted_at);
    if (pending.length === 0) return;

    weekInFlight.current = true;
    setFailure(null);
    setBusy("accepting");

    void (async () => {
      try {
        await Promise.allSettled(
          pending.map(async (day) => {
            try {
              const response = await fetch("/api/day-plan/accept", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  plan_id: day.plan.plan.id,
                  accepted: true,
                  // The batch this card was rendered from. A day that moved on
                  // since is refused rather than signed off unseen - the guard
                  // finding F4 of the S-02 review put on this route.
                  expected_generation: day.plan.plan.current_generation,
                }),
              });
              const body: unknown = await response.json().catch(() => null);
              if (response.ok && isDayPlanBody(body)) {
                patchDay(day.planDate, { plan: body });
                return;
              }
              patchDay(day.planDate, {
                status: "failed",
                error: isErrorBody(body) ? body.error : "Nie udało się zaakceptować tego dnia.",
                retryable: false,
              });
            } catch {
              patchDay(day.planDate, {
                status: "failed",
                error: "Brak połączenia z serwerem.",
                retryable: false,
              });
            }
          }),
        );
      } finally {
        weekInFlight.current = false;
        setBusy("idle");
      }
    })();
  }

  const remaining = PROMPT_MAX - prompt.length;

  return (
    <div className="space-y-6">
      <form
        className="space-y-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          generateWeek();
        }}
      >
        <div>
          <label htmlFor="week-prompt" className="mb-1 block text-sm text-blue-100/80">
            Hasło tygodnia
          </label>
          <textarea
            id="week-prompt"
            name="prompt"
            rows={2}
            value={prompt}
            disabled={isBusy}
            maxLength={PROMPT_MAX}
            placeholder="np. Dinozaury"
            onChange={(event) => {
              setPrompt(event.target.value);
              setPromptError(undefined);
            }}
            className={cn(
              "w-full resize-y rounded-lg border bg-white/10 px-3 py-2 text-white placeholder-white/40 transition-colors focus:ring-2 focus:outline-none disabled:opacity-60",
              promptError ? "border-red-400/60 focus:ring-red-400" : "border-white/20 focus:ring-purple-400",
            )}
          />
          <div className="mt-1 flex items-start justify-between gap-2">
            {promptError && (
              <p className="flex items-center gap-1 text-xs text-red-300">
                <CircleAlert className="size-3" />
                {promptError}
              </p>
            )}
            <span
              className={cn("ml-auto text-xs tabular-nums", remaining < 100 ? "text-amber-300" : "text-blue-100/50")}
            >
              {prompt.length} / {PROMPT_MAX}
            </span>
          </div>
        </div>

        <Button
          type="submit"
          disabled={isBusy}
          className="w-full rounded-lg bg-purple-600 px-4 py-2 font-medium text-white transition-colors hover:bg-purple-500"
        >
          <Sparkles className="size-4" />
          {busy === "outlining"
            ? "Układam plan tygodnia…"
            : busy === "generating"
              ? "Generuję dni…"
              : busy === "saving"
                ? "Zapisuję tydzień…"
                : "Generuj tydzień"}
        </Button>
        {/* The teacher is spending their own credits; the count is not a detail
            to bury. "Pusty dzień" stopped being the divisor at S-09 - every
            unaccepted day is regenerated now, so the worst case rose from
            "however many days were empty" to five. This is the only answer this
            slice gives to the open question about a generation limit, and that
            is deliberate. */}
        <p className="text-xs text-blue-100/50">
          Generowanie tygodnia to jedno wywołanie na plan tygodnia i po jednym na każdy zastępowany dzień. Zaakceptowane
          dni zostają nietknięte.
        </p>
      </form>

      {failure && (
        <div
          role="alert"
          className="space-y-3 rounded-xl border border-red-500/30 bg-red-900/30 p-4 text-sm text-red-200"
        >
          <p className="flex items-start gap-2">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            {failure.message}
          </p>
          {failure.signInRequired && (
            <a href="/auth/signin" className="inline-block font-medium text-purple-300 hover:underline">
              Zaloguj się ponownie
            </a>
          )}
        </div>
      )}

      {/* Said on screen rather than discovered. Between generation and the
          write the proposals exist only here, so a closed tab loses them - and
          because nothing was written, that is the correct outcome rather than a
          failure. The teacher still has to know it before it happens. */}
      {heldCount > 0 && (
        <div
          role="status"
          className="flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm text-amber-100"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            {heldCount === 1
              ? "1 dzień czeka na zapis i istnieje tylko na tej stronie."
              : `${String(heldCount)} dni czeka na zapis i istnieje tylko na tej stronie.`}{" "}
            Zamknięcie karty albo odświeżenie strony je odrzuci — w planie nic się wtedy nie zmieni.
          </span>
        </div>
      )}

      <p className="text-sm text-blue-100/70">
        Gotowe {readyCount} z {WEEK_DAYS} dni.
      </p>

      <ol className="space-y-3">
        {dayList.map((day) => (
          <WeekDayCard
            key={day.planDate}
            day={day}
            disabled={isBusy}
            onRetry={() => {
              retryDay(day.planDate);
            }}
          />
        ))}
      </ol>

      {heldSetIsComplete && (
        <Button
          type="button"
          disabled={isBusy}
          onClick={() => {
            retryWrite();
          }}
          className="w-full rounded-lg bg-amber-600 px-4 py-2 font-medium text-white transition-colors hover:bg-amber-500"
        >
          <Sparkles className="size-4" />
          {busy === "saving" ? "Zapisuję tydzień…" : "Zapisz tydzień"}
        </Button>
      )}

      {acceptableCount > 0 && (
        <Button
          type="button"
          disabled={isBusy}
          onClick={acceptWeek}
          className="w-full rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white transition-colors hover:bg-emerald-500"
        >
          <Check className="size-4" />
          {busy === "accepting" ? "Akceptuję…" : `Akceptuj tydzień (${String(acceptableCount)})`}
        </Button>
      )}

      {busy === "idle" && readyCount > 0 && acceptableCount === 0 && (
        <p className="flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">
          <Check className="size-4 shrink-0" />
          Wszystkie gotowe dni tego tygodnia są zaakceptowane.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

function initialDays(week: WeekPlanView): Record<string, DayState> {
  const days: Record<string, DayState> = {};
  for (const planDate of week.days) {
    const plan = week.plans[planDate] ?? null;
    days[planDate] = {
      planDate,
      status: plan ? "done" : "empty",
      plan,
      // Nothing is ever held on first render: a batch only exists between a
      // generation and its write, and both happen in this island's lifetime.
      batch: null,
      theme: plan?.plan.theme ?? null,
      error: null,
      retryable: false,
    };
  }
  return days;
}

/**
 * The hasło the week is prefilled with: the one the earliest planned day was
 * grown from.
 *
 * A week is generated from one hasło, so any planned day carries it - but only
 * until a single day is regenerated with a different one from `/plan?date=`.
 * Earliest-wins is arbitrary in that case and deliberately so; the field is a
 * starting point the teacher can overwrite, not a claim about the week.
 */
function firstPrompt(week: WeekPlanView): string {
  for (const planDate of week.days) {
    const plan = week.plans[planDate];
    if (plan) {
      return plan.plan.prompt;
    }
  }
  return "";
}

/**
 * The board's rows as `@/lib/week-generation` needs to see them.
 *
 * Reads `accepted_at` off the **saved** plan only. A held batch has no
 * acceptance and cannot have one - it has no row - so a day holding proposals
 * over an accepted plan would still read as accepted here, which is correct:
 * until the write lands, the accepted plan is what exists.
 */
function weekAcceptance(dates: readonly string[], days: Record<string, DayState>): WeekDayAcceptance[] {
  return dates.map((planDate) => ({
    planDate,
    planned: days[planDate].plan !== null,
    accepted: days[planDate].plan?.plan.accepted_at != null,
  }));
}
