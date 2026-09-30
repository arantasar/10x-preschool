import { test, expect, type Page } from "@playwright/test";
import { deleteSeededPlans, ensureTeacher, seedDayPlan, TEACHER_A } from "./support/supabase-admin";
import { activitiesFor, plusDays, uniquePlanDate, uniqueStamp, uniqueWeekStart } from "./support/test-data";
import { waitForIslands } from "./support/hydration";

/**
 * Ryzyko #3 z `context/foundation/test-plan.md`, w tej części, która istnieje
 * wyłącznie w przeglądarce: **okna stojące przed regeneracją dnia
 * zatwierdzonego** — jedno na ekranie dnia i dwa na ekranie tygodnia (zakres,
 * potem liczba dni).
 *
 * Wzorzec: `seed.spec.ts`. Reguły: `E2E-RULES.md` §Okna potwierdzeń. Siostrzane
 * testy odmowy: `day-plan-delete-confirmation.spec.ts` (kasowanie),
 * `day-plan-edit-confirmation.spec.ts` (edycja).
 *
 * **Dlaczego przeglądarka.** Testy jednostkowe (`confirmations.test.ts`,
 * `week-generation.test.ts`) wiążą brzmienie okien, a pgTAP — odmowę zapisu bez
 * zgody. Tego, czy odpowiedź „Zostaw obecne” naprawdę zatrzymuje przebieg i czy
 * odpowiedź na pytanie o zakres trafia do drugiego okna, nie widzi żaden z nich:
 * to okablowanie wyspy. Odwrócony warunek przy `await confirm(…)` wysyła płatne
 * generowanie, które zastępuje zatwierdzone dni — przy zielonych testach
 * jednostkowych.
 *
 * **Tylko odmowa.** Ścieżka zgody kończy się wywołaniem modelu, które ten zestaw
 * omija (`E2E-RULES.md`, tabela granic). Zgodę na poziomie zapisu pokrywa pgTAP
 * (`confirm_accepted`, U0001).
 *
 * **Żądania generowania są ucinane w `page.route`.** Na poprawnym kodzie żadne
 * nie wychodzi i trasa jest martwa. Na zepsutym — asercja „żadnego żądania” pada,
 * a żądanie nie dociera ani do modelu, ani do bazy: czerwony przebieg nie kosztuje
 * i nie niszczy zasianych danych.
 */

/** Jak `dayLabel` w `week-day-controls.spec.ts` — liczona tu, nie importowana z aplikacji. */
function dayLabel(isoDate: string): string {
  return new Intl.DateTimeFormat("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

function dayCard(page: Page, isoDate: string) {
  return page
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: dayLabel(isoDate), exact: true }) });
}

/**
 * Rejestruje każde żądanie, które zaczyna generowanie albo zapis jego wyniku, i
 * ucina je, zanim dojdzie do serwera. Zwraca listę, na której stoi asercja.
 */
async function blockGeneration(page: Page): Promise<string[]> {
  const sent: string[] = [];
  await page.route(/\/api\/day-plan\/(generate|week\/)/, async (route) => {
    sent.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
    await route.abort();
  });
  return sent;
}

