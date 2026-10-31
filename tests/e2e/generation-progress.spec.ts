import { test, expect } from "@playwright/test";
import { deleteTeacherDay, ensureTeacher, TEACHER_A } from "./support/supabase-admin";
import { plusDays, uniqueStamp, weekStartInHorizon } from "./support/test-data";
import { waitForIslands } from "./support/hydration";

/**
 * Ryzyko #5 z `context/foundation/test-plan.md`: generowanie trwa, więc
 * nauczycielka musi widzieć, że coś się dzieje, zamiast klikać drugi raz.
 *
 * Atrapa odpowiada od razu, więc pasek zniknąłby przed asercją. `page.route`
 * **wstrzymuje** żądanie w przeglądarce i puszcza je bez zmian po asercjach:
 * nic nie jest mockowane, a czekamy na stan, nie na czas. Etapy po 4 s i później
 * są poza zakresem. Stały dzień, więc sprzątanie idzie także przed testem.
 */
test.describe("Ryzyko #5 — stan w toku przy generowaniu", () => {
  const planDate = plusDays(weekStartInHorizon(3), 2);
  let teacherId: string;

  test.beforeEach(async () => {
    teacherId = await ensureTeacher(TEACHER_A);
    await deleteTeacherDay(teacherId, planDate);
  });

  test.afterEach(async () => {
    await deleteTeacherDay(teacherId, planDate);
  });

  test("ryzyko #5: w trakcie generowania widać postęp, a po nim gotowy plan", async ({ page }) => {
    test.setTimeout(90_000);
    const keyword = `Las ${uniqueStamp()}`;

    let release = (): void => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/day-plan/generate", async (route) => {
      await released;
      await route.continue();
    });

    await page.goto(`/plan?date=${planDate}`);
    await waitForIslands(page);
    await page.getByLabel("Hasło dnia").fill(keyword);
    await page.getByRole("button", { name: "Generuj", exact: true }).click();

    await expect(page.getByText("Wysyłam hasło do modelu…")).toBeVisible();
    await expect(page.getByRole("button", { name: "Generuję…" })).toBeVisible();

    const generated = page.waitForResponse("**/api/day-plan/generate", { timeout: 60_000 });
    release();
    expect((await generated).status()).toBe(200);

    await expect(page.getByRole("heading", { name: `Powitanie: ${keyword}` })).toBeVisible();
    await expect(page.getByText("Wysyłam hasło do modelu…")).toHaveCount(0);
  });
});
