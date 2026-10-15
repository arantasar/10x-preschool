import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { waitForIslands } from "./support/hydration";
import { admin, seedDayPlan } from "./support/supabase-admin";
import { activitiesFor, uniquePlanDate, uniqueStamp } from "./support/test-data";

/**
 * FR-024 — usunięcie konta razem ze wszystkimi planami (S-18, `account-deletion`).
 *
 * To jedyna operacja w produkcie, która działa ponad RLS (`delete_own_account()`,
 * `security definer`). pgTAP dowodzi granicy w bazie; ten plik dowodzi całej
 * drogi: formularz z hasłem, okno potwierdzenia, trasa, kaskada, ciasteczka tej
 * przeglądarki i sesja na **drugim** urządzeniu — oraz tego, że konto obok
 * (B, postronne) zostaje nietknięte.
 *
 * Konta są jednorazowe, a plik nie używa `storageState`: usunięcie stałego konta
 * nauczyciela A rozbiłoby resztę zestawu. Logowanie przez formularz jest tu
 * świadomym wyjątkiem od E2E-RULES, jak w `password-change.spec.ts` — hasło jest
 * właśnie zachowaniem pod testem.
 *
 * **Wyjątek od „klucz serwisowy nigdy do asercji”.** Reguła chroni asercje o
 * izolacji, które odczyt omijający RLS by zafałszował. Tutaj pytanie brzmi „czy
 * wiersz w ogóle istnieje w bazie” — usuniętego konta nie da się już zapytać
 * jako ono samo, a RLS nie ma w tym pytaniu nic do ukrycia. Tylko te trzy
 * odczyty idą przez `admin()`; wszystko, co widzi nauczycielka, idzie przez
 * przeglądarkę.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const PASSWORD = "haslo-do-usuniecia-e2e";
const NOTICE = "Konto zostało usunięte razem ze wszystkimi planami.";

async function createAccount(label: string): Promise<{ id: string; email: string }> {
  const email = `e2e-usun-konto-${label}-${uniqueStamp()}@example.test`;
  const { data, error } = await admin().auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw new Error(`Nie udało się założyć konta ${email}: ${error.message}`);
  return { id: data.user.id, email };
}

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/auth/signin");
  await waitForIslands(page);
  await page.getByLabel("Adres e-mail").fill(email);
  await page.getByLabel("Hasło", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
}

async function freshContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ storageState: { cookies: [], origins: [] } });
}

/** Do karty „Usuń konto” przez pozycję menu ustawień, wpisuje hasło i wysyła. */
async function submitDeletion(page: Page, password: string): Promise<void> {
  await page.goto("/ustawienia");
  await waitForIslands(page);
  await page.getByRole("navigation", { name: "Ustawienia" }).getByRole("link", { name: "Usuń konto" }).click();
  const card = page.getByRole("region", { name: "Usuń konto" });
  await card.getByLabel("Obecne hasło", { exact: true }).fill(password);
  await card.getByRole("button", { name: "Usuń konto…", exact: true }).click();
}

