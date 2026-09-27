import PdfDownloadControls, { PdfDocumentLoadError } from "@/components/plan/PdfDownloadControls";
import { isMonthPlansBody } from "@/lib/day-plan-guards";
import {
  buildPrintMonth,
  MONTH_PDF_BUTTON_LABELS,
  monthPdfFileName,
  type MonthPdfLayoutKind,
  type PrintDocument,
} from "@/lib/plan-pdf/model";

/**
 * The month's two "take it with you" buttons (`S-14`, FR-021): the whole month
 * as a grid on one sheet, or week by week with full descriptions.
 *
 * The page renders only summaries - no activities - so the print's data is read
 * on click from `GET /api/day-plan/month`, never with the page. The page mutates
 * nothing either, so unlike the week there is no unsaved state the buttons must
 * wait out: they are always enabled.
 */

interface MonthPdfControlsProps {
  /** `YYYY-MM`. */
  readonly month: string;
}

const KINDS: readonly MonthPdfLayoutKind[] = ["month-grid", "week-per-page"];
const BUTTONS = KINDS.map((kind) => ({ kind, label: MONTH_PDF_BUTTON_LABELS[kind] }));

const LOAD_FAILED = "Nie udało się wczytać planów miesiąca. Spróbuj ponownie.";
const SESSION_EXPIRED = "Sesja wygasła. Zaloguj się ponownie.";

async function loadMonth(month: string): Promise<PrintDocument> {
  let response: Response;
  try {
    response = await fetch(`/api/day-plan/month?month=${encodeURIComponent(month)}`);
  } catch (error) {
    throw new PdfDocumentLoadError(LOAD_FAILED, { cause: error });
  }
  if (response.status === 401) {
    throw new PdfDocumentLoadError(SESSION_EXPIRED);
  }
  if (!response.ok) {
    throw new PdfDocumentLoadError(LOAD_FAILED);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!isMonthPlansBody(body)) {
    throw new PdfDocumentLoadError(LOAD_FAILED);
  }
  return buildPrintMonth(month, body.plans);
}

export default function MonthPdfControls({ month }: MonthPdfControlsProps) {
  return (
    <PdfDownloadControls
      ariaLabel="Wydruk miesiąca"
      buttons={BUTTONS}
      loadDocument={() => loadMonth(month)}
      fileName={(kind) => monthPdfFileName(month, kind as MonthPdfLayoutKind)}
      disabled={false}
      disabledReason={null}
    />
  );
}
