import { CalendarDays } from "lucide-react";
import { FIELD_LABEL } from "./field-styles";

/**
 * Why a day or a week has no generate form: it is outside the planning horizon
 * (`@/lib/planning-horizon`). The sentence comes from the page, which computes
 * it on the server; the routes refuse regardless.
 *
 * The hasło field it replaces was also the only place a saved plan's hasło was
 * shown, so a saved one stays visible here, read-only - a plan from September
 * opened in December still says what it was about.
 *
 * Text, not `role="alert"` - it is the state of the page, not something that
 * just happened. A React component only because it renders inside the islands.
 */
export function HorizonNotice({
  message,
  promptLabel,
  savedPrompt,
}: {
  readonly message: string;
  readonly promptLabel: string;
  readonly savedPrompt: string;
}) {
  return (
    <div className="space-y-3">
      {savedPrompt.trim() !== "" && (
        <div>
          <p className={FIELD_LABEL}>{promptLabel}</p>
          <p className="text-las text-[15px] break-words whitespace-pre-line">{savedPrompt}</p>
        </div>
      )}
      <p className="bg-puste text-las rounded-input flex items-start gap-2 p-4 text-[15px] font-bold">
        <CalendarDays className="text-mech mt-0.5 size-4 shrink-0" />
        {message}
      </p>
    </div>
  );
}
