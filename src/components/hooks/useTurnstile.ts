import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/** The slice of Turnstile's explicit-render API the forms use. */
interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      appearance: "always" | "execute" | "interaction-only";
      language: string;
      theme: "auto" | "light" | "dark";
      size: "normal" | "flexible" | "compact";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ): string;
  reset(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/**
 * One script tag per page, however often an island mounts: the load is
 * memoised, so a second mount waits on the same promise instead of attaching
 * listeners to a script that has already fired. A failed load is forgotten, so
 * a later mount may try again.
 */
let turnstileLoad: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  turnstileLoad ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SRC;
    script.async = true;
    script.addEventListener("load", () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("turnstile missing after load"));
    });
    script.addEventListener("error", () => {
      reject(new Error("turnstile failed to load"));
    });
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    turnstileLoad = null;
    throw error;
  });
  return turnstileLoad;
}

/** How long a submit waits for Turnstile's token before sending without one. */
const TOKEN_WAIT_MS = 10_000;

interface Options {
  /** `undefined` when the deployment has no Turnstile key: nothing is rendered. */
  siteKey?: string;
  /** The widget's `action` - the route's `verifyHumanToken` checks the same one. */
  action: string;
}

export interface Turnstile {
  /** Attach to the element the widget renders into (render it only with a `siteKey`). */
  containerRef: RefObject<HTMLDivElement | null>;
  /**
   * The current token, or the one the widget earns within `TOKEN_WAIT_MS`;
   * `""` when none arrives, so the submit goes out and the route refuses it.
   */
  tokenFor: () => Promise<string>;
  /** Spends the token: call after any refusal, so the retry earns a fresh one. */
  reset: () => void;
  /** Turnstile cannot run in this browser at all: the form cannot succeed. */
  widgetFailed: boolean;
}

/**
 * The invisible Turnstile widget of a public form (contact, founder price):
 * script loading, explicit render, waiting for the token, reset after a
 * refusal, and the "cannot run here" state.
 */
export function useTurnstile({ siteKey, action }: Options): Turnstile {
  const [widgetFailed, setWidgetFailed] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const token = useRef<string | null>(null);
  // Submits waiting for a token that has not arrived yet (see `tokenFor`).
  const tokenWaiters = useRef<((value: string) => void)[]>([]);

  useEffect(() => {
    if (!siteKey || !containerRef.current || widgetId.current) return;
    const container = containerRef.current;
    loadTurnstile()
      .then((turnstile) => {
        widgetId.current = turnstile.render(container, {
          sitekey: siteKey,
          action,
          // Invisible unless Cloudflare is unsure about this visitor: then the
          // widget appears and a person can click through instead of being
          // refused. For that rare case it speaks Polish, stays light like
          // the page, and takes the form's width.
          appearance: "interaction-only",
          language: "pl",
          theme: "light",
          size: "flexible",
          callback: (value) => {
            token.current = value;
            for (const resolve of tokenWaiters.current.splice(0)) resolve(value);
          },
          "expired-callback": () => {
            token.current = null;
          },
          "error-callback": () => {
            token.current = null;
            // Release any submit already waiting: it goes out without a token,
            // is refused, and the reset after the refusal starts a new attempt.
            for (const resolve of tokenWaiters.current.splice(0)) resolve("");
          },
        });
      })
      .catch(() => {
        setWidgetFailed(true);
      });
  }, [siteKey, action]);

  // Turnstile tokens are single-use: after any refusal the next attempt needs a
  // fresh one, or the retry fails the same way.
  const reset = useCallback(() => {
    token.current = null;
    if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
  }, []);

  // The widget earns its token a moment after it renders. A quick submit waits
  // for it - up to a bound - instead of sending none and being refused.
  const tokenFor = useCallback((): Promise<string> => {
    if (token.current) return Promise.resolve(token.current);
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        tokenWaiters.current = tokenWaiters.current.filter((waiter) => waiter !== done);
        resolve("");
      }, TOKEN_WAIT_MS);
      const done = (value: string) => {
        window.clearTimeout(timer);
        resolve(value);
      };
      tokenWaiters.current.push(done);
    });
  }, []);

  return { containerRef, tokenFor, reset, widgetFailed };
}
