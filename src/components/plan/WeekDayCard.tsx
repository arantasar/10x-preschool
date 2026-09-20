import { Check, CircleAlert, ExternalLink, RotateCcw } from "lucide-react";
import { GenerationProgress } from "@/components/plan/GenerationProgress";
import { Button } from "@/components/ui/button";
import { formatAcceptedAt, formatPlanDate } from "@/lib/day-plan-dates";
import { cn } from "@/lib/utils";
import type { ActivityDraft, DayPlanView } from "@/types";

/**
 * One day on the week board: what is happening to it, and what can be done with
 * it without leaving the page.
 *
 * Read-only on purpose. Editing a proposal stays on `/plan?date=` so the whole
 * S-02 protocol - the draft, Cancel meaning something, the trigger that returns
 * an edited plan to draft - lives in exactly one place. This card links there
 * rather than reimplementing a fifth of it five times over.
 */

/**
 * `skipped` changed meaning at `S-09` and the old one is worth naming so the
 * change is not mistaken for a rename: it used to mean "this day already had a
 * plan, so the week generation left it alone". Having a plan is no longer a
 * reason to be left alone — a draft is exactly what gets replaced — so it now
 * means "accepted, and therefore deliberately out of reach".
 *
 * `held` is new: generated, sitting in this island's memory, **not written**.
 * It is the state that makes an all-or-nothing week possible, and the one the
 * teacher must be able to see, because closing the tab loses it.
 */
export type DayStatus = "empty" | "skipped" | "generating" | "held" | "saving" | "done" | "failed";

export interface DayState {
  readonly planDate: string;
  readonly status: DayStatus;
  /** The saved plan, once there is one. */
  readonly plan: DayPlanView | null;
  /**
   * Proposals generated for this day and not yet committed.
   *
   * Deliberately separate from `plan`, and deliberately not a `DayPlanView`:
   * there is no row, no id and no `current_generation` behind these, so putting
   * them in `plan` would let every counter and every "Akceptuj" path treat an
   * unwritten batch as a saved day.
   */
  readonly batch: readonly ActivityDraft[] | null;
  /** This day's slice of the outline, while the island still holds it. */
  readonly theme: string | null;
  readonly error: string | null;
  readonly retryable: boolean;
}

interface WeekDayCardProps {
  readonly day: DayState;
  readonly disabled: boolean;
  readonly onRetry: () => void;
}

