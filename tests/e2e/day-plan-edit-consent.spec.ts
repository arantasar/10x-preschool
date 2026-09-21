import { test, expect } from "@playwright/test";
import { deleteSeededPlans, ensureTeacher, seedDayPlan, TEACHER_A } from "./support/supabase-admin";
import { activitiesFor, uniquePlanDate, uniqueStamp } from "./support/test-data";
import { waitForIslands } from "./support/hydration";

/**
 * FR-017, drugi takt: po zgodzie dzień traci akceptację i **dowiaduje się o tym**.
 *
 * Wzorzec: `seed.spec.ts`. Reguły: `E2E-RULES.md`.
 * Siostrzany test: `day-plan-edit-confirmation.spec.ts` — ta sama ścieżka, ale
 * zakończona odmową. Ten bierze jej drugą połowę.
 *
 * **Dlaczego ten plik w ogóle powstał.** Przegląd implementacyjny (`reviews/impl-review.md`,
 * F4) zauważył, że ścieżki zgody nie ćwiczyło nic: test odmowy kończy się na
 * „Anuluj" świadomie, test trasy kończy się na JSON-ie, a wszystkie wiersze
 * `#### Manual` stały nieodhaczone. Bursztynowy banner, jego kopia i „Akceptuj
 * ponownie" nie miały żadnego dowodu renderowania — a to one są drugim taktem
 * FR-017, czyli tym, dla którego Faza 1 dokłada odczyt przed zapisem.
 *
 * **Dlaczego przeglądarka, a nie test jednostkowy.** Dowodzona rzecz jest
 * łańcuchem przez cztery warstwy: dialog → PATCH → trigger w bazie → pole w
 * odpowiedzi → wariant bannera. Test trasy widzi trzecie i czwarte ogniwo,
 * żadne inne. Zszycie ich atrapami dowiodłoby tylko tego, że atrapy się zgadzają.
 *
 * **Czego tu celowo nie ma**: odmowy (siostrzany plik) i przypadków
 * dwukartowych z `plan.md` §Testing Strategy kroki 6-7. Te drugie wymagają
 * dwóch kontekstów przeglądarki na jedno konto i zostają przy weryfikacji
 * ręcznej — `test-plan.md` §1 zasada 1.
 */
