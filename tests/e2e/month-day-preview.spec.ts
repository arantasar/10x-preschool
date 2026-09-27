import { test, expect, type Page } from "@playwright/test";
import { deleteSeededPlans, ensureTeacher, seedDayPlan, TEACHER_A } from "./support/supabase-admin";
import { activitiesFor, plusDays, uniqueStamp, uniqueWeekStart } from "./support/test-data";
import { waitForIslands } from "./support/hydration";

/**
 * Ryzyko #10 z `context/foundation/test-plan.md`: podgląd dnia w siatce
 * miesiąca (S-07, FR-010).
 *
 * Wzorzec: `seed.spec.ts`. Reguły: `E2E-RULES.md`.
 *
 * **Dlaczego e2e, skoro logika czasu ma testy jednostkowe.**
 * `src/lib/day-preview.test.ts` dowodzi, że moduł nie pobiera dni mijanych,
 * pamięta obejrzane i nie pokazuje spóźnionej odpowiedzi pod cudzą datą. Nie
 * dowodzi, że kafelki go wołają: że najechanie myszą i fokus klawiatury
 * docierają do `show`, a zejście do `hide`. To podpięcie istnieje wyłącznie
 * w przeglądarce.
 *
 * **Dlaczego zawsze kilka dni.** `test-plan.md` §Risk Response #10 nazywa
 * antywzorzec: test z jednym zasianym dniem strukturalnie nie wykryje treści
 * sąsiada ani żądania za dzień mijany. Każdy dzień ma własny `uniqueStamp`, więc
 * tytuły propozycji różnią się między dniami.
 *
 * **Brak żądania bez czekania na czas.** Asercja „dni mijane nie zostały
 * pobrane" jest robiona dopiero wtedy, gdy popover dnia *ostatniego* jest
 * widoczny. Jego opóźnienie wystartowało jako ostatnie, więc gdyby timery dni
 * wcześniejszych nie zostały anulowane, ich żądania już by poleciały.
 *
 * **Tekst sprawdzany wyłącznie w popoverze.** Pod `astro dev` pasek narzędzi
 * Astro trzyma propsy wysp w shadow DOM, który `getByText` przebija
 * (`week-day-controls.spec.ts`); `getByRole("tooltip")` tego nie łapie.
 */

/** Kafelek dnia: link, którego nazwa dostępna zaczyna się od daty. */
function tile(page: Page, isoDate: string) {
  return page.getByRole("link", { name: new RegExp(`^Plan na ${isoDate} `) });
}

/** Daty, o które strona zapytała `GET /api/day-plan`, w kolejności. */
function recordPreviewRequests(page: Page): string[] {
  const dates: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (request.method() === "GET" && url.pathname === "/api/day-plan") {
      dates.push(url.searchParams.get("date") ?? "");
    }
  });
  return dates;
}

test.describe("Ryzyko #10 — podgląd dnia w siatce miesiąca", () => {
  const seededPlanIds: string[] = [];

  test.afterEach(async () => {
    await deleteSeededPlans(seededPlanIds);
    seededPlanIds.length = 0;
  });

  /** Zasiewa po jednym planie na każdy dzień i zwraca tytuł pierwszej propozycji każdego z nich. */
  async function seedDays(dates: readonly string[]): Promise<string[]> {
    const userId = await ensureTeacher(TEACHER_A);
    const titles: string[] = [];
    for (const planDate of dates) {
      const activities = activitiesFor(uniqueStamp());
      seededPlanIds.push(await seedDayPlan({ userId, planDate, prompt: `Hasło ${planDate}`, activities }));
      titles.push(activities[0].title);
    }
    return titles;
  }

  test("ryzyko #10: podgląd z klawiatury pokazuje aktywności dnia z fokusem", async ({ page }) => {
    const monday = uniqueWeekStart();
    const tuesday = plusDays(monday, 1);
    const [mondayTitle, tuesdayTitle] = await seedDays([monday, tuesday]);

    await page.goto(`/plan/month?month=${monday.slice(0, 7)}`);
    await waitForIslands(page);

    await tile(page, monday).focus();
    await page.keyboard.press("Tab");
    await expect(tile(page, tuesday)).toBeFocused();

    const preview = page.getByRole("tooltip");
    await expect(preview).toContainText(tuesdayTitle);
    await expect(preview).not.toContainText(mondayTitle);

    await page.keyboard.press("Escape");
    await expect(preview).toBeHidden();
  });

  test("ryzyko #10: przeciągnięcie kursora przez rząd pobiera wyłącznie dzień, na którym kursor stanął", async ({
    page,
  }) => {
    const monday = uniqueWeekStart();
    const week = [0, 1, 2, 3, 4].map((offset) => plusDays(monday, offset));
    const titles = await seedDays(week);

    await page.goto(`/plan/month?month=${monday.slice(0, 7)}`);
    await waitForIslands(page);

    // `mouse.move` jedzie po współrzędnych okna i - inaczej niż `hover()` - ani
    // nie przewija strony, ani nie sprawdza, co leży nad celem. W oknie 1280×720
    // tydzień z dolnego rzędu miesiąca jest pod krawędzią okna, a po przewinięciu
    // ląduje pod paskiem narzędzi `astro dev`, który wisi na środku dołu okna i
    // przejmuje wskaźnik. Okno, w którym cały miesiąc mieści się nad paskiem,
    // usuwa oba przypadki naraz, niezależnie od tego, w który rząd trafi
    // wylosowany tydzień.
    await page.setViewportSize({ width: 1280, height: 1400 });

    // Pozycje najpierw, ruch potem: odczyt geometrii między ruchami wydłużałby
    // postój nad każdym kafelkiem.
    const centres = [];
    for (const date of week) {
      const box = await tile(page, date).boundingBox();
      if (!box) throw new Error(`Kafelek ${date} nie ma pozycji na stronie.`);
      centres.push({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
    }

    const requested = recordPreviewRequests(page);
    for (const { x, y } of centres) {
      await page.mouse.move(x, y);
    }

    const preview = page.getByRole("tooltip");
    await expect(preview).toContainText(titles[4]);
    await expect(preview).not.toContainText(titles[3]);
    expect(requested).toEqual([week[4]]);
  });

  test("ryzyko #10: dzień obejrzany drugi raz nie jest pobierany ponownie", async ({ page }) => {
    const monday = uniqueWeekStart();
    const tuesday = plusDays(monday, 1);
    const [, tuesdayTitle] = await seedDays([monday, tuesday]);

    await page.goto(`/plan/month?month=${monday.slice(0, 7)}`);
    await waitForIslands(page);
    const requested = recordPreviewRequests(page);
    const preview = page.getByRole("tooltip");

    await tile(page, tuesday).hover();
    await expect(preview).toContainText(tuesdayTitle);

    await page.getByRole("heading", { name: "Plan miesiąca" }).hover();
    await expect(preview).toBeHidden();

    await tile(page, tuesday).hover();
    await expect(preview).toContainText(tuesdayTitle);
    expect(requested).toEqual([tuesday]);
  });
});
