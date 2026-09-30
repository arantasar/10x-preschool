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
        // Below 900 px the grid is a list and the card always opens under the
        // tile, aligned left; the placement applies from 900 px up.
        "absolute top-full left-0 z-20 w-72 max-w-[calc(100vw-2rem)] pt-1",
        placement.vertical === "above" &&
          "min-[900px]:top-auto min-[900px]:bottom-full min-[900px]:pt-0 min-[900px]:pb-1",
        placement.horizontal === "end" && "min-[900px]:right-0 min-[900px]:left-auto",
      )}
    >
      <div className="border-linia bg-mleko text-las shadow-card rounded-2xl border p-4 text-left">
        <p className="text-sm font-extrabold first-letter:uppercase">{formatPlanDate(state.date)}</p>
        {state.status === "loading" && <p className="text-las-szary mt-2 text-sm">Wczytuję aktywności…</p>}
        {state.status === "empty" && (
          <p className="text-las-szary mt-2 text-sm">
            Ten dzień nie ma już planu. Odśwież stronę, żeby zobaczyć aktualny miesiąc.
          </p>
        )}
        {state.status === "error" && (
          <div className="text-blad mt-2 text-sm">
            <p className="font-bold">{state.message}</p>
            <p className="mt-1">Kliknij dzień, żeby otworzyć pełny widok.</p>
          </div>
        )}
        {state.status === "ready" && (
          <>
            <p className="text-mech mt-0.5 text-[13px] font-bold">
              {state.view.plan.accepted_at === null ? "roboczy" : "zaakceptowany"}
            </p>
            <p className="text-las-szary mt-2 text-sm">{clipForLabel(state.view.plan.prompt)}</p>
            {state.view.plan.theme && <p className="text-sm font-bold">{state.view.plan.theme}</p>}
            <ol className="mt-2 space-y-2">
              {state.view.activities.map((activity, index) => (
                <li key={activity.id} className="text-sm">
                  <p className="font-extrabold">
                    {index + 1}. {activity.title}
                  </p>
                  <p className="text-las-szary mt-0.5 line-clamp-3">
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
