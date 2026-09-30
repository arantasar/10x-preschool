import { cn } from "@/lib/utils";

/**
 * "Jeden dzień / Cały tydzień" - the segmented control of the design package,
 * as navigation between two screens rather than a form field.
 *
 * The day (`/plan?date=`) and the week (`/plan/week?from=`) stay separate pages
 * with separate islands; this only makes them read as one product. Both
 * addresses are computed by the Astro page and handed down, so there is no
 * state and no handler here.
 */

interface ScopeToggleProps {
  readonly active: "day" | "week";
  readonly dayHref: string;
  readonly weekHref: string;
}

const OPTION =
  "text-las flex min-h-11 items-center justify-center rounded-full px-3 text-[15px] font-bold no-underline";
const ACTIVE = "bg-mleko font-extrabold shadow-[0_1px_3px_rgba(31,59,45,0.2)]";

export function ScopeToggle({ active, dayHref, weekHref }: ScopeToggleProps) {
  return (
    <nav aria-label="Zakres" className="bg-owies-ciemny grid grid-cols-2 gap-1 rounded-full p-1">
      <a
        href={dayHref}
        aria-current={active === "day" ? "page" : undefined}
        className={cn(OPTION, active === "day" && ACTIVE)}
      >
        Jeden dzień
      </a>
      <a
        href={weekHref}
        aria-current={active === "week" ? "page" : undefined}
        className={cn(OPTION, active === "week" && ACTIVE)}
      >
        Cały tydzień
      </a>
    </nav>
  );
}
