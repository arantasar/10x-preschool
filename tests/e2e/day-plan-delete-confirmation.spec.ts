import { test, expect } from "@playwright/test";
import { deleteSeededPlans, ensureTeacher, seedDayPlan, TEACHER_A } from "./support/supabase-admin";
import { activitiesFor, uniquePlanDate, uniqueStamp } from "./support/test-data";
import { waitForIslands } from "./support/hydration";

/**
 * Ryzyko #7 z `context/foundation/test-plan.md`, druga połowa:
 * „jedyne, co przed tym stoi, to dialog potwierdzenia w przeglądarce".
 *
 * Wzorzec: `seed.spec.ts`. Reguły: `E2E-RULES.md`.
 * Siostrzany test: `day-plan-delete-scope.spec.ts` sprawdza, czy zgoda kasuje
 * **dokładnie tyle, ile trzeba**; ten sprawdza, czy **odmowa kasuje zero**.
 *
 * **Dlaczego osobny test.** Test zakresu dowodzi, że dialog się pojawia — bo bez
 * jego obsłużenia kasowanie w ogóle by nie ruszyło. Nie dowodzi jednak niczego o
 * *odmowie*: `deletePlan()` mogłoby ignorować wynik `window.confirm` i kasować
 * mimo „Anuluj", a tamten test byłby dalej zielony. To jest cała ochrona przed
 * przypadkowym kliknięciem, więc zasługuje na własny dowód.
 *
 * **Dlaczego trzy asercje, a nie jedna.** „Plan nadal jest widoczny" to asercja
 * negatywna, a `context/foundation/lessons.md` („Kryterium weryfikacji musi móc
 * nie przejść") wymaga, żeby taka potrafiła zawieść. Sama przeszłaby również
 * wtedy, gdyby kliknięcie nie doszło do przycisku albo gdyby dialog nigdy się nie
 * pojawił — czyli w stanie, w którym niczego nie sprawdziliśmy. Stąd komplet:
 *   1. dialog faktycznie się pokazał (kliknięcie dotarło do strażnika),
 *   2. żadne żądanie DELETE nie poleciało (strażnik naprawdę zatrzymał operację),
 *   3. plan przeżył przeładowanie (stan po stronie serwera jest nietknięty).
 */
test.describe("Ryzyko #7 — odmowa w dialogu potwierdzenia", () => {
  const seededPlanIds: string[] = [];

  test.afterEach(async () => {
    await deleteSeededPlans(seededPlanIds);
    seededPlanIds.length = 0;
  });

  test("ryzyko #7: anulowanie dialogu potwierdzenia nie kasuje planu dnia", async ({ page }) => {
    const planDate = uniquePlanDate();
    const stamp = uniqueStamp();
    const title = `Powitanie ${stamp}`;

    // Plan zaakceptowany — czyli ten, którego przypadkowa utrata boli najbardziej.
    const teacherAId = await ensureTeacher(TEACHER_A);
    seededPlanIds.push(
      await seedDayPlan({
        userId: teacherAId,
        planDate,
        prompt: `Andrzejki ${stamp}`,
        activities: activitiesFor(stamp),
        accepted: true,
      }),
    );

    await page.goto(`/plan?date=${planDate}`);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    // Bez tego kliknięcie w „Usuń plan dnia" może trafić w przycisk wyrenderowany
    // serwerowo, ale jeszcze bez handlera — dialog by się nie pokazał, a test
    // przeszedłby zielono nie sprawdziwszy niczego.
    await waitForIslands(page);

    // Nasłuch rejestrowany przed kliknięciem: to on niesie asercję „strażnik
    // zatrzymał operację", a nie samo to, że coś nadal widać na ekranie.
    const deleteRequests: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "DELETE" && request.url().includes("/api/day-plan")) {
        deleteRequests.push(request.url());
      }
    });

    let confirmShown = false;
    page.once("dialog", (dialog) => {
      confirmShown = true;
      void dialog.dismiss();
    });

    await page.getByRole("button", { name: "Usuń plan dnia" }).click();

    // Przeładowanie jest tu punktem synchronizacji, nie ozdobą: wymusza pełny
    // odczyt SSR, więc asercja mówi o stanie w bazie, a nie o tym, że wyspa
    // jeszcze nie zdążyła przerysować ekranu.
    await page.reload();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();

    expect(confirmShown).toBe(true);
    expect(deleteRequests).toEqual([]);
  });
});
