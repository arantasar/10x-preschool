<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: S-04 `month-home` — plan implementacji

- **Plan**: context/changes/month-home/plan.md
- **Scope**: Full plan — Phases 1–4 of 4 (31/31 Progress rows `[x]`)
- **Date**: 2026-08-26
- **Verdict**: NEEDS ATTENTION → all 8 findings triaged 2026-08-26 (7 fixed, 1 deferred)
- **Findings**: 0 critical, 5 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

Automated gates re-run at HEAD: `npm run lint` exit 0; `npx astro check` 0 errors / 0 warnings / 4 pre-existing hints; `npm run build` exit 0; `grep "Zalogowano jako" src/pages/` empty; `grep "/dashboard" src/ README.md CLAUDE.md` empty; `test ! -f src/pages/dashboard.astro` pass.

All 9 planned change-items verified MATCH. All 6 "What We're NOT Doing" guardrails RESPECTED. The commit-ordering safety property — a signed-in user is never without a way to end their session — was verified to hold at each of the four code-bearing commits.

## Findings

### F1 — husky pre-commit hook has never been wired up

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: .husky/pre-commit, package.json, CLAUDE.md:31
- **Detail**: `CLAUDE.md` states "Pre-commit hooks: husky + lint-staged runs `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`". None of it runs. `git config core.hooksPath` is unset, `package.json` has no `prepare` script, and `.git/hooks/` contains only `.sample` files — so Git never reaches `.husky/pre-commit`, even though husky 9.1.7 is installed and the hook file exists and is executable. Pre-existing, not introduced by this change, but this change is what surfaced it: F2 below is a direct consequence. Every contributor working from a fresh clone has the same inert safety net.
- **Fix**: Add `"prepare": "husky"` to `package.json` scripts and run `npm run prepare` once to set `core.hooksPath=.husky`.
  - Strength: This is husky 9's documented wiring; it self-heals on every `npm install` for every clone, so the fix does not depend on each developer remembering a manual step.
  - Tradeoff: The first commit after wiring will reformat any files that drifted while the hook was inert — expect one noisy commit (README.md at minimum, and `CLAUDE.md`, which is prettier-dirty on `master` too).
  - Confidence: HIGH — verified husky is installed, the hook file exists and is executable, and the only missing piece is `core.hooksPath`.
  - Blind spot: Have not checked whether the hook was deliberately left unwired because `eslint --fix` on `*.astro` was found disruptive; git history may say.
- **Decision**: FIXED — added `"prepare": "husky"` to package.json and ran it; `core.hooksPath=.husky/_`. Blind spot resolved: `prepare` was never in package.json history, so the gap was inherited from the starter template at `eff74ca`, not a deliberate removal.

### F2 — README.md regressed from prettier-clean to prettier-dirty

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: README.md:144-148
- **Detail**: Deleting the `/dashboard` row from the routes table left the remaining rows padded to the width of the deleted (widest) cell. `npx prettier --check README.md` exits 1 at HEAD and exits 0 against `git show master:README.md` — a clean-to-dirty regression introduced by commit `f2a20d3`. It slipped through because of F1. The next `npm run format` anyone runs will produce an unrelated README diff.
- **Fix**: Run `npx prettier --write README.md` and amend into a follow-up commit.
- **Decision**: FIXED — `npx prettier --write README.md`; table repadded, `prettier --check` clean.

### F3 — Manual check 3.10 is ticked but was never observable

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: context/changes/month-home/plan.md — Progress row 3.10
- **Detail**: Row 3.10 — "Link w Topbarze na stronie powitalnej prowadzi na `/plan/month`" — is marked `[x] — f2a20d3`. The success criterion qualifies it as "(w sesji otwartej w drugiej karcie)", but after Phase 2 a second tab hits the same `/` → `/plan/month` redirect, so the signed-in branch of `Topbar.astro` cannot render in a browser at that commit or any later one. Confirmed at runtime: `GET /` with a live session returns `302 → /plan/month`. What was actually verified is that the href in source is `/plan/month` — source inspection, not the observation the row claims. The prior turn's summary disclosed this in prose but ticked the box anyway; the box and the prose disagree.
- **Fix A ⭐ Recommended**: Reword row 3.10 to state what is verifiable — that no dangling `/dashboard` target survives in `Topbar.astro` source — and note in the plan that the runtime check was made moot by Phase 2.
  - Strength: Keeps the Progress section trustworthy as a record of what was actually observed, which is the only property that makes it worth reading later.
  - Tradeoff: Edits a plan row title, which the implement skill's convention says not to rename; this is a deliberate exception and should be called out in the commit.
  - Confidence: HIGH — the unreachability is proven by both the redirect trace and the import graph (`Topbar` ← `Welcome` ← `index.astro`).
  - Blind spot: None significant.
- **Fix B**: Untick 3.10 and leave it pending as a known-unverifiable row.
  - Strength: Strictest reading — an unobservable check is not a passed check.
  - Tradeoff: Leaves the plan permanently incomplete and will trip `/10x-archive`'s pending-row warning forever.
  - Confidence: MEDIUM — depends whether you want archive to stay clean.
  - Blind spot: Have not checked how `/10x-archive` treats a single pending manual row.
- **Decision**: FIXED via Fix A — Progress row 3.10 and the matching Phase 3 success criterion reworded to state source-level verification, noting Phase 2 made the browser check unobservable.

