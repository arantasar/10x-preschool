/**
 * The client-side e-mail check shared by every auth form that asks for an
 * address (sign-in, sign-up, forgot-password), so the three cannot drift apart
 * in what they accept or how they word the refusal.
 *
 * Deliberately loose: it only catches typos the teacher can see. The server
 * (zod in the API route) and Supabase are the authority on what an address is.
 */
export function emailError(email: string): string | undefined {
  if (!email.trim()) {
    return "Podaj adres e-mail";
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "Podaj poprawny adres e-mail";
  }
  return undefined;
}
