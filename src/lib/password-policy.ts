/**
 * The app's password rules, in one place for every form that sets a password
 * (sign-up, the post-reset new-password screen, the password change on
 * `/ustawienia`).
 *
 * Supabase checks the same minimum on its side - `minimum_password_length` in
 * `supabase/config.toml` locally, the Auth → Providers → Email setting in the
 * production dashboard. Change all three together; the client check here only
 * spares the teacher a round trip, it is not the authority.
 */
export const MIN_PASSWORD_LENGTH = 8;

export interface NewPasswordErrors {
  password?: string;
  repeat?: string;
}

/**
 * Validate a new password and its repetition. Returns Polish messages keyed by
 * field; an empty object means the pair is acceptable.
 *
 * The repeat field is checked for a mismatch only once the first field is
 * filled - "the passwords differ" next to an empty first field would point the
 * teacher at the wrong field.
 */
export function validateNewPassword(password: string, repeat: string): NewPasswordErrors {
  const errors: NewPasswordErrors = {};

  if (!password) {
    errors.password = "Podaj nowe hasło";
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków (brakuje jeszcze: ${MIN_PASSWORD_LENGTH - password.length})`;
  }

  if (!repeat) {
    errors.repeat = "Powtórz nowe hasło";
  } else if (password && password !== repeat) {
    errors.repeat = "Hasła nie są takie same";
  }

  return errors;
}

export type PasswordChangeErrors = NewPasswordErrors & { current?: string };

/**
 * Validate the password change on `/ustawienia`: the current password, the new
 * one and its repetition. The new pair follows {@link validateNewPassword}; on
 * top of that the new password must differ from the current one, which spares
 * the teacher the round trip to Supabase's `same_password`.
 *
 * The route's zod schema (`src/pages/api/auth/change-password.ts`) mirrors these
 * rules - this check is a courtesy, the server is the authority.
 */
export function validatePasswordChange(current: string, password: string, repeat: string): PasswordChangeErrors {
  const errors: PasswordChangeErrors = validateNewPassword(password, repeat);

  if (!current) {
    errors.current = "Podaj obecne hasło";
  } else if (password && password === current) {
    errors.password = "Nowe hasło musi się różnić od obecnego";
  }

  return errors;
}
