/**
 * The SEO rules in one place: the page title format, which pages a search
 * engine may index, and the canonical URL. `src/layouts/Layout.astro` reads them
 * at render time and `astro.config.mjs` reads `INDEXABLE_PATHS` for the sitemap,
 * so the `robots` meta tag and the sitemap cannot drift apart.
 *
 * `astro.config.mjs` imports this file through a relative path, so it must not
 * use the `@/` alias or any `astro:*` module.
 */

export const SITE_NAME = "Temio";

export const HOME_TITLE = "Temio — plan zajęć przedszkolnych";

// Derived from the landing hero (`src/components/Welcome.astro`). It must not
// promise that nothing enters the plan unapproved: a generated day is saved as
// a draft at once (`pl-landing-copy`).
export const SITE_DESCRIPTION =
  "Wpisz temat, np. „Dinozaury”, a dostaniesz gotowe propozycje aktywności na każdy dzień dla dzieci 3–6 lat. Przeglądasz, poprawiasz, zatwierdzasz.";

// An allow-list: a new page stays `noindex` and out of the sitemap until it is
// added here. Most of the app sits behind a login or a one-shot token.
export const INDEXABLE_PATHS: readonly string[] = ["/", "/auth/signin", "/auth/signup"];

/** Strips one trailing `/`, except from the root. */
export function normalizePath(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

/** `undefined` is the landing page; any other title gets the brand appended. */
export function pageTitle(title?: string): string {
  return title === undefined ? HOME_TITLE : `${title} · ${SITE_NAME}`;
}

export function isIndexable(pathname: string): boolean {
  return INDEXABLE_PATHS.includes(normalizePath(pathname));
}

/** The page's URL on `site`, without a trailing slash and without the query. */
export function canonicalUrl(pathname: string, site: string | URL): string {
  return new URL(normalizePath(pathname), site).href;
}
