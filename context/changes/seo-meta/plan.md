# SEO & Link-Preview Metadata Implementation Plan

## Overview

Make `https://temio.pl` presentable to search engines and to link previews in Facebook, Messenger, WhatsApp and Slack. Every page gets a branded title, a description, a canonical URL and Open Graph / Twitter tags. Only the three public entry points are indexable. A single list in `src/lib/seo.ts` drives both the `robots` meta tag and the sitemap. `robots.txt` is added, and preview hosts (`*.workers.dev`) are marked `noindex`.

## Current State Analysis

- `src/layouts/Layout.astro` emits only `charset`, `viewport`, favicons, `theme-color` and `<title>{title}</title>` (default `"Temio"`). It has no `description`, no `canonical`, no OG or Twitter tags and no `robots`.
- Titles are inconsistent. The landing page passes `"Temio — plan zajęć przedszkolnych"`, but every other page passes a bare heading (`"Zaloguj się"`, `"Plan tygodnia — …"`) with no brand. `PlannerLayout.astro` forwards `title` to `Layout`.
- `astro.config.mjs` has `site: "https://temio.pl"` and `sitemap()` with no options (added by `temio-launch`). The built `dist/client/sitemap-0.xml` lists **11** URLs, among them the protected `/plan/`, `/plan/month/` and `/plan/week/` and the one-shot auth pages (`/auth/confirm/`, `/auth/new-password/`, `/auth/forgot-password/sent/`, `/auth/confirm-email/`). They all end in `/`, while the app links to them without one.
- There's no `public/robots.txt`.
- Workers Builds deploys PR previews to `<id>-10x-preschool.<account>.workers.dev`. `src/lib/canonical-host.ts` redirects only the exact legacy host, so preview hosts serve indexable HTML.
- The design package (untracked at repo root: `temio-design-astro (1)/`, plus a byte-identical `og-image.png`) contains `src/components/layout/SocialMeta.astro` and `public/og-image.png` (1200×630). Its README §„Podgląd linku" says to put `SocialMeta` in the layout's `<head>`.

## Desired End State

- Every page title is `"<page> · Temio"`. The landing page alone keeps `"Temio — plan zajęć przedszkolnych"`.
- Every page carries `<meta name="description">`, `<link rel="canonical">` (always `https://temio.pl` + path, no trailing slash, no query string), OG tags (`og:image` = `https://temio.pl/og-image.png`, 1200×630) and `twitter:card=summary_large_image`.
- `/`, `/auth/signin` and `/auth/signup` are indexable. Every other page carries `<meta name="robots" content="noindex">`.
- `sitemap-0.xml` contains exactly those three URLs, without trailing slashes (root as `https://temio.pl/`).
- `https://temio.pl/robots.txt` disallows `/plan` and `/api/` and points at the sitemap.
- A server-rendered response on any host other than `CANONICAL_ORIGIN`'s carries `X-Robots-Tag: noindex`.
- Pasting `https://temio.pl` into the Facebook Sharing Debugger shows the branded card.

### Key Discoveries:

- `temio-design-astro (1)/src/components/layout/SocialMeta.astro` is ready to adopt. It hardcodes `site`, and its default description ends with „Ty decydujesz, co trafi do planu.", a promise `src/components/Welcome.astro:4-5` deliberately does not make (a generated day is saved as a draft at once; `pl-landing-copy`). The adopted copy must not keep that sentence.
- Landing hero copy (`src/components/Welcome.astro:91-92`) is the source for the description.
- The sitemap integration supports `filter(page)` (full URL) and `serialize(item)` (mutate `item.url`, or return `undefined` to drop the entry). See the Astro docs, `integrations-guide/sitemap`.
- Static files in `public/` are served by Workers static assets before the Worker runs, so the middleware never sees `robots.txt` or `og-image.png`. `X-Robots-Tag` therefore reaches only SSR responses, which is all that matters.
- `CANONICAL_ORIGIN` is unset in `.env` and `.dev.vars`, so a `noindex` keyed on it stays inert in local dev unless set temporarily.
- `src/lib/canonical-host.test.ts` is the existing test home for host logic. Unit tests live next to sources as `src/lib/*.test.ts` and run with `npm test`.

## What We're NOT Doing