test.describe("Ryzyko #8 — zgoda w dialogu przy edycji dnia zaakceptowanego", () => {
  const seededPlanIds: string[] = [];

  test.afterEach(async () => {
    await deleteSeededPlans(seededPlanIds);
    seededPlanIds.length = 0;
  });

  test("ryzyko #8: zgoda zapisuje zmianę, banner nazywa przyczynę, a droga powrotna przywraca akceptację", async ({
    page,
  }) => {
    const planDate = uniquePlanDate();
    const stamp = uniqueStamp();
    const originalTitle = `Powitanie ${stamp}`;
    const editedTitle = `Zmienione powitanie ${stamp}`;

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

    await page.goto(`/plan?date=${planDate}`);
    await expect(page.getByText(/Plan zaakceptowany/)).toBeVisible();
    // Bez tego kliknięcie trafia w przycisk wyrenderowany serwerowo i jeszcze bez
    // handlera — dialog by nie padł, a test przeszedłby nie sprawdziwszy niczego.
    await waitForIslands(page);

    // Zgoda, nie odmowa. Zbieramy treści wszystkich dialogów, bo liczba wywołań
    // jest tu asercją na równi z ich treścią.
    const dialogs: string[] = [];
    page.on("dialog", (dialog) => {
      dialogs.push(dialog.message());
      void dialog.accept();
    });

    await page.getByRole("button", { name: `Edytuj propozycję: ${originalTitle}` }).click();
    const titleField = page.getByLabel("Tytuł", { exact: true });
    await expect(titleField).toBeVisible();
    await titleField.fill(editedTitle);
    await page.getByRole("button", { name: "Zapisz" }).click();

    // 1. Dialog padł i nazwał skutek, a nie zapytał generycznie „czy na pewno".
    //    Bez tej asercji reszta testu przeszłaby też na implementacji, która o
    //    nic nie pyta i po prostu zapisuje.
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0]).toContain("cofnie akceptację");

    // 2. Zapis przeszedł.
    await expect(page.getByRole("heading", { name: editedTitle })).toBeVisible();

    // 3. Drugi takt FR-017: w miejscu zielonej plakietki stoi zdanie mówiące
    //    **dlaczego**, a nie samo „Plan roboczy". To jest ta różnica, dla której
    //    trasa czyta stan akceptacji przed zapisem.
    await expect(page.getByText(/Akceptacja została cofnięta, bo zmieniła się treść propozycji/)).toBeVisible();
    await expect(page.getByText(/Plan zaakceptowany/)).toHaveCount(0);

    // 4. Droga powrotna działa i kosztuje jedno kliknięcie — to jest założenie,
    //    na którym plan oparł decyzję „dialog jest jedyną barierą".
    await page.getByRole("button", { name: "Akceptuj ponownie" }).click();
    await expect(page.getByText(/Plan zaakceptowany/)).toBeVisible();
    await expect(page.getByText(/Akceptacja została cofnięta/)).toHaveCount(0);

    // 5. Stan jest ulotny zgodnie z decyzją: po przeładowaniu zostaje sama
    //    plakietka, bez zdania o przyczynie — i nowy tytuł naprawdę jest w bazie.
    await page.reload();
    await expect(page.getByRole("heading", { name: editedTitle })).toBeVisible();
    await expect(page.getByText(/Plan zaakceptowany/)).toBeVisible();
    await expect(page.getByText(/Akceptacja została cofnięta/)).toHaveCount(0);
  });

  test("ryzyko #8: druga edycja tego samego dnia — już roboczego — nie pyta o nic", async ({ page }) => {
    const planDate = uniquePlanDate();
    const stamp = uniqueStamp();
    const firstTitle = `Powitanie ${stamp}`;
    const secondTitle = `Zabawa ruchowa ${stamp}`;

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

    await page.goto(`/plan?date=${planDate}`);
    await expect(page.getByText(/Plan zaakceptowany/)).toBeVisible();
    await waitForIslands(page);

    const dialogs: string[] = [];
    page.on("dialog", (dialog) => {
      dialogs.push(dialog.message());
      void dialog.accept();
    });

    // Pierwsza edycja zdejmuje akceptację — po niej nie ma już czego odbierać.
    await page.getByRole("button", { name: `Edytuj propozycję: ${firstTitle}` }).click();
    await page.getByLabel("Tytuł", { exact: true }).fill(`${firstTitle} (raz)`);
    await page.getByRole("button", { name: "Zapisz" }).click();
    expect(dialogs).toHaveLength(1);
    await expect(page.getByText(/Akceptacja została cofnięta/)).toBeVisible();

    // Druga edycja na tym samym, już roboczym dniu. Licznik dialogów jest tu
    // jedyną asercją, która potrafi zawieść: gdyby bramka na stanie akceptacji
    // zniknęła, nauczyciel dostałby pytanie o skutek, który już nastąpił.
    await page.getByRole("button", { name: `Edytuj propozycję: ${secondTitle}` }).click();
    await page.getByLabel("Tytuł", { exact: true }).fill(`${secondTitle} (dwa)`);
    await page.getByRole("button", { name: "Zapisz" }).click();

    await expect(page.getByRole("heading", { name: `${secondTitle} (dwa)` })).toBeVisible();
    expect(dialogs).toHaveLength(1);

    // Banner przyczyny nie przeżył drugiej mutacji: ten zapis nic nie zdjął, więc
    // zostaje zwykły „Plan roboczy". Zdanie o przyczynie stojące tutaj byłoby
    // nieprawdą o operacji, która właśnie się wykonała.
    await expect(page.getByText(/Plan roboczy/)).toBeVisible();
    await expect(page.getByText(/Akceptacja została cofnięta/)).toHaveCount(0);
  });
});
