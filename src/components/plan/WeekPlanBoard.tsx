import { useRef, useState } from "react";
import { Check, CircleAlert, Sparkles } from "lucide-react";
import { WeekDayCard, type DayState } from "@/components/plan/WeekDayCard";
import { Button } from "@/components/ui/button";
import { PROMPT_MAX, WEEK_DAYS } from "@/lib/day-plan-limits";
import { cn } from "@/lib/utils";
import { isDayPlanBody, isErrorBody, isOutlineBody } from "@/lib/day-plan-guards";
import type { DayPlanView, WeekPlanView } from "@/types";

/**
 * The orchestrator. One hasło in, five saved days out.
 *
 * Every request it makes already existed before this slice: the outline route is
 * new, but generation, acceptance and the read-back are the same three endpoints
 * `/plan?date=` has been using since S-02. What is new is that there are five of
 * them in flight at once, which is the whole reason this is a separate island
 * rather than a mode of `DayPlanEditor`:
 *
 *   * `DayPlanEditor` guards concurrency with a single `inFlight` ref, because
 *     its mutations all touch one plan. Here a global guard would mean the first
 *     day to start blocks the other four, so the guard is per day and the global
 *     one covers only the outline and the week-level buttons.
 *   * Failure is per day too. Three days saved and two failed is a normal
 *     outcome, not an error state - the successes are already written and the
 *     retry costs only the days that are missing.
 *
 * Nothing here retries by itself. `generateDayActivities` already retries once
 * inside the route, and a second layer of automatic retries on top of five
 * parallel calls is how a rate limit turns into a bill.
 */

interface WeekPlanBoardProps {
  readonly week: WeekPlanView;
}

type Busy = "idle" | "outlining" | "generating" | "accepting";

interface Failure {
  readonly message: string;
  readonly signInRequired: boolean;
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

  const isBusy = busy !== "idle";
  const dayList = week.days.map((date) => days[date]);
  const readyCount = dayList.filter((day) => day.plan !== null).length;
  const acceptableCount = dayList.filter((day) => day.plan !== null && !day.plan.plan.accepted_at).length;

  function patchDay(planDate: string, patch: Partial<DayState>): void {
    setDays((current) => ({ ...current, [planDate]: { ...current[planDate], ...patch } }));
  }

  /**
   * Generates one day and folds the answer into that day's row.
   *
   * Returns rather than throws: the caller is `Promise.allSettled` over five of
   * these, and a rejection there would say nothing the row does not already say.
   */
  async function generateDay(planDate: string, theme: string | null, keyword: string): Promise<void> {
    if (inFlight.current.has(planDate)) return;
    inFlight.current.add(planDate);
    patchDay(planDate, { status: "generating", error: null, retryable: false, theme });

    try {
      const response = await fetch("/api/day-plan/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_date: planDate,
          prompt: keyword,
          // The week never overwrites. A day that gained a plan between the page
          // render and this request - another tab, or a slower sibling of this
          // very batch - comes back 409 and keeps what it has.
          only_if_absent: true,
          ...(theme === null ? {} : { theme }),
        }),
      });
      const body: unknown = await response.json().catch(() => null);

      if (response.ok && isDayPlanBody(body)) {
        patchDay(planDate, { status: "done", plan: body, error: null, retryable: false });
        return;
      }

      if (response.status === 401) {
        setFailure({ message: "Twoja sesja wygasła. Zaloguj się ponownie.", signInRequired: true });
        patchDay(planDate, { status: "failed", error: "Sesja wygasła.", retryable: false });
        return;
      }

      // 409 on this route means the day was taken, which is the skip policy
      // working rather than a failure to report as one. *Which* writer took it
      // decides what the card should show, and only a read can tell them apart:
      // a sibling tab, another device, or this day's own write whose response
      // was lost. In that last case the day is saved and the card would
      // otherwise sit here claiming "pominięty" with no proposals - outside
      // `readyCount`, and silently skipped by "Akceptuj tydzień".
      if (response.status === 409) {
        const existing = await readDay(planDate);
        patchDay(planDate, {
          status: "skipped",
          error: null,
          retryable: false,
          ...(existing === null ? {} : { plan: existing }),
        });
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

    const free = week.days.filter((date) => days[date].plan === null);
    if (free.length === 0) {
      setFailure({
        message: "Wszystkie dni tego tygodnia mają już plan. Otwórz dzień, żeby go zmienić.",
        signInRequired: false,
      });
      return;
    }

    weekInFlight.current = true;
    setFailure(null);
    setBusy("outlining");

    const skipped = week.days.filter((date) => days[date].plan !== null);

    void (async () => {
      try {
        // The outline is asked for the whole week, including days that already
        // have a plan: the model is arranging an arc, and hiding two of its five
        // days would have it arrange a different one. Only the free days are then
        // generated.
        const response = await fetch("/api/day-plan/week/outline", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, dates: week.days }),
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
          for (const date of week.days) {
            const theme = themeByDate.get(date) ?? null;
            next[date] = { ...next[date], theme: next[date].plan === null ? theme : next[date].theme };
          }
          // Days that already had a plan are marked only once the week
          // generation is genuinely under way, so the badge means what it says:
          // this run reached them and deliberately left them alone. Marking them
          // before the outline would have a failed outline - which generates
          // nothing at all - report five successful skips.
          for (const date of skipped) {
            next[date] = { ...next[date], status: "skipped" };
          }
          return next;
        });

        setBusy("generating");
        // All five at once. The week then costs the slowest day rather than the
        // sum of five, which is the difference between ~20s and ~2 minutes.
        await Promise.allSettled(free.map((date) => generateDay(date, themeByDate.get(date) ?? null, prompt)));
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
   * Retries one day, and only that day.
   *
   * Deliberately does not take `weekInFlight` or move `busy`: two days failing on
   * one rate limit is the ordinary case, and a global lock here would make the
   * teacher retry them one after another. `generateDay` already refuses a second
   * run of the same day, which is the only collision that matters. The week-level
   * lock is still *read*, so a retry cannot start on top of a running week.
   */
  function retryDay(planDate: string): void {
    if (weekInFlight.current) return;
    void generateDay(planDate, days[planDate].theme, prompt);
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
              : "Generuj tydzień"}
        </Button>
        {/* The teacher is spending their own credits; the count is not a detail
            to bury. One outline plus one call per free day. */}
        <p className="text-xs text-blue-100/50">
          Generowanie tygodnia to jedno wywołanie na plan tygodnia i po jednym na każdy pusty dzień. Dni, które już mają
          plan, zostają nietknięte.
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
 * Reads one day back, for the 409 branch above.
 *
 * `null` covers every "nothing to show" answer alike - a 404, a failed read, a
 * dropped connection. The caller folds a plan in when there is one and leaves
 * the row untouched otherwise, which is the same rule `DayPlanEditor.reconcile`
 * follows: never blank a row on a second failure.
 */
async function readDay(planDate: string): Promise<DayPlanView | null> {
  try {
    const response = await fetch(`/api/day-plan?date=${planDate}`);
    const body: unknown = await response.json().catch(() => null);
    return response.ok && isDayPlanBody(body) ? body : null;
  } catch {
    return null;
  }
}