- No per-page descriptions beyond the site-wide default. `SocialMeta` keeps the `description` prop, but no page passes one in this change.
- No JSON-LD / structured data, no `hreflang` (single language), no build-time OG image generation.
- No change to `trailingSlash` routing. Only the sitemap's URLs are normalized.
- No adoption of the rest of the design package (`temio-design-astro (1)/`: new screens 15–17, README changes, email templates). Refreshing `context/foundation/design/` is a separate edit.
- No changes to the OG image itself, even though it shows category tags („Plastyka", „Ruch") that are not built yet (M-04). See Open Risks.
- No Google Search Console account setup beyond submitting the sitemap in the manual step.

## Implementation Approach

Pure, unit-tested helpers in `src/lib/seo.ts` hold the three rules (title format, which paths are indexable, canonical URL). `Layout.astro` and `astro.config.mjs` both read the indexable list from there, so the `robots` meta tag and the sitemap cannot drift apart. The indexable list is an **allow-list**: a new page is `noindex` and absent from the sitemap until someone adds it, which is the safe default for an app whose pages mostly sit behind a login.

Work happens on a feature branch (`feat/seo-meta`) per `CLAUDE.md` § Git. Merging to `master` deploys to production.

## Critical Implementation Details

- **Config import:** `astro.config.mjs` must import `INDEXABLE_PATHS` through a relative path (`./src/lib/seo.ts`). The `@/` alias does not resolve in the config file. Astro loads its config through Vite, so a `.ts` import works. If it ever fails, the build fails loudly, which is preferable to duplicating the list.
- **Path normalization:** every comparison and every canonical URL uses one normalizer that strips a trailing `/` except on the root. `Astro.url.pathname` can carry the slash (`/auth/signin/` is served too), and sitemap item URLs always do.

## Phase 1: Head metadata

### Overview

Every page renders a branded title, description, canonical, OG/Twitter tags and the right `robots` directive.

### Changes Required:

#### 1. SEO helpers

**File**: `src/lib/seo.ts` (new), `src/lib/seo.test.ts` (new)

**Intent**: Single source of truth for the SEO rules, so the layout and the sitemap config agree and the rules are unit-tested.

**Contract**:
- `SITE_NAME = "Temio"`, `HOME_TITLE = "Temio — plan zajęć przedszkolnych"`.
- `SITE_DESCRIPTION`: one Polish sentence derived from the landing hero, without any "nothing enters the plan unapproved" promise. Proposed: „Wpisz temat, np. „Dinozaury”, a dostaniesz gotowe propozycje aktywności na każdy dzień dla dzieci 3–6 lat. Przeglądasz, poprawiasz, zatwierdzasz.” (owner approves at 1.7).
- `INDEXABLE_PATHS: readonly string[] = ["/", "/auth/signin", "/auth/signup"]`.
- `normalizePath(pathname)`: strips one trailing `/` except for `"/"`.
- `pageTitle(title?: string)`: `undefined` → `HOME_TITLE`; otherwise `` `${title} · ${SITE_NAME}` ``.
- `isIndexable(pathname)`: `INDEXABLE_PATHS.includes(normalizePath(pathname))`.
- `canonicalUrl(pathname, site)`: `new URL(normalizePath(pathname), site).href`, with no query.
- Tests cover: the trailing-slash and root cases of `normalizePath`; `pageTitle` with and without a title; `isIndexable` true for the three paths (with and without a trailing slash) and false for `/plan/month`, `/auth/confirm` and `/auth/new-password`; `canonicalUrl` dropping a trailing slash.

#### 2. SocialMeta component

**File**: `src/components/layout/SocialMeta.astro` (new, adapted from `temio-design-astro (1)/src/components/layout/SocialMeta.astro`)

**Intent**: Adopt the design package's link-preview component, wired to the helpers instead of hardcoded values.

**Contract**: Props `title: string` (already the final, branded title), `description?: string` (default `SITE_DESCRIPTION`), `image?` (default `/og-image.png`), `imageAlt?` (default „Temio: Jedno hasło. Cały miesiąc zajęć.”). The site comes from `Astro.site`, not a literal. `url` = `canonicalUrl(Astro.url.pathname, Astro.site)`. The tag set is the package's as it stands: canonical, description, `og:type/site_name/locale/url/title/description/image(+secure_url,type,width,height,alt)`, `twitter:card=summary_large_image` + title/description/image/alt. Code style follows the repo (double quotes, Prettier), not the package's.

