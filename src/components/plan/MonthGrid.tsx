import { useDayPreview } from "@/components/hooks/useDayPreview";
import DayPreview, { DAY_PREVIEW_ID, type DayPreviewPlacement } from "@/components/plan/DayPreview";
import { buttonVariants } from "@/components/ui/button";
import { weekdayLabel } from "@/lib/day-plan-dates";
import {
  dayNumber,
  emptyRowText,
  monthRows,
  tileLabel,
  weekendLinkText,
  weekendPlans,
  weekLinkLabel,
  type MonthGridDay,
} from "@/lib/month-grid";
import { cn } from "@/lib/utils";
import type { DayPlanSummary } from "@/types";

/**
 * The month as rows of weeks, Monday to Friday.
 *
 * A React island rather than the Astro component it used to be: the day
 * preview (`S-07`) hangs pointer and focus handlers on the tiles, and CLAUDE.md
 * puts elements with DOM event handlers in React. The tiles are still plain
 * links rendered on the server, so clicking one works before hydration.
 *
 * The unit of action here is the week, not the day: each row's header links to
 * `/plan/week?from=`, which is where generating actually happens. Days link to
 * `/plan?date=` for a single-day plan. This grid generates nothing itself.
 *
 * What a row says - its range, its heading, whether it is empty - is computed
 * in `@/lib/month-grid`, where it is tested. Below 900 px the grid is a list:
 * every week is its header followed by its days, one under another.
 */

interface MonthGridProps {
  /** `YYYY-MM` - the month being shown. */
  month: string;
  /** Mondays of every week touching the month, from `weeksOfMonth`. */
  weeks: readonly string[];
  /** What the teacher has planned in the range, keyed by `plan_date`. */
  summaries: readonly DayPlanSummary[];
}

const WEEKDAY_HEADS = ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek"];

const ROW = "min-[900px]:grid min-[900px]:grid-cols-[200px_repeat(5,minmax(0,1fr))] min-[900px]:gap-2.5";

/**
 * Where a tile's preview opens, from its position in the grid rather than from
 * measuring the DOM: rows in the lower half open upwards so the card stays over
 * the month, and the last two of the five columns align it to the right edge.
 * Below 900 px, where the grid is a list, `DayPreview` ignores this and always
 * opens under the tile, aligned left.
 */
function placementOf(rowIndex: number, rowCount: number, columnIndex: number): DayPreviewPlacement {
  return {
    vertical: rowIndex >= Math.ceil(rowCount / 2) ? "above" : "below",
    horizontal: columnIndex >= 3 ? "end" : "start",
  };
}

