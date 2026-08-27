<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Widoczny podtytuł dnia

- **Plan**: `context/changes/visible-day-theme/plan.md`
- **Scope**: Phase 1–2 of 2 (pełny plan)
- **Date**: 2026-08-27
- **Verdict**: NEEDS ATTENTION → wszystkie 4 uwagi rozstrzygnięte w triage 2026-08-27
- **Findings**: 0 critical, 2 warnings, 2 observations
- **Commits**: `b655827` (p1), `6e004a4` (p2), `18190f7` (epilogue) na `feat/visible-day-theme`

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Evidence

**Plan Adherence** — wszystkie cztery zmiany z „Changes Required" istnieją i zgadzają się z Intent/Contract:

| Plik | Kontrakt z planu | Stan faktyczny |
|---|---|---|
| `src/types.ts:101-112` | `readonly theme: string | null` + zdanie o nullowalności | MATCH |
| `src/lib/services/day-plan-store.ts:457,470` | `select(… , theme)` + `theme: row.theme`, jedno zapytanie | MATCH |
| `src/components/plan/MonthGrid.astro:39-56,88,101-111` | dwie linie, hasło przygaszone `/50`, temat `text-purple-200/90`, `min-h-16`, `title`, `aria-label` | MATCH |
| `src/pages/plan.astro:55` | warunkowy render po dacie, przed akapitem instruktażowym, `text-purple-200/90`, sam temat | MATCH |

Zero pozycji MISSING, zero EXTRA poza komentarzami wyjaśniającymi.

**Scope Discipline** — każda pozycja „What We're NOT Doing" potwierdzona diffem `master..HEAD`: brak `WeekDayCard.tsx`, `WeekPlanBoard.tsx`, `DayPlanEditor.tsx`; brak migracji; brak wspólnego komponentu; brak `activities` w odczycie miesiąca.

**Architecture** — `tileText`/`tileLabel` w frontmatterze obok istniejącego `dayNumber`, ta sama konwencja. `readMonthSummary` pozostaje jedyną ścieżką odczytu miesiąca. Wyspa React nietknięta, zgodnie z regułą CLAUDE.md „Astro do wyświetlania".

**Pattern Consistency** — ton `text-purple-200/90` jest cytatem z `WeekDayCard.tsx:60`; warunek `theme &&` powtarza tamten wzorzec; `string | null` odpowiada `database.types.ts:86` i `DayState.theme` w `WeekDayCard.tsx:26`.

**Success Criteria (automat, przebieg kontrolny 2026-08-27)** — `npm run lint` czysty, `npx astro check` 0 błędów / 0 ostrzeżeń, `npm run build` zakończony. Komentarz JS przetrwał w bundlu serwerowym (`dist/server/chunks/month_*.mjs`) jako komentarz — do HTML nie trafia, sprawdzone osobno.

## Findings