#### 3. Layout wiring and titles

**File**: `src/layouts/Layout.astro`, `src/pages/index.astro`

**Intent**: Put `SocialMeta` and the `robots` directive in every page's `<head>` and apply the title rule in one place.

**Contract**: `<title>` = `pageTitle(Astro.props.title)`, and the same string goes to `SocialMeta`. When `!isIndexable(Astro.url.pathname)`, render `<meta name="robots" content="noindex" />`. `index.astro` stops passing `title` (it gets `HOME_TITLE` by default). The `Props` interface is unchanged (`title?: string`). No other page changes: their existing `title` props become „Zaloguj się · Temio” and so on.

#### 4. OG image

**File**: `public/og-image.png` (new, copied from the untracked root `og-image.png` / `temio-design-astro (1)/public/og-image.png`, which are byte-identical)

**Intent**: Ship the 1200×630 link-preview image. The untracked root `og-image.png` and `temio-design-astro (1)/` are **not** committed. Whether to delete them is the owner's call (1.8).

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including the new `src/lib/seo.test.ts`: `npm test`
- Lint passes: `npm run lint`
- Build passes: `npm run build`
- Image is shipped at the right size: `file public/og-image.png | grep -q "1200 x 630"`
- The rejected promise did not come in with the component. This gate is red against the package's original file: `! grep -rq "co trafi do planu" src/`

#### Manual Verification:

- With `npm run dev`, view-source of `/`, `/auth/signin`, `/auth/confirm` and `/plan/month` (signed in) shows: `/` titled „Temio — plan zajęć przedszkolnych”, others „<page> · Temio”; canonical `https://temio.pl/<path>` without a trailing slash or query; `og:image` absolute; `robots noindex` only on `/auth/confirm` and `/plan/month`.
- Owner approves the wording of `SITE_DESCRIPTION`.
- Owner decides what happens to the untracked `og-image.png` and `temio-design-astro (1)/` at the repo root (delete, or move into `context/foundation/design/` in a separate edit).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Crawl control

### Overview

The sitemap, `robots.txt` and an HTTP header tell crawlers the same thing the `robots` meta tag does.

### Changes Required:

#### 1. Sitemap filtering

**File**: `astro.config.mjs`

**Intent**: List only the indexable pages, at the URLs the app actually serves.

**Contract**: `sitemap({ filter, serialize })`. `filter(page)` keeps a page iff `isIndexable(new URL(page).pathname)`. `serialize(item)` rewrites `item.url` to `canonicalUrl(new URL(item.url).pathname, site)`. Both are imported from `./src/lib/seo.ts`. Keep the existing `site` comment.

#### 2. robots.txt

**File**: `public/robots.txt` (new)

**Intent**: Keep crawlers out of the app and the API, and point them at the sitemap.

**Contract**: `User-agent: *`, `Disallow: /plan`, `Disallow: /api/`, `Sitemap: https://temio.pl/sitemap-index.xml`. `/auth/*` is **not** disallowed: a crawler must be able to fetch those pages to see their `noindex`.

#### 3. noindex on non-canonical hosts

**File**: `src/lib/canonical-host.ts`, `src/lib/canonical-host.test.ts`, `src/middleware.ts`

**Intent**: Preview deployments on `*.workers.dev` must never compete with `temio.pl` in search results.

**Contract**: New `isOffCanonicalHost(url: URL, canonicalOrigin: string | undefined): boolean`. It returns `false` when `canonicalOrigin` is unset or malformed (inert, like `canonicalRedirect`), and otherwise `url.hostname !== new URL(canonicalOrigin).hostname`. The middleware sets `X-Robots-Tag: noindex` on the response from `next()` when it returns `true`. This applies only to the response that `next()` returns; the redirect branches are left alone. Tests: unset origin → false; malformed origin → false; `temio.pl` → false; `<id>-10x-preschool.<account>.workers.dev` → true; `localhost` with origin set → true.

### Success Criteria:

#### Automated Verification:

