import { useRef, useState } from "react";
import { Check, CircleAlert, Sparkles } from "lucide-react";
import { useConfirmDialog } from "@/components/hooks/useConfirmDialog";
import { WeekDayCard, type DayState } from "@/components/plan/WeekDayCard";
import { FIELD_BASE, FIELD_BORDER, FIELD_BORDER_ERROR, FIELD_ERROR, FIELD_LABEL } from "@/components/plan/field-styles";
import { ScopeToggle } from "@/components/plan/ScopeToggle";
import WeekPdfControls from "@/components/plan/WeekPdfControls";
import { Button } from "@/components/ui/button";
import { PROMPT_MAX, WEEK_DAYS } from "@/lib/day-plan-limits";
import { cn } from "@/lib/utils";
import { isDayPlanBody, isErrorBody, isGeneratedDayBody, isOutlineBody, isSaveWeekBody } from "@/lib/day-plan-guards";
import {
  isWeekEmpty,
  partitionWeek,
  replacementConfirmation,
  scopeQuestion,
  type WeekDayAcceptance,
} from "@/lib/week-generation";
import { acceptanceNotice, CONFLICT_MESSAGE, deleteConfirmation, deletedNotice } from "@/lib/week-day-controls";
import type { AcceptedDayConsent, ActivityDraft, DayPlanView, WeekPlanView } from "@/types";

/**
 * The orchestrator. One hasło in, one week replaced - or none of it.
 *
 * Reshaped at `S-09`. It used to generate only the days that had no row at all,
 * badge the rest `pominięty`, and treat "three saved, two failed" as a normal
 * outcome. Both of those stopped being true:
 *
 *   * **Targets are chosen by acceptance, not by emptiness.** A draft is
 *     replaceable; an accepted day is replaced only when the teacher includes
 *     it in the run (`S-10`), and its date and `accepted_at` then travel to
 *     the writer as consent. See `@/lib/week-generation`, where the partition, the scope
 *     question and the confirmation sentence live so they can be tested
 *     without rendering anything.
 *   * **A run is a value, not a derivation.** Once the teacher confirms, the
 *     run's targets, consents and hasło are held in `run` until the
 *     write lands. Retries and "Zapisz tydzień" read it; nothing re-derives
 *     the targets from acceptance, because a consented accepted day stays
 *     accepted until the write clears it.
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
 * covers the outline, the write and the week buttons - and, since `S-11`, the
 * two day operations (acceptance and deletion from a card). Those take it
 * although they touch one day, because a week run partitions the week by
 * acceptance: flipping a day under a running week would change a partition
 * already made. For one teacher clicking one day at a time it costs nothing.
 *
 * Nothing here retries by itself. `generateDayActivities` already retries once
 * inside the route, and a second layer of automatic retries on top of five
 * parallel calls is how a rate limit turns into a bill.
 */

interface WeekPlanBoardProps {
  readonly week: WeekPlanView;
  /** A hasło carried over from the landing (`@/lib/pending-topic`); wins over the saved one. */
  readonly initialPrompt?: string;
  /** Where "Jeden dzień" leads: today when it lies in this week, its Monday otherwise. */
  readonly dayHref: string;
}

// `managing` is a day operation from a card. The generate button does not name
// it - it only has to be disabled - so its label falls through to the default.
type Busy = "idle" | "outlining" | "generating" | "saving" | "accepting" | "managing";

interface Failure {
  readonly message: string;
  readonly signInRequired: boolean;
}

/**
 * One week run, from the teacher's confirmation until its write lands.
 *
 * State rather than a ref: `heldSetIsComplete` is computed at render from it
 * and decides whether "Zapisz tydzień" appears.
 */
interface WeekRun {
  /** The days this run replaces, in calendar order. */
  readonly targets: readonly string[];
  /** The accepted days among `targets`, with the acceptance the teacher agreed to lose. */
  readonly consented: readonly AcceptedDayConsent[];
  /** The hasło the run generated with - not whatever the field says now. */
  readonly keyword: string;
}

/** One day of the payload `/api/day-plan/week/save` expects. */
interface WeekWriteDay {
  readonly plan_date: string;
  readonly theme?: string;
  readonly activities: readonly ActivityDraft[];
}

