import { describe, expect, it } from "vitest";

import { canonicalRedirect, isOffCanonicalHost } from "./canonical-host";

// Pure function, nothing mocked.

const LEGACY = "10x-preschool.example.workers.dev";
const CANONICAL = "https://temio.pl";

describe("canonicalRedirect", () => {
  it("sends a GET on the legacy host to the canonical origin with a 301, keeping path and query", () => {
    const url = new URL(`https://${LEGACY}/auth/signin?x=1&haslo=jesie%C5%84`);

    expect(canonicalRedirect(url, "GET", LEGACY, CANONICAL)).toEqual({
      location: "https://temio.pl/auth/signin?x=1&haslo=jesie%C5%84",
      status: 301,
    });
  });

  it("answers HEAD like GET", () => {
    expect(canonicalRedirect(new URL(`https://${LEGACY}/`), "HEAD", LEGACY, CANONICAL)?.status).toBe(301);
  });

  it("keeps the method for a POST with a 308", () => {
    expect(canonicalRedirect(new URL(`https://${LEGACY}/api/auth/signin`), "POST", LEGACY, CANONICAL)).toEqual({
      location: "https://temio.pl/api/auth/signin",
      status: 308,
    });
  });

  it("leaves a preview host alone - the match is exact, not a suffix", () => {
    const preview = new URL(`https://abc123-${LEGACY}/auth/signin`);

    expect(canonicalRedirect(preview, "GET", LEGACY, CANONICAL)).toBeNull();
  });

  it("leaves localhost alone", () => {
    expect(canonicalRedirect(new URL("http://localhost:4321/"), "GET", LEGACY, CANONICAL)).toBeNull();
  });

  it.each([
    ["LEGACY_HOST", undefined, CANONICAL],
    ["CANONICAL_ORIGIN", LEGACY, undefined],
    ["both", undefined, undefined],
    ["LEGACY_HOST (empty)", "", CANONICAL],
  ])("is inert when %s is missing", (_name, legacy, canonical) => {
    expect(canonicalRedirect(new URL(`https://${LEGACY}/`), "GET", legacy, canonical)).toBeNull();
  });

  it("does not redirect the canonical host to itself", () => {
    expect(canonicalRedirect(new URL("https://temio.pl/auth/signin"), "GET", LEGACY, CANONICAL)).toBeNull();
  });

  it("stays inert instead of throwing when CANONICAL_ORIGIN is malformed", () => {
    expect(canonicalRedirect(new URL(`https://${LEGACY}/`), "GET", LEGACY, "temio.pl")).toBeNull();
  });

  it("uses only the origin of CANONICAL_ORIGIN, dropping a path or trailing slash", () => {
    expect(
      canonicalRedirect(new URL(`https://${LEGACY}/plan/week`), "GET", LEGACY, "https://temio.pl/x/")?.location,
    ).toBe("https://temio.pl/plan/week");
  });

  it("does not loop when both values name the same host", () => {
    expect(canonicalRedirect(new URL("https://temio.pl/"), "GET", "temio.pl", CANONICAL)).toBeNull();
  });
});

describe("isOffCanonicalHost", () => {
  it("is inert when CANONICAL_ORIGIN is unset", () => {
    expect(isOffCanonicalHost(new URL("https://abc123-10x-preschool.example.workers.dev/"), undefined)).toBe(false);
  });

  it("stays inert instead of throwing when CANONICAL_ORIGIN is malformed", () => {
    expect(isOffCanonicalHost(new URL("https://abc123-10x-preschool.example.workers.dev/"), "temio.pl")).toBe(false);
  });

  it("leaves the canonical host alone", () => {
    expect(isOffCanonicalHost(new URL("https://temio.pl/auth/signin"), CANONICAL)).toBe(false);
  });

  it("marks a preview host", () => {
    expect(isOffCanonicalHost(new URL("https://abc123-10x-preschool.example.workers.dev/"), CANONICAL)).toBe(true);
  });

  it("marks localhost once CANONICAL_ORIGIN is set", () => {
    expect(isOffCanonicalHost(new URL("http://localhost:4321/"), CANONICAL)).toBe(true);
  });
});
