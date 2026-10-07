# Review follow-ups: password-reset

From `reviews/impl-review.md` (2026-10-07).

- [ ] **F2: manual checks before merge.** Run Progress items 1.6–3.11 and 4.5 locally (local Supabase was already restarted with the new `config.toml`). Complete **4.6 in the Supabase dashboard before merging to `master`**, which deploys. That includes the new step from F1: Auth → Providers → Email → **Secure password change: on**. 4.7 comes after deploy.
