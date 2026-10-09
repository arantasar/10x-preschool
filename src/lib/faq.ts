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
      // S-18 (account-deletion) rewrites this entry when deletion is self-service.
      {
        question: "Jak usunąć konto?",
        answer: [
          "Napisz do nas przez formularz kontaktowy z adresu e-mail, na który założone jest konto — usuniemy konto razem ze wszystkimi planami.",
        ],
        link: { href: "/kontakt", label: "Formularz kontaktowy" },
      },
    ],
  },
];
