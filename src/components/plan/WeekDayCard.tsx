import { Check, CircleAlert, ExternalLink, RotateCcw, Trash2, Undo2 } from "lucide-react";
import { GenerationProgress } from "@/components/plan/GenerationProgress";
import { Button } from "@/components/ui/button";
import { formatAcceptedAt, formatPlanDate } from "@/lib/day-plan-dates";
import { cn } from "@/lib/utils";
import {
  ACCEPT_DAY_LABEL,
  acceptanceControlName,
  DELETE_DAY_LABEL,
  deleteControlName,
  UNACCEPT_DAY_LABEL,
} from "@/lib/week-day-controls";
import type { ActivityDraft, DayPlanView } from "@/types";

/**
 * One day on the week board: what is happening to it, and what can be done with
 * it without leaving the page.
 *
 * The *content* is read-only on purpose. Editing a proposal stays on
 * `/plan?date=` so the whole S-02 protocol - the draft, Cancel meaning
 * something, the trigger that returns an edited plan to draft - lives in exactly
 * one place. This card links there rather than reimplementing a fifth of it five
 * times over.
 *
 * Acceptance and deletion of the day live here too since `S-11`. Neither touches
 * the content, and both are one request against a route that already exists, so
 * they cost none of that protocol. The card only renders them and calls back;
 * `WeekPlanBoard` owns the requests, the locks and the state, the same split as
 * "Ponów ten dzień". Every control names its day - see `@/lib/week-day-controls`.
 */

/**
 * `skipped` changed meaning at `S-09` and the old one is worth naming so the
 * change is not mistaken for a rename: it used to mean "this day already had a
 * plan, so the week generation left it alone". Having a plan is no longer a
 * reason to be left alone — a draft is exactly what gets replaced — so it now
 * means "accepted, and deliberately left alone by this run". Since `S-10` an
 * accepted day is out of reach only when the teacher scoped the run to the
 * drafts; one they included is a target like any other and shows the held /
 * saving badge, which already outranks the acceptance badge below.
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
  /**
   * What the last day operation that succeeded here did, naming the day.
   *
   * The toggle asks nothing before it acts - it is reversible - so this is
   * where the day gets named instead: after the fact, next to the button that
   * undoes it.
   */
  readonly notice: string | null;
  /**
   * A day operation that failed here: acceptance or deletion.
   *
   * Kept apart from `error` on purpose. `error` belongs to `status: "failed"`,
   * which in this island means *the generation* failed - it carries the red
   * border and the retry hints, and neither is true of a refused acceptance.
   */
  readonly actionError: string | null;
}

interface WeekDayCardProps {
  readonly day: DayState;
  readonly disabled: boolean;
  /**
   * Off while the week is busy or holds unwritten proposals. The second is the
   * one that matters: the held set must stay exactly the days it was generated
   * for, and accepting or deleting one of them under it strands the write.
   */
  readonly controlsDisabled: boolean;
  readonly onRetry: () => void;
  readonly onToggleAcceptance: () => void;
  readonly onDelete: () => void;
}

