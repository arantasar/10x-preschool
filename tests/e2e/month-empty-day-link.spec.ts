import { test } from "@playwright/test";
import { deleteSeededPlans, ensureTeacher, seedDayPlan, TEACHER_A } from "./support/supabase-admin";
import { activitiesFor, plusDays, uniqueStamp, uniqueWeekStartWithinMonth } from "./support/test-data";
import { waitForIslands } from "./support/hydration";

/**
 * Wejście na ścieżkę krytyczną z ekranu domowego: kafel pustego dnia w miesiącu.
 *
 * Osobny plik, nie drugi test w `critical-path.spec.ts`: tamten sprząta swój dzień
 * przed i po teście, a `fullyParallel` puściłby oba naraz. Generowanie nie jest tu
 * potrzebne, więc zasiew i własny tydzień (`uniqueWeekStartWithinMonth`): pusty
 * tydzień ma w miesiącu jeden wiersz zamiast kafli dni, dlatego plan w poniedziałek
 * jest warunkiem istnienia kafla wtorku.
 *
 * Wzorzec: `month-day-preview.spec.ts`. Reguły: `E2E-RULES.md`.
 */
test.describe("Ścieżka krytyczna — wejście z miesiąca", () => {
  const seededPlanIds: string[] = [];

  test.afterEach(async () => {
    await deleteSeededPlans(seededPlanIds);
    seededPlanIds.length = 0;
  });

  test("ścieżka krytyczna — kafel pustego dnia w miesiącu otwiera ten dzień", async ({ page }) => {
    const monday = uniqueWeekStartWithinMonth();
    const tuesday = plusDays(monday, 1);
    const userId = await ensureTeacher(TEACHER_A);
    seededPlanIds.push(
      await seedDayPlan({
        userId,
        planDate: monday,
        prompt: `Hasło ${monday}`,
        activities: activitiesFor(uniqueStamp()),
      }),
    );

    await page.goto(`/plan/month?month=${monday.slice(0, 7)}`);
    await waitForIslands(page);
    await page.getByRole("link", { name: `Plan na ${tuesday} — brak planu`, exact: true }).click();
    await page.waitForURL(`**/plan?date=${tuesday}`);
  });
});
