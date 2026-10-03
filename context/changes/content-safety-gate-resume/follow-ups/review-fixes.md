# Follow-ups from the implementation review (2026-10-03)

- [ ] **The review fixes have not been run live.** Push to PR #40 → job `content-safety-gate` runs the full matrix (the judge changed), ~0.40 USD. Record the result in `gate-runs.md` (lessons.md §3: every change to the judge gets a new gate run before merge).
- [ ] **Manual Progress rows** 1.3, 1.4, 2.5, 3.4–3.6, 4.6–4.8: confirm and tick them before merging.
- [ ] **SUPABASE_URL / SUPABASE_KEY are missing from the repo secrets**, while the `ci` job (build) passes them. Not this change's problem, but `gate-runs.md` flags it.
- [ ] (optional) Block-level caching of the rubric (F4 Fix B), only if the judge cost becomes a problem again.
