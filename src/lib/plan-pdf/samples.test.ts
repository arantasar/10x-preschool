import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, it } from "vitest";

import { readPlanFonts } from "./__fixtures__/fonts";
import { fullMonth, LONGEST_MONTH, MONTH } from "./__fixtures__/month";
import { fullWeek, planView, prose, WEEK_DAYS_ISO, WEEK_START } from "./__fixtures__/week";
import { buildPrintMonth, buildPrintWeek, type PdfLayoutKind, type PrintDocument } from "./model";
import { renderPlanPdf } from "./render";
import type { DayPlanView } from "@/types";

/**
 * Not a test: the sheets a human puts beside the design's PNG 20/21. The PDF
 * holds glyph ids, so whether a sheet looks right is a question only eyes can
 * answer (test-plan §7) - this gives them something to look at.
 *
 * `PRINT_SAMPLES=1 npx vitest run src/lib/plan-pdf/samples.test.ts` writes them
 * to `print-samples/` (gitignored); without the variable it is skipped, and
 * `npm test` writes nothing.
 */

const OUT_DIR = "print-samples";
const ACCEPTED_AT = "2026-09-23T09:31:00Z";

const [monday, , wednesday, , friday] = WEEK_DAYS_ISO;

/** An absent key is a day without a plan. */
type Plans = Partial<Record<string, DayPlanView>>;

const draftAndEmptyWeek: Plans = {
  ...fullWeek({ acceptedAt: ACCEPTED_AT }),
  [monday]: planView(monday, { acceptedAt: ACCEPTED_AT, theme: null }),
  [wednesday]: planView(wednesday, { acceptedAt: null, prompt: prose(300) }),
  [friday]: undefined,
};

const mixedMonth: Plans = {
  ...fullMonth(MONTH, { acceptedAt: ACCEPTED_AT }),
  "2026-09-14": planView("2026-09-14", { acceptedAt: null }),
  "2026-09-15": planView("2026-09-15", { acceptedAt: null }),
  "2026-09-23": undefined,
  "2026-09-24": undefined,
};

const weeks: Readonly<Record<string, PrintDocument>> = {
  "tydzien-zwykly": buildPrintWeek(WEEK_START, WEEK_DAYS_ISO, fullWeek({ acceptedAt: ACCEPTED_AT })),
  "tydzien-przepelniony": buildPrintWeek(
    WEEK_START,
    WEEK_DAYS_ISO,
    fullWeek({ acceptedAt: ACCEPTED_AT, descriptionLength: 4000 }),
  ),
  "tydzien-szkic-i-pusty": buildPrintWeek(WEEK_START, WEEK_DAYS_ISO, draftAndEmptyWeek),
};

const months: Readonly<Record<string, PrintDocument>> = {
  "miesiac-pelny": buildPrintMonth(MONTH, mixedMonth),
  "miesiac-najdluzszy": buildPrintMonth(LONGEST_MONTH, fullMonth(LONGEST_MONTH, { prompt: prose(200) })),
};

const WEEK_KINDS: readonly PdfLayoutKind[] = ["week-per-page", "day-per-page"];
const MONTH_KINDS: readonly PdfLayoutKind[] = ["month-grid", "week-per-page"];

describe.skipIf(!process.env.PRINT_SAMPLES)("print samples", () => {
  it("writes every layout of every sample to print-samples/", async () => {
    const fonts = await readPlanFonts();
    await mkdir(OUT_DIR, { recursive: true });
    const jobs = [
      ...Object.entries(weeks).flatMap(([name, doc]) => WEEK_KINDS.map((kind) => ({ name, doc, kind }))),
      ...Object.entries(months).flatMap(([name, doc]) => MONTH_KINDS.map((kind) => ({ name, doc, kind }))),
    ];
    for (const { name, doc, kind } of jobs) {
      await writeFile(join(OUT_DIR, `${name}-${kind}.pdf`), await renderPlanPdf(doc, kind, fonts));
    }
  }, 60_000);
});
