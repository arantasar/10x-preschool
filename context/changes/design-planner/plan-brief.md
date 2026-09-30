# Design planner („Ogród” na ekranach planowania) — Plan Brief

> Full plan: `context/changes/design-planner/plan.md`
> Research: `context/archive/2026-09-29-design-foundation/research.md` (wspólny dla obu zmian Kroku 10)

## What & Why

Druga zmiana Kroku 10: ekrany `/plan/month`, `/plan/week` i `/plan` dostają wygląd „Ogród” z pakietu
Claude Design. Po `design-foundation` aplikacja jest w połowie jasna (landing, auth) i w połowie
ciemna (planer, przypięty klasą `.theme-legacy`) — ta zmiana kończy ten stan i spłaca dług. Przy
okazji siatka miesiąca dostaje nową strukturę, stan planu nowe nazwy, a potwierdzenia własne okno.

## Starting Point

Planer ma 147 literalnych ciemnych klas w trzech wyspach React (dwie po ponad 1000 linii) i trzech
stronach. Siatka ma 7 kolumn i przycisk „Zaplanuj tydzień”; dzień i tydzień to wąskie jednokolumnowe
ekrany; sześć potwierdzeń to `window.confirm`; stan planu nazywa się „zaakceptowany / roboczy”.
Tokeny, fonty i warianty przycisków „Ogród” już są w kodzie.

## Desired End State

Nauczyciel po zalogowaniu widzi tę samą aplikację co na landingu. Miesiąc to siatka pn–pt z tematem
tygodnia przy każdym wierszu, licznikami w legendzie i wyraźnym CTA dla pustego tygodnia; na telefonie
to lista tygodni. Dzień i tydzień mają panel formularza obok listy kart i przełącznik między sobą.
Wszędzie — także na wydrukach — plan jest „zatwierdzony” albo „do przejrzenia”, a każde pytanie
o nieodwracalną operację zadaje okno z przyciskami nazwanymi po skutku.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Siatka pn–pt, temat tygodnia, liczniki, pusty tydzień z CTA | N4–N7 wchodzą | Tanie, liczone z danych, które strona już ma | Research |
| Ekrany dnia i tygodnia | Nie scalamy; przełącznik zakresu jako linki | Adresy chroni PRD, dwie wyspy mają różne kontrakty | Research |
| Kategorie, „Zapisz w planie”, „Przywróć” | Poza zakresem | Zmiana modelu danych i cyklu życia (`M-04`, Non-Goals) | Research |
| Tekst komórki siatki | Temat dnia, a bez niego hasło | Dane są na stronie; hasło idzie do nagłówka wiersza | Plan |
| Wysokość siatki | Stała wysokość komórek, siatka ≤ 558 px | Warunek PRD „miesiąc bez przewijania” zostaje spełniony i mierzalny | Plan |
| Plany weekendowe | Dopisek pod siatką z linkami | Nic nie znika bez śladu, a nie zajmuje miejsca, gdy weekendów nie ma | Plan |
| Tydzień o różnych hasłach | Hasła po przecinku, przycięte | Pełna informacja w nagłówku wiersza (wybór Janusza) | Plan |
| Układ dnia i tygodnia | Dwie kolumny jak makieta 03 | Oba ekrany wyglądają jak jeden produkt | Plan |
| Potwierdzenia | Własny `<dialog>` w tej zmianie | Spójny wygląd od razu, komponent gotowy pod paywall (wybór Janusza) | Plan |
| Słownictwo | „zatwierdzony / do przejrzenia” wszędzie, także PDF | Zgodność z makietami i cieplejszy język (wybór Janusza) | Plan |
| Mobile siatki | Lista tygodni poniżej 900 px | Kolumna tematu + 5 komórek nie mieści się na telefonie | Plan |
| H1 miesiąca | Nazwa miesiąca z ukrytym prefiksem „Plan miesiąca —” | Makieta i istniejący test e2e naraz | Plan |
| Kolejność | Wygląd (fazy 1–4), potem słowa (5), potem okno (6) | Czerwony test da się przypisać do jednej przyczyny | Plan |

## Scope

