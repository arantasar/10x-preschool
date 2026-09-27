<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Podgląd dnia w siatce miesiąca

- **Plan**: context/changes/month-day-preview/plan.md
- **Scope**: Fazy 1–4 z 4
- **Date**: 2026-09-27
- **Verdict**: NEEDS ATTENTION — wyłącznie obserwacje; wszystkie cztery naprawione w triażu. Przed merge'em zostaje 15 sprawdzeń ręcznych z Progress.
- **Findings**: 0 critical, 0 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Weryfikacja kryteriów automatycznych (ponowiona w przeglądzie)

`npm test` 283/283 · `npm run lint` exit 0 · grep granicy importów (zod/react) czysty · `MonthGrid.astro` usunięty · `<MonthGrid … client:load` = 1 · `tileText(` = 0 · `npm run test:e2e` 15/15 · `npm run build` exit 0. Po poprawce F1 ponownie: e2e 15/15, lint 0, unit 283/283.

Pomiar kafelka z ~80-znakowym tematem (tymczasowy spec, zasiany plan usunięty): przed F1 — kafelek 64 px, `scrollHeight` 64 > `clientHeight` 62; po F1 — kafelek 64 px, `scrollHeight` 62 = `clientHeight` 62, przy 1440 i 1024 px.

## Findings

### F1 — Treść kafelka wchodzi 2 px w dolny padding

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/plan/MonthGrid.tsx:96-101
- **Detail**: `h-16` przy `border-box` obejmuje ramkę: na treść zostawało 64 − 2 − 12 = 50 px, a treść potrzebuje 52 px. Rząd nie rośnie (niezmiennik FR-011 trzyma), glify nie są ucięte, ale dolny padding spadał z 6 do 4 px, a komentarz mówił „fills exactly 4rem".
- **Fix**: `p-1.5` → `px-1.5 pt-1.5 pb-1` i komentarz liczący ramkę.
- **Decision**: FIXED — pomiar po poprawce: `scrollHeight` = `clientHeight`, kafelek 64 px.

### F2 — Mysz i klawiatura zamykają sobie nawzajem podgląd

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/day-preview.ts:133-158; src/components/plan/MonthGrid.tsx:94, :149-153
- **Detail**: Jeden dzień docelowy dla obu wejść. Zejście kursora z kafelka zamyka podgląd otwarty klawiaturą, a `onBlur` zamyka podgląd otwarty najechaniem. Zachowanie „wygrywa ostatnia intencja" nie było nigdzie zapisane.
- **Fix**: Zapisać je jako świadome w komentarzu interfejsu `DayPreview`; nie przebudowywać na dwa niezależne źródła.
- **Decision**: FIXED — komentarz w `src/lib/day-preview.ts`.

### F3 — Poprawka w auth.setup.ts poza planem

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: tests/e2e/auth.setup.ts:22-24 (commit 2895c1c)
- **Detail**: Zmiana spoza „Changes Required", zatwierdzona przez użytkownika i zacommitowana osobno; plan i Progress o niej milczały. To samo dotyczyło obejścia paska narzędzi `astro dev` (`setViewportSize` 1280×1400) w teście przeciągnięcia.
- **Fix**: Aneks „Odstępstwa w implementacji" w plan.md z oboma punktami i SHA.
- **Decision**: FIXED — sekcja dopisana przed `## Progress` (razem z odstępstwem `unbound-method` z Fazy 3).

### F4 — Kryterium 2.8 nie może paść na pustym miesiącu

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/month-day-preview/plan.md — Progress 2.7/2.8
- **Detail**: Reguła z lessons.md „Kryterium weryfikacji musi móc nie przejść". Pomiar 558 px przed i po zmianie był zrobiony na miesiącu bez planów, gdzie temat się nie renderuje, więc porównanie nie mogło wyjść na czerwono.
- **Fix**: Dopisać przy 2.8 wynik pomiaru z przeglądu jako dowód dla sprawdzającego; wiersz zostaje nieodhaczony.
- **Decision**: FIXED — adnotacja przy 2.8; wiersz nadal `[ ]`.
