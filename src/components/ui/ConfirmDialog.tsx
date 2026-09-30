import { useEffect, useId, useRef } from "react";

import { Button } from "@/components/ui/button";
import type { ConfirmationRequest } from "@/lib/confirmations";

/**
 * The application's confirmation window: a native `<dialog>` opened with
 * `showModal()`, in the look of the design package's `PaywallDialog`.
 *
 * Native, because the browser then does the hard parts itself: the rest of the
 * page is inert while it is open, Tab stays inside it and Escape closes it.
 * The focus goes back to the element that opened it when it closes.
 *
 * Rendered by `useConfirmDialog`, which owns the promise; this component only
 * shows one request and reports the answer once. Escape and the secondary
 * button both answer `false`. A click on the backdrop answers nothing - a
 * native dialog does not close on it, and a window in front of an irreversible
 * operation should not be dismissable by a stray click.
 *
 * Unlike `window.confirm` it does not freeze the page: requests already in
 * flight keep landing while it is open. Callers re-check their locks after the
 * answer (see `DayPlanEditor` and `WeekPlanBoard`).
 */

interface ConfirmDialogProps {
  readonly request: ConfirmationRequest;
  readonly onAnswer: (confirmed: boolean) => void;
}

export function ConfirmDialog({ request, onAnswer }: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const danger = request.tone === "danger";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    // Remembered here rather than left to the browser: by the time the cleanup
    // below runs React has already detached the dialog, and a detached dialog's
    // `close()` no longer hands the focus back.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    // `showModal` focuses the first focusable element. For an irreversible
    // operation that must be the safe button, wherever it sits in the DOM.
    (danger ? cancelRef : confirmRef).current?.focus();
    return () => {
      dialog.close();
      // Back to the button that opened the window. If the answer disabled it -
      // the operation is running - the call is a no-op, which is fine.
      if (opener?.isConnected) {
        opener.focus();
      }
    };
  }, [danger]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(event) => {
        // Escape. Answered through the hook, which unmounts this component; the
        // effect's cleanup then closes the dialog - one path for every exit.
        event.preventDefault();
        onAnswer(false);
      }}
      className="bg-mleko text-las rounded-panel m-auto max-h-[calc(100vh-32px)] w-[min(520px,calc(100vw-32px))] overflow-y-auto border-0 p-7 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.5)] backdrop:bg-[rgba(31,59,45,0.55)] sm:p-10"
    >
      <h2 id={titleId} className="font-display text-display-sm">
        {request.title}
      </h2>
      <div id={bodyId} className="text-las-szary mt-3 space-y-2 text-base">
        {request.body.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      {/* One under the other on a phone; side by side, main action last, from `sm` up. */}
      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
        <Button
          ref={cancelRef}
          type="button"
          variant="outlinePill"
          size="pill"
          onClick={() => {
            onAnswer(false);
          }}
          className="cursor-pointer whitespace-normal"
        >
          {request.cancelLabel}
        </Button>
        <Button
          ref={confirmRef}
          type="button"
          variant={danger ? "dangerPill" : "primary"}
          size="pill"
          onClick={() => {
            onAnswer(true);
          }}
          className="cursor-pointer whitespace-normal"
        >
          {request.confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
