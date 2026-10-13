<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Help and Contact (S-19)

- **Plan**: context/changes/help-and-contact/plan.md
- **Scope**: Phases 1–3 of 3 (full plan)
- **Date**: 2026-10-09
- **Verdict**: NEEDS ATTENTION. After triage every finding is FIXED (commit `88e1556`).
- **Findings**: 0 critical, 3 warnings, 6 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Evidence

### Automated criteria, re-run on HEAD before triage

- `npx supabase db reset`: passes.
- pgTAP: 146 tests.
- Routes against the local database (db tier): 10 tests.
- `npm test`: 717 tests.
- `npm run lint` and `npm run build`: pass.
- Grep gate 2.4 returns 0 and gate 2.5 returns 1, as expected.
- E2E: 29/29 on the second run. The first run failed in `auth.setup` because a leftover dev server collided with it.

### Re-run after triage

- `npm test`: 725 tests.
- Lint and build: pass.
- db tier: 10 tests.
- E2E: 29/29.
- pgTAP: passes with 19 assertions in `contact_messages`.

### Deliberate breaks for the new protections

Each break below made its test go red, and the code was then restored:

- hostname check;
- `waitUntil`;
- body-size cap;
- retention interval.

### Island behaviour with Turnstile blocked

Checked with a one-off Playwright script: the message names `kontakt@temio.pl` and the submit button is disabled.

### Plan drift

There are no MISSING items and no harmful DRIFT. The declared ADAPT deviations and the small differences are benign:

- The question „Kto widzi moje plany?” replaces „Co dzieje się z moimi planami?”.
- The e-mail CHECK also has a lower bound of 3 characters.
- The db-tier test reads through the service client, which a write-only table forces.

### Manual verification

- 1.8–2.11 are confirmed by Janusz.
- 3.4–3.7 wait for the production setup and the merge.

### Out-of-scope candidate

Per-IP rate limiting was not reported as a finding: the plan rules it out in "What We're NOT Doing".

## Findings

### F1 — E2E cleanup could delete the whole table

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/e2e/help-and-contact.spec.ts:29-35
- **Detail**:
  - `stamp` starts as `""`. If the test failed before drawing it, `afterEach` deleted with the service key `like '%%'`, which removes every row in `contact_messages`.
  - E2E-RULES says to clean up by id.
- **Fix**: delete by id, using the rows found by the stamp; skip cleanup when the stamp is empty.
- **Decision**: FIXED (88e1556)

### F2 — When Turnstile fails, the form is a dead end

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/components/contact/ContactForm.tsx:43-56, 109-116, 155-178
- **Detail**: there were three failure paths.
  - **Script fails to load:** the button stayed active, retrying could never succeed, and the page gave no e-mail fallback.
  - **`error-callback`:** it did not release submits that were waiting for a token.
  - **`loadTurnstile`:** it could hang on a script that had already fired.
- **Fix**: a `widgetFailed` state that disables the button and shows a message with `kontakt@temio.pl`.
  - `error-callback` releases waiting submits with `""`.
  - The script load is memoised, so it cannot hang.
  - Strength: a real message always has a way through, either the form or the e-mail address.
  - Tradeoff: about 20 more lines of island state.
  - Confidence: HIGH. Checked with Turnstile blocked.
  - Blind spot: behaviour in Safari with content blockers.
- **Decision**: FIXED (88e1556)

### F3 — E2E written without /10x-e2e, with an ambiguous locator

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/e2e/help-and-contact.spec.ts:43
- **Detail**: `.first()` on the link „Formularz kontaktowy”. An FAQ answer has a link with the same name.
- **Fix**: scope the locator to the region „Nie ma tu Twojego pytania?”.
- **Decision**: FIXED (88e1556)

### F4 — A direct insert with the publishable key bypasses Turnstile

- **Severity**: OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261009120000_contact_messages.sql:46-51
- **Detail**: `grant insert to anon` plus the anon policy means anyone with the publishable key can insert without the route. This is closed today only because `SUPABASE_KEY` is server-only, and that assumption was written down nowhere.
- **Fix A ⭐ Recommended**: write the assumption down in the migration header and in CLAUDE.md.
  - Strength: no behaviour change.
  - Tradeoff: the protection stays a convention.
  - Confidence: HIGH.
  - Blind spot: none significant.
- **Fix B**: insert through a `security definer` function that only the service role can execute.
  - Strength: the guarantee lives in the database.
  - Tradeoff: the app would need the service key, which it deliberately does not have.
  - Confidence: MED.
  - Blind spot: S-22.
- **Decision**: FIXED via Fix A (88e1556)

### F5 — Sending the mail with no time limit holds the visitor's request

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/contact.ts:87-98
- **Detail**: `binding.send` was awaited after the row was already stored.
- **Fix**: hand the send to `locals.cfContext.waitUntil`, and await it only when there is no execution context (tests).
- **Decision**: FIXED (88e1556)

### F6 — The Turnstile check did not verify the hostname

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/bot-check.ts:70-71
- **Detail**: Cloudflare recommends checking both `action` and `hostname`. Separately, a test secret copied into production by mistake would let everything through silently.
- **Fix**: `hostname` is now the request's own host. A testing-key result skips the check, and on the canonical host it logs `contact.bot_check_testing_key`.
- **Decision**: FIXED (88e1556)

### F7 — No size limit on the request body before parsing

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/contact.ts:27
- **Detail**: `request.json()` read the whole body on a public route.
- **Fix**: 32 KB cap, checked on `Content-Length` and on the body that was actually read; anything larger gets 413 `validation_failed`.
- **Decision**: FIXED (88e1556)

### F8 — The client accepts input the server will reject

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/contact/ContactForm.tsx:187-199
- **Detail**: the name and e-mail fields had no `maxLength`; the server limits are 100 and 254.
- **Fix**: an optional `maxLength` prop on `FormField`, set to the limits from `contact-form.ts`.
- **Decision**: FIXED (88e1556)

### F9 — Retention was tested only by the text of its command

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/tests/database/contact_messages.test.sql:163-171
- **Detail**: there was no proof that the job deletes an old row and keeps a fresh one, and no note that a rollback needs `cron.unschedule`.
- **Fix**: pgTAP runs the job's own command: a row from 13 months ago disappears and one from 11 months ago stays. A rollback note was added to the migration header.
- **Decision**: FIXED (88e1556)
