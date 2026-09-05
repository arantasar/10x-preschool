import { test, expect } from "@playwright/test";
import { deleteSeededPlans, ensureTeacher, seedDayPlan, TEACHER_A } from "./support/supabase-admin";
import { activitiesFor, uniquePlanDate, uniqueStamp } from "./support/test-data";

/**
 * Test wzorcowy. Każdy nowy test w tym katalogu jest modelowany na tym pliku.
 *
 * **To, co tu pokazane, jest tym, co dostaniesz** — jeśli seed używa
 * `getByRole`, generowane testy też; jeśli seed miałby
 * `page.waitForTimeout(2000)`, odziedziczyłby to każdy kolejny test. Cztery
 * wzorce, które ten plik demonstruje:
 *
 * 1. **Lokatory po roli** (`getByRole`, `getByLabel`) — odporne na zmianę klas
 *    Tailwinda i strukturę DOM, i dokładnie to, co agent widzi w migawce
 *    drzewa dostępności.
 * 2. **Niezależność** — własny setup, akcja, asercja i sprzątanie w jednym
 *    teście. Żadnej zależności od kolejności ani od tego, co zostawił sąsiad.
 * 3. **Czekanie na stan, nie na czas** — `toBeVisible()`, `waitForURL()`.
 * 4. **Asercja przywiązana do ryzyka** — nazwa niesie numer ryzyka z
 *    `context/foundation/test-plan.md`.
 *
 * Dlaczego akurat kontrola pozytywna do ryzyka #4: bez niej cały test izolacji
 * („konto B nie widzi planu konta A") przechodziłby również wtedy, gdyby strona
 * nie pokazywała **nikomu niczego** — na przykład po zwykłej awarii odczytu.
 * Dowód, że właściciel swój plan widzi, jest tym, co nadaje sens dowodowi, że
 * obcy go nie widzi (`test-plan.md` §6.2: „Przypadek pozytywny jest
 * obowiązkowy").
 */
test.describe("Ryzyko #4 — plan jest widoczny dla swojego właściciela", () => {
  const seededPlanIds: string[] = [];

  test.afterEach(async () => {
    await deleteSeededPlans(seededPlanIds);
    seededPlanIds.length = 0;
  });

  test("ryzyko #4 (kontrola pozytywna): właściciel widzi swój plan dnia i przeżywa on przeładowanie strony", async ({
    page,
  }) => {
    // Unikalny dzień i unikalny znacznik w tytułach: bez nich drugi przebieg
    // pod rząd zderzyłby się o `unique (user_id, plan_date)`, a asercja mogłaby
    // przejść na planie zostawionym przez poprzedni przebieg.
    const planDate = uniquePlanDate();
    const stamp = uniqueStamp();
    const teacherAId = await ensureTeacher(TEACHER_A);

    seededPlanIds.push(
      await seedDayPlan({
        userId: teacherAId,
        planDate,
        prompt: `Andrzejki ${stamp}`,
        activities: activitiesFor(stamp),
      }),
    );

    await page.goto(`/plan?date=${planDate}`);

    // Wynik biznesowy: nauczyciel widzi swoje propozycje. Tytuł renderuje się
    // jako nagłówek poprzedzony numerem porządkowym, więc dopasowanie po
    // fragmencie nazwy jest tu celowe, nie niechlujstwem.
    await expect(page.getByRole("heading", { name: `Powitanie ${stamp}` })).toBeVisible();
    await expect(page.getByRole("heading", { name: `Zabawa ruchowa ${stamp}` })).toBeVisible();
    await expect(page.getByLabel("Hasło dnia")).toHaveValue(`Andrzejki ${stamp}`);

    // Plan jest renderowany serwerowo przy pierwszym malowaniu, więc
    // przeładowanie jest realnym sprawdzeniem trwałości, a nie rytuałem.
    await page.reload();
    await expect(page.getByRole("heading", { name: `Powitanie ${stamp}` })).toBeVisible();
  });
});
