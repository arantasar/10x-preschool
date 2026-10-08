# Review follow-ups: password-reset

From `reviews/impl-review.md` (2026-10-07).

- [x] **F2: manual checks before merge.** 4.6 and 4.7 done on 2026-10-07; 1.6–3.11 and 4.5 left unchecked. Run Progress items 1.6–3.11 and 4.5 locally (local Supabase was already restarted with the new `config.toml`). Complete **4.6 in the Supabase dashboard before merging to `master`**, which deploys. That includes the new step from F1: Auth → Providers → Email → **Secure password change: on**. 4.7 comes after deploy.

- [x] **Custom SMTP is not configured in production** (found 2026-10-07: the reset mail came from `mail.app.supabase.io`). The plan assumed it was. Supabase's built-in sender delivers **only to members of the project's team** (anyone else gets `email_address_not_authorized`), sends a few mails per hour, and has no SLA. Until custom SMTP is set up, teachers outside the team receive neither reset nor sign-up mails. Owner: Janusz. Needs a separate change (sender domain, SMTP provider, SPF/DKIM/DMARC). **Done in `temio-launch` (2026-10-08):** Supabase sends through Resend (EU) as `Temio <kontakt@temio.pl>`; SPF, DKIM and DMARC pass, and a non-team address received both the reset and the sign-up mail.
