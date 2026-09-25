# Podgląd dnia w siatce miesiąca — plan implementacji

## Overview

`S-07` (`month-day-preview`, FR-010, FR-011, US-03). Nauczyciel zatrzymuje wskaźnik albo fokus klawiatury na kafelku zaplanowanego dnia i widzi — bez opuszczania siatki miesiąca — aktywności tego dnia w popoverze tylko do odczytu. Kafelek przestaje ucinać podtytuł dnia po jednej linii: temat dostaje dwie linie w szerszej siatce, przy niezmienionej wysokości kafelka.

## Current State Analysis

- Siatka to czysty komponent Astro bez stanu (`src/components/plan/MonthGrid.astro`). Kafelek jest `<a href="/plan?date=…">` z `aria-label` z `tileLabel` (`MonthGrid.astro:69-75`); hasło i temat są w dwóch liniach, obie z `truncate` (`:127`, `:129`), a pełny tekst niesie wyłącznie natywny atrybut `title` (`:126`).
- Kontener strony ma `max-w-4xl` (`src/pages/plan/month.astro:45`). Przy kolumnie „Zaplanuj tydzień" (`w-28`) daje to kafelek ~95 px szerokości i `min-h-16` wysokości — około 15 znaków na linię 10 px.
- Ścieżka odczytu dnia już istnieje: `GET /api/day-plan?date=` (`src/pages/api/day-plan/index.ts:25`) zwraca plan i jego żywą partię aktywności w kopercie `day-plan-http.ts`, z polskimi komunikatami błędów; 404 znaczy „dzień bez planu". Trasa jest objęta testem własności (ryzyko #4, `tests/e2e/day-plan-ownership.spec.ts`).
- Strażniki ciała `isDayPlanBody` / `isErrorBody` (`src/lib/day-plan-guards.ts:44`, `:155`) są bez zod, więc można je nieść do wyspy.
- `DayPlanSummary` (`src/types.ts:100-117`) mówi siatce, które dni mają plan — dni bez planu nie potrzebują żadnego żądania.
- Vitest działa w środowisku `node` bez renderowania komponentów (`vitest.config.ts:14`). Logikę, którą trzeba sprawdzić, trzyma się w czystych modułach `src/lib/` (precedens: `week-day-controls.ts`, `week-generation.ts`).
- Temat ma górną granicę 200 znaków (`THEME_MAX`), ale prompt szkicu tygodnia żąda „krótkiego zawężenia hasła" (`src/lib/services/prompts/week-outline.pl.md:30`) — realnie 20–60 znaków.

## Desired End State

- Najechanie myszą na kafelek dnia z planem i zatrzymanie się na nim otwiera — po krótkim opóźnieniu — popover zakotwiczony przy kafelku: data, stan (zaakceptowany/roboczy), hasło, pełny temat i trzy aktywności (tytuł + początek opisu). To samo daje fokus klawiatury (`:focus-visible`). Escape zamyka. Kliknięcie/Enter nadal otwiera `/plan?date=`.
- Przeciągnięcie kursora przez rząd nie wysyła żądania za każdy mijany dzień; porzucone żądanie jest anulowane; dzień raz obejrzany nie jest pobierany ponownie w tym samym widoku strony.
- Kafelek pokazuje temat w maksymalnie dwóch liniach; wysokość siatki się nie zmienia, więc miesiąc mieści się bez przewijania wszędzie tam, gdzie mieścił się dotąd.
- Weryfikacja: testy jednostkowe modułu podglądu (fałszywe zegary), trzy testy e2e pod ryzykiem #10, pomiar wysokości siatki przed i po zmianie.

### Key Discoveries:

- `GET /api/day-plan?date=` + `isDayPlanBody` to gotowa ścieżka odczytu — żadnej nowej trasy ani migracji (`src/pages/api/day-plan/index.ts:25-56`).
- `tileLabel` przycina każdy człon do 80 znaków, bo czytnik ekranu czyta nazwę w całości (`MonthGrid.astro:32-44`). Ten sam problem wraca w popoverze: opis ucięty tylko przez CSS zostaje w DOM-ie w całości (do 4000 znaków × 3) i czytnik przeczyta go przez `aria-describedby`.
- Kafelki spoza miesiąca mają `opacity-40` (`MonthGrid.astro:113`), które tworzy kontekst nakładania — popover wyrenderowany **wewnątrz** takiego kafelka byłby półprzezroczysty.
- `tests/e2e/support/hydration.ts` — `waitForIslands(page)` jest obowiązkowe przed pierwszą interakcją z wyspą; `seedDayPlan` + `activitiesFor(stamp)` dają dniom rozróżnialne tytuły aktywności.
- `test-plan.md` §7 wyklucza snapshoty UI z zastrzeżeniem „re-evaluate, jeśli podgląd dnia w siatce (S-07) wprowadzi stan, którego nie widać inaczej niż wizualnie". Popover z `role="tooltip"` jest widoczny w drzewie dostępności, więc wykluczenie może zostać — ale trzeba to zapisać, bo warunek wprost wskazuje ten slice.

