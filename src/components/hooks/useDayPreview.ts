import { useEffect, useState, useSyncExternalStore } from "react";

import { CLOSED, createDayPreview, type DayPreviewState } from "@/lib/day-preview";

/**
 * The month grid's day preview, as React sees it.
 *
 * A thin bridge on purpose: when to fetch, what to cancel and what to remember
 * all live in `@/lib/day-preview`, where fake timers can check them. This hook
 * only owns the preview's lifetime and the one listener that has to sit on the
 * document - Escape closes a preview opened by the pointer, whose focus is not
 * on the tile.
 */
export function useDayPreview(): {
  state: DayPreviewState;
  show: (date: string) => void;
  hide: () => void;
} {
  // One preview per island, so its cache lasts the page view.
  const [preview] = useState(createDayPreview);

  // The server has nothing to preview: every tile renders closed there.
  const state = useSyncExternalStore(preview.subscribe, preview.getState, () => CLOSED);

  useEffect(
    () => () => {
      preview.dispose();
    },
    [preview],
  );

  const open = state.status !== "closed";
  useEffect(() => {
    if (!open) {
      return;
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        preview.hide();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, preview]);

  return { state, show: preview.show, hide: preview.hide };
}