export function WeekDayCard({ day, disabled, onRetry }: WeekDayCardProps) {
  const acceptedAt = day.plan?.plan.accepted_at ?? null;
  // A held batch is shown, but it is never allowed to look like a saved one:
  // `held`/`saving` drive the badge and the border below, and the proposals
  // render without the ids a saved batch carries.
  const held = day.batch ?? null;
  const activities = day.plan?.activities ?? [];
  // The theme shown is the saved one when there is a plan, and the island's copy
  // only while the day has yet to be written. They agree except in one case, and
  // that case is the interesting one - see the note below.
  const theme = day.plan?.plan.theme ?? day.theme;

  return (
    <li
      className={cn(
        "rounded-xl border p-4",
        day.status === "failed"
          ? "border-red-500/30 bg-red-900/20"
          : day.status === "held" || day.status === "saving"
            ? // Dashed, because the row is not yet a fact about the database.
              "border-dashed border-amber-400/40 bg-amber-400/5"
            : "border-white/10 bg-white/5",
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {/* `formatPlanDate` already leads with the weekday ("poniedziałek, 9
            listopada 2026"), so a separate weekday label beside it read as
            "Poniedziałekponiedziałek, 9 listopada". One string, capitalised. */}
        <h3 className="font-semibold text-white first-letter:uppercase">{formatPlanDate(day.planDate)}</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={day.status} acceptedAt={acceptedAt} />
        </div>
      </div>

      {theme && <p className="mt-1 text-sm text-purple-200/90">{theme}</p>}

      {day.status === "generating" && (
        <div className="mt-3">
          <GenerationProgress />
        </div>
      )}

      {day.status === "failed" && day.error && (
        <div role="alert" className="mt-3 space-y-2 text-sm text-red-200">
          <p className="flex items-start gap-2">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            {day.error}
          </p>
          {/* The theme lives on the plan row, and a day whose generation failed
              has no row - so once this page is reloaded the theme is gone and a
              retry runs on the hasło alone. Said out loud rather than letting the
              day quietly drop out of the week's arc. */}
          {!theme && (
            <p className="text-xs text-red-200/70">
              Ten dzień pójdzie z samego hasła — temat tygodnia dla niego przepadł.
            </p>
          )}
          {day.retryable && (
            <Button
              type="button"
              disabled={disabled}
              onClick={onRetry}
              className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white transition-colors hover:bg-white/20"
            >
              <RotateCcw className="size-3.5" />
              Ponów ten dzień
            </Button>
          )}
        </div>
      )}

      {held && held.length > 0 && (
        <ol className="mt-3 space-y-2">
          {held.map((activity, index) => (
            // Index keys: these proposals have no id yet, which is the whole
            // point of them. They are never reordered while held.
            <li key={index} className="text-sm text-white">
              <span className="mr-2 text-amber-300">{index + 1}.</span>
              <span className="font-medium">{activity.title}</span>
              <p className="mt-0.5 ml-6 whitespace-pre-line text-blue-100/70">{activity.description}</p>
            </li>
          ))}
        </ol>
      )}

      {!held && activities.length > 0 && (
        <ol className="mt-3 space-y-2">
          {activities.map((activity, index) => (
            <li key={activity.id} className="text-sm text-white">
              <span className="mr-2 text-purple-300">{index + 1}.</span>
              <span className="font-medium">{activity.title}</span>
              <p className="mt-0.5 ml-6 whitespace-pre-line text-blue-100/70">{activity.description}</p>
            </li>
          ))}
        </ol>
      )}

      {day.status === "empty" && <p className="mt-3 text-sm text-blue-100/60">Ten dzień nie ma jeszcze planu.</p>}

      <a
        href={`/plan?date=${day.planDate}`}
        className="mt-3 inline-flex items-center gap-1 text-sm text-purple-300 hover:underline"
      >
        Otwórz dzień
        <ExternalLink className="size-3.5" />
      </a>
    </li>
  );
}

function StatusBadge({ status, acceptedAt }: { status: DayStatus; acceptedAt: string | null }) {
  // An unwritten batch outranks everything else this badge could say. The day
  // may also be a draft with an older saved plan behind it, and "Plan roboczy"
  // there would describe the row while the teacher is looking at the proposals
  // that have not replaced it yet.
  if (status === "held" || status === "saving") {
    return (
      <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-xs text-amber-100">
        {status === "saving" ? "Zapisuję…" : "Niezapisane — tylko w tej karcie"}
      </span>
    );
  }
  if (acceptedAt) {
    return (
      <>
        <span className="flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-200">
          <Check className="size-3" />
          Zaakceptowany {formatAcceptedAt(acceptedAt)}
        </span>
        {/* Two badges rather than one sentence, because they answer two
            different questions and the plan requires they not say the same
            thing twice: the first is a standing fact about the day, the second
            is what *this run* did about it. */}
        {status === "skipped" && (
          <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-xs text-blue-100/70">
            Nietknięty
          </span>
        )}
      </>
    );
  }
  if (status === "skipped") {
    // Defensive: `skipped` is only ever set on an accepted day, so this renders
    // when the island's `accepted_at` is stale. Naming the reason is still
    // right — it is why the day was passed over.
    return (
      <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-xs text-amber-100">
        Pominięty — dzień zaakceptowany
      </span>
    );
  }
  if (status === "done") {
    return (
      <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-xs text-blue-100/70">
        Plan roboczy
      </span>
    );
  }
  return null;
}
