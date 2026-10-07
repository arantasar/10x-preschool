import { test, expect } from "@playwright/test";
import { waitForIslands } from "./support/hydration";
import { waitForConfirmLink } from "./support/mailpit";
import { admin, deleteSeededPlans, seedDayPlan } from "./support/supabase-admin";
import { activitiesFor, uniqueStamp } from "./support/test-data";

/**
 * US-04 / FR-022 — reset hasła przez e-mail (S-16, `password-reset`).
 *
 * Ryzyko, którego pilnuje ten plik, mieszka na szwie, którego żadna funkcja
 * czysta nie obejmie: szablon maila (`supabase/templates/recovery.html`) buduje
 * link z `{{ .RedirectTo }}`, trasa `/api/auth/forgot-password` ustawia ten
 * adres, a `/auth/confirm` musi go zrozumieć. Rozjazd którejkolwiek z trzech
 * części — szablon wrócony do `{{ .ConfirmationURL }}`, adres spoza listy
 * przekierowań — psuje przepływ bez żadnego błędu po drodze.
 *
 * Każdy test zakłada **własne, jednorazowe konto**: zmiana hasła wylogowuje
 * pozostałe sesje, więc na stałym koncie nauczyciela A rozłożyłaby resztę
 * zestawu. Z tego samego powodu plik nie używa `storageState` — zaczyna jako
 * gość, jak nauczyciel, który zapomniał hasła.
 */
test.use({ storageState: { cookies: [], origins: [] } });

const OLD_PASSWORD = "stare-haslo-e2e";
const NEW_PASSWORD = "nowe-haslo-e2e";

/**
 * Pierwszy dzień roboczy bieżącego miesiąca — tam, gdzie po resecie ląduje
 * nauczyciel. Miesiąc liczony w Europe/Warsaw, tak jak liczy go serwer: zegar
 * maszyny testowej w innej strefie zasiałby plan w miesiącu, którego
 * `/plan/month` nie pokazuje.
 */
function firstWorkingDayOfThisMonth(): string {
  const [year, month] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" })
    .format(new Date())
    .split("-")
    .map(Number);
  const day = new Date(Date.UTC(year, month - 1, 1));
  while (day.getUTCDay() === 0 || day.getUTCDay() === 6) {
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return day.toISOString().slice(0, 10);
}

test.describe("Ryzyko #15 — reset hasła przez e-mail (US-04)", () => {
  let userId: string | null = null;
  const seededPlanIds: string[] = [];

  test.afterEach(async () => {
    // Konto znika nawet wtedy, gdy sprzątanie planów padnie — inaczej każde
    // nieudane sprzątanie zostawia w bazie jednorazowe konto.
    let deleteUserError: string | null = null;
    try {
      await deleteSeededPlans(seededPlanIds);
    } finally {
      seededPlanIds.length = 0;
      if (userId) {
        const { error } = await admin().auth.admin.deleteUser(userId);
        userId = null;
        deleteUserError = error?.message ?? null;
      }
    }
    if (deleteUserError) throw new Error(`Nie udało się usunąć konta testowego: ${deleteUserError}`);
  });

  test("ryzyko #15: link z maila ustawia nowe hasło, a nauczyciel ląduje na miesiącu ze swoimi planami", async ({
    page,
  }) => {
    const stamp = uniqueStamp();
    const email = `e2e-reset-${stamp}@example.test`;

    const { data, error } = await admin().auth.admin.createUser({
      email,
      password: OLD_PASSWORD,
      email_confirm: true,
    });
    if (error) throw new Error(`Nie udało się założyć konta ${email}: ${error.message}`);
    userId = data.user.id;

    const theme = `Reset ${stamp}`;
    const planDate = firstWorkingDayOfThisMonth();
    seededPlanIds.push(
      await seedDayPlan({
        userId,
        planDate,
        prompt: theme,
        theme,
        activities: activitiesFor(stamp),
      }),
    );

    // Prośba o reset — od strony logowania, jak w US-04.
    await page.goto("/auth/signin");
    await page.getByRole("link", { name: "Nie pamiętasz hasła?" }).click();
    await page.waitForURL("**/auth/forgot-password");
    await waitForIslands(page);
    await page.getByLabel("Adres e-mail").fill(email);
    await page.getByRole("button", { name: "Wyślij link" }).click();
    await page.waitForURL("**/auth/forgot-password/sent");
    await expect(page.getByRole("heading", { name: "Sprawdź skrzynkę" })).toBeVisible();
    await expect(page.getByText(email, { exact: true })).toBeVisible();

    // Link z prawdziwego maila — to on jest szwem szablon ↔ trasa.
    const link = await waitForConfirmLink(email);
    const linkUrl = new URL(link);
    expect(linkUrl.pathname).toBe("/auth/confirm");
    expect(linkUrl.searchParams.get("type")).toBe("recovery");

    await page.goto(link);
    await page.getByRole("button", { name: "Ustaw nowe hasło" }).click();
    await page.waitForURL("**/auth/new-password");
    await expect(page.getByText(email, { exact: true })).toBeVisible();

    await waitForIslands(page);
    await page.getByLabel("Nowe hasło", { exact: true }).fill(NEW_PASSWORD);
    await page.getByLabel("Powtórz nowe hasło", { exact: true }).fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Zapisz nowe hasło" }).click();

    // Wynik biznesowy: miesiąc, potwierdzenie i plan, który był tu przed resetem.
    await page.waitForURL("**/plan/month");
    await expect(page.getByRole("status").filter({ hasText: "Hasło zostało zmienione." })).toBeVisible();
    await expect(page.getByRole("link", { name: new RegExp(`^Plan na ${planDate} — ${theme}`) })).toBeVisible();

    // Stare hasło przestało działać, nowe działa. Logowanie przez formularz
    // jest tu świadomym wyjątkiem od E2E-RULES (storageState zamiast formularza):
    // zmiana hasła to właśnie zachowanie pod testem, a sesji z storageState nie
    // da się zapytać, które hasło przyjmuje.
    await page.getByRole("button", { name: "Wyloguj się" }).click();
    await page.goto("/auth/signin");
    await waitForIslands(page);
    await page.getByLabel("Adres e-mail").fill(email);
    await page.getByLabel("Hasło", { exact: true }).fill(OLD_PASSWORD);
    await page.getByRole("button", { name: "Zaloguj się" }).click();
    await page.waitForURL("**/auth/signin?error=*");
    await expect(page.getByText("Nieprawidłowy adres e-mail lub hasło.")).toBeVisible();

    await waitForIslands(page);
    await page.getByLabel("Adres e-mail").fill(email);
    await page.getByLabel("Hasło", { exact: true }).fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Zaloguj się" }).click();
    await page.waitForURL("**/plan/month");
  });

  test("ryzyko #15: adres bez konta prowadzi na tę samą stronę „Sprawdź skrzynkę”", async ({ page }) => {
    const email = `e2e-reset-nikt-${uniqueStamp()}@example.test`;

    await page.goto("/auth/forgot-password");
    await waitForIslands(page);
    await page.getByLabel("Adres e-mail").fill(email);
    await page.getByRole("button", { name: "Wyślij link" }).click();

    await page.waitForURL("**/auth/forgot-password/sent");
    await expect(page.getByRole("heading", { name: "Sprawdź skrzynkę" })).toBeVisible();
    await expect(page.getByText(email, { exact: true })).toBeVisible();
  });
});
