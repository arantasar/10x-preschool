import { useRef } from "react";
import { ChevronDown, CircleHelp, LogOut, Mail, Settings } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SETTINGS_PATH } from "@/lib/account-settings";
import { cn } from "@/lib/utils";

interface Props {
  email: string;
  // The settings screen is open: the trigger is marked like the current item
  // of the main nav, and „Ustawienia konta” carries `aria-current`.
  current?: boolean;
}

const itemClass =
  "text-las focus:bg-owies focus:text-las min-h-11 cursor-pointer gap-3 rounded-xl px-3.5 py-0 text-base font-bold no-underline focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-las focus-visible:outline-solid";

const iconClass = "size-[18px] text-current";

/**
 * The account menu in the app header (design mock-up 19): an avatar with the
 * initial and a chevron, opening „Zalogowano jako <email>”, the account's
 * links and „Wyloguj się”. Radix carries the menu semantics and keyboard.
 */
export default function AccountMenu({ email, current = false }: Props) {
  const signOutForm = useRef<HTMLFormElement>(null);
  const initial = email.trim().charAt(0).toLocaleUpperCase("pl");

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Menu konta: ${email}`}
          className={cn(
            "group text-las hover:bg-owies data-[state=open]:bg-owies-ciemny flex min-h-12 cursor-pointer items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1",
            current && "bg-szalwia-soft hover:bg-szalwia-soft",
          )}
        >
          <span
            aria-hidden="true"
            className="bg-morela-soft flex size-10 shrink-0 items-center justify-center rounded-full text-[17px] font-extrabold"
          >
            {initial}
          </span>
          <ChevronDown
            aria-hidden="true"
            strokeWidth={2.6}
            className="size-4 transition-transform duration-150 group-data-[state=open]:rotate-180"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={10}
          className="bg-mleko text-las flex w-[300px] max-w-[calc(100vw-32px)] flex-col gap-0.5 rounded-[20px] border-0 p-2.5 shadow-[0_24px_48px_-20px_rgba(31,59,45,0.35),0_0_0_1.5px_var(--color-linia)]"
        >
          <div className="flex items-center gap-3 px-3 pt-2.5 pb-3.5">
            <span
              aria-hidden="true"
              className="bg-morela-soft flex size-10 shrink-0 items-center justify-center rounded-full text-[17px] font-extrabold"
            >
              {initial}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-mech text-[13px] font-bold">Zalogowano jako</span>
              <span title={email} className="truncate text-[15px] font-extrabold">
                {email}
              </span>
            </span>
          </div>
          <DropdownMenuSeparator className="bg-linia mx-1.5 mt-0 mb-1.5 h-[1.5px]" />
          <DropdownMenuItem asChild className={itemClass}>
            <a href={SETTINGS_PATH} aria-current={current ? "page" : undefined}>
              <Settings aria-hidden="true" className={iconClass} />
              Ustawienia konta
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className={itemClass}>
            <a href="/pomoc">
              <CircleHelp aria-hidden="true" className={iconClass} />
              Pomoc
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className={itemClass}>
            <a href="/kontakt">
              <Mail aria-hidden="true" className={iconClass} />
              Kontakt
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="bg-linia m-1.5 h-[1.5px]" />
          {/* The content is portalled and unmounts on select, so the form it
              submits lives outside it. Still a POST: the route rests on
              `security.checkOrigin`. */}
          <DropdownMenuItem className={itemClass} onSelect={() => signOutForm.current?.requestSubmit()}>
            <LogOut aria-hidden="true" className={iconClass} />
            Wyloguj się
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <form ref={signOutForm} method="POST" action="/api/auth/signout" hidden />
    </>
  );
}
