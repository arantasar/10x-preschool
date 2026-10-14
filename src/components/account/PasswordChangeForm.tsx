import React, { useState } from "react";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";
import { MIN_PASSWORD_LENGTH, validatePasswordChange, type PasswordChangeErrors } from "@/lib/password-policy";

interface Props {
  serverError?: string | null;
}

/**
 * „Zmień hasło” on `/ustawienia`. A native POST to `/api/auth/change-password`;
 * the island only validates first, with the same parts as `NewPasswordForm`.
 */
export default function PasswordChangeForm({ serverError }: Props) {
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showRepeat, setShowRepeat] = useState(false);
  const [errors, setErrors] = useState<PasswordChangeErrors>({});

  function clearError(field: keyof PasswordChangeErrors) {
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    const next = validatePasswordChange(current, password, repeat);
    setErrors(next);
    if (Object.keys(next).length > 0) {
      e.preventDefault();
    }
  }

  // The same running hint as sign-up and the reset form.
  const passwordHint =
    password.length > 0 && password.length < MIN_PASSWORD_LENGTH
      ? `Brakuje jeszcze znaków: ${MIN_PASSWORD_LENGTH - password.length}`
      : `Co najmniej ${MIN_PASSWORD_LENGTH} znaków`;

  return (
    <form
      method="POST"
      action="/api/auth/change-password"
      className="grid grid-cols-1 gap-x-5 gap-y-[18px] min-[600px]:grid-cols-2"
      onSubmit={handleSubmit}
      noValidate
    >
      <div className="min-[600px]:col-span-2 min-[600px]:max-w-[360px]">
        <FormField
          id="current"
          label="Obecne hasło"
          type={showCurrent ? "text" : "password"}
          autoComplete="current-password"
          value={current}
          onChange={(v) => {
            setCurrent(v);
            clearError("current");
          }}
          error={errors.current}
          endContent={
            <PasswordToggle
              visible={showCurrent}
              onToggle={() => {
                setShowCurrent(!showCurrent);
              }}
            />
          }
        />
      </div>

      <FormField
        id="password"
        label="Nowe hasło"
        type={showPassword ? "text" : "password"}
        autoComplete="new-password"
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
        autoComplete="new-password"
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

      {serverError && (
        <div className="min-[600px]:col-span-2">
          <ServerError message={serverError} />
        </div>
      )}

      <div className="flex flex-col-reverse items-stretch gap-4 pt-1 min-[600px]:col-span-2 min-[600px]:flex-row min-[600px]:items-center min-[600px]:justify-between">
        <a
          href="/auth/forgot-password"
          className="text-mech hover:text-las py-2.5 text-[15px] font-bold underline underline-offset-4"
        >
          Nie pamiętasz obecnego hasła?
        </a>
        <div>
          <SubmitButton pendingText="Zapisywanie...">Zapisz nowe hasło</SubmitButton>
        </div>
      </div>
    </form>
  );
}
