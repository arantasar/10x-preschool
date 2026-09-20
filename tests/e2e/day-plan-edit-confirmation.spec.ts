import { test, expect } from "@playwright/test";
import { deleteSeededPlans, ensureTeacher, seedDayPlan, TEACHER_A } from "./support/supabase-admin";
import { activitiesFor, uniquePlanDate, uniqueStamp } from "./support/test-data";
import { waitForIslands } from "./support/hydration";

/**
 * FR-017, pierwszy takt: „jawność proporcjonalna do skutku".
 *
 * Wzorzec: `seed.spec.ts`. Reguły: `E2E-RULES.md`.
 * Siostrzany test: `day-plan-delete-confirmation.spec.ts` — ta sama konstrukcja
 * dla kasowania. Ten sprawdza **edycję propozycji w dniu zaakceptowanym**.
 *
 * **Dlaczego przeglądarka.** `window.confirm` nie ma innego domu, a ścieżki
 * odmowy nie widzi żaden test jednostkowy: test trasy z Fazy 1 zaczyna się w
 * momencie, w którym żądanie już poleciało, czyli po tym, czego ten test
 * dowodzi.
 *
 * **Dlaczego cztery asercje, a nie jedna.** „Nic się nie zmieniło" to asercja
 * negatywna, a `context/foundation/lessons.md` („Kryterium weryfikacji musi móc
 * nie przejść") wymaga, żeby taka potrafiła zawieść. Sama przeszłaby też wtedy,
 * gdyby kliknięcie nie doszło do przycisku albo gdyby dialog nigdy się nie
 * pokazał — czyli w stanie, w którym niczego nie sprawdziliśmy. Stąd komplet:
 *   1. dialog faktycznie się pokazał (kliknięcie dotarło do strażnika),
 *   2. żadne żądanie PATCH nie poleciało (strażnik naprawdę zatrzymał zapis),
 *   3. po przeładowaniu widoczny jest **stary** tytuł propozycji,
 *   4. po przeładowaniu plakietka „Plan zaakceptowany" nadal stoi.
 *
 * Asercja 4 jest tą, która odróżnia ten test od siostrzanego: bez niej zielona
 * byłaby też implementacja, która mimo „Anuluj" wysyła PATCH, ale przywraca
 * tekst — a to jest dokładnie ciche cofnięcie akceptacji, któremu FR-017 ma
 * zapobiec.
 *
 * **Świadomie poza zakresem**: ścieżka zgody. Pokrywa ją przypadek (a) z testu
 * trasy oraz weryfikacja ręczna Fazy 2; drugi przebieg przeglądarki za sygnał,
 * który stoi taniej, to `test-plan.md` §1 zasada 1.
 */
test.describe("FR-017 — odmowa w dialogu przy edycji dnia zaakceptowanego", () => {
  const seededPlanIds: string[] = [];

  test.afterEach(async () => {
    await deleteSeededPlans(seededPlanIds);
    seededPlanIds.length = 0;
  });

  test("FR-017: anulowanie dialogu nie zapisuje edycji i nie zdejmuje akceptacji", async ({ page }) => {
    const planDate = uniquePlanDate();
    const stamp = uniqueStamp();
    const originalTitle = `Powitanie ${stamp}`;
    const editedTitle = `Zmienione powitanie ${stamp}`;

    // Dzień zaakceptowany — jedyny, w którym ten dialog ma się w ogóle pokazać.
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
    await expect(page.getByRole("heading", { name: originalTitle })).toBeVisible();
    // Bez tego kliknięcie w „Edytuj" trafia w przycisk wyrenderowany serwerowo i
    // jeszcze bez handlera: edytor by się nie otworzył, dialog by nie padł, a
    // test przeszedłby zielono nie sprawdziwszy niczego.
    await waitForIslands(page);

    // Nasłuch rejestrowany przed kliknięciem „Zapisz": to on niesie asercję
    // „strażnik zatrzymał zapis", a nie samo to, że coś nadal widać na ekranie.
    const patchRequests: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "PATCH" && request.url().includes("/api/day-plan/activity/")) {
        patchRequests.push(request.url());
      }
    });

    await page.getByRole("button", { name: `Edytuj propozycję: ${originalTitle}` }).click();

    const titleField = page.getByLabel("Tytuł", { exact: true });
    await expect(titleField).toBeVisible();
    await titleField.fill(editedTitle);

    let confirmShown = false;
    page.once("dialog", (dialog) => {
      confirmShown = true;
      void dialog.dismiss();
    });

    await page.getByRole("button", { name: "Zapisz" }).click();

    // Asercje 1 i 2 padają **przed** przeładowaniem, i to nie jest kosmetyka.
    // `reload()` przerywa żądanie w locie, więc na zepsutym kodzie (dialog
    // usunięty) zapis bywa anulowany w połowie i asercje o stanie serwera
    // przechodzą — sprawdzone celowym psuciem. Pytanie „czy strażnik zadziałał"
    // rozstrzyga się w momencie kliknięcia i tam musi być zadane.
    expect(confirmShown).toBe(true);
    expect(patchRequests).toEqual([]);

    // Trzecia rzecz, którą odmowa gwarantuje natychmiast: edytor zostaje otwarty
    // z tekstem nauczyciela. Zapis, który przeszedł, zamyka go (`setDraft(null)`)
    // — więc ta asercja też pada, gdy strażnika zabraknie, bez wyścigu z siecią.
    await expect(titleField).toHaveValue(editedTitle);

    // Przeładowanie jest punktem synchronizacji, nie ozdobą: wymusza pełny
    // odczyt SSR, więc asercje poniżej mówią o stanie w bazie, a nie o tym, że
    // wyspa nie zdążyła jeszcze przerysować ekranu.
    await page.reload();

    await expect(page.getByRole("heading", { name: originalTitle })).toBeVisible();
    await expect(page.getByRole("heading", { name: editedTitle })).toHaveCount(0);
    await expect(page.getByText(/Plan zaakceptowany/)).toBeVisible();
  });
});
