import { useCallback, useRef, useState, type ReactNode } from "react";

import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { ConfirmationRequest } from "@/lib/confirmations";

/**
 * The one confirmation window of an island: `confirm(request)` opens it and
 * resolves with the teacher's answer; `dialog` is what the island renders.
 *
 * The replacement for `window.confirm`, and deliberately shaped like it - a
 * question in, a boolean out - so the decision flow at each call site reads the
 * same. The one difference the callers must respect is that it is asynchronous:
 * the page is not frozen while the window is open, so a lock checked before the
 * question has to be checked again after the answer.
 *
 * One window at a time. A second `confirm()` while one is open resolves `false`
 * at once: two clicks on "Usuń" must not queue two questions, and the second
 * answering "no" is the safe reading of a request nobody saw.
 */
export function useConfirmDialog(): {
  confirm: (request: ConfirmationRequest) => Promise<boolean>;
  dialog: ReactNode;
} {
  // `id` remounts the window for every question, so two questions asked back to
  // back (the week's scope, then its count) each open and focus afresh.
  const [open, setOpen] = useState<{ request: ConfirmationRequest; id: number } | null>(null);
  const resolver = useRef<((confirmed: boolean) => void) | null>(null);
  const sequence = useRef(0);

  const confirm = useCallback((request: ConfirmationRequest): Promise<boolean> => {
    if (resolver.current !== null) {
      return Promise.resolve(false);
    }
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      sequence.current += 1;
      setOpen({ request, id: sequence.current });
    });
  }, []);

  const answer = useCallback((confirmed: boolean): void => {
    const resolve = resolver.current;
    resolver.current = null;
    setOpen(null);
    resolve?.(confirmed);
  }, []);

  const dialog = open === null ? null : <ConfirmDialog key={open.id} request={open.request} onAnswer={answer} />;

  return { confirm, dialog };
}
