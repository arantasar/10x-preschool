# Podgląd dnia w siatce miesiąca — Plan Brief

> Full plan: `context/changes/month-day-preview/plan.md`

## What & Why

`S-07`, FR-010 i FR-011. Nauczyciel zatrzymuje wskaźnik albo fokus klawiatury na kafelku dnia w siatce miesiąca i widzi aktywności tego dnia w popoverze tylko do odczytu, bez wchodzenia w dzień. Kafelek przestaje ucinać podtytuł dnia po jednej linii. To oś „plan jest trudny do odczytania" z PRD v2: dziś jedyną drogą do treści dnia jest wejście w ten dzień.

## Starting Point

Siatka to komponent Astro bez stanu. Kafelek jest linkiem do `/plan?date=`, obie linie tekstu są ucinane (`truncate`), a pełny tekst niesie tylko natywny `title`. Ścieżka odczytu dnia (`GET /api/day-plan?date=` + strażnik `isDayPlanBody`) już istnieje i jest objęta testem własności. Slice nie potrzebuje nowej trasy ani migracji.

## Desired End State

Po krótkim zatrzymaniu myszy albo fokusie klawiatury na dniu z planem przy kafelku otwiera się popover: data, stan, hasło, pełny temat i trzy aktywności (tytuł + początek opisu). Escape zamyka, kliknięcie nadal otwiera dzień. Przeciągnięcie kursora przez rząd nie zalewa serwera żądaniami, a dzień obejrzany nie jest pobierany drugi raz. Temat na kafelku ma dwie linie przy tej samej wysokości kafelka, w szerszej siatce, więc miesiąc mieści się na ekranie tak jak dziś.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Wzorzec interakcji | `:hover` + `:focus-visible`, klik otwiera dzień, tylko odczyt, dane na żądanie | Podgląd jest akceleratorem, a nie jedyną drogą do treści | Roadmap (2026-08-30) |
| Opóźnienie, anulowanie, pamięć podręczna | Wymagania, nie tematy do badania | Runda Sokratejska przyjęła kontrargument o burzy żądań | PRD v2 |
| Umiejscowienie podglądu | Popover zakotwiczony przy kafelku, nad sąsiadami | Nie zabiera miejsca siatce, więc nie narusza twardego ograniczenia wysokości | Plan |
| Treść podglądu | Tytuły + opis przycięty (w tekście, nie tylko CSS) | Wystarcza do rozpoznania aktywności, a rozmiar i to, co czyta czytnik ekranu, mają granicę | Plan |
| Układ kafelka (FR-011) | `max-w-6xl`, temat w 2 liniach, stała wysokość `h-16` | Zero przyrostu wysokości; dłuższy temat ustępuje zgodnie z regułą PRD, pełny tekst jest w podglądzie | Plan |
| Architektura | Siatka jako wyspa React; logika w czystym `src/lib/day-preview.ts` + cienki hook | Zgodnie z CLAUDE.md, a warunki czasu da się sprawdzić fałszywymi zegarami w `node` | Plan |
| Testy | Unit na module + 3 e2e pod nowym ryzykiem #10 | Każdy warunek jakościowy dostaje asercję w warstwie, w której mieszka | Plan |

## Scope

**In scope:**
- Czysty moduł podglądu (opóźnienie 300 ms, anulowanie, pamięć podręczna na widok strony, „wygrywa ostatni", błędy poza pamięcią)
- `MonthGrid.astro` → `MonthGrid.tsx` (`client:load`), `max-w-6xl`, temat w 2 liniach
- Popover z `role="tooltip"` + `aria-describedby`, Escape, stany ładowania, pusty i błędu; usunięcie `title`
- Ryzyko #10 w `test-plan.md` i 3 testy Playwright

**Out of scope:**
- Edycja w podglądzie, wstępne pobieranie miesiąca lub tygodnia, podgląd na dotyku
- Nowa trasa API, migracja, zmiany `readMonthSummary`
- Układ mobilny siatki, unieważnianie pamięci między kartami i po bfcache, testy wizualne

## Architecture / Approach

`day-preview.ts` (bez Reacta i zod) wie, **kiedy i co** pobrać: `show(date)` startuje timer, a po nim sięga do pamięci podręcznej albo woła `GET /api/day-plan?date=` z `AbortController`. `hide()` czyści timer i przerywa żądanie. Stan jest emitowany tylko dla bieżącego dnia docelowego. Hook `useDayPreview` łączy go z Reactem przez `useSyncExternalStore`. `MonthGrid.tsx` tłumaczy zdarzenia wskaźnika (tylko mysz) i fokusu (tylko `:focus-visible`) na `show`/`hide` i renderuje `DayPreview.tsx` jako rodzeństwo linku w opakowaniu kafelka. Dzięki temu popover jest „hoverable" bez dodatkowego timera i nie dziedziczy `opacity-40`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Logika podglądu i teksty | Moduł podglądu + pomocniki tekstu, testy z fałszywymi zegarami i 4 celowe psucia | Wyścig odpowiedzi — spóźniony dzień A na ekranie dnia B |
| 2. Siatka jako wyspa + FR-011 | React zamiast Astro, temat w 2 liniach, szersza siatka | Przyrost wysokości siatki — pilnowany pomiarem przed i po |
| 3. Podgląd dnia (FR-010) | Popover, mysz i klawiatura, Escape, stany | Rozmieszczenie przy krawędziach; mignięcie przy kliknięciu i dotyku |
| 4. E2E i mapa ryzyk | Ryzyko #10, 3 testy przejechane na czerwono | Test przeciągnięcia zależny od szybkości ruchu myszy w Playwright |

**Prerequisites:** gałąź `feat/month-day-preview` przed pierwszym commitem; lokalna Supabase do e2e.
**Estimated effort:** ~2–3 sesje w 4 fazach; Faza 1 nadaje się do `/10x-tdd`, Faza 4 do `/10x-e2e`.

## Open Risks & Assumptions

- Test przeciągnięcia zakłada, że 4 ruchy `page.mouse.move` zmieszczą się w 300 ms. Pod dużym obciążeniem równoległym może dać fałszywe czerwone. Łagodzi go asercja oparta na stanie, bez `waitForTimeout`.
- Przy szerokości poniżej ~1000 px szersza siatka nic nie daje: temat ucina się po 2 liniach wcześniej, a pełny tekst zostaje w podglądzie.
- Pamięć podręczna nie wie o edycjach w innej karcie. Tę samą przestarzałość mają dziś kolory kafelków.

## Success Criteria (Summary)

- Nauczyciel odczytuje aktywności dowolnego zaplanowanego dnia z siatki miesiąca, myszą albo klawiaturą, bez wchodzenia w dzień.
- Krótki temat dnia widać na kafelku w całości, a miesiąc mieści się na ekranie tak samo jak przed zmianą.
- Ruch kursora przez siatkę nie generuje żądań za mijane dni. Potwierdzają to testy jednostkowe i e2e, które widziano na czerwono.
