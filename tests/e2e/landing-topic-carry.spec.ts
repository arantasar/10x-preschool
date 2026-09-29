import { test, expect } from "@playwright/test";
import { e2eEnv } from "./support/env";
import { waitForIslands } from "./support/hydration";
import { ensureTeacher, TEACHER_A } from "./support/supabase-admin";
import { uniqueStamp } from "./support/test-data";

/**
 * N1 (`design-foundation`) — hasło wpisane na stronie głównej przez gościa
 * czeka na niego do pierwszego logowania i wypełnia formularz tygodnia.
 *
 * To jedyny test w zestawie poza `auth.setup.ts`, który loguje się przez
 * formularz — i musi: ryzyko siedzi dokładnie w drodze gość → rejestracja →
 * logowanie, czyli w ciasteczku, które przeżywa tę drogę, i w przekierowaniu
 * wybranym przez `/api/auth/signin`. Gotowy `storageState` ominąłby oba.
 *
 * Nic nie generuje i nic nie zapisuje — samo wypełnienie pola — więc nie ma
 * czego sprzątać.
 */
test.describe("N1 — hasło z landingu przeżywa rejestrację i logowanie", () => {
  // Gość: bez sesji konta A, którą zestaw daje domyślnie.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("N1: hasło z landingu wypełnia „Hasło tygodnia” po zalogowaniu — i tylko raz", async ({ page }) => {
    // Unikalne hasło: asercja nie może przejść na haśle zapisanym w bieżącym
    // tygodniu konta A przez kogokolwiek wcześniej.
    const topic = `Dinozaury ${uniqueStamp()}`;
    await ensureTeacher(TEACHER_A);

    await page.goto("/");
    await page.getByLabel("Temat").fill(topic);
    await page.getByRole("button", { name: "Wygeneruj propozycje" }).click();
    await page.waitForURL(/\/auth\/signup\?haslo=/);

    // Konto już istnieje, więc z rejestracji przechodzimy do logowania — tak jak
    // nauczyciel po kliknięciu linku potwierdzającego. Link nie niesie hasła;
    // niesie je ciasteczko.
    await page.getByRole("link", { name: "Zaloguj się" }).click();
    await page.waitForURL("**/auth/signin");

    await waitForIslands(page);
    await page.getByLabel("Adres e-mail").fill(TEACHER_A.email);
    await page.getByLabel("Hasło", { exact: true }).fill(e2eEnv.password);
    await page.getByRole("button", { name: "Zaloguj się" }).click();

    await page.waitForURL(/\/plan\/week/);
    await expect(page.getByLabel("Hasło tygodnia")).toHaveValue(topic);

    // Jednorazowe: pierwsze wyświetlenie tygodnia zużyło ciasteczko.
    await page.goto("/plan/week");
    await expect(page.getByLabel("Hasło tygodnia")).toBeVisible();
    await expect(page.getByLabel("Hasło tygodnia")).not.toHaveValue(topic);
  });
});
