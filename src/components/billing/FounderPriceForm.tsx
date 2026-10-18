import React, { useEffect, useRef, useState } from "react";
import { FormField } from "@/components/auth/FormField";
import { ServerError } from "@/components/auth/ServerError";
import { useTurnstile } from "@/components/hooks/useTurnstile";
import { Button } from "@/components/ui/button";
import { emailError } from "@/lib/email-check";
import {
  FOUNDER_PRICE_BOT_ACTION,
  FOUNDER_PRICE_EMAIL_MAX,
  FOUNDER_PRICE_LISTED_NOTE,
  FOUNDER_PRICE_PRIVACY_HREF,
  FOUNDER_PRICE_WIDGET_FAILED_MESSAGE,
  founderPriceErrorMessage,
  type FounderPricePeriod,
} from "@/lib/founder-price";
import { BILLING_INPUT_NAME } from "@/lib/pricing";

/**
 * The founder-price sign-up for a visitor without an account. A signed-in
 * teacher never sees it: her account has the founder price by right (FR-036),
 * and `/cennik` says so instead.
 */
interface Props {
  /** `undefined` when the deployment has no Turnstile key: the form says it is unavailable. */
  siteKey?: string;
}

/** The period the page's `BillingToggle` shows right now; yearly by default. */
function currentPeriod(): FounderPricePeriod {
  const checked = document.querySelector<HTMLInputElement>(`input[name="${BILLING_INPUT_NAME}"]:checked`);
  return checked?.value === "monthly" ? "monthly" : "yearly";
}

export default function FounderPriceForm({ siteKey }: Props) {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [serverError, setServerError] = useState<string | null>(
    siteKey ? null : founderPriceErrorMessage("config_missing"),
  );
  const [pending, setPending] = useState(false);
  // The address that is now on the list - set after a successful sign-up.
  const [listedAs, setListedAs] = useState<string | null>(null);
  const {
    containerRef,
    tokenFor,
    reset: resetWidget,
    remove: removeWidget,
    widgetFailed,
  } = useTurnstile({
    siteKey,
    action: FOUNDER_PRICE_BOT_ACTION,
  });

  const confirmation = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Moved to the confirmation, so a keyboard or screen-reader user lands on it.
    if (listedAs) confirmation.current?.focus();
  }, [listedAs]);

  if (listedAs) {
    return (
      <div ref={confirmation} role="status" tabIndex={-1} className="flex flex-col gap-2 outline-none">
        <p className="font-display text-las text-[26px] leading-tight">
          Gotowe — <span className="break-all">{listedAs}</span> jest na liście.
        </p>
        <p className="text-las-szary text-[17px] leading-relaxed">{FOUNDER_PRICE_LISTED_NOTE}</p>
      </div>
    );
  }

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || !siteKey || widgetFailed) return;
    const error = emailError(email);
    setFieldError(error);
    if (error) return;

    setPending(true);
    setServerError(null);
    let code = "unknown";
    try {
      const turnstileToken = await tokenFor();
      const response = await fetch("/api/founder-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          period: currentPeriod(),
          website,
          turnstileToken,
        }),
      });
      const body = (await response.json()) as { ok?: boolean; error?: string };
      if (response.ok && body.ok) {
        // The confirmation replaces the form, container and all.
        removeWidget();
        setListedAs(email.trim().toLowerCase());
        setPending(false);
        return;
      }
      code = body.error ?? code;
    } catch {
      // Network failure or a non-JSON answer: the generic message below.
    }
    // The address stays typed; only the token is spent.
    resetWidget();
    setServerError(founderPriceErrorMessage(code));
    setPending(false);
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
      <FormField
        id="founder-email"
        name="email"
        type="email"
        label="E-mail"
        value={email}
        onChange={(value) => {
          setEmail(value);
          if (fieldError) setFieldError(undefined);
        }}
        placeholder="imie@przedszkole.pl"
        maxLength={FOUNDER_PRICE_EMAIL_MAX}
        autoComplete="email"
        error={fieldError}
      />

      {/* The honeypot: invisible and unreachable for people, filled by naive bots. */}
      <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
        <label htmlFor="founder-website">Strona internetowa</label>
        <input
          id="founder-website"
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

      {siteKey && <div ref={containerRef} />}

      <div role="alert">
        <ServerError message={widgetFailed ? FOUNDER_PRICE_WIDGET_FAILED_MESSAGE : serverError} />
      </div>

      <Button
        type="submit"
        variant="primary"
        size="pillLg"
        disabled={pending || !siteKey || widgetFailed}
        className="w-full"
      >
        {pending ? (
          <span className="flex items-center gap-2">
            <span
              className="border-owies/30 border-t-owies size-4 animate-spin rounded-full border-2"
              aria-hidden="true"
            />
            Zapisywanie…
          </span>
        ) : (
          "Zarezerwuj cenę założycielską"
        )}
      </Button>

      {/* The button is the consent: the sentence sits right by it. */}
      <p className="text-las-szary text-[15px] leading-normal">
        Zapisując się, zgadzasz się, żebyśmy napisali na ten adres w sprawie ceny założycielskiej i startu płatności.
        Zgodę wycofasz w każdej chwili, pisząc do nas.{" "}
        <a
          href={FOUNDER_PRICE_PRIVACY_HREF}
          className="text-las hover:text-mech font-bold underline underline-offset-4"
        >
          Polityka prywatności
        </a>
      </p>
    </form>
  );
}