test.describe("FR-024 — usunięcie konta w ustawieniach", () => {
  const userIds: string[] = [];

  test.afterEach(async () => {
    // Konto A po udanym teście już nie istnieje - "nie znaleziono" to nie błąd.
    for (const id of userIds.splice(0)) {
      const { error } = await admin().auth.admin.deleteUser(id);
      if (error && error.status !== 404) {
        throw new Error(`Nie udało się usunąć konta testowego: ${error.message}`);
      }
    }
  });

  test("FR-024: złe hasło nie usuwa konta i pokazuje komunikat w karcie", async ({ page, browser }) => {
    const a = await createAccount("zle-haslo");
    userIds.push(a.id);

    await signIn(page, a.email, PASSWORD);
    await page.waitForURL("**/plan/month");

    await submitDeletion(page, "zle-obecne-haslo");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(a.email);
    await dialog.getByRole("button", { name: "Usuń konto", exact: true }).click();

    await page.waitForURL("**/ustawienia?delete_error=current_password_invalid#usun-konto");
    await expect(
      page
        .getByRole("region", { name: "Usuń konto" })
        .getByText("Obecne hasło jest nieprawidłowe. Sprawdź je i spróbuj ponownie.", { exact: true }),
    ).toBeVisible();

    // Konto stoi: sesja nadal otwiera planer, a hasło nadal loguje.
    await page.goto("/plan/month");
    await expect(page).toHaveURL(/\/plan\/month$/);
    const other = await freshContext(browser);
    try {
      const otherPage = await other.newPage();
      await signIn(otherPage, a.email, PASSWORD);
      await otherPage.waitForURL("**/plan/month");
    } finally {
      await other.close();
    }
  });

  test("FR-024: „Zostaw” w oknie potwierdzenia niczego nie wysyła", async ({ page }) => {
    const a = await createAccount("zostaw");
    userIds.push(a.id);

    await signIn(page, a.email, PASSWORD);
    await page.waitForURL("**/plan/month");

    const deletionRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/auth/delete-account")) deletionRequests.push(request.url());
    });

    await submitDeletion(page, PASSWORD);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Tej operacji nie można cofnąć.");
    await dialog.getByRole("button", { name: "Zostaw", exact: true }).click();
    await expect(dialog).toHaveCount(0);

    await expect(page).toHaveURL(/\/ustawienia#usun-konto$/);
    expect(deletionRequests).toEqual([]);
    await page.goto("/plan/month");
    await expect(page).toHaveURL(/\/plan\/month$/);
  });

  test("FR-024: usunięcie zabiera konto i plany, odcina drugie urządzenie i nie dotyka cudzego konta", async ({
    browser,
  }) => {
    const a = await createAccount("a");
    const b = await createAccount("b");
    userIds.push(a.id, b.id);

    const stamp = uniqueStamp();
    await seedDayPlan({
      userId: a.id,
      planDate: uniquePlanDate(),
      prompt: `plan A ${stamp}`,
      activities: activitiesFor(stamp),
    });
    const bPlanId = await seedDayPlan({
      userId: b.id,
      planDate: uniquePlanDate(),
      prompt: `plan B ${stamp}`,
      activities: activitiesFor(stamp),
    });

    // Dwie prawdziwe sesje konta A, każda z własnymi ciasteczkami.
    const context1 = await freshContext(browser);
    const context2 = await freshContext(browser);

    try {
      const page1 = await context1.newPage();
      const page2 = await context2.newPage();
      await signIn(page1, a.email, PASSWORD);
      await page1.waitForURL("**/plan/month");
      await signIn(page2, a.email, PASSWORD);
      await page2.waitForURL("**/plan/month");

      await submitDeletion(page1, PASSWORD);
      const dialog = page1.getByRole("dialog");
      await expect(dialog).toContainText(a.email);
      await dialog.getByRole("button", { name: "Usuń konto", exact: true }).click();

      // Strona główna z jednorazowym komunikatem.
      await page1.waitForURL((url) => url.pathname === "/");
      const notice = page1.getByRole("status").filter({ hasText: NOTICE });
      await expect(notice).toBeVisible();
      await page1.reload();
      await expect(page1.getByRole("link", { name: "Zaloguj się" }).first()).toBeVisible();
      await expect(notice).toBeHidden();

      // Ta przeglądarka nie ma już sesji.
      await page1.goto("/plan/month");
      await expect(page1).toHaveURL(/\/auth\/signin$/);

      // Drugie urządzenie traci dostęp na najbliższym żądaniu.
      await page2.goto("/plan/month");
      await expect(page2).toHaveURL(/\/auth\/signin$/);

      // Stare dane logowania już nie działają.
      await signIn(page1, a.email, PASSWORD);
      await expect(page1).toHaveURL(/\/auth\/signin\?error=/);
      await expect(
        page1.getByText("Nieprawidłowy adres e-mail lub hasło. Sprawdź dane i spróbuj ponownie.", { exact: true }),
      ).toBeVisible();
    } finally {
      await context1.close();
      await context2.close();
    }

    // W bazie: nie ma konta A ani jego planów, plan B stoi.
    const { data: gone } = await admin().auth.admin.getUserById(a.id);
    expect(gone.user).toBeNull();

    const { count: aPlans, error: aPlansError } = await admin()
      .from("day_plans")
      .select("id", { count: "exact", head: true })
      .eq("user_id", a.id);
    expect(aPlansError).toBeNull();
    expect(aPlans).toBe(0);

    const { data: bPlan, error: bPlanError } = await admin().from("day_plans").select("id").eq("id", bPlanId);
    expect(bPlanError).toBeNull();
    expect(bPlan).toEqual([{ id: bPlanId }]);
  });
});
