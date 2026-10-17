import React, { useState } from "react";
import { CircleAlert } from "lucide-react";
import { emailError } from "@/lib/email-check";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { PRIVACY_PATH, TERMS_ACCEPTED_VALUE, TERMS_PATH } from "@/lib/legal";
import { MIN_PASSWORD_LENGTH } from "@/lib/password-policy";

interface Props {
  serverError?: string | null;
}

export default function SignUpForm({ serverError }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [errors, setErrors] = useState<{
    email?: string;
    password?: string;
    confirmPassword?: string;
    terms?: string;
  }>({});

  function validate() {
    const next: typeof errors = {};

    const emailProblem = emailError(email);
    if (emailProblem) {
      next.email = emailProblem;
    }

    if (!password) {
      next.password = "Podaj hasło";
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      next.password = `Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków`;
    }

    if (!confirmPassword) {
      next.confirmPassword = "Potwierdź hasło";
    } else if (password !== confirmPassword) {
      next.confirmPassword = "Hasła nie są takie same";
    }

    if (!termsAccepted) {
      next.terms = "Zaakceptuj Regulamin, aby założyć konto";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function clearError(field: keyof typeof errors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    if (!validate()) {
      e.preventDefault();
    }
  }

  // What the form actually enforces (`MIN_PASSWORD_LENGTH`), not the design
  // package's placeholder - and while typing, how far off the minimum still is.
  const passwordHint =
    password.length > 0 && password.length < MIN_PASSWORD_LENGTH
      ? `Brakuje jeszcze znaków: ${MIN_PASSWORD_LENGTH - password.length}`
      : `Co najmniej ${MIN_PASSWORD_LENGTH} znaków`;

  return (
    <form method="POST" action="/api/auth/signup" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="email"
        type="email"
        label="Adres e-mail"
        value={email}
        onChange={(v) => {
          setEmail(v);
          clearError("email");
        }}
        placeholder="imie@przedszkole.pl"
        error={errors.email}
      />

      <FormField
        id="password"
        label="Hasło"
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={(v) => {
          setPassword(v);
          clearError("password");
        }}
        placeholder={`Min. ${MIN_PASSWORD_LENGTH} znaków`}
        error={errors.password}
        hint={passwordHint}
        endContent={
          <PasswordToggle
            visible={showPassword}
            onToggle={() => {
              setShowPassword(!showPassword);
            }}
          />
        }
      />

      <FormField
        id="confirmPassword"
        name="confirmPassword"
        label="Powtórz hasło"
        type={showConfirmPassword ? "text" : "password"}
        value={confirmPassword}
        onChange={(v) => {
          setConfirmPassword(v);
          clearError("confirmPassword");
        }}
        placeholder="Wpisz hasło ponownie"
        error={errors.confirmPassword}
        endContent={
          <PasswordToggle
            visible={showConfirmPassword}
            onToggle={() => {
              setShowConfirmPassword(!showConfirmPassword);
            }}
          />
        }
      />

      {/* Regulamin § 5 ust. 1. Unchecked, the browser sends no `terms` at all and
          the route refuses; the links open in a new tab so the typed fields stay. */}
      <div>
        <div className="flex items-start gap-3">
          <input
            id="terms"
            name="terms"
            type="checkbox"
            value={TERMS_ACCEPTED_VALUE}
            checked={termsAccepted}
            onChange={(e) => {
              setTermsAccepted(e.target.checked);
              clearError("terms");
            }}
            aria-invalid={errors.terms ? true : undefined}
            aria-describedby={errors.terms ? "terms-note" : undefined}
            className="accent-las mt-0.5 size-5 shrink-0"
          />
          <label htmlFor="terms" className="text-las text-[15px] leading-snug">
            Akceptuję{" "}
            <a
              href={TERMS_PATH}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold underline underline-offset-4"
            >
              Regulamin
            </a>
            . Wiem, jak Temio przetwarza dane —{" "}
            <a
              href={PRIVACY_PATH}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold underline underline-offset-4"
            >
              Polityka prywatności
            </a>
            .
          </label>
        </div>
        {errors.terms && (
          <p id="terms-note" className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-red-800">
            <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
            {errors.terms}
          </p>
        )}
      </div>

      <ServerError message={serverError} />

      <SubmitButton pendingText="Tworzenie konta...">Załóż konto</SubmitButton>
    </form>
  );
}
