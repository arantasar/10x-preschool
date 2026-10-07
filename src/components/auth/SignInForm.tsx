import React, { useState } from "react";
import { emailError } from "@/lib/email-check";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { SubmitButton } from "@/components/auth/SubmitButton";
import { ServerError } from "@/components/auth/ServerError";

interface Props {
  serverError?: string | null;
}

export default function SignInForm({ serverError }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  function validate() {
    const next: typeof errors = {};
    const emailProblem = emailError(email);
    if (emailProblem) {
      next.email = emailProblem;
    }
    if (!password) {
      next.password = "Podaj hasło";
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

  return (
    <form method="POST" action="/api/auth/signin" className="space-y-4" onSubmit={handleSubmit} noValidate>
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
        placeholder="Twoje hasło"
        error={errors.password}
        endContent={
          <PasswordToggle
            visible={showPassword}
            onToggle={() => {
              setShowPassword(!showPassword);
            }}
          />
        }
      />

      {/* Below the field rather than beside its label (mock-up 02): FormField's
          label is plain text, and a link inside it would change the field's
          accessible name "Hasło". */}
      <p className="-mt-2 text-right">
        <a href="/auth/forgot-password" className="text-mech hover:text-las text-[15px] font-bold underline">
          Nie pamiętasz hasła?
        </a>
      </p>

      <ServerError message={serverError} />

      <SubmitButton pendingText="Logowanie...">Zaloguj się</SubmitButton>
    </form>
  );
}
