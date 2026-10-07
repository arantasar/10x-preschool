import React, { useState } from "react";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { MIN_PASSWORD_LENGTH, validateNewPassword, type NewPasswordErrors } from "@/lib/password-policy";

interface Props {
  serverError?: string | null;
}

export default function NewPasswordForm({ serverError }: Props) {
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showRepeat, setShowRepeat] = useState(false);
  const [errors, setErrors] = useState<NewPasswordErrors>({});

  function clearError(field: keyof NewPasswordErrors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    const next = validateNewPassword(password, repeat);
    setErrors(next);
    if (Object.keys(next).length > 0) {
      e.preventDefault();
    }
  }

  // The same running hint as sign-up: what the form enforces, and while typing,
  // how far off the minimum still is.
  const passwordHint =
    password.length > 0 && password.length < MIN_PASSWORD_LENGTH
      ? `Brakuje jeszcze znaków: ${MIN_PASSWORD_LENGTH - password.length}`
      : `Co najmniej ${MIN_PASSWORD_LENGTH} znaków`;

  return (
    <form method="POST" action="/api/auth/update-password" className="space-y-4" onSubmit={handleSubmit} noValidate>
      <FormField
        id="password"
        label="Nowe hasło"
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={(v) => {
          setPassword(v);
          clearError("password");
        }}
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
        id="repeat"
        label="Powtórz nowe hasło"
        type={showRepeat ? "text" : "password"}
        value={repeat}
        onChange={(v) => {
          setRepeat(v);
          clearError("repeat");
        }}
        error={errors.repeat}
        endContent={
          <PasswordToggle
            visible={showRepeat}
            onToggle={() => {
              setShowRepeat(!showRepeat);
            }}
          />
        }
      />

      <ServerError message={serverError} />

      <SubmitButton pendingText="Zapisywanie...">Zapisz nowe hasło</SubmitButton>
    </form>
  );
}
