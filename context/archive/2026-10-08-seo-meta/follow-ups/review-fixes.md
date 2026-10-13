# Review follow-ups: seo-meta

From `reviews/impl-review.md` (2026-10-08).

- [x] **Before merge (F1):** run manual checks 1.6 (view-source of `/`, `/auth/signin`, `/auth/confirm`, `/plan/month`), 1.7 (approve `SITE_DESCRIPTION` wording in `src/lib/seo.ts`) and 2.7 (`X-Robots-Tag` locally with and without `CANONICAL_ORIGIN`). The merge deploys to production.
- [x] **PR description (F3):** mention that 190a036 (design-package refresh under `context/foundation/design/`) rides on this branch.
- [ ] **During 2.10 (F2):** after submitting the sitemap in Google Search Console, check the page index for `/plan`, `/plan/month`, `/plan/week` (published by the temio-launch sitemap). `robots.txt` now disallows `/plan`, so Google cannot re-crawl them to see the redirect / `noindex`; remove any that appear with the Removals tool.
