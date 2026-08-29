<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Usunięcie planu dnia

- **Plan**: context/changes/delete-day-plan/plan.md
- **Scope**: Fazy 1–4 (całość planu)
- **Date**: 2026-08-29
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations
- **Triage**: zamknięty 2026-08-29 — F1 naprawione, F2 zaakceptowane, F3 zapisane jako reguła

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Bramki uruchomione podczas przeglądu

| Komenda | Wynik |
|---------|-------|
| `npm run lint` | PASS (0 błędów) |
| `npx astro check` | PASS (50 plików, 0 errors, 0 warnings, 4 hints) |
| `npm run build` | PASS |
| `npm run test:db` | PASS (3 pliki, 71 asercji, `day_plan_delete` ok) |
| Kryteria `grep`/`git diff` 1.6, 1.7, 2.4, 2.5, 3.4, 3.5, 3.6, 3.7, 4.1–4.5 | PASS |

Zakres diffa pokrywa się z planem co do pliku: `day-plan-store.ts`, `day-plan-http.ts`,
`api/day-plan/index.ts`, `DayPlanEditor.tsx`, nowy `day_plan_delete.test.sql`, `roadmap.md`
plus folder zmiany. Zero migracji, zero zmian w `plan.astro`, `MonthGrid.astro`,
`WeekPlanBoard.tsx`, `WeekDayCard.tsx`. Ścieżki odczytu nietknięte.

## Findings

### F1 — Stan `busy` wraca do `idle` przed zakończeniem nawigacji po skasowaniu

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — szybka decyzja; poprawka oczywista i wąska
- **Dimension**: Safety & Quality
- **Location**: src/components/plan/DayPlanEditor.tsx:166 (gałąź `deleting`) i :179 (`finally`)
- **Detail**: Gałąź sukcesu kasowania woła `window.location.assign(...)` i robi `return`, ale
  `finally` w `mutate()` i tak wykonuje `inFlight.current = false; setBusy("idle")`. `assign()`
  nie blokuje — nawigacja to pełne żądanie SSR na `/plan?date=…`, więc przez cały czas jej trwania
  (żądanie do Supabase, nie milisekundy) na ekranie stoi jeszcze stary dokument: etykieta przycisku
  wraca z „Usuwam…" na „Usuń plan dnia", przycisk jest znów aktywny, a plan wciąż widoczny.
  Drugie kliknięcie w tym oknie wysyła drugi `DELETE`, dostaje `404` i zapala czerwony komunikat
  „Ten dzień nie ma planu do usunięcia." nad skutkiem **udanego** kasowania — dokładnie ta klasa
  sprzeczności, którą Critical Implementation Details planu wyplewiały w gałęzi `204`
  („nauczyciel zobaczyłby komunikat o porażce nad skutkiem sukcesu"). Po drodze `reconcile()`
  wykonuje jeszcze jedno zbędne `GET`.
- **Fix**: Zatrzymać stan zajętości na czas nawigacji — flaga `navigatingAway` (`useRef`) ustawiana
  w gałęzi `deleting`, a `finally` resetuje `inFlight`/`busy` tylko gdy nie jest ustawiona.
  Przycisk zostaje `disabled` z etykietą „Usuwam…" aż do wyładowania dokumentu.
  - Strength: Zamyka okno na drugie kliknięcie u źródła, bez dotykania ścieżki błędu i bez
    nowego stanu widocznego w renderze; zachowuje jedyny strażnik `inFlight` w `mutate()`.
  - Tradeoff: Jeśli nawigacja z jakiegoś powodu nie dojdzie do skutku, przycisk zostaje
    zablokowany do odświeżenia — ale przy `assign()` na własny adres to stan nieosiągalny inaczej
    niż przez błąd sieci już po `204`.
  - Confidence: HIGH — zachowanie odczytane wprost z `mutate()`; `finally` biegnie przed
    zakończeniem `return`, a `assign()` jest asynchroniczne.
  - Blind spot: Nie zmierzono, jak długo faktycznie trwa to okno na produkcyjnym Workerze —
    lokalnie z `npm run dev` jest krótkie, ale zimny SSR z odczytem Supabase je wydłuża.
- **Decision**: FIXED — flaga `navigatingAway` (useRef) + warunkowy reset w `finally`; bramki (`lint`, `astro check`, `build`) ponownie zielone.

### F2 — Data w frontmatterze roadmapy odbiega od kontraktu fazy 4

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja; poprawka oczywista i wąska
- **Dimension**: Plan Adherence
- **Location**: context/foundation/roadmap.md:6
- **Detail**: Plan (faza 4, Contract) i kryterium 4.4 żądały literalnie `updated: 2026-08-27`.
  W pliku stoi `2026-08-29` — faktyczna data edycji. Odstępstwo jest **udokumentowane w miejscu
  jego powstania**: pozycja 4.4 w `## Progress` niesie adnotację o podmianie i powód. To zapis
  prawdziwszy niż kontrakt planu (data planowania ≠ data edycji), więc dryf jest tu poprawą,
  nie usterką; odnotowany, żeby przegląd nie milczał o rozjeździe planu z plikiem.
- **Fix**: Brak — zostawić `2026-08-29`.
- **Decision**: ACCEPTED — data faktycznej edycji zostaje; dryf udokumentowany przy pozycji 4.4 w Progress.

### F3 — Kryterium 4.5 przechodzi, choć tabela `At a glance` zmieniła się w całości

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — szybka decyzja; poprawka oczywista i wąska
- **Dimension**: Success Criteria
- **Location**: context/foundation/roadmap.md:45-60 (tabela `At a glance`)
- **Detail**: Kryterium 4.5 („poza S-05 i frontmatterem roadmapa nietknięta") jest zakresowane na
  bloki `### F-01` … `### S-08` i w tym brzmieniu przechodzi słusznie — żaden blok poza S-05 nie
  został zmieniony. Ale `git diff master...HEAD -- context/foundation/roadmap.md` pokazuje
  **wszystkie** wiersze tabeli `At a glance` jako zmienione: poszerzenie kolumny Status
  (`ready` → `in-progress`) przerównało whitespace w każdym wierszu. Czytelnik `## Progress`,
  który zobaczy 4.5 odhaczone, wyciągnie z tego wniosek mocniejszy niż fakt. Merytorycznie nic
  poza S-05 się nie zmieniło; to szum formatujący, nie dryf treści.
- **Fix**: Brak zmiany w kodzie — przy następnym planie dotykającym roadmapy zapisać kryterium
  z zakresem odpornym na przerównanie tabeli (np. `git diff -w` albo grep na treści wierszy,
  nie na ich obecności w diffie). Reguła z `lessons.md` „Kryterium weryfikacji musi móc nie przejść".
- **Decision**: ACCEPTED-AS-RULE: „Kryterium «poza X nietknięte» musi być odporne na przerównanie” (context/foundation/lessons.md). Bez zmiany w plan.md — kryterium 4.5 przeszło zgodnie ze swoim brzmieniem.
