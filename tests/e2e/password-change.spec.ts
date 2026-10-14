import { test, expect, type Page } from "@playwright/test";
import { waitForIslands } from "./support/hydration";
import { admin } from "./support/supabase-admin";
import { uniqueStamp } from "./support/test-data";

/**
 * FR-023 — zmiana hasła wylogowuje pozostałe urządzenia (S-17, `password-change`).
 *
 * Kryterium z roadmapy dotyczy **drugiej** sesji, nie tej, która zmienia hasło:
 * zmiana hasła po podejrzeniu włamania nic nie daje, jeśli komputer w
 * przedszkolu nadal jest zalogowany. Tego nie dowiedzie test trasy z
 * zamockowanym klientem — `signOut({ scope: "others" })` i odczyt sesji przez
 * middleware na kolejnej nawigacji żyją w prawdziwej Supabase.
 *
 * Konto jest jednorazowe, a plik nie używa `storageState`: zmiana hasła na
 * stałym koncie nauczyciela A wylogowałaby resztę zestawu. Logowanie przez
 * formularz jest tu świadomym wyjątkiem od E2E-RULES, jak w
 * `password-reset.spec.ts` — hasło jest właśnie zachowaniem pod testem.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const OLD_PASSWORD = "stare-haslo-e2e";
const NEW_PASSWORD = "nowe-haslo-e2e";

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/auth/signin");
  await waitForIslands(page);
  await page.getByLabel("Adres e-mail").fill(email);
  await page.getByLabel("Hasło", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
}

async function fillPasswordChange(page: Page, current: string, next: string): Promise<void> {
  await waitForIslands(page);
  await page.getByLabel("Obecne hasło", { exact: true }).fill(current);
  await page.getByLabel("Nowe hasło", { exact: true }).fill(next);
  await page.getByLabel("Powtórz nowe hasło", { exact: true }).fill(next);
  await page.getByRole("button", { name: "Zapisz nowe hasło" }).click();
}

test.describe("FR-023 — zmiana hasła w ustawieniach konta", () => {
  let userId: string | null = null;

  test.afterEach(async () => {
    if (!userId) return;
    const { error } = await admin().auth.admin.deleteUser(userId);
    userId = null;
    if (error) throw new Error(`Nie udało się usunąć konta testowego: ${error.message}`);
  });

  test("FR-023: po zmianie hasła drugie urządzenie traci dostęp, to urządzenie zostaje zalogowane", async ({
    browser,
  }) => {
    const email = `e2e-zmiana-hasla-${uniqueStamp()}@example.test`;
    const { data, error } = await admin().auth.admin.createUser({
      email,
      password: OLD_PASSWORD,
      email_confirm: true,
    });
    if (error) throw new Error(`Nie udało się założyć konta ${email}: ${error.message}`);
    userId = data.user.id;

    // Dwie prawdziwe sesje tego samego konta, każda z własnymi ciasteczkami.
    const contextA = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const contextB = await browser.newContext({ storageState: { cookies: [], origins: [] } });

    try {
      const pageA = await contextA.newPage();
      const pageB = await contextB.newPage();
      await signIn(pageA, email, OLD_PASSWORD);
      await pageA.waitForURL("**/plan/month");
      await signIn(pageB, email, OLD_PASSWORD);
      await pageB.waitForURL("**/plan/month");

      // Do ustawień przez menu konta w nagłówku.
      await waitForIslands(pageA);
      await pageA.getByRole("button", { name: `Menu konta: ${email}` }).click();
      await pageA.getByRole("menuitem", { name: "Ustawienia konta" }).click();
      await pageA.waitForURL("**/ustawienia");
      await expect(pageA.getByRole("region", { name: "Konto" }).getByText(email, { exact: true })).toBeVisible();

      // Złe obecne hasło: komunikat o obecnym haśle i nic się nie zmienia.
      await fillPasswordChange(pageA, "zle-obecne-haslo", NEW_PASSWORD);
      await pageA.waitForURL("**/ustawienia?error=current_password_invalid");
      await expect(
        pageA.getByText("Obecne hasło jest nieprawidłowe. Sprawdź je i spróbuj ponownie.", { exact: true }),
      ).toBeVisible();
      await pageB.goto("/plan/month");
      await expect(pageB).toHaveURL(/\/plan\/month$/);

      // Poprawne obecne hasło: potwierdzenie na tym samym ekranie. Że stare
      // hasło po złej próbie nadal działało, dowodzi dopiero ten krok — trasa
      // przyjmuje je jako obecne.
      await fillPasswordChange(pageA, OLD_PASSWORD, NEW_PASSWORD);
      await pageA.waitForURL(/\/ustawienia$/);
      const notice = pageA.getByRole("status").filter({ hasText: "Hasło zostało zmienione." });
      await expect(notice).toBeVisible();
      // Jednorazowe: przeładowanie usuwa potwierdzenie.
      await pageA.reload();
      await expect(pageA.getByRole("heading", { name: "Zmień hasło" })).toBeVisible();
      await expect(notice).toBeHidden();

      // Wynik biznesowy: drugie urządzenie ląduje na logowaniu, to zostaje.
      await pageB.goto("/plan/month");
      await expect(pageB).toHaveURL(/\/auth\/signin$/);
      await pageA.goto("/plan/month");
      await expect(pageA).toHaveURL(/\/plan\/month$/);

      // Stare hasło przestało działać, nowe działa.
      await signIn(pageB, email, OLD_PASSWORD);
      await expect(pageB).toHaveURL(/\/auth\/signin\?error=/);
      await expect(
        pageB.getByText("Nieprawidłowy adres e-mail lub hasło. Sprawdź dane i spróbuj ponownie.", { exact: true }),
      ).toBeVisible();
      await signIn(pageB, email, NEW_PASSWORD);
      await pageB.waitForURL("**/plan/month");
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
