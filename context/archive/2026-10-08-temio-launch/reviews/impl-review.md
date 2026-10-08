<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Temio Launch

- **Plan**: context/changes/temio-launch/plan.md
- **Scope**: Phases 1–5 of 5
- **Date**: 2026-10-08
- **Verdict**: NEEDS ATTENTION → all findings fixed on `fix/temio-launch-review`
- **Findings**: 0 critical · 4 warnings · 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

The code matched every contract bullet in the plan. All automated criteria (1.1–5.1) passed at review time: 640 tests, lint, build, sitemap, NS, MX/SPF, 200, both 301s, DS + `ad`, Resend DKIM/MX and DMARC. Manual rows were confirmed by Janusz in the session; 3.5 and 4.9 were also checked with curl against both preview hosts.

Known deviations, assessed as sound: `LEGACY_HOST` / `CANONICAL_ORIGIN` declared `access: "secret"` (public server vars are inlined at build time); `const wordmark = "temio"` (Prettier); footer copyright on one line; the 21 → 24 count test; `dns-inventory.md` as a post-move snapshot.

## Findings

### F1 — Reset request is an account-existence oracle if the built-in sender comes back

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/forgot-password.ts:39, src/lib/auth-error-messages.ts
- **Detail**: `email_address_not_authorized` was not in `SILENT_RESET_REQUEST_ERRORS`. The built-in sender only tries to mail an existing user, so a registered non-team address got the error while an unknown one got "sent". Pre-existing; unreachable with Resend; returns only under the mail rollback.
- **Fix A ⭐ Recommended**: add the code to the silent set for the reset route.
- **Fix B**: leave it and note the risk in Migration Notes.
- **Decision**: FIXED via Fix A — silenced on the reset request (logged as `auth.reset_request.silenced`), still shown on sign-up; test added.

### F2 — "Rollback: remove this block" overstates what it undoes

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: wrangler.jsonc:24, src/lib/canonical-host.ts:10-11
- **Detail**: Browsers cache 301/308 indefinitely, so removing `vars` only stops new redirects. The "308 keeps the method and body" promise does not hold end to end: a stale-tab POST gets 403 from `checkOrigin` (or CORS for `fetch`), and the session belongs to the old host anyway.
- **Fix**: reword both comments and the plan's Migration Notes.
- **Decision**: FIXED

### F3 — dns-inventory.md stale and incomplete

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/temio-launch/dns-inventory.md
- **Detail**: Said DNSSEC "not yet enabled" while 4.6 was ticked. DKIM/SRV rows were missing, OVH's DNSSEC state before the move was "not recorded", and the Resend records were not listed.
- **Fix**: update DNSSEC history, add DKIM/SRV (none), add the Resend records.
- **Decision**: FIXED (the verbatim OVH export is still a placeholder; only Janusz can supply it)

### F4 — Activation ignores the landing hasło and lands on the month

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/auth/confirm.ts:66
- **Detail**: `signin.ts:40-41` lands on `/plan/week` when `PENDING_TOPIC_COOKIE` holds a hasło; activation always went to `/plan/month`. A gap in the plan, not implementation drift.
- **Fix**: apply the same rule in the `type=email` branch, with tests.
- **Decision**: FIXED

### F5 — CLAUDE.md says `wrangler.jsonc` only names the worker

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: CLAUDE.md:97
- **Detail**: The file now also carries the redirect `vars`.
- **Fix**: reword the sentence.
- **Decision**: FIXED

### F6 — Route test gaps; malformed CANONICAL_ORIGIN throws

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/confirm.test.ts, src/lib/canonical-host.ts:23
- **Detail**: Untested: `config_missing` with `type=email`, and an empty `error.code` → `connection_failed`. `new URL()` on a malformed origin threw, so every legacy-host request would return 500.
- **Fix**: two route tests; `try/catch` → `null` in `canonicalRedirect`, with tests (including that only the origin of `CANONICAL_ORIGIN` is used).
- **Decision**: FIXED

### F7 — /auth/confirm parameter classification duplicated in GET and POST

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/auth/confirm.astro:31-37, src/pages/api/auth/confirm.ts:34-39
- **Detail**: The same rule was written twice, and the GET copy was untested (the repo has no `.astro` page tests).
- **Fix**: extract `invalidConfirmRedirect(type)` into `src/lib/auth-confirm.ts` with a test; use it in both.
- **Decision**: FIXED

### F8 — Support address hardcoded next to SUPPORT_EMAIL

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/auth-error-messages.ts
- **Detail**: `kontakt@temio.pl` appeared literally while `src/lib/support-contact.ts` exports `SUPPORT_EMAIL`.
- **Fix**: interpolate `SUPPORT_EMAIL`; update the test header comment.
- **Decision**: FIXED

### F9 — Dead token and a process deviation

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/styles/global.css:168; PR #42
- **Detail**: `--radius-logo` had no users after the SVG logo. Separately, the Phase 4 `vars` commit rode in PR #42 with Phases 1–3 instead of a separate PR, so 3.6 ("workers.dev shows Temio") could not be checked literally, because the merge switched the redirect on at the same time. Nothing broke.
- **Fix**: remove the token; record the process deviation here.
- **Decision**: FIXED (token removed; deviation recorded)
