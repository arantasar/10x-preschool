import React, { useEffect, useRef, useState } from "react";
import { CircleAlert } from "lucide-react";
import { FormField, inputBase } from "@/components/auth/FormField";
import { ServerError } from "@/components/auth/ServerError";
import { Button } from "@/components/ui/button";
import {
  CONTACT_MESSAGE_MAX,
  CONTACT_MESSAGE_MIN,
  CONTACT_TOPICS,
  contactErrorMessage,
  type ContactTopic,
} from "@/lib/contact-form";
import { emailError } from "@/lib/email-check";
import { cn } from "@/lib/utils";

/** The slice of Turnstile's explicit-render API this form uses. */
interface TurnstileApi {
  render(
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
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

/** One script tag per page, however often the island mounts. */
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  return new Promise((resolve, reject) => {
    let script = document.querySelector<HTMLScriptElement>(`script[src="${TURNSTILE_SRC}"]`);
    if (!script) {
      script = document.createElement("script");
      script.src = TURNSTILE_SRC;
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("turnstile missing after load"));
    });
    script.addEventListener("error", () => {
      reject(new Error("turnstile failed to load"));
    });
  });
}

/** How long a submit waits for Turnstile's token before sending without one. */
const TOKEN_WAIT_MS = 10_000;

/** The counter appears only near the limit, where it helps. */
const COUNTER_FROM = CONTACT_MESSAGE_MAX - 500;

interface Props {
  /** `undefined` when the deployment has no Turnstile key: the form says it is unavailable. */
  siteKey?: string;
  /** The account's address for a signed-in teacher. */
  defaultEmail?: string;
}

interface FieldErrors {
  email?: string;
  message?: string;
}

export default function ContactForm({ siteKey, defaultEmail = "" }: Props) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState(defaultEmail);
  const [topic, setTopic] = useState<ContactTopic>("question");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(siteKey ? null : contactErrorMessage("config_missing"));
  const [pending, setPending] = useState(false);

  const widgetContainer = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const token = useRef<string | null>(null);
  // Submits waiting for a token that has not arrived yet (see `tokenFor`).
  const tokenWaiters = useRef<((value: string) => void)[]>([]);

  useEffect(() => {
    if (!siteKey || !widgetContainer.current || widgetId.current) return;
    const container = widgetContainer.current;
    loadTurnstile()
      .then((turnstile) => {
        widgetId.current = turnstile.render(container, {
          sitekey: siteKey,
          action: "contact",
          callback: (value) => {
            token.current = value;
            for (const resolve of tokenWaiters.current.splice(0)) resolve(value);
          },
          "expired-callback": () => {
            token.current = null;
          },
          "error-callback": () => {
            token.current = null;
          },
        });
      })
      .catch(() => {
        setServerError(contactErrorMessage("bot_check_unavailable"));
      });
  }, [siteKey]);

  // Turnstile tokens are single-use: after any refusal the next attempt needs a
  // fresh one, or the retry fails the same way.
  function resetWidget() {
    token.current = null;
    if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
  }

  // The widget earns its token a moment after it renders. A quick submit waits
  // for it - up to a bound - instead of sending none and being refused.
  function tokenFor(): Promise<string> {
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
  }

  function validate(): boolean {
    const next: FieldErrors = { email: emailError(email) };
    const length = message.trim().length;
    if (length === 0) next.message = "Napisz wiadomość";
    else if (length < CONTACT_MESSAGE_MIN) next.message = `Napisz co najmniej ${CONTACT_MESSAGE_MIN} znaków`;
    else if (length > CONTACT_MESSAGE_MAX) next.message = `Wiadomość może mieć najwyżej ${CONTACT_MESSAGE_MAX} znaków`;
    setErrors(next);
    return !next.email && !next.message;
  }

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || !siteKey || !validate()) return;

    setPending(true);
    setServerError(null);
    let code = "unknown";
    try {
      const turnstileToken = await tokenFor();
      const response = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, topic, message, website, turnstileToken }),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (response.ok && body.ok) {
        window.location.assign("/kontakt/wyslano");
        return;
      }
      code = body.error ?? code;
    } catch {
      // Network failure or a non-JSON answer: the generic message below.
    }
    // Every field keeps what was typed; only the token is spent.
    resetWidget();
    setServerError(contactErrorMessage(code));
    setPending(false);
  }

  const messageNote = errors.message ? "message-note" : undefined;

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="name" label="Imię" value={name} onChange={setName} />
        <FormField
          id="email"
          type="email"
          label="E-mail"
          value={email}
          onChange={(v) => {
            setEmail(v);
            if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
          }}
          placeholder="imie@przedszkole.pl"
          error={errors.email}
        />
      </div>

      <div>
        <label htmlFor="topic" className="text-las mb-2 block text-[15px] font-extrabold">
          Temat
        </label>
        <select
          id="topic"
          name="topic"
          value={topic}
          onChange={(e) => {
            setTopic(e.target.value as ContactTopic);
          }}
          className={cn(inputBase, "border-obrys-przerywany appearance-auto")}
        >
          {CONTACT_TOPICS.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="message" className="text-las mb-2 block text-[15px] font-extrabold">
          Wiadomość
        </label>
        <textarea
          id="message"
          name="message"
          rows={6}
          maxLength={CONTACT_MESSAGE_MAX}
          value={message}
          onChange={(e) => {
            setMessage(e.target.value);
            if (errors.message) setErrors((prev) => ({ ...prev, message: undefined }));
          }}
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={messageNote}
          className={cn(
            inputBase,
            "h-auto resize-y py-3.5 leading-normal",
            errors.message ? "border-red-700" : "border-obrys-przerywany",
          )}
        />
        {errors.message ? (
          <p id={messageNote} className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-red-800">
            <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
            {errors.message}
          </p>
        ) : message.length >= COUNTER_FROM ? (
          <p className="text-las-szary mt-1.5 text-sm">
            {message.length} / {CONTACT_MESSAGE_MAX}
          </p>
        ) : null}
      </div>

      {/* The honeypot: invisible and unreachable for people, filled by naive bots. */}
      <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
        <label htmlFor="website">Strona internetowa</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => {
            setWebsite(e.target.value);
          }}
        />
      </div>

      {siteKey && <div ref={widgetContainer} />}

      <p className="text-las-szary text-[15px] leading-normal">
        Twoje imię, adres e-mail i wiadomość zapisujemy, żeby odpowiedzieć; usuwamy je po 12 miesiącach.
      </p>

      <div role="alert">
        <ServerError message={serverError} />
      </div>

      <Button type="submit" variant="primary" size="pillLg" disabled={pending || !siteKey} className="w-full">
        {pending ? (
          <span className="flex items-center gap-2">
            <span
              className="border-owies/30 border-t-owies size-4 animate-spin rounded-full border-2"
              aria-hidden="true"
            />
            Wysyłanie…
          </span>
        ) : (
          "Wyślij wiadomość"
        )}
      </Button>
    </form>
  );
}
