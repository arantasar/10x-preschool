# Wydruki w barwach aplikacji (S-29) — Implementation Plan

## Overview

Cztery wydruki PDF z `S-13`/`S-14` (tydzień: dzień na stronę, tydzień na stronie; miesiąc: siatka, tygodniami) dostają układ i kolorystykę aplikacji według wzorów `context/foundation/design/design/screens/20-druk-miesiac.png` i `21-druk-tydzien.png`: Young Serif + Nunito Sans, ciemna zieleń „Las” na białym papierze, obrysy zamiast wypełnień, chip z hasłem, znak temio, pole „Grupa: ____”, stopka z podsumowaniem zatwierdzenia. Silnik zostaje ten sam (pdf-lib w przeglądarce, `model → layout → render`), zachowanie też: każdy dzień roboczy na papierze, szkic oznaczony, nic nie ginie przy przepełnieniu, te same przyciski i nazwy plików.

## Current State Analysis

- `src/lib/plan-pdf/model.ts` — treść i wszystkie polskie napisy wydruku (`PrintDocument` → `PrintWeekRow` → `PrintDay`); `DRAFT_LABEL`, `EMPTY_DAY_NOTE`, `GRID_LEGEND`, `acceptedLabel`, nazwy plików i etykiety przycisków.
- `src/lib/plan-pdf/layout.ts` — geometria w punktach PDF; dwa rodzaje elementów (`text` z `FontWeight` `regular|bold`, `dashed-box`); `A4_PORTRAIT`/`A4_LANDSCAPE`; dzień na stronę 11 pt, tydzień na stronie szuka rozmiaru `WEEK_PAGE_SIZES` 11→7 pt, potem kolumny ciągną się na następną kartkę z „(cd.)”.
- `src/lib/plan-pdf/grid-layout.ts` — siatka miesiąca, zawsze jedna kartka, `GRID_SIZES` 10→7 pt, potem ucięcie z „…”; komórka: data, „SZKIC”, hasło, temat.
- `src/lib/plan-pdf/render.ts` — jedyny moduł z pdf-lib; Noto Sans Regular/Bold osadzone w całości (subsetting fontkit psuje mapowanie glifów — komentarz w `embedPlanFonts`), tekst czarny, ramki szkicu szare przerywane.
- `src/components/plan/PdfDownloadControls.tsx` — dynamiczny `import()` renderera, `fetchFont` dwóch plików z `/fonts/`, zapis przez `<a download>`.
- Testy: `model.test.ts`, `layout.test.ts`, `grid-layout.test.ts`, `render.test.ts` (prawdziwe fonty z `public/fonts`), e2e `tests/e2e/week-print.spec.ts` i `month-print.spec.ts` (nazwy przycisków, nazwy plików, liczba i orientacja stron).
- Pakiet dizajnu zakłada inny silnik (HTML + `print.css`, `/plan/druk`) i ucina za długi dzień — oba odrzucone w tej zmianie; z pakietu bierzemy wyłącznie wygląd.
- Fonty aplikacji pochodzą z `@fontsource` jako woff dzielone na podzbiory latin/latin-ext — pdf-lib potrzebuje całych plików TTF z polskimi znakami.

## Desired End State

Nauczycielka klika te same cztery przyciski i dostaje te same cztery pliki, ale kartka wygląda jak aplikacja:

- **Tydzień na stronie** (A4 poziomo) — jak PNG 21: nagłówek z tytułem-zakresem w Young Serif („5–9 października 2026”), nad nim/obok etykieta „PLAN TYGODNIA”, po prawej „Grupa: ____” i znak temio; pięć kolumn rozdzielonych pionową linią; w kolumnie numer dnia (serif), dzień tygodnia wersalikami, chip z hasłem, znacznik „SZKIC” przy szkicu, temat kursywą pod linią, aktywności z numerami w serifie. Stopka: podsumowanie zatwierdzenia po lewej, „temio.pl” po prawej.
- **Dzień na stronę** (A4 pionowo) — ta sama rama kartki i ten sam język dnia, większy stopień (11 pt).
- **Miesiąc tygodniami** — kartki tygodnia jak wyżej, etykieta „PLAN MIESIĄCA · <MIESIĄC ROK>”.
- **Siatka miesiąca** (A4 poziomo, jedna kartka) — jak PNG 20: zaokrąglone komórki (pełny obrys = zatwierdzony, przerywany + „SZKIC” = szkic, jasny obrys + dwie linie na notatki = bez planu), kreskowane pola dni sąsiedniego miesiąca, legenda trzech stanów w stopce.
- Przepełnienie: tydzień 9,5 → 7 pt, potem kontynuacja z „(cd.)”; siatka jak dziś (ucięcie z „…” przy 7 pt).
- Wydruk jest czytelny na drukarce czarno-białej: stan dnia niesie tekst „SZKIC” i rodzaj obrysu, nigdy sam kolor.

