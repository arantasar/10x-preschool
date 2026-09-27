import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { createDayPreview, PREVIEW_ERROR_MESSAGE, PREVIEW_OPEN_DELAY_MS, type DayPreview } from "./day-preview";

// A week of days, because the risk is a sweep across a row: a preview that
// fetched every day it passed, or showed the neighbour's content, would look
// right with a single day.
const [MON, TUE, WED, THU, FRI] = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"];

function planBody(date: string) {
  return {
    plan: {
      id: `plan-${date}`,
      plan_date: date,
      prompt: "Dinozaury",
      theme: `Temat ${date}`,
      accepted_at: null,
      current_generation: 1,
    },
    activities: [{ id: `a-${date}`, title: `Tytuł ${date}`, description: "Opis" }],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** The dates the stub was asked for, in order. */
function requestedDates(fetchMock: Mock<FetchLike>): string[] {
  return fetchMock.mock.calls.map(([url]) => new URL(url, "http://x").searchParams.get("date") ?? "");
}

let fetchMock: Mock<FetchLike>;
let preview: DayPreview;

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn<FetchLike>((url) => {
    const date = new URL(url, "http://x").searchParams.get("date") ?? "";
    return Promise.resolve(jsonResponse(planBody(date)));
  });
  vi.stubGlobal("fetch", fetchMock);
  preview = createDayPreview();
});

afterEach(() => {
  preview.dispose();
  vi.useRealTimers();
});

describe("delay", () => {
  it("sends nothing before the delay, and exactly one request for the day after it", async () => {
    preview.show(MON);
    await vi.advanceTimersByTimeAsync(PREVIEW_OPEN_DELAY_MS - 1);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(preview.getState()).toEqual({ status: "closed" });

    await vi.advanceTimersByTimeAsync(1);
    expect(requestedDates(fetchMock)).toEqual([MON]);
    expect(preview.getState()).toMatchObject({ status: "ready", date: MON });
  });

  it("sends nothing when the pointer leaves before the delay", async () => {
    preview.show(MON);
    await vi.advanceTimersByTimeAsync(PREVIEW_OPEN_DELAY_MS - 1);
    preview.hide();
    await vi.advanceTimersByTimeAsync(PREVIEW_OPEN_DELAY_MS * 10);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(preview.getState()).toEqual({ status: "closed" });
  });

  it("fetches only the day the sweep stopped on", async () => {
    for (const day of [MON, TUE, WED, THU]) {
      preview.show(day);
      await vi.advanceTimersByTimeAsync(PREVIEW_OPEN_DELAY_MS / 3);
      preview.hide();
    }
    preview.show(FRI);
    await vi.advanceTimersByTimeAsync(PREVIEW_OPEN_DELAY_MS * 10);
    expect(requestedDates(fetchMock)).toEqual([FRI]);
    expect(preview.getState()).toMatchObject({ status: "ready", date: FRI });
  });

  it("does not restart the delay when the same day is shown twice", async () => {
    preview.show(MON);
    await vi.advanceTimersByTimeAsync(PREVIEW_OPEN_DELAY_MS - 1);
    preview.show(MON);
    await vi.advanceTimersByTimeAsync(1);
    expect(requestedDates(fetchMock)).toEqual([MON]);
  });
});

describe("cache", () => {
  it("shows a day looked at before without a second request", async () => {
    preview.show(MON);
    await vi.advanceTimersByTimeAsync(PREVIEW_OPEN_DELAY_MS);
    preview.hide();

    preview.show(MON);
    await vi.advanceTimersByTimeAsync(PREVIEW_OPEN_DELAY_MS);
    expect(requestedDates(fetchMock)).toEqual([MON]);
    expect(preview.getState()).toMatchObject({ status: "ready", date: MON, view: planBody(MON) });
  });

  it("remembers a 404 as a day without a plan", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({ error: "brak", retryable: false }, 404)));
    preview.show(MON);
    await vi.advanceTimersByTimeAsync(PREVIEW_OPEN_DELAY_MS);
    expect(preview.getState()).toEqual({ status: "empty", date: MON });

    preview.hide();
    preview.show(MON);
    await vi.advanceTimersByTimeAsync(PREVIEW_OPEN_DELAY_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(preview.getState()).toEqual({ status: "empty", date: MON });
  });
});

