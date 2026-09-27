import { useRef, useState } from "react";
import { CircleAlert, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildPrintWeek, PDF_BUTTON_LABELS, pdfFileName, type PdfLayoutKind } from "@/lib/week-pdf/model";
import type { DayPlanView } from "@/types";

/**
 * The week's two "take it with you" buttons: a PDF with a day per page, or the
 * whole week on one landscape page (`S-13`).
 *
 * The renderer and the fonts are loaded on the first click, not with the island:
 * pdf-lib and fontkit are several hundred kilobytes the week view does not need
 * until a teacher asks for paper. `import()` rather than a static import is what
 * keeps them out of the initial bundle - which is why no module under
 * `src/components` may import `@/lib/week-pdf/render` statically.
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

const KINDS: readonly PdfLayoutKind[] = ["day-per-page", "week-per-page"];

async function fetchFont(path: string): Promise<Uint8Array> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Font ${path}: ${String(response.status)}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Hands the bytes to the browser as a file.
 *
 * A temporary `<a download>` rather than navigation or `window.open`: both of
 * those lose the file name, and several browsers open a preview instead of
 * saving.
 */
function saveFile(bytes: Uint8Array, fileName: string): void {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // After the click has been dispatched; revoking synchronously can cancel the
  // download in some browsers.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

export default function WeekPdfControls({ weekStart, days, plans, disabled, disabledReason }: WeekPdfControlsProps) {
  const [preparing, setPreparing] = useState<PdfLayoutKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set synchronously on click, so a double click cannot start two downloads
  // before the first `setPreparing` has re-rendered the buttons as disabled.
  const inFlight = useRef(false);

  function download(kind: PdfLayoutKind): void {
    if (inFlight.current || disabled) return;
    inFlight.current = true;
    setPreparing(kind);
    setError(null);

    void (async () => {
      try {
        const [{ renderWeekPdf }, regular, bold] = await Promise.all([
          import("@/lib/week-pdf/render"),
          fetchFont("/fonts/NotoSans-Regular.ttf"),
          fetchFont("/fonts/NotoSans-Bold.ttf"),
        ]);
        const bytes = await renderWeekPdf(buildPrintWeek(weekStart, days, plans), kind, { regular, bold });
        saveFile(bytes, pdfFileName(weekStart, kind));
      } catch {
        setError("Nie udało się przygotować pliku PDF. Spróbuj ponownie.");
      } finally {
        inFlight.current = false;
        setPreparing(null);
      }
    })();
  }

  return (
    <section aria-label="Wydruk tygodnia" className="space-y-2 border-t border-white/10 pt-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        {KINDS.map((kind) => (
          <Button
            key={kind}
            type="button"
            variant="outline"
            disabled={disabled || preparing !== null}
            onClick={() => {
              download(kind);
            }}
            className="flex-1 rounded-lg border-white/20 bg-white/5 text-white hover:bg-white/10"
          >
            <FileDown className="size-4" />
            {preparing === kind ? "Przygotowuję PDF…" : PDF_BUTTON_LABELS[kind]}
          </Button>
        ))}
      </div>
      {disabledReason !== null && <p className="text-xs text-amber-200/80">{disabledReason}</p>}
      {error !== null && (
        <p role="alert" className="flex items-center gap-1 text-sm text-red-300">
          <CircleAlert className="size-4 shrink-0" />
          {error}
        </p>
      )}
    </section>
  );
}