## What We're NOT Doing

- **Edycji z poziomu podglądu** — podgląd jest wyłącznie do odczytu (PRD v2 §Non-Goals).
- **Wstępnego pobierania miesiąca ani tygodnia** — dane dociągane na żądanie (PRD v2 §Non-Goals).
- **Podglądu na dotyku.** Dotknięcie kafelka otwiera dzień, jak dziś — podgląd jest akceleratorem, nie jedyną drogą do treści (decyzja 2026-08-30).
- **Nowej trasy API, migracji, zmian w `readMonthSummary` i `DayPlanSummary`.**
- **Przebudowy siatki na szerokości mobilnej.** Przy 375 px kafelek ma ~22 px i to się nie zmienia — `max-w-6xl` działa tylko tam, gdzie jest miejsce. Istniejący ogon z `next-actions.md` („Pozycja 1.11").
- **Unieważniania pamięci podręcznej między kartami i po powrocie przez bfcache.** Pamięć żyje tyle, co widok strony; po edycji dnia w innej karcie podgląd jest nieaktualny do przeładowania — tak samo jak kolory kafelków renderowane serwerowo.
- **Testów wizualnych i snapshotów** (`test-plan.md` §7). Ograniczenie wysokości siatki sprawdzamy pomiarem ręcznym.
- **Zmian w widokach dnia i tygodnia.**

## Implementation Approach

Od środka na zewnątrz, tak jak `S-11`: najpierw czysty moduł z całą logiką czasu i sieci, sprawdzony fałszywymi zegarami (Faza 1). Potem przeniesienie siatki do wyspy React razem ze zmianą układu kafelka — bez podglądu, żeby migrację Astro → React dało się ocenić osobno (Faza 2). Potem popover podpięty do modułu (Faza 3). Na końcu e2e pod nowym ryzykiem #10 (Faza 4).

Podział odpowiedzialności: `src/lib/day-preview.ts` wie **kiedy** i **co** pobrać; hook `useDayPreview` łączy go z Reactem; `MonthGrid.tsx` wie **gdzie** jest kafelek i tłumaczy zdarzenia wskaźnika i fokusu na `show`/`hide`; `DayPreview.tsx` tylko renderuje stan.

## Critical Implementation Details

**Popover obok linku, nie w nim — w opakowaniu kafelka.** Każdy kafelek z planem dostaje `relative` opakowanie; `<a>` i popover są w nim rodzeństwem. Handlery wskaźnika siedzą na opakowaniu, więc przejście kursora z kafelka na popover nie wywołuje `pointerleave` — popover jest „hoverable" (WCAG 1.4.13) bez okresu karencji i bez drugiego timera. Popover nie może być dzieckiem `<a>`: `opacity-40` kafelka spoza miesiąca zrobiłoby go półprzezroczystym, a `opacity` musi zostać na `<a>`, nie na opakowaniu.

**Tylko `pointerType === "mouse"`.** Dotyk emituje `pointerenter` przed `click`. Bez filtra każde dotknięcie uruchamia timer i żądanie, które nawigacja zaraz porzuca.

**Fokus otwiera podgląd tylko przy `:focus-visible`.** Kliknięcie myszą też ustawia fokus na linku; `onFocus` sprawdza `event.currentTarget.matches(":focus-visible")`, inaczej każde kliknięcie mignęłoby popoverem przed nawigacją.

**Anulowanie nie jest błędem.** Odrzucenie `fetch` z `AbortError` nie zmienia stanu i nie trafia do pamięci podręcznej. Traktowane jak awaria, pokazałoby „Nie udało się wczytać" na dniu, z którego nauczyciel już zszedł.

**Opis przycinany w tekście, nie tylko w CSS.** `aria-describedby` każe czytnikowi ekranu przeczytać cały popover. `line-clamp` ucina wyłącznie wizualnie, więc opis musi przejść przez `clipText` przed renderem (ta sama racja co `clipForLabel`, `MonthGrid.astro:32-39`).

---

## Phase 1: Logika podglądu i teksty

### Overview

Czysty moduł podglądu (opóźnienie → pobranie → pamięć podręczna, anulowanie, „wygrywa ostatni wskazany dzień", błędy poza pamięcią podręczną) i moduł tekstów kafelka. Bez UI. Faza nadaje się do `/10x-tdd`.

### Changes Required:

#### 1. Moduł podglądu dnia

**File**: `src/lib/day-preview.ts` (nowy)

**Intent**: Cała logika czasu i sieci podglądu w jednym module bez Reacta i bez zod. Warunek jakościowy PRD („podgląd zachowuje się pod szybkim ruchem wskaźnika") staje się dzięki temu sprawdzalny fałszywymi zegarami w środowisku `node`. Wzorzec: `week-day-controls.ts` (`S-11`).

**Contract**: Kształt, od którego zależą Fazy 3 i 4 — `getState`/`subscribe` pasują do `useSyncExternalStore`:

```ts
export const PREVIEW_OPEN_DELAY_MS = 300;

export type DayPreviewState =
  | { readonly status: "closed" }
  | { readonly status: "loading"; readonly date: string }
  | { readonly status: "ready"; readonly date: string; readonly view: DayPlanView }
  | { readonly status: "empty"; readonly date: string }
  | { readonly status: "error"; readonly date: string; readonly message: string };

export interface DayPreview {
  show(date: string): void; // wskaźnik lub fokus zatrzymał się na dniu z planem
  hide(): void; // wskaźnik opuścił kafelek+popover, fokus opuścił kafelek, Escape
  dispose(): void; // odmontowanie — czyści timer i przerywa żądanie; kontroler zostaje używalny
  getState(): DayPreviewState;
  subscribe(listener: () => void): () => void;
}

export function createDayPreview(): DayPreview;
```

Semantyka:

- `show(d)`: jeśli `d` jest już pokazywany albo czeka na timer — nic. W przeciwnym razie zamyka bieżący podgląd (czyści timer, przerywa żądanie w locie, stan `closed`) i startuje timer `PREVIEW_OPEN_DELAY_MS`. Opóźnienie obowiązuje także dla dni w pamięci podręcznej — to próg intencji, nie tylko ochrona sieci. Po odliczeniu: dzień w pamięci → `ready`/`empty` bez żądania; poza pamięcią → `loading` i `fetch("/api/day-plan?date=" + d, { signal })`.
- `hide()`: czyści timer (brak żądania, jeśli nie odliczył), przerywa żądanie w locie, stan `closed`.
- Wynik żądania: `404` → do pamięci jako „brak planu", stan `empty`. `ok` + `isDayPlanBody` → do pamięci, stan `ready`. Pozostałe → stan `error` z `body.error` (gdy `isErrorBody`) albo z komunikatem ogólnym „Nie udało się wczytać podglądu.", **bez** zapisu do pamięci. `AbortError` → nic.
- Stan jest emitowany tylko wtedy, gdy `d` jest nadal dniem docelowym. Spóźniona odpowiedź dnia porzuconego może trafić do pamięci, ale nigdy nie trafi na ekran innego dnia.
- Timery przez globalne `setTimeout`/`clearTimeout`, sieć przez globalne `fetch` — żeby testy mogły użyć `vi.useFakeTimers()` i `vi.stubGlobal("fetch", …)` (`unstubGlobals: true` już jest w konfiguracji).

#### 2. Teksty kafelka i podglądu

**File**: `src/lib/month-grid.ts` (nowy); `src/components/plan/MonthGrid.astro` (frontmatter)

**Intent**: Przenieść pomocniki tekstowe siatki z frontmattera Astro do modułu, z którego skorzystają zarówno Astro (do Fazy 2), jak i wyspa (od Fazy 2). Dołożyć ogólne przycinanie tekstu dla popovera. Komentarze idą razem z funkcjami.

**Contract**: Przeniesione bez zmiany zachowania: `dayNumber`, `LABEL_PART_MAX` (80), `clipForLabel`, `joinText`, `tileText`, `tileLabel`. Nowe: `clipText(text: string, max: number): string` (ten sam algorytm co `clipForLabel`: `slice(0, max - 1).trimEnd() + "…"`; `clipForLabel` staje się jego przypadkiem szczególnym) i `PREVIEW_DESCRIPTION_MAX = 160`. `MonthGrid.astro` importuje przeniesione funkcje zamiast definiować własne kopie.

#### 3. Testy

**File**: `src/lib/day-preview.test.ts`, `src/lib/month-grid.test.ts` (nowe)

**Intent**: Każdy warunek z PRD §Warunki jakościowe, który mieszka w logice, dostaje asercję, która potrafi paść.

**Contract**: `day-preview.test.ts`, fałszywe zegary + atrapa `fetch`:

- przed upływem opóźnienia żadne żądanie; po upływie dokładnie jedno, na URL dnia;
- `hide()` przed upływem opóźnienia → żadne żądanie, nawet po przesunięciu zegara daleko w przód;
- przeciągnięcie: `show(A)` … `show(E)` w odstępach krótszych od opóźnienia → żądanie wyłącznie dla E;
- dzień obejrzany, zamknięty i wskazany ponownie → `ready` bez drugiego żądania;
- `hide()` w trakcie żądania → sygnał przekazany do `fetch` jest przerwany, stan `closed`, dzień nie trafia do pamięci (kolejne `show` pobiera ponownie);
- „wygrywa ostatni": atrapa ignorująca sygnał, odpowiedź A przychodzi po `show(B)` → stan nigdy nie niesie widoku A pod datą B;
- `404` → `empty`, trafia do pamięci; `503` z ciałem błędu → `error` z `body.error`, nie trafia do pamięci; odrzucenie sieciowe → `error` z komunikatem ogólnym; ciało nieprzechodzące `isDayPlanBody` (pusta tablica aktywności) → `error`;
- `dispose()` → `vi.getTimerCount() === 0`, żądanie przerwane.

`month-grid.test.ts`: `tileLabel` dla dnia bez planu, z tematem i bez, z przycięciem członu powyżej 80 znaków; `clipText` przepuszcza tekst krótszy od limitu i nie zostawia spacji przed „…".

### Success Criteria:

#### Automated Verification:

- Nowe testy przechodzą: `npm test -- src/lib/day-preview.test.ts src/lib/month-grid.test.ts`
- Cały zestaw jednostkowy przechodzi: `npm test`
- Lint przechodzi: `npm run lint`
- Moduły nie ciągną zod ani Reacta do paczki klienta: `grep -nE 'from "(zod|react)"' src/lib/day-preview.ts src/lib/month-grid.ts` zwraca pusto — sprawdzone na czerwono tymczasowym dopisaniem `import { z } from "zod";`
- Celowe psucie A: `hide()` nie czyści timera → test przeciągnięcia czerwony; zmiana wycofana
- Celowe psucie B: pominięte sprawdzenie pamięci podręcznej → test ponownego wskazania czerwony; zmiana wycofana
- Celowe psucie C: usunięte sprawdzenie dnia docelowego przed emisją → test „wygrywa ostatni" czerwony; zmiana wycofana
- Celowe psucie D: wynik `error` zapisywany do pamięci → test ponowienia po błędzie czerwony; zmiana wycofana

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na potwierdzenie przed Fazą 2.

---

## Phase 2: Siatka jako wyspa i pełny podtytuł (FR-011)

### Overview

`MonthGrid` przechodzi z Astro do Reacta — bez podglądu, z identycznym zachowaniem — a kafelek dostaje temat w dwóch liniach przy stałej wysokości, w siatce poszerzonej do `max-w-6xl`. **Pomiar wysokości siatki przed zmianą jest pierwszym krokiem tej fazy.**

### Changes Required:

#### 1. Pomiar wyjściowy

**Intent**: Twarde ograniczenie z PRD („miesiąc mieści się bez przewijania na tej samej szerokości ekranu co dziś") potrzebuje liczby sprzed zmiany. Bez niej kryterium 2.8 nie ma z czym porównać.

**Contract**: Na `master`, przed pierwszą edycją: `/plan/month?month=2026-11` (sześć rzędów), okno o szerokości 1280 i 1440 px; w konsoli DevTools wysokość karty siatki (`getBoundingClientRect().height` elementu `main .rounded-2xl`). Obie liczby wpisane obok pozycji 2.7 w Progress.

#### 2. Siatka jako komponent React

**File**: `src/components/plan/MonthGrid.tsx` (nowy); `src/components/plan/MonthGrid.astro` (usunięty)

**Intent**: Faza 3 potrzebuje handlerów zdarzeń na kafelkach, a CLAUDE.md kieruje takie elementy do Reacta. Migracja idzie osobno, żeby jej diff dało się ocenić jako „to samo, tylko w TSX" plus zmiana układu kafelka.

**Contract**: Propsy jak w wersji Astro: `{ month: string; weeks: readonly string[]; summaries: readonly DayPlanSummary[] }`. `class:list` → `cn()`. Kafelek nadal jest `<a href="/plan?date=…" aria-label={tileLabel(…)}>`, „Zaplanuj tydzień" i legenda bez zmian. Komentarz nagłówkowy przestaje mówić „display only - no state". Układ kafelka:

- wysokość stała `h-16` zamiast `min-h-16` — niezmiennik: wysokość rzędu nie zależy od treści;
- hasło: jedna linia, `truncate`, jak dziś;
- temat: `line-clamp-2` + `break-words` zamiast `truncate`; interlinia dobrana tak, żeby numer dnia i trzy linie tekstu mieściły się w `h-16` bez przelewania;
- `title={tileText(summary)}` **zostaje** do Fazy 3 — do tego czasu to jedyne miejsce, w którym przeżywa pełny tekst dłuższego tematu.

#### 3. Strona miesiąca

**File**: `src/pages/plan/month.astro`

**Intent**: Zahydrować siatkę i dać kafelkom szerokość, której nie mają.

**Contract**: `<MonthGrid client:load month={month} weeks={weeks} summaries={summaries} />`; `<main>` z `max-w-4xl` na `max-w-6xl`. Nic więcej na stronie się nie zmienia.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Testy jednostkowe przechodzą: `npm test`
- Plik Astro usunięty: `test ! -e src/components/plan/MonthGrid.astro` (czerwone przed fazą)
- Siatka hydrowana: `grep -cE "<MonthGrid [^>]*client:load" src/pages/plan/month.astro` zwraca `1` (przed fazą `0` — dziś `<MonthGrid month={month} … />` bez dyrektywy; wzorzec niezależny od kolejności atrybutów)
- Zestaw e2e przechodzi bez zmian: `npm run test:e2e` (`auth.setup.ts` ląduje na `/plan/month`)

#### Manual Verification:

- Pomiar wyjściowy wykonany i wpisany przed pierwszą edycją (1280 px: ___, 1440 px: ___)
- Po zmianie wysokość karty siatki dla `2026-11` jest równa pomiarowi wyjściowemu (±1 px) przy obu szerokościach
- Tydzień wygenerowany z tematami: temat do ~40 znaków widoczny w całości przy 1440 px; temat dłuższy ucięty po dwóch liniach wielokropkiem, kafelek tej samej wysokości co sąsiedzi
- Przy 1024 px siatka nie wychodzi poza kartę w poziomie
- Kliknięcie kafelka otwiera `/plan?date=`, „Zaplanuj tydzień" otwiera tydzień, legenda na miejscu, brak błędów hydracji w konsoli

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed Fazą 3.

---

## Phase 3: Podgląd dnia (FR-010)

### Overview

Popover zakotwiczony przy kafelku, podpięty do modułu z Fazy 1 przez hook; wejście myszą i klawiaturą, Escape, stany ładowania, pusty i błędu. Atrybut `title` znika.

### Changes Required:

#### 1. Hook

**File**: `src/components/hooks/useDayPreview.ts` (nowy — katalog też nowy, zgodnie z CLAUDE.md)

**Intent**: Cienki most kontroler ↔ React; cała logika zostaje w `day-preview.ts`.

**Contract**: `useDayPreview(): { state: DayPreviewState; show(date: string): void; hide(): void }`. Kontroler tworzony raz na wyspę (`useState(() => createDayPreview())`), stan przez `useSyncExternalStore(subscribe, getState, () => CLOSED)` — migawka serwerowa to `closed`. `dispose` w sprzątaniu efektu. Dopóki stan nie jest `closed`, nasłuch `keydown` na `document`: Escape → `hide()`.

#### 2. Popover

**File**: `src/components/plan/DayPreview.tsx` (nowy)

**Intent**: Renderuje jeden niezamknięty stan podglądu. Bez logiki i bez własnego stanu.

**Contract**: Propsy: `state` (stan różny od `closed`) i `placement: { vertical: "below" | "above"; horizontal: "start" | "end" }`. Element `id="day-preview"`, `role="tooltip"`, szerokość stała ~18rem, bez wewnętrznego przewijania, nad sąsiednimi kafelkami (`absolute`, `z-index`). Treść:

- `loading`: `formatPlanDate(date)` i „Wczytuję aktywności…";
- `ready`: `formatPlanDate(date)`, stan „zaakceptowany"/„roboczy" z `view.plan.accepted_at`, hasło przez `clipForLabel`, temat w całości (`THEME_MAX` go ogranicza), lista numerowana aktywności: tytuł + opis przez `clipText(…, PREVIEW_DESCRIPTION_MAX)` i `line-clamp-3`. Nagłówek bierze dane z pobranego planu, nie z `DayPlanSummary`, żeby jedno źródło mówiło o całej zawartości;
- `empty`: „Ten dzień nie ma już planu. Odśwież stronę, żeby zobaczyć aktualny miesiąc.";
- `error`: `message` i „Kliknij dzień, żeby otworzyć pełny widok.".

#### 3. Podpięcie w siatce

**File**: `src/components/plan/MonthGrid.tsx`; `src/lib/month-grid.ts`; `src/lib/month-grid.test.ts`

**Intent**: Przetłumaczyć wskaźnik i fokus na `show`/`hide` dla dni z planem i wyrenderować popover przy aktywnym dniu. Zastąpić natywny `title`.

**Contract**:

- kafelek z planem dostaje opakowanie `relative` z `onPointerEnter`/`onPointerLeave` (tylko `pointerType === "mouse"`) → `show(date)`/`hide()`; `<a>` dostaje `onFocus` (tylko przy `:focus-visible`) → `show(date)` i `onBlur` → `hide()`;
- `aria-describedby="day-preview"` na `<a>` wyłącznie wtedy, gdy popover jest otwarty dla tego dnia;
- popover renderowany tylko w opakowaniu dnia z `state.date`, jako rodzeństwo `<a>`; `opacity-40` zostaje na `<a>`;
- rozmieszczenie z indeksów, nie z pomiaru DOM: rzędy w dolnej połowie miesiąca (`rowIndex >= Math.ceil(weeks.length / 2)`) → `above`, pozostałe → `below`; kolumny 0–3 (pon–czw) → `start`, 4–6 (pt–nd) → `end`;
- dni bez planu: bez handlerów, bez opakowania — żadnego popovera i żadnego żądania;
- `title` usunięty z kafelka, `tileText` usunięty z `month-grid.ts` razem ze swoimi testami.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Testy jednostkowe przechodzą: `npm test`
- Natywny dymek zniknął: `grep -rn "tileText(" src/` zwraca pusto (przed fazą: wywołanie w `MonthGrid.tsx`)

#### Manual Verification:

- Zatrzymanie myszy na dniu z planem → po chwili popover z datą, stanem, hasłem, pełnym tematem i trzema aktywnościami; przejście kursora na popover go nie zamyka; zejście z obu zamyka
- Szybkie przeciągnięcie kursora przez rząd pięciu zaplanowanych dni (DevTools → Network): żadnego żądania `/api/day-plan?date=` za mijane dni, jedno za dzień, na którym kursor stanął
- Ponowne wskazanie tego samego dnia: popover bez nowego żądania
- Klawiatura: Tab po kafelkach otwiera popover zaplanowanego dnia z fokusem, Escape zamyka, Enter otwiera dzień
- Kliknięcie myszą w kafelek nawiguje bez mignięcia popovera
- Dzień bez planu: brak popovera i brak żądania
- Rzędy dolne otwierają popover w górę, kolumny pt–nd wyrównują go do prawej; na kafelku spoza miesiąca popover jest w pełni nieprzezroczysty
- DevTools → Offline: wskazanie dnia daje komunikat błędu w popoverze; po powrocie online ponowne wskazanie ładuje treść (błąd nie został zapamiętany)
- DevTools → emulacja dotyku: dotknięcie kafelka otwiera dzień, popover się nie pokazuje

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed Fazą 4.

---

## Phase 4: Testy e2e i mapa ryzyk

### Overview

Ryzyko #10 w `test-plan.md` i trzy testy Playwright, każdy przejechany na czerwono celowym psuciem. Logika czasu jest już pokryta w Fazie 1; e2e dowodzi podpięcia jej do kafelków i warunku klawiatury, którego nie ma gdzie indziej sprawdzić.

### Changes Required:

#### 1. Ryzyko #10 w mapie ryzyk

**File**: `context/foundation/test-plan.md`

**Intent**: `E2E-RULES.md` wymaga, żeby nazwa testu nazywała ryzyko z numerem. Precedens: `S-12` dopisał #8, `S-11` — #9.

**Contract**:

- Nowy wiersz #10 w §2 Risk Map: podgląd dnia w siatce miesiąca pokazuje treść innego dnia niż ten, na którym zatrzymał się nauczyciel, albo przeciągnięcie kursora przez rząd wysyła żądanie za każdy mijany dzień. Impact Medium (odczyt, bez utraty danych — ale błędna treść pod datą prowadzi do błędnych decyzji o planie), Likelihood Medium. Źródła: `roadmap.md` S-07 §Risk, `prd-v2.md` §Warunki jakościowe zmiany.
- Nowy wiersz #10 w §Risk Response Guidance. Co musi być prawdą: popover pokazuje wyłącznie dzień, na którym wskaźnik lub fokus się zatrzymał; mijane dni nie są pobierane; dzień obejrzany nie jest pobierany ponownie; klawiatura dochodzi do tej samej treści co mysz. Fałszywe przekonanie: „kafelek jest w DOM-ie pod swoją datą, więc popover pokazuje tę datę" — treść wyznacza kolejność odpowiedzi, nie położenie kafelka. Typ: unit (czas) + e2e (podpięcie, klawiatura). Antywzorzec: test z jednym zasianym dniem — strukturalnie nie wykryje treści sąsiada.
- §7, punkt o snapshotach: dopisek, że warunek „re-evaluate przy S-07" został rozpatrzony 2026-09 — stan podglądu jest asertowalny przez `role="tooltip"`, więc wykluczenie zostaje.
- Tabela §3 Phased Rollout bez zmian (pokrycie spoza rolloutu, jak przy #8 i #9).

#### 2. Testy

**File**: `tests/e2e/month-day-preview.spec.ts` (nowy)

**Intent**: Dowód, że podgląd trafia w dzień, na którym się zatrzymano, że przeciągnięcie nie zalewa serwera i że klawiatura dochodzi do treści.

**Contract**: Wzorzec i reguły: `seed.spec.ts`, `E2E-RULES.md`. `waitForIslands` przed pierwszą interakcją; sprzątanie w `afterEach` po `id` zasianych planów. Dni zasiane w tygodniu z `uniqueWeekStart()`, każdy z własnym `uniqueStamp()` (rozróżnialne tytuły). Strona: `/plan/month?month=<miesiąc poniedziałku>`. Kafelek: `getByRole("link", { name: new RegExp(\`^Plan na ${date} \`) })`, popover: `getByRole("tooltip")`. Żądania zbierane z `page.on("request")` po URL `/api/day-plan?date=`. Żadnego `waitForTimeout`.

- **„ryzyko #10 — podgląd z klawiatury pokazuje aktywności dnia z fokusem"**: poniedziałek i wtorek zasiane. Fokus na poniedziałku, `Tab` → fokus na wtorku. Popover zawiera tytuł aktywności wtorku i nie zawiera tytułu poniedziałku. Escape → popover niewidoczny.
- **„ryzyko #10 — przeciągnięcie kursora przez rząd pobiera wyłącznie dzień, na którym kursor stanął"**: pn–pt zasiane. `page.mouse.move` przez środki kafelków pn → pt, bez zatrzymań. Czekanie na popover z tytułem piątku (widoczny ⇒ opóźnienie piątku minęło, a timery wcześniejszych dni wystartowały przed nim, więc nieanulowane już by strzeliły). Zebrane żądania to dokładnie `[piątek]`; popover nie zawiera tytułu czwartku.
- **„ryzyko #10 — dzień obejrzany drugi raz nie jest pobierany ponownie"**: jeden dzień zasiany. Wskazanie → popover widoczny; kursor na nagłówek „Plan miesiąca" → popover ukryty; ponowne wskazanie → popover widoczny; żądań o ten dzień: dokładnie 1.

### Success Criteria:

#### Automated Verification:

- Nowe testy przechodzą: `npm run test:e2e -- tests/e2e/month-day-preview.spec.ts` _(lokalna Supabase uruchomiona; **nie** zaraz po `npm run build` na reużywanym serwerze dev — pułapka z `next-actions.md` §„Otwarte ogony po `edit-unaccepts-day`")_
- Cały zestaw e2e przechodzi: `npm run test:e2e`
- Celowe psucie A: `hide()` nie czyści timera → test przeciągnięcia czerwony; zmiana wycofana
- Celowe psucie B: pominięta pamięć podręczna → test ponownego wskazania czerwony; zmiana wycofana
- Celowe psucie C: usunięty `onFocus` z kafelka → test klawiatury czerwony; zmiana wycofana
- Lint przechodzi: `npm run lint`

#### Manual Verification:

- Wiersze #10 w §2 i §Risk Response Guidance `test-plan.md` czytają się spójnie z #8 i #9; dopisek w §7 jest na miejscu; nazwy testów zawierają numer ryzyka

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie.

---

## Testing Strategy

### Unit Tests:

- `day-preview.test.ts` — opóźnienie, anulowanie timera i żądania, pamięć podręczna, „wygrywa ostatni", klasyfikacja odpowiedzi (404 / błąd z ciałem / sieć / ciało niepoprawne), błędy poza pamięcią, `dispose`.
- `month-grid.test.ts` — `tileLabel` (bez zmian zachowania po przeniesieniu), `clipText`.

### Integration Tests:

- Brak nowych. `GET /api/day-plan?date=` się nie zmienia; własność tej ścieżki pokrywa już `day-plan-ownership.spec.ts` (ryzyko #4).

### E2E Tests:

- Trzy testy pod ryzykiem #10 (Faza 4): klawiatura + właściwy dzień, budżet żądań przy przeciągnięciu + właściwy dzień, pamięć podręczna.

### Manual Testing Steps:

1. Pomiar wysokości siatki `2026-11` przy 1280 i 1440 px przed Fazą 2 i po niej — równy.
2. Tydzień z tematami różnej długości — krótki w całości, długi ucięty po dwóch liniach; pełny tekst w popoverze.
3. Mysz: zatrzymanie, przejście na popover, zejście, przeciągnięcie przez rząd (Network), ponowne wskazanie.
4. Klawiatura: Tab, Escape, Enter.
5. Offline → błąd; online → ponowne wskazanie ładuje.
6. Emulacja dotyku: dotknięcie nawiguje, bez popovera.

## Performance Considerations

Jedno pobranie podglądu to `supabase.auth.getUser()` w middleware plus dwa zapytania w `readDayPlan`. Opóźnienie, anulowanie i pamięć podręczna ograniczają liczbę pobrań do liczby różnych dni, na których nauczyciel się zatrzymał — najwyżej 42 na widok strony, realnie kilka. Hydracja siatki (~42 kafelki) jest pomijalna; do czasu hydracji kafelki działają jako zwykłe linki.

## Migration Notes

Brak zmian schematu i danych. Wycofanie to `git revert` — zmiana dotyka wyłącznie widoku miesiąca i nowych modułów.

Przed pierwszym commitem: gałąź `feat/month-day-preview` (CLAUDE.md §Git — slice po `S-03`).

## References

- Roadmapa: `context/foundation/roadmap.md` §S-07 (decyzje zastane, warunki brzegowe)
- PRD: `context/foundation/prd-v2.md` FR-010, FR-011, US-03, §Warunki jakościowe zmiany, §Non-Goals
- Decyzja o wzorcu interakcji (2026-08-30): `context/foundation/archive/2026-09-19-roadmap.md` §S-07
- Poprzedni slice, wzorzec faz i e2e: `context/archive/2026-09-23-week-level-plan-controls/plan.md`
- Siatka dziś: `src/components/plan/MonthGrid.astro`; ścieżka odczytu: `src/pages/api/day-plan/index.ts:25`
- Zasady e2e: `tests/e2e/E2E-RULES.md`, `tests/e2e/support/hydration.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Logika podglądu i teksty

#### Automated

- [x] 1.1 Nowe testy przechodzą: `npm test -- src/lib/day-preview.test.ts src/lib/month-grid.test.ts` — 5dea56e
- [x] 1.2 Cały zestaw jednostkowy przechodzi: `npm test` — 5dea56e
- [x] 1.3 Lint przechodzi: `npm run lint` — 5dea56e
- [x] 1.4 Moduły nie ciągną zod ani Reacta do paczki klienta (grep sprawdzony na czerwono) — 5dea56e
- [x] 1.5 Celowe psucie A: `hide()` nie czyści timera → test przeciągnięcia czerwony; wycofane — 5dea56e
- [x] 1.6 Celowe psucie B: pominięta pamięć podręczna → test ponownego wskazania czerwony; wycofane — 5dea56e
- [x] 1.7 Celowe psucie C: bez sprawdzenia dnia docelowego → test „wygrywa ostatni" czerwony; wycofane — 5dea56e
- [x] 1.8 Celowe psucie D: błąd zapisywany do pamięci → test ponowienia po błędzie czerwony; wycofane — 5dea56e

### Phase 2: Siatka jako wyspa i pełny podtytuł (FR-011)

#### Automated

- [x] 2.1 Lint przechodzi: `npm run lint` — 399e4b3
- [x] 2.2 Build przechodzi: `npm run build` — 399e4b3
- [x] 2.3 Testy jednostkowe przechodzą: `npm test` — 399e4b3
- [x] 2.4 Plik Astro usunięty: `test ! -e src/components/plan/MonthGrid.astro` — 399e4b3
- [x] 2.5 Siatka hydrowana: `grep -cE "<MonthGrid [^>]*client:load" src/pages/plan/month.astro` zwraca `1` — 399e4b3
- [x] 2.6 Zestaw e2e przechodzi bez zmian: `npm run test:e2e` — 399e4b3

#### Manual

- [ ] 2.7 Pomiar wyjściowy wykonany i wpisany przed pierwszą edycją (1280 px: ___, 1440 px: ___) _(agent, 2026-09-25, pusty listopad konta A, przed edycją: 558 px przy 1024/1280/1440; po zmianie: 558 px przy wszystkich trzech — do potwierdzenia na miesiącu z planami)_
- [ ] 2.8 Po zmianie wysokość karty siatki dla `2026-11` równa pomiarowi wyjściowemu (±1 px) przy obu szerokościach
- [ ] 2.9 Temat do ~40 znaków widoczny w całości przy 1440 px; dłuższy ucięty po dwóch liniach, wysokość kafelka bez zmian
- [ ] 2.10 Przy 1024 px siatka nie wychodzi poza kartę w poziomie
- [ ] 2.11 Kliknięcie kafelka, „Zaplanuj tydzień" i legenda działają; brak błędów hydracji

### Phase 3: Podgląd dnia (FR-010)

#### Automated

- [x] 3.1 Lint przechodzi: `npm run lint`
- [x] 3.2 Build przechodzi: `npm run build`
- [x] 3.3 Testy jednostkowe przechodzą: `npm test`
- [x] 3.4 Natywny dymek zniknął: `grep -rn "tileText(" src/` zwraca pusto

#### Manual

- [ ] 3.5 Mysz: popover po zatrzymaniu, przejście na popover go nie zamyka, zejście zamyka
- [ ] 3.6 Przeciągnięcie przez rząd: żądanie wyłącznie za dzień, na którym kursor stanął
- [ ] 3.7 Ponowne wskazanie dnia bez nowego żądania
- [ ] 3.8 Klawiatura: Tab otwiera, Escape zamyka, Enter otwiera dzień
- [ ] 3.9 Kliknięcie myszą nawiguje bez mignięcia popovera
- [ ] 3.10 Dzień bez planu: brak popovera i żądania
- [ ] 3.11 Rozmieszczenie: dolne rzędy w górę, pt–nd do prawej, pełna nieprzezroczystość poza miesiącem
- [ ] 3.12 Offline → błąd w popoverze; online → ponowne wskazanie ładuje
- [ ] 3.13 Emulacja dotyku: dotknięcie nawiguje, bez popovera

### Phase 4: Testy e2e i mapa ryzyk

#### Automated

- [ ] 4.1 Nowe testy przechodzą: `npm run test:e2e -- tests/e2e/month-day-preview.spec.ts`
- [ ] 4.2 Cały zestaw e2e przechodzi: `npm run test:e2e`
- [ ] 4.3 Celowe psucie A: `hide()` nie czyści timera → test przeciągnięcia czerwony; wycofane
- [ ] 4.4 Celowe psucie B: pominięta pamięć podręczna → test ponownego wskazania czerwony; wycofane
- [ ] 4.5 Celowe psucie C: usunięty `onFocus` → test klawiatury czerwony; wycofane
- [ ] 4.6 Lint przechodzi: `npm run lint`

#### Manual

- [ ] 4.7 Wiersze #10 w `test-plan.md` spójne z #8 i #9, dopisek w §7, numery ryzyk w nazwach testów