test.describe("Ryzyko #3 — odmowa w oknach przed regeneracją dnia zatwierdzonego", () => {
  const seededPlanIds: string[] = [];

  test.afterEach(async () => {
    await deleteSeededPlans(seededPlanIds);
    seededPlanIds.length = 0;
  });

  test("ryzyko #3: „Zostaw obecne” na ekranie dnia nie generuje i nie zdejmuje zatwierdzenia", async ({ page }) => {
    const planDate = uniquePlanDate();
    const stamp = uniqueStamp();
    const title = `Powitanie ${stamp}`;

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

    const sent = await blockGeneration(page);
    await page.goto(`/plan?date=${planDate}`);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await waitForIslands(page);

    await page.getByRole("button", { name: "Generuj ponownie", exact: true }).click();

    // Okno nazywa stan dnia i nieodwracalność, zanim padnie odpowiedź.
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Ten dzień jest zatwierdzony.");
    await expect(dialog).toContainText("Tej operacji nie można cofnąć.");
    await dialog.getByRole("button", { name: "Zostaw obecne", exact: true }).click();
    await expect(dialog).toHaveCount(0);

    // Przed przeładowaniem: `reload()` przerwałoby żądanie w locie.
    expect(sent).toEqual([]);
    // Przebieg, który ruszył, zmienia etykietę przycisku na „Generuję…”.
    await expect(page.getByRole("button", { name: "Generuj ponownie", exact: true })).toBeEnabled();

    await page.reload();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText(/Plan zatwierdzony/)).toBeVisible();
  });

  test("ryzyko #3: „Tylko do przejrzenia” zawęża przebieg tygodnia, a „Zostaw obecne” w drugim oknie go zatrzymuje", async ({
    page,
  }) => {
    const weekStart = uniqueWeekStart();
    const approvedDate = weekStart;
    const draftDate = plusDays(weekStart, 1);
    const stamp = uniqueStamp();

    // Tydzień mieszany: tylko on dostaje pytanie o zakres.
    const teacherAId = await ensureTeacher(TEACHER_A);
    seededPlanIds.push(
      await seedDayPlan({
        userId: teacherAId,
        planDate: approvedDate,
        prompt: `Jesień ${stamp}-a`,
        activities: activitiesFor(`${stamp}-a`),
        accepted: true,
      }),
      await seedDayPlan({
        userId: teacherAId,
        planDate: draftDate,
        prompt: `Jesień ${stamp}-b`,
        activities: activitiesFor(`${stamp}-b`),
        accepted: false,
      }),
    );

    const sent = await blockGeneration(page);
    await page.goto(`/plan/week?from=${weekStart}`);
    await expect(page.getByText(`Powitanie ${stamp}-a`, { exact: true })).toBeVisible();
    await waitForIslands(page);

    await page.getByLabel("Hasło tygodnia").fill(`Zima ${stamp}`);
    await page.getByRole("button", { name: "Generuj tydzień", exact: true }).click();

    // Pierwsze okno: zakres. Odmowa zawęża, nie przerywa.
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("1 dzień tego tygodnia jest zatwierdzony.");
    await dialog.getByRole("button", { name: "Tylko do przejrzenia", exact: true }).click();

    // Drugie okno pada zawsze i mówi, że zatwierdzony dzień zostaje: cztery
    // pozostałe dni robocze idą do wymiany, zatwierdzony — nie.
    await expect(dialog).toContainText("Zastąpię 4 dni nowymi propozycjami.");
    await expect(dialog).toContainText("1 zatwierdzony dzień zostanie nietknięty.");
    await expect(dialog).toContainText("Tej operacji nie można cofnąć.");
    await dialog.getByRole("button", { name: "Zostaw obecne", exact: true }).click();
    await expect(dialog).toHaveCount(0);

    expect(sent).toEqual([]);
    await expect(page.getByRole("button", { name: "Generuj tydzień", exact: true })).toBeEnabled();

    await page.reload();
    await expect(dayCard(page, approvedDate).getByText(`Powitanie ${stamp}-a`, { exact: true })).toBeVisible();
    await expect(dayCard(page, approvedDate).getByText(/^Zatwierdzony /)).toBeVisible();
    await expect(dayCard(page, draftDate).getByText(`Powitanie ${stamp}-b`, { exact: true })).toBeVisible();
  });

  test("ryzyko #3: „Zastąp także zatwierdzone” nazywa cofane zatwierdzenie w drugim oknie, a odmowa tam nie generuje", async ({
    page,
  }) => {
    const weekStart = uniqueWeekStart();
    const approvedDate = weekStart;
    const draftDate = plusDays(weekStart, 1);
    const stamp = uniqueStamp();

    const teacherAId = await ensureTeacher(TEACHER_A);
    seededPlanIds.push(
      await seedDayPlan({
        userId: teacherAId,
        planDate: approvedDate,
        prompt: `Jesień ${stamp}-a`,
        activities: activitiesFor(`${stamp}-a`),
        accepted: true,
      }),
      await seedDayPlan({
        userId: teacherAId,
        planDate: draftDate,
        prompt: `Jesień ${stamp}-b`,
        activities: activitiesFor(`${stamp}-b`),
        accepted: false,
      }),
    );

    const sent = await blockGeneration(page);
    await page.goto(`/plan/week?from=${weekStart}`);
    await expect(page.getByText(`Powitanie ${stamp}-a`, { exact: true })).toBeVisible();
    await waitForIslands(page);

    await page.getByLabel("Hasło tygodnia").fill(`Zima ${stamp}`);
    await page.getByRole("button", { name: "Generuj tydzień", exact: true }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("1 dzień tego tygodnia jest zatwierdzony.");
    await dialog.getByRole("button", { name: "Zastąp także zatwierdzone", exact: true }).click();

    // Odpowiedź z pierwszego okna dotarła do drugiego: pięć dni, w tym ten
    // zatwierdzony, i żadnego „zostanie nietknięty”.
    await expect(dialog).toContainText(
      "Zastąpię 5 dni nowymi propozycjami, w tym 1 zatwierdzony — jego zatwierdzenie zostanie cofnięte.",
    );
    await expect(dialog).not.toContainText("nietknięty");
    await dialog.getByRole("button", { name: "Zostaw obecne", exact: true }).click();
    await expect(dialog).toHaveCount(0);

    expect(sent).toEqual([]);
    await expect(page.getByRole("button", { name: "Generuj tydzień", exact: true })).toBeEnabled();

    await page.reload();
    await expect(dayCard(page, approvedDate).getByText(`Powitanie ${stamp}-a`, { exact: true })).toBeVisible();
    await expect(dayCard(page, approvedDate).getByText(/^Zatwierdzony /)).toBeVisible();
  });
});
