import { test, expect } from "@playwright/test";

/**
 * FR-025 (S-20, `legal-pages`): regulamin i polityka prywatności są publiczne i
 * da się do nich dojść. Ryzyko nie ma numeru w `context/foundation/test-plan.md`;
 * test nazywa je po wymaganiu. Przecina routing i middleware (`PROTECTED_ROUTES`
 * — `/plan` to prefiks, a `/polityka-prywatnosci` zaczyna się na tę samą literę),
 * render Markdownu z kotwicami nagłówków i stopkę publiczną.
 *
 * Testy wyłącznie czytające: treść jest w SSR, więc `waitForIslands` nie jest
 * potrzebne.
 */

// Odwiedzający bez konta: pusta sesja zamiast domyślnej nauczyciela A.
test.use({ storageState: { cookies: [], origins: [] } });

const DOCUMENTS = [
  { path: "/regulamin", title: "Regulamin", section: "§ 12. Rozwiązanie umowy" },
  { path: "/polityka-prywatnosci", title: "Polityka prywatności", section: "7. Pliki cookies" },
] as const;

test.describe("FR-025 — dokumenty prawne są publiczne i podlinkowane", () => {
  for (const doc of DOCUMENTS) {
    test(`FR-025: ${doc.path} otwiera się bez logowania, a spis treści prowadzi do sekcji`, async ({ page }) => {
      const response = await page.goto(doc.path);
      expect(response?.status()).toBe(200);
      // Bez przekierowania na logowanie.
      expect(new URL(page.url()).pathname).toBe(doc.path);

      await expect(page.getByRole("heading", { level: 1, name: doc.title, exact: true })).toBeVisible();

      const target = page.getByRole("heading", { level: 2, name: doc.section, exact: true });
      await expect(target).not.toBeInViewport();
      await page.getByRole("navigation", { name: "Spis treści" }).getByRole("link", { name: doc.section }).click();
      await expect(target).toBeInViewport();
    });
  }

  test("FR-025: stopka strony publicznej prowadzi do obu dokumentów", async ({ page }) => {
    await page.goto("/pomoc");
    const footer = page.getByRole("navigation", { name: "Stopka" });

    await footer.getByRole("link", { name: "Regulamin", exact: true }).click();
    await page.waitForURL("**/regulamin");
    await expect(page.getByRole("heading", { level: 1, name: "Regulamin", exact: true })).toBeVisible();

    await page
      .getByRole("navigation", { name: "Stopka" })
      .getByRole("link", { name: "Polityka prywatności", exact: true })
      .click();
    await page.waitForURL("**/polityka-prywatnosci");
    await expect(page.getByRole("heading", { level: 1, name: "Polityka prywatności", exact: true })).toBeVisible();
  });
});
