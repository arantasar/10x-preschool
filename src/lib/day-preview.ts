import { isDayPlanBody, isErrorBody } from "@/lib/day-plan-guards";
import type { DayPlanView } from "@/types";

/**
 * When and what the month grid's day preview fetches (`S-07`, FR-010).
 *
 * The PRD turned three worries into requirements during the Socratic round:
 * dragging the cursor across a row of 20-22 tiles must not fetch every day it
 * passes, an abandoned request is cancelled, and a day already looked at is not
 * fetched again in the same page view. All three are about time, and time is
 * the one thing the island cannot be tested for here - Vitest runs in `node`
 * without rendering components. So the whole policy lives in this module, with
 * no React and no zod (the island carries it, see `day-plan-guards.ts`), and
 * uses the global timers and `fetch` so a test can fake both.
 *
 * `getState`/`subscribe` are shaped for `useSyncExternalStore`.
 */

/**
 * How long the pointer or focus has to rest on a tile before anything happens.
 *
 * It applies to cached days too: it is the threshold of intent, not only a
 * guard on the network - a sweep across cached days would otherwise flicker a
 * popover over every tile it passes.
 */
export const PREVIEW_OPEN_DELAY_MS = 300;

export const PREVIEW_ERROR_MESSAGE = "Nie udało się wczytać podglądu.";

export type DayPreviewState =
  | { readonly status: "closed" }
  | { readonly status: "loading"; readonly date: string }
  | { readonly status: "ready"; readonly date: string; readonly view: DayPlanView }
  | { readonly status: "empty"; readonly date: string }
  | { readonly status: "error"; readonly date: string; readonly message: string };

export const CLOSED: DayPreviewState = { status: "closed" };

export interface DayPreview {
  /** The pointer or keyboard focus came to rest on a day that has a plan. */
  show(date: string): void;
  /** The pointer left the tile and its popover, focus left the tile, or Escape. */
  hide(): void;
  /** Unmount: clears the timer and aborts the request. The preview stays usable. */
  dispose(): void;
  getState(): DayPreviewState;
  subscribe(listener: () => void): () => void;
}

/** A cached day: its plan, or `null` for "the server says there is none". */
type Cached = DayPlanView | null;

export function createDayPreview(): DayPreview {
  const cache = new Map<string, Cached>();
  const listeners = new Set<() => void>();

  let state: DayPreviewState = CLOSED;
  // The day the teacher is pointing at - pending or shown. The one test every
  // late response has to pass before it reaches the screen.
  let target: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: AbortController | null = null;

  function emit(next: DayPreviewState): void {
    state = next;
    for (const listener of listeners) {
      listener();
    }
  }

  function fromCache(date: string, cached: Cached): DayPreviewState {
    return cached === null ? { status: "empty", date } : { status: "ready", date, view: cached };
  }

  /** Stops everything in motion without touching the cache. */
  function stop(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (inFlight !== null) {
      inFlight.abort();
      inFlight = null;
    }
    target = null;
  }

  async function load(date: string): Promise<void> {
    const controller = new AbortController();
    inFlight = controller;
    emit({ status: "loading", date });

    let next: DayPreviewState;
    try {
      const response = await fetch(`/api/day-plan?date=${date}`, { signal: controller.signal });
      if (response.status === 404) {
        cache.set(date, null);
        next = { status: "empty", date };
      } else {
        const body: unknown = await response.json().catch(() => null);
        if (response.ok && isDayPlanBody(body)) {
          cache.set(date, body);
          next = { status: "ready", date, view: body };
        } else {
          // Not cached: the next time the teacher stops on this day is the retry.
          next = { status: "error", date, message: isErrorBody(body) ? body.error : PREVIEW_ERROR_MESSAGE };
        }
      }
    } catch (error) {
      // Cancelled because the teacher moved on - not a failure, and nothing to say.
      if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) {
        return;
      }
      next = { status: "error", date, message: PREVIEW_ERROR_MESSAGE };
    } finally {
      if (inFlight === controller) {
        inFlight = null;
      }
    }

    // A response for a day the teacher has left may still fill the cache, but
    // it must never land on the screen of another day.
    if (target === date) {
      emit(next);
    }
  }

  return {
    show(date) {
      if (target === date) {
        return;
      }
      stop();
      if (state.status !== "closed") {
        emit(CLOSED);
      }
      target = date;
      timer = setTimeout(() => {
        timer = null;
        const cached = cache.get(date);
        if (cached !== undefined) {
          emit(fromCache(date, cached));
          return;
        }
        void load(date);
      }, PREVIEW_OPEN_DELAY_MS);
    },

    hide() {
      stop();
      if (state.status !== "closed") {
        emit(CLOSED);
      }
    },

    dispose() {
      stop();
      state = CLOSED;
    },

    getState() {
      return state;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
