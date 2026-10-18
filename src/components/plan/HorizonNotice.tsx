import { CalendarDays } from "lucide-react";

/**
 * Why a day or a week has no generate form: it is outside the planning horizon
 * (`@/lib/planning-horizon`). The sentence comes from the page, which computes
 * it on the server; the routes refuse regardless.
 *
 * Text, not `role="alert"` - it is the state of the page, not something that
 * just happened. A React component only because it renders inside the islands.
 */
export function HorizonNotice({ message }: { readonly message: string }) {
  return (
    <p className="bg-puste text-las rounded-input flex items-start gap-2 p-4 text-[15px] font-bold">
      <CalendarDays className="text-mech mt-0.5 size-4 shrink-0" />
      {message}
    </p>
  );
}
