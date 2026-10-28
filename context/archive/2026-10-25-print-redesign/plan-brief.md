# Wydruki w barwach aplikacji (S-29) — Plan Brief

> Full plan: `context/changes/print-redesign/plan.md`

## What & Why

`S-29`: nauczycielka drukuje plan tygodnia i miesiąca w układzie i kolorystyce aplikacji — nie w czerni i bieli Noto Sans — z tą samą treścią co dziś. Wzory to PNG 20 (siatka miesiąca) i 21 (tydzień) z pakietu dizajnu z 2026-10-17.

## Starting Point

Cztery wydruki PDF z `S-13`/`S-14` powstają w przeglądarce przez pdf-lib w łańcuchu `model.ts → layout.ts / grid-layout.ts → render.ts`: czarny Noto Sans, szare przerywane ramki szkicu. Pakiet dizajnu zakłada inny silnik (HTML + `print.css`) i ucina za długi dzień — z pakietu bierzemy tylko wygląd.

## Desired End State

Te same cztery przyciski i nazwy plików; kartki w Young Serif + Nunito Sans, zieleń „Las” na białym papierze, obrysy zamiast wypełnień, chip z hasłem, znak temio, „Grupa: ____”, stopka z podsumowaniem zatwierdzenia; siatka z trzema stanami komórek, kreskowaniem dni spoza miesiąca, liniami na notatki i legendą. Czytelne na drukarce cz-b; nic nie ginie przy przepełnieniu.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Silnik | pdf-lib zostaje, zmienia się rysunek | Jedno kliknięcie = plik identyczny w każdej przeglądarce; FAQ, e2e i testy układu zostają. |
| Układy | Wszystkie cztery | Roadmapa: „zachowanie bez zmian” — nikt nie traci układu, którego używa. |
| Przepełnienie | Zmniejszanie, potem „(cd.)” na kolejnej kartce | Ryzyko S-29: nie wolno zgubić treści aktywności; dizajn ucina. |
| Stopień tygodnia | 9,5 → 7 pt | Krótki tydzień czytelniejszy niż PNG, długi nadal mieści się na kartce. |
| Stan zatwierdzenia | „SZKIC” przy szkicu + zdanie w stopce, bez „Zatwierdzono …” przy dniu | Zgodne z dizajnem; na papierze liczy się „czy ostateczne”, nie godzina. |
| Dodatki z dizajnu | Znak + temio.pl, „Grupa: ____”, legenda + linie na notatki | Rdzeń marki i realna użyteczność; numery stron i data wydruku pominięte. |
| Fonty | Statyczne TTF (OFL) w `public/fonts`, osadzane w całości | Ten sam wzorzec co Noto; woff z fontsource są dzielone na podzbiory. |
| Kolor w układzie | Nazwane tokeny w `LayoutItem`, RGB tylko w `render.ts` | Układ zostaje wolny od pdf-lib i testowalny. |
| Weryfikacja | Testy jednostkowe + próbki PDF do oglądania obok PNG | test-plan §7: bez snapshotów PDF; wygląd ocenia człowiek. |

## Scope

**In scope:** `src/lib/plan-pdf/*` (model, układ, siatka, render, testy, generator próbek), nowe fonty w `public/fonts`, lista fontów w `PdfDownloadControls.tsx`, usunięcie Noto, notatka w `test-plan.md`.

**Out of scope:** trasa HTML `/plan/druk`, ucinanie dnia, usuwanie układów, zmiana przycisków/nazw plików/źródła danych, numery stron, data wydruku, wypełnianie grupy, kolory kategorii, snapshoty PDF, reszta pakietu dizajnu.

## Architecture / Approach

Bez zmiany przepływu: wyspa → `PdfDownloadControls` (dynamiczny import + fonty) → `buildPrint*` (co) → `layoutDocument` (gdzie, w punktach) → `renderPlanPdf` (pdf-lib). `LayoutItem` zyskuje warianty `text` z krojem i kolorem, `box` (zaokrąglony, pełny/przerywany), `rule`, `hatch`, `mark`; wspólna rama kartki rysuje nagłówek i stopkę wszystkich kartek tygodniowych.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Treść kartki w modelu | Nowe pola, napisy, podsumowanie zatwierdzenia (TDD) | Zmiana kształtu `PrintDay` rozlewa się na układ i testy |
| 2. Fonty i słownik rysowania | 4 kroje, kolory, obrysy, znak, rozstrzelenie, próbki | Mapowanie glifów nowych fontów; rozstrzelenie a miara |
| 3. Kartki tygodniowe | Rama + tydzień na stronie, dzień na stronę, miesiąc tygodniami | Chip z długim hasłem; liczba stron w e2e |
| 4. Siatka miesiąca | Komórki, kreskowanie, linie, legenda | 6 wierszy na jednej kartce |
| 5. Domknięcie i papier | E2E, usunięcie Noto, test-plan, druk cz-b | Jasne obrysy (#B9C7B1) mogą zniknąć na słabej drukarce |

**Prerequisites:** gałąź `feat/print-redesign` (jest); lokalna Supabase do e2e; drukarka cz-b na weryfikację.
**Estimated effort:** ~4–5 sesji w 5 fazach; Faza 1 nadaje się do `/10x-tdd`.

## Open Risks & Assumptions

- Jasny obrys komórki zatwierdzonej może być prawie niewidoczny na tanim cz-b — stan i tak niesie przerywana ramka + „SZKIC” przy szkicu; jeśli wydruk to pokaże, przyciemniamy token `frame`.
- Założenie: typowy tydzień mieści się na jednej kartce przy ≤ 9,5 pt mimo większych nagłówków dnia — sprawdzają testy układu i e2e (1 strona).
- Rozstrzelenie liter wymaga operatorów pdf-lib spoza API `drawText`; wolno je pominąć, jeśli okaże się kruche.

## Success Criteria (Summary)

- Cztery wydruki wyglądają jak PNG 20/21 i nadal pobierają się jednym kliknięciem pod tymi samymi nazwami.
- Każdy dzień roboczy jest na papierze, szkic odróżnia się od zatwierdzonego także w cz-b, nic nie jest ucięte w kartkach tygodniowych.
