# Wydruk tygodnia (PDF) — plan implementacji

## Overview

`S-13` (`week-print`, FR-019, FR-020, US-02, PRD v2 §Kryteria sukcesu Secondary). Nauczyciel pobiera z widoku tygodnia plik PDF z planem całego tygodnia i oddaje go dalej bez przepisywania czegokolwiek. Do wyboru są dwa układy: **dzień na stronę** (A4 pionowo, pełne opisy) i **tydzień na stronie** (A4 poziomo, pięć kolumn, czcionka zmniejszana do progu czytelności). Wydruk obejmuje wszystkie pięć dni roboczych; dzień niezaakceptowany jest oznaczony jako szkic roboczy, dzień bez planu ma nagłówek i informację „Brak planu na ten dzień".

Slice rozstrzyga PRD §Open Questions #1 / Open Roadmap Questions #1 („dzień na stronie czy tydzień na stronie?") decyzją **oba — przełącznik** (Janusz, 2026-09-27).

## Current State Analysis

- W `src/` nie ma ani jednej reguły `@media print`, utility `print:` ani biblioteki PDF. Slice startuje od zera.
- `/plan/week` (`src/pages/plan/week.astro`) czyta tydzień serwerowo przez `readWeekPlans` (`src/lib/services/day-plan-store.ts:638`) i oddaje go jako `WeekPlanView` wyspie `WeekPlanBoard` (`src/components/plan/WeekPlanBoard.tsx`, ~1000 linii, `client:load`). Nagłówek strony jest w Astro; wszystko pod nim to wyspa.
- Wyspa **zmienia** stan po hydratacji: akceptacja, cofnięcie akceptacji, usunięcie dnia i zapis tygodnia aktualizują `day.plan` (`DayState`, `src/components/plan/WeekDayCard.tsx:46-60`). Wygenerowana, niezapisana partia siedzi w `day.batch` (status `held`) i nie ma za nią wiersza w bazie. Dane SSR (`week.plans`) po pierwszej operacji są więc nieaktualne.
- Wyspa ma już regułę „kiedy wolno ruszać dni": `controlsDisabled={isBusy || heldCount > 0}` (`WeekPlanBoard.tsx:893`), a `readyCount`/`acceptableCount` liczą wyłącznie `day.plan !== null` (`:113-117`) — partia `held` celowo nie jest dniem gotowym.
- `DayPlan` niesie `prompt` (hasło), `theme` (`string | null` — dzień planowany pojedynczo nie ma tematu i to stan poprawny, `src/types.ts:108-116`) i `accepted_at`. Aktywności w `DayPlanView.activities` są już posortowane po `ordinal` i pochodzą z bieżącej generacji.
- Formatery dat: `formatWeekRange` (`14–18 września 2026`), `formatPlanDate` (`poniedziałek, 14 września 2026`), `formatAcceptedAt` (strefa `Europe/Warsaw`) — `src/lib/day-plan-dates.ts`.
- Granice treści: `TITLE_MAX = 200`, `DESCRIPTION_MAX = 4000`, `THEME_MAX = 200`, `PROMPT_MAX = 2000`, `ACTIVITY_COUNT = 3`, `WEEK_DAYS = 5` (`src/lib/day-plan-limits.ts`). Prompt żąda opisu „od 2 do 4 zdań" (`src/lib/services/prompts/day-plan.pl.md:33`) — typowo 300–600 znaków, ale po edycji nauczyciela opis może mieć 4000.
- Vitest działa w środowisku `node`, `include: src/**/*.test.ts`, bez renderowania komponentów (`vitest.config.ts:14-16`). CI uruchamia `npm test` (`.github/workflows/ci.yml:21`). E2E (Playwright) ma helpery `seedDayPlan`, `activitiesFor`, `uniqueWeekStart`, `waitForIslands` (`tests/e2e/support/`).
- Bundle serwerowy Workera ma dziś ~580 KB gzip; plan Cloudflare (Free vs Paid) nie jest potwierdzony w `infrastructure.md`. Generowanie PDF po stronie przeglądarki omija oba te pytania.

## Desired End State

