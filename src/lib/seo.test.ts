import { describe, expect, it } from "vitest";

import { HOME_TITLE, canonicalUrl, isIndexable, normalizePath, pageTitle } from "./seo";

// Pure functions, nothing mocked.

describe("normalizePath", () => {
  it("strips a trailing slash", () => {
    expect(normalizePath("/auth/signin/")).toBe("/auth/signin");
  });

  it("leaves a path without a trailing slash alone", () => {
    expect(normalizePath("/plan/month")).toBe("/plan/month");
  });

  it("keeps the root as it is", () => {
    expect(normalizePath("/")).toBe("/");
  });
});

describe("pageTitle", () => {
  it("gives the landing page title when no title is passed", () => {
    expect(pageTitle()).toBe(HOME_TITLE);
    expect(HOME_TITLE).toBe("Temio — plan zajęć przedszkolnych");
  });

  it("appends the brand to a page title", () => {
    expect(pageTitle("Zaloguj się")).toBe("Zaloguj się · Temio");
  });
});

describe("isIndexable", () => {
  it.each(["/", "/auth/signin", "/auth/signin/", "/auth/signup", "/auth/signup/"])("indexes %s", (path) => {
    expect(isIndexable(path)).toBe(true);
  });

  it.each(["/plan/month", "/plan/month/", "/plan", "/auth/confirm", "/auth/new-password", "/auth/signin/extra"])(
    "does not index %s",
    (path) => {
      expect(isIndexable(path)).toBe(false);
    },
  );
});

describe("canonicalUrl", () => {
  it("drops a trailing slash", () => {
    expect(canonicalUrl("/auth/signin/", "https://temio.pl")).toBe("https://temio.pl/auth/signin");
  });

  it("gives the root with its slash", () => {
    expect(canonicalUrl("/", "https://temio.pl")).toBe("https://temio.pl/");
  });

  it("uses only the site's origin, whatever host served the page", () => {
    expect(canonicalUrl("/plan/week", new URL("https://temio.pl/"))).toBe("https://temio.pl/plan/week");
  });
});
