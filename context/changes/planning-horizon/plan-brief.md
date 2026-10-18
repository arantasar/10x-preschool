# Horyzont planowania (S-31) — Plan Brief

> Full plan: `context/changes/planning-horizon/plan.md`

## What & Why

Nauczycielka generuje plany tylko w oknie od początku poprzedniego do końca następnego miesiąca
(z obu stron dopełnionym do pełnego tygodnia). Dziś nic nie ogranicza daty generowania, a limit
fair use (150 dni-generacji w miesiącu) pozwala w okresie próbnym do 31.01.2027 zrobić zapas na
kilka lat szkolnych — w przód albo wstecz. Decyzja z roadmapy: zapas blokuje horyzont, nie krótsza
próba.

## Starting Point

Cztery trasy wołają model, każda z claimem fair use przed modelem; trzy niosą daty (`generate`,
`week/day`, `week/outline`), a `week/save` zapisuje dni pod dowolne daty z żądania. Żadna nie patrzy
na datę względem dziś.

## Desired End State

Dzień za daleko dostaje „Ten dzień będzie można zaplanować od 1 grudnia 2026.”, dzień za dawno —
zdanie, że wcześniejsze dni można przeglądać i poprawiać, ale nie generować. Serwer odmawia (422)
przed bazą i ledgerem; strony dnia i tygodnia pokazują notkę zamiast formularza. Zapisane plany
działają jak dziś. Dziś okno to 31.08 – 6.12.2026.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Kształt horyzontu | Do końca następnego miesiąca, dopełnione do niedzieli | Zawsze obejmuje cały następny miesiąc (8 tygodni nie obejmuje go 1–3 dnia miesiąca), a tydzień nigdy nie jest przecięty. |
| Przeszłość | Od poniedziałku tygodnia z 1. dniem poprzedniego miesiąca | Zamyka zapas „wstecz”, zostawia uzupełnianie niedawnych dni. |
| Konfiguracja | Stała w kodzie | Reguła kalendarzowa to decyzja produktowa; merge = deploy; bez parsowania i fail-open. |
| Regeneracja istniejącego planu poza oknem | Odmawiana | Jedna reguła; refine i ręczna edycja zostają. |
| Testerzy z `fair_use_overrides` | Bez wyjątku | Reguła czysto datowa, bez odczytu bazy; override dotyczy ilości, nie dat. |
| `week/save` | Też sprawdza okno | Zamyka podmianę dat (generuj blisko, zapisz daleko). |
| `refine` | Zwolniony | Nie niesie daty; to edycja otwartego planu. |
| UI | Notka zamiast formularza, liczona na serwerze | Nikt nie wpisuje hasła, żeby usłyszeć „nie”; egzekwuje serwer. |

## Scope

**In scope:** moduł `src/lib/planning-horizon.ts`; odmowa 422 w `generate`, `week/day`,
`week/outline`, `week/save`; notka w `DayPlanEditor` i `WeekPlanBoard`; wpis FAQ; zasada w CLAUDE.md;
status S-31 w roadmapie.

**Out of scope:** wyjątki dla overrides; oznaczenia na siatce miesiąca; konfiguracja w env;
migracje; zmiany w accept/edycji/usuwaniu/druku.

## Architecture / Approach

`checkGenerationDates(dates, today)` → `null` albo `{ too_far, opensOn } | { too_old, firstAllowed }`.
Trasy wołają ją zaraz po zod, przed `supabase` i `claimGeneration`, i odpowiadają
`outsideHorizon(…)` (422, `retryable: false`, `horizon.opens_on`). Wyspy pokazują to przez istniejące
`isErrorBody`. Strony liczą to samo dla pokazywanego dnia/tygodnia i podają gotowe zdanie jako prop
`horizonNotice`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Reguła horyzontu | Czysty moduł + testy granic | Błąd o jeden dzień na granicy miesiąca/roku |
| 2. Egzekwowanie po stronie serwera | 422 w czterech trasach, przed claimem; CLAUDE.md | Istniejące testy z datami na sztywno — muszą dostać przypięty zegar |
| 3. UI i treść | Notka na stronach, FAQ, roadmapa | Notka nie może zasłonić pracy z zapisanym planem |

**Prerequisites:** S-21 (fair use) — jest. Brak migracji.
**Estimated effort:** ~1–2 sesje w trzech fazach.

## Open Risks & Assumptions

- Zapas da się dalej zrobić, kopiując treść z dni w oknie (150 regeneracji/mies.) — horyzont zamyka
  tanią drogę, nie każdą; resztę trzyma limit fair use.
- Tydzień wygenerowany tuż przed północą ostatniego dnia miesiąca i zapisany po niej może wypaść za
  dolną granicę — rzadkie, komunikat to wyjaśnia.

## Success Criteria (Summary)

- Nie da się wygenerować dnia spoza okna żadną trasą, także bezpośrednim żądaniem, i odmowa nie
  zużywa limitu.
- Nauczycielka planująca następny miesiąc nigdy nie trafia na odmowę.
- Zapisane plany poza oknem działają jak dziś, z wyjątkiem generowania.
