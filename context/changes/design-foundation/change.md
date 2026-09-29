---
change_id: design-foundation
title: Design foundation
status: impl_reviewed
created: 2026-09-29
updated: 2026-09-29
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- 2026-09-29, po zamknięciu planu: pakiet dostał makietę 14 „Konto założone” (`/konto-zalozone`).
  Wdrożona na istniejącej trasie `/auth/confirm-email` (trasy z README pakietu nie są przyjmowane):
  liść z ✓, `role="status"`, pigułka „Zaloguj się”. Stan produkcyjny „Sprawdź skrzynkę” nie ma
  makiety — ta sama karta z kopertą i dotychczasową treścią.
- Poza listą plików planu, oba konieczne: `src/lib/utils.ts` — `cn()` rozszerzony o klucze `@theme`
  „Ogród” (bez tego tailwind-merge wyrzucał `text-display-xl` przy `text-las`); `AppHeader.astro` —
  tylko komentarz (nazywał usunięty `Topbar`). Wariant „secondary z obrysem” z planu nazywa się
  `outlinePill`, bo klucz `secondary` już istnieje, a plan zakazuje zmiany istniejących kluczy.
- Po przeglądzie implementacji (2026-09-29): focus to pierścień Las 3 px z Morelą w odstępie 2 px,
  a nie sama Morela z pakietu (1,9:1 na Owsie — poniżej 3:1 z WCAG 1.4.11); obramowanie pól
  `#6f8a69` zamiast `#b9c7b1` (1,74:1). Świadome odstępstwa od makiet — `design-planner` przejmuje
  tę samą parę do planera.
