import { formatPlanDate } from "@/lib/day-plan-dates";
import type { DayPreviewState } from "@/lib/day-preview";
import { clipForLabel, clipText, PREVIEW_DESCRIPTION_MAX } from "@/lib/month-grid";
import { cn } from "@/lib/utils";

/** The id every previewed tile points its `aria-describedby` at. One preview is open at a time. */
export const DAY_PREVIEW_ID = "day-preview";

export interface DayPreviewPlacement {
  readonly vertical: "below" | "above";
  readonly horizontal: "start" | "end";
}

interface DayPreviewProps {
  state: Exclude<DayPreviewState, { status: "closed" }>;
  placement: DayPreviewPlacement;
}

/**
 * One day's activities, over the month grid - read only (`S-07`, FR-010).
 *
 * No logic and no state of its own: it renders whatever `useDayPreview` holds.
 * The outer box carries the gap to the tile as padding rather than margin, so
 * the pointer crossing from the tile onto the card never leaves the wrapper the
 * pointer handlers sit on (see `MonthGrid.tsx`).
 *
 * The heading comes from the fetched plan rather than from the grid's summary,
 * so a single read speaks for everything on the card. Descriptions are clipped
 * in the text and not only by `line-clamp`: the card is the tile's description
 * for a screen reader, which ignores CSS clipping.
 */
export default function DayPreview({ state, placement }: DayPreviewProps) {
  return (
    <div
      id={DAY_PREVIEW_ID}
      role="tooltip"
      className={cn(
        "absolute z-20 w-72 max-w-[calc(100vw-2rem)]",
        placement.vertical === "below" ? "top-full pt-1" : "bottom-full pb-1",
        placement.horizontal === "start" ? "left-0" : "right-0",
      )}
    >
      <div className="rounded-xl border border-white/15 bg-slate-900/95 p-3 text-left shadow-xl backdrop-blur-xl">
        <p className="text-xs font-medium text-white first-letter:uppercase">{formatPlanDate(state.date)}</p>
        {state.status === "loading" && <p className="mt-2 text-xs text-blue-100/70">Wczytuję aktywności…</p>}
        {state.status === "empty" && (
          <p className="mt-2 text-xs text-blue-100/80">
            Ten dzień nie ma już planu. Odśwież stronę, żeby zobaczyć aktualny miesiąc.
          </p>
        )}
        {state.status === "error" && (
          <div className="mt-2 text-xs text-amber-100">
            <p>{state.message}</p>
            <p className="mt-1 text-amber-100/80">Kliknij dzień, żeby otworzyć pełny widok.</p>
          </div>
        )}
        {state.status === "ready" && (
          <>
            <p className="mt-0.5 text-[11px] text-blue-100/60">
              {state.view.plan.accepted_at === null ? "roboczy" : "zaakceptowany"}
            </p>
            <p className="mt-2 text-xs text-blue-100/70">{clipForLabel(state.view.plan.prompt)}</p>
            {state.view.plan.theme && <p className="text-xs text-purple-200">{state.view.plan.theme}</p>}
            <ol className="mt-2 space-y-2">
              {state.view.activities.map((activity, index) => (
                <li key={activity.id} className="text-xs">
                  <p className="font-medium text-white">
                    {index + 1}. {activity.title}
                  </p>
                  <p className="mt-0.5 line-clamp-3 text-blue-100/70">
                    {clipText(activity.description, PREVIEW_DESCRIPTION_MAX)}
                  </p>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}
