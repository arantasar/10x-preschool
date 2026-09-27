# Wydruk miesiąca (PDF) — plan implementacji

## Overview

`S-14` (`month-print`, FR-021; FR-020 dziedziczone; PRD v2 §Open Questions #8). Nauczyciel pobiera z widoku miesiąca plik PDF z planem całego miesiąca. Do wyboru są dwa układy: **siatka miesiąca** (jedna kartka A4 poziomo — hasło i temat, bez aktywności) i **tygodniami** (układ „tydzień na stronie" z `S-13` powtórzony dla każdego tygodnia miesiąca, pełne opisy). Wydruk obejmuje wszystkie dni robocze **tego** miesiąca; dzień niezaakceptowany i dzień bez planu są oznaczone tym samym językiem co w wydruku tygodnia.

Slice rozstrzyga PRD §Open Questions #8 decyzją **siatka + tygodniami — dwa przyciski** (Janusz, 2026-09-27).

Slice najpierw **uogólnia** silnik `S-13` (`src/lib/week-pdf/` → `src/lib/plan-pdf/`) bez zmiany zachowania wydruku tygodnia, dopiero potem dokłada miesiąc — zgodnie z §Risk roadmapy („uogólnia, zamiast kopiować obok").

## Current State Analysis

- **Silnik wydruku (`S-13`)** — `src/lib/week-pdf/`: `model.ts` (`PrintWeek`, `PrintDay`, `buildPrintWeek`, `pdfFileName`, wszystkie polskie teksty PDF), `layout.ts` (`layoutWeek`, `wrapText`, `normalizeText`, paginacja, dobór rozmiaru `WEEK_PAGE_SIZES` 11→7 pt, ramka szkicu `dashed-box`), `render.ts` (jedyny importer pdf-lib; fonty wstrzykiwane jako bajty; miara cache'owana per słowo; fonty osadzane **w całości** — `subset: true` psuje mapowanie glifów Noto Sans). Fonty: `public/fonts/NotoSans-{Regular,Bold}.ttf`.
- Co jest już ogólne: ścieżka `day-per-page` działa na dowolnej liście dni; `normalizeText`, `wrapText`, `flowText`, `placeLines`, `placeDaySegment`, `flowSegments`, `embedWeekFonts`, `cachedMeasure` nie wiedzą nic o tygodniu.
- Co jest przywiązane do tygodnia: typ `PrintWeek` i jego `title` z `formatWeekRange`; `pdfFileName` (`plan-tygodnia-<poniedziałek>-…`); `attemptWeek`/`columnTop` liczą kolumny z `week.days.length`; `WeekPdfControls.tsx` łączy „pobierz fonty + renderer + zapisz plik" z danymi tygodnia.
- Importerzy `week-pdf`: `src/components/plan/WeekPdfControls.tsx`, `src/lib/week-pdf/__fixtures__/week.ts`, `tests/e2e/week-print.spec.ts` (plus moduły wewnątrz katalogu).
- **Widok miesiąca** — `src/pages/plan/month.astro` czyta serwerowo tylko `readMonthSummary` (hasło, temat, `accepted`, bez aktywności) dla zakresu **tygodni** (`weeksOfMonth` sięga w sąsiednie miesiące). Siatka to wyspa `MonthGrid` (`client:load`); strona niczego nie mutuje — w przeciwieństwie do tygodnia nie ma tu stanu wyspy, który mógłby się rozjechać z bazą.
- **Odczyt treści** — jedyny HTTP-owy odczyt to `GET /api/day-plan?date=` (jeden dzień). `readWeekPlans(supabase, dates)` (`src/lib/services/day-plan-store.ts:638`) przyjmuje dowolną listę dat, robi dwa zapytania (`in (…)` na plany, potem na aktywności) i przechodzi przez `selectCurrentGeneration` — gotowy na 20–23 dni. Używają go też `week.astro` i `api/day-plan/week/save.ts`.
- Wzorce: odpowiedzi tras przez `json`/`storeFailure`/`unauthorized`/`unconfigured`/`badRequest` z `src/lib/services/day-plan-http.ts`; strażniki ciał w `src/lib/day-plan-guards.ts` (`isDayPlanBody`); testy tras wywołują eksportowaną funkcję z `supabaseStub` (`src/pages/api/day-plan/week/day.test.ts`, `src/lib/services/__fixtures__/supabase.ts`).
- Daty: `weeksOfMonth(month)`, `workingDaysOf(weekStart)`, `formatMonth` (`wrzesień 2026`), `formatWeekRange`, `resolveMonth` (`src/lib/day-plan-dates.ts`).
- E2E: `tests/e2e/week-print.spec.ts` (ryzyko #11) — wzorzec pobrania i odczytu PDF przez `PDFDocument.load`; helpery `seedDayPlan`, `ensureTeacher`, `TEACHER_A`/`TEACHER_B`, `uniqueWeekStart`, `uniqueStamp`, `waitForIslands`.
- Lekcja `S-13`: tekst osadzony własnym fontem jest w PDF-ie zakodowany identyfikatorami glifów; błąd `subset: true` przeszedł wszystkie testy automatyczne i CI. **Obejrzenie wygenerowanego PDF-a jest warunkiem merge'a.**

## Desired End State

- Na `/plan/month`, pod nawigacją poprzedni/następny miesiąc, są dwa przyciski: **„Pobierz PDF — siatka miesiąca"** i **„Pobierz PDF — tygodniami"**. Kliknięcie pobiera `plan-miesiaca-<YYYY-MM>-siatka.pdf` / `plan-miesiaca-<YYYY-MM>-tygodniami.pdf`. Przyciski są ukryte, gdy miesiąc nie wczytał się (`readFailed`); przy miesiącu bez planów są aktywne (wydruk z samymi „Brak planu").
- Dane wydruku pobiera po kliknięciu nowa trasa `GET /api/day-plan/month?month=YYYY-MM` — pełne plany z aktywnościami dla dni roboczych **tego** miesiąca. Ładowanie strony miesiąca się nie zmienia.
- **Zakres dni:** poniedziałek–piątek z datą w danym miesiącu (20–23 dni). Dni sąsiedniego miesiąca w pierwszym/ostatnim tygodniu to pusta komórka / pusta kolumna **bez etykiety** — nie „Brak planu".
- **Siatka miesiąca:** jedna kartka A4 poziomo, zawsze dokładnie jedna. Tytuł „Plan miesiąca — wrzesień 2026", wiersz nagłówków dni tygodnia, wiersz na każdy tydzień z `weeksOfMonth`, pięć kolumn. Komórka: data (np. „14 września"), dla szkicu „SZKIC ROBOCZY" + przerywana ramka wokół komórki, hasło, temat (jeśli jest) — **bez aktywności** (zmiana po obejrzeniu wydruku, 2026-09-27: trzy tytuły ucinały każdy pełny dzień); dla dnia pustego „Brak planu na ten dzień"; dla dnia zaakceptowanego brak etykiety. Rozmiar tekstu to największy z listy kandydatów, przy którym **każda** komórka się mieści; na progu 7 pt komórka, która się nie mieści, jest ucięta — ostatnia widoczna linia kończy się „…". Na dole kartki jedna linia legendy: „Przerywana ramka i „SZKIC ROBOCZY” — plan niezaakceptowany".
- **Tygodniami:** dla każdego tygodnia z `weeksOfMonth` układ „tydzień na stronie" z `S-13` (A4 poziomo, pięć kolumn, rozmiar 11→7 pt dobierany **osobno dla każdego tygodnia**, kontynuacja „(cd.)" poniżej progu), z pełnymi etykietami tygodnia (`SZKIC ROBOCZY — niezaakceptowany`, `Zaakceptowano …`, „Brak planu na ten dzień"). Tydzień zaczyna się zawsze od nowej kartki. Kolumny dni spoza miesiąca są puste. Nagłówek kartki: tytuł miesiąca + zakres tygodnia.
- **Wydruk tygodnia (`S-13`) zachowuje się identycznie** — te same przyciski, nazwy plików, liczba i orientacja stron, etykiety.
- Weryfikacja: testy jednostkowe (model, układ siatki, trasa), test renderowania w node na prawdziwym foncie, e2e pod nowym ryzykiem #12, ręczne obejrzenie i wydruk PDF-a.

### Key Discoveries:

- Wspólny mianownik obu wydruków to **wiersz tygodnia z pięcioma slotami**, gdzie slot może być pusty (dzień spoza zakresu). Tydzień `S-13` to dokument z jednym wierszem i pięcioma pełnymi slotami; miesiąc to 4–6 wierszy z pustymi slotami na brzegach. Siatka miesiąca i „tygodniami" czytają ten sam model, różnią się tylko układem.
- `readWeekPlans` już jest odczytem „dowolnych dat" z izolacją przez RLS i lejkiem `selectCurrentGeneration` — trasa miesiąca nie potrzebuje nowego zapytania, tylko listy dat. Nazwa zostaje (trzech wywołujących, zmiana nazwy to szum), docstring dostaje zdanie o miesiącu.
- PRD §Non-Goals („bez wstępnego pobierania całego miesiąca") dotyczy podglądu `S-07`. Wydruk czyta miesiąc **na żądanie, po kliknięciu** — plan mówi to wprost w docstringu trasy.
- Renderer rysuje tylko `text` i `dashed-box`. Siatka nie potrzebuje nowych typów elementów: komórki oddzielone odstępem, jak kolumny tygodnia; szkic = przerywana ramka komórki.
- `test-plan.md` §7 wyklucza snapshoty wizualne — slice ich nie wprowadza.

## What We're NOT Doing

- **Układu „dzień na stronę" dla miesiąca** (20–23 kartki) — wydruk tygodnia go ma; dla miesiąca odrzucony przy wyborze układu.
- **Generowania PDF na serwerze** — PDF dalej powstaje w przeglądarce; nowa trasa zwraca wyłącznie JSON.
- **Wstępnego ładowania treści miesiąca** przy wejściu na `/plan/month` — zmienia się tylko po kliknięciu.
- **Drukowania dni sąsiednich miesięcy** — ani treści, ani „Brak planu".
- **Weekendów** — dni robocze to poniedziałek–piątek, bez kalendarza świąt.
- **Zmiany nazwy `readWeekPlans`**, zmian w schemacie, migracjach, `readMonthSummary`, `MonthGrid`.
- **CSS `@media print`** dla `/plan/month`.
- **Wyłączania przycisków przy pustym miesiącu** — pusty miesiąc drukuje się jak pusty tydzień.
- **Keep-with-next dla tytułu aktywności** (otwarty `F9` z `S-13`) — poza zakresem; układ „tygodniami" dziedziczy obecne zachowanie.
- **Przycinania fontów do Latin Ext-A** (opcja z follow-upów `S-13`) — poza zakresem.

## Implementation Approach

Od środka na zewnątrz, jak w `S-13`:

1. **Refaktor bez zmiany zachowania**: przeniesienie i uogólnienie silnika + wspólny komponent pobierania. Bramka: testy jednostkowe tygodnia i spec e2e `week-print` przechodzą ze zmienionymi wyłącznie ścieżkami importu.
2. **Odczyt miesiąca**: helper dat + trasa GET + strażnik ciała. Niezależny od Fazy 1 poza nazwą typu wejściowego.
3. **Model miesiąca i układ siatki**: czyste moduły, testowane fałszywą miarą. Nadaje się do `/10x-tdd`.
4. **Renderer i przyciski** na `/plan/month`.
5. **E2E, mapa ryzyk, domknięcie slice'a.**

Podział odpowiedzialności zostaje z `S-13`: `model.ts` — **co** na papierze i jakimi słowami; `layout.ts` (+ nowy `grid-layout.ts`) — **gdzie**; `render.ts` — **jak narysować**; `PdfDownloadControls.tsx` — **jak pobrać plik**; `WeekPdfControls` / `MonthPdfControls` — **skąd dane i kiedy wolno**.

## Critical Implementation Details

**Refaktor najpierw, i z bramką, która potrafi paść.** Faza 1 nie może zmienić ani jednej asercji testów tygodnia — tylko ścieżki importów i nazwy symboli. Kryterium grepowe na diffie spec-a e2e i testów jednostkowych musi zostać sprawdzone na stanie zepsutym (np. tymczasowo zmieniona oczekiwana liczba stron), zanim fazę uzna się za zieloną (lessons: „Kryterium weryfikacji musi móc nie przejść").

**Pusty slot ≠ pusty dzień.** `null` w wierszu (dzień spoza miesiąca) nie ma nagłówka, etykiety ani ramki; `PrintDay` ze statusem `empty` ma nagłówek i „Brak planu na ten dzień". Pomylenie ich łamie FR-021 w obie strony (dzień roboczy miesiąca znika albo dzień sąsiedniego miesiąca udaje brak planu). Oba przypadki mają własną asercję w Fazie 3.

**Ucięcie liczone tą samą miarą co rysunek.** Linia z „…" musi zmieścić się w szerokości komórki po dopisaniu wielokropka (skracanie po słowach, a przy jednym długim słowie po znakach) — inaczej tekst wyjdzie poza ramkę szkicu. Wielokropek `…` (U+2026) jest w Noto Sans; test renderowania to potwierdza.

**Nazwa trasy vs. izolacja.** Trasa bierze `month` z query, wylicza daty sama (`workingDaysOfMonth`) i nie przyjmuje listy dat od klienta — klient nie może poszerzyć zakresu odczytu. Izolację kont daje RLS, jak w każdym innym odczycie; trasa nie dodaje własnego filtra `user_id` (tak samo jak `readWeekPlans` w `week.astro`).

---

## Phase 1: Uogólnienie silnika (bez zmiany zachowania)

### Overview

`src/lib/week-pdf/` → `src/lib/plan-pdf/`, model „dokument z wierszy tygodni", wspólny komponent pobierania. Wydruk tygodnia działa identycznie.

### Changes Required:

#### 1. Przeniesienie katalogu

**File**: `src/lib/week-pdf/*` → `src/lib/plan-pdf/*` (`git mv`, łącznie z `__fixtures__/`)

**Intent**: Nazwa katalogu przestaje kłamać, zanim trafi do niego miesiąc. `git mv`, żeby historia plików przetrwała.

**Contract**: Po fazie nie istnieje `src/lib/week-pdf/`; wszystkie importy (`src/components`, `tests/e2e`, fixture) wskazują `@/lib/plan-pdf/…`.

#### 2. Model dokumentu

**File**: `src/lib/plan-pdf/model.ts`

**Intent**: Zastąpić `PrintWeek` ogólnym dokumentem złożonym z wierszy tygodni, w których slot może być pusty. `buildPrintWeek` zostaje jako konstruktor dokumentu jednowierszowego — jego wynik jest dla tygodnia równoważny dzisiejszemu.

**Contract**:

```ts
export interface PrintWeekRow {
  readonly weekStart: string;
  /** Nagłówek kartki w układzie week-per-page; dla wydruku tygodnia === PrintDocument.title. */
  readonly heading: string;
  /** Zawsze WEEK_DAYS slotów, w kolejności kalendarza; null = dzień spoza zakresu dokumentu. */
  readonly slots: readonly (PrintDay | null)[];
}

export interface PrintDocument {
  readonly title: string;
  readonly rows: readonly PrintWeekRow[];
}

export type PdfLayoutKind = "day-per-page" | "week-per-page" | "month-grid";

export function buildPrintWeek(weekStart, days, plans): PrintDocument; // sygnatura wejścia bez zmian
export function printDays(doc: PrintDocument): PrintDay[];             // sloty != null, spłaszczone — dla day-per-page
```

`pdfFileName(weekStart, kind)` dla tygodnia bez zmian (`plan-tygodnia-…`). `PrintDay`, stałe etykiet i `PDF_BUTTON_LABELS` tygodnia bez zmian. Typ `"month-grid"` pojawia się już tu, ale `layoutDocument` rzuca dla niego do Fazy 3 (nie ma przycisku, który by go wywołał).

#### 3. Silnik układu

**File**: `src/lib/plan-pdf/layout.ts`

**Intent**: `layoutWeek(week, kind, measure)` → `layoutDocument(doc, kind, measure)`. `day-per-page` iteruje `printDays(doc)`; `week-per-page` układa **każdy wiersz osobno** (własny dobór rozmiaru, własne kartki, nagłówek kartki = `row.heading`) i skleja strony. Kolumny liczone z `WEEK_DAYS`, nie z liczby dni; slot `null` → pusta kolumna (bez tekstu i ramki). `PdfLayout.bodySize` staje się `bodySizes: readonly number[]` (jeden na wiersz; dla tygodnia jednoelementowa) albo zostaje `bodySize` = minimum — implementer wybiera, byle testy tygodnia sprawdzały to samo co dziś.

**Contract**: Pomocnicze funkcje potrzebne siatce (`flowText`, `placeLines`, `totalHeight`, `lineHeight`, typ `FlowLine`, stałe `LINE_HEIGHT`, `A4_LANDSCAPE`) eksportowane — Faza 3 importuje je, nie kopiuje.

#### 4. Renderer

**File**: `src/lib/plan-pdf/render.ts`

**Intent**: `renderWeekPdf`/`prepareWeek`/`normalizeWeek` → `renderPlanPdf`/`prepareDocument`/`normalizeDocument`, na `PrintDocument` (normalizacja przechodzi po slotach, pomija `null`). Metadane `setTitle(doc.title)`, `setLanguage("pl")` bez zmian. `embedWeekFonts` → `embedPlanFonts`.

**Contract**: `renderPlanPdf(doc: PrintDocument, kind: PdfLayoutKind, fonts: PdfFonts): Promise<Uint8Array>`.

#### 5. Wspólny komponent pobierania

**File**: `src/components/plan/PdfDownloadControls.tsx` (nowy), `src/components/plan/WeekPdfControls.tsx`

**Intent**: Wyjąć z `WeekPdfControls` wszystko, co nie jest tygodniem: dynamiczny import renderera, `fetchFont`, `saveFile`, blokadę dwukliku (`inFlight`), stany „Przygotowuję PDF…" i komunikaty błędów (`RENDER_FAILED`, `RENDERER_UNAVAILABLE`). `WeekPdfControls` staje się cienką nakładką podającą dane tygodnia i regułę wyłączenia — jego props i zachowanie bez zmian.

**Contract**:

```ts
interface PdfDownloadControlsProps {
  readonly ariaLabel: string;                         // "Wydruk tygodnia" / "Wydruk miesiąca"
  readonly buttons: readonly { kind: PdfLayoutKind; label: string }[];
  readonly loadDocument: () => Promise<PrintDocument>; // tydzień: Promise.resolve(buildPrintWeek(...)); miesiąc: fetch w Fazie 4
  readonly fileName: (kind: PdfLayoutKind) => string;
  readonly disabled: boolean;
  readonly disabledReason: string | null;
}
```

`loadDocument` może rzucić — komponent pokazuje wtedy komunikat przekazany w błędzie (klasa `PdfDocumentLoadError` z polskim `userMessage`) albo `RENDER_FAILED`. Faza 4 z tego korzysta.

#### 6. Bramka statycznego importu

**File**: kryterium w tym planie

**Intent**: Reguła z `S-13` („renderer tylko dynamicznie") obowiązuje nową ścieżkę.

**Contract**: patrz Automated Verification.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe silnika przechodzą: `npx vitest run src/lib/plan-pdf`
- Pełen zestaw jednostkowy przechodzi: `npm test`
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Stary katalog nie istnieje i nic go nie importuje: `test ! -e src/lib/week-pdf && ! grep -rn "week-pdf" src tests`
- Asercje testów tygodnia nietknięte — diff testów i spec-a e2e na commicie fazy 1 zawiera wyłącznie linie z importami/ścieżkami, nazwami przemianowanych symboli albo zmianą dostępu `week.days[i]` → `printDays(week)[i]`. Pathspec musi obejmować **obie** strony przeniesienia (bez `week-pdf/*` `-M` nie ma pary i każdy plik liczy się jako dodany — pierwotna wersja kryterium zwracała 340). Sprawdzone: `0` na `03f7f5e`, `2` z dopisaną zmianą oczekiwanej liczby stron (review `F2`, 2026-09-27): `git diff -w -M master..03f7f5e -- src/lib/week-pdf/model.test.ts src/lib/week-pdf/layout.test.ts src/lib/week-pdf/render.test.ts src/lib/plan-pdf/model.test.ts src/lib/plan-pdf/layout.test.ts src/lib/plan-pdf/render.test.ts tests/e2e/week-print.spec.ts | grep -E "^[-+][^-+]" | grep -vE 'plan-pdf|week-pdf|buildPrintWeek|layoutDocument|layoutWeek|renderPlanPdf|renderWeekPdf|prepareDocument|prepareWeek|embedPlanFonts|embedWeekFonts|PrintDocument|PrintWeek|bodySize|printDays|normalizeDocument|normalizeWeek|\.days\[[0-9]\];$|^\+ *\}\);$' | wc -l` zwraca `0`
- Spec e2e tygodnia przechodzi: `npx playwright test tests/e2e/week-print.spec.ts`
- Renderer nie jest importowany statycznie poza sobą (sprawdzić na tymczasowym statycznym imporcie): `! grep -rnE "from ['\"](pdf-lib|@pdf-lib/fontkit|@/lib/plan-pdf/render)['\"]" src/components src/pages`

#### Manual Verification:

- Na `npm run dev` oba PDF-y tygodnia pobierają się z tymi samymi nazwami, liczbą stron i wyglądem co przed refaktorem (porównanie z plikiem pobranym na `master`).

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed Fazą 2.

---

## Phase 2: Odczyt miesiąca

### Overview

Lista dni roboczych miesiąca, trasa `GET /api/day-plan/month`, strażnik ciała odpowiedzi.

### Changes Required:

#### 1. Dni robocze miesiąca

**File**: `src/lib/day-plan-dates.ts` (+ test w istniejącym pliku testów dat, jeśli jest; inaczej `src/lib/day-plan-dates.test.ts`)

**Intent**: Jedno źródło odpowiedzi „które dni drukuje miesiąc" — trasa i model miesiąca (Faza 3) używają tego samego.

**Contract**: `workingDaysOfMonth(month: string): string[]` — `YYYY-MM` → daty ISO poniedziałek–piątek z tego miesiąca, rosnąco. Przypadki testowe: wrzesień 2026 (22 dni, pierwszy `2026-09-01` wtorek), miesiąc zaczynający się w sobotę (pierwszy dzień = poniedziałek 3.), luty roku przestępnego, żadna data spoza miesiąca, żaden weekend.

#### 2. Trasa

**File**: `src/pages/api/day-plan/month.ts` (nowy)

**Intent**: Pełne plany (z aktywnościami bieżącej generacji) dla dni roboczych jednego miesiąca, na żądanie wydruku. Docstring mówi wprost: odczyt wywoływany kliknięciem „Pobierz PDF", nie przy ładowaniu strony — PRD §Non-Goals o wstępnym pobieraniu dotyczy podglądu, nie wydruku; izolacja kont przez RLS, jak w `readWeekPlans` w `week.astro`.

**Contract**: `export const prerender = false`; `GET` z kolejnością bramek jak w `api/day-plan/index.ts` (`unauthorized` → `unconfigured` → walidacja zod `month` regexem `^\d{4}-(0[1-9]|1[0-2])$` → `badRequest("Podaj poprawny miesiąc.")`). Odczyt: `readWeekPlans(supabase, workingDaysOfMonth(month))`. Odpowiedź 200:

```ts
interface MonthPlansBody {
  readonly month: string;
  readonly plans: Readonly<Record<string, DayPlanView>>; // klucz = data; brak klucza = dzień bez planu
}
```

Błąd store → `storeFailure(error)`. `readWeekPlans` — docstring dostaje zdanie, że czyta też miesiąc (nazwa bez zmian).

#### 3. Strażnik ciała

**File**: `src/lib/day-plan-guards.ts`

**Intent**: Klient zawęża odpowiedź tym samym stylem co `isDayPlanBody`; każda wartość w `plans` przechodzi `isDayPlanBody`.

**Contract**: `isMonthPlansBody(body: unknown): body is MonthPlansBody`.

#### 4. Testy

**File**: `src/pages/api/day-plan/month.test.ts` (nowy), testy strażnika obok istniejących testów guardów

**Intent**: Wzorzec `week/day.test.ts` — wywołanie eksportowanego `GET` z `supabaseStub`, bez mockowania `src/lib/`.

**Contract** — przypadki: brak użytkownika → 401; brak `supabase` → odpowiedź `unconfigured`; `month` brakujący, `2026-13`, `2026-9`, `abc` → 400; poprawny miesiąc → 200, `plans` zawiera zasiane dni, a zapytanie `in("plan_date", …)` dostaje **dokładnie** `workingDaysOfMonth(month)` (asercja na argumentach stuba — trasa nie czyta dni sąsiednich miesięcy); błąd odczytu → status z `storeFailure`. Strażnik: odrzuca brak `plans`, wartość niebędącą planem, przyjmuje pusty `plans: {}`.

### Success Criteria:

#### Automated Verification:

- Testy trasy, dat i strażnika przechodzą: `npx vitest run src/pages/api/day-plan/month.test.ts src/lib/day-plan-dates src/lib/day-plan-guards`
- Pełen zestaw jednostkowy przechodzi: `npm test`
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`

#### Manual Verification:

- Na `npm run dev`, zalogowany: `/api/day-plan/month?month=<bieżący>` zwraca JSON z planami tego miesiąca; niezalogowany — 401; `?month=2026-13` — 400.

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed Fazą 3.

---

## Phase 3: Model miesiąca i układ siatki

### Overview

Czyste moduły: miesiąc → `PrintDocument` → układ siatki na jednej kartce. Sprawdzone fałszywą miarą, jak `S-13` Faza 1.

### Changes Required:

#### 1. Model miesiąca

**File**: `src/lib/plan-pdf/model.ts`

**Intent**: Konstruktor dokumentu miesiąca i polskie teksty siatki — wszystkie w tym jednym pliku, jak w `S-13`.

**Contract**:

```ts
export function buildPrintMonth(month: string, plans: Readonly<Partial<Record<string, DayPlanView>>>): PrintDocument;
export function monthPdfFileName(month: string, kind: "month-grid" | "week-per-page"): string;
// plan-miesiaca-2026-09-siatka.pdf / plan-miesiaca-2026-09-tygodniami.pdf

export const MONTH_PDF_BUTTON_LABELS: { "month-grid": "Pobierz PDF — siatka miesiąca"; "week-per-page": "Pobierz PDF — tygodniami" };
export const DRAFT_SHORT_LABEL = "SZKIC ROBOCZY";
export const GRID_LEGEND = "Przerywana ramka i „SZKIC ROBOCZY” — plan niezaakceptowany";
export const TRUNCATION_MARK = "…";
```

Semantyka: `title` = `Plan miesiąca — ${formatMonth(month)}`; wiersze = `weeksOfMonth(month)` **bez tygodni, w których miesiąc nie ma dnia roboczego** (miesiąc zaczynający się w sobotę/niedzielę — review `F1`); slot = `PrintDay` (ten sam `printDay` co tydzień) dla dat z `workingDaysOfMonth(month)`, `null` dla pozostałych; `row.heading` = `${title} · ${formatDateRange(pierwszy, ostatni dzień roboczy miesiąca w wierszu)}` (review `F3`). Dzień miesiąca bez klucza w `plans` → `empty`. Klucze `plans` spoza miesiąca są ignorowane.

#### 2. Układ siatki

**File**: `src/lib/plan-pdf/grid-layout.ts` (nowy), podpięcie w `layoutDocument` (`layout.ts`)

**Intent**: `month-grid`: A4 poziomo, dokładnie jedna strona. Tytuł, wiersz nagłówków dni tygodnia (Poniedziałek…Piątek), pod nim `rows.length` wierszy komórek równej wysokości i pięć kolumn równej szerokości z odstępem, linia legendy przy dolnym marginesie. Komórka dnia: data krótko (np. „14 września", bold), dla `draft` — `DRAFT_SHORT_LABEL` (bold) + `dashed-box` wokół całej komórki, dla `empty` — `EMPTY_DAY_NOTE`, dla `accepted` — bez etykiety; potem `Hasło: …`, `Temat: …` (jeśli jest). Bez aktywności — ani tytułów, ani opisów. Slot `null` — nic.

**Contract**: `layoutMonthGrid(doc: PrintDocument, measure: Measure): PdfLayout` z `kind: "month-grid"`, `pages.length === 1` zawsze.

- Rozmiar: kandydaci `GRID_SIZES = [10, 9.5, 9, 8.5, 8, 7.5, 7]`; wygrywa pierwszy, przy którym każda komórka mieści się w swojej wysokości. Tytuł i nagłówki dni w stałym rozmiarze.
- Na progu 7 pt komórka za wysoka jest ucinana do liczby linii, która się mieści; ostatnia linia jest skracana tak, żeby `measure(linia + "…") <= szerokość` (po słowach; jedno słowo — po znakach).
- Ramka szkicu obejmuje całą komórkę (stała wysokość wiersza), nie tylko wysokość tekstu — siatka ma równe prostokąty.

#### 3. Testy

**File**: `src/lib/plan-pdf/model.test.ts`, `src/lib/plan-pdf/grid-layout.test.ts` (nowy)

**Intent**: Każda decyzja z tej fazy ma asercję, która potrafi paść. Ta sama fałszywa miara co w `layout.test.ts`.

**Contract** — przypadki minimalne:

- model: wrzesień 2026 → 5 wierszy, pierwszy wiersz ma slot poniedziałku 31 sierpnia `null`, a wtorek 1 września `PrintDay`; liczba slotów niepustych === `workingDaysOfMonth("2026-09").length` (22); dzień bez planu → `empty` + `EMPTY_DAY_NOTE`; plan w `plans` pod datą z sąsiedniego miesiąca nie trafia do dokumentu; `accepted_at === null` → `draft`; `monthPdfFileName` dla obu układów; `title` z `formatMonth`.
- siatka: zawsze jedna strona pozioma — także dla miesiąca pustego i miesiąca 23 × (prompt 2000 znaków; długie tytuły aktywności nie trafiają do siatki); typowy miesiąc → `bodySize` > 7; komórka `draft` ma `dashed-box` i tekst `DRAFT_SHORT_LABEL`, komórka `accepted` nie ma ani jednego; komórka `empty` ma `EMPTY_DAY_NOTE`, slot `null` nie ma żadnego elementu w swoim prostokącie; przy przepełnieniu `bodySize === 7`, a przepełniona komórka ma ostatnią linię kończącą się `TRUNCATION_MARK` i ta linia mieści się w szerokości komórki; żaden element tekstowy nie wychodzi poza margines strony ani poza swoją komórkę; legenda `GRID_LEGEND` jest na stronie.
- week-per-page dla miesiąca (w `layout.test.ts`): liczba stron ≥ liczba wierszy; każdy wiersz zaczyna nową stronę; kolumna slotu `null` nie ma tekstu; typowy miesiąc → dokładnie `rows.length` stron.

### Success Criteria:

#### Automated Verification:

- Testy modelu i układów przechodzą: `npx vitest run src/lib/plan-pdf`
- Pełen zestaw jednostkowy przechodzi: `npm test`
- Lint przechodzi: `npm run lint`
- Moduły układu nie importują pdf-lib (sprawdzić na tymczasowym imporcie): `! grep -nE "from ['\"](pdf-lib|@pdf-lib)" src/lib/plan-pdf/model.ts src/lib/plan-pdf/layout.ts src/lib/plan-pdf/grid-layout.ts`

#### Manual Verification:

- Przegląd testów: odwrócenie warunku w kodzie łamie asercję — sprawdzić co najmniej na trzech: `null` vs `empty`, etykieta szkicu w komórce, wielokropek przy ucięciu.

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed Fazą 4.

---

## Phase 4: Renderer i przyciski na `/plan/month`

### Overview

Renderer rysuje siatkę; wyspa przycisków miesiąca pobiera dane z trasy i oddaje plik.

### Changes Required:

#### 1. Renderer

**File**: `src/lib/plan-pdf/render.ts`

**Intent**: `renderPlanPdf` obsługuje `month-grid` przez `layoutDocument` — bez nowych typów elementów. Jeśli `…` nie ma glifu w którymś z fontów, normalizacja zamieniłaby go na `?` — test poniżej to wyklucza.

**Contract**: bez zmian sygnatury.

#### 2. Test renderowania

**File**: `src/lib/plan-pdf/render.test.ts`

**Intent**: Łańcuch miesiąca na prawdziwych fontach.

**Contract** — przypadki: miesiąc typowy `month-grid` → 1 strona pozioma, bajty od `%PDF-`; `week-per-page` dla miesiąca → liczba stron === liczba wierszy, wszystkie poziome; pusty miesiąc → siatka 1 strona; przepełniony miesiąc (siatka) → 1 strona i nie rzuca; `hasGlyph("…") === true` dla osadzonych fontów; polskie znaki w haśle i tytułach nie rzucają.

#### 3. Wyspa przycisków miesiąca

**File**: `src/components/plan/MonthPdfControls.tsx` (nowy)

**Intent**: Nakładka na `PdfDownloadControls` z dwoma przyciskami miesiąca. `loadDocument`: `fetch("/api/day-plan/month?month=…")` → `isMonthPlansBody` → `buildPrintMonth`. Odpowiedź nie-OK albo niepoprawne ciało → `PdfDocumentLoadError` z komunikatem „Nie udało się wczytać planów miesiąca. Spróbuj ponownie." (401 → „Sesja wygasła. Zaloguj się ponownie."). Zawsze aktywna (`disabled: false`, `disabledReason: null`) — strona niczego nie mutuje.

**Contract**: props `{ month: string }`; `ariaLabel` „Wydruk miesiąca"; nazwy dostępne przycisków = `MONTH_PDF_BUTTON_LABELS` (e2e celuje w nie przez `getByRole("button", { name })`).

#### 4. Strona miesiąca

**File**: `src/pages/plan/month.astro`

**Intent**: `<MonthPdfControls client:idle month={month} />` pod `<nav>` z poprzednim/następnym miesiącem, renderowany tylko gdy `!readFailed`. Wygląd przycisków jak w tygodniu (klasy z `S-13`, `cursor-pointer`).

**Contract**: Brak zmian w odczycie SSR (`readMonthSummary`) i w `MonthGrid`.

### Success Criteria:

#### Automated Verification:

- Test renderowania przechodzi: `npx vitest run src/lib/plan-pdf/render.test.ts`
- Pełen zestaw jednostkowy przechodzi: `npm test`
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Renderer nie jest importowany statycznie poza sobą (jak w Fazie 1): `! grep -rnE "from ['\"](pdf-lib|@pdf-lib/fontkit|@/lib/plan-pdf/render)['\"]" src/components src/pages`
- Strona miesiąca nie czyta treści planów przy ładowaniu: `! grep -nE "readWeekPlans|readDayPlan\(" src/pages/plan/month.astro`

#### Manual Verification:

- **Warunek merge'a (lekcja `S-13`):** oba PDF-y miesiąca pobrane z `npm run dev` i otwarte w podglądzie PDF — tekst czytelny (nie przypadkowe litery), polskie znaki poprawne, szkic z „SZKIC ROBOCZY" i przerywaną ramką, pusty dzień z „Brak planu na ten dzień", dni sąsiedniego miesiąca puste bez etykiety, legenda na dole siatki, wielokropek przy przepełnionej komórce.
- Wydruk na papierze obu układów, także na drukarce czarno-białej: siatka czytelna z odległości ramienia, szkic rozpoznawalny bez koloru. Wynik (drukarka, rozmiar czcionki siatki) odnotowany w `change.md`.
- Miesiąc, którego nie da się wczytać (`readFailed`) — przyciski niewidoczne. Miesiąc pusty — PDF-y pobierają się, same „Brak planu".
- Błąd trasy (np. zatrzymana lokalna Supabase po wczytaniu strony) → komunikat pod przyciskami, strona działa dalej.
- Dwuklik przy throttlingu „Fast 4G" — jeden plik, widoczne „Przygotowuję PDF…".
- Wydruk tygodnia na `/plan/week` dalej działa (regresja po Fazie 1).

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed Fazą 5.

---

## Phase 5: E2E, mapa ryzyk, domknięcie

### Overview

Ryzyko #12 w mapie testów, spec Playwright dla miesiąca, domknięcie slice'a w roadmapie i PRD.

### Changes Required:

#### 1. Mapa ryzyk

**File**: `context/foundation/test-plan.md`

**Intent**: Wiersz #12 w §2 Risk Map: „Wydruk miesiąca pomija dzień roboczy miesiąca, drukuje dzień z sąsiedniego miesiąca (jako plan albo jako „Brak planu”), pokazuje szkic jako gotowy albo zawiera plan innego nauczyciela — nowy odczyt całego miesiąca z aktywnościami jest pierwszym odczytem w paczce szerszym niż tydzień". Impact: High (izolacja kont), Likelihood: Low. Źródła: `prd-v2.md` FR-021, §Zachowania chronione (izolacja kont); `roadmap.md` S-14 §Risk; `context/changes/month-print/`.

**Contract**: Dodanie wiersza nie zmienia treści wierszy #1–#11.

#### 2. Spec e2e

**File**: `tests/e2e/month-print.spec.ts` (nowy)

**Intent**: Wzorzec `week-print.spec.ts`. Tydzień z `uniqueWeekStart()` w środku miesiąca (wybrać tak, żeby poniedziałek i piątek były w tym samym miesiącu); zasiane: poniedziałek zaakceptowany i środa szkic dla `TEACHER_A`, czwartek dla `TEACHER_B`. Sprzątanie `deleteSeededPlans`. Oczekiwania liczone w teście (liczba wierszy miesiąca z własnej arytmetyki dat), nie importowane z aplikacji.

**Contract** — testy:

- „siatka miesiąca": `suggestedFilename()` === `plan-miesiaca-<YYYY-MM>-siatka.pdf`; `%PDF-`; 1 strona; strona pozioma.
- „tygodniami": nazwa pliku; liczba stron === liczba tygodni z co najmniej jednym dniem roboczym miesiąca; wszystkie strony poziome. (Zasiane dane są krótkie, więc żaden tydzień nie przechodzi na „(cd.)" — nawet przy równoległych specach piszących w tym samym miesiącu.)
- „izolacja": `page.request.get("/api/day-plan/month?month=…")` jako `TEACHER_A` → 200; `plans` zawiera obie zasiane daty A z tytułami ze znacznikiem `uniqueStamp` A; czwartek B **nie** występuje w `plans` albo występuje z planem bez znacznika B (inny spec może mieć tam plan A — asercja na znaczniku, nie na obecności klucza); żadna data w `plans` nie leży poza miesiącem ani w weekend.

Lokatory wyłącznie `getByRole("button", { name, exact: true })`; zero `waitForTimeout`.

#### 3. Domknięcie slice'a

**File**: `context/foundation/roadmap.md`, `context/foundation/prd-v2.md`

**Intent**: `S-14` → `done`; PRD §Open Questions #8 oznaczone jako rozstrzygnięte („siatka + tygodniami, dwa przyciski", 2026-09-27, `month-print`). Robione po potwierdzeniu ręcznej weryfikacji Fazy 4.

### Success Criteria:

#### Automated Verification:

- Spec przechodzi lokalnie (Supabase lokalna + dev server): `npx playwright test tests/e2e/month-print.spec.ts`
- Cały zestaw e2e bez regresji: `npm run test:e2e`
- Lint przechodzi: `npm run lint`
- Wiersze #1–#11 mapy ryzyk nietknięte (odporne na whitespace): `git diff -w master..HEAD -- context/foundation/test-plan.md | grep -E "^-\| *(1[01]|[1-9]) *\|" | wc -l` zwraca `0`

#### Manual Verification:

- Spec uruchomiony dwa razy pod rząd i równolegle z resztą zestawu — bez migotania.
- Odwrócenie asercji izolacji (oczekiwanie znacznika B w `plans`) daje czerwony wynik — test potrafi paść.

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie; potem domknięcie w roadmapie i PRD.

---

## Testing Strategy

### Unit Tests:

- Refaktor: istniejące testy tygodnia (model, układ, renderer) przechodzą z niezmienionymi asercjami.
- Daty: `workingDaysOfMonth` — brzegi miesiąca, weekendy, luty przestępny.
- Trasa: 401 / unconfigured / 400 / 200 z dokładnym zakresem dat / błąd store.
- Model miesiąca: sloty `null` vs `empty`, liczba dni roboczych, ignorowanie planów spoza miesiąca, nazwy plików.
- Siatka: zawsze 1 strona, dobór rozmiaru, ucięcie z „…" w szerokości komórki, ramka tylko dla `draft`, legenda, nic poza marginesami.
- Renderer (node, prawdziwe fonty): liczba i orientacja stron obu układów miesiąca, glif `…`, polskie znaki.

### Integration Tests:

- E2E pod ryzykiem #12: pobranie obu układów, struktura PDF, izolacja kont przez odpowiedź trasy.
- E2E pod ryzykiem #11 (tydzień) przechodzi po refaktorze bez zmian w asercjach.

### Manual Testing Steps:

1. Miesiąc z dniem zaakceptowanym, szkicem i pustym, zaczynający się w środku tygodnia → pobierz oba PDF-y, obejrzyj, wydrukuj (także cz-b).
2. Zedytuj jeden dzień do bardzo długiego hasła i tytułów → siatka dalej na jednej kartce, komórka ucięta z „…"; „tygodniami" pokazuje pełną treść.
3. Pusty miesiąc → oba PDF-y z „Brak planu".
4. Zatrzymaj Supabase po wczytaniu strony → komunikat błędu pod przyciskami.
5. `/plan/week` → oba PDF-y tygodnia jak przed slice'em.

## Performance Considerations

- Trasa: dwa zapytania (`in` na ≤ 23 daty, potem aktywności ≤ ~23 × 3 wierszy bieżącej generacji + historyczne) — ten sam kształt co `readWeekPlans` dla tygodnia, tylko szerszy.
- Siatka: do 7 przebiegów układu na ≤ 23 komórki z krótkim tekstem; miara cache'owana per słowo — pomijalne. „Tygodniami": do 6 niezależnych wyszukiwań rozmiaru tygodnia (≤ 9 przebiegów każde) — ten sam koszt co 6 wydruków tygodnia.
- PDF: fonty osadzone w całości (~490 KB na plik, jak w `S-13`) — rozmiar nie zależy od liczby stron w istotny sposób.
- Ładowanie `/plan/month` bez zmian poza małą wyspą przycisków (`client:idle`); pdf-lib i fontkit dalej ładowane dynamicznie po kliknięciu.

## Migration Notes

Brak — żadnych zmian w schemacie ani danych.

## References

- Roadmap: `context/foundation/roadmap.md` §S-14
- PRD: `context/foundation/prd-v2.md` FR-020, FR-021, §Open Questions #8, §Zachowania chronione
- Poprzedni slice: `context/archive/2026-09-27-week-print/plan.md`, `follow-ups/review-fixes.md` (subset, F9)
- Silnik: `src/lib/week-pdf/{model,layout,render}.ts`, `src/components/plan/WeekPdfControls.tsx`
- Odczyt: `src/lib/services/day-plan-store.ts:638` (`readWeekPlans`), `:685` (`readMonthSummary`)
- Trasa-wzorzec: `src/pages/api/day-plan/index.ts` (`GET`), test: `src/pages/api/day-plan/week/day.test.ts`
- Daty: `src/lib/day-plan-dates.ts:113` (`workingDaysOf`), `:136` (`weeksOfMonth`), `:154` (`formatMonth`)
- Strona: `src/pages/plan/month.astro`
- E2E: `tests/e2e/week-print.spec.ts`, `tests/e2e/support/{test-data,supabase-admin}.ts`
- Lekcje: `context/foundation/lessons.md` (bramki muszą móc paść; odporność na przerównanie tabel)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Uogólnienie silnika (bez zmiany zachowania)

#### Automated

- [x] 1.1 Testy jednostkowe silnika przechodzą — 03f7f5e
- [x] 1.2 Pełen zestaw jednostkowy przechodzi — 03f7f5e
- [x] 1.3 Lint przechodzi — 03f7f5e
- [x] 1.4 Build przechodzi — 03f7f5e
- [x] 1.5 Stary katalog nie istnieje i nic go nie importuje — 03f7f5e
- [x] 1.6 Asercje testów tygodnia nietknięte — 03f7f5e (kryterium poprawione i uruchomione ponownie w review F2: 0 / zepsute 2)
- [x] 1.7 Spec e2e tygodnia przechodzi — 03f7f5e
- [x] 1.8 Renderer nie jest importowany statycznie poza sobą — 03f7f5e

#### Manual

- [ ] 1.9 PDF-y tygodnia identyczne jak przed refaktorem

### Phase 2: Odczyt miesiąca

#### Automated

- [x] 2.1 Testy trasy, dat i strażnika przechodzą — 280df0f
- [x] 2.2 Pełen zestaw jednostkowy przechodzi — 280df0f
- [x] 2.3 Lint przechodzi — 280df0f
- [x] 2.4 Build przechodzi — 280df0f

#### Manual

- [ ] 2.5 Trasa odpowiada 200 / 401 / 400 na dev

### Phase 3: Model miesiąca i układ siatki

#### Automated

- [x] 3.1 Testy modelu i układów przechodzą — 98b37e8
- [x] 3.2 Pełen zestaw jednostkowy przechodzi — 98b37e8
- [x] 3.3 Lint przechodzi — 98b37e8
- [x] 3.4 Moduły układu nie importują pdf-lib — 98b37e8

#### Manual

- [ ] 3.5 Przegląd testów: asercje padają po odwróceniu warunku

### Phase 4: Renderer i przyciski na /plan/month

#### Automated

- [x] 4.1 Test renderowania przechodzi — 0e72c0f
- [x] 4.2 Pełen zestaw jednostkowy przechodzi — 0e72c0f
- [x] 4.3 Lint przechodzi — 0e72c0f
- [x] 4.4 Build przechodzi — 0e72c0f
- [x] 4.5 Renderer nie jest importowany statycznie poza sobą — 0e72c0f
- [x] 4.6 Strona miesiąca nie czyta treści planów przy ładowaniu — 0e72c0f

#### Manual

- [ ] 4.7 PDF-y miesiąca obejrzane (warunek merge'a)
- [ ] 4.8 Wydruk na papierze obu układów (także cz-b), wynik w change.md
- [ ] 4.9 Przyciski ukryte przy readFailed, pusty miesiąc drukuje się
- [ ] 4.10 Błąd trasy pokazuje komunikat
- [ ] 4.11 Dwuklik przy throttlingu daje jeden plik
- [ ] 4.12 Wydruk tygodnia bez regresji

### Phase 5: E2E, mapa ryzyk, domknięcie

#### Automated

- [x] 5.1 Spec month-print przechodzi lokalnie — 6f607d0
- [x] 5.2 Cały zestaw e2e bez regresji — 6f607d0
- [x] 5.3 Lint przechodzi — 6f607d0
- [x] 5.4 Wiersze #1–#11 mapy ryzyk nietknięte — 6f607d0

#### Manual

- [ ] 5.5 Spec stabilny przy powtórzeniu i równoległym przebiegu
- [ ] 5.6 Odwrócona asercja izolacji daje czerwony wynik
