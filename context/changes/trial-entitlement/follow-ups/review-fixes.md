# Review follow-ups — trial-entitlement

From `reviews/impl-review.md` (2026-10-18).

- [x] Run the local manual checks before merging: 1.8, 2.4, 2.5 (row deleted in Studio), 2.6, 2.7.
- [x] At merge (PR #55, 6529a28): 3.4 `npx supabase db push` (including the `account_entitlements_set_updated_at` trigger), 3.5 a test sign-up on temio.pl, 3.6 policy 1.3.
- [x] 3.7 tester rows — moved to S-24 (decision 2026-10-18), recorded in roadmap.md under S-24 Unknowns, together with checking that the testers' `fair_use_overrides.valid_until` does not go past 2027-01-31.
- [ ] `/10x-archive`: set S-23 to `done` in roadmap.md (block and table) — F6.