export default function WeekPlanBoard({ week, initialPrompt, dayHref }: WeekPlanBoardProps) {
  const [days, setDays] = useState<Record<string, DayState>>(() => initialDays(week));
  const [prompt, setPrompt] = useState(() => initialPrompt ?? firstPrompt(week));
  const [promptError, setPromptError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState<Busy>("idle");
  const [failure, setFailure] = useState<Failure | null>(null);
  const [run, setRun] = useState<WeekRun | null>(null);

  // Per day, not per island. Five generations run at once and each one owns only
  // its own row; a shared flag here would serialise the week for no reason.
  const inFlight = useRef<Set<string>>(new Set());
  // Guards the outline, the two week-level buttons and the day operations on the
  // cards - the operations that really are one-at-a-time.
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

  // The application's own confirmation window. It does not freeze the page the
  // way `window.confirm` did, so the two functions that ask - `generateWeek`
  // and `deleteDay` - read their locks before the question and again after the
  // answer, and take them only then.
  const { confirm, dialog } = useConfirmDialog();

  /**
   * Whether a week-level operation may start *now*. A function rather than the
   * refs read inline: it is asked on both sides of an `await`, and a bare
   * property read is narrowed by the first check - the second would be taken
   * for dead code, by the compiler and by the next reader.
   */
  function weekIsLocked(): boolean {
    return weekInFlight.current;
  }

  /** A single-day retry generating right now - see `retriesInFlight`. */
  function retryIsRunning(): boolean {
    return retriesInFlight.current > 0;
  }

  const isBusy = busy !== "idle";
  const dayList = week.days.map((date) => days[date]);
  // `plan !== null` throughout: a held batch has no row, so it is not a ready
  // day and is not acceptable. Counting it would offer "Zatwierdź wszystkie" for
  // proposals the database has never seen.
  const readyCount = dayList.filter((day) => day.plan !== null).length;
  const acceptableCount = dayList.filter((day) => day.plan !== null && !day.plan.plan.accepted_at).length;
  const heldCount = dayList.filter((day) => day.batch !== null).length;
  // Every day the run targets must be holding a batch before the write may be
  // re-issued. Writing whatever happens to be held while one day is still failed
  // would commit a partial week, which is the one outcome `S-09` exists to make
  // impossible. Read off the run, not off acceptance: a consented accepted day
  // is a target, and counting it as satisfied because it is accepted would offer
  // the write for a week missing that day.
  const heldSetIsComplete = run?.targets.every((date) => days[date].batch !== null) ?? false;

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
    //
    // `notice`/`actionError` go too: a sentence about the last acceptance or
    // delete on this day must not outlive a regeneration of it.
    patchDay(planDate, {
      status: "generating",
      batch: null,
      error: null,
      retryable: false,
      theme,
      notice: null,
      actionError: null,
    });

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
        // and the distinction is what keeps `readyCount` and "Zatwierdź
        // wszystkie" from counting a day nothing has written.
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
  async function writeWeek(weekRun: WeekRun): Promise<void> {
    if (writeInFlight.current) return;
    writeInFlight.current = true;
    try {
      await writeWeekOnce(weekRun);
    } finally {
      writeInFlight.current = false;
    }
  }

  async function writeWeekOnce({ targets, consented, keyword }: WeekRun): Promise<void> {
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
        // The consents exactly as the teacher confirmed them, never recomputed
        // from the board: an acceptance nobody named must reach the writer
        // unconsented so it can refuse it.
        body: JSON.stringify({ prompt: keyword, days: held, confirm_accepted: consented }),
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
        // The run is over. Leaving it would keep "Zapisz tydzień" reachable
        // for a set that is already written.
        setRun(null);
        return;
      }

      // Refused: an acceptance in the set that the teacher did not consent to,
      // made elsewhere after the dialog. Re-sending the same consent would be
      // refused the same way, and the alert already says to refresh, so the
      // run ends here and its batches go - leaving them held would keep every
      // control locked behind a "Zapisz tydzień" that cannot succeed. Nothing
      // was written, so each day goes back to the plan it had.
      if (response.status === 409) {
        setFailure({
          message: isErrorBody(body) ? body.error : "Nie udało się zapisać tygodnia.",
          signInRequired: false,
        });
        setDays((current) => {
          const next = { ...current };
          for (const date of targets) {
            next[date] = { ...next[date], ...planFields(next[date].plan) };
          }
          return next;
        });
        setRun(null);
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

  async function generateWeek(): Promise<void> {
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
    if (weekIsLocked()) return;
    // A retry generating right now holds the *old* hasło, captured when it was
    // pressed. Letting a week run start alongside it means two hasła in flight
    // over one week, and the write that lands last sets `prompt` for every day.
    if (retryIsRunning()) return;

    // Acceptance decides, not emptiness. See `@/lib/week-generation`.
    const acceptance = weekAcceptance(week.days, days);
    const draftsOnly = partitionWeek(acceptance, false);
    const acceptedCount = draftsOnly.untouched.length;

    // Whether the accepted days go too. Asked only on a mixed week: with none
    // accepted there is nothing to ask, and with all of them accepted "only the
    // drafts" would be a run over no days - that week is the case FR-013 exists
    // for, so it goes straight to the count. Declining here - the secondary
    // button or Escape - narrows the run rather than cancelling it, which is
    // why the count window below always follows.
    let includeAccepted = false;
    if (acceptedCount > 0) {
      includeAccepted = draftsOnly.targets.length === 0 || (await confirm(scopeQuestion(acceptedCount)));
    }
    // The partition is frozen before the first question: it is computed from
    // the acceptance read above, not from whatever the board holds by the time
    // the teacher answers either window.
    const partition = includeAccepted ? partitionWeek(acceptance, true) : draftsOnly;

    // The go / stop window, stating how many days are replaced and how many of
    // them are accepted. It is an affordance, not the guard: the island's
    // `accepted_at` can be stale, so `save_week_plan_generation` refuses any
    // accepted day whose date is not in the consent list with U0001 - a day
    // accepted in another tab after this window is refused, not replaced. Same
    // division as `DayPlanEditor.generate()`.
    const confirmation = replacementConfirmation(partition, isWeekEmpty(acceptance));
    if (confirmation !== null && !(await confirm(confirmation))) {
      return;
    }

    // The locks again. The windows do not block the page, so between the first
    // check and this line nothing the teacher could click was reachable - but
    // that is the dialog's promise, not this function's, and consent for a run
    // that can no longer start is dropped rather than acted on.
    if (weekIsLocked() || retryIsRunning()) return;

    // Captured at the time of the question and carried unchanged to the write: the
    // consent is what the teacher was shown, not what is accepted when the
    // write fires.
    const { targets, untouched, consented } = partition;
    const keyword = prompt;

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
          body: JSON.stringify({ prompt: keyword, dates: targets }),
        });
        const body: unknown = await response.json().catch(() => null);

        if (!response.ok || !isOutlineBody(body)) {
          setFailure({
            message: isErrorBody(body) ? body.error : "Nie udało się ułożyć planu tygodnia.",
            signInRequired: response.status === 401,
          });
          return;
        }

        // The run exists from here on. Not before the outline: a failed outline
        // generates nothing, and replacing the previous run's scope with this
        // one would let a retry of a day that failed in the previous run write
        // the old batches under this run's hasło and consent.
        const weekRun: WeekRun = { targets, consented, keyword };
        setRun(weekRun);

        const themeByDate = new Map(body.themes.map((theme) => [theme.plan_date, theme.theme]));
        setDays((current) => {
          const next = { ...current };
          for (const date of targets) {
            next[date] = { ...next[date], theme: themeByDate.get(date) ?? null };
          }
          // Marked only once the run is genuinely under way, so the badge means
          // what it says: this run reached them and deliberately left them
          // alone. Marking them before the outline would have a failed outline
          // report successful skips. Empty when the teacher included the
          // accepted days - then nothing is left alone.
          // The batch goes too: a previous run that included this day may
          // have left one held here, and this run will neither write nor
          // clear it - it would sit on a "Nietknięty" card, keep the board
          // locked, and outlive the run it belonged to.
          for (const date of untouched) {
            next[date] = { ...next[date], status: "skipped", batch: null, error: null, retryable: false };
          }
          return next;
        });

        setBusy("generating");
        // All targets at once, so the week costs the slowest day rather than
        // the sum. Nothing is written by any of them.
        await Promise.allSettled(targets.map((date) => generateDay(date, themeByDate.get(date) ?? null, keyword)));

        // One write, after the whole set is in hand. `writeWeek` returns
        // without writing if any target failed, leaving the successes held for
        // a per-day retry.
        await writeWeek(weekRun);
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
    // The run this day failed in: its targets, its consent and its hasło. The
    // hasło field may have been edited since, and writing the week under a
    // hasło the teacher never generated with would be a lie on every card.
    const weekRun = run;
    if (!weekRun?.targets.includes(planDate)) return;

    // Registered synchronously, before the generation starts. A week run
    // checks this counter, so the window between "this retry began" and "this
    // retry wrote" is never one a `generateWeek` can start inside.
    retriesInFlight.current += 1;
    setBusy("generating");

    void (async () => {
      try {
        await generateDay(planDate, days[planDate].theme, weekRun.keyword);

        // The set this day belongs to is the run's, not one recomputed from
        // acceptance: a consented accepted day is still accepted here, and
        // dropping it would write a narrower week than the one confirmed.
        // `writeWeek` takes `writeInFlight` itself, so two retries completing
        // together produce one write, not two.
        await writeWeek(weekRun);
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
    // The run as confirmed - same targets, same consent, same hasło.
    const weekRun = run;
    if (weekRun === null) return;

    weekInFlight.current = true;
    setFailure(null);
    void (async () => {
      try {
        await writeWeek(weekRun);
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
            // "Cofnięto zatwierdzenie: …" left standing under the green badge this
            // is about to put up would contradict it. Same rule as
            // `clearedByEdit` in `DayPlanEditor`: cleared when an operation on
            // the day starts, not only when one succeeds.
            patchDay(day.planDate, { notice: null, actionError: null });
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
                error: isErrorBody(body) ? body.error : "Nie udało się zatwierdzić tego dnia.",
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

  /**
   * Accepts one day, or takes its acceptance away - one button, both ways.
   *
   * Both ways on purpose, one step past the letter of FR-015: the PRD calls
   * withdrawing an acceptance safe because a mistake costs one click, and on
   * the week board that is only true if the click that undoes it is the same
   * button in the same place.
   *
   * No dialog - the operation is reversible (PRD v2 §Business Logic Changes,
   * "jawność proporcjonalna do skutku"). The day is named after the fact
   * instead, in the card's notice, and before it in the button's accessible
   * name.
   */
  function toggleAcceptance(planDate: string): void {
    if (weekInFlight.current) return;
    const plan = days[planDate].plan;
    if (plan === null) return;

    weekInFlight.current = true;
    setFailure(null);
    setBusy("managing");
    patchDay(planDate, { notice: null, actionError: null });

    void (async () => {
      try {
        const response = await fetch("/api/day-plan/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plan_id: plan.plan.id,
            accepted: !plan.plan.accepted_at,
            // The batch this card shows. A day regenerated elsewhere since is
            // refused rather than signed off unseen.
            expected_generation: plan.plan.current_generation,
          }),
        });
        const body: unknown = await response.json().catch(() => null);

        if (response.ok && isDayPlanBody(body)) {
          // `status: "done"` (inside `planFields`) is not cosmetic. A day
          // accepted before a week run comes back from it `skipped`, and a day
          // that failed "Zatwierdź wszystkie" is `failed`. Left as they were, the
          // first would read "Pominięty — dzień zatwierdzony" on a day that is
          // now neither, and the second would keep a red border over a plan
          // that just saved. The notice reads acceptance off the response, not
          // off what was sent.
          patchDay(planDate, {
            ...planFields(body),
            notice: acceptanceNotice(planDate, body.plan.accepted_at != null),
          });
          return;
        }

        await failDayOperation(
          planDate,
          response.status,
          // The route's own 409 tells the teacher to refresh the page, which
          // the re-read in `failDayOperation` has made untrue by the time the
          // sentence is on screen.
          response.status === 409
            ? CONFLICT_MESSAGE
            : isErrorBody(body)
              ? body.error
              : "Nie udało się zmienić zatwierdzenia tego dnia.",
        );
      } catch {
        patchDay(planDate, { actionError: "Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie." });
        await reconcileDay(planDate);
      } finally {
        weekInFlight.current = false;
        setBusy("idle");
      }
    })();
  }

  /**
   * Deletes one day: the hasło, the proposals, the row.
   *
   * The confirmation is unconditional, names the day, and says the day is
   * accepted when it is. It is the whole protection: there is no undo and no
   * schema-side refusal behind it. That is also why no `expected_generation`
   * is sent - the `S-05` decision this inherits: "this day should be empty"
   * holds whatever batch happens to be in it. The acceptance the dialog names
   * is this island's copy and can be stale; nothing checks it.
   *
   * The lock is read *before* the window, so consent is not collected for an
   * operation that is then dropped without a word - the trap `saveDraft` in
   * `DayPlanEditor` describes. It is read again after the answer and taken
   * only then: the window is asynchronous and does not freeze the page. The
   * day and its acceptance are the ones captured when the question was asked,
   * which is what the window named.
   */
  async function deleteDay(planDate: string): Promise<void> {
    if (weekIsLocked()) return;
    const plan = days[planDate].plan;
    if (plan === null) return;
    if (!(await confirm(deleteConfirmation(planDate, plan.plan.accepted_at != null)))) {
      return;
    }
    if (weekIsLocked()) return;

    weekInFlight.current = true;
    setFailure(null);
    setBusy("managing");
    patchDay(planDate, { notice: null, actionError: null });

    void (async () => {
      try {
        // No headers and no body: the route reads the day from the query
        // string, exactly as its GET does.
        const response = await fetch(`/api/day-plan?date=${planDate}`, { method: "DELETE" });

        // Decided on `ok` alone, before anything is parsed. Success is a 204
        // with no body, so parsing first would reject, `isDayPlanBody(null)`
        // would be false, and a delete that worked would be reported as one
        // that failed.
        if (response.ok) {
          // Reset in place, where the day view reloads. There the day's
          // subtitle is static SSR outside the island; here the whole card is
          // the island's, so the shape a day with no plan has on first render
          // is all there is to restore.
          patchDay(planDate, { ...planFields(null), notice: deletedNotice(planDate) });
          return;
        }

        const body: unknown = await response.json().catch(() => null);
        await failDayOperation(
          planDate,
          response.status,
          isErrorBody(body) ? body.error : "Nie udało się usunąć planu tego dnia.",
        );
      } catch {
        patchDay(planDate, { actionError: "Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie." });
        await reconcileDay(planDate);
      } finally {
        weekInFlight.current = false;
        setBusy("idle");
      }
    })();
  }

  /**
   * A day operation that did not go through: said in its card, then the card
   * is re-read, so the teacher decides whether to try again against what the
   * server holds rather than against the copy that was just refused.
   *
   * A lost session is the week's problem, not the day's, and goes to the
   * banner with the sign-in link, as everywhere else on this board.
   */
  async function failDayOperation(planDate: string, status: number, message: string): Promise<void> {
    if (status === 401) {
      setFailure({ message: "Twoja sesja wygasła. Zaloguj się ponownie.", signInRequired: true });
      return;
    }
    patchDay(planDate, { actionError: message });
    await reconcileDay(planDate);
  }

  /**
   * `DayPlanEditor.reconcile()` for one card.
   *
   * A refused day operation is usually a day that moved on elsewhere - another
   * tab regenerated, accepted or deleted it - and the card's copy is exactly
   * what is wrong. Its own failure is swallowed: the operation's message is the
   * one worth reading, and replacing it with "the re-read failed too" helps
   * nobody. `actionError` is left alone; `notice` was cleared when the
   * operation started.
   */
  async function reconcileDay(planDate: string): Promise<void> {
    try {
      const response = await fetch(`/api/day-plan?date=${planDate}`);
      if (response.status === 404) {
        patchDay(planDate, planFields(null));
        return;
      }
      const body: unknown = await response.json().catch(() => null);
      if (response.ok && isDayPlanBody(body)) {
        patchDay(planDate, planFields(body));
      }
    } catch {
      // Leave the card standing rather than blanking it on a second failure.
    }
  }

  const remaining = PROMPT_MAX - prompt.length;

  // What the PDF prints: the saved plans as this island holds them now. Not
  // `week.plans` - that is the first render, stale after any acceptance or
  // delete - and not a held batch, which has no row behind it.
  const savedPlans: Record<string, DayPlanView> = {};
  for (const day of dayList) {
    if (day.plan !== null) {
      savedPlans[day.planDate] = day.plan;
    }
  }

  return (
    <div className="grid gap-6 min-[900px]:grid-cols-[minmax(0,380px)_minmax(0,1fr)] min-[900px]:items-start min-[900px]:gap-10">
      <form
        className="bg-mleko rounded-panel shadow-panel space-y-5 p-6 min-[900px]:sticky min-[900px]:top-6 min-[900px]:p-7"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void generateWeek();
        }}
      >
        <h2 className="font-display text-display-sm text-las">Nowe propozycje</h2>

        <div>
          {/* The label's text is what `landing-topic-carry.spec.ts` finds the field by. */}
          <div className={FIELD_LABEL}>
            <label htmlFor="week-prompt">Hasło tygodnia</label>
          </div>
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
            className={cn(FIELD_BASE, "resize-y", promptError ? FIELD_BORDER_ERROR : FIELD_BORDER)}
          />
          <div className="mt-1.5 flex items-start justify-between gap-2">
            {promptError && (
              <p className={FIELD_ERROR}>
                <CircleAlert className="size-4 shrink-0" />
                {promptError}
              </p>
            )}
            <span
              className={cn(
                "ml-auto text-sm tabular-nums",
                remaining < 100 ? "text-ostrzezenie font-bold" : "text-las-szary",
              )}
            >
              {prompt.length} / {PROMPT_MAX}
            </span>
          </div>
        </div>

        <ScopeToggle active="week" dayHref={dayHref} weekHref={`/plan/week?from=${week.weekStart}`} />

        <Button type="submit" variant="primary" size="pill" disabled={isBusy} className="w-full cursor-pointer">
          <Sparkles className="size-4" />
          {busy === "outlining"
            ? "Układam plan tygodnia…"
            : busy === "generating"
              ? "Generuję dni…"
              : busy === "saving"
                ? "Zapisuję tydzień…"
                : "Generuj tydzień"}
        </Button>
        {/* In the panel, next to the other week-level action, so it stays in
            reach while the list scrolls. `type="button"` is load-bearing: inside
            this form a bare button submits, and approving would then run
            `generateWeek()` - the operation that replaces what is being approved. */}
        {acceptableCount > 0 && (
          <Button
            type="button"
            variant="outlinePill"
            size="pill"
            disabled={isBusy}
            onClick={acceptWeek}
            className="w-full cursor-pointer"
          >
            <Check className="size-4" />
            {busy === "accepting" ? "Zatwierdzam…" : `Zatwierdź wszystkie (${String(acceptableCount)})`}
          </Button>
        )}
        <p className="text-las-szary text-sm">
          Wpisz jedno hasło na cały tydzień. Ułożymy z niego pięć różnych tematów — po jednym na dzień roboczy — i
          wygenerujemy propozycje zajęć dla każdego dnia osobno.
        </p>
        {/* The teacher is spending their own credits; the count is not a detail
            to bury. "Pusty dzień" stopped being the divisor at S-09 - every
            unaccepted day is regenerated, and since S-10 accepted days too when
            the teacher agrees, so the worst case is five. This is the only
            answer these slices give to the open question about a generation
            limit, and that is deliberate. */}
        <p className="text-las-szary text-sm">
          Generowanie tygodnia to jedno wywołanie na plan tygodnia i po jednym na każdy zastępowany dzień. Zatwierdzone
          dni zastąpię tylko wtedy, gdy zgodzisz się na to w oknie potwierdzenia.
        </p>
      </form>

      <div className="min-w-0 space-y-4">
        {failure && (
          <div
            role="alert"
            className="border-blad-ramka bg-blad-tlo text-blad rounded-input space-y-3 border-[1.5px] p-4 text-[15px] font-bold"
          >
            <p className="flex items-start gap-2">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              {failure.message}
            </p>
            {failure.signInRequired && (
              <a href="/auth/signin" className="text-blad inline-flex min-h-11 items-center font-extrabold underline">
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
            className="border-ostrzezenie-ramka bg-ostrzezenie-tlo text-ostrzezenie rounded-input flex items-start gap-2 border-[1.5px] px-4 py-3 text-[15px]"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong className="font-extrabold">
                {heldCount === 1
                  ? "1 dzień czeka na zapis i istnieje tylko na tej stronie."
                  : `${String(heldCount)} dni czeka na zapis i istnieje tylko na tej stronie.`}
              </strong>{" "}
              Zamknięcie karty albo odświeżenie strony je odrzuci — w planie nic się wtedy nie zmieni. Dopóki tydzień
              nie zostanie zapisany albo propozycje odrzucone, pojedynczych dni nie można zatwierdzać ani usuwać.
            </span>
          </div>
        )}

        <p className="text-las text-right text-base font-extrabold">
          Gotowe {readyCount} z {WEEK_DAYS} dni.
        </p>

        <ol className="space-y-3">
          {dayList.map((day) => (
            <WeekDayCard
              key={day.planDate}
              day={day}
              disabled={isBusy}
              // Off while anything is held, not only while busy: the held set is
              // the run's targets, and "Zapisz tydzień" is offered only while
              // every one of them has a batch. Accepting or deleting a day
              // under it changes that set, the button disappears, and generations
              // already paid for are stranded. The banner above says why.
              controlsDisabled={isBusy || heldCount > 0}
              onRetry={() => {
                retryDay(day.planDate);
              }}
              onToggleAcceptance={() => {
                toggleAcceptance(day.planDate);
              }}
              onDelete={() => {
                void deleteDay(day.planDate);
              }}
            />
          ))}
        </ol>

        {heldSetIsComplete && (
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
            <Button
              type="button"
              variant="accent"
              size="pill"
              disabled={isBusy}
              onClick={() => {
                retryWrite();
              }}
              className="cursor-pointer"
            >
              <Sparkles className="size-4" />
              {busy === "saving" ? "Zapisuję tydzień…" : "Zapisz tydzień"}
            </Button>
          </div>
        )}

        {busy === "idle" && readyCount > 0 && acceptableCount === 0 && (
          <p className="bg-szalwia-soft text-mech-ciemny rounded-input flex items-center gap-2 px-4 py-3 text-[15px] font-bold">
            <Check className="size-4 shrink-0" />
            Wszystkie gotowe dni tego tygodnia są zatwierdzone.
          </p>
        )}

        {/* Same rule as the day controls, for the same reason: a held batch is
            on screen but not in the database, and a PDF taken now would leave out
            what the teacher is looking at without a word. Busy needs no sentence -
            every other button on the board already says what is running. */}
        <div className="border-linia flex border-t pt-4 sm:justify-end">
          <WeekPdfControls
            weekStart={week.weekStart}
            days={week.days}
            plans={savedPlans}
            disabled={isBusy || heldCount > 0}
            disabledReason={
              heldCount > 0
                ? "Zapisz tydzień, zanim pobierzesz PDF — niezapisane propozycje nie trafią do pliku."
                : null
            }
          />
        </div>
      </div>

      {dialog}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

function initialDays(week: WeekPlanView): Record<string, DayState> {
  const days: Record<string, DayState> = {};
  for (const planDate of week.days) {
    days[planDate] = {
      planDate,
      ...planFields(week.plans[planDate] ?? null),
      notice: null,
      actionError: null,
    };
  }
  return days;
}

/**
 * A day's fields as a saved plan - or its absence - determines them.
 *
 * One function for first render, for a delete and for a re-read, so a day that
 * was just deleted comes back in exactly the shape a day that never had a plan
 * is given, and a re-read day in exactly the shape a server-rendered one is.
 */
function planFields(
  plan: DayPlanView | null,
): Pick<DayState, "status" | "plan" | "batch" | "theme" | "error" | "retryable"> {
  return {
    status: plan ? "done" : "empty",
    plan,
    // Nothing is ever held on first render: a batch only exists between a
    // generation and its write, and both happen in this island's lifetime. The
    // day operations that also land here are disabled while anything is held.
    batch: null,
    theme: plan?.plan.theme ?? null,
    error: null,
    retryable: false,
  };
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
    acceptedAt: days[planDate].plan?.plan.accepted_at ?? null,
  }));
}