Weryfikacja: testy jednostkowe modelu, układu i renderu; dwa specs e2e druku zielone; próbki PDF z fixture'ów obejrzane obok PNG 20/21; wydruk na drukarce cz-b.

### Key Discoveries:

- Jedno źródło geometrii: `layout.ts` produkuje `LayoutItem[]`, `render.ts` tylko rysuje (`src/lib/plan-pdf/render.ts:139-166`) — nowe prymitywy wizualne to nowe warianty `LayoutItem`, nie logika w rendererze.
- `Measure` dostaje `(text, size, weight)` i jest cache'owany per słowo przy 1 pt (`render.ts:107-124`) — zmiana `FontWeight` na krój dotyka sygnatury miary, cache'u i fałszywej miary w testach.
- `hasGlyph` sprawdza przecięcie zestawów znaków wszystkich krojów (`render.ts:90-97`) — z czterema krojami nadal przecięcie wszystkich, bo ten sam tekst (np. temat) bywa składany różnymi krojami między układami.
- Komentarz w `embedPlanFonts`: osadzanie całych fontów, nie `subset: true` — dotyczy też nowych krojów.
- `PdfDownloadControls.tsx:121-128` pobiera fonty po ścieżkach — tu zmienia się lista plików.
- Specs e2e asertują: nazwy przycisków (`model.ts` `PDF_BUTTON_LABELS`, `MONTH_PDF_BUTTON_LABELS`), nazwy plików, `%PDF-`, liczbę stron (tydzień dzień-na-stronę = 5, tydzień-na-stronie = 1, siatka = 1, tygodniami = liczba tygodni z dniami roboczymi) i orientację — wszystko ma zostać prawdą.
- `test-plan.md` §7 i notatka przy ryzyku #11 (linia ~676): bez snapshotów i rasteryzacji PDF; treść asertowana na modelu, wygląd ocenia człowiek.

## What We're NOT Doing

- Trasa HTML `/plan/druk`, `print.css`, `window.print()` — pakiet dizajnu proponuje, ta zmiana nie.
- Ucinanie dnia w widoku tygodnia (pakiet dizajnu tak robi) — zostaje kontynuacja z „(cd.)”.
- Usuwanie któregokolwiek z czterech układów, zmiana nazw przycisków, nazw plików, momentu, w którym przyciski są aktywne, źródła danych (`day.plan` wyspy / `GET /api/day-plan/month`).
- Numery stron „strona X z Y” i data wydruku „wydrukowano …” — świadomie pominięte.
- Wypełnianie pola „Grupa” — aplikacja nie zna grupy; to puste pole do ręcznego wpisania.
- Kolory kategorii aktywności (`--cat-*`) — wydruk nie zna kategorii.
- Snapshoty / rasteryzacja PDF w CI.
- Reszta pakietu dizajnu (nowe ekrany, `PaywallDialog`, tabela porównania — ta należy do `S-22`).
- Zmiany w FAQ — „pobierzesz jako PDF gotowy do druku” zostaje prawdą.

## Implementation Approach

Od treści do papieru, tak jak dziś: najpierw model mówi, **co** stoi na kartce (nowe pola i napisy — testowalne bez fontów), potem renderer i słownik elementów uczą się rysować to, czego wymaga marka (kroje, kolory, zaokrąglone i przerywane obrysy, linie, kreskowanie, znak), potem dwa silniki układu przechodzą na nowy wygląd — najpierw kartki tygodniowe (trzy układy dzielą jedną ramę), potem siatka. Na końcu e2e, sprzątanie Noto i papier.

Kolory są w `LayoutItem` nazwanymi tokenami (`ink`, `muted`, `accent`, …), a `render.ts` mapuje je na RGB z palety `print.css` — tak układ zostaje wolny od pdf-lib, a test układu może sprawdzić „szkic ma przerywany obrys” bez renderu.

## Critical Implementation Details

- **Rozstrzelenie liter.** Etykiety wersalikami („PLAN TYGODNIA”, „PONIEDZIAŁEK”, „SZKIC”) mają w dizajnie `letter-spacing`. `drawText` z pdf-lib go nie zna; trzeba otoczyć rysowanie operatorami `setCharacterSpacing` (`page.pushOperators(pushGraphicsState(), setCharacterSpacing(t))` … `popGraphicsState()`), a miara musi dodać `tracking × (liczba znaków − 1)`, inaczej chip i znacznik „SZKIC” rozjadą się z obrysem. Jeśli to okaże się kruche, rozstrzelenie wolno pominąć — to dekoracja, nie treść.
- **Chip z hasłem w wąskiej kolumnie.** Hasło ma do `PROMPT_MAX` = 2000 znaków. W kolumnie tygodnia chip stoi w wierszu daty, jeśli się mieści, w przeciwnym razie w osobnym wierszu pod nim; zawsze jest jednym wierszem uciętym do szerokości kolumny znakiem „…”. Pełne hasło nie drukuje się nigdzie poza chipem — tak jak w dizajnie.
- **Znak temio** to ścieżka SVG z `PrintWeek.astro` (`M32 2C48.6 2 62 15.4 62 32S48.6 62 32 62H12C6.5 62 2 57.5 2 52V32C2 15.4 15.4 2 32 2Z`, viewBox 64) rysowana `page.drawSvgPath` ze skalą; pdf-lib liczy y ścieżki w dół od punktu zaczepienia — punkt zaczepienia to lewy górny róg znaku.