### F4 — Automated gate 4.2 cannot fail

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/month-home/plan.md — Phase 4 Automated Verification, Progress row 4.2
- **Detail**: Gate 4.2 is `npx prettier --check context/foundation/roadmap.md`. `.prettierignore` excludes `context/` wholesale, with a comment explaining the exclusion is deliberate. Prettier therefore never inspects the file and the command exits 0 unconditionally. Proof: copying the identical content to a path outside `context/` and checking it exits 1 — Prettier *would* reformat it. The visible consequence is live in the file: the `| S-04 | … | in-progress |` row overflows its column in the `## At a glance` table. The gate was a flaw in the plan, not in the implementation, but it was ticked as if it had verified something.
- **Fix**: Replace gate 4.2 with a check that can actually fail — or delete it and note that `context/` is deliberately prettier-exempt.
- **Decision**: FIXED — gate replaced with a table-alignment check that was proven to fail on a broken copy; 3 roadmap tables realigned (24 table lines, 0 prose lines).

### F5 — `no-misused-promises` disabled for all `.astro`, wider than the bug requires

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: eslint.config.js:70
- **Detail**: Phase 2 needed a bare `return Astro.redirect(...)` in `index.astro` frontmatter, which crashes `@typescript-eslint/no-misused-promises` — `astro-eslint-parser@1.4.0` gives that return statement no parent node and `checkReturnStatement` dereferences it unconditionally. The crash is real, reproduced, and aborts the whole ESLint run rather than reporting a finding; an inline `eslint-disable` does not help because the rule still executes. The adaptation was disclosed in the `59a98ef` commit message. But the crash is gated by one sub-option, and a narrower fix is verified to work: `checksVoidReturn: { attributes: false, returns: false }` exits 0 on `index.astro`, while the current blanket `off` also discards `checksConditionals`, `checksSpreads`, and the `arguments`/`properties`/`variables`/`inheritedMethods` sub-checks. That matters because `.astro` frontmatter is exactly where this project does its server-side awaiting — a forgotten `await` in `if (readDayPlan(...))` is a live risk that the blanket disable now ignores. Nothing was masked at the time: the full rule was run against every `.astro` file containing `await`/`async`/`Promise` and found zero pre-existing violations.
- **Fix**: Replace `"@typescript-eslint/no-misused-promises": "off"` with `["error", { checksVoidReturn: { attributes: false, returns: false } }]` in the `.astro` block, and update the comment to name the one sub-check being dropped.
  - Strength: Keeps the conditional-await check alive in the exact files where this project awaits, at the cost of only the sub-check that carries the parser bug. Verified working.
  - Tradeoff: A more intricate rule config that a future reader must decode; the comment has to carry more weight.
  - Confidence: HIGH — both the crash and the narrow fix were reproduced directly.
  - Blind spot: Have not checked whether a future `astro-eslint-parser` release fixes the parent-node bug, which would let the whole override be deleted.
- **Decision**: FIXED — narrowed to `["error", { checksVoidReturn: { attributes: false, returns: false } }]`. Proven valuable: a planted forgotten `await` in `month.astro` frontmatter is now caught (`Expected non-Promise value in a boolean conditional`); the blanket `off` missed it.

### F6 — `Topbar.astro` signed-in branch is unreachable dead code

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/components/Topbar.astro:9-22
- **Detail**: `Topbar` is imported only by `Welcome.astro:2`, and `Welcome` only by `index.astro:19`, which now returns a redirect before render whenever `user` is truthy. So `user` at `Topbar.astro:9` is always falsy and the email, the "Plan miesiąca" link and the sign-out button can never render. Phase 3 edited this dead branch. Leaving it is defensible — the plan put `Welcome.astro` explicitly out of scope, and the edit removed a dangling `/dashboard` reference from source — but it is now carrying-cost with no reader.
- **Fix**: Leave for now; fold into the slice that replaces the starter's `Welcome.astro` with a Polish landing page, and reduce `Topbar` to its signed-out branch there.
- **Decision**: DEFERRED — left for the slice that replaces the starter's `Welcome.astro` with a Polish landing page; `Topbar` reduces to its signed-out branch there.

### F7 — App-wide shell lives in the plan-domain folder

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: src/components/AppHeader.astro
- **Detail**: The component is the signed-in app's shell — it carries session identity and the only sign-out control — but sits in `src/components/plan/`, whose other members are all plan-domain components (`MonthGrid.astro`, `DayPlanEditor`, `WeekPlanBoard`). Its own comment calls it "the signed-in app" shell. Invisible today because every signed-in page is under `/plan`; the first signed-in page outside `/plan` (settings, profile) makes the location misleading. The plan specified this path, so this is not drift.
- **Fix**: No action now. Move to `src/components/` or `src/components/app/` when the first non-`/plan` signed-in page lands.
- **Decision**: FIXED — `git mv` to `src/components/AppHeader.astro`; three imports rewired; every reference updated in astro.config.mjs, roadmap.md, plan-brief.md and this report; plan.md's Phase 1 contract annotated with the review-time move rather than silently rewritten.

### F8 — Sign-out CSRF protection rests on an undeclared framework default

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: astro.config.mjs
- **Detail**: `AppHeader.astro:15` is now the only state-changing POST form in the signed-in app. Its CSRF protection comes entirely from Astro's implicit `security.checkOrigin: true` default (verified in the 6.3.1 config schema, and observed at runtime — a POST without an `Origin` header returned 403). Nothing in this repo declares the dependency, so a future major-version default change or a `security: {}` edit would silently remove it. Pre-existing — the deleted `dashboard.astro:37` had the same form — not introduced here.
- **Fix**: Add `security: { checkOrigin: true }` to `astro.config.mjs` with a comment naming the sign-out form as what it protects.
- **Decision**: FIXED — `security: { checkOrigin: true }` pinned in astro.config.mjs with a comment naming the sign-out form. Re-verified live: POST without an Origin header returns 403.
