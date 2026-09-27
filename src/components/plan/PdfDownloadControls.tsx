import { useId, useRef, useState } from "react";
import { CircleAlert, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PdfLayoutKind, PrintDocument } from "@/lib/plan-pdf/model";

/**
 * "Take it with you" buttons: one per PDF layout, each turning a
 * {@link PrintDocument} into a downloaded file.
 *
 * Shared by the week (`S-13`) and the month (`S-14`); what differs between them
 * - where the document comes from and when the buttons may be used - is the
 * caller's. Everything about getting a file out of the browser lives here.
 *
 * The renderer and the fonts are loaded on the first click, not with the island:
 * pdf-lib and fontkit are several hundred kilobytes the page does not need
 * until a teacher asks for paper. `import()` rather than a static import is what
 * keeps them out of the initial bundle - which is why no module under
 * `src/components` may import `@/lib/plan-pdf/render` statically.
 */

export interface PdfDownloadButton {
  readonly kind: PdfLayoutKind;
  readonly label: string;
}

interface PdfDownloadControlsProps {
  /** `Wydruk tygodnia` / `Wydruk miesiąca`. */
  readonly ariaLabel: string;
  readonly buttons: readonly PdfDownloadButton[];
  /** May throw {@link PdfDocumentLoadError} to show its message instead of the generic one. */
  readonly loadDocument: () => Promise<PrintDocument>;
  readonly fileName: (kind: PdfLayoutKind) => string;
  readonly disabled: boolean;
  readonly disabledReason: string | null;
}

/** A failure to get the document's data, carrying the Polish sentence the teacher sees. */
export class PdfDocumentLoadError extends Error {
  readonly userMessage: string;

  constructor(userMessage: string, options?: ErrorOptions) {
    super(userMessage, options);
    this.userMessage = userMessage;
  }
}

const RENDER_FAILED = "Nie udało się przygotować pliku PDF. Spróbuj ponownie.";
// The renderer chunk is named by content hash and only the current deployment's
// files are served, so a page opened before a deploy can no longer load it.
// Retrying fails the same way every time; only a reload helps.
const RENDERER_UNAVAILABLE = "Nie udało się wczytać modułu PDF. Odśwież stronę i spróbuj ponownie.";

class RendererUnavailableError extends Error {}

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
  // Not right after the click: Firefox and Safari (iOS opens a preview) read
  // the blob asynchronously and lose it once the URL is revoked. One PDF per
  // click, so holding it for a while costs nothing.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 40_000);
}

function errorMessage(error: unknown): string {
  if (error instanceof PdfDocumentLoadError) return error.userMessage;
  if (error instanceof RendererUnavailableError) return RENDERER_UNAVAILABLE;
  return RENDER_FAILED;
}

export default function PdfDownloadControls({
  ariaLabel,
  buttons,
  loadDocument,
  fileName,
  disabled,
  disabledReason,
}: PdfDownloadControlsProps) {
  const [preparing, setPreparing] = useState<PdfLayoutKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set synchronously on click, so a double click cannot start two downloads
  // before the first `setPreparing` has re-rendered the buttons as disabled.
  const inFlight = useRef(false);
  const reasonId = useId();

  function download(kind: PdfLayoutKind): void {
    if (inFlight.current || disabled) return;
    inFlight.current = true;
    setPreparing(kind);
    setError(null);

    void (async () => {
      try {
        const [{ renderPlanPdf }, regular, bold, printDocument] = await Promise.all([
          import("@/lib/plan-pdf/render").catch((error: unknown) => {
            throw new RendererUnavailableError("PDF renderer failed to load", { cause: error });
          }),
          fetchFont("/fonts/NotoSans-Regular.ttf"),
          fetchFont("/fonts/NotoSans-Bold.ttf"),
          loadDocument(),
        ]);
        const bytes = await renderPlanPdf(printDocument, kind, { regular, bold });
        saveFile(bytes, fileName(kind));
      } catch (error) {
        setError(errorMessage(error));
      } finally {
        inFlight.current = false;
        setPreparing(null);
      }
    })();
  }

  return (
    <section aria-label={ariaLabel} className="space-y-2 border-t border-white/10 pt-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        {buttons.map(({ kind, label }) => (
          <Button
            key={kind}
            type="button"
            disabled={disabled || preparing !== null}
            aria-describedby={disabledReason !== null ? reasonId : undefined}
            onClick={() => {
              download(kind);
            }}
            className="flex-1 cursor-pointer rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-white transition-colors hover:bg-white/10 hover:text-white"
          >
            <FileDown className="size-4" />
            {preparing === kind ? "Przygotowuję PDF…" : label}
          </Button>
        ))}
      </div>
      {disabledReason !== null && (
        <p id={reasonId} className="text-xs text-amber-200/80">
          {disabledReason}
        </p>
      )}
      {error !== null && (
        <p role="alert" className="flex items-center gap-1 text-sm text-red-300">
          <CircleAlert className="size-4 shrink-0" />
          {error}
        </p>
      )}
    </section>
  );
}
