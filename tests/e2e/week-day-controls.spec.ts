import { test, expect, type Page } from "@playwright/test";
import { deleteSeededPlans, ensureTeacher, seedDayPlan, TEACHER_A } from "./support/supabase-admin";
import { activitiesFor, plusDays, uniqueStamp, uniqueWeekStart } from "./support/test-data";
import { waitForIslands } from "./support/hydration";

/**
 * Ryzyka #7 i #9 z `context/foundation/test-plan.md`, na powierzchni tygodnia:
 * cofnięcie akceptacji i usunięcie planu dnia z `/plan/week` (S-11).
 *
 * Wzorzec: `seed.spec.ts`. Reguły: `E2E-RULES.md`. Siostrzane testy tego samego
 * kasowania w widoku dnia: `day-plan-delete-scope.spec.ts` (zakres) i
 * `day-plan-delete-confirmation.spec.ts` (odmowa).
 *
 * **Dlaczego e2e.** Ryzyko #9 to celowanie: tydzień pokazuje pięć kart obok
 * siebie, a to, w który dzień trafi żądanie, wyznacza kod wyspy — nie położenie
 * karty. Ochroną przed kasowaniem jest dialog przeglądarki. Ani jedno, ani
 * drugie nie istnieje poniżej przeglądarki.
 *
 * **Dlaczego zawsze dwa sąsiednie dni.** `test-plan.md` §Risk Response #9 nazywa
 * antywzorzec: test z jednym dniem w tygodniu strukturalnie nie wykryje
 * trafienia w sąsiada. Drugi dzień jest celem, pierwszy — poniedziałek, czyli
 * `week.days[0]` — jest dniem, w który trafia najprostszy błąd celowania.
 *
 * **Lokatory po nazwie dostępnej z datą, `exact`.** To jest zarazem asercja
 * FR-015: przycisk, który nie nazywa swojego dnia, nie zostanie tu znaleziony.
 *
 * **Tytuły propozycji też `exact`.** Pod `astro dev` pasek narzędzi Astro trzyma
 * propsy wyspy tygodnia — a więc wszystkie tytuły — w elemencie `<code>` w
 * shadow DOM, który `getByText` przebija. Dopasowanie po fragmencie trafia
 * wtedy w dwa elementy i pada na trybie ścisłym.
 */

/**
 * Data w brzmieniu, w jakim nazywa ją aplikacja. Liczona tu, z tymi samymi
 * opcjami co `formatPlanDate`, a nie importowana z kodu aplikacji — inaczej
 * zmiana formatu w aplikacji zmieniłaby też oczekiwanie testu.
 */
function dayLabel(isoDate: string): string {
  return new Intl.DateTimeFormat("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

/** Karta jednego dnia: element listy zawierający nagłówek z jego datą. */
function dayCard(page: Page, isoDate: string) {
  return page
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: dayLabel(isoDate), exact: true }) });
}

