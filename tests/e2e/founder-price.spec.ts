import { test, expect, type Page } from "@playwright/test";
import { waitForIslands } from "./support/hydration";
import { admin } from "./support/supabase-admin";
import { uniqueStamp } from "./support/test-data";

/**
 * FR-029 / US-05 — zapis na cenę założycielską działa i mówi prawdę (S-22,
 * `founder-price-signup`). Z nagłówka do `/cennik`, przełącznik okresu, zapis
 * i uczciwe potwierdzenie („płatności jeszcze nie działają”) — anonimowo i jako
 * zalogowana nauczycielka, ze stanem „Jesteś na liście” po przeładowaniu.
 * Ryzyko przecina granice, których nie łączy żadna niższa warstwa: skrypt
 * przełącznika, hydrację wyspy z widżetem Turnstile, prawdziwą trasę, sesję i
 * RLS tabeli, która zalogowanej pokazuje tylko jej własny adres.
 *
 * Środowisko: `.dev.vars` ma klucze testowe Turnstile, które zawsze przechodzą.
 * Zestaw niczego tu nie mockuje.
 *
 * **Konto zalogowane jest jednorazowe, a logowanie idzie przez formularz** —
 * świadomy wyjątek od E2E-RULES, jak w `account-deletion.spec.ts`. Bycie na
 * liście to stan konta: na stałym koncie A równoległe i powtarzane przebiegi
 * (`--repeat-each`) widziałyby nawzajem swoje zapisy.
 *
 * **Wiersz anonimowy sprawdzamy kluczem serwisowym**, jak `help-and-contact`:
 * `anon` nie czyta tej tabeli wcale, więc ten odczyt mówi „zapis doszedł do
 * bazy, raz, z okresem z przełącznika”, a nie nic o izolacji kont. To, co widzi
 * zalogowana, idzie przez przeglądarkę.
 */

test.use({ storageState: { cookies: [], origins: [] } });

const PASSWORD = "haslo-cennik-e2e";
const LISTED_NOTE = "Płatności jeszcze nie działają, więc nic dziś nie płacisz.";

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/auth/signin");
  await waitForIslands(page);
  await page.getByLabel("Adres e-mail").fill(email);
  await page.getByLabel("Hasło", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Zaloguj się" }).click();
  await page.waitForURL("**/plan/month");
}

/** Wysyła formularz zapisu i czeka na odpowiedź trasy. */
async function reserve(page: Page): Promise<number> {
  const answered = page.waitForResponse(
    (response) => response.url().endsWith("/api/founder-price") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Zarezerwuj cenę założycielską" }).click();
  return (await answered).status();
}

test.describe("FR-029 — zapis na cenę założycielską", () => {
  const emails: string[] = [];
  const userIds: string[] = [];

  test.afterEach(async () => {
    // Po adresie: tożsamość tabeli to adres, a zapis anonimowy nie zwraca id.
    if (emails.length > 0) {
      const { error } = await admin().from("founder_price_signups").delete().in("email", emails.splice(0));
      if (error) throw new Error(`Sprzątanie zapisów nie powiodło się: ${error.message}`);
    }
    for (const id of userIds.splice(0)) {
      const { error } = await admin().auth.admin.deleteUser(id);
      if (error) throw new Error(`Nie udało się usunąć konta testowego: ${error.message}`);
    }
  });

  test("FR-029: odwiedzający bez konta przechodzi z nagłówka do cennika, przełącza okres i zapisuje się z uczciwym potwierdzeniem", async ({
    page,
  }) => {
    const email = `e2e-cennik-${uniqueStamp()}@example.test`;
    emails.push(email);

    await page.goto("/pomoc");
    await page.getByRole("navigation", { name: "Informacje" }).getByRole("link", { name: "Cennik" }).click();
    await page.waitForURL("**/cennik");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dziś Temio jest bezpłatne.");
    await waitForIslands(page);

    const basic = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Basic" }) });
    await expect(basic).toContainText("159 zł");
    await page.getByRole("radio", { name: "Miesięcznie" }).check();
    await expect(basic).toContainText("19,99 zł");
    await expect(basic).not.toContainText("159 zł");

    await page.getByLabel("E-mail").fill(email);
    expect(await reserve(page)).toBe(200);

    const confirmation = page.getByRole("status");
    await expect(confirmation).toContainText(`Gotowe — ${email} jest na liście.`);
    await expect(confirmation).toContainText(LISTED_NOTE);

    const { data, error } = await admin()
      .from("founder_price_signups")
      .select("email, period, user_id")
      .eq("email", email);
    expect(error).toBeNull();
    expect(data).toEqual([{ email, period: "monthly", user_id: null }]);
  });

  test("FR-029: zalogowana nauczycielka zapisuje się jednym kliknięciem, a po przeładowaniu widzi „Jesteś na liście”", async ({
    page,
  }) => {
    const email = `e2e-cennik-konto-${uniqueStamp()}@example.test`;
    const { data: created, error: createError } = await admin().auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (createError) throw new Error(`Nie udało się założyć konta ${email}: ${createError.message}`);
    userIds.push(created.user.id);
    emails.push(email);

    await signIn(page, email);
    await page.goto("/cennik");
    await waitForIslands(page);

    const form = page.getByRole("region", { name: "Zarezerwuj cenę założycielską" });
    await expect(form.getByLabel("E-mail")).toHaveCount(0);
    await expect(form).toContainText(email);
    expect(await reserve(page)).toBe(200);
    await expect(page.getByRole("status")).toContainText(`Gotowe — ${email} jest na liście.`);

    await page.reload();
    const listed = page.getByRole("status");
    await expect(listed).toContainText("Jesteś na liście");
    await expect(listed).toContainText(LISTED_NOTE);
    await expect(page.getByRole("button", { name: "Zarezerwuj cenę założycielską" })).toHaveCount(0);
  });
});