export function WeekDayCard({
  day,
  disabled,
  controlsDisabled,
  onRetry,
  onToggleAcceptance,
  onDelete,
}: WeekDayCardProps) {
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
        "bg-mleko rounded-row border-2 border-transparent p-5 min-[900px]:flex min-[900px]:gap-6 min-[900px]:px-6",
        day.status === "failed"
          ? "border-blad-ramka"
          : day.status === "held" || day.status === "saving"
            ? // Dashed, because the row is not yet a fact about the database.
              "border-obrys-przerywany border-dashed"
            : acceptedAt && "border-mech",
      )}
    >
      {/* `formatPlanDate` already leads with the weekday ("poniedziałek, 9
          listopada 2026"), so a separate weekday label beside it read as
          "Poniedziałekponiedziałek, 9 listopada". One string, capitalised - and
          one element: the e2e suite finds a card by this heading's exact name. */}
      <div className="min-[900px]:w-40 min-[900px]:shrink-0">
        <h3 className="font-display text-las text-lg leading-tight first-letter:uppercase">
          {formatPlanDate(day.planDate)}
        </h3>
      </div>

      <div className="mt-3 min-w-0 flex-1 min-[900px]:mt-0">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={day.status} acceptedAt={acceptedAt} />
        </div>

        {theme && <p className="text-las mt-2 text-[15px] font-extrabold">{theme}</p>}

        {day.status === "generating" && (
          <div className="mt-3">
            <GenerationProgress />
          </div>
        )}

        {day.status === "failed" && day.error && (
          <div role="alert" className="text-blad mt-3 space-y-2 text-[15px]">
            <p className="flex items-start gap-2 font-bold">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              {day.error}
            </p>
            {/* The theme lives on the plan row, and a day whose generation failed
                has no row - so once this page is reloaded the theme is gone and a
                retry runs on the hasło alone. Said out loud rather than letting the
                day quietly drop out of the week's arc. */}
            {!theme && <p className="text-sm">Ten dzień pójdzie z samego hasła — temat tygodnia dla niego przepadł.</p>}
            {day.retryable && (
              <Button
                type="button"
                variant="outlinePill"
                size="pillSm"
                disabled={disabled}
                onClick={onRetry}
                className="cursor-pointer"
              >
                <RotateCcw className="size-4" />
                Ponów ten dzień
              </Button>
            )}
          </div>
        )}

        {held && held.length > 0 && (
          <ol className="mt-3 space-y-2.5">
            {held.map((activity, index) => (
              // Index keys: these proposals have no id yet, which is the whole
              // point of them. They are never reordered while held.
              <li key={index} className="text-las text-[15px]">
                <span className="text-mech mr-2 font-extrabold">{index + 1}.</span>
                <span className="font-extrabold">{activity.title}</span>
                <p className="text-las-szary mt-0.5 ml-6 whitespace-pre-line">{activity.description}</p>
              </li>
            ))}
          </ol>
        )}

        {!held && activities.length > 0 && (
          <ol className="mt-3 space-y-2.5">
            {activities.map((activity, index) => (
              <li key={activity.id} className="text-las text-[15px]">
                <span className="text-mech mr-2 font-extrabold">{index + 1}.</span>
                <span className="font-extrabold">{activity.title}</span>
                <p className="text-las-szary mt-0.5 ml-6 whitespace-pre-line">{activity.description}</p>
              </li>
            ))}
          </ol>
        )}

        {day.status === "empty" && <p className="text-las-szary mt-2 text-[15px]">Ten dzień nie ma jeszcze planu.</p>}

        {/* Rendered always, empty until there is something to say. A live region
            inserted together with its text is announced unreliably; one that is
            already in the tree and only changes its content is not. */}
        <p role="status" className={cn("text-mech-ciemny text-[15px] font-bold", day.notice && "mt-3")}>
          {day.notice}
        </p>

        {/* No border change, unlike a failed generation: the day itself is fine,
            one operation on it was refused, and the card has already been re-read
            from the server by the time this shows. */}
        {day.actionError && (
          <p role="alert" className="text-blad mt-3 flex items-start gap-2 text-[15px] font-bold">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            {day.actionError}
          </p>
        )}

        {/* Under the content they act on. Deletion is pushed away from the toggle
            and quieter than it - an outline, not a fill - for the reason
            `DayPlanEditor` seats its own delete apart (`prd-v2.md` §Constraints
            „Warunek układu"): an irreversible operation does not sit next to one
            the eye falls into. On a narrow card it wraps onto its own line.

            The accessible names carry the date and start with the visible label,
            so five identical-looking buttons are five different ones. */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          {/* Same gate as the day view: a day with no proposals has nothing to
              accept. */}
          {day.plan && activities.length > 0 && (
            <Button
              type="button"
              variant={acceptedAt ? "outlinePill" : "primary"}
              size="pillSm"
              disabled={controlsDisabled}
              onClick={onToggleAcceptance}
              aria-label={acceptanceControlName(day.planDate, acceptedAt !== null)}
              className="cursor-pointer"
            >
              {acceptedAt ? <Undo2 className="size-4" /> : <Check className="size-4" />}
              {acceptedAt ? UNACCEPT_DAY_LABEL : ACCEPT_DAY_LABEL}
            </Button>
          )}

          <a
            href={`/plan?date=${day.planDate}`}
            className="text-las hover:text-mech inline-flex min-h-11 items-center gap-1.5 px-1 text-[15px] font-extrabold underline underline-offset-4"
          >
            Otwórz dzień
            <ExternalLink className="size-4" />
          </a>

          {day.plan && (
            <Button
              type="button"
              variant="dangerPill"
              size="pillSm"
              disabled={controlsDisabled}
              onClick={onDelete}
              aria-label={deleteControlName(day.planDate)}
              className="ml-auto cursor-pointer"
            >
              <Trash2 className="size-4" />
              {DELETE_DAY_LABEL}
            </Button>
          )}
        </div>
      </div>
    </li>
  );
}

const BADGE = "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm leading-tight font-extrabold";
const BADGE_UNSAVED = "bg-maslo-soft text-ostrzezenie";
const BADGE_OUTLINE = "border-obrys text-las-szary border-[1.5px]";

function StatusBadge({ status, acceptedAt }: { status: DayStatus; acceptedAt: string | null }) {
  // An unwritten batch outranks everything else this badge could say. The day
  // may also be a draft with an older saved plan behind it, and "Plan roboczy"
  // there would describe the row while the teacher is looking at the proposals
  // that have not replaced it yet.
  if (status === "held" || status === "saving") {
    return (
      <span className={cn(BADGE, BADGE_UNSAVED)}>
        {status === "saving" ? "Zapisuję…" : "Niezapisane — tylko w tej karcie"}
      </span>
    );
  }
  if (acceptedAt) {
    return (
      <>
        <span className={cn(BADGE, "bg-szalwia-soft text-mech-ciemny")}>
          <Check className="size-4" strokeWidth={3} />
          Zaakceptowany {formatAcceptedAt(acceptedAt)}
        </span>
        {/* Two badges rather than one sentence, because they answer two
            different questions and the plan requires they not say the same
            thing twice: the first is a standing fact about the day, the second
            is what *this run* did about it. */}
        {status === "skipped" && <span className={cn(BADGE, BADGE_OUTLINE)}>Nietknięty</span>}
      </>
    );
  }
  if (status === "skipped") {
    // Defensive: `skipped` is only ever set on an accepted day, so this renders
    // when the island's `accepted_at` is stale. Naming the reason is still
    // right — it is why the day was passed over.
    return <span className={cn(BADGE, BADGE_UNSAVED)}>Pominięty — dzień zaakceptowany</span>;
  }
  if (status === "done") {
    return (
      <span className={cn(BADGE, "border-obrys-przerywany text-las-szary border-[1.5px] border-dashed")}>
        Plan roboczy
      </span>
    );
  }
  return null;
}