## Phase 1: Treść kartki w modelu

### Overview

`model.ts` zaczyna nieść to, co nowa kartka mówi: rozdzielony tytuł (etykieta + zakres), numer i nazwę dnia, podsumowanie zatwierdzenia w stopce, legendę trzech stanów, napisy marki. Znika etykieta „Zatwierdzono …” przy każdym dniu. Faza czysto logiczna — nadaje się do `/10x-tdd`.

### Changes Required:

#### 1. Kształt dokumentu

**File**: `src/lib/plan-pdf/model.ts`

**Intent**: Model opisuje nagłówek kartki w dwóch częściach i stopkę z podsumowaniem, żeby układ nie składał polskich zdań sam.

**Contract**:
- `PrintDocument`: zostaje `title` (metadane PDF i dotychczasowe brzmienie „Plan tygodnia — 14–18 września 2026” / „Plan miesiąca — wrzesień 2026”); dochodzi `eyebrow` („PLAN TYGODNIA” / „PLAN MIESIĄCA”) i `sheetTitle` (tydzień: „14–18 września 2026”; miesiąc: „Wrzesień 2026”, wielka litera).
- `PrintWeekRow`: `heading` staje się tytułem kartki tygodnia — sam zakres dat („14–18 września 2026”; w miesiącu zakres własnych dni miesiąca); dochodzi `eyebrow` (tydzień: „PLAN TYGODNIA”; miesiąc tygodniami: „PLAN MIESIĄCA · WRZESIEŃ 2026”) i `note: string | null` — podsumowanie zatwierdzenia tego wiersza.
- `PrintDay`: dochodzi `dayNumber` („14”) i `weekday` („Poniedziałek”); `statusLabel` znika (stan niesie `status`); `heading` (`formatPlanDate`) zostaje dla tytułu PDF-u nieużywany w kartce — usuń, jeśli po fazie 3 nic go nie czyta.

#### 2. Napisy

**File**: `src/lib/plan-pdf/model.ts`

**Intent**: Wszystkie polskie napisy nowej kartki w jednym miejscu, jak dziś.

**Contract**:
- `DRAFT_TAG = "SZKIC"` zastępuje `DRAFT_LABEL` i `DRAFT_SHORT_LABEL` (jeden znacznik we wszystkich układach).
- `EMPTY_DAY_NOTE` zostaje (kartki tygodniowe); siatka nie pisze go — pusty dzień ma linie na notatki.
- `GRID_LEGEND` (jedno zdanie) zastąpione `GRID_LEGEND_ITEMS: readonly { status: PrintDayStatus; label: string }[]` = zatwierdzony / „SZKIC — plan niezatwierdzony” / „bez planu — miejsce na notatki”.
- `GROUP_LABEL = "Grupa:"`, `BRAND_NAME = "temio"`, `BRAND_URL = "temio.pl"`.
- `acceptedLabel` znika razem z `statusLabel`; `PROMPT_PREFIX` / `THEME_PREFIX` znikają, jeśli po fazach 3–4 nic ich nie używa (hasło jest chipem, temat kursywą).
- Etykiety przycisków i nazwy plików **bez zmian**.

#### 3. Podsumowanie zatwierdzenia

**File**: `src/lib/plan-pdf/model.ts` (formatowanie daty w Europe/Warsaw — obok `formatAcceptedAt` w `src/lib/day-plan-dates.ts`)

**Intent**: Stopka kartki tygodniowej mówi, czy to, co na papierze, jest ostateczne — zamiast znacznika czasu przy każdym dniu.

**Contract**: `rowNote(slots)` dla dni wiersza (bez `null`):
- żaden dzień nie ma planu → `null`;
- choć jeden szkic → „Dni oznaczone „SZKIC” czekają na zatwierdzenie”;
- wszystkie zaplanowane dni zatwierdzone, żadnego pustego → „Wszystkie dni zatwierdzone — ostatnio {d MMMM yyyy}”;
- wszystkie zaplanowane zatwierdzone, są dni puste → „Zaplanowane dni zatwierdzone — ostatnio {d MMMM yyyy}”;
- data = najpóźniejsze `accepted_at` w wierszu, w strefie Europe/Warsaw („1 października 2026”).

#### 4. Testy modelu

**File**: `src/lib/plan-pdf/model.test.ts`, fixture'y w `src/lib/plan-pdf/__fixtures__/`

**Intent**: Treść asertowana tam, gdzie da się ją przeczytać (PDF niesie identyfikatory glifów).