- W widoku tygodnia, w obrębie wyspy, są dwa przyciski: **„Pobierz PDF — dzień na stronę"** i **„Pobierz PDF — tydzień na stronie"**. Kliknięcie pobiera plik `plan-tygodnia-<YYYY-MM-DD>-dzien-na-strone.pdf` / `…-tydzien-na-stronie.pdf` (data = poniedziałek).
- PDF zawiera zapisany stan tygodnia **taki, jaki nauczyciel widzi na ekranie** (`day.plan`), nigdy partii niezapisanej (`day.batch`). Przyciski są wyłączone, gdy wyspa jest zajęta albo trzyma niezapisaną partię — z widocznym wyjaśnieniem.
- **Dzień na stronę:** każdy dzień zaczyna nową kartkę A4 pionowo; nagłówek tygodnia, dzień tygodnia z datą, hasło, temat (jeśli jest), stan, trzy aktywności z tytułem i pełnym opisem, 11 pt. Dzień, który się nie mieści, przechodzi na kolejną kartkę z nagłówkiem „(cd.)". Minimum 5 stron.
- **Tydzień na stronie:** A4 poziomo, pięć kolumn pod nagłówkiem tygodnia. Rozmiar tekstu to największy z {11; 10,5; … ; 7} pt, przy którym cały tydzień mieści się na jednej kartce. Jeśli nie mieści się nawet przy 7 pt, zostaje 7 pt, a kolumny są kontynuowane na kolejnych kartkach.
- **Szkic roboczy:** dzień z planem i `accepted_at === null` ma etykietę „SZKIC ROBOCZY — niezaakceptowany" przy nagłówku i przerywaną ramkę wokół treści dnia. Dzień zaakceptowany ma „Zaakceptowano <formatAcceptedAt>". Oznaczenie jest tekstowe i obrysowe — czytelne w druku czarno-białym, niezależne od drukowania tła.
- **Dzień bez planu:** nagłówek dnia + „Brak planu na ten dzień". W układzie dzień-na-stronę zajmuje własną kartkę.
- Polskie znaki (ą ć ę ł ń ó ś ź ż, wielkie też) renderują się poprawnie; znaki spoza fontu (np. emoji z edycji nauczyciela) nie przerywają generowania.
- Weryfikacja: testy jednostkowe modelu i układu, test renderowania w node na prawdziwym foncie, e2e pod nowym ryzykiem #11, ręczny wydruk na papierze.

### Key Discoveries:

