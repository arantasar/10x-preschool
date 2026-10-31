import { test, expect } from "@playwright/test";

test("tymczasowy dowod: test zielony przy drugiej probie czerwieni przebieg", ({}, testInfo) => {
  expect(testInfo.retry).toBeGreaterThan(0);
});
