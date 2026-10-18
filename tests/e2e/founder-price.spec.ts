import { test, expect, type Page } from "@playwright/test";
import { waitForIslands } from "./support/hydration";
import { admin } from "./support/supabase-admin";
import { uniqueStamp } from "./support/test-data";

/**
 * FR-029 / US-05 — zapis na cenę założycielską działa i mówi prawdę (S-22,
 * `founder-price-signup`). Z nagłówka do `/cennik`, przełącznik okresu, zapis
 * i uczciwe potwierdzenie („płatności jeszcze nie działają”) dla odwiedzającego
 * bez konta. Zalogowana nauczycielka nie widzi formularza: jej konto ma cenę
 * założycielską z urzędu (FR-036), więc strona mówi jej to zamiast zapisu.
 * Ryzyko przecina granice, których nie łączy żadna niższa warstwa: skrypt
 * przełącznika, hydrację wyspy z widżetem Turnstile, prawdziwą trasę i render
 * zależny od sesji.
 *
 * Środowisko: `.dev.vars` ma klucze testowe Turnstile, które zawsze przechodzą.
 * Zestaw niczego tu nie mockuje.
 *
 * **Wiersz sprawdzamy kluczem serwisowym**, jak `help-and-contact`: ani `anon`,
 * ani zalogowana nie czytają tej tabeli wcale, więc ten odczyt mówi „zapis
 * doszedł do bazy, raz, z okresem z przełącznika”.
 */

const LISTED_NOTE = "Płatności jeszcze nie działają, więc nic dziś nie płacisz.";

/** Wysyła formularz zapisu i czeka na odpowiedź trasy. */
async function reserve(page: Page): Promise<number> {
  const answered = page.waitForResponse(
    (response) => response.url().endsWith("/api/founder-price") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Zarezerwuj cenę założycielską" }).click();
  return (await answered).status();
}

test.describe("FR-029 — zapis na cenę założycielską bez konta", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  const emails: string[] = [];

  test.afterEach(async () => {
    // Po adresie: tożsamość tabeli to adres, a zapis anonimowy nie zwraca id.
    if (emails.length > 0) {
      const { error } = await admin().from("founder_price_signups").delete().in("email", emails.splice(0));
      if (error) throw new Error(`Sprzątanie zapisów nie powiodło się: ${error.message}`);
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

    const { data, error } = await admin().from("founder_price_signups").select("email, period").eq("email", email);
    expect(error).toBeNull();
    expect(data).toEqual([{ email, period: "monthly" }]);
  });
});

test.describe("FR-036 — konto ma cenę założycielską bez zapisu", () => {
  // Konto A z `storageState` projektu: ta ścieżka niczego nie zapisuje, więc
  // równoległe i powtarzane przebiegi nie widzą nawzajem swoich śladów.
  test("FR-036: zalogowana nauczycielka widzi, że jej konto ma cenę założycielską, i nie dostaje formularza zapisu", async ({
    page,
  }) => {
    await page.goto("/cennik");

    const section = page.getByRole("region", { name: "Twoje konto ma cenę założycielską" });
    await expect(section).toContainText("Konto założone przed startem płatności dostaje ją bez zapisu");
    await expect(page.getByLabel("E-mail")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Zarezerwuj cenę założycielską" })).toHaveCount(0);

    await page.getByRole("link", { name: "Twoja cena założycielska" }).click();
    await expect(section).toBeInViewport();
  });
});
