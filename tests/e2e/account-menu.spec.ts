import { test, expect, type Page } from "@playwright/test";
import { waitForIslands } from "./support/hydration";
import { admin, TEACHER_A } from "./support/supabase-admin";
import { uniqueStamp } from "./support/test-data";

/**
 * Menu konta w nagłówku aplikacji (`header-update`, makieta 19).
 *
 * Od tej zmiany jedyna droga wyjścia z aplikacji — „Wyloguj się” — i jedyna
 * droga do ustawień, pomocy i kontaktu z ekranu zalogowanego prowadzą przez
 * jeden przycisk-wyspę. Przed hydracją ten przycisk nic nie robi, a „Wyloguj
 * się” wysyła formularz spoza portalu menu: obie rzeczy istnieją tylko w
 * wyrenderowanej stronie, nie w żadnej funkcji czystej.
 *
 * Testy czytające chodzą na wspólnej sesji nauczyciela A. Wylogowanie — nie:
 * zamknęłoby tę sesję pod równoległymi testami, więc idzie na jednorazowym
 * koncie, zalogowanym przez formularz, jak w `password-change.spec.ts`.
 */

function accountMenuButton(page: Page, email: string) {
  return page.getByRole("button", { name: `Menu konta: ${email}` });
}

test.describe("Menu konta — ustawienia, pomoc, kontakt i wylogowanie z nagłówka", () => {
  test("menu konta: adres widać dopiero po otwarciu, a Esc zamyka menu i oddaje fokus przyciskowi", async ({
    page,
  }) => {
    await page.goto("/plan/month");
    await waitForIslands(page);

    // Pasek nagłówka nie pokazuje adresu — tylko awatar.
    await expect(page.getByText(TEACHER_A.email, { exact: true })).toBeHidden();

    const trigger = accountMenuButton(page, TEACHER_A.email);
    await trigger.click();

    const menu = page.getByRole("menu");
    await expect(menu.getByText("Zalogowano jako", { exact: true })).toBeVisible();
    await expect(menu.getByText(TEACHER_A.email, { exact: true })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Ustawienia konta" })).toHaveAttribute("href", "/ustawienia");
    await expect(menu.getByRole("menuitem", { name: "Pomoc" })).toHaveAttribute("href", "/pomoc");
    await expect(menu.getByRole("menuitem", { name: "Kontakt" })).toHaveAttribute("href", "/kontakt");
    await expect(menu.getByRole("menuitem", { name: "Wyloguj się" })).toBeVisible();
    // Poza ustawieniami nic w menu nie jest bieżące.
    await expect(menu.getByRole("menuitem", { name: "Ustawienia konta" })).not.toHaveAttribute("aria-current");

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("menu konta: „Pomoc” prowadzi na FAQ", async ({ page }) => {
    await page.goto("/plan/month");
    await waitForIslands(page);

    await accountMenuButton(page, TEACHER_A.email).click();
    await page.getByRole("menuitem", { name: "Pomoc" }).click();

    await page.waitForURL("**/pomoc");
  });

  test("menu konta: na ekranie ustawień „Ustawienia konta” jest oznaczone jako bieżąca strona", async ({ page }) => {
    await page.goto("/ustawienia");
    await waitForIslands(page);

    await accountMenuButton(page, TEACHER_A.email).click();

    await expect(page.getByRole("menuitem", { name: "Ustawienia konta" })).toHaveAttribute("aria-current", "page");
  });

  test.describe("wylogowanie", () => {
    // Jednorazowe konto, bez wspólnej sesji — patrz komentarz na górze pliku.
    test.use({ storageState: { cookies: [], origins: [] } });

    const PASSWORD = "haslo-menu-konta-e2e";
    let userId: string | null = null;

    test.afterEach(async () => {
      if (!userId) return;
      const { error } = await admin().auth.admin.deleteUser(userId);
      userId = null;
      if (error) throw new Error(`Nie udało się usunąć konta testowego: ${error.message}`);
    });

    test("menu konta: „Wyloguj się” kończy sesję — plan wraca na logowanie", async ({ page }) => {
      const email = `e2e-menu-konta-${uniqueStamp()}@example.test`;
      const { data, error } = await admin().auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
      if (error) throw new Error(`Nie udało się założyć konta ${email}: ${error.message}`);
      userId = data.user.id;

      await page.goto("/auth/signin");
      await waitForIslands(page);
      await page.getByLabel("Adres e-mail").fill(email);
      await page.getByLabel("Hasło", { exact: true }).fill(PASSWORD);
      await page.getByRole("button", { name: "Zaloguj się" }).click();
      await page.waitForURL("**/plan/month");

      await waitForIslands(page);
      await accountMenuButton(page, email).click();
      await page.getByRole("menuitem", { name: "Wyloguj się" }).click();
      await page.waitForURL((url) => url.pathname === "/");

      // Wynik biznesowy: sesji nie ma, chroniony plan odsyła na logowanie.
      await page.goto("/plan/month");
      await expect(page).toHaveURL(/\/auth\/signin$/);
    });
  });
});
