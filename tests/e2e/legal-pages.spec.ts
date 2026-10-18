import { test, expect } from "@playwright/test";
import { e2eEnv } from "./support/env";
import { waitForIslands } from "./support/hydration";
import { admin, findUserIdByEmail } from "./support/supabase-admin";
import { uniqueStamp } from "./support/test-data";

/**
 * FR-025 (S-20, `legal-pages`): regulamin i polityka prywatności są publiczne i
 * da się do nich dojść. Ryzyko nie ma numeru w `context/foundation/test-plan.md`;
 * test nazywa je po wymaganiu. Przecina routing i middleware (`PROTECTED_ROUTES`
 * — `/plan` to prefiks, a `/polityka-prywatnosci` zaczyna się na tę samą literę),
 * render Markdownu z kotwicami nagłówków i stopkę publiczną.
 *
 * Testy stron wyłącznie czytają: treść jest w SSR, więc `waitForIslands` nie
 * jest potrzebne. Testy rejestracji klikają w wyspę formularza i go potrzebują.
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
      // `not.toBeInViewport()` przechodzi też, gdy nagłówka nie ma wcale — bez
      // tego warunku strona z uciętą treścią dochodziła aż do kliknięcia i padała
      // mylącym „not in viewport”.
      await expect(target).toBeAttached();
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

/**
 * Regulamin § 5 ust. 1: konto nie powstaje bez akceptacji Regulaminu. Dwie drogi,
 * bo walidacja wyspy i odmowa trasy to dwie niezależne bramki — przeglądarka bez
 * JavaScriptu omija pierwszą.
 *
 * Brak konta sprawdzamy **kluczem serwisowym**, świadomie wbrew E2E-RULES (jak
 * `help-and-contact.spec.ts`): żaden klient aplikacji nie odróżni „konta nie ma”
 * od „hasło złe”. Ten odczyt mówi wyłącznie „rejestracja nie doszła do bazy”.
 */
async function accountExists(email: string): Promise<boolean> {
  return (await findUserIdByEmail(email)) !== null;
}

test.describe("FR-025 — rejestracja wymaga akceptacji Regulaminu", () => {
  let email = "";

  test.afterEach(async () => {
    // Sprzątanie na wypadek czerwonego przebiegu, w którym konto jednak powstało.
    if (!email) return;
    const userId = await findUserIdByEmail(email);
    if (userId) await admin().auth.admin.deleteUser(userId);
    email = "";
  });

  test("FR-025: formularz bez zaznaczonej akceptacji pokazuje błąd i zostaje na rejestracji", async ({ page }) => {
    email = `bez-regulaminu-${uniqueStamp()}@example.test`;

    await page.goto("/auth/signup");
    await waitForIslands(page);
    await page.getByLabel("Adres e-mail").fill(email);
    await page.getByLabel("Hasło", { exact: true }).fill(e2eEnv.password);
    await page.getByLabel("Powtórz hasło").fill(e2eEnv.password);
    await expect(page.getByRole("checkbox", { name: /Akceptuję Regulamin/ })).not.toBeChecked();
    await page.getByRole("button", { name: "Załóż konto" }).click();

    await expect(page.getByText("Zaakceptuj Regulamin, aby założyć konto")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/auth/signup");
    expect(await accountExists(email)).toBe(false);
  });

  test.describe("bez JavaScriptu", () => {
    test.use({ javaScriptEnabled: false });

    test("FR-025: trasa odrzuca rejestrację bez akceptacji po polsku i nie zakłada konta", async ({ page }) => {
      email = `bez-js-${uniqueStamp()}@example.test`;

      await page.goto("/auth/signup");
      await page.getByLabel("Adres e-mail").fill(email);
      await page.getByLabel("Hasło", { exact: true }).fill(e2eEnv.password);
      await page.getByLabel("Powtórz hasło").fill(e2eEnv.password);
      await page.getByRole("button", { name: "Załóż konto" }).click();

      await page.waitForURL("**/auth/signup?error=terms_not_accepted");
      await expect(page.getByText("Zaakceptuj Regulamin, aby założyć konto.")).toBeVisible();
      expect(await accountExists(email)).toBe(false);
    });
  });
});