**In scope:**
- `AppHeader` z nawigacją, wspólny `PlannerLayout`
- Siatka miesiąca: struktura, wygląd, mobile, podgląd dnia, test wysokości (ryzyko #14)
- Tydzień i dzień: układ dwukolumnowy, karty, panel, `ScopeToggle`, postęp generowania
- Słownictwo w UI, nazwach dostępnych, komunikatach API, PDF i testach
- `ConfirmDialog` + `useConfirmDialog`, sześć miejsc wywołania, przepisane e2e i `E2E-RULES.md`
- Usunięcie `.theme-legacy` i `bg-cosmic`; tematy tygodni w ilustracji landingu; dokumenty

**Out of scope:**
- Kategorie i czas trwania aktywności, tytuł aktywności w komórce siatki
- Strona `/konto`, podgląd dnia na dotyk, dark mode
- Wygląd PDF (zmieniają się w nim tylko słowa)
- Identyfikatory, schemat bazy, trasy API, prompty, logika decyzji w potwierdzeniach

## Architecture / Approach

Pakiet to specyfikacja, nie kod: wygląd odtwarzany w Tailwindzie z `cn()`; Astro dla statyki
(`PlannerLayout`, `AppHeader`), React w istniejących wyspach. Wszystko, co da się policzyć bez DOM,
idzie do `src/lib/` z testami jednostkowymi: model wierszy siatki i liczniki (`month-grid.ts`), treści
potwierdzeń jako dane `{ title, body, confirmLabel, cancelLabel, tone }` (`confirmations.ts`,
`week-day-controls.ts`, `week-generation.ts`). Każda z faz 2–4 zdejmuje `theme-legacy` ze swojej
strony; blok CSS znika na końcu.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Powłoka i nagłówek | Nowy pasek aplikacji, wspólny szkielet, warianty przycisków | Widoczny „Wyloguj się” wiąże setup całego e2e |
| 2. Siatka miesiąca | Pn–pt, tematy tygodni, liczniki, CTA, mobile | Wysokość siatki vs PRD; pozycja podglądu dnia w 5 kolumnach |
| 3. Tydzień | Dwie kolumny, karty dni, panel | Wyspa 1115 linii — łatwo zgubić stan lub rolę przy przebudowie JSX |
| 4. Dzień | Ten sam szkielet, edycja i „Zapytaj model” | Ekran bez makiety; tytuły muszą zostać nagłówkami |
| 5. Słownictwo | Nowe nazwy stanu w UI, PDF i testach | Dłuższy tekst na wydruku; „dzień roboczy” nie może ucierpieć |
| 6. Okno potwierdzeń | `<dialog>` zamiast `window.confirm` | Asynchroniczność: stan może się zmienić, gdy okno jest otwarte |
| 7. Sprzątanie | Koniec `.theme-legacy`, landing, dokumenty | Usunięcie izolacji odsłania coś pominiętego |

**Prerequisites:** gałąź `feat/design-planner` (jest); lokalny Supabase i `.env.e2e` dla e2e; klucz
modelu do ręcznej weryfikacji generowania.
**Estimated effort:** ~7–9 sesji w 7 fazach; fazy 3, 4 i 6 są najcięższe.

## Open Risks & Assumptions

- **Zakres jest większy niż „zmiana wyglądu”.** Fazy 5 i 6 zmieniają nazwy dostępne i mechanizm
  ochrony przed kasowaniem w tym samym PR co restyle. Łagodzi to kolejność faz i osobne commity, ale
  PR będzie duży, a merge to wydanie.
- Własne okno nie zamraża strony jak `window.confirm` — plan wymaga ponownego sprawdzenia blokad po
  odpowiedzi w każdym z sześciu miejsc.
- Ekrany dnia i tygodnia nie mają makiety 1:1; ich układ zatwierdza Janusz przy weryfikacji ręcznej.
- Założenie: 558 px dotyczy bloku siatki, nie całej strony (tak mierzono w `month-day-preview`).
- Pierwszy przebieg e2e po zmianach bywa czerwony z powodu zimnej pamięci Vite (follow-up F9).

## Success Criteria (Summary)

- Trzy ekrany planera wyglądają jak „Ogród” przy 390 / 768 / 1440 px, a cały miesiąc mieści się w siatce bez przewijania.
- Nauczyciel wszędzie czyta „zatwierdzony / do przejrzenia”, a okna potwierdzeń nazywają skutek na przyciskach.
- Lint, build, testy jednostkowe i cały e2e zielone; w `src/` nie ma `.theme-legacy`, `bg-cosmic` ani `window.confirm`.
