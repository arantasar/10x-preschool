import { test as setup, expect } from "@playwright/test";
import { e2eEnv } from "./support/env";
import { ensureTeacher, TEACHER_A, TEACHER_B, type Teacher } from "./support/supabase-admin";

/**
 * Loguje oba konta testowe raz na przebieg i zapisuje sesje na dysk.
 *
 * To jedyne miejsce w calym zestawie, ktore przechodzi przez formularz
 * logowania. Testy dostaja gotowy `storageState`, bo logowanie przez UI w
 * kazdym tescie kosztuje sekundy i wiaze kazdy test z ekranem, ktorego wcale
 * nie testuje — przy zmianie copy na `/auth/signin` padlby caly zestaw zamiast
 * jednego testu logowania.
 *
 * Dwa konta, nie jedno, bo ryzyko #4 z `context/foundation/test-plan.md` jest
 * **strukturalnie niewidoczne** przy jednym uzytkowniku: zeby zobaczyc, ze plan
 * konta A wycieka do konta B, trzeba miec konto B.
 */
async function signIn(page: import("@playwright/test").Page, teacher: Teacher): Promise<void> {
  await ensureTeacher(teacher);

  await page.goto("/auth/signin");
  await page.getByLabel("Adres e-mail").fill(teacher.email);
  await page.getByLabel("Hasło", { exact: true }).fill(e2eEnv.password);
  await page.getByRole("button", { name: "Zaloguj się" }).click();

  // Czekamy na docelowy URL, nie na czas: sesja jedzie w ciasteczkach
  // ustawianych po drodze przez przekierowanie z `/api/auth/signin`, wiec
  // zapis stanu przed dojsciem na miejsce zapisalby stan bez ciasteczek.
  await page.waitForURL("**/plan/month");
  await expect(page.getByRole("button", { name: "Wyloguj się" })).toBeVisible();

  await page.context().storageState({ path: teacher.storageState });
}

setup("zaloguj konto A i zapisz sesje", async ({ page }) => {
  await signIn(page, TEACHER_A);
});

setup("zaloguj konto B i zapisz sesje", async ({ page }) => {
  await signIn(page, TEACHER_B);
});
