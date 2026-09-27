import { readFile } from "node:fs/promises";

import { test, expect, type Download, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { deleteSeededPlans, ensureTeacher, seedDayPlan, TEACHER_A, TEACHER_B } from "./support/supabase-admin";
import { activitiesFor, plusDays, uniqueStamp, uniqueWeekStart } from "./support/test-data";
import { waitForIslands } from "./support/hydration";

/**
 * Ryzyko #12 z `context/foundation/test-plan.md`: wydruk miesiąca (S-14).
 *
 * Wzorzec: `week-print.spec.ts`. Reguły: `E2E-RULES.md`.
 *
 * **Dlaczego e2e.** Jak przy tygodniu: PDF powstaje w przeglądarce, po
 * dynamicznym imporcie renderera, pobraniu fontów i — tu nowe ogniwo — odczycie
 * `GET /api/day-plan/month` po kliknięciu. Treść wydruku (sloty spoza miesiąca
 * puste, szkic oznaczony, ucięcie w siatce) jest asertowana na czystym modelu i
 * układzie w `src/lib/plan-pdf/`: tekst w PDF-ie to identyfikatory glifów. Ten
 * plik dowodzi struktury plików i tego, co trasa oddaje przeglądarce.
 *
 * **Izolacja kont na odpowiedzi trasy, nie na PDF-ie.** Nowy odczyt jest
 * pierwszym w paczce szerszym niż tydzień; plan nauczyciela B w tym samym
 * miesiącu nie może trafić do wydruku A. Tekstu PDF-a nie da się tu przeczytać,
 * a PDF powstaje dokładnie z tej odpowiedzi — więc to ona jest asertowana.
 *
 * **Oczekiwania liczone tu, nie importowane z aplikacji** — nazwa pliku i liczba
 * tygodni miesiąca z własnej arytmetyki dat.
 */

const MONTH_GRID = "Pobierz PDF — siatka miesiąca";
const WEEK_BY_WEEK = "Pobierz PDF — tygodniami";

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

/** Poniedziałek, którego cały tydzień roboczy leży w jednym miesiącu. */
function uniqueWeekInsideMonth(): string {
  for (;;) {
    const weekStart = uniqueWeekStart();
    if (weekStart.slice(0, 7) === plusDays(weekStart, 4).slice(0, 7)) {
      return weekStart;
    }
  }
}

function weekday(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

/** Liczba tygodni (poniedziałek–niedziela), które dotykają miesiąca — wiersze siatki i strony „tygodniami”. */
function weeksTouching(month: string): number {
  const first = `${month}-01`;
  let monday = plusDays(first, -((weekday(first) + 6) % 7));
  let count = 0;
  while (monday.slice(0, 7) <= month) {
    count += 1;
    monday = plusDays(monday, 7);
  }
  return count;
}

test.describe("Ryzyko #12 — wydruk miesiąca", () => {
  const seededPlanIds: string[] = [];

  test.afterEach(async () => {
    await deleteSeededPlans(seededPlanIds);
    seededPlanIds.length = 0;
  });

  /** Poniedziałek A zaakceptowany, środa A szkicem, czwartek B. */
  async function seedMonth(weekStart: string): Promise<{ stampA: string; stampB: string }> {
    const stampA = uniqueStamp();
    const stampB = uniqueStamp();
    const [teacherAId, teacherBId] = await Promise.all([ensureTeacher(TEACHER_A), ensureTeacher(TEACHER_B)]);
    seededPlanIds.push(
      await seedDayPlan({
        userId: teacherAId,
        planDate: weekStart,
        prompt: `Jesień ${stampA}-pn`,
        activities: activitiesFor(`${stampA}-pn`),
        accepted: true,
      }),
      await seedDayPlan({
        userId: teacherAId,
        planDate: plusDays(weekStart, 2),
        prompt: `Jesień ${stampA}-sr`,
        activities: activitiesFor(`${stampA}-sr`),
        accepted: false,
      }),
      await seedDayPlan({
        userId: teacherBId,
        planDate: plusDays(weekStart, 3),
        prompt: `Obcy ${stampB}-cz`,
        activities: activitiesFor(`${stampB}-cz`),
        accepted: true,
      }),
    );
    return { stampA, stampB };
  }

  test("ryzyko #12: „siatka miesiąca” daje PDF z jedną poziomą stroną", async ({ page }) => {
    const weekStart = uniqueWeekInsideMonth();
    const month = weekStart.slice(0, 7);
    await seedMonth(weekStart);

    await page.goto(`/plan/month?month=${month}`);
    await waitForIslands(page);

    const download = await downloadVia(page, MONTH_GRID);
    expect(download.suggestedFilename()).toBe(`plan-miesiaca-${month}-siatka.pdf`);

    const { bytes, pages } = await readPdf(download);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(pages).toHaveLength(1);
    expect(pages[0].width).toBeGreaterThan(pages[0].height);
  });

  test("ryzyko #12: „tygodniami” daje poziomą stronę na każdy tydzień miesiąca", async ({ page }) => {
    const weekStart = uniqueWeekInsideMonth();
    const month = weekStart.slice(0, 7);
    await seedMonth(weekStart);

    await page.goto(`/plan/month?month=${month}`);
    await waitForIslands(page);

    const download = await downloadVia(page, WEEK_BY_WEEK);
    expect(download.suggestedFilename()).toBe(`plan-miesiaca-${month}-tygodniami.pdf`);

    // Zasiane plany są krótkie, więc żaden tydzień nie przechodzi na „(cd.)”.
    const { bytes, pages } = await readPdf(download);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(pages).toHaveLength(weeksTouching(month));
    for (const { width, height } of pages) {
      expect(width).toBeGreaterThan(height);
    }
  });

  test("ryzyko #12: odczyt miesiąca oddaje plany A, bez planu B i bez dni spoza miesiąca", async ({ page }) => {
    const weekStart = uniqueWeekInsideMonth();
    const month = weekStart.slice(0, 7);
    const wednesday = plusDays(weekStart, 2);
    const thursday = plusDays(weekStart, 3);
    const { stampA, stampB } = await seedMonth(weekStart);

    const response = await page.request.get(`/api/day-plan/month?month=${month}`);
    expect(response.status()).toBe(200);
    const body = (await response.json()) as {
      month: string;
      plans: Partial<Record<string, { plan: { accepted_at: string | null }; activities: { title: string }[] }>>;
    };

    expect(body.month).toBe(month);
    const titles = (date: string) => (body.plans[date]?.activities ?? []).map((activity) => activity.title).join("\n");
    expect(titles(weekStart)).toContain(`${stampA}-pn`);
    expect(titles(wednesday)).toContain(`${stampA}-sr`);
    expect(typeof body.plans[weekStart]?.plan.accepted_at).toBe("string");
    expect(body.plans[wednesday]?.plan.accepted_at).toBeNull();
    // Inny test może mieć tego dnia własny plan A — asercja na znaczniku B, nie na obecności klucza.
    expect(titles(thursday)).not.toContain(stampB);

    for (const date of Object.keys(body.plans)) {
      expect(date.slice(0, 7)).toBe(month);
      expect([0, 6]).not.toContain(weekday(date));
    }
  });
});