export default function MonthGrid({ month, weeks, summaries }: MonthGridProps) {
  const rows = monthRows(month, weeks, summaries);
  const weekends = weekendPlans(month, summaries);
  const preview = useDayPreview();

  function renderDay(day: MonthGridDay, rowIndex: number, columnIndex: number) {
    const { date, summary } = day;
    if (!day.inMonth) {
      // A day of the neighbouring month: a blank that keeps the column, and
      // nothing at all in the list layout.
      return <div key={date} aria-hidden="true" className="hidden min-[900px]:block"></div>;
    }

    const previewed = preview.state.status !== "closed" && preview.state.date === date ? preview.state : null;
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
          "text-las flex min-h-11 items-baseline gap-3 rounded-[18px] border-[1.5px] border-transparent px-4 py-3 no-underline transition-colors",
          // A fixed height, not a minimum: the row must not grow with its
          // content. FR-011 is bound by "the whole month stays visible without
          // scrolling" - when the theme does not fit, the theme gives way, not
          // the month (`month-grid-fit.spec.ts` measures it). `h-24` is
          // border-box: 96px less 3px of border and 24px of padding leaves
          // 69px - the 18px number, a 12px gap and exactly two 19.5px lines.
          "min-[900px]:h-24 min-[900px]:flex-col min-[900px]:items-stretch min-[900px]:p-3",
          summary?.accepted && "border-mech bg-szalwia-soft text-mech-ciemny hover:border-las",
          summary && !summary.accepted && "border-obrys-przerywany bg-mleko hover:border-las border-dashed",
          !summary && "bg-owies-ciemny hover:border-obrys",
        )}
      >
        <span className="flex shrink-0 items-baseline gap-2">
          <span className="font-display text-lg leading-[18px] tabular-nums">{dayNumber(date)}</span>
          <span className="text-mech text-sm font-bold min-[900px]:hidden">{weekdayLabel(date)}</span>
        </span>
        {summary && (
          // The day's theme - the text five days of one hasło differ in - and
          // the hasło only for a day that has none (`null` there is a permanent
          // state). The hasło itself is in the row header. Clipped by this
          // box's height, not by `line-clamp`: two whole lines fit, and the
          // full text is in the preview.
          <span className="min-h-0 min-w-0 flex-1 overflow-hidden">
            <span className="line-clamp-3 text-[15px] leading-[19.5px] font-extrabold break-words min-[900px]:line-clamp-none">
              {summary.theme ?? summary.prompt}
            </span>
          </span>
        )}
      </a>
    );
    if (!summary) {
      // Nothing to preview, so nothing to fetch: an empty day stays a plain link.
      return tile;
    }
    return (
      // The pointer handlers sit on this wrapper, not on the link, and the
      // preview is the link's sibling inside it. Crossing from the tile onto
      // the card then never fires `pointerleave`, so the card is hoverable
      // without a grace timer. Mouse only: touch fires `pointerenter` before
      // the tap navigates.
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
        {previewed && <DayPreview state={previewed} placement={placementOf(rowIndex, rows.length, columnIndex)} />}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div role="group" aria-label="Siatka miesiąca" className="flex flex-col gap-6 min-[900px]:gap-2.5">
        <div className={cn("hidden", ROW)} aria-hidden="true">
          <span></span>
          {WEEKDAY_HEADS.map((head) => (
            <span key={head} className="text-mech px-1.5 text-sm leading-5 font-extrabold">
              {head}
            </span>
          ))}
        </div>

        {rows.map((row, rowIndex) => (
          <div key={row.monday} className={cn("flex flex-col gap-2", ROW)}>
            <a
              href={`/plan/week?from=${row.monday}`}
              aria-label={weekLinkLabel(row)}
              className="group text-las flex min-h-11 flex-col justify-center gap-0.5 rounded-xl pr-2 no-underline min-[900px]:h-24"
            >
              <span
                className={cn(
                  "font-display line-clamp-2 text-[19px] leading-[1.2] break-words group-hover:underline",
                  row.heading === null && "text-las-szary",
                )}
              >
                {row.heading ?? "Bez tematu"}
              </span>
              <span className="text-mech text-[13px] font-bold">{row.rangeLabel}</span>
            </a>

            {row.isEmpty ? (
              <div className="bg-puste text-las-szary flex flex-col items-center justify-center gap-3 rounded-[18px] p-6 text-center text-base font-bold min-[900px]:col-span-5 min-[900px]:h-24 min-[900px]:flex-row min-[900px]:gap-[18px] min-[900px]:p-3">
                <span>{emptyRowText(row)}</span>
                <a
                  href={`/plan/week?from=${row.monday}`}
                  className={cn(buttonVariants({ variant: "primary", size: "pill" }), "whitespace-normal")}
                >
                  Wpisz hasło na {row.rangeLabel}
                </a>
              </div>
            ) : (
              row.days.map((day, columnIndex) => renderDay(day, rowIndex, columnIndex))
            )}
          </div>
        ))}
      </div>

      {weekends.length > 0 && (
        // The grid has no weekend columns; a plan made for a Saturday from
        // `/plan?date=` is listed here so it does not vanish from the month.
        <p className="text-las-szary flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px]">
          <span className="font-bold">Plany na weekend:</span>
          {weekends.map((summary) => (
            <a
              key={summary.plan_date}
              href={`/plan?date=${summary.plan_date}`}
              aria-label={tileLabel(summary.plan_date, summary)}
              className="text-las hover:text-mech inline-flex min-h-11 items-center font-extrabold underline underline-offset-4"
            >
              {weekendLinkText(summary.plan_date)}
            </a>
          ))}
        </p>
      )}
    </div>
  );
}
