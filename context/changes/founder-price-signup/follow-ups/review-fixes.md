# Review follow-ups — founder-price-signup

From `reviews/impl-review.md` (2026-10-18). Owner actions the review could not do.

- [ ] **F4 — before merging:** run the manual checks 3.5–3.9 (copy approval, 390/768/1440 px, anonymous signup + repeat → one row, signed-in one click → „Jesteś na liście”, keyboard and announcement) and 4.5–4.6 (read pkt 2.8 and the changed sentences, including the reworded summary bullet from F1; the consent link lands on pkt 2.8). Tick them in `plan.md` Progress.
- [ ] **F5 — in the merge commit:** set `PRIVACY_PUBLISHED_ON` in `src/lib/legal.ts` to the actual merge day (now `2026-10-19`).
- [ ] **5.3 — after merging:** `npx supabase db push`, one signup on `https://temio.pl/cennik`, check the row in the dashboard and delete it.
