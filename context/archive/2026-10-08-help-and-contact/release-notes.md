# help-and-contact — production setup before merge

Merging to `master` releases to production (Workers Builds). Everything below must be done **before** the merge. Write one line per step with its result and date (Progress row 3.4).

| Step | What to do | Result |
| --- | --- | --- |
| Email Sending | `npx wrangler email sending enable temio.pl` (or the dashboard). Check `dig TXT cf-bounce.temio.pl`, `dig TXT cf-bounce._domainkey.temio.pl` and `dig MX cf-bounce.temio.pl`. Make sure `dig MX temio.pl` still points at OVH. Add the owner's inbox as a verified destination address. | Done 2026-10-13. Enabled with `wrangler@4.150 email sending enable temio.pl` (4.100 got a 404 from an old API path). The `cf-bounce` MX ×3, SPF and DKIM records resolve on 1.1.1.1 and 8.8.8.8. Root MX still points at OVH (`mx0–3.mail.ovh.net`). `_dmarc` kept at `p=none` (Cloudflare suggested `p=reject` and it was not applied). Destination `janusz.guzowski@gmail.com` verified at 17:02 UTC. |
| Turnstile | Create a widget for `temio.pl` (managed or invisible), plus the Workers preview host if previews use the form. Note the site key and the secret key. | Done 2026-10-13. Managed widget for `temio.pl`, created by Janusz. |
| Worker secrets | `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` and `CONTACT_TO` (the verified inbox), in the dashboard or with `npx wrangler secret put`. | `TURNSTILE_SITE_KEY` and `CONTACT_TO` (`janusz.guzowski@gmail.com`) set on 2026-10-13. `TURNSTILE_SECRET_KEY` set by Janusz on 2026-10-13; all three are listed in `wrangler secret list`. |
| Supabase | `npx supabase db push`. In the dashboard, confirm that `pg_cron` is enabled and that the `contact-messages-retention` job is listed (`select jobname, schedule from cron.job`). | Done 2026-10-13. `db push` applied `20261009120000_contact_messages.sql` (Postgres notice: one policy name truncated to 63 characters, which is harmless). `cron.job` lists `contact-messages-retention`, `17 3 * * *`, active. |

After the deploy: send a real message from `https://temio.pl/kontakt` and check that it arrives in the inbox (rows 3.5–3.7), that replying reaches the sender, that the row exists in the table, and that mail to `kontakt@temio.pl` still arrives at OVH.
