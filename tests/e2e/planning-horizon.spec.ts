import { test, expect } from "@playwright/test";
import { deleteSeededPlans, ensureTeacher, seedDayPlan, TEACHER_A } from "./support/supabase-admin";
import { activitiesFor, uniquePlanDate, uniqueStamp } from "./support/test-data";

/**
 * Horyzont planowania (S-31) na stronie dnia: poza oknem zapisany plan zostaje
 * w całości czytelny — razem ze swoim hasłem — a w miejscu formularza stoi notka.
 *
 * Wzorzec: `seed.spec.ts`. Dni z `uniquePlanDate()` (rok 2100+) są zawsze poza
 * oknem, więc to one są tu właściwym danymi, nie wyjątkiem. Zdanie notki wiążą
 * testy jednostkowe (`planning-horizon.test.ts`); tu liczy się, że notka jest i
 * że formularza nie ma.
 */
test.describe("S-31 — zapisany plan poza horyzontem planowania", () => {
  const seededPlanIds: string[] = [];

  test.afterEach(async () => {
    await deleteSeededPlans(seededPlanIds);
    seededPlanIds.length = 0;
  });

  test("S-31: plan dnia spoza okna pokazuje propozycje, hasło i notkę zamiast formularza", async ({ page }) => {
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

    await expect(page.getByRole("heading", { name: `Powitanie ${stamp}` })).toBeVisible();
    // Hasło zapisanego planu było widoczne tylko w polu formularza; poza oknem
    // zostaje jako tekst.
    await expect(page.getByText(`Andrzejki ${stamp}`, { exact: true })).toBeVisible();
    await expect(page.getByText(/^Ten dzień będzie można zaplanować od /)).toBeVisible();

    await expect(page.getByLabel("Hasło dnia")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Generuj ponownie", exact: true })).toHaveCount(0);
  });
});
