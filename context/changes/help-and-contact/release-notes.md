# help-and-contact — production setup before merge

Merging to `master` releases to production (Workers Builds). Everything below must be done **before** the merge. Write one line per step with its result and date (Progress row 3.4).

| Step | What to do | Result |
| --- | --- | --- |
| Email Sending | `npx wrangler email sending enable temio.pl` (or the dashboard). Check `dig TXT cf-bounce.temio.pl`, `dig TXT cf-bounce._domainkey.temio.pl` and `dig MX cf-bounce.temio.pl`. Make sure `dig MX temio.pl` still points at OVH. Add the owner's inbox as a verified destination address. | _pending_ |
| Turnstile | Create a widget for `temio.pl` (managed or invisible), plus the Workers preview host if previews use the form. Note the site key and the secret key. | _pending_ |
| Worker secrets | `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` and `CONTACT_TO` (the verified inbox), in the dashboard or with `npx wrangler secret put`. | _pending_ |
| Supabase | `npx supabase db push`. In the dashboard, confirm that `pg_cron` is enabled and that the `contact-messages-retention` job is listed (`select jobname, schedule from cron.job`). | _pending_ |

After the deploy: send a real message from `https://temio.pl/kontakt` and check that it arrives in the inbox (rows 3.5–3.7), that replying reaches the sender, that the row exists in the table, and that mail to `kontakt@temio.pl` still arrives at OVH.
