import { useState } from "react";
import { X } from "lucide-react";

/**
 * The one-shot "account deleted" notice on `/`, floating at the bottom of the
 * viewport. It is `fixed` rather than in the flow because the landing's header
 * lives inside `Welcome`, so an in-flow notice could only sit above it and push
 * the header and the hero down. It stays until reload, so it can be closed -
 * on a phone it would otherwise cover part of the landing for good.
 *
 * A one-off, not a toast system: it is the only floating notice in the product.
 * Generalise when a second one appears.
 */
export function AccountDeletedNotice() {
  const [open, setOpen] = useState(true);

  if (!open) return null;

  return (
    <div className="rounded-input bg-szalwia-soft text-mech-ciemny shadow-panel fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-[560px] items-center gap-2 py-1 pr-1.5 pl-4">
      <p className="flex-1 py-2 text-[15px] font-semibold" role="status">
        Konto zostało usunięte razem ze wszystkimi planami.
      </p>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
        }}
        className="text-mech-ciemny hover:text-las focus-visible:outline-las flex size-11 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:shadow-[0_0_0_2px_var(--color-morela)] focus-visible:outline-3 focus-visible:outline-solid"
        aria-label="Zamknij komunikat"
      >
        <X className="size-5" />
      </button>
    </div>
  );
}
