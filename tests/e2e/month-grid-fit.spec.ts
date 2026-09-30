import { test, expect } from "@playwright/test";
import { deleteSeededPlans, ensureTeacher, seedDayPlan, TEACHER_A } from "./support/supabase-admin";
import { activitiesFor, plusDays, uniqueStamp, uniqueWeekStartWithinMonth } from "./support/test-data";

/**
 * Ryzyko #14 z `context/foundation/test-plan.md`: po przebudowie siatki
 * (`design-planner`) miesiąc przestaje mieścić się w wysokości, w której
 * mieścił się dotąd.
 *
 * Wzorzec: `seed.spec.ts`. Reguły: `E2E-RULES.md`.
 *
 * **Dlaczego e2e.** Wysokość bloku siatki istnieje wyłącznie w wyrenderowanym
 * układzie: wynika z liczby wierszy, stałej wysokości komórki i tego, że tekst
 * ustępuje komórce, a nie odwrotnie. Liczbę wierszy (najwyżej pięć) dowodzi
 * `src/lib/month-grid.test.ts`; tego, że wiersz nie rośnie z treścią, nie
 * dowiedzie nic poza przeglądarką.
 *
 * **Dlaczego długie teksty.** Siatka z krótkimi tematami mieści się zawsze —
 * także wtedy, gdy komórka ma wysokość minimalną zamiast stałej. Ryzyko
 * materializuje się dopiero na treści dłuższej niż komórka, więc oba zasiane
 * dni mają hasło na ponad 200 znaków i temat na pełne 200 (górna granica
 * kolumny). Widziane na czerwono przy
 * `min-h` w miejscu `h` na kafelku (`MonthGrid.tsx`).
 *
 * **558 px** to wysokość, jaką siatka miała przed przebudową
 * (`month-day-preview`); mierzony jest blok siatki, nie strona.
 */

const GRID_MAX_HEIGHT = 558;

test.describe("Ryzyko #14 — siatka miesiąca mieści się w dotychczasowej wysokości", () => {
  const seededPlanIds: string[] = [];

  test.afterEach(async () => {
    await deleteSeededPlans(seededPlanIds);
    seededPlanIds.length = 0;
  });

  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    test(`ryzyko #14: siatka z długimi tematami ma najwyżej ${String(GRID_MAX_HEIGHT)} px wysokości przy ${String(viewport.width)} px szerokości`, async ({
      page,
    }) => {
      const userId = await ensureTeacher(TEACHER_A);
      const monday = uniqueWeekStartWithinMonth();
      const tuesday = plusDays(monday, 1);
      const stamp = uniqueStamp();
      // Słowa rozdzielone spacjami: tekst ma się łamać w wiele linii, a nie
      // wyjeżdżać w bok jednym ciągiem.
      const longPrompt = `Hasło ${stamp} ${"bardzo długie hasło tygodnia ".repeat(8)}`.trim();
      // Temat ma w bazie górną granicę 200 znaków (`THEME_MAX`) — bierzemy ją całą.
      const longTheme = `Temat ${stamp} ${"bardzo długi temat dnia ".repeat(10)}`.slice(0, 200).trimEnd();
      expect(longPrompt.length).toBeGreaterThanOrEqual(200);
      expect(longTheme.length).toBeGreaterThanOrEqual(199);

      for (const planDate of [monday, tuesday]) {
        seededPlanIds.push(
          await seedDayPlan({
            userId,
            planDate,
            prompt: longPrompt,
            theme: longTheme,
            activities: activitiesFor(stamp),
          }),
        );
      }

      await page.setViewportSize(viewport);
      await page.goto(`/plan/month?month=${monday.slice(0, 7)}`);

      // Dowód, że mierzymy siatkę z zasianą treścią, a nie pusty miesiąc.
      const grid = page.getByRole("group", { name: "Siatka miesiąca" });
      await expect(grid.getByRole("link", { name: new RegExp(`^Plan na ${monday} `) })).toContainText(`Temat ${stamp}`);
      await expect(grid.getByRole("link", { name: new RegExp(`^Plan na ${tuesday} `) })).toBeVisible();

      const box = await grid.boundingBox();
      if (!box) throw new Error("Siatka miesiąca nie ma pozycji na stronie.");
      expect(box.height).toBeLessThanOrEqual(GRID_MAX_HEIGHT);
    });
  }
});
