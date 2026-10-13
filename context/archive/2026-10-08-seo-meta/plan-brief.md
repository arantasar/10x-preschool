# SEO & Link-Preview Metadata — Plan Brief

> Full plan: `context/changes/seo-meta/plan.md`

## What & Why

`temio.pl` is live, but its pages carry only a `<title>`. Search results show bare headings like „Zaloguj się”. A link shared in Messenger or a Facebook group shows no card. The sitemap advertises protected and one-shot auth pages, and preview deployments can be indexed. This change gives every page proper metadata and tells crawlers which three pages actually matter.

## Starting Point

`Layout.astro` sets the title, favicons and `theme-color`, and nothing else. `@astrojs/sitemap` (with `site: "https://temio.pl"`, from `temio-launch`) lists all 11 pages with trailing slashes. There's no `robots.txt`. The design package already ships a `SocialMeta.astro` component and a 1200×630 `og-image.png`; both are untracked at the repo root.

## Desired End State

Every page has a „<page> · Temio” title, a description, a canonical URL on `https://temio.pl` and OG/Twitter tags with the branded image. Only `/`, `/auth/signin` and `/auth/signup` are indexable and appear in the sitemap. `robots.txt` keeps crawlers out of `/plan` and `/api/`. Preview hosts send `X-Robots-Tag: noindex`.

## Key Decisions Made

| Decision           | Choice                                                   | Why (1 sentence)                                                                                   |
| ------------------ | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| What is indexable  | `/`, `/auth/signin`, `/auth/signup`; everything else `noindex` | Real entry points only; one-shot token pages and `/plan/*` would produce Search Console errors.  |
| Source of truth    | Allow-list `INDEXABLE_PATHS` in `src/lib/seo.ts`, read by the layout and the sitemap | The `robots` meta tag and the sitemap cannot drift apart; a new page is `noindex` until someone opts it in. |
| OG image           | Your `og-image.png` (1200×630) from the design package    | Already designed to the brand; static, so no runtime cost.                                         |
| Meta tags          | Adopt the package's `SocialMeta.astro`, with the domain taken from `Astro.site` | The design hand-off asks for it; only the hardcoded site and the default description change.      |
| Description        | One site-wide sentence derived from the landing hero      | The package's default promises „Ty decydujesz, co trafi do planu”, which `pl-landing-copy` rejected as false. |
| Title format       | `<page> · Temio`; the landing page keeps „Temio — plan zajęć przedszkolnych” | Brand in every tab and search result, one rule in one place.                                      |
| Preview hosts      | `X-Robots-Tag: noindex` when the host ≠ `CANONICAL_ORIGIN` | Canonical is only a hint; preview URLs leak through PR comments.                                   |

## Scope

**In scope:** `src/lib/seo.ts` with tests, `SocialMeta.astro`, `Layout.astro` titles and robots tag, `public/og-image.png`, sitemap `filter`/`serialize`, `public/robots.txt`, `isOffCanonicalHost` in the middleware.

**Out of scope:** per-page descriptions, JSON-LD, build-time OG generation, `trailingSlash` routing changes, adopting the rest of the new design package, editing the OG image.

## Architecture / Approach

Pure helpers (`pageTitle`, `isIndexable`, `canonicalUrl`, `normalizePath`) in `src/lib/seo.ts` are consumed by `Layout.astro` (render time) and by `astro.config.mjs` (sitemap, build time). Host logic sits next to `canonicalRedirect` in `canonical-host.ts`, and the middleware adds one header. Static files (`robots.txt`, `og-image.png`) bypass the Worker.

## Phases at a Glance

| Phase             | What it delivers                                              | Key risk                                                          |
| ----------------- | ------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1. Head metadata  | Titles, description, canonical, OG/Twitter, robots meta tag, OG image | Copying `SocialMeta` verbatim brings back the rejected promise (a grep gate catches it). |
| 2. Crawl control  | Sitemap with 3 URLs, `robots.txt`, `noindex` on preview hosts  | `astro.config.mjs` importing a `.ts` helper; the build fails loudly if it can't. |

**Prerequisites:** feature branch `feat/seo-meta` (the repo is on `master`); the merge deploys to production.
**Estimated effort:** one short session, 2 phases.

## Open Risks & Assumptions

- The OG image shows category tags („Plastyka", „Ruch") the product doesn't have yet (M-04). It's accepted as illustration.
- Facebook caches previews: after deploy, re-scrape in the Sharing Debugger.

## Success Criteria (Summary)

- Sharing `https://temio.pl` in Messenger or Facebook shows the branded card.
- Google sees three pages in the sitemap, no `/plan` or token pages, and no preview hosts.
- Every browser tab and search result reads „… · Temio”.