- Unit tests pass, including the new `isOffCanonicalHost` cases: `npm test`
- Lint passes: `npm run lint`
- Build passes: `npm run build`
- Sitemap holds exactly the three indexable URLs. This was 11 before this phase, so the gate can fail: `test "$(grep -o '<loc>' dist/client/sitemap-0.xml | wc -l | tr -d ' ')" = 3`
- No sitemap URL ends in a slash except the root: `! grep -oE '<loc>https://temio.pl/[^<]+/</loc>' dist/client/sitemap-0.xml`
- robots.txt ships: `grep -q "^Sitemap: https://temio.pl/sitemap-index.xml$" dist/client/robots.txt`

#### Manual Verification:

- After setting `CANONICAL_ORIGIN=https://temio.pl` temporarily in `.dev.vars`, `curl -sI http://localhost:4321/auth/signin` shows `X-Robots-Tag: noindex`. Without it, the header is absent.
- After merge and deploy: `curl -sI https://temio.pl/` has no `X-Robots-Tag`; `https://temio.pl/robots.txt` and `/sitemap-index.xml` resolve.
- Facebook Sharing Debugger (developers.facebook.com/tools/debug) on `https://temio.pl` shows the branded card with image, title and description.
- Sitemap `https://temio.pl/sitemap-index.xml` submitted in Google Search Console.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `src/lib/seo.test.ts`: normalization, title rule, the indexable allow-list (including trailing-slash variants and representative non-indexable pages), canonical URL.
- `src/lib/canonical-host.test.ts`: `isOffCanonicalHost` inert and active cases.

### Integration Tests:

- None. The sitemap and `robots.txt` are checked against the build output in the Phase 2 automated criteria. No E2E tests: a head-tag check does not need a browser.

### Manual Testing Steps:

1. View source on the four representative pages (Phase 1).
2. Curl the headers with `CANONICAL_ORIGIN` set and unset (Phase 2).
3. After deploy: Facebook Sharing Debugger, Search Console sitemap submission, `curl` on production.

## Performance Considerations

None of note: a handful of `<meta>` tags, one ~50 KB static PNG fetched only by crawlers, and one string comparison per request in the middleware.

## Migration Notes

None. Facebook and Messenger cache previews. If a card looks stale after deploy, use "Scrape Again" in the Sharing Debugger. WhatsApp and Slack refresh on their own within hours.

## Open Risks & Assumptions

- The OG image shows activity categories („Plastyka", „Ruch") that the product does not have yet (M-04). It is accepted as marketing illustration. A future slice that changes categories may want to regenerate it.
- The OG image is not tied to an asset hash, so replacing it later requires a Facebook re-scrape.

## References

- Design package: `temio-design-astro (1)/design/README.md` § „Podgląd linku", `temio-design-astro (1)/src/components/layout/SocialMeta.astro`
- Sitemap / site setup: `context/archive/2026-10-08-temio-launch/plan.md` (Phase 1, `site:`)
- Host logic pattern: `src/lib/canonical-host.ts`
- Landing copy constraints: `src/components/Welcome.astro:1-10`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Head metadata

#### Automated

- [x] 1.1 Unit tests pass, including the new src/lib/seo.test.ts — a819a09
- [x] 1.2 Lint passes — a819a09
- [x] 1.3 Build passes — a819a09
- [x] 1.4 Image is shipped at the right size — a819a09
- [x] 1.5 The rejected promise did not come in with the component — a819a09

#### Manual

- [x] 1.6 View-source of four pages shows correct title, canonical, og:image, robots
- [x] 1.7 Owner approves the wording of SITE_DESCRIPTION
- [x] 1.8 Owner decides what happens to the untracked root og-image.png and temio-design-astro (1)/ — 190a036

### Phase 2: Crawl control

#### Automated

- [x] 2.1 Unit tests pass, including the new isOffCanonicalHost cases — ddcf09b
- [x] 2.2 Lint passes — ddcf09b
- [x] 2.3 Build passes — ddcf09b
- [x] 2.4 Sitemap holds exactly the three indexable URLs — ddcf09b
- [x] 2.5 No sitemap URL ends in a slash except the root — ddcf09b
- [x] 2.6 robots.txt ships — ddcf09b

#### Manual

- [x] 2.7 X-Robots-Tag present locally with CANONICAL_ORIGIN set, absent without
- [ ] 2.8 Production: no X-Robots-Tag on temio.pl; robots.txt and sitemap-index.xml resolve
- [ ] 2.9 Facebook Sharing Debugger shows the branded card
- [ ] 2.10 Sitemap submitted in Google Search Console
