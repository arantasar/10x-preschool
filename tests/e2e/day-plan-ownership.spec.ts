import { test, expect } from "@playwright/test";
import { deleteSeededPlans, ensureTeacher, seedDayPlan, TEACHER_A, TEACHER_B } from "./support/supabase-admin";
import { activitiesFor, uniquePlanDate, uniqueStamp } from "./support/test-data";

/**
 * Ryzyko #4 z `context/foundation/test-plan.md`:
 * „Plan jednego konta staje się czytelny lub zapisywalny z innego konta, bo
 * warstwa API sprawdza zalogowanie zamiast własności zasobu."
 *
 * Wzorzec: `seed.spec.ts`. Reguły: `E2E-RULES.md`.
 *
 * **Dlaczego to musi być test e2e, a nie jednostkowy.** `readDayPlan`
 * (`src/lib/services/day-plan-store.ts`) filtruje wyłącznie po `plan_date` —
 * nie ma w nim `.eq("user_id", …)`. Trasa `/api/day-plan` sprawdza jedynie, czy
 * ktoś jest zalogowany. Cała izolacja kont stoi więc na politykach RLS, czyli
 * o dwie granice niżej niż kod, który tę izolację obiecuje. Żeby to sprawdzić,
 * trzeba prawdziwej sesji, prawdziwego middleware, prawdziwej trasy i
 * prawdziwego Postgresa naraz — dokładnie tego, czego nie da się zmockować bez
 * usunięcia z testu tej jednej warstwy, która wykonuje robotę.
 *
 * **Dlaczego dwa konta.** `test-plan.md` §Risk Response #4 nazywa antywzorzec
 * wprost: „Test z jednym użytkownikiem — IDOR jest strukturalnie niewidoczny,
 * dopóki w teście nie ma drugiego konta".
 *
 * **Dlaczego wewnątrz jest kontrola pozytywna.** Sama asercja „konto B nie widzi
 * propozycji konta A" przeszłaby także wtedy, gdyby odczyt planów był zepsuty i
 * *nikt* nie widział niczego. Test najpierw dowodzi, że właściciel swój plan
 * widzi, i dopiero na tym tle twierdzi coś o obcym.
 */
test.describe("Ryzyko #4 — izolacja planu dnia między kontami", () => {
  const seededPlanIds: string[] = [];

  test.afterEach(async () => {
    await deleteSeededPlans(seededPlanIds);
    seededPlanIds.length = 0;
  });

  test("ryzyko #4: plan konta A nie jest czytelny z konta B — ani na stronie dnia, ani przez API", async ({
    browser,
  }) => {
    const planDate = uniquePlanDate();
    const stamp = uniqueStamp();
    const ownerTitle = `Powitanie ${stamp}`;

    // --- Setup: konto A ma zapisany plan na wybrany dzień ---------------------
    const teacherAId = await ensureTeacher(TEACHER_A);
    await ensureTeacher(TEACHER_B);
    seededPlanIds.push(
      await seedDayPlan({
        userId: teacherAId,
        planDate,
        prompt: `Dzień Pluszowego Misia ${stamp}`,
        activities: activitiesFor(stamp),
      }),
    );

    // Dwie prawdziwe sesje przeglądarkowe, każda z własnymi ciasteczkami.
    const ownerContext = await browser.newContext({ storageState: TEACHER_A.storageState });
    const intruderContext = await browser.newContext({ storageState: TEACHER_B.storageState });

    try {
      // --- Kontrola pozytywna: właściciel widzi swój plan ---------------------
      // Bez tego kroku asercje negatywne niżej byłyby prawdziwe także przy
      // całkowicie zepsutym odczycie planów.
      const ownerPage = await ownerContext.newPage();
      await ownerPage.goto(`/plan?date=${planDate}`);
      await expect(ownerPage.getByRole("heading", { name: ownerTitle })).toBeVisible();

      // --- Ryzyko: to samo żądanie z drugiego konta --------------------------
      const intruderPage = await intruderContext.newPage();
      await intruderPage.goto(`/plan?date=${planDate}`);

      // Konto B ma na tym dniu zobaczyć pusty dzień, a nie cudzy plan.
      await expect(intruderPage.getByText("Ten dzień nie ma jeszcze planu")).toBeVisible();

      // Asercja niosąca ryzyko: ani jedna propozycja konta A nie może się tu
      // pojawić. Celuje w unikalny znacznik tego przebiegu, więc nie da się jej
      // spełnić przypadkiem cudzymi ani starymi danymi.
      await expect(intruderPage.getByRole("heading", { name: ownerTitle })).toHaveCount(0);
      await expect(intruderPage.getByLabel("Hasło dnia")).toHaveValue("");

      // --- Ta sama granica, ale pod UI: trasa API z sesją konta B ------------
      // Strona mogłaby ukryć cudzy plan, a trasa wciąż go zwracać - to nadal
      // byłby wyciek, tyle że o jedno `fetch` dalej.
      const response = await intruderContext.request.get(`/api/day-plan?date=${planDate}`);
      expect(response.status()).toBe(404);
      expect(await response.text()).not.toContain(stamp);
    } finally {
      await ownerContext.close();
      await intruderContext.close();
    }
  });
});
