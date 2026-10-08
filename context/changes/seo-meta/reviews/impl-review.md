<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: SEO & Link-Preview Metadata

- **Plan**: context/changes/seo-meta/plan.md
- **Scope**: Phases 1–2 of 2
- **Date**: 2026-10-08
- **Verdict**: NEEDS ATTENTION (all minor; the code matches the plan)
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

Automated: `npm test` 679/679, `npm run lint` exit 0, `npm run build` OK; gates 1.4, 1.5, 2.4, 2.5, 2.6 green. Gate 1.5 was confirmed able to fail (the package's original `SocialMeta.astro` contains the phrase). Built sitemap holds exactly `/`, `/auth/signin`, `/auth/signup`. `CANONICAL_ORIGIN` is `https://temio.pl` in `wrangler.jsonc`.

## Findings

### F1 — Manual gates still open on a branch whose merge is a release

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/seo-meta/plan.md (Progress 1.6–1.8, 2.7)
- **Detail**: change.md was `implemented` with no Phase 1 manual item ticked. 1.7 (owner approves `SITE_DESCRIPTION`) is a content decision that ships on merge. 1.8 was already settled (root files gone, package moved into `context/foundation/design` in 190a036) but not ticked.
- **Fix**: Run 1.6, 1.7 and 2.7 before merging; tick 1.8 with 190a036.
- **Decision**: FIXED (partially): 1.8 ticked — 190a036. 1.6, 1.7, 2.7 are owner actions, queued in `follow-ups/review-fixes.md`.

### F2 — robots.txt hides the noindex from /plan URLs already published

- **Severity**: ⚠️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: public/robots.txt:2
- **Detail**: The temio-launch sitemap live on production lists `/plan/`, `/plan/month/`, `/plan/week/`. `Disallow: /plan` stops Google re-crawling them, so it never sees their redirect / `noindex`; an already-discovered URL can stay as "Indexed, though blocked by robots.txt". Low risk: that sitemap was live under a day and never submitted.
- **Fix**: During 2.10, check Search Console's page index for `/plan` URLs and remove any with the Removals tool. No code change.
- **Decision**: FIXED: queued as a follow-up for step 2.10.

### F3 — Design-package refresh rides on this branch

- **Severity**: ⚠️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: 190a036 (context/foundation/design/**)
- **Detail**: The plan calls the `context/foundation/design/` refresh "a separate edit". It is a separate commit, but on `feat/seo-meta`, so it ships with this merge. Docs only and exempt per CLAUDE.md; the reference copy of `SocialMeta.astro` there still contains „co trafi do planu" but sits outside the `src/` gate.
- **Fix**: Mention 190a036 in the PR description / change notes.
- **Decision**: FIXED: noted in `change.md` Notes; PR-description reminder in `follow-ups/review-fixes.md`.

### F4 — Middleware comments describe paths that don't occur

- **Severity**: ⚠️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/middleware.ts:51, src/lib/canonical-host.ts:44
- **Detail**: The catch branch cited `Response.redirect`, which nothing in `src/` uses; the `isOffCanonicalHost` JSDoc listed "the legacy host", which `canonicalRedirect` sends away before `next()` runs. Behaviour correct, comments misleading.
- **Fix**: Correct both comments.
- **Decision**: FIXED: JSDoc now says the legacy host never gets that far; the catch comment names a passed-through `fetch` response.