**Contract**: przypadki — każdy wariant `rowNote` (w tym granica północy Warsaw/UTC dla daty „ostatnio”), `dayNumber`/`weekday`, `eyebrow` tygodnia i miesiąca tygodniami, `sheetTitle` miesiąca z wielką literą, sloty `null` w miesiącu nadal `null`, dni z sąsiedniego miesiąca nie wpływają na `note`.

### Success Criteria:

#### Automated Verification:

- Testy modelu przechodzą: `npx vitest run src/lib/plan-pdf/model.test.ts`
- Typy i lint: `npm run lint`
- Znacznik „Zatwierdzono …” przy dniu zniknął z modelu: `grep -n "acceptedLabel\|statusLabel" src/lib/plan-pdf/model.ts` nic nie zwraca (dziś zwraca — bramka potrafi nie przejść)

#### Manual Verification:

- Brzmienie czterech wariantów stopki przeczytane i zaakceptowane przez Janusza

**Implementation Note**: Faza 1 zmienia kształt `PrintDay`/`PrintWeekRow`; `layout.ts`, `grid-layout.ts` i `render.ts` mają się kompilować po minimalnym dostosowaniu (np. tymczasowo bez etykiety „Zatwierdzono”), a ich testy dostosuj tylko w zakresie, w jakim dotyka ich zmiana kształtu — nowy wygląd przychodzi w fazach 2–4. `npm test` ma być zielone na końcu każdej fazy.

---

## Phase 2: Fonty marki i słownik rysowania

### Overview

Renderer uczy się rysować markę: cztery kroje zamiast dwóch, kolory z palety, zaokrąglone obrysy pełne i przerywane, linie, kreskowanie, znak temio, rozstrzelenie liter. Dochodzi generator próbek PDF do oglądania obok PNG. Układy jeszcze nie zmieniają wyglądu — tylko przechodzą na nowe typy.

### Changes Required:

#### 1. Pliki fontów

**File**: `public/fonts/` (+ `public/fonts/OFL.txt`)

**Intent**: Całe pliki TTF z polskimi znakami, osadzane w PDF tak jak dziś Noto.

**Contract**: `YoungSerif-Regular.ttf` (Google Fonts, OFL), `NunitoSans-Regular.ttf`, `NunitoSans-Bold.ttf`, `NunitoSans-BoldItalic.ttf` (statyczne instancje z paczki Google Fonts Nunito Sans, `static/NunitoSans_10pt-*.ttf`, przemianowane). Licencje OFL obu rodzin dopisane do `OFL.txt` (albo osobne pliki `OFL-*.txt`). Noto zostaje do fazy 5.

#### 2. Kroje i miara

**File**: `src/lib/plan-pdf/layout.ts`, `src/lib/plan-pdf/render.ts`

**Intent**: Element tekstu wskazuje krój, nie grubość; miara i `hasGlyph` obejmują wszystkie kroje.

**Contract**: `FontWeight` → `FontFace = "serif" | "regular" | "bold" | "boldItalic"`; `Measure = (text, size, face, tracking?) => number`; `PdfFonts` = rekord czterech `Uint8Array` po `FontFace`; `embedPlanFonts` osadza cztery kroje w całości, `hasGlyph` = przecięcie zestawów znaków wszystkich czterech; cache miary per krój.

#### 3. Słownik elementów

**File**: `src/lib/plan-pdf/layout.ts`

**Intent**: Wszystko, czego wymagają PNG 20/21, wyrażone jako dane układu, bez pdf-lib.

