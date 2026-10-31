---
change_id: testing-ci-gates-e2e
title: Test rollout Phase 4 — CI quality gates and critical-path e2e
status: impl_reviewed
created: 2026-10-28
updated: 2026-10-31
archived_at: null
---

## Notes

Open a change folder for rollout Phase 4 of context/foundation/test-plan.md: "Bramki jakości w CI + e2e ścieżki krytycznej".
Risks covered: cross-cutting (przekrojowe) — the floor before a merge to `master`, which deploys straight to production via Cloudflare Workers Builds with no approval step. Test types planned: gates + e2e.
Risk response intent:
- Critical-path e2e: prove the flow login → day → topic → generation → edit → approval („Zatwierdź”) stays unbroken, with the LLM provider stubbed at the network boundary (never internal modules), and that a broken step fails the run rather than passing on a vacuous assertion.
- CI gates: prove that a regression in unit/integration, DB (pgTAP + route .db tests) or the critical-path e2e shows a red check on the PR before merge; today every gate is advisory (no branch protection on a private free-plan repo — decision 2026-08-30), so the human reading checks is the last gate — the phase must make that signal impossible to miss, not pretend to enforce it.
- Existing local-only e2e (risks #4, #7, plus later specs) needs local Supabase + a service key in .env.e2e; decide whether and how they run in CI.
- Optional per §5: post-edit hook (recommended after Phase 4), post-deploy smoke (optional).
Branch first: CLAUDE.md requires a feature branch before the first commit (currently on master).
After creating the folder, follow the downstream continuation rule.
