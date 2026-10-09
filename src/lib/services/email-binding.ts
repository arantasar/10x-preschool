import { env } from "cloudflare:workers";

/**
 * The only module that touches the Worker's `send_email` binding (`EMAIL` in
 * `wrangler.jsonc`). Kept this small because Vitest runs without the Cloudflare
 * adapter and cannot resolve `cloudflare:workers`: route tests mock this file
 * whole, so the import above never runs under test.
 */

/** The slice of Cloudflare's `SendEmail` this app uses. */
export interface OutgoingEmail {
  to: string;
  from: { email: string; name: string };
  replyTo: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  send(message: OutgoingEmail): Promise<unknown>;
}

function isEmailSender(value: unknown): value is EmailSender {
  return typeof value === "object" && value !== null && typeof (value as EmailSender).send === "function";
}

/** `undefined` when the binding is not configured - the caller logs and moves on. */
export function getEmailBinding(): EmailSender | undefined {
  const binding = env.EMAIL;
  return isEmailSender(binding) ? binding : undefined;
}
