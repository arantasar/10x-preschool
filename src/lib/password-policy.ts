/**
 * The app's password rules, in one place for every form that sets a password
 * (sign-up, the post-reset new-password screen).
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
