import { test, expect } from "@playwright/test";
import { deleteTeacherDay, ensureTeacher, TEACHER_A } from "./support/supabase-admin";
import { llmStubCalls } from "./support/llm-stub-client";
import { plusDays, uniqueStamp, weekStartInHorizon } from "./support/test-data";
import { waitForIslands } from "./support/hydration";

/**
 * Ryzyko #5 z `context/foundation/test-plan.md`, w tej części, która istnieje
 * wyłącznie w przeglądarce: awaria dostawcy kończy się uczciwą porażką na
 * ekranie, a nie cichym pustym planem. Kategorie błędów i ponowienia pilnują testy
 * `activity-generator`; tu sprawdzamy, że dochodzą do nauczycielki.
 *
 * Hasło z prefiksem `stub-awaria-503` każe atrapie odpowiedzieć 503.
 * Stały dzień, więc sprzątanie idzie także przed testem. Wzorzec: `seed.spec.ts`.
 */
test.describe("Ryzyko #5 — awaria dostawcy przy generowaniu", () => {
  const planDate = plusDays(weekStartInHorizon(3), 1);
  let teacherId: string;

  test.beforeEach(async () => {
    teacherId = await ensureTeacher(TEACHER_A);
    await deleteTeacherDay(teacherId, planDate);
  });

  test.afterEach(async () => {
    await deleteTeacherDay(teacherId, planDate);
  });

  test("ryzyko #5: awaria dostawcy pokazuje komunikat po jednym ponowieniu i nie zostawia planu", async ({ page }) => {
    test.setTimeout(90_000);
    const keyword = `stub-awaria-503-${uniqueStamp()}`;

    await page.goto(`/plan?date=${planDate}`);
    await waitForIslands(page);
    await page.getByLabel("Hasło dnia").fill(keyword);
    const generated = page.waitForResponse("**/api/day-plan/generate", { timeout: 60_000 });
    await page.getByRole("button", { name: "Generuj", exact: true }).click();
    expect((await generated).status()).toBe(503);

    // Tekst z `GENERATION_MESSAGE_BY_CATEGORY.transient` w `day-plan-http.ts`.
    await expect(page.getByRole("alert")).toContainText(
      "Usługa generowania jest chwilowo przeciążona. Spróbuj ponownie za chwilę.",
    );
    // Pierwsza próba i jedno ponowienie, nic więcej.
    expect(await llmStubCalls(keyword)).toBe(2);

    // Porażka niczego nie zapisała.
    await page.reload();
    await expect(page.getByText("Ten dzień czeka na pomysły.")).toBeVisible();
  });
});
