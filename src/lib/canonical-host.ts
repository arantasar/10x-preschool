/**
 * Moves a request on the old production host (`10x-preschool.<account>.workers.dev`)
 * to the canonical origin (`https://temio.pl`), keeping the path and the query.
 *
 * Inert until both values are set (`LEGACY_HOST` / `CANONICAL_ORIGIN` in
 * `wrangler.jsonc` `vars`), so the code can ship before the domain exists. The
 * host match is **exact**: preview hosts (`<id>-10x-preschool.<account>.workers.dev`)
 * and `localhost` never match, so previews and local dev are never redirected.
 *
 * GET and HEAD get a 301. Anything else gets a 308, which at least does not
 * turn a POST into a GET. In practice a POST from a stale tab on the old host
 * still fails on temio.pl (cross-origin `Origin` → `checkOrigin` 403, or CORS for
 * an island's `fetch`), and her session cookie belongs to the old host anyway -
 * that tab has to reload. Both codes are cached by browsers indefinitely, so
 * removing the vars stops new redirects but not ones a browser already saw.
 *
 * A malformed `canonicalOrigin` (e.g. `temio.pl` without a scheme) leaves the
 * redirect off rather than throwing on every request to the old host.
 */
export function canonicalRedirect(
  url: URL,
  method: string,
  legacyHost: string | undefined,
  canonicalOrigin: string | undefined,
): { location: string; status: 301 | 308 } | null {
  if (!legacyHost || !canonicalOrigin) return null;
  if (url.hostname !== legacyHost) return null;

  let target: URL;
  try {
    target = new URL(canonicalOrigin);
  } catch {
    return null;
  }
  // A misconfiguration that names the same host twice would redirect to itself forever.
  if (target.hostname === legacyHost) return null;

  const safe = method === "GET" || method === "HEAD";
  return { location: `${target.origin}${url.pathname}${url.search}`, status: safe ? 301 : 308 };
}

/**
 * Whether this request reached a host other than the canonical one: a preview
 * deployment (`<id>-10x-preschool.<account>.workers.dev`), the legacy host, or
 * `localhost`. The middleware marks such responses `X-Robots-Tag: noindex`, so a
 * preview URL leaked through a PR comment never competes with `temio.pl` in
 * search results.
 *
 * Inert (`false`) while `canonicalOrigin` is unset or malformed, like
 * `canonicalRedirect`.
 */
export function isOffCanonicalHost(url: URL, canonicalOrigin: string | undefined): boolean {
  if (!canonicalOrigin) return false;

  let canonical: URL;
  try {
    canonical = new URL(canonicalOrigin);
  } catch {
    return false;
  }
  return url.hostname !== canonical.hostname;
}