### F1 — `aria-label` kafelka nie ma górnej granicy

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — realny kompromis; warto się zatrzymać i przemyśleć
- **Dimension**: Safety & Quality (dostępność)
- **Location**: `src/components/plan/MonthGrid.astro:50-55`
- **Detail**: `tileLabel` wkleja pełne hasło do nazwy dostępnej. `PROMPT_MAX = 2000` i `THEME_MAX = 200` (`src/lib/day-plan-limits.ts:28,40`), więc nazwa dostępna jednego kafelka może sięgnąć ~2200 znaków — i nic tego nie ogranicza poza tym, że nauczyciele zwykle wpisują krótkie hasła. Przy 42 kafelkach w siatce oznacza to, że Tab na kafelku uruchamia czytanie długiego akapitu, którego nie da się przerwać inaczej niż wyjściem z elementu. Decyzja z planu („Both aria-label and title carry it") szacowała nazwę dostępną na ~80 znaków, zakładając krótkie hasło; ten szacunek nie jest niczym egzekwowany. Przed zmianą `aria-label` był krótki i stały, więc jest to regresja względem stanu sprzed slice'u — choć tylko w scenariuszu długiego hasła.
- **Fix A ⭐ Recommended**: Ograniczyć hasło i temat w `tileLabel` do rozsądnej długości (np. 80 znaków na człon, z wielokropkiem), zostawiając `title` pełny.
  - Strength: Zdejmuje nieograniczoność z jedynej powierzchni, która czyta tekst liniowo, i nie rusza tooltipa, który użytkownik widzi w całości i sam kontroluje. Zmiana lokalna, jedna funkcja.
  - Tradeoff: Użytkownik czytnika ekranu przestaje mieć dostęp do pełnego hasła z poziomu siatki — musi wejść w dzień. To częściowe cofnięcie decyzji, którą świadomie podjąłeś na etapie planowania.
  - Confidence: HIGH — `tileLabel` ma jedno wywołanie i jest czystą funkcją, więc zmiana nie ma promienia rażenia.
  - Blind spot: Nie zmierzyłem, jak długie hasła faktycznie wpisujesz — jeśli zawsze są jednowyrazowe, problem jest teoretyczny i A jest niepotrzebnym kosztem.
- **Fix B**: Zostawić bez zmian i odnotować w planie jako świadomie przyjęte ryzyko.
  - Strength: Utrzymuje pełną dostępność treści z siatki, czyli dokładnie to, co decyzja planu miała osiągnąć; zero kodu.
  - Tradeoff: Nazwa dostępna zostaje nieograniczona; jeśli kiedyś ktoś wklei do hasła dłuższy opis, siatka staje się nieużywalna dla czytnika ekranu bez żadnego sygnału ostrzegawczego.
  - Confidence: MEDIUM — zależy wyłącznie od tego, jak długie bywają hasła w praktyce, czego nie wiem.
  - Blind spot: Brak danych o realnym rozkładzie długości hasła; `PROMPT_MAX = 2000` sugeruje, że pole projektowano na coś dłuższego niż „Dinozaury".
- **Decision**: FIXED via Fix A — `LABEL_PART_MAX = 80` + `clipForLabel()` w `MonthGrid.astro`; `title` pozostaje pełny.

### F2 — Kryteria 1.5 i 2.4 przechodzą pusto

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja; poprawka oczywista i wąska
- **Dimension**: Success Criteria
- **Location**: `context/changes/visible-day-theme/plan.md` (Progress 1.5 i 2.4)
- **Detail**: Oba kryteria brzmią „`git diff --name-only` bez `WeekDayCard.tsx` / `DayPlanEditor.tsx`". `git diff --name-only` bez zakresu porównuje drzewo robocze z HEAD, więc uruchomiony po commicie fazy — czyli dokładnie wtedy, kiedy uruchamia go rytuał — zwraca pusto i grep nie znajduje nic **niezależnie od tego, czy plik został dotknięty**. Bramka przechodzi zawsze. Sprawdziłem to: przy `git diff --name-only master..HEAD` wynik jest tu taki sam (tablica tygodnia faktycznie nietknięta), więc wniosek był prawdziwy — ale przez przypadek, nie przez działanie kryterium. To ta sama klasa błędu, którą przegląd `month-home` złapał jako F4 (`prettier --check` przechodzący bezwarunkowo, bo `.prettierignore` wyklucza `context/`).
- **Fix**: Zmienić oba kryteria na zakres jawny — `git diff --name-only master..HEAD` (albo `git diff --name-only $(git merge-base master HEAD)..HEAD`).
- **Decision**: ACCEPTED-AS-RULE: „Kryterium weryfikacji musi móc nie przejść" (`lessons.md`) + FIXED — oba kryteria w `plan.md` używają teraz `git diff --name-only master..HEAD`.

### F3 — Pozycje ręczne odhaczone hurtem, dwie bez śladu weryfikacji

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja; poprawka oczywista i wąska
- **Dimension**: Success Criteria
- **Location**: `context/changes/visible-day-theme/plan.md` (Progress 1.7–1.14, 2.6–2.10)
- **Detail**: Wszystkie 13 pozycji weryfikacji ręcznej zostało odhaczonych jednym ruchem po „podoba mi się". Jedenaście z nich to kontrola wizualna, którą spojrzenie na ekran faktycznie pokrywa. Dwie wymagają stanów, których zwykłe obejrzenie siatki nie uruchamia: **1.12** (czytnik ekranu czyta hasło i temat przed statusem) oraz **2.9** (panel „Nie udało się wczytać tego dnia" bez śladu po podtytule — wymaga wymuszenia błędu odczytu). Zapis w planie mówi teraz, że oba są zweryfikowane. Uwaga jest o wiarygodności rekordu, nie o kodzie: ścieżka `readFailed` jest w kodzie poprawna (`initialPlan` jest wtedy `null`, więc warunek nic nie renderuje), a `aria-label` ma poprawną kolejność — po prostu nikt tego nie zobaczył na żywo.
- **Fix**: Cofnąć 1.12 i 2.9 do `- [ ]` i domknąć je przy najbliższej okazji, albo zostawić `[x]` z dopiskiem, że przyjęte na podstawie inspekcji kodu, a nie obserwacji.
- **Decision**: FIXED — 1.12 i 2.9 zostają `[x]` z dopiskiem, że przyjęte na podstawie inspekcji kodu, nie obserwacji.

### F4 — `min-w-0` na kontenerze tekstu kafelka jest bezczynne

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja; poprawka oczywista i wąska
- **Dimension**: Pattern Consistency
- **Location**: `src/components/plan/MonthGrid.astro:104`
- **Detail**: `<div class="min-w-0">` dodano odruchowo jako zabezpieczenie truncate. Nic nie robi: div jest zwykłym blokiem rozciąganym przez `align-items: stretch` kolumnowego flexa, a nie elementem flex w osi głównej ani elementem grida, więc jego `min-width` i tak wynosi 0. Za brak rozpychania kolumny odpowiada `grid-cols-7`, które w Tailwindzie rozwija się do `repeat(7, minmax(0, 1fr))` — i to ono chroniło truncate także przed tą zmianą. Klasa jest nieszkodliwa, ale sugeruje ograniczenie, którego w tym miejscu nie ma, więc ktoś czytający może uznać ją za nośną.
- **Fix**: Usunąć `min-w-0` z tego diva.
- **Decision**: FIXED — `min-w-0` usunięte; truncate opiera się na `minmax(0,1fr)` z `grid-cols-7`.
