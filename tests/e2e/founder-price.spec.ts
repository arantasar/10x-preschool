import { test, expect } from "@playwright/test";

/**
 * FR-028 / FR-036 — cennik mówi prawdę o cenie założycielskiej (S-22,
 * `founder-price-signup`). Nie ma listy zapisów: cenę ma każde konto założone
 * przed startem płatności. Odwiedzający bez konta dostaje zaproszenie do
 * założenia konta, zalogowana nauczycielka — informację, że jej konto cenę już
 * ma. Ryzyko przecina granice, których nie łączy żadna niższa warstwa: link w
 * nagłówku, skrypt przełącznika okresu i render zależny od sesji.
 */

test.describe("FR-028 — cennik dla odwiedzającego bez konta", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("FR-028: odwiedzający przechodzi z nagłówka do cennika, przełącza okres i dostaje drogę do ceny założycielskiej przez konto", async ({
    page,
  }) => {
    await page.goto("/pomoc");
    await page.getByRole("navigation", { name: "Informacje" }).getByRole("link", { name: "Cennik" }).click();
    await page.waitForURL("**/cennik");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dziś Temio jest bezpłatne.");

    const basic = page.getByRole("article").filter({ has: page.getByRole("heading", { name: "Basic" }) });
    await expect(basic).toContainText("159 zł");
    await page.getByRole("radio", { name: "Miesięcznie" }).check();
    await expect(basic).toContainText("19,99 zł");
    await expect(basic).not.toContainText("159 zł");

    await basic.getByRole("link", { name: "Jak dostać cenę założycielską" }).click();
    const founder = page.getByRole("region", { name: "Załóż konto przed 1 lutego 2027" });
    await expect(founder).toBeInViewport();
    await expect(founder).toContainText("Każde konto założone przed startem płatności dostaje cenę założycielską");

    await founder.getByRole("link", { name: "Załóż konto" }).click();
    await page.waitForURL("**/auth/signup");
  });
});

test.describe("FR-036 — konto ma cenę założycielską", () => {
  // Konto A z `storageState` projektu: ta ścieżka niczego nie zapisuje.
  test("FR-036: zalogowana nauczycielka widzi, że jej konto ma cenę założycielską, i nie dostaje zaproszenia do rejestracji", async ({
    page,
  }) => {
    await page.goto("/cennik");

    const founder = page.getByRole("region", { name: "Twoje konto ma cenę założycielską" });
    await expect(founder).toContainText("Konto założone przed startem płatności ma ją bez żadnego zapisu");
    await expect(page.getByRole("link", { name: "Załóż konto" })).toHaveCount(0);

    await page.getByRole("link", { name: "Twoja cena założycielska" }).click();
    await expect(founder).toBeInViewport();
  });
});