test.describe("Ryzyka #7 i #9 — operacje dnia z poziomu tygodnia", () => {
  const seededPlanIds: string[] = [];

  test.afterEach(async () => {
    await deleteSeededPlans(seededPlanIds);
    seededPlanIds.length = 0;
  });

  test("ryzyko #7, #9: usunięcie z tygodnia zdejmuje dokładnie wskazany dzień", async ({ page }) => {
    const weekStart = uniqueWeekStart();
    const firstDate = weekStart;
    const secondDate = plusDays(weekStart, 1);
    const stamp = uniqueStamp();
    const firstStamp = `${stamp}-a`;
    const secondStamp = `${stamp}-b`;

    // Oba zaakceptowane: kasowany dzień to ten, którego strata boli najbardziej,
    // a dialog musi o tym powiedzieć.
    const teacherAId = await ensureTeacher(TEACHER_A);
    seededPlanIds.push(
      await seedDayPlan({
        userId: teacherAId,
        planDate: firstDate,
        prompt: `Jesień ${firstStamp}`,
        activities: activitiesFor(firstStamp),
        accepted: true,
      }),
      await seedDayPlan({
        userId: teacherAId,
        planDate: secondDate,
        prompt: `Jesień ${secondStamp}`,
        activities: activitiesFor(secondStamp),
        accepted: true,
      }),
    );

    await page.goto(`/plan/week?from=${weekStart}`);
    await expect(page.getByText(`Powitanie ${secondStamp}`, { exact: true })).toBeVisible();
    await waitForIslands(page);

    // Handler przed kliknięciem. Treść dialogu jest zapisywana i sprawdzana po
    // fakcie: bez handlera Playwright dialog odrzuca, a test kasowania
    // przeszedłby zielono nie kasując niczego.
    let dialogMessage: string | null = null;
    page.once("dialog", (dialog) => {
      dialogMessage = dialog.message();
      void dialog.accept();
    });

    await page.getByRole("button", { name: `Usuń plan dnia: ${dayLabel(secondDate)}`, exact: true }).click();

    // Komunikat pojawia się dopiero po udanym kasowaniu — punkt synchronizacji
    // przed przeładowaniem, nie ozdoba.
    await expect(page.getByRole("status").filter({ hasText: dayLabel(secondDate) })).toContainText("Usunięto");

    // Dialog nazwał dzień, który zniknął, i powiedział, że był zaakceptowany.
    expect(dialogMessage).toContain(dayLabel(secondDate));
    expect(dialogMessage).toContain("Ten dzień jest zaakceptowany.");

    // Stan w bazie, nie w wyspie.
    await page.reload();
    await expect(dayCard(page, firstDate).getByText(`Powitanie ${firstStamp}`, { exact: true })).toBeVisible();
    await expect(dayCard(page, secondDate).getByText("Ten dzień nie ma jeszcze planu")).toBeVisible();
    await expect(page.getByText(`Powitanie ${secondStamp}`, { exact: true })).toHaveCount(0);
  });

  test("ryzyko #7: odmowa w dialogu kasowania z tygodnia nie kasuje niczego", async ({ page }) => {
    const weekStart = uniqueWeekStart();
    const planDate = plusDays(weekStart, 1);
    const stamp = uniqueStamp();

    const teacherAId = await ensureTeacher(TEACHER_A);
    seededPlanIds.push(
      await seedDayPlan({
        userId: teacherAId,
        planDate,
        prompt: `Jesień ${stamp}`,
        activities: activitiesFor(stamp),
        accepted: true,
      }),
    );

    await page.goto(`/plan/week?from=${weekStart}`);
    await expect(page.getByText(`Powitanie ${stamp}`, { exact: true })).toBeVisible();
    await waitForIslands(page);

    // Trzy asercje, jak w `day-plan-delete-confirmation.spec.ts`: sama „plan
    // nadal jest" przeszłaby też wtedy, gdyby kliknięcie nie doszło do
    // przycisku albo dialog nigdy się nie pokazał.
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

    await page.getByRole("button", { name: `Usuń plan dnia: ${dayLabel(planDate)}`, exact: true }).click();

    await page.reload();
    await expect(page.getByText(`Powitanie ${stamp}`, { exact: true })).toBeVisible();

    expect(confirmShown).toBe(true);
    expect(deleteRequests).toEqual([]);
  });

  test("ryzyko #9: cofnięcie akceptacji z tygodnia zdejmuje akceptację wyłącznie wskazanego dnia", async ({ page }) => {
    const weekStart = uniqueWeekStart();
    const firstDate = weekStart;
    const secondDate = plusDays(weekStart, 1);
    const stamp = uniqueStamp();
    const firstStamp = `${stamp}-a`;
    const secondStamp = `${stamp}-b`;

    const teacherAId = await ensureTeacher(TEACHER_A);
    seededPlanIds.push(
      await seedDayPlan({
        userId: teacherAId,
        planDate: firstDate,
        prompt: `Jesień ${firstStamp}`,
        activities: activitiesFor(firstStamp),
        accepted: true,
      }),
      await seedDayPlan({
        userId: teacherAId,
        planDate: secondDate,
        prompt: `Jesień ${secondStamp}`,
        activities: activitiesFor(secondStamp),
        accepted: true,
      }),
    );

    await page.goto(`/plan/week?from=${weekStart}`);
    await expect(page.getByText(`Powitanie ${secondStamp}`, { exact: true })).toBeVisible();
    await waitForIslands(page);

    // Cofnięcie jest odwracalne i nie pyta. Handler zapisuje, że dialog w ogóle
    // padł; odrzuca go, żeby ewentualny dialog nie zawiesił kliknięcia.
    let dialogShown = false;
    page.on("dialog", (dialog) => {
      dialogShown = true;
      void dialog.dismiss();
    });

    await page.getByRole("button", { name: `Cofnij akceptację: ${dayLabel(secondDate)}`, exact: true }).click();

    // Dzień nazwany po fakcie, w komunikacie jego karty.
    await expect(page.getByRole("status").filter({ hasText: dayLabel(secondDate) })).toContainText(
      "Cofnięto akceptację",
    );
    expect(dialogShown).toBe(false);

    // Stan w bazie: wskazany dzień roboczy, sąsiad nadal zaakceptowany.
    await page.reload();
    await expect(dayCard(page, secondDate).getByText("Plan roboczy")).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Akceptuj dzień: ${dayLabel(secondDate)}`, exact: true }),
    ).toBeVisible();
    await expect(dayCard(page, firstDate).getByText(/^Zaakceptowany /)).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Cofnij akceptację: ${dayLabel(firstDate)}`, exact: true }),
    ).toBeVisible();
  });
});
