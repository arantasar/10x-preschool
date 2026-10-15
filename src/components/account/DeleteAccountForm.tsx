import React, { useRef, useState } from "react";
import { FormField } from "@/components/auth/FormField";
import { PasswordToggle } from "@/components/auth/PasswordToggle";
import { ServerError } from "@/components/auth/ServerError";
import { useConfirmDialog } from "@/components/hooks/useConfirmDialog";
import { Button } from "@/components/ui/button";
import { deleteAccountConfirmation } from "@/lib/confirmations";

interface Props {
  email?: string;
  serverError?: string | null;
}

/**
 * „Usuń konto” on `/ustawienia`. A native POST to `/api/auth/delete-account`;
 * the island only validates, then asks the danger window, then submits.
 *
 * The window is asynchronous and does not freeze the page, so the lock is
 * checked before the question and again after the answer, and taken before
 * `form.submit()` - a second Enter while the request is in flight sends nothing.
 */
export default function DeleteAccountForm({ email, serverError }: Props) {
  const [current, setCurrent] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  // A ref as well as state: the second check runs after an `await`, where the
  // state captured by this render is stale.
  const submittingRef = useRef(false);
  const { confirm, dialog } = useConfirmDialog();
  const isLocked = () => submittingRef.current;

  async function handleSubmit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;

    if (current.length === 0) {
      setError("Wpisz obecne hasło, aby usunąć konto.");
      return;
    }

    if (isLocked()) return;
    if (!(await confirm(deleteAccountConfirmation(email ?? "")))) {
      return;
    }
    if (isLocked()) return;

    submittingRef.current = true;
    setSubmitting(true);
    form.submit();
  }

  return (
    <>
      <form
        method="POST"
        action="/api/auth/delete-account"
        className="flex flex-col gap-[18px]"
        onSubmit={(e) => void handleSubmit(e)}
        noValidate
      >
        {/* Tells a password manager which saved account this is. No `name`: the
          route never reads an address from the form, only from the session. */}
        {email && <input type="email" autoComplete="username" value={email} readOnly hidden />}

        <div className="min-[600px]:max-w-[360px]">
          <FormField
            id="current-delete"
            name="current"
            label="Obecne hasło"
            type={showCurrent ? "text" : "password"}
            autoComplete="current-password"
            value={current}
            onChange={(v) => {
              setCurrent(v);
              setError(undefined);
            }}
            error={error}
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

        <ServerError message={serverError} />

        <div>
          <Button type="submit" variant="dangerPill" size="pill" disabled={submitting}>
            {submitting ? "Usuwanie..." : "Usuń konto…"}
          </Button>
        </div>
      </form>
      {dialog}
    </>
  );
}