- Źródłem danych dla PDF musi być stan wyspy, nie props SSR — inaczej dzień zaakceptowany minutę temu wyjdzie na papierze jako szkic (`WeekPlanBoard.tsx:81`, `setDays` po każdej operacji).
- Reguła wyłączenia przycisków już istnieje i ma uzasadnienie (`WeekPlanBoard.tsx:887-893`): partia `held` to stan, którego nie ma w bazie. Drukowanie w tym momencie pominęłoby to, co nauczyciel właśnie ogląda, bez żadnego sygnału.
- 14 standardowych fontów PDF (WinAnsi) nie ma polskich znaków — pdf-lib rzuca przy kodowaniu `ł`. Potrzebny osadzony TTF przez `@pdf-lib/fontkit` (`pdfDoc.registerFontkit(fontkit)`, `embedFont(bytes, { subset: true })`).
- Tekst osadzony własnym fontem jest w strumieniu treści PDF zakodowany identyfikatorami glifów — **nie da się go grepować** w teście. Asercje o treści (etykieta szkicu, „Brak planu", kolejność dni) idą na czysty model układu; testy PDF sprawdzają strukturę (nagłówek `%PDF`, liczba i orientacja stron).
- `test-plan.md` §7 wyklucza snapshoty wizualne. Ten slice ich nie wprowadza — wygląd kartki weryfikuje człowiek na papierze.

## What We're NOT Doing

- **Generowania PDF na serwerze** ani Cloudflare Browser Run — brak nowej trasy API, bindingu, zmian w `wrangler.jsonc`, zależności od planu Workers.
- **CSS `@media print` dla `/plan/week`** — Ctrl+P na widoku tygodnia drukuje dalej ciemny ekran; ścieżką wydruku jest PDF.
- **Wydruku miesiąca ani pojedynczego dnia z `/plan?date=`.**
- **Drukowania niezapisanych partii (`held`)** — przyciski są wtedy wyłączone.
- **Zapamiętywania wybranego układu**, trzeciego układu, wyboru rozmiaru papieru (zawsze A4).
- **Miejsca na notatki odręczne** na kartce pustego dnia.
- **Snapshotów/rasteryzacji PDF w testach** (`test-plan.md` §7).
- **Zmian w danych, migracjach, `readWeekPlans`, `WeekPlanView`.**
- **Znaku wodnego** — oznaczenie szkicu jest etykietą + ramką.

## Implementation Approach

Od środka na zewnątrz, jak w `S-07` i `S-11`:

1. **Czysty model i silnik układu** (`src/lib/week-pdf/`): najpierw przekształcenie tygodnia w model wydruku (co ma być na papierze), potem układ (gdzie), sparametryzowany funkcją mierzącą tekst. Test używa deterministycznej miary (np. szerokość = liczba znaków × rozmiar × stała), więc łamanie linii, paginacja i dobór rozmiaru czcionki są sprawdzalne bez pdf-lib. Faza nadaje się do `/10x-tdd`.
2. **Renderer pdf-lib**: rysuje gotowy układ, osadza fonty, podaje prawdziwą miarę (`font.widthOfTextAtSize`) do silnika z Fazy 1. Sprawdzony w node na prawdziwych plikach fontów.
3. **UI**: mały komponent przycisków wewnątrz wyspy, ładujący renderer i fonty dynamicznym importem dopiero po kliknięciu — pdf-lib i fontkit nie trafiają do początkowego bundla widoku tygodnia.
4. **E2E + mapa ryzyk.**

Podział odpowiedzialności: `model.ts` wie **co** jest na papierze (i niesie wszystkie polskie teksty), `layout.ts` wie **gdzie** (w punktach PDF, bez pdf-lib), `render.ts` wie **jak narysować** (jedyny moduł importujący pdf-lib), `WeekPdfControls.tsx` wie **kiedy wolno** i jak oddać plik.

## Critical Implementation Details

**Miara jest wstrzykiwana, nie importowana.** `layout.ts` nie importuje pdf-lib — dostaje `measure(text, size, weight) => number` (szerokość w punktach). Tylko tak Faza 1 jest testowalna fałszywą miarą, a Faza 2 podaje tę samą funkcję z prawdziwych fontów. Wysokość linii = rozmiar × stały współczynnik (np. 1,3), nie `heightAtSize`, żeby model i renderer liczyły tak samo.

**Tekst jest normalizowany przed miarą i rysowaniem.** `\r\n` → `\n`; `\n` w opisie to twarde łamanie linii; tabulatory → spacja. Znaki, dla których font nie ma glifu, zastępuje się przed pomiarem (`font.getCharacterSet()` w rendererze → predykat `hasGlyph` przekazany do normalizacji), inaczej miara i rysunek rozjadą się albo pdf-lib rzuci. Słowo dłuższe niż szerokość kolumny łamie się po znakach.

**Dane z `day.plan`, nie z props.** `WeekPdfControls` dostaje od `WeekPlanBoard` tablicę dni zbudowaną z bieżącego `days[date].plan` — nigdy z `week.plans` i nigdy z `batch`.

**Pobranie bez nawigacji.** `Blob` → `URL.createObjectURL` → tymczasowy `<a download>` → `click()` → `revokeObjectURL`. Nawigacja albo `window.open` zgubiłyby nazwę pliku i na części przeglądarek otworzyły podgląd zamiast pobrania.

---

## Phase 1: Model wydruku i silnik układu

### Overview

Czyste moduły bez pdf-lib i bez Reacta: tydzień → model wydruku → układ stron w punktach PDF. Całość sprawdzona w vitest fałszywą miarą.

### Changes Required:

#### 1. Model wydruku

**File**: `src/lib/week-pdf/model.ts` (nowy)

**Intent**: Jedno miejsce, które decyduje, co trafia na papier i jakimi polskimi słowami: nagłówek tygodnia, kolejność dni, stan każdego dnia i jego etykieta. Oddziela FR-020 („wszystkie dni robocze, szkice oznaczone") od geometrii.

**Contract**:

```ts
export type PrintDayStatus = "accepted" | "draft" | "empty";

export interface PrintDay {
  readonly date: string;            // ISO
  readonly heading: string;         // formatPlanDate(date)
  readonly status: PrintDayStatus;
  readonly statusLabel: string | null; // "SZKIC ROBOCZY — niezaakceptowany" | "Zaakceptowano 23 września, 11:31" | null
  readonly prompt: string | null;   // hasło
  readonly theme: string | null;
  readonly activities: readonly { readonly title: string; readonly description: string }[];
  readonly emptyNote: string | null; // "Brak planu na ten dzień" dla empty
}

export interface PrintWeek {
  readonly weekStart: string;
  readonly title: string;           // "Plan tygodnia — 14–18 września 2026"
  readonly days: readonly PrintDay[]; // zawsze WEEK_DAYS, w kolejności kalendarza
}

export function buildPrintWeek(
  weekStart: string,
  days: readonly string[],
  plans: Readonly<Partial<Record<string, DayPlanView>>>,
): PrintWeek;

export type PdfLayoutKind = "day-per-page" | "week-per-page";
export function pdfFileName(weekStart: string, kind: PdfLayoutKind): string;
```

Etykiety jako eksportowane stałe (`DRAFT_LABEL`, `EMPTY_DAY_NOTE`), żeby test i UI nie powtarzały literałów. Wejście celowo przyjmuje ten sam kształt co `WeekPlanView.plans`, żeby wyspa mogła podać mapę zbudowaną z `days[date].plan`.

#### 2. Silnik układu

**File**: `src/lib/week-pdf/layout.ts` (nowy)

**Intent**: Zamienić `PrintWeek` na listę stron z pozycjonowanymi elementami (linie tekstu, ramki przerywane). Tu mieszka łamanie linii, paginacja, kontynuacja „(cd.)" i dobór rozmiaru czcionki dla tygodnia na stronie.

**Contract**:

```ts
export type Measure = (text: string, size: number, weight: "regular" | "bold") => number;

export interface PageSpec { readonly width: number; readonly height: number; readonly margin: number }
export const A4_PORTRAIT: PageSpec;   // 595.28 × 841.89 pt
export const A4_LANDSCAPE: PageSpec;

export type LayoutItem =
  | { readonly kind: "text"; readonly x: number; readonly y: number; readonly text: string; readonly size: number; readonly weight: "regular" | "bold" }
  | { readonly kind: "dashed-box"; readonly x: number; readonly y: number; readonly width: number; readonly height: number };

export interface LayoutPage { readonly spec: PageSpec; readonly items: readonly LayoutItem[] }
export interface PdfLayout { readonly kind: PdfLayoutKind; readonly bodySize: number; readonly pages: readonly LayoutPage[] }

export function wrapText(text: string, maxWidth: number, size: number, weight: "regular" | "bold", measure: Measure): string[];
export function layoutWeek(week: PrintWeek, kind: PdfLayoutKind, measure: Measure): PdfLayout;

export const WEEK_PAGE_SIZES: readonly number[]; // 11, 10.5, …, 7
```

Semantyka:

- `day-per-page`: każdy dzień zaczyna nową stronę A4 pionowo, rozmiar treści 11 pt. Przepełnienie → kolejna strona tego samego dnia z nagłówkiem dnia + „(cd.)". Ramka szkicu rysowana na każdej stronie dnia `draft` (osobny odcinek na stronę, nie jedna ramka przez dwie kartki).
- `week-per-page`: A4 poziomo, nagłówek tygodnia, pięć kolumn równej szerokości z odstępem. Próbuje kolejnych `WEEK_PAGE_SIZES` od największego; pierwszy, przy którym najwyższa kolumna mieści się na jednej stronie, wygrywa. Gdy nie mieści się żaden — 7 pt i kolumny kontynuowane równolegle na kolejnych stronach (każda kolumna od góry nowej strony, pod powtórzonym nagłówkiem tygodnia z „(cd.)").
- Współrzędne w układzie PDF (początek w lewym dolnym rogu), żeby renderer nie przeliczał.

#### 3. Testy

**File**: `src/lib/week-pdf/model.test.ts`, `src/lib/week-pdf/layout.test.ts` (nowe)

**Intent**: Każda decyzja z tego planu, która mieszka w logice, dostaje asercję, która potrafi paść. Miara testowa: `(text, size) => text.length * size * 0.5` (bold × 1,1).

**Contract** — przypadki minimalne:

- model: 5 dni zawsze, w kolejności kalendarza, także przy `plans = {}`; dzień bez klucza → `empty` + `EMPTY_DAY_NOTE`; `accepted_at === null` → `draft` + `DRAFT_LABEL`; zaakceptowany → etykieta z `formatAcceptedAt`; `theme: null` → `theme: null` (bez zastępczego tekstu); aktywności w kolejności wejścia; `pdfFileName` dla obu układów.
- wrap: zawijanie po spacjach; `\n` łamie linię; słowo dłuższe niż kolumna łamane po znakach; pusty tekst → zero linii; żadna linia nie przekracza `maxWidth` wg miary.
- day-per-page: 5 dni z krótką treścią → dokładnie 5 stron; dzień z 3 × 4000 znaków → >5 stron, strona kontynuacji ma „(cd.)"; strona dnia `draft` ma `dashed-box` i tekst `DRAFT_LABEL`, strona dnia `accepted` nie ma `dashed-box`; tydzień pusty → 5 stron z `EMPTY_DAY_NOTE`.
- week-per-page: typowy tydzień (15 × ~500 znaków) → 1 strona, `bodySize` > 7; tydzień „prawie pełny" dobiera mniejszy rozmiar niż typowy; tydzień 15 × 4000 znaków → `bodySize === 7` i ≥ 2 strony; strony poziome; żaden element tekstowy nie wychodzi poza marginesy.

### Success Criteria:

#### Automated Verification:

- Testy modelu i układu przechodzą: `npx vitest run src/lib/week-pdf`
- Pełen zestaw jednostkowy przechodzi: `npm test`
- Lint przechodzi: `npm run lint`
- Moduły Fazy 1 nie importują pdf-lib (bramka musi móc paść — sprawdzić na tymczasowym imporcie): `! grep -nE "from ['\"]pdf-lib|from ['\"]@pdf-lib" src/lib/week-pdf/model.ts src/lib/week-pdf/layout.ts`

#### Manual Verification:

- Przegląd testów: każdy przypadek z listy powyżej ma asercję, która pada po odwróceniu warunku w kodzie (sprawdzić na co najmniej dwóch: etykieta szkicu i próg 7 pt).

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed Fazą 2.

---

## Phase 2: Renderer PDF i fonty

### Overview

pdf-lib + fontkit, font z polskimi znakami, renderer rysujący `PdfLayout`. Sprawdzony w node na prawdziwych bajtach fontu.

### Changes Required:

#### 1. Zależności

**File**: `package.json`

**Intent**: Dodać `pdf-lib` i `@pdf-lib/fontkit` jako `dependencies` (lądują w bundlu klienckim, ładowane dynamicznie).

**Contract**: `npm install pdf-lib @pdf-lib/fontkit`; `package-lock.json` w tym samym commicie.

#### 2. Fonty

**File**: `public/fonts/NotoSans-Regular.ttf`, `public/fonts/NotoSans-Bold.ttf`, `public/fonts/OFL.txt` (nowe)

**Intent**: Statyczne (nie variable) TTF Noto Sans z repozytorium Google Fonts, z licencją OFL obok. Serwowane jako statyczne zasoby — przeglądarka pobiera je dopiero przy pierwszym generowaniu i cache'uje.

**Contract**: Ścieżki `/fonts/NotoSans-Regular.ttf` i `/fonts/NotoSans-Bold.ttf` są kontraktem dla Fazy 3. Pliki muszą zawierać glify Latin Extended-A (polskie znaki) — weryfikuje test renderowania.

#### 3. Renderer

**File**: `src/lib/week-pdf/render.ts` (nowy)

**Intent**: Jedyny moduł importujący pdf-lib. Przyjmuje bajty fontów (nie pobiera ich sam — w node test czyta pliki, w przeglądarce `fetch`), buduje miarę z osadzonych fontów, woła `layoutWeek`, rysuje strony i zwraca bajty PDF. Ustawia metadane dokumentu (`setTitle` = `PrintWeek.title`, `setLanguage("pl")`).

**Contract**:

```ts
export interface PdfFonts { readonly regular: Uint8Array; readonly bold: Uint8Array }
export async function renderWeekPdf(week: PrintWeek, kind: PdfLayoutKind, fonts: PdfFonts): Promise<Uint8Array>;
```

Ramka przerywana: `page.drawRectangle({ …, borderWidth, borderDashArray: [4, 3], borderColor: grayscale })`, bez wypełnienia. Tekst w czerni, etykieta szkicu pogrubiona. Normalizacja znaków spoza fontu (patrz Critical Implementation Details) — przed przekazaniem tekstu do `layoutWeek`.

#### 4. Test renderowania

**File**: `src/lib/week-pdf/render.test.ts` (nowy)

**Intent**: Dowód, że cały łańcuch działa na prawdziwym foncie: czyta TTF-y z `public/fonts` przez `fs`, renderuje, ładuje wynik z powrotem `PDFDocument.load` i sprawdza strukturę.

**Contract** — przypadki: bajty zaczynają się od `%PDF-`; typowy tydzień day-per-page → 5 stron pionowych; week-per-page → 1 strona pozioma (szerokość > wysokość); tekst ze wszystkimi polskimi znakami (małe i wielkie) nie rzuca; tekst z emoji i znakiem spoza fontu nie rzuca; tydzień bez planów → 5 stron.

### Success Criteria:

#### Automated Verification:

- Test renderowania przechodzi: `npx vitest run src/lib/week-pdf/render.test.ts`
- Pełen zestaw jednostkowy przechodzi: `npm test`
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Fonty i licencja są w repo: `test -f public/fonts/NotoSans-Regular.ttf && test -f public/fonts/NotoSans-Bold.ttf && test -f public/fonts/OFL.txt`

#### Manual Verification:

- Plik wygenerowany przez test (tymczasowo zapisany do scratchpada) otwarty w podglądzie PDF: polskie znaki poprawne, szkic oznaczony etykietą i przerywaną ramką, pusty dzień z „Brak planu na ten dzień", układ poziomy czytelny.

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed Fazą 3.

---

## Phase 3: Przyciski PDF w widoku tygodnia

### Overview

Dwa przyciski wewnątrz wyspy tygodnia, generujące PDF z bieżącego zapisanego stanu, z dynamicznym importem renderera.

### Changes Required:

#### 1. Komponent przycisków

**File**: `src/components/plan/WeekPdfControls.tsx` (nowy)

**Intent**: Renderuje dwa przyciski (`Button` z `@/components/ui/button`, ikona `FileDown` z lucide), obsługuje generowanie i pobranie. Po kliknięciu: `await import("@/lib/week-pdf/render")`, `fetch` obu fontów (`/fonts/…`), `buildPrintWeek` → `renderWeekPdf` → pobranie pliku `pdfFileName(...)`. W trakcie generowania oba przyciski wyłączone, kliknięty pokazuje „Przygotowuję PDF…". Błąd (fonty nie doszły, wyjątek renderera) → komunikat „Nie udało się przygotować pliku PDF. Spróbuj ponownie." pod przyciskami, bez wpływu na resztę wyspy.

**Contract**:

```ts
interface WeekPdfControlsProps {
  readonly weekStart: string;
  readonly days: readonly string[];
  readonly plans: Readonly<Partial<Record<string, DayPlanView>>>; // z day.plan, nie z batch
  readonly disabled: boolean;
  readonly disabledReason: string | null;
}
```

Nazwy dostępne przycisków: „Pobierz PDF — dzień na stronę", „Pobierz PDF — tydzień na stronie" (e2e celuje w nie przez `getByRole("button", { name })`).

#### 2. Podpięcie do wyspy

**File**: `src/components/plan/WeekPlanBoard.tsx`

**Intent**: Wyrenderować `WeekPdfControls` w wyspie (sekcja przycisków tygodnia, obok „Zapisz tydzień"/„Akceptuj tydzień" — wizualnie oddzielone jako akcja „wynieś", nie „zmień"), z mapą planów zbudowaną z `days[date].plan` i regułą wyłączenia.

**Contract**: `disabled = isBusy || heldCount > 0`. `disabledReason`: przy `heldCount > 0` — „Zapisz tydzień, zanim pobierzesz PDF — niezapisane propozycje nie trafią do pliku."; przy `isBusy` — `null` (stan zajętości widać już na przyciskach wyspy). Przyciski są dostępne także przy tygodniu pustym (FR-020: wszystkie dni, także bez planu).

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Pełen zestaw jednostkowy przechodzi: `npm test`
- Build przechodzi: `npm run build`
- pdf-lib nie jest importowany statycznie poza rendererem (bramka na konstrukcji importu; sprawdzić na tymczasowym statycznym imporcie w `WeekPdfControls.tsx`): `! grep -rnE "from ['\"](pdf-lib|@pdf-lib/fontkit|@/lib/week-pdf/render)['\"]" src/components src/pages` (dynamiczny `import("…")` nie zawiera `from`, więc przechodzi; statyczny import, także wieloliniowy, pada)

#### Manual Verification:

- Na `npm run dev`: tydzień z dniem zaakceptowanym, szkicem i dniem pustym → oba PDF-y pobierają się z poprawną nazwą pliku.
- Akceptacja dnia z poziomu tygodnia, potem PDF bez przeładowania → dzień wychodzi jako zaakceptowany (dane z wyspy, nie z SSR). To samo dla cofnięcia akceptacji i usunięcia dnia.
- W trakcie generowania tygodnia i przy niezapisanej partii (`held`) przyciski są wyłączone, a komunikat o zapisie jest widoczny.
- **Wydruk na papierze** obu układów, także na drukarce czarno-białej: czytelność przy typowym tygodniu, szkic rozpoznawalny bez koloru, pusty dzień jawny. Wynik (drukarka, rozmiar czcionki week-per-page) odnotowany w `change.md`.
- Pierwsze kliknięcie w sieci z throttlingiem (DevTools „Fast 4G"): stan „Przygotowuję PDF…" widoczny, brak podwójnego pobrania przy szybkim dwukliku.

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed Fazą 4.

---

## Phase 4: E2E i mapa ryzyk

### Overview

Nowe ryzyko #11 w mapie testów i spec Playwright sprawdzający, że przycisk daje prawdziwy PDF o oczekiwanej strukturze z danych zapisanych w bazie.

### Changes Required:

#### 1. Mapa ryzyk

**File**: `context/foundation/test-plan.md`

**Intent**: Dopisać wiersz #11 do §2 Risk Map: „Wydruk tygodnia pokazuje dzień niezaakceptowany jako gotowy (albo odwrotnie), pomija dzień roboczy albo zawiera propozycje, których nie ma w bazie — nauczyciel oddaje na papierze plan, który nie odpowiada temu, co zatwierdził". Impact: Medium, Likelihood: Low. Źródło: `prd-v2.md` FR-020, `roadmap.md` S-13 §Risk (napięcie „oznaczony szkic i tak zostanie oddany"), `context/changes/week-print/`. Dopisać pod §7 notę: slice nie wprowadza snapshotów — treść wydruku asertowana na modelu, struktura PDF w e2e.

**Contract**: Dodanie wiersza nie zmienia treści wierszy #1–#10 (kryterium odporne na przerównanie tabeli — patrz lessons.md).

#### 2. Spec e2e

**File**: `tests/e2e/week-print.spec.ts` (nowy)

**Intent**: Wzorzec `seed.spec.ts` + `E2E-RULES.md`. Tydzień z `uniqueWeekStart()`, zasiany przez `seedDayPlan`: poniedziałek zaakceptowany, środa szkic, reszta pusta. `waitForIslands`, klik, `page.waitForEvent("download")`, odczyt pliku, `PDFDocument.load` z pdf-lib w teście. Sprzątanie `deleteSeededPlans`.

**Contract** — testy:

- „dzień na stronę": `suggestedFilename()` === `pdfFileName(weekStart, "day-per-page")`; bajty zaczynają się od `%PDF-`; liczba stron === 5; strony pionowe.
- „tydzień na stronie": nazwa pliku; 1 strona; strona pozioma.

Lokatory wyłącznie `getByRole("button", { name: … })`; zero `waitForTimeout`.

### Success Criteria:

#### Automated Verification:

- Spec przechodzi lokalnie (Supabase lokalna + dev server): `npx playwright test tests/e2e/week-print.spec.ts`
- Cały zestaw e2e bez regresji: `npm run test:e2e`
- Lint przechodzi: `npm run lint`
- Wiersze #1–#10 mapy ryzyk nietknięte (odporne na whitespace): `git diff -w master..HEAD -- context/foundation/test-plan.md | grep -E "^-\| *(10|[1-9]) *\|" | wc -l` zwraca `0`

#### Manual Verification:

- Spec uruchomiony dwa razy pod rząd i równolegle z resztą zestawu — bez migotania i bez kolizji danych.
- Odwrócenie jednej asercji (np. oczekiwane 4 strony) daje czerwony wynik — test potrafi paść.

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie; potem domknięcie slice'a (roadmap `S-13` → `done`, Open Roadmap Questions #1 i PRD §Open Questions #1 oznaczone jako rozstrzygnięte przez ten slice).

---

## Testing Strategy

### Unit Tests:

- Model: stany dni, etykiety, kolejność, pusty tydzień, nazwy plików.
- Układ: łamanie linii (spacje, `\n`, długie słowa), paginacja day-per-page z „(cd.)", dobór rozmiaru 11→7 pt, kontynuacja kolumn poniżej progu, ramki szkicu tylko na dniach `draft`, brak wyjścia poza marginesy.
- Renderer (node, prawdziwe fonty): nagłówek `%PDF`, liczba i orientacja stron, polskie znaki i emoji nie rzucają.

### Integration Tests:

- E2E pod ryzykiem #11: pobranie obu układów z danych zasianych w bazie, struktura PDF.

### Manual Testing Steps:

1. Tydzień z dniem zaakceptowanym, szkicem i pustym → pobierz oba PDF-y, wydrukuj na papierze (także cz-b).
2. Zaakceptuj/cofnij/usuń dzień z poziomu tygodnia → PDF bez przeładowania odzwierciedla zmianę.
3. Wygeneruj tydzień i nie zapisuj → przyciski PDF wyłączone z komunikatem.
4. Zedytuj opis do ~4000 znaków w jednym dniu → day-per-page ma stronę „(cd.)"; week-per-page zmniejsza czcionkę.
5. Opis z emoji → PDF się generuje.

## Performance Considerations

- pdf-lib (~200 KB gzip) i fontkit (~300 KB gzip) ładowane dynamicznie tylko po kliknięciu; dwa pliki TTF (~0,5 MB każdy) pobierane raz i cache'owane przez przeglądarkę. Początkowy bundle widoku tygodnia się nie zmienia.
- `subset: true` przy osadzaniu utrzymuje rozmiar wynikowego PDF w dziesiątkach KB.
- Dobór rozmiaru week-per-page to maks. 9 przebiegów układu na ~15 bloków tekstu — pomijalne.
- Zero dodatkowego CPU po stronie Workera.

## Migration Notes

Brak — żadnych zmian w schemacie ani danych.

## References

- Roadmap: `context/foundation/roadmap.md` §S-13, Open Roadmap Questions #1
- PRD: `context/foundation/prd-v2.md` FR-019, FR-020, US-02, §Kryteria sukcesu Secondary, §Open Questions #1
- Stan wyspy i reguła wyłączenia: `src/components/plan/WeekPlanBoard.tsx:81-117`, `:887-893`
- Odczyt tygodnia: `src/lib/services/day-plan-store.ts:638`
- Formatery: `src/lib/day-plan-dates.ts:61`, `:167`, `:212`
- Wzorzec czystego modułu + testów: `src/lib/week-day-controls.ts`, `src/lib/day-preview.ts`
- Wzorzec e2e: `tests/e2e/seed.spec.ts`, `tests/e2e/E2E-RULES.md`, `tests/e2e/week-day-controls.spec.ts`
- Poprzedni plan tej samej rodziny: `context/archive/2026-09-23-month-day-preview/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Model wydruku i silnik układu

#### Automated

- [x] 1.1 Testy modelu i układu przechodzą
- [x] 1.2 Pełen zestaw jednostkowy przechodzi
- [x] 1.3 Lint przechodzi
- [x] 1.4 Moduły Fazy 1 nie importują pdf-lib

#### Manual

- [ ] 1.5 Przegląd testów: asercje padają po odwróceniu warunku

### Phase 2: Renderer PDF i fonty

#### Automated

- [ ] 2.1 Test renderowania przechodzi
- [ ] 2.2 Pełen zestaw jednostkowy przechodzi
- [ ] 2.3 Lint przechodzi
- [ ] 2.4 Build przechodzi
- [ ] 2.5 Fonty i licencja są w repo

#### Manual

- [ ] 2.6 Plik z testu obejrzany: polskie znaki, szkic, pusty dzień, układ poziomy

### Phase 3: Przyciski PDF w widoku tygodnia

#### Automated

- [ ] 3.1 Lint przechodzi
- [ ] 3.2 Pełen zestaw jednostkowy przechodzi
- [ ] 3.3 Build przechodzi
- [ ] 3.4 pdf-lib nie jest importowany statycznie poza rendererem

#### Manual

- [ ] 3.5 Oba PDF-y pobierają się z poprawną nazwą
- [ ] 3.6 PDF odzwierciedla operacje z wyspy bez przeładowania
- [ ] 3.7 Przyciski wyłączone przy zajętości i niezapisanej partii
- [ ] 3.8 Wydruk na papierze obu układów (także cz-b), wynik w change.md
- [ ] 3.9 Stan ładowania przy throttlingu, brak podwójnego pobrania

### Phase 4: E2E i mapa ryzyk

#### Automated

- [ ] 4.1 Spec week-print przechodzi lokalnie
- [ ] 4.2 Cały zestaw e2e bez regresji
- [ ] 4.3 Lint przechodzi
- [ ] 4.4 Wiersze #1–#10 mapy ryzyk nietknięte

#### Manual

- [ ] 4.5 Spec stabilny przy powtórzeniu i równoległym przebiegu
- [ ] 4.6 Odwrócona asercja daje czerwony wynik