describe("cancellation", () => {
  it("aborts the request in flight when the pointer leaves, and does not cache it", async () => {
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementationOnce((_url, init) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    });

    preview.show(MON);
    await vi.advanceTimersByTimeAsync(PREVIEW_OPEN_DELAY_MS);
    expect(preview.getState()).toEqual({ status: "loading", date: MON });

    preview.hide();
    await vi.advanceTimersByTimeAsync(0);
    expect(signal?.aborted).toBe(true);
    expect(preview.getState()).toEqual({ status: "closed" });

    preview.show(MON);
    await vi.advanceTimersByTimeAsync(PREVIEW_OPEN_DELAY_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(preview.getState()).toMatchObject({ status: "ready", date: MON });
  });

  it("never shows a late response for the day that was left on the next day's screen", async () => {
    // A stub that ignores the abort signal: the response races the cancellation.
    let resolveMonday: (response: Response) => void = () => undefined;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((resolve) => {
          resolveMonday = resolve;
        }),
    );

    preview.show(MON);
    await vi.advanceTimersByTimeAsync(PREVIEW_OPEN_DELAY_MS);
    preview.show(TUE);

    const seen: unknown[] = [];
    preview.subscribe(() => seen.push(preview.getState()));
    resolveMonday(jsonResponse(planBody(MON)));
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(PREVIEW_OPEN_DELAY_MS);

    for (const state of seen) {
      expect(state).not.toMatchObject({ view: planBody(MON) });
    }
    expect(preview.getState()).toMatchObject({ status: "ready", date: TUE, view: planBody(TUE) });
  });
});

describe("failures", () => {
  it("shows the server's message for an error body, and retries on the next stop", async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(jsonResponse({ error: "Twoja sesja wygasła. Zaloguj się ponownie.", retryable: false }, 503)),
    );
    preview.show(MON);
    await vi.advanceTimersByTimeAsync(PREVIEW_OPEN_DELAY_MS);
    expect(preview.getState()).toEqual({
      status: "error",
      date: MON,
      message: "Twoja sesja wygasła. Zaloguj się ponownie.",
    });

    preview.hide();
    preview.show(MON);
    await vi.advanceTimersByTimeAsync(PREVIEW_OPEN_DELAY_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(preview.getState()).toMatchObject({ status: "ready", date: MON });
  });

  it("falls back to the generic message when the network fails", async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new TypeError("Failed to fetch")));
    preview.show(MON);
    await vi.advanceTimersByTimeAsync(PREVIEW_OPEN_DELAY_MS);
    expect(preview.getState()).toEqual({ status: "error", date: MON, message: PREVIEW_ERROR_MESSAGE });
  });

  it("refuses a body with no activities rather than showing an empty day", async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(jsonResponse({ ...planBody(MON), activities: [] })));
    preview.show(MON);
    await vi.advanceTimersByTimeAsync(PREVIEW_OPEN_DELAY_MS);
    expect(preview.getState()).toEqual({ status: "error", date: MON, message: PREVIEW_ERROR_MESSAGE });
  });
});

describe("dispose", () => {
  it("leaves no timer running and aborts the request in flight", async () => {
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementationOnce((_url, init) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => undefined);
    });

    preview.show(MON);
    await vi.advanceTimersByTimeAsync(PREVIEW_OPEN_DELAY_MS);
    preview.show(TUE);
    preview.dispose();

    expect(vi.getTimerCount()).toBe(0);
    expect(signal?.aborted).toBe(true);
  });
});
