import { test, expect } from "@playwright/test";
import { deleteTeacherDay, ensureTeacher, TEACHER_A } from "./support/supabase-admin";
import { llmStubCalls, uniqueStamp, weekStartInHorizon } from "./support/test-data";
import { waitForIslands } from "./support/hydration";

/**
 * Ścieżka krytyczna produktu (`context/foundation/test-plan.md` §3, faza 4):
 * dzień → hasło → „Generuj” → edycja → „Zatwierdź plan” → kafel w miesiącu.
 *
 * Merge do `master` wdraża aplikację bez kroku zatwierdzenia, więc to jest
 * podłoga przed produkcją: sesja, trasy, RLS i zapis są prawdziwe, a jedyną
 * atrapą jest dostawca LLM, na granicy sieciowej (`support/llm-stub.mjs`).
 *
 * Stały dzień (`weekStartInHorizon(3)`, bo formularz istnieje tylko w horyzoncie),
 * więc sprzątanie idzie także **przed** testem: przerwany przebieg zostawiłby
 * plan, a link `brak planu` zniknąłby w każdym następnym.
 *
 * Klucz serwisowy służy wyłącznie do sprzątania. Wzorzec: `seed.spec.ts`.
 */
test.describe("Ścieżka krytyczna — od pustego dnia do zatwierdzonego planu", () => {
  const planDate = weekStartInHorizon(3);
  let teacherId: string;

  test.beforeEach(async () => {
    teacherId = await ensureTeacher(TEACHER_A);
    await deleteTeacherDay(teacherId, planDate);
  });

  test.afterEach(async () => {
    await deleteTeacherDay(teacherId, planDate);
  });

  test("ścieżka krytyczna — wygenerowany, poprawiony i zatwierdzony plan przeżywa przeładowanie", async ({ page }) => {
    // Pierwsza kompilacja trasy na zimnym serwerze zjada zwykłe 30 s.
    test.setTimeout(90_000);
    const keyword = `Jesień ${uniqueStamp()}`;
    const editedTitle = `Poprawiony tytuł ${keyword}`;

    // Tydzień → dzień. Nie z miesiąca: pusty tydzień ma tam jeden wiersz zamiast
    // kafli dni, a dwa specy ryzyka #5 planują dni tego samego tygodnia równolegle,
    // więc to, co miesiąc pokaże, zależałoby od kolejności testów. „Jeden dzień”
    // otwiera poniedziałek, bo tydzień slotu nigdy nie jest bieżący.
    await page.goto(`/plan/week?from=${planDate}`);
    await waitForIslands(page);
    await page.getByRole("link", { name: "Jeden dzień", exact: true }).click();
    await page.waitForURL(`**/plan?date=${planDate}`);
    await waitForIslands(page);

    // Hasło → „Generuj”. Czekamy na odpowiedź trasy, bo domyślne 5 s `expect` nie
    // pokrywa jej kompilacji.
    await page.getByLabel("Hasło dnia").fill(keyword);
    const generated = page.waitForResponse("**/api/day-plan/generate", { timeout: 60_000 });
    await page.getByRole("button", { name: "Generuj", exact: true }).click();
    expect((await generated).status()).toBe(200);

    // Odpowiedź dostawcy przeszła przez kontrakt i zapis, a wywołanie poszło
    // do atrapy, dokładnie raz.
    const plan = page.getByRole("region", { name: /^Plan na / });
    await expect(plan.getByRole("heading", { name: `Powitanie: ${keyword}` })).toBeVisible();
    expect(await llmStubCalls(keyword)).toBe(1);

    // Edycja przeżywa przeładowanie, czyli trafiła do bazy, a nie tylko do stanu wyspy.
    await page.getByRole("button", { name: `Edytuj propozycję: Powitanie: ${keyword}` }).click();
    await page.getByLabel("Tytuł").fill(editedTitle);
    await page.getByRole("button", { name: "Zapisz", exact: true }).click();
    await expect(plan.getByRole("heading", { name: editedTitle })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: editedTitle })).toBeVisible();

    // Zatwierdzenie przeżywa przeładowanie i widać je w miesiącu.
    await waitForIslands(page);
    await page.getByRole("button", { name: "Zatwierdź plan" }).click();
    await expect(page.getByText("Plan zatwierdzony")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Plan zatwierdzony")).toBeVisible();
    await page.goto(`/plan/month?month=${planDate.slice(0, 7)}`);
    await expect(
      page.getByRole("link", { name: new RegExp(`^Plan na ${planDate} — .* — zatwierdzony$`) }),
    ).toBeVisible();
  });
});
