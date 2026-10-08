/**
 * Moves a request on the old production host (`10x-preschool.<account>.workers.dev`)
 * to the canonical origin (`https://temio.pl`), keeping the path and the query.
 *
 * Inert until both values are set (`LEGACY_HOST` / `CANONICAL_ORIGIN` in
 * `wrangler.jsonc` `vars`), so the code can ship before the domain exists. The
 * host match is **exact**: preview hosts (`<id>-10x-preschool.<account>.workers.dev`)
 * and `localhost` never match, so previews and local dev are never redirected.
 *
 * GET and HEAD get a 301. Anything else gets a 308, which keeps the method and
 * the body - a 301 would let a browser turn a sign-in POST into a GET.
 */
export function canonicalRedirect(
  url: URL,
  method: string,
  legacyHost: string | undefined,
  canonicalOrigin: string | undefined,
): { location: string; status: 301 | 308 } | null {
  if (!legacyHost || !canonicalOrigin) return null;
  if (url.hostname !== legacyHost) return null;

  const target = new URL(canonicalOrigin);
  // A misconfiguration that names the same host twice would redirect to itself forever.
  if (target.hostname === legacyHost) return null;

  const safe = method === "GET" || method === "HEAD";
  return { location: `${target.origin}${url.pathname}${url.search}`, status: safe ? 301 : 308 };
}
