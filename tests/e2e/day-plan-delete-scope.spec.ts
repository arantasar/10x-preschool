import { test, expect } from "@playwright/test";
import { deleteSeededPlans, ensureTeacher, seedDayPlan, TEACHER_A, TEACHER_B } from "./support/supabase-admin";
import { activitiesFor, plusDays, uniquePlanDate, uniqueStamp } from "./support/test-data";
import { waitForIslands } from "./support/hydration";

/**
 * Ryzyko #7 z `context/foundation/test-plan.md`:
 * „Nauczyciel bezpowrotnie traci zapisany plan dnia — hasło i wszystkie
 * propozycje znikają trwale, a jedyne, co przed tym stoi, to dialog
 * potwierdzenia w przeglądarce."
 *
 * Wzorzec: `seed.spec.ts`. Reguły: `E2E-RULES.md`.
 *
 * **Dlaczego to musi być test e2e.** Ochroną jest tu okno potwierdzenia
 * (`DayPlanEditor.tsx`, `deletePlan()` → `ConfirmDialog`) — element, który
 * istnieje wyłącznie w wyrenderowanej stronie. Żaden test integracyjny ani pgTAP
 * go nie dotknie, bo na ich poziomie to okno po prostu nie istnieje. Do tego trasa kasująca adresuje
 * dzień **datą**, nie identyfikatorem, i nie filtruje po właścicielu
 * (`deleteDayPlan` robi `.eq("plan_date", …)` i nic więcej), więc zakres
 * kasowania wyznaczają dopiero polityki RLS.
 *
 * **Dlaczego trzy plany, nie jeden.** `test-plan.md` §Risk Response #7 nazywa
 * antywzorzec wprost: „Test kasujący jedyny istniejący dzień jedynego konta —
 * strukturalnie nie może wykryć, że operacja zabrała za dużo". Test bez dnia
 * sąsiedniego i bez dnia drugiego konta przechodziłby także dla operacji
 * kasującej wszystko, co nauczyciel kiedykolwiek zapisał.
 *
 * **Uwaga na okno potwierdzenia**: bez kliknięcia w oknie operacja zostaje w
 * zawieszeniu, więc test najpierw potwierdza, że okno jest widoczne, a dopiero
 * potem klika przycisk zgody (`E2E-RULES.md` §Okna potwierdzeń).
 */
test.describe("Ryzyko #7 — zakres operacji kasującej plan dnia", () => {
  const seededPlanIds: string[] = [];

  test.afterEach(async () => {
    await deleteSeededPlans(seededPlanIds);
    seededPlanIds.length = 0;
  });

  test("ryzyko #7: usunięcie planu zdejmuje dokładnie ten jeden dzień — sąsiedni dzień i dzień innego konta zostają nietknięte", async ({
    browser,
  }) => {
    // `uniquePlanDate()` rezerwuje odstęp na dni sąsiednie, więc `plusDays`
    // nigdy nie trafi w dzień innego testu.
    const targetDate = uniquePlanDate();
    const neighbourDate = plusDays(targetDate, 1);
    const stamp = uniqueStamp();

    const targetTitle = `Powitanie ${stamp}`;
    const neighbourStamp = `${stamp}-sasiad`;
    const otherAccountStamp = `${stamp}-konto-b`;

    const teacherAId = await ensureTeacher(TEACHER_A);
    const teacherBId = await ensureTeacher(TEACHER_B);

    // --- Setup: dzień do skasowania (zatwierdzony — czyli ten, którego strata
    // boli najbardziej), dzień sąsiedni tego samego konta, i ten sam dzień
    // należący do konta B ------------------------------------------------------
    seededPlanIds.push(
      await seedDayPlan({
        userId: teacherAId,
        planDate: targetDate,
        prompt: `Andrzejki ${stamp}`,
        activities: activitiesFor(stamp),
        accepted: true,
      }),
      await seedDayPlan({
        userId: teacherAId,
        planDate: neighbourDate,
        prompt: `Jesień ${neighbourStamp}`,
        activities: activitiesFor(neighbourStamp),
      }),
      await seedDayPlan({
        userId: teacherBId,
        planDate: targetDate,
        prompt: `Zima ${otherAccountStamp}`,
        activities: activitiesFor(otherAccountStamp),
      }),
    );

    const ownerContext = await browser.newContext({ storageState: TEACHER_A.storageState });
    const otherContext = await browser.newContext({ storageState: TEACHER_B.storageState });

    try {
      const ownerPage = await ownerContext.newPage();
      await ownerPage.goto(`/plan?date=${targetDate}`);
      await expect(ownerPage.getByRole("heading", { name: targetTitle })).toBeVisible();
      // Przycisk kasowania jest w DOM-ie już po SSR, ale bez handlera. Bez tego
      // czekania kliknięcie poniżej bywa połykane pod obciążeniem równoległym.
      await waitForIslands(ownerPage);

      // --- Akcja: kasowanie za zgodą w dialogu --------------------------------
      await ownerPage.getByRole("button", { name: "Usuń plan dnia" }).click();

      // Widoczność okna jest asercją samą w sobie: gdyby ktoś usunął pytanie z
      // `deletePlan()`, plan znikałby bez niego, a ten test ma to zauważyć —
      // okna, którego nie ma, nie da się ani zobaczyć, ani kliknąć.
      const dialog = ownerPage.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText("Tej operacji nie można cofnąć.");
      await dialog.getByRole("button", { name: "Usuń plan", exact: true }).click();

      // Po udanym kasowaniu wyspa robi pełną nawigację na ten sam dzień, więc
      // czekamy na stan pustego dnia, nie na upływ czasu.
      await expect(ownerPage.getByText("Ten dzień nie ma jeszcze planu")).toBeVisible();
      await expect(ownerPage.getByRole("heading", { name: targetTitle })).toHaveCount(0);

      // --- Asercje zakresu: co MIAŁO przeżyć ---------------------------------
      // Bez tych dwóch test przeszedłby również dla operacji, która skasowała
      // nauczycielowi cały kalendarz.
      await ownerPage.goto(`/plan?date=${neighbourDate}`);
      await expect(ownerPage.getByRole("heading", { name: `Powitanie ${neighbourStamp}` })).toBeVisible();

      const otherPage = await otherContext.newPage();
      await otherPage.goto(`/plan?date=${targetDate}`);
      await expect(otherPage.getByRole("heading", { name: `Powitanie ${otherAccountStamp}` })).toBeVisible();
    } finally {
      await ownerContext.close();
      await otherContext.close();
    }
  });
});
