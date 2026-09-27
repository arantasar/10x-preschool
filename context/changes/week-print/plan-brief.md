# Wydruk tygodnia (PDF) — Plan Brief

> Full plan: `context/changes/week-print/plan.md`

## What & Why

`S-13` (FR-019, FR-020, US-02): nauczyciel pobiera z widoku tygodnia PDF z planem całego tygodnia i oddaje go dalej bez przepisywania. To jedyna oś bólu `M-02`, która dziś nie ma żadnego obejścia — plan w ogóle nie wychodzi z aplikacji. Slice rozstrzyga też otwarte pytanie PRD „dzień na stronie czy tydzień na stronie?": **oba, do wyboru**.

## Starting Point

W `src/` nie ma żadnego wsparcia druku ani PDF. `/plan/week` to ciemny widok z ~1000-liniową wyspą React, która po hydratacji zmienia stan dni (akceptacja, usunięcie, zapis tygodnia) i trzyma niezapisane partie w pamięci. Dane są już dostępne w wyspie — nowa trasa ani migracja nie są potrzebne.

## Desired End State

W widoku tygodnia są dwa przyciski: „Pobierz PDF — dzień na stronę" (A4 pionowo, pełne opisy) i „Pobierz PDF — tydzień na stronie" (A4 poziomo, 5 kolumn, czcionka 11→7 pt, powyżej progu druga kartka). Wszystkie pięć dni roboczych jest w pliku; szkic ma etykietę „SZKIC ROBOCZY — niezaakceptowany" i przerywaną ramkę, dzień pusty — „Brak planu na ten dzień". PDF odpowiada zapisanemu stanowi, który nauczyciel widzi na ekranie.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Układ wydruku | Oba — dwa przyciski | Odbiorca wydruku nie jest ustalony; wybór należy do nauczyciela w chwili pobrania. |
| Forma | Generowany PDF | Plik do oddania/wysłania, identyczny niezależnie od przeglądarki. |
| Silnik | pdf-lib w przeglądarce, dynamiczny import | Zero CPU Workera i zero zależności od planu Cloudflare; ten sam kod testowalny w node. |
| Polskie znaki | Osadzony Noto Sans (OFL) przez fontkit | Standardowe fonty PDF nie mają ą/ę/ł. |
| Źródło danych | `day.plan` z wyspy, nigdy `batch` ani props SSR | Inaczej PDF kłamie o akceptacji po operacji bez przeładowania albo drukuje niezapisane propozycje. |
| Niezapisana partia | Przyciski wyłączone z komunikatem | Ta sama reguła co kontrolki dni (`isBusy \|\| heldCount > 0`). |
| Oznaczenie szkicu | Etykieta tekstowa + przerywana ramka | Czytelne w cz-b, nie zależy od drukowania tła. |
| Pusty dzień | Nagłówek + „Brak planu na ten dzień" | FR-020 dosłownie — luka jawna, nie domyślna. |
| Przepełnienie tygodnia na stronie | Czcionka 11→7 pt, potem kolejna kartka | Nic nie znika i nic nie jest nieczytelne. |
| Testy | Unit modelu/układu + render w node + 1 spec e2e (ryzyko #11) | Tekst z własnym fontem nie jest grepowalny w PDF, więc treść asertowana na modelu, struktura w PDF. |

## Scope

**In scope:** model wydruku i silnik układu (`src/lib/week-pdf/`), renderer pdf-lib, fonty w `public/fonts`, `WeekPdfControls` w wyspie tygodnia, ryzyko #11 w `test-plan.md`, spec `tests/e2e/week-print.spec.ts`.

**Out of scope:** PDF na serwerze / Browser Run, `@media print` dla `/plan/week`, wydruk miesiąca i pojedynczego dnia, drukowanie partii `held`, zapamiętywanie układu, miejsce na notatki, snapshoty PDF, znak wodny, zmiany w danych.

## Architecture / Approach

`WeekPlanBoard` (stan dni) → `WeekPdfControls` (kiedy wolno; klik) → dynamiczny import `render.ts` + `fetch` fontów → `buildPrintWeek` (**co** na papierze, polskie teksty) → `layoutWeek` (**gdzie**, w punktach PDF; miara wstrzykiwana) → pdf-lib rysuje → Blob → `<a download>`. Tylko `render.ts` importuje pdf-lib; model i układ są czyste i testowane fałszywą miarą.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Model i układ | Czyste `model.ts` + `layout.ts` z testami (łamanie, paginacja, 11→7 pt) | Paginacja kolumn poniżej progu — najtrudniejszy kawałek |
| 2. Renderer i fonty | pdf-lib + fontkit, Noto Sans, `renderWeekPdf`, test w node | Znaki spoza fontu; zgodność miary z rysunkiem |
| 3. Przyciski w tygodniu | `WeekPdfControls`, reguła wyłączenia, pobranie pliku, wydruk na papierze | Użycie props SSR zamiast stanu wyspy |
| 4. E2E i mapa ryzyk | Ryzyko #11, spec pobierający oba PDF-y | Migotanie przy zdarzeniu `download` |

**Prerequisites:** gałąź funkcyjna (`CLAUDE.md` §Git — dziś `master`); lokalna Supabase do e2e; dostęp do drukarki na weryfikację ręczną.
**Estimated effort:** ~3–4 sesje w 4 fazach; Faza 1 nadaje się do `/10x-tdd`.

## Open Risks & Assumptions

- Napięcie z PRD zostaje jawne: kryterium Secondary mówi „do oddania bez obróbki", a FR-020 każe drukować szkice — oznaczony szkic i tak zostanie oddany. Slice je dziedziczy, nie rozwiązuje.
- Założenie: typowy tydzień (15 opisów × 2–4 zdania) mieści się na jednej kartce poziomej w ≥ 7 pt. Weryfikuje wydruk ręczny w Fazie 3.
- ~1 MB (JS + fonty) przy pierwszym kliknięciu — akceptowalne dla nauczyciela na komputerze; brak wersji offline.
- Wygląd kartki sprawdza tylko człowiek (brak snapshotów zgodnie z `test-plan.md` §7).

## Success Criteria (Summary)

- Nauczyciel pobiera PDF tygodnia jednym kliknięciem w wybranym układzie i drukuje go czytelnie, także w cz-b.
- Każdy dzień roboczy jest na wydruku; szkice i dni puste są jednoznacznie rozpoznawalne.
- PDF zawsze odpowiada zapisanemu stanowi tygodnia widocznemu na ekranie — nigdy stanowi sprzed operacji ani niezapisanym propozycjom.