**Contract**: `LayoutItem` =
- `text` — dochodzą `face`, `color: InkToken`, opcjonalnie `tracking`;
- `box` — prostokąt z `radius`, `stroke: InkToken`, `strokeWidth`, `dashed: boolean` (zastępuje `dashed-box`);
- `rule` — odcinek (`x1,y1,x2,y2`, `color`, `width`);
- `hatch` — prostokąt kreskowany ukośnie (pole poza miesiącem);
- `mark` — znak temio (`x`, `y` lewego górnego rogu, `size`).
`InkToken` = `ink` (#1F3B2D) · `muted` (#3E5347) · `accent` (#4F6E4B) · `faint` (#8A968E) · `chip` (#8FA487) · `frame` (#B9C7B1) · `draft` (#6B7A70) · `divider` (#D5CDB8) · `soft` (#E2DBC8) · `hatch` (#F4F1E8) — wartości z `context/foundation/design/src/styles/print.css` i komponentów `print/*.astro`.

#### 4. Rysowanie

**File**: `src/lib/plan-pdf/render.ts`

**Intent**: Renderer zamienia każdy wariant `LayoutItem` na wywołania pdf-lib i tylko to.

**Contract**: mapa `InkToken → rgb()`; zaokrąglony prostokąt przez `drawSvgPath` (pdf-lib nie ma `borderRadius` w `drawRectangle`), przerywany przez `borderDashArray`; kreskowanie jako przycięte ukośne linie w kolorze `hatch`; znak przez `drawSvgPath` ze ścieżką z „Critical Implementation Details”; rozstrzelenie przez operatory `setCharacterSpacing` (patrz wyżej). Żaden obrys nie ma wypełnienia — tło papieru zostaje białe.

#### 5. Pobieranie fontów w przeglądarce

**File**: `src/components/plan/PdfDownloadControls.tsx`

**Intent**: Pierwsze kliknięcie pobiera cztery nowe pliki zamiast dwóch Noto.

**Contract**: `Promise.all` z czterema `fetchFont("/fonts/…")`; reszta (dynamiczny import, komunikaty błędów, `saveFile`) bez zmian.

#### 6. Próbki do oglądania

**File**: `src/lib/plan-pdf/samples.test.ts` (nowy), `.gitignore`

**Intent**: Jedno polecenie pisze wszystkie cztery układy z fixture'ów (zwykły tydzień, tydzień z przepełnieniem, tydzień ze szkicem i dniem pustym, pełny i najdłuższy miesiąc) do katalogu, który człowiek otwiera obok PNG 20/21.

**Contract**: `describe.skipIf(!process.env.PRINT_SAMPLES)`; zapis do `print-samples/` w katalogu repo; `print-samples/` w `.gitignore`. Uruchomienie: `PRINT_SAMPLES=1 npx vitest run src/lib/plan-pdf/samples.test.ts`. Bez zmiennej test jest pominięty i `npm test` nic nie zapisuje.

#### 7. Testy renderu

**File**: `src/lib/plan-pdf/render.test.ts`, `layout.test.ts`, `grid-layout.test.ts`

**Intent**: Łańcuch na prawdziwych plikach nowych fontów, fałszywa miara w testach układu dostosowana do `FontFace`.

**Contract**: render czyta cztery nowe TTF z `public/fonts`; zachowane przypadki: `%PDF-`, polskie znaki (`ąćęłńóśźż ĄĆĘŁŃÓŚŹŻ`) przechodzą `hasGlyph` w każdym kroju, emoji → `?`; nowy przypadek: dokument z każdym wariantem `LayoutItem` renderuje się bez wyjątku.

### Success Criteria:

#### Automated Verification:

- Wszystkie testy: `npm test`
- Typy i lint: `npm run lint`
- Build: `npm run build`
- Próbki powstają: `PRINT_SAMPLES=1 npx vitest run src/lib/plan-pdf/samples.test.ts && ls print-samples/*.pdf`
- Renderer nie czyta już Noto: `grep -n "NotoSans" src/lib/plan-pdf/render.test.ts src/components/plan/PdfDownloadControls.tsx` nic nie zwraca (dziś zwraca)

#### Manual Verification:

- Próbka otwarta w Podglądzie: polskie znaki we wszystkich czterech krojach, zaokrąglone obrysy i znak temio rysują się poprawnie (bez „pudełek” `.notdef`, bez przypadkowych liter — objaw zepsutego mapowania glifów)
- W przeglądarce (`npm run dev`) przycisk PDF nadal pobiera plik

**Implementation Note**: Po fazie zatrzymaj się na ręczne potwierdzenie.

---

## Phase 3: Kartki tygodniowe

### Overview

Wspólna rama kartki (nagłówek: etykieta + tytuł w serifie, „Grupa: ____”, znak temio, linia; stopka: podsumowanie + „temio.pl”) i nowy język dnia. Obejmuje trzy układy: tydzień na stronie, dzień na stronę, miesiąc tygodniami.

### Changes Required:

#### 1. Rama kartki

**File**: `src/lib/plan-pdf/layout.ts` (albo nowy `src/lib/plan-pdf/sheet.ts`, jeśli `layout.ts` urośnie ponad czytelność — import cykliczny jak przy `grid-layout.ts` jest dopuszczony tylko wewnątrz funkcji)

**Intent**: Jedna funkcja rysuje nagłówek i stopkę każdej kartki i zwraca obszar treści między nimi.

**Contract**: `sheetFrame(spec, { eyebrow, title, note, continued }, measure) → { items, contentTop, contentBottom }`. Nagłówek jak PNG 21 (kartka tygodniowa: tytuł i etykieta w jednej linii bazowej; siatka — faza 4 — etykieta nad tytułem); „(cd.)” dopisywane do tytułu na kartce kontynuacji. Marginesy z `print.css` (`36px 38px 30px` ≈ 27 / 28,5 / 22,5 pt) — `PageSpec` dostaje marginesy osobno dla góry, boków i dołu albo jeden margines 28 pt i osobne odstępy w ramie; wybór implementatora. Stopka: `note` po lewej (kolor `muted`), `BRAND_URL` po prawej, linia `divider` nad stopką.

#### 2. Dzień w kolumnie i na stronie

**File**: `src/lib/plan-pdf/layout.ts`

**Intent**: Nagłówek dnia i treść w języku PNG 21; ten sam kod dla kolumny tygodnia i strony dnia, różnią się rozmiary.

**Contract**:
- nagłówek dnia: `dayNumber` krojem `serif` (~1,6 × stopień treści), `weekday` wersalikami `bold` w kolorze `muted` z rozstrzeleniem, chip z hasłem (`box` z pełnym promieniem w kolorze `chip` + tekst `bold`), przy szkicu znacznik `DRAFT_TAG` (`box` przerywany, kolor `muted`); reguła chipa — patrz „Critical Implementation Details”; nagłówek powtarzany na kartce kontynuacji z „(cd.)”;
- temat: `boldItalic`, kolor `muted`, linia `soft` pod nim;
- aktywności: numer krojem `serif` w kolorze `accent`, tytuł `bold`, opis `regular`;
- pusty dzień: `EMPTY_DAY_NOTE` w kolorze `faint`;
- szkic nie dostaje już ramki wokół całej kolumny — stan niesie znacznik „SZKIC” i zdanie w stopce (decyzja: brak znacznika czasu przy dniu, podsumowanie w stopce).

#### 3. Tydzień na stronie i miesiąc tygodniami

**File**: `src/lib/plan-pdf/layout.ts`

**Intent**: Pięć kolumn jak PNG 21, rozdzielonych linią `divider`; rozmiar dobierany jak dziś, od mniejszego startu.

**Contract**: `WEEK_PAGE_SIZES = [9.5, 9, 8.5, 8, 7.5, 7]`; dalej bez zmian: największy rozmiar, przy którym tydzień mieści się na jednej kartce, inaczej 7 pt i kontynuacja kolumn z „(cd.)”; kolumny o stałej szerokości (piąta część obszaru treści) także przy slotach `null`. Każdy wiersz miesiąca to osobna kartka z własnym `eyebrow`, tytułem i `note`.

#### 4. Dzień na stronę

**File**: `src/lib/plan-pdf/layout.ts`

**Intent**: A4 pionowo w tej samej ramie, jeden dzień na kartce, treść 11 pt.

**Contract**: `DAY_PAGE_SIZE = 11` bez zmian; rama z `eyebrow`/tytułem tygodnia i stopką z `note` tygodnia na każdej kartce; dzień dłuższy niż strona ciągnie się na następną z „(cd.)” jak dziś; nadal jedna kartka na dzień przy zwykłej długości (e2e oczekuje 5 stron).

#### 5. Testy układu

**File**: `src/lib/plan-pdf/layout.test.ts`

**Intent**: Geometria i stany sprawdzone na elementach układu z fałszywą miarą.

**Contract**: przypadki — szkic ma przerywany `box` znacznika i tekst `SZKIC`, dzień zatwierdzony go nie ma; każdy dzień roboczy ma swój `dayNumber` na kartce; pusty dzień ma `EMPTY_DAY_NOTE`; typowy tydzień = 1 kartka przy rozmiarze ≤ 9,5; przepełniony = 7 pt + kartka kontynuacji z „(cd.)” w tytule i nagłówku dnia; żaden element tekstu nie wychodzi poza obszar treści (między ramą a stopką) ani poza swoją kolumnę; chip z bardzo długim hasłem to jeden wiersz zakończony „…”; `note` w stopce każdej kartki; miesiąc tygodniami = tyle kartek, ile wierszy, przy typowej treści.

### Success Criteria:

#### Automated Verification:

- Wszystkie testy: `npm test`
- Typy i lint: `npm run lint`
- Próbki: `PRINT_SAMPLES=1 npx vitest run src/lib/plan-pdf/samples.test.ts`
- E2E tygodnia: `npx playwright test tests/e2e/week-print.spec.ts` (CI tego nie uruchamia — lekcja „Zmiana renderu strony wymaga inwentarza specs E2E”)

#### Manual Verification:

- Próbka tygodnia na stronie obok PNG 21: ten sam układ nagłówka, kolumn, chipów, numeracji, stopki
- Próbka tygodnia z przepełnieniem: nic nie zginęło, kontynuacja czytelnie oznaczona
- Próbka dnia na stronę i miesiąca tygodniami: ta sama rama, spójny wygląd

**Implementation Note**: Po fazie zatrzymaj się na ręczne potwierdzenie.

---

## Phase 4: Siatka miesiąca

### Overview

Siatka jak PNG 20: rama z etykietą nad tytułem, nagłówki dni tygodnia, zaokrąglone komórki w trzech stanach, kreskowanie dni poza miesiącem, legenda w stopce.

### Changes Required:

#### 1. Komórki i stopka siatki

**File**: `src/lib/plan-pdf/grid-layout.ts`

**Intent**: Komórka niesie stan obrysem i tekstem, nie kolorem; pusty dzień daje miejsce na notatki.

**Contract**:
- rama z fazy 3 w wariancie siatki (etykieta „PLAN MIESIĄCA” nad tytułem `sheetTitle`, „Grupa: ____” pod znakiem); stopka: `GRID_LEGEND_ITEMS` jako trzy próbki obrysu z opisem po lewej, `BRAND_URL` po prawej; bez `note`;
- nagłówki kolumn `GRID_WEEKDAYS` wersalikami z rozstrzeleniem;
- komórka zatwierdzona: `box` pełny `frame`; szkic: `box` przerywany `draft` + znacznik `DRAFT_TAG` w prawym górnym rogu; pusta: `box` `soft`, numer w kolorze `faint`, dwie `rule` `soft` przy dolnej krawędzi, bez tekstu;
- w komórce z planem: numer dnia `serif`, chip z hasłem (jeden wiersz, „…”), temat `regular` pod spodem;
- slot `null` (dzień sąsiedniego miesiąca): `hatch`, bez obrysu i bez tekstu;
- `GRID_SIZES = [9, 8.5, 8, 7.5, 7]` dla tematu; ucięcie z „…” przy 7 pt jak dziś; zawsze jedna kartka.

#### 2. Testy siatki

**File**: `src/lib/plan-pdf/grid-layout.test.ts`

**Contract**: przypadki — zawsze 1 kartka (także `LONGEST_MONTH`); szkic = przerywany `box` + `SZKIC`, zatwierdzony = pełny `box` bez `SZKIC`; pusty dzień = dwie linie i brak `EMPTY_DAY_NOTE`; slot `null` = `hatch` i zero tekstu (ryzyko #12: dzień sąsiedniego miesiąca nie drukuje się jako dzień); legenda zawiera trzy etykiety; tekst nie wychodzi poza swoją komórkę.

### Success Criteria:

#### Automated Verification:

- Wszystkie testy: `npm test`
- Typy i lint: `npm run lint`
- Próbki: `PRINT_SAMPLES=1 npx vitest run src/lib/plan-pdf/samples.test.ts`
- E2E miesiąca: `npx playwright test tests/e2e/month-print.spec.ts`

#### Manual Verification:

- Próbka siatki obok PNG 20: komórki, chipy, kreskowanie, linie na notatki, legenda zgodne z wzorem
- Najdłuższy miesiąc (6 wierszy) mieści się na jednej kartce i jest czytelny

**Implementation Note**: Po fazie zatrzymaj się na ręczne potwierdzenie.

---

## Phase 5: Domknięcie i papier

### Overview

Oba specs e2e druku zielone, Noto Sans usunięte, mapa ryzyk zaktualizowana, wydruk sprawdzony na prawdziwej drukarce czarno-białej.

### Changes Required:

#### 1. E2E

**File**: `tests/e2e/week-print.spec.ts`, `tests/e2e/month-print.spec.ts`

**Intent**: Specs dalej bronią kontraktu (nazwy przycisków i plików, liczba i orientacja stron); zmieniają się tylko, jeśli zmiana wyglądu realnie przesunęła liczbę stron dla ich danych — wtedy poprawiamy dane testowe, nie asercję.

**Contract**: bez nowych asercji wyglądu (test-plan §7).

#### 2. Usunięcie Noto

**File**: `public/fonts/NotoSans-*.ttf`, `public/fonts/OFL.txt`

**Intent**: Nieużywane fonty nie leżą w `public/`.

**Contract**: usunięte oba pliki Noto; `OFL.txt` opisuje tylko Young Serif i Nunito Sans.

#### 3. Mapa ryzyk

**File**: `context/foundation/test-plan.md`

**Intent**: Notatka przy ryzykach #11/#12 mówi, że od `S-29` wydruk ma wygląd marki, stan dnia niesie znacznik „SZKIC” + rodzaj obrysu + zdanie w stopce, a ocena wyglądu nadal należy do człowieka (próbki z `samples.test.ts`).

### Success Criteria:

#### Automated Verification:

- Wszystkie testy: `npm test`
- Lint i build: `npm run lint && npm run build`
- E2E druku: `npx playwright test tests/e2e/week-print.spec.ts tests/e2e/month-print.spec.ts`
- Noto zniknęło z repo: `git ls-files | grep -i "notosans"` nic nie zwraca (dziś zwraca)

#### Manual Verification:

- Cztery wydruki pobrane z `npm run dev` (prawdziwy plan z bazy lokalnej) i wydrukowane na drukarce **czarno-białej**: szkic odróżnia się od zatwierdzonego, pusty dzień od dnia poza miesiącem, wszystkie daty i treść aktywności obecne
- Te same cztery pliki otwarte w Chrome, Safari i Podglądzie macOS — wygląd identyczny
- Rozmiar pierwszego pobrania (JS + fonty, zakładka Network) nie większy niż dziś o więcej niż ~300 KB

**Implementation Note**: Po fazie zatrzymaj się na ręczne potwierdzenie.

---

## Testing Strategy

### Unit Tests:

- Model: warianty stopki, nowe pola dnia i wiersza, napisy (faza 1).
- Układ: stany dnia jako elementy (`box` przerywany + `SZKIC`), mieszczenie się w obszarze, przepełnienie i kontynuacja, chip z długim hasłem, siatka zawsze na jednej kartce, `hatch` dla slotów `null` (fazy 3–4).
- Render: prawdziwe fonty, polskie znaki we wszystkich krojach, każdy wariant `LayoutItem` (faza 2).

### Integration Tests:

- `tests/e2e/week-print.spec.ts`, `tests/e2e/month-print.spec.ts` — bez zmian kontraktu, uruchamiane ręcznie w fazach 3–5 (CI ich nie uruchamia).

### Manual Testing Steps:

1. `PRINT_SAMPLES=1 npx vitest run src/lib/plan-pdf/samples.test.ts`, otworzyć `print-samples/*.pdf` obok `context/foundation/design/design/screens/20-druk-miesiac.png` i `21-druk-tydzien.png`.
2. `npm run dev`, wygenerować tydzień z jednym szkicem i jednym pustym dniem, pobrać oba PDF-y tygodnia i oba miesiąca.
3. Wydrukować na drukarce cz-b; sprawdzić stany dni, daty, kompletność aktywności.
4. Tydzień z bardzo długimi opisami — kontynuacja na drugiej kartce, nic ucięte.

## Performance Considerations

Pierwsze kliknięcie pobiera dziś renderer + 2 × Noto (~1 MB łącznie, brief `S-13`). Cztery nowe pliki TTF osadzane w całości (subsetting wyłączony z powodu błędu fontkit) zwiększą też rozmiar samego PDF-u; Young Serif i statyczne Nunito Sans są mniejsze od Noto, więc wynik powinien być porównywalny — sprawdza kryterium ręczne fazy 5. Cache miary per słowo zostaje (bez niego tydzień długich opisów liczył się ponad 12 s).

## Migration Notes

Brak danych i migracji. Strona otwarta przed deployem ma stary chunk renderera — istniejący komunikat „Odśwież stronę” to obsługuje; stare pliki Noto znikają w tym samym deployu co nowy renderer, który ich nie czyta.

## References

- Roadmap: `context/foundation/roadmap.md` §S-29
- Wzory: `context/foundation/design/design/screens/20-druk-miesiac.png`, `21-druk-tydzien.png`; `context/foundation/design/src/components/print/PrintWeek.astro`, `PrintMonth.astro`, `src/styles/print.css`
- Poprzednie zmiany: `context/archive/2026-09-27-week-print/`, `context/archive/2026-09-27-month-print/`
- Kod: `src/lib/plan-pdf/{model,layout,grid-layout,render}.ts`, `src/components/plan/PdfDownloadControls.tsx`
- Lekcje: „Zmiana renderu strony wymaga inwentarza specs E2E”, „Kryterium weryfikacji musi móc nie przejść”

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Treść kartki w modelu

#### Automated

- [x] 1.1 Testy modelu przechodzą — bc285f1
- [x] 1.2 Typy i lint — bc285f1
- [x] 1.3 Znacznik „Zatwierdzono …” przy dniu zniknął z modelu — bc285f1

#### Manual

- [ ] 1.4 Brzmienie czterech wariantów stopki zaakceptowane

### Phase 2: Fonty marki i słownik rysowania

#### Automated

- [x] 2.1 Wszystkie testy
- [x] 2.2 Typy i lint
- [x] 2.3 Build
- [x] 2.4 Próbki powstają
- [x] 2.5 Renderer nie czyta już Noto

#### Manual

- [ ] 2.6 Polskie znaki, obrysy i znak temio poprawne w próbce
- [ ] 2.7 Przycisk PDF nadal pobiera plik

### Phase 3: Kartki tygodniowe

#### Automated

- [ ] 3.1 Wszystkie testy
- [ ] 3.2 Typy i lint
- [ ] 3.3 Próbki
- [ ] 3.4 E2E tygodnia

#### Manual

- [ ] 3.5 Tydzień na stronie zgodny z PNG 21
- [ ] 3.6 Przepełnienie: nic nie zginęło
- [ ] 3.7 Dzień na stronę i miesiąc tygodniami spójne

### Phase 4: Siatka miesiąca

#### Automated

- [ ] 4.1 Wszystkie testy
- [ ] 4.2 Typy i lint
- [ ] 4.3 Próbki
- [ ] 4.4 E2E miesiąca

#### Manual

- [ ] 4.5 Siatka zgodna z PNG 20
- [ ] 4.6 Najdłuższy miesiąc na jednej kartce

### Phase 5: Domknięcie i papier

#### Automated

- [ ] 5.1 Wszystkie testy
- [ ] 5.2 Lint i build
- [ ] 5.3 E2E druku
- [ ] 5.4 Noto zniknęło z repo

#### Manual

- [ ] 5.5 Wydruk na drukarce czarno-białej
- [ ] 5.6 Wygląd identyczny w Chrome, Safari i Podglądzie
- [ ] 5.7 Rozmiar pierwszego pobrania w normie
