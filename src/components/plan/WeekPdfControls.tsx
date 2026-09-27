import PdfDownloadControls from "@/components/plan/PdfDownloadControls";
import { buildPrintWeek, PDF_BUTTON_LABELS, pdfFileName, type WeekPdfLayoutKind } from "@/lib/plan-pdf/model";
import type { DayPlanView } from "@/types";

/**
 * The week's two "take it with you" buttons: a PDF with a day per page, or the
 * whole week on one landscape page (`S-13`).
 *
 * Getting a file out of the browser is {@link PdfDownloadControls}'s; this only
 * says what the week prints and when it may.
 *
 * `plans` is the island's saved state (`day.plan`), never the SSR props and
 * never a held batch. The board disables these buttons while anything is held,
 * so what goes on paper is always what the database has and the screen shows.
 */

interface WeekPdfControlsProps {
  readonly weekStart: string;
  readonly days: readonly string[];
  /** From `day.plan`, not from `batch`. Absent key means an empty day. */
  readonly plans: Readonly<Partial<Record<string, DayPlanView>>>;
  readonly disabled: boolean;
  readonly disabledReason: string | null;
}

const KINDS: readonly WeekPdfLayoutKind[] = ["day-per-page", "week-per-page"];
const BUTTONS = KINDS.map((kind) => ({ kind, label: PDF_BUTTON_LABELS[kind] }));

export default function WeekPdfControls({ weekStart, days, plans, disabled, disabledReason }: WeekPdfControlsProps) {
  return (
    <PdfDownloadControls
      ariaLabel="Wydruk tygodnia"
      buttons={BUTTONS}
      loadDocument={() => Promise.resolve(buildPrintWeek(weekStart, days, plans))}
      fileName={(kind) => pdfFileName(weekStart, kind as WeekPdfLayoutKind)}
      disabled={disabled}
      disabledReason={disabledReason}
    />
  );
}
