/**
 * The FAQ on `/pomoc` (S-19, FR-025), as data: a later slice adds an entry
 * here instead of editing markup.
 *
 * Every answer has to be true of the product *today*. In particular:
 * - nothing about prices or payments until they exist (the „Płatności” section
 *   of mock-up 09 arrives with S-22/S-23);
 * - no promise that nothing enters the plan unapproved - a generated day is
 *   saved „do przejrzenia” at once (`pl-landing-copy`);
 * - the plan state is „zatwierdzony” / „do przejrzenia”, never „zaakceptowany”.
 */

import { DELETE_ACCOUNT_ANCHOR, SETTINGS_PATH } from "@/lib/account-settings";
import { PRIVACY_PATH } from "@/lib/legal";

export interface FaqLink {
  href: string;
  label: string;
}

export interface FaqItem {
  question: string;
  /** One string per paragraph. */
  answer: string[];
  /** Rendered after the paragraphs. */
  link?: FaqLink;
}

export interface FaqSection {
  /** The anchor in the page's category nav. */
  id: string;
  title: string;
  items: FaqItem[];
}

export const FAQ_SECTIONS: readonly FaqSection[] = [
  {
    id: "dzialanie",
    title: "Jak to działa",
    items: [
      {
        question: "Skąd biorą się propozycje zajęć?",
        answer: [
          "Wpisujesz krótkie hasło, np. „Dinozaury”, a model językowy (AI) przygotowuje na jego podstawie propozycje aktywności dla dzieci w wieku 3–6 lat. Przy całym tygodniu każdy dzień dostaje własny temat dnia wokół tego samego hasła.",
        ],
      },
      {
        question: "Czy muszę sprawdzać propozycje przed zajęciami?",
        answer: [
          "Tak. Propozycje pisze sztuczna inteligencja i mogą się w nich zdarzyć pomyłki albo pomysły, które nie pasują do Twojej grupy. Wygenerowany dzień trafia do planu jako „do przejrzenia” — zatwierdzasz go dopiero wtedy, gdy go przeczytasz i uznasz za dobry.",
        ],
      },
      {
        question: "Czy mogę zmienić propozycję?",
        answer: [
          "Tak. Każdą aktywność możesz poprawić ręcznie albo poprosić o nową propozycję, a cały dzień lub tydzień — wygenerować od nowa. Gdy plan Ci odpowiada, kliknij „Zatwierdź”.",
        ],
      },
      {
        question: "Czy mogę wydrukować plan?",
        answer: ["Tak. Plan tygodnia i plan miesiąca pobierzesz jako PDF gotowy do druku."],
      },
    ],
  },
  {
    id: "konto",
    title: "Konto i dane",
    items: [
      {
        question: "Nie pamiętam hasła — co zrobić?",
        answer: [
          "Na stronie logowania kliknij „Nie pamiętasz hasła?” i podaj adres e-mail konta. Wyślemy na niego link do ustawienia nowego hasła; Twoje plany zostają na miejscu.",
        ],
        link: { href: "/auth/forgot-password", label: "Ustaw nowe hasło" },
      },
      {
        question: "Kto widzi moje plany?",
        answer: [
          "Tylko Ty. Plany są przypisane do Twojego konta i nie widzi ich nikt inny, także inni nauczyciele korzystający z Temio.",
        ],
      },
      // Regulamin § 12 ust. 1 and Polityka prywatności pkt 8 say the same; the
      // three change together.
      {
        question: "Jak usunąć konto?",
        answer: [
          "W Ustawieniach, w karcie „Usuń konto” — wystarczy podać hasło. Konto znika od razu, razem ze wszystkimi planami, i nie da się go przywrócić.",
        ],
        link: { href: `${SETTINGS_PATH}#${DELETE_ACCOUNT_ANCHOR}`, label: "Przejdź do usuwania konta" },
      },
      {
        question: "Co dzieje się z moimi danymi?",
        answer: [
          "Przechowujemy to, czego Temio potrzebuje do działania: adres e-mail, hasło (jako zaszyfrowany skrót) i Twoje plany. Temat i treść aktywności trafiają do dostawcy modelu językowego bez Twojego adresu e-mail i nie są używane do trenowania modeli. Wszystko opisuje Polityka prywatności.",
        ],
        link: { href: PRIVACY_PATH, label: "Polityka prywatności" },
      },
    ],
  },
];
