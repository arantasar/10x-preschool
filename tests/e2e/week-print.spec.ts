import { readFile } from "node:fs/promises";

import { test, expect, type Download, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { deleteSeededPlans, ensureTeacher, seedDayPlan, TEACHER_A } from "./support/supabase-admin";
import { activitiesFor, plusDays, uniqueStamp, uniqueWeekStart } from "./support/test-data";
import { waitForIslands } from "./support/hydration";

/**
 * Ryzyko #11 z `context/foundation/test-plan.md`: wydruk tygodnia (S-13).
 *
 * Wzorzec: `seed.spec.ts`. Reguły: `E2E-RULES.md`.
 *
 * **Dlaczego e2e.** PDF powstaje w przeglądarce, ze stanu wyspy, po dynamicznym
 * imporcie renderera i pobraniu fontów z `/fonts`. Każde z ogniw — hydracja,
 * leniwy chunk, statyczne zasoby, `<a download>` — istnieje dopiero w
 * przeglądarce. Treść wydruku (szkic oznaczony, pusty dzień jawny) jest
 * asertowana niżej, na czystym modelu w `src/lib/plan-pdf/`: tekst osadzony
 * własnym fontem jest w PDF-ie zakodowany identyfikatorami glifów i nie da się
 * go tu przeczytać. Ten plik dowodzi struktury: że plik jest, jak się nazywa,
 * ile ma stron i w jakiej orientacji.
 *
 * **Tydzień: poniedziałek zatwierdzony, środa szkicem, reszta pusta.** Wszystkie
 * trzy stany dnia naraz, bo FR-020 każe drukować każdy dzień roboczy — pięć
 * stron w układzie „dzień na stronę" pada, jeśli którykolwiek dzień wypadnie.
 *
 * **Oczekiwania liczone tu, nie importowane z aplikacji** — jak w
 * `week-day-controls.spec.ts`: zmiana nazwy pliku w aplikacji nie może zmienić
 * też oczekiwania testu.
 */

const DAY_PER_PAGE = "Pobierz PDF — dzień na stronę";
const WEEK_PER_PAGE = "Pobierz PDF — tydzień na stronie";

async function downloadVia(page: Page, buttonName: string): Promise<Download> {
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: buttonName, exact: true }).click();
  return downloadEvent;
}

async function readPdf(download: Download): Promise<{ bytes: Uint8Array; pages: { width: number; height: number }[] }> {
  const bytes = new Uint8Array(await readFile(await download.path()));
  const doc = await PDFDocument.load(bytes);
  return { bytes, pages: doc.getPages().map((pdfPage) => pdfPage.getSize()) };
}

test.describe("Ryzyko #11 — wydruk tygodnia", () => {
  const seededPlanIds: string[] = [];

  test.afterEach(async () => {
    await deleteSeededPlans(seededPlanIds);
    seededPlanIds.length = 0;
  });

  async function seedWeek(weekStart: string): Promise<void> {
    const stamp = uniqueStamp();
    const teacherAId = await ensureTeacher(TEACHER_A);
    seededPlanIds.push(
      await seedDayPlan({
        userId: teacherAId,
        planDate: weekStart,
        prompt: `Jesień ${stamp}-pn`,
        activities: activitiesFor(`${stamp}-pn`),
        accepted: true,
      }),
      await seedDayPlan({
        userId: teacherAId,
        planDate: plusDays(weekStart, 2),
        prompt: `Jesień ${stamp}-sr`,
        activities: activitiesFor(`${stamp}-sr`),
        accepted: false,
      }),
    );
  }

  test("ryzyko #11: „dzień na stronę” daje PDF z pięcioma pionowymi stronami — każdy dzień roboczy", async ({
    page,
  }) => {
    const weekStart = uniqueWeekStart();
    await seedWeek(weekStart);

    await page.goto(`/plan/week?from=${weekStart}`);
    await waitForIslands(page);

    const download = await downloadVia(page, DAY_PER_PAGE);
    expect(download.suggestedFilename()).toBe(`plan-tygodnia-${weekStart}-dzien-na-strone.pdf`);

    const { bytes, pages } = await readPdf(download);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(pages).toHaveLength(5);
    for (const { width, height } of pages) {
      expect(height).toBeGreaterThan(width);
    }
  });

  test("ryzyko #11: „tydzień na stronie” daje PDF z jedną poziomą stroną", async ({ page }) => {
    const weekStart = uniqueWeekStart();
    await seedWeek(weekStart);

    await page.goto(`/plan/week?from=${weekStart}`);
    await waitForIslands(page);

    const download = await downloadVia(page, WEEK_PER_PAGE);
    expect(download.suggestedFilename()).toBe(`plan-tygodnia-${weekStart}-tydzien-na-stronie.pdf`);

    const { bytes, pages } = await readPdf(download);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(pages).toHaveLength(1);
    expect(pages[0].width).toBeGreaterThan(pages[0].height);
  });
});
