---
change_id: temio-launch
title: Temio launch
status: archived
created: 2026-10-08
updated: 2026-10-08
archived_at: 2026-10-08T19:18:58Z
---

## Notes

Decisions gathered on 2026-10-08 (Janusz):

- **Name and design:** the app becomes **Temio**. The brand package is in `context/foundation/design/` (it replaced the 10xPreschool handoff in commit 4529666). It is a rebrand, not a redesign: all 16 screen layouts are unchanged. What changes is the name, the leaf logo (`design/brand/`, `Logo.astro` with `variant` and `markOnly`), the icons in `public/` and the copyright line in the footer.
- **Domain:** `temio.pl`. DNS and mail are hosted at **OVHcloud**. A Workers Custom Domain needs the zone in Cloudflare, so the nameservers move from OVH to Cloudflare. **Before the move, the OVH mail records (MX, SPF and the rest) must be copied**, or `kontakt@temio.pl` stops receiving mail.
- **Mail:** there is one mailbox, `kontakt@temio.pl` (OVH; the plan includes only one address). Auth mail goes through **Resend** (account exists, not configured), sent as `Temio <kontakt@temio.pl>`, so a teacher's reply lands in that mailbox. Resend's SPF and MX records sit on the `send.temio.pl` subdomain, so they do not collide with OVH mail on the apex domain.
- **Why it's urgent:** production currently sends through Supabase's built-in sender (`mail.app.supabase.io`). It delivers only to members of the project's team, so other teachers receive neither reset nor sign-up mails. Follow-up from `context/archive/2026-10-03-password-reset/follow-ups/review-fixes.md`.
- **In code:**
  - the name in about 10 places (Layout, Logo, AppHeader, index, OpenRouter headers, compare-models.sh, recovery template and its subject, package.json, CLAUDE.md);
  - `SUPPORT_EMAIL` → `kontakt@temio.pl`;
  - a Polish sign-up confirmation template (today Supabase's default English one);
  - a mapped `email_address_not_authorized` code.
- **Not in scope:** renaming the `10x-preschool` Worker in `wrangler.jsonc`. The name is internal, and changing it creates a new Worker and breaks the Workers Builds connection.
