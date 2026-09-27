import { useDayPreview } from "@/components/hooks/useDayPreview";
import DayPreview, { DAY_PREVIEW_ID, type DayPreviewPlacement } from "@/components/plan/DayPreview";
import { addDays, workingDaysOf } from "@/lib/day-plan-dates";
import { dayNumber, tileLabel } from "@/lib/month-grid";
import { cn } from "@/lib/utils";
import type { DayPlanSummary } from "@/types";

/**
 * The month as rows of weeks.
 *
 * A React island rather than the Astro component it used to be: the day
 * preview (`S-07`) hangs pointer and focus handlers on the tiles, and CLAUDE.md
 * puts elements with DOM event handlers in React. The tiles are still plain
 * links rendered on the server, so clicking one works before hydration.
 *
 * The unit of action here is the week, not the day: each row links to
 * `/plan/week?from=`, which is where generating actually happens. Days link to
 * `/plan?date=` for a single-day plan. This grid generates nothing itself.
 */

interface MonthGridProps {
  /** `YYYY-MM` - the month being shown. */
  month: string;
  /** Mondays of every week touching the month, from `weeksOfMonth`. */
  weeks: readonly string[];
  /** What the teacher has planned in the range, keyed by `plan_date`. */
  summaries: readonly DayPlanSummary[];
}

const WEEKDAY_HEADS = ["pon", "wt", "śr", "czw", "pt", "sob", "nd"];

/**
 * Where a tile's preview opens, from its position in the grid rather than from
 * measuring the DOM: rows in the lower half open upwards so the card stays over
 * the month, and the last three columns align it to the right edge.
 */
function placementOf(rowIndex: number, rowCount: number, columnIndex: number): DayPreviewPlacement {
  return {
    vertical: rowIndex >= Math.ceil(rowCount / 2) ? "above" : "below",
    horizontal: columnIndex >= 4 ? "end" : "start",
  };
}

export default function MonthGrid({ month, weeks, summaries }: MonthGridProps) {
  const byDate = new Map(summaries.map((summary) => [summary.plan_date, summary]));
  const preview = useDayPreview();

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_auto] gap-3">
        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAY_HEADS.map((head, index) => (
            <span
              key={head}
              className={cn("px-1 text-center text-xs", index > 4 ? "text-blue-100/30" : "text-blue-100/60")}
            >
              {head}
            </span>
          ))}
        </div>
        <span className="w-28"></span>
      </div>

      {weeks.map((monday, rowIndex) => {
        // Five working days plus the weekend, so Saturday and Sunday are visible
        // but visibly outside what "generate the week" covers.
        const days = [...workingDaysOf(monday), addDays(monday, 5), addDays(monday, 6)];
        return (
          <div key={monday} className="grid grid-cols-[1fr_auto] items-center gap-3">
            <div className="grid grid-cols-7 gap-1.5">
              {days.map((date, index) => {
                const summary = byDate.get(date);
                const inMonth = date.slice(0, 7) === month;
                const isWeekend = index > 4;
                const previewed =
                  preview.state.status !== "closed" && preview.state.date === date ? preview.state : null;
                const tile = (
                  <a
                    key={date}
                    href={`/plan?date=${date}`}
                    aria-label={tileLabel(date, summary)}
                    aria-describedby={previewed ? DAY_PREVIEW_ID : undefined}
                    // Keyboard only: a mouse click focuses the link too, and would
                    // flash the preview on its way to the day view.
                    onFocus={
                      summary
                        ? (event) => {
                            if (event.currentTarget.matches(":focus-visible")) {
                              preview.show(date);
                            }
                          }
                        : undefined
                    }
                    onBlur={summary ? preview.hide : undefined}
                    className={cn(
                      // A fixed height, not a minimum: the row must not grow with
                      // its content. FR-011 is bound by "the whole month stays
                      // visible without scrolling" - when the theme does not fit,
                      // the theme gives way, not the month. `h-16` is border-box:
                      // 64px less 2px of border and 6+4px of padding leaves 52px,
                      // exactly the 16px number plus three 12px lines.
                      "flex h-16 flex-col justify-between overflow-hidden rounded-lg border px-1.5 pt-1.5 pb-1 transition-colors",
                      summary?.accepted && "border-emerald-400/40 bg-emerald-500/15 hover:bg-emerald-500/25",
                      summary && !summary.accepted && "border-purple-400/40 bg-purple-500/15 hover:bg-purple-500/25",
                      !summary && "border-white/10 bg-white/5 hover:bg-white/10",
                      !inMonth && "opacity-40",
                      isWeekend && !summary && "border-dashed",
                    )}
                  >
                    <span className={cn("text-xs tabular-nums", isWeekend ? "text-blue-100/40" : "text-white")}>
                      {dayNumber(date)}
                    </span>
                    {summary && (
                      // The hasło is dimmed and the theme is not: five days of one
                      // hasło differ only in the theme, so that is the text the eye
                      // should land on - and the one that gets two lines. A day
                      // without a theme keeps the single line; `null` there is a
                      // permanent state, not an omission. The full text is in the
                      // preview, which replaced the native `title` tooltip.
                      <div>
                        <span className="block truncate text-[10px] leading-3 text-blue-100/50">{summary.prompt}</span>
                        {summary.theme && (
                          <span className="line-clamp-2 text-[10px] leading-3 break-words text-purple-200/90">
                            {summary.theme}
                          </span>
                        )}
                      </div>
                    )}
                  </a>
                );
                if (!summary) {
                  // Nothing to preview, so nothing to fetch: an empty day stays a plain link.
                  return tile;
                }
                return (
                  // The pointer handlers sit on this wrapper, not on the link, and
                  // the preview is the link's sibling inside it. Crossing from the
                  // tile onto the card then never fires `pointerleave`, so the card
                  // is hoverable without a grace timer - and it does not inherit
                  // the link's `opacity-40` on days outside the month. Mouse only:
                  // touch fires `pointerenter` before the tap navigates.
                  <div
                    key={date}
                    className="relative"
                    onPointerEnter={(event) => {
                      if (event.pointerType === "mouse") {
                        preview.show(date);
                      }
                    }}
                    onPointerLeave={(event) => {
                      if (event.pointerType === "mouse") {
                        preview.hide();
                      }
                    }}
                  >
                    {tile}
                    {previewed && (
                      <DayPreview state={previewed} placement={placementOf(rowIndex, weeks.length, index)} />
                    )}
                  </div>
                );
              })}
            </div>
            <a
              href={`/plan/week?from=${monday}`}
              className="w-28 rounded-lg bg-white/10 px-2 py-2 text-center text-xs font-medium text-white transition-colors hover:bg-white/20"
            >
              Zaplanuj tydzień
            </a>
          </div>
        );
      })}

      <div className="flex flex-wrap gap-4 pt-2 text-xs text-blue-100/60">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded border border-emerald-400/40 bg-emerald-500/15"></span>
          zaakceptowany
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded border border-purple-400/40 bg-purple-500/15"></span>
          roboczy
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded border border-white/10 bg-white/5"></span>
          brak planu
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-3 rounded border border-dashed border-white/10 bg-white/5"></span>
          weekend — poza generowaniem tygodnia
        </span>
      </div>
    </div>
  );
}
