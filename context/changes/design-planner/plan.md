# Design planner („Ogród” na ekranach planowania) — Implementation Plan

## Overview

Druga i ostatnia zmiana Kroku 10 (`next-actions.md`). Przenosi język wizualny „Ogród” na trzy ekrany
planera — `/plan/month`, `/plan/week`, `/plan` — i spłaca dług `.theme-legacy` zostawiony przez
`design-foundation`. Oprócz wyglądu robi trzy rzeczy, które ruszają testy i dlatego mają własne fazy:
przebudowuje strukturę siatki miesiąca (N4–N7), zmienia słownictwo stanu planu na to z makiet
(„zatwierdzony / do przejrzenia”) i zastępuje `window.confirm` własnym oknem `<dialog>`.

Żaden FR, adres, kontrakt API ani schemat bazy się nie zmienia.

## Current State Analysis

- Planer jest ciemny i przypięty klasą `.theme-legacy` na trzech wrapperach
  (`src/pages/plan.astro:53`, `src/pages/plan/week.astro:53`, `src/pages/plan/month.astro:45`);
  blok z dawnymi zmiennymi shadcn żyje w `src/styles/global.css:44-73`, a reguła fokusu „Ogród” jest
  od niego odgrodzona selektorem `:where(:not(.theme-legacy, .theme-legacy *))` (`global.css:236`).
- 147 trafień literalnych klas kolorów (`purple-`, `blue-100`, `white/`, `emerald-`, `amber-`,
  `slate-`, `red-`, `bg-cosmic`) w `src/components/plan/*`, `AppHeader.astro` i trzech stronach.
  Przyciski planera to `Button` z shadcn z nadpisanym `className` — warianty „Ogród”
  (`primary`, `accent`, `inverse`, `outlinePill`, rozmiary `pill`, `pillLg`) już istnieją
  (`src/components/ui/button.tsx:20-35`).
- **Siatka miesiąca** (`src/components/plan/MonthGrid.tsx`): 7 kolumn, kafelki `h-16`, przycisk
  „Zaplanuj tydzień” po prawej, legenda bez liczników. Każdy dzień to link o nazwie `tileLabel`
  (`src/lib/month-grid.ts:64-70`), wiązany przez e2e jako `/^Plan na {iso} /`. Dane: wyłącznie
  `DayPlanSummary { plan_date, prompt, accepted, theme }` — bez tytułów aktywności i bez kategorii.
- **Tydzień** (`WeekPlanBoard.tsx`, 1115 linii, `WeekDayCard.tsx`) i **dzień** (`DayPlanEditor.tsx`,
  1001 linii): jedna kolumna w wąskim kontenerze (`max-w-3xl`, `max-w-2xl`). Makiety 1:1 nie mają —
  makieta 03 to scalony ekran, którego nie przyjmujemy (N8).
- **Potwierdzenia:** 6 wywołań `window.confirm` (`DayPlanEditor.tsx:286,338,476`,
  `WeekPlanBoard.tsx:422,432,755`). Są synchroniczne i stoją w przemyślanej kolejności względem blokad
  `inFlight` / `weekInFlight`. 8 rejestracji `page.on|once("dialog")` w 6 plikach e2e;
  `tests/e2e/E2E-RULES.md:88-95` ma o tym regułę.
- **Słownictwo:** aplikacja mówi „zaakceptowany / roboczy / Akceptuj”, makiety „zatwierdzony /
  do przejrzenia / Zatwierdź”. Zdania widoczne dla użytkownika siedzą w `week-generation.ts`,
  `week-day-controls.ts`, `month-grid.ts`, `plan-pdf/model.ts`, `day-plan-store.ts`, trzech wyspach
  i `DayPreview.tsx`; testy wiążą je w 5 plikach jednostkowych i 7 e2e.
- `AppHeader.astro` to ramka z nazwą, e-mailem i „Wyloguj się”; widoczny przycisk „Wyloguj się”
  wiąże `tests/e2e/auth.setup.ts`.

## Desired End State

- `/plan/month`, `/plan/week`, `/plan` wyglądają jak „Ogród” przy 390 / 768 / 1440 px: tło Owies,
  karty Mleko, nagłówki Young Serif, pigułkowe przyciski, focus Las + Morela.
- Siatka miesiąca: pn–pt, temat tygodnia w nagłówku wiersza, legenda z licznikami, pusty tydzień jako
  jedna komórka z CTA, dopisek o planach weekendowych, lista tygodni poniżej 900 px. Blok siatki
  miesiąca mieści się w 558 px wysokości przy szerokości 1024–1440 px.
- Dzień i tydzień: od 900 px dwie kolumny (przyklejony panel formularza + lista kart), poniżej panel
  nad listą; przełącznik „Jeden dzień / Cały tydzień” jako linki między ekranami.
- W całym UI, w nazwach dostępnych i na wydrukach PDF stan planu nazywa się „zatwierdzony” /
  „do przejrzenia”.
- Każde potwierdzenie to okno w stylu „Ogród”; w `src/` nie ma `window.confirm`.
- W `src/` nie ma `.theme-legacy` ani `bg-cosmic`.
- `npm run lint`, `npm run build`, `npm test`, `npm run test:e2e` — zielone.

### Key Discoveries:

- **Siatka pn–pt ma najwyżej 5 wierszy**, o ile pominie się tygodnie, których wszystkie dni robocze
  leżą poza miesiącem (sierpień 2026 zaczyna się w sobotę — `weeksOfMonth` zwraca dla niego wiersz
  27–31 lipca). Pięć wierszy w 558 px daje ok. 96 px na komórkę — blisko makiety (118 px).
- Dzisiejsze 558 px to wysokość **siatki**, nie strony (`month-day-preview` plan.md:412-414); strona
  z nagłówkiem i tak przewija się na 768 px. Warunek PRD (`prd-v2.md:321-323`) mierzymy więc na bloku siatki.
- `tests/e2e/month-day-preview.spec.ts:143` wiąże nagłówek o nazwie „Plan miesiąca” dopasowaniem
  podciągu — H1 „Plan miesiąca — październik 2026” z ukrytym wizualnie prefiksem go spełnia.
- `tests/e2e/week-day-controls.spec.ts:52` wiąże nagłówek karty dnia **dokładnie** równy
  `formatPlanDate(date)` — tekst `<h3>` w `WeekDayCard` nie może się zmienić ani rozpaść na dwa elementy
  o innej nazwie dostępnej.
- Tytuły aktywności na ekranie dnia muszą zostać nagłówkami (9 asercji `getByRole("heading")`).
- `landing-topic-carry.spec.ts` wiąże etykietę „Hasło tygodnia” i prop `initialPrompt`.
- `scopeQuestion` (`week-generation.ts:136-151`) opisuje dziś przyciski systemowe („OK — …”,
  „Anuluj — …”), a „Anuluj” **zawęża** przebieg, nie przerywa go. Własne okno pozwala nazwać oba
  przyciski po ludzku.
- Odstępstwa od pakietu przyjęte w przeglądzie `design-foundation` obowiązują dalej: focus to
  pierścień Las 3 px z Morelą w odstępie, obramowanie pól `#6f8a69` (`obrys-przerywany`), Morela tylko
  z ciemnym tekstem.
- `cn()` w `src/lib/utils.ts` ma jawną listę kluczy `@theme` dla tailwind-merge — każdy nowy klucz
  rozmiaru tekstu, promienia czy cienia trzeba tam dopisać, inaczej merge po cichu wyrzuca klasy.
- „Dzień roboczy” (pn–pt) to legalne polskie określenie i **zostaje** — zmienia się tylko „roboczy”
  jako stan planu.

## What We're NOT Doing

- Kategorie, czas trwania, miejsce aktywności (N2 → `M-04`); `--cat-*` i `CategoryTag` nie wchodzą.
- Scalanie ekranów dnia i tygodnia w jeden (N8), select tygodnia z makiety 03, „Zapisz w planie (X)”
  i „Przywróć” (N9, N10). Zapis roboczy od razu po generowaniu zostaje.
- Tytuł aktywności w komórce siatki — odczyt miesiąca i `DayPlanSummary` bez zmian.
- Strona `/konto`; awatar nie jest linkiem.
- Wygląd wydruków PDF (własny silnik, `src/lib/plan-pdf/`). Zmieniają się w nim **tylko słowa** (Faza 5).
- Zmiana nazw identyfikatorów, kolumn (`accepted_at`), tras API, promptów LLM i migracji.
- Przepisywanie słownictwa w `context/` (PRD, roadmapa, test-plan, archiwum) — PRD dostaje jedną
  notkę słownikową.
- Zmiana logiki decyzji w potwierdzeniach: kto jest pytany, kiedy i o co — bez zmian; zmienia się nośnik.
- Dark mode; `.dark` w `global.css` zostaje (odwołują się do niego warianty shadcn).
- Podgląd dnia na dotyk (dziś go nie ma i nadal nie będzie).
- Snapshoty pikselowe.

## Implementation Approach

Jedna gałąź (`feat/design-planner`), jeden PR — merge to wydanie, więc stany pośrednie nie trafiają na
produkcję. Fazy 1–4 to sam wygląd i układ, ekran po ekranie; każda zdejmuje `theme-legacy` ze swojej
strony. Fazy 5 i 6 zmieniają teksty i mechanizm potwierdzeń — świadomie osobno i po restylu, żeby
czerwony test dało się przypisać do jednej przyczyny. Faza 7 usuwa resztki i aktualizuje dokumenty.

Pakiet w `context/foundation/design/` to specyfikacja, nie kod: wygląd odtwarzamy w Tailwindzie
z `cn()`, Astro dla statyki (nagłówek, szkielet strony), React w istniejących wyspach. Wszystko, co da
się policzyć bez DOM (wiersze siatki, liczniki, nagłówek tygodnia, treści okien potwierdzeń), idzie do
modułów w `src/lib/` z testami jednostkowymi — wysp nie da się renderować w tym zestawie testów.

### Mapa słownictwa (Faza 5)

| Dziś | Po zmianie |
| --- | --- |
| zaakceptowany / zaakceptowane / zaakceptowanych | zatwierdzony / zatwierdzone / zatwierdzonych |
| roboczy (stan planu), „Plan roboczy” | do przejrzenia, „Do przejrzenia” |
| „Plan zaakceptowany” | „Plan zatwierdzony” |
| „Akceptuj dzień”, „Akceptuj plan” | „Zatwierdź dzień”, „Zatwierdź plan” |
| „Akceptuj tydzień (N)” | „Zatwierdź wszystkie (N)” |
| „Cofnij akceptację” | „Cofnij zatwierdzenie” |
| „Akceptuj ponownie” | „Zatwierdź ponownie” |
| akceptacja (w zdaniach) | zatwierdzenie |
| „niezaakceptowany”, „SZKIC ROBOCZY — niezaakceptowany” (PDF) | „niezatwierdzony”, „SZKIC — niezatwierdzony” |
| „Zaakceptowano {data}” | „Zatwierdzono {data}” |
| „Nietknięty” | bez zmian |

## Critical Implementation Details

- **Asynchroniczne okno nie blokuje pętli zdarzeń.** `window.confirm` zamrażał stronę: nic nie mogło
  się zmienić między pytaniem a odpowiedzią. `<dialog>` otwarty `showModal()` blokuje tylko wejście
  użytkownika — trwające `fetch` i `reconcile()` dalej lądują. Dlatego w każdym z sześciu miejsc:
  blokada (`inFlight` / `weekInFlight` / `retriesInFlight`) jest sprawdzana **przed** otwarciem okna
  i **ponownie po** odpowiedzi, a stan, którego dotyczyło pytanie, jest zamrażany w chwili otwarcia
  (partycja tygodnia już jest — `WeekPlanBoard.tsx:437-439`) albo czytany na nowo z refa
  (`planRef.current` w `saveDraft`). Jeśli po odpowiedzi blokada jest zajęta, operacja jest porzucana
  bez żądania — tak samo jak dziś robi to `mutate`.
- **Pytanie o zakres tygodnia: zamknięcie okna zawęża, nie przerywa.** Dziś „Anuluj” w `scopeQuestion`
  znaczy „tylko dni do przejrzenia”, a okno z liczbą dni pojawia się zawsze potem i to ono jest
  miejscem na „stop”. Esc i przycisk drugorzędny mają dać ten sam wynik co dzisiejsze „Anuluj”.
- **Kolejność faz a `.theme-legacy`.** Od Fazy 1 `AppHeader` renderuje się **poza** wrapperem legacy.
  Każda z Faz 2–4 zdejmuje klasę ze swojej strony; blok CSS i selektor fokusu upraszcza dopiero Faza 7.
  Usunięcie bloku wcześniej przemalowałoby przyciski na ekranach jeszcze nieprzerobionych.
- **Wysokość komórki siatki jest stała, nie minimalna** — z tego samego powodu co dzisiejsze `h-16`
  (`MonthGrid.tsx:96-101`): wiersz nie rośnie z treścią, ustępuje tekst.
- **Podgląd dnia** wisi na wrapperze kafelka, a jego kierunek wynika z pozycji w siatce
  (`placementOf`). Po przejściu na 5 kolumn próg „wyrównaj do prawej” przesuwa się (dziś `>= 4` z 7).
  Poniżej 900 px, gdzie siatka jest listą, podgląd otwiera się zawsze pod kafelkiem, wyrównany do lewej.

## Phase 1: Powłoka planera i nagłówek aplikacji

### Overview

Wspólny szkielet trzech ekranów i nowy pasek aplikacji. Zawartość ekranów zostaje ciemna — po tej
fazie widać nowy pasek nad starym planerem.

### Changes Required:

#### 1. Szkielet strony planera

**File**: `src/layouts/PlannerLayout.astro` (nowy), `src/pages/plan.astro`, `src/pages/plan/week.astro`,
`src/pages/plan/month.astro`

**Intent**: Jedno miejsce na pasek aplikacji, tło i kontener, zamiast trzech kopii wrappera.

**Contract**: `PlannerLayout` opakowuje `Layout.astro`; propsy `title`, `active: "plan" | "generate"`;
renderuje `AppHeader` na pełną szerokość, potem `<slot />`. Trzy strony przechodzą na niego; ich
dotychczasowy `<div class="theme-legacy bg-cosmic …">` zostaje **wewnątrz** slotu do własnej fazy.
`active`: miesiąc → `plan`, tydzień i dzień → `generate`.

#### 2. Pasek aplikacji

**File**: `src/components/AppHeader.astro`

**Intent**: Pasek z makiet 03/04 (N12, N8) — logo, nawigacja, tożsamość, wyjście.

**Contract**:
- prop `active: "plan" | "generate"`;
- `Logo` (istniejący `src/components/brand/Logo.astro`) z linkiem do `/plan/month`;
- `<nav aria-label="Główna">`: „Plan miesiąca” → `/plan/month`, „Nowe propozycje” → `/plan/week`
  (bez parametru = bieżący tydzień); aktywna pozycja: pigułka `szalwia-soft` + `aria-current="page"`;
- po prawej: dekoracyjny inicjał w kółku `morela-soft` (`aria-hidden`, **nie link**), e-mail
  (ukryty poniżej 720 px), **widoczny** `<button type="submit">Wyloguj się</button>` w formularzu
  `POST /api/auth/signout` — tekst i rola bez zmian;
- tło Mleko, dolna krawędź `linia`; ≤ 720 px nawigacja schodzi do drugiego wiersza na pełną szerokość.

#### 3. Warianty przycisku i tokeny stanów

**File**: `src/components/ui/button.tsx`, `src/styles/global.css`, `src/lib/utils.ts`

**Intent**: Planer potrzebuje małej pigułki do akcji na karcie, przycisku-ikony (kosz) i wariantu
dla operacji nieodwracalnej oraz kolorów dla błędu i ostrzeżenia, których publiczne strony nie miały.

**Contract**: nowe klucze `cva` — rozmiar `pillSm` i `pillIcon` (cel ≥ 44 px, ten sam focus co `pill`),
wariant `dangerPill` (obrys, tekst w kolorze błędu). Istniejące klucze bez zmian. W `@theme`: tokeny
błędu i ostrzeżenia (tło + tekst + ramka) z tonów `Notice.astro` pakietu, kontrast tekstu ≥ 4,5:1 na
własnym tle. Każdy nowy klucz `@theme`, który tailwind-merge mógłby pomylić, dopisany w `utils.ts`.

### Success Criteria:

#### Automated Verification:

- Lint, build, testy jednostkowe: `npm run lint && npm run build && npm test`
- Pasek ma aktywną pozycję nawigacji: `grep -c 'aria-current' src/components/AppHeader.astro` ≥ 1 (dziś `0`)
- Pasek bez kosmicznych klas: `! grep -nE 'purple-|blue-100|white/' src/components/AppHeader.astro` (dziś 7 trafień)
- Trzy strony używają wspólnego szkieletu: `grep -lE '^import PlannerLayout from' src/pages/plan.astro src/pages/plan/week.astro src/pages/plan/month.astro | wc -l` zwraca `3` (dziś `0`)
- Cały e2e zielony (setup wymaga widocznego „Wyloguj się”): `npm run test:e2e`

#### Manual Verification:

- Pasek przy 390 / 768 / 1440 px zgodny z makietami 03/04; aktywna pigułka na właściwej pozycji na każdym z trzech ekranów
- „Wyloguj się” widoczny i działa; nawigacja klawiaturą z widocznym fokusem
- Zawartość trzech ekranów pod paskiem bez zmian względem produkcji

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na ręczne potwierdzenie.

---

## Phase 2: Siatka miesiąca

### Overview

Przebudowa struktury i wyglądu `/plan/month` według makiety 04 w granicach decyzji N4–N7.

### Changes Required:

#### 1. Model siatki

**File**: `src/lib/month-grid.ts` (+ `src/lib/month-grid.test.ts`)

**Intent**: Wszystko, co siatka pokazuje, policzone poza wyspą i przetestowane.

**Contract** (nazwy do wyboru implementera, kształt wiążący):
- **wiersze**: z `month`, `weeks`, `summaries` → lista wierszy `{ monday, rangeLabel, heading, isEmpty, days[5] }`,
  gdzie `days[i] = { date, inMonth, summary }`. Wiersz, którego żaden dzień roboczy nie leży w miesiącu,
  **nie powstaje**. `rangeLabel` obejmuje tylko dni robocze wiersza leżące w miesiącu („1–2 października”).
- **nagłówek tygodnia** (`heading`): różne hasła zaplanowanych dni roboczych wiersza leżących w miesiącu,
  w kolejności pierwszego wystąpienia, połączone `", "`; każde hasło przycięte `clipForLabel`. Brak
  planów → `null` (UI pokazuje „Bez tematu”).
- **`isEmpty`**: żaden dzień roboczy wiersza leżący w miesiącu nie ma planu.
- **liczniki**: `{ accepted, draft, empty }` po dniach roboczych **miesiąca**.
- **plany weekendowe**: podsumowania z soboty i niedzieli leżące w miesiącu, rosnąco po dacie.
- `tileLabel` bez zmian w tej fazie.

#### 2. Wyspa siatki

**File**: `src/components/plan/MonthGrid.tsx`

**Intent**: Makieta 04 na danych, które strona już ma.

**Contract**:
- kontener siatki ma nazwę dostępną „Siatka miesiąca” (po niej mierzy test wysokości);
- ≥ 900 px: kolumna tematu + 5 kolumn dni, nagłówki pełnymi nazwami dni;
- **nagłówek wiersza** to link do `/plan/week?from={monday}` (zastępuje „Zaplanuj tydzień”): temat
  w Young Serif przycięty do 2 linii + zakres dat; nazwa dostępna `Tydzień {rangeLabel} — {heading | "bez tematu"}`;
- **komórka dnia**: link `/plan?date=`, `aria-label={tileLabel(…)}` — bez zmian; treść: numer dnia
  (display) + temat dnia, a gdy `theme === null` — hasło; tekst przycięty do 2 linii. **Stała wysokość**;
  zatwierdzony = wypełnienie `szalwia-soft` + ciągła ramka; do przejrzenia = Mleko + przerywana ramka
  `obrys-przerywany`; bez planu = `owies-ciemny`, bez ramki, sam numer;
- dzień spoza miesiąca: pusta komórka, `aria-hidden`, nie link;
- **pusty tydzień** (`isEmpty`): jedna komórka na 5 kolumn, „Ten tydzień czeka na temat.” + pigułka
  „Wpisz hasło na {rangeLabel}” → `/plan/week?from={monday}`;
- **legenda z licznikami**: „N zatwierdzonych · N do przejrzenia · N bez planu” (od razu w słownictwie
  docelowym — tego tekstu nie wiąże żaden test); wpis „weekend — poza generowaniem tygodnia” znika;
- **dopisek weekendowy** pod siatką, tylko gdy są plany: „Plany na weekend:” + linki do `/plan?date=`
  z `aria-label={tileLabel(…)}` i widocznym skrótem („sob. 10”); bez podglądu;
- podgląd dnia (hover myszą, focus klawiaturą, Esc) działa jak dziś; `placementOf` dopasowany do 5 kolumn;
- < 900 px: nagłówki dni znikają, każdy wiersz to nagłówek tygodnia + dni jeden pod drugim z nazwą dnia
  tygodnia przy numerze; komórki spoza miesiąca ukryte.

#### 3. Podgląd dnia

**File**: `src/components/plan/DayPreview.tsx`

**Intent**: Karta podglądu w „Ogrodzie”.

**Contract**: karta Mleko, cień `card`, tekst Las / `las-szary`; `role="tooltip"` i `id` bez zmian.
Tekst stanu zostaje do Fazy 5.

#### 4. Strona miesiąca i PDF

**File**: `src/pages/plan/month.astro`, `src/components/plan/PdfDownloadControls.tsx`
(+ `MonthPdfControls.tsx`, jeśli trzeba)

**Intent**: Nagłówek z makiety, przyciski PDF w nowym wyglądzie, koniec `theme-legacy` na tej stronie.

**Contract**:
- wrapper bez `theme-legacy` i `bg-cosmic`; kontener `max-w-content`;
- H1: `<span class="sr-only">Plan miesiąca — </span>{nazwa miesiąca}` w Young Serif; po bokach okrągłe
  linki ‹ › z `aria-label` „Poprzedni miesiąc” / „Następny miesiąc”; legenda w tym samym wierszu (≥ 900 px);
- zdanie „Zaplanowane dni w tym miesiącu: N” znika (zastępuje je legenda);
- przyciski PDF pod siatką jako `outlinePill`; **nazwy bez zmian** („Pobierz PDF — siatka miesiąca”,
  „Pobierz PDF — tygodniami”); stany błędu/ładowania `PdfDownloadControls` w tokenach z Fazy 1;
- stan `readFailed` jako ostrzeżenie w nowych tokenach; treść i link „Odśwież” bez zmian.

#### 5. Test wysokości siatki

**File**: `tests/e2e/month-grid-fit.spec.ts` (nowy), `context/foundation/test-plan.md`

**Intent**: Warunek z PRD „pełny miesiąc bez przewijania” ma bramkę, nie oględziny.

**Contract**: w `test-plan.md` §2 nowy wiersz **ryzyko #14** — „po przebudowie siatki miesiąc przestaje
mieścić się w wysokości, w której mieścił się dotąd”. Test „Ryzyko #14 — …”: zasiew dwóch dni w jednym
tygodniu z hasłem i tematem po ≥ 200 znaków (wzorzec zasiewu i sprzątania jak w
`month-day-preview.spec.ts`), viewport 1024×768 i 1440×900, `boundingBox()` kontenera „Siatka miesiąca”
ma `height <= 558`. Zasady z `E2E-RULES.md`. **Musi móc nie przejść**: uruchomić raz ze stałą
wysokością komórki zamienioną na minimalną i potwierdzić czerwony wynik.

### Success Criteria:

#### Automated Verification:

- Lint, build: `npm run lint && npm run build`
- Testy modelu siatki (wiersz bez dni roboczych pominięty; tydzień na granicy miesięcy; jedno hasło / dwa hasła / brak planów; liczniki; weekendy) przechodzą: `npm test`
- Strona miesiąca bez przypięcia: `! grep -nE 'class="[^"]*\btheme-legacy\b' src/pages/plan/month.astro` (dziś 1 trafienie)
- Brak kosmicznych klas w siatce: `! grep -nE 'bg-cosmic|purple-|blue-100|white/|emerald-|amber-|slate-' src/components/plan/MonthGrid.tsx src/components/plan/DayPreview.tsx src/components/plan/PdfDownloadControls.tsx src/pages/plan/month.astro` (dziś trafienia w każdym z czterech)
- Siatka nie renderuje weekendu jako kolumny: `! grep -nE 'addDays\(monday, [56]\)' src/components/plan/MonthGrid.tsx` (dziś 1 trafienie)
- Nowy test wysokości przechodzi i był widziany na czerwono: `npx playwright test month-grid-fit`
- Cały e2e zielony (podgląd dnia, wydruk miesiąca): `npm run test:e2e`

#### Manual Verification:

- `/plan/month` przy 1440 px zgodne z `04-plan-miesiaca.png` poza świadomymi odstępstwami (temat dnia zamiast tytułu aktywności, brak kategorii, niższe komórki, PDF pod siatką, dopisek weekendowy)
- Przy 390 i 768 px siatka jest listą tygodni; nic nie wychodzi poza ekran
- Miesiąc zaczynający się w weekend (sierpień 2026) nie ma pustego pierwszego wiersza; tydzień na granicy miesięcy pokazuje tylko swoje dni
- Tydzień z dwoma hasłami pokazuje oba po przecinku; pusty tydzień ma CTA prowadzące do właściwego tygodnia
- Plan utworzony na sobotę pojawia się w dopisku i otwiera właściwy dzień
- Podgląd dnia: hover, Tab, Esc; nie wychodzi poza ekran w ostatniej kolumnie i dolnych wierszach

**Implementation Note**: Zatrzymaj się na ręczne potwierdzenie wyglądu i zachowania siatki.

---

## Phase 3: Ekran tygodnia

### Overview

`/plan/week` w układzie dwukolumnowym z makiety 03, z zachowaniem wszystkiego, czego makieta nie
pokazuje: postępu generowania, stanu „niezapisane”, ostrzeżeń, PDF.

### Changes Required:

#### 1. Strona tygodnia

**File**: `src/pages/plan/week.astro`

**Intent**: Nagłówek w „Ogrodzie”, szeroki kontener, koniec `theme-legacy` na tej stronie.

**Contract**: wrapper bez `theme-legacy`/`bg-cosmic`; kontener `max-w-content`; nad wyspą: link
„← Wróć do miesiąca”, nadtytuł z zakresem dat, H1 „Plan tygodnia” (Young Serif), okrągłe linki
poprzedni/następny tydzień z `aria-label`. Akapit wprowadzający przechodzi do panelu formularza.
Logika `pending_topic` i `readFailed` bez zmian; do wyspy dochodzi prop `dayHref` (patrz niżej).

#### 2. Przełącznik zakresu

**File**: `src/components/plan/ScopeToggle.tsx` (nowy)

**Intent**: „Jeden dzień / Cały tydzień” z makiety jako nawigacja między dwoma ekranami (N8).

**Contract**: dwa linki w torze `owies-ciemny`, aktywny to pigułka Mleko z `aria-current="page"`;
propsy `active: "day" | "week"`, `dayHref`, `weekHref`. Bez stanu i bez handlerów — komponent
prezentacyjny używany wewnątrz obu wysp. Cele: z tygodnia → `/plan?date=` dzisiejszego dnia, jeśli
leży w tym tygodniu, inaczej poniedziałku; z dnia → `/plan/week?from={data dnia}`. Oba adresy liczy
strona Astro i podaje wyspie.

#### 3. Tablica tygodnia

**File**: `src/components/plan/WeekPlanBoard.tsx`

**Intent**: Dwie kolumny od 900 px; panel formularza przyklejony; wszystkie istniejące stany w nowych
kolorach.

**Contract**:
- lewa kolumna — panel (Mleko, promień `panel`, cień): nagłówek „Nowe propozycje”, pole z etykietą
  **„Hasło tygodnia”** (bez zmian; `initialPrompt` zachowany), `ScopeToggle`, przycisk generowania
  (`primary`, pełna szerokość; tekst bez zmian), akapit wyjaśniający;
- prawa kolumna — licznik stanu tygodnia, lista kart (`<ul>`/`<li>` bez zmian ról), akcje zbiorcze
  wyrównane do prawej (`outlinePill` dla akceptacji tygodnia, `accent` dla „Zapisz tydzień”), pod nimi PDF;
- `role="alert"` i `role="status"` na tych samych komunikatach co dziś; ostrzeżenie o niezapisanych
  dniach zostaje i jest wyraźne (token ostrzeżenia);
- < 900 px: panel nad listą, nieprzyklejony;
- **żadnej zmiany** w logice, stanie, nazwach przycisków i tekstach (teksty zmienia Faza 5).

#### 4. Karta dnia

**File**: `src/components/plan/WeekDayCard.tsx`

**Intent**: Wiersz z makiety 03 dla dnia z trzema aktywnościami.

**Contract**: karta Mleko, promień `row`; ≥ 900 px po lewej kolumna z datą, po prawej treść i akcje.
`<h3>` zawiera **dokładnie** `formatPlanDate(day.planDate)` — jeden element, ta sama nazwa dostępna.
Stany: zaakceptowany = ramka 2 px Mech + znaczek; roboczy = bez ramki; `held`/`saving` = przerywana
ramka + znaczek na `maslo-soft`; `failed` = tokeny błędu. Akcje: akceptacja `primary`/`outlinePill`
w rozmiarze `pillSm`, „Otwórz dzień” jako link, usuwanie `dangerPill` odsunięte od pozostałych
(`prd-v2.md` §Constraints „Warunek układu”). `aria-label` z `week-day-controls.ts` bez zmian.

#### 5. Postęp generowania

**File**: `src/components/plan/GenerationProgress.tsx`

**Intent**: Etapy i zegar w nowych kolorach (używa go też dzień).

**Contract**: tylko klasy; struktura, teksty i role bez zmian.

### Success Criteria:

#### Automated Verification:

- Lint, build, testy: `npm run lint && npm run build && npm test`
- Strona tygodnia bez przypięcia: `! grep -nE 'class="[^"]*\btheme-legacy\b' src/pages/plan/week.astro` (dziś 1 trafienie)
- Brak kosmicznych klas na tygodniu: `! grep -nE 'bg-cosmic|purple-|blue-100|white/|emerald-|amber-|slate-|red-[0-9]' src/components/plan/WeekPlanBoard.tsx src/components/plan/WeekDayCard.tsx src/components/plan/GenerationProgress.tsx src/pages/plan/week.astro` (dziś trafienia w każdym z czterech)
- Etykieta wiązana przez e2e została: `grep -c '>\s*Hasło tygodnia' src/components/plan/WeekPlanBoard.tsx` ≥ 1 (sprawdzić, że po tymczasowej zmianie etykiety zwraca `0`)
- Cały e2e zielony (kontrolki tygodnia, wydruk tygodnia, przeniesienie tematu): `npm run test:e2e`

#### Manual Verification:

- `/plan/week` przy 390 / 768 / 1440 px: dwie kolumny od 900 px, panel przyklejony przy przewijaniu, poniżej panel nad listą
- Pełny przebieg lokalnie: hasło → generowanie (postęp każdego dnia) → stan „niezapisane” czytelny → „Zapisz tydzień” → akceptacja jednego dnia i całego tygodnia → usunięcie dnia
- Błąd generowania jednego dnia i „Ponów ten dzień” czytelne na jasnym tle
- Przełącznik „Jeden dzień” prowadzi do właściwego dnia; przyciski PDF pobierają pliki
- Fokus widoczny na każdej kontrolce, cele ≥ 44 px

**Implementation Note**: Zatrzymaj się na ręczne potwierdzenie — ten ekran nie ma makiety 1:1, więc ocena układu jest decyzją Janusza.

---

## Phase 4: Ekran dnia

### Overview

`/plan` w tym samym szkielecie co tydzień. Tu żyją funkcje, których żadna makieta nie pokazuje:
edycja inline, „Zapytaj model”, banery akceptacji, usuwanie planu.

### Changes Required:

#### 1. Strona dnia

**File**: `src/pages/plan.astro`

**Intent**: Ten sam nagłówek co tydzień; koniec `theme-legacy` na ostatniej stronie.

**Contract**: wrapper bez `theme-legacy`/`bg-cosmic`; kontener `max-w-content`; „← Wróć do miesiąca”,
nadtytuł z datą, H1 „Plan dnia”, temat dnia pod spodem (statyczny SSR jak dziś — uzasadnienie w
komentarzu `plan.astro:17-33` zostaje prawdziwe). Wyspie dochodzi prop `weekHref`.

#### 2. Edytor dnia

**File**: `src/components/plan/DayPlanEditor.tsx`

**Intent**: Dwie kolumny jak tydzień; propozycje jako karty z makiety 03; narzędzia edycji w nowym
wyglądzie.

**Contract**:
- lewa kolumna — panel: pole daty i pole z etykietą **„Hasło dnia”** (etykiety bez zmian),
  `ScopeToggle active="day"`, przycisk generowania, postęp generowania;
- prawa kolumna — baner stanu planu (zaakceptowany: ramka Mech + znaczek; roboczy: neutralny; cofnięcie
  przez edycję: token ostrzeżenia), lista propozycji, przycisk akceptacji, a **odsunięte od niego**
  usuwanie planu (`dangerPill`);
- karta propozycji: tytuł jako **nagłówek** (`<h3>`, jak dziś), opis z zachowaniem łamania linii,
  akcje „Edytuj” i „Zapytaj model” (`pillSm`) z dotychczasowymi `aria-label`
  (`Edytuj propozycję: {tytuł}`, `Zapytaj model o propozycję: {tytuł}`);
- tryb edycji: pola „Tytuł” / „Opis” (Mleko, ramka `obrys-przerywany`, promień `input` — jak
  `auth/FormField.tsx`), „Zapisz” / „Anuluj”; „Polecenie dla modelu” w tej samej karcie;
- stan pustego dnia jako zaproszenie w prawej kolumnie;
- komunikaty `role="alert"` / `role="status"` na tych samych elementach; **żadnej zmiany** logiki,
  nazw i tekstów.

### Success Criteria:

#### Automated Verification:

- Lint, build, testy: `npm run lint && npm run build && npm test`
- Żadna strona planera nie jest przypięta: `! grep -rnE 'class="[^"]*\btheme-legacy\b' src/pages` (na początku zmiany 3 trafienia)
- Brak kosmicznych klas w całym planerze: `! grep -rnE 'bg-cosmic|purple-|blue-100|white/|emerald-|amber-|slate-|red-[0-9]' src/components/plan src/components/AppHeader.astro src/pages/plan.astro src/pages/plan` (na początku zmiany 147 trafień)
- Tytuł propozycji nadal jest nagłówkiem: `grep -cE '<h3[ >]' src/components/plan/DayPlanEditor.tsx` ≥ 1 (sprawdzić, że po tymczasowej zamianie na `<p>` zwraca `0`)
- Cały e2e zielony (edycja, zgoda, usuwanie, własność): `npm run test:e2e`

#### Manual Verification:

- `/plan?date=` przy 390 / 768 / 1440 px: dzień pusty, roboczy, zaakceptowany
- Generowanie, edycja inline z „Anuluj”, „Zapytaj model”, akceptacja, cofnięcie, edycja dnia zaakceptowanego (baner o cofniętej akceptacji), usunięcie planu
- Usuwanie nie stoi obok akceptacji; na wąskim ekranie łamie się do własnego wiersza
- Dzień i tydzień wyglądają jak jeden produkt; przełącznik zakresu prowadzi w obie strony
- Fokus widoczny, cele ≥ 44 px, pole daty czytelne

**Implementation Note**: Zatrzymaj się na ręczne potwierdzenie. Od tej chwili cała aplikacja jest w „Ogrodzie”.

---

## Phase 5: Słownictwo z makiet

### Overview

Stan planu zmienia nazwę w całym produkcie według mapy z §Implementation Approach. Tylko zdania —
żadnej zmiany logiki, identyfikatorów ani układu.

### Changes Required:

#### 1. Moduły tekstów

**File**: `src/lib/week-day-controls.ts`, `src/lib/week-generation.ts`, `src/lib/month-grid.ts`,
`src/lib/plan-pdf/model.ts`, `src/lib/services/day-plan-store.ts` (+ ich testy `*.test.ts`)

**Intent**: Źródła zdań mówią językiem makiet; testy jednostkowe wiążą nowe brzmienie.

**Contract**: stałe `ACCEPT_DAY_LABEL` = „Zatwierdź dzień”, `UNACCEPT_DAY_LABEL` = „Cofnij zatwierdzenie”;
`tileLabel` kończy się „zatwierdzony” / „do przejrzenia” (prefiks `Plan na {iso} — ` bez zmian);
PDF: `DRAFT_LABEL`, `GRID_LEGEND`, „Zatwierdzono {data}”; odmiana liczebników w `week-generation.ts`
zachowana dla nowych słów (1 zatwierdzony / 2 zatwierdzone / 5 zatwierdzonych). Nazwy eksportów bez zmian.

#### 2. Wyspy i podgląd

**File**: `src/components/plan/DayPlanEditor.tsx`, `WeekPlanBoard.tsx`, `WeekDayCard.tsx`,
`DayPreview.tsx`, `MonthGrid.tsx`

**Intent**: Teksty zaszyte w JSX zgodne z mapą.

**Contract**: wszystkie wiersze mapy; przycisk zbiorczy tygodnia „Zatwierdź wszystkie (N)”. Komentarze
cytujące stare brzmienie UI zaktualizowane razem z kodem.

#### 3. Komunikaty API widoczne dla użytkownika

**File**: `src/pages/api/day-plan/**` (tylko treści `error` pokazywane w UI)

**Intent**: Odmowa serwera nie mówi innym językiem niż ekran.

**Contract**: zdania z „akcept…” według mapy; kody statusów i kształt odpowiedzi bez zmian.

#### 4. Testy e2e

**File**: `tests/e2e/*.spec.ts` (7 plików z dawnym słownictwem)

**Intent**: Lokatory i asercje na nowym brzmieniu; nazwy testów też.

**Contract**: wyłącznie zamiana tekstów i nazw — żadna asercja nie znika, żaden krok nie jest
poluzowany. Treści okien sprawdzane przez `dialog.message()` zmieniają brzmienie tutaj, mechanizm
w Fazie 6.

#### 5. Notka w PRD

**File**: `context/foundation/prd-v2.md`

**Intent**: PRD mówi „akceptacja”, produkt „zatwierdzenie” — ktoś to kiedyś zestawi.

**Contract**: jedno zdanie w słowniku / na początku §Zachowania chronione: w interfejsie od
`design-planner` „zaakceptowany” = „zatwierdzony”, „roboczy” = „do przejrzenia”. Reszta PRD bez zmian.

### Success Criteria:

#### Automated Verification:

- Lint, build: `npm run lint && npm run build`
- Testy jednostkowe na nowym brzmieniu (w tym odmiana liczebników i `tileLabel`) przechodzą: `npm test`
- Stare słownictwo akceptacji zniknęło z kodu i testów: `! grep -rnE 'Akceptuj|[Zz]aakceptowan|[Nn]iezaakceptowan|[Aa]kceptacj' src tests/e2e --include='*.ts' --include='*.tsx' --include='*.astro'` (dziś kilkadziesiąt trafień)
- „Roboczy” jako stan planu zniknął, „dzień roboczy” został: `! grep -rnE 'Plan roboczy|do roboczego|"roboczy"|SZKIC ROBOCZY' src tests/e2e` (dziś trafienia m.in. w `month-grid.ts:69`, `WeekDayCard.tsx`, `plan-pdf/model.ts:37`)
- Stałe niosą nowe brzmienie: `grep -c 'ACCEPT_DAY_LABEL = "Zatwierdź dzień"' src/lib/week-day-controls.ts` zwraca `1` (dziś `0`)
- Cały e2e zielony: `npm run test:e2e`

#### Manual Verification:

- Przejście trzech ekranów: nigdzie nie widać „akceptuj / zaakceptowany / roboczy (stan)”
- Wydruk PDF tygodnia i miesiąca z dniem niezatwierdzonym: napisy czytelne, nic nie wychodzi poza ramkę po zmianie długości tekstu
- Czytnik ekranu / drzewo dostępności: kafelek siatki i przyciski karty dnia mają nowe nazwy

**Implementation Note**: Zatrzymaj się na ręczne potwierdzenie, zwłaszcza wydruków — to jedyne miejsce, gdzie dłuższy tekst może rozepchnąć układ.

---

## Phase 6: Własne okno potwierdzeń

### Overview

Sześć `window.confirm` zastąpione oknem `<dialog>` w stylu „Ogród”. Decyzje — kto jest pytany i o co —
bez zmian; zmienia się nośnik i to, że jest asynchroniczny.

### Changes Required:

#### 1. Treści potwierdzeń jako dane

**File**: `src/lib/confirmations.ts` (nowy, + test), `src/lib/week-day-controls.ts`,
`src/lib/week-generation.ts` (+ testy)

**Intent**: Każde pytanie ma tytuł, treść i **nazwane** przyciski, policzone poza wyspą i przetestowane.

**Contract**:

```ts
export interface ConfirmationRequest {
  readonly title: string;
  readonly body: readonly string[]; // akapity
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly tone: "default" | "danger";
}
```

- `deleteConfirmation`, `replacementConfirmation`, `scopeQuestion` zwracają `ConfirmationRequest`
  (druga nadal `| null`) zamiast `string`; warunki i liczby bez zmian.
- Trzy zdania zaszyte dziś w `DayPlanEditor.tsx` (regeneracja dnia zatwierdzonego, zapis edycji dnia
  zatwierdzonego, usunięcie planu dnia) przechodzą do `confirmations.ts` jako funkcje.
- Przyciski nazywają skutek: usuwanie — „Usuń plan” / „Zostaw”; regeneracja — „Wygeneruj nowe” /
  „Zostaw obecne”; edycja — „Zapisz i cofnij zatwierdzenie” / „Wróć do edycji”; zakres tygodnia —
  „Zastąp także zatwierdzone” / „Tylko do przejrzenia” (w treści nie ma już „OK —” i „Anuluj —”).
- `tone: "danger"` dla operacji nieodwracalnych (usuwanie, regeneracja).
- Zdania ostrzegawcze zostają dosłownie tam, gdzie wiążą je testy („Tej operacji nie można cofnąć.”,
  „Ten dzień jest zatwierdzony.”, data dnia w pytaniu o usunięcie).

#### 2. Komponent i hook

**File**: `src/components/ui/ConfirmDialog.tsx` (nowy), `src/components/hooks/useConfirmDialog.ts` (nowy)

**Intent**: Jedno okno dla całej aplikacji — także pod paywall z `M-03`.

**Contract**: `useConfirmDialog()` → `{ confirm(request: ConfirmationRequest): Promise<boolean>, dialog: ReactNode }`.
Natywny `<dialog>` otwierany `showModal()`; `aria-labelledby` na tytule, treść jako opis; Esc i przycisk
drugorzędny → `false`; kliknięcie w tło **nie** zamyka. Fokus początkowy na przycisku drugorzędnym przy
`tone: "danger"`, na głównym w pozostałych; po zamknięciu fokus wraca na element, który otworzył okno.
Jedno okno naraz — drugie `confirm()` w trakcie otwartego zwraca `false`. Wygląd jak `PaywallDialog`
z pakietu: Mleko, promień `panel`, przyciemnione tło; przycisk główny `primary` albo `dangerPill`.

#### 3. Sześć miejsc wywołania

**File**: `src/components/plan/DayPlanEditor.tsx`, `src/components/plan/WeekPlanBoard.tsx`

**Intent**: Ten sam przepływ decyzji na asynchronicznym oknie.

**Contract**: funkcje pytające stają się `async`; dla każdej: sprawdzenie blokady → `await confirm(…)`
→ **ponowne** sprawdzenie blokady i stanu → operacja (patrz Critical Implementation Details).
W `generateWeek`: pytanie o zakres (gdy tydzień mieszany) → zawsze potem pytanie z liczbą dni; partycja
zamrożona w chwili drugiego pytania, jak dziś. Komentarze opisujące kolejność „blokada / okno”
zaktualizowane do nowego mechanizmu.

#### 4. E2E i reguły

**File**: `tests/e2e/day-plan-delete-confirmation.spec.ts`, `day-plan-delete-scope.spec.ts`,
`day-plan-edit-confirmation.spec.ts`, `day-plan-edit-consent.spec.ts`, `week-day-controls.spec.ts`,
`tests/e2e/E2E-RULES.md`

**Intent**: Testy ryzyk #7 i #8 sprawdzają to samo na nowym nośniku.

**Contract**: `page.on|once("dialog")` → `page.getByRole("dialog")` + kliknięcie przycisku po nazwie.
Każda dotychczasowa asercja ma odpowiednik: okno się pokazało (`toBeVisible`), jego treść zawiera
wymagane zdanie (`toContainText`), odmowa nie zmienia danych, zgoda zmienia, a tam, gdzie okna ma **nie**
być (cofnięcie zatwierdzenia z tygodnia; druga edycja dnia już niezatwierdzonego) —
`expect(page.getByRole("dialog")).toHaveCount(0)` po zakończeniu operacji. `E2E-RULES.md` §Dialogi
przeglądarki przepisany: okno jest elementem strony; test odmowy i test zgody nadal obowiązkowe;
ostrzeżenie o „zielonym i bezwartościowym” teście zastąpione nowym — brak kliknięcia w oknie zostawia
operację w zawieszeniu, więc test musi najpierw potwierdzić widoczność okna.

### Success Criteria:

#### Automated Verification:

- Lint, build: `npm run lint && npm run build`
- Testy treści potwierdzeń (każda z sześciu; dzień zatwierdzony vs nie; odmiana liczebników; nazwy przycisków) przechodzą: `npm test`
- W kodzie nie ma okna systemowego: `! grep -rnE 'window\.confirm\(' src` (dziś 6 trafień)
- Testy nie nasłuchują okna systemowego: `! grep -rnE 'page\.(on|once)\("dialog"' tests/e2e` (dziś 8 trafień)
- Każde z sześciu miejsc pyta przez hook: `grep -cE 'await confirm\(' src/components/plan/DayPlanEditor.tsx` zwraca `3` i to samo dla `src/components/plan/WeekPlanBoard.tsx` (dziś `0` i `0`)
- Testy odmowy są widziane na czerwono: przy tymczasowym `return true` w `confirm()` padają testy „odmowa…” z ryzyk #7 i #8 — `npx playwright test day-plan-delete-confirmation day-plan-edit-confirmation week-day-controls`
- Cały e2e zielony: `npm run test:e2e`

#### Manual Verification:

- Każde z sześciu okien: wygląd, Esc, Tab zamknięty w oknie, fokus wraca na przycisk wywołujący
- Usuwanie i regeneracja: fokus startuje na przycisku bezpiecznym; Enter zaraz po otwarciu niczego nie kasuje
- Tydzień mieszany: „Tylko do przejrzenia” i Esc dają ten sam zawężony przebieg, potem zawsze okno z liczbą dni
- Szybkie podwójne kliknięcie „Usuń” nie otwiera dwóch okien i nie wysyła dwóch żądań
- Okno przy 390 px mieści się w ekranie, przyciski jeden pod drugim

**Implementation Note**: Zatrzymaj się na ręczne potwierdzenie — to jedyna faza, w której błąd jest regresją zachowania przy operacji nieodwracalnej.

---

## Phase 7: Sprzątanie i przekazanie

### Overview

Usunięcie długu `.theme-legacy`, domknięcie pozycji landingu odłożonej do N4 i aktualizacja dokumentów.

### Changes Required:

#### 1. Koniec izolacji

**File**: `src/styles/global.css`

**Intent**: Dług z `design-foundation` spłacony.

**Contract**: znika blok `.theme-legacy` z komentarzem, utility `bg-cosmic`; reguła fokusu w
`@layer base` przechodzi z `:where(:not(.theme-legacy, .theme-legacy *)):focus-visible` na zwykłe
`:focus-visible` (komentarz skrócony o akapit o planerze). Komentarz przy `:root` nie wspomina już
o wyjątku. `.dark` zostaje.

#### 2. Ilustracja miesiąca na landingu

**File**: `src/components/Welcome.astro`

**Intent**: Pozycja odłożona w `design-foundation` do czasu N4.

**Contract**: statyczna ilustracja w sekcji „Przegląd miesiąca” dostaje etykiety tematu tygodnia
w wierszach (jak makieta 01) i słownictwo „zatwierdzone / do przejrzenia”, jeśli sekcja je nazywa.
Copy nadal opisuje tylko to, co siatka umie.

#### 3. Dokumenty

**File**: `context/foundation/next-actions.md`, `CLAUDE.md`

**Intent**: Kolejka i reguły odzwierciedlają stan po zmianie.

**Contract**:
- `next-actions.md` Krok 10: „W TOKU” → zakończony; lista „co dziedziczy `design-planner`” zamieniona
  na krótki stan końcowy; odnotowane wprost: brak podglądu dnia na dotyk i brak strony `/konto` (właściciel: `M-03`).
- `CLAUDE.md` §Key conventions, dwa punkty: potwierdzenia przez `useConfirmDialog` z treścią z
  `src/lib/` (nie `window.confirm`); stan planu w UI to „zatwierdzony / do przejrzenia” (w kodzie `accepted`).
- `CLAUDE.md` §Architecture: `PlannerLayout` jako szkielet ekranów `/plan*`.

### Success Criteria:

#### Automated Verification:

- Lint, build, testy: `npm run lint && npm run build && npm test`
- Izolacja usunięta z kodu: `! grep -rn 'theme-legacy' src` (na początku zmiany 7 trafień: 4 w `global.css`, 3 w stronach)
- Tło kosmiczne usunięte: `! grep -rn 'bg-cosmic' src` (na początku zmiany trafienia w `global.css` i trzech stronach)
- Reguła o potwierdzeniach zapisana: `grep -c 'useConfirmDialog' CLAUDE.md` ≥ 1 (dziś `0`)
- Cały e2e zielony: `npm run test:e2e`

#### Manual Verification:

- Ostatni przegląd wszystkich ekranów (landing, auth, miesiąc, tydzień, dzień) przy 390 / 768 / 1440 px — fokus klawiatury wszędzie ten sam
- Ilustracja na landingu pokazuje tematy tygodni i nie obiecuje niczego ponad siatkę
- Po merge'u (właściciel: Janusz): jedno przejście na produkcji — logowanie, miesiąc, generowanie tygodnia, zatwierdzenie, usunięcie dnia, PDF

**Implementation Note**: Po tej fazie `/10x-impl-review`, potem PR. Merge do `master` = wydanie.

---

## Testing Strategy

### Unit Tests:

- `month-grid.test.ts`: wiersze (pominięty wiersz bez dni roboczych w miesiącu, tydzień na granicy),
  nagłówek tygodnia (0 / 1 / 2 hasła, przycinanie, kolejność), `isEmpty`, liczniki, plany weekendowe,
  `tileLabel` w nowym słownictwie.
- `week-day-controls.test.ts`, `week-generation.test.ts`, `plan-pdf/model.test.ts`: nowe brzmienie,
  odmiana liczebników.
- `confirmations.test.ts` (+ rozszerzone dwa powyższe): kształt `ConfirmationRequest` dla każdej
  z sześciu sytuacji, nazwy przycisków, `tone`, zdania ostrzegawcze.

### Integration Tests:

- Nowy `month-grid-fit.spec.ts` (ryzyko #14).
- Istniejący e2e jako strażnik: nazwy dostępne, podgląd dnia, wydruki, przeniesienie tematu, a po
  Fazie 6 — ryzyka #7 i #8 na własnym oknie.

### Manual Testing Steps:

1. Po każdej z Faz 1–4: ekran przy 390 / 768 / 1440 px obok makiety (tam, gdzie istnieje).
2. Faza 3–4: pełny przebieg generowania lokalnie z prawdziwym modelem.
3. Faza 5: wydruki PDF z dniem niezatwierdzonym.
4. Faza 6: sześć okien, klawiatura, podwójne kliknięcie.
5. Po merge'u: przejście na produkcji.

## Performance Considerations

Bez nowych zależności i bez nowych odczytów: siatka liczy wszystko z `summaries`, które strona już ma.
`ScopeToggle` i `ConfirmDialog` to kilkadziesiąt linii w istniejących wyspach. Panel przyklejony przez
`position: sticky`, bez JS.

## Migration Notes

Brak migracji danych i zmian API. Wycofanie = revert PR. Uwaga na pierwszy przebieg e2e po zmianach
(zimna pamięć Vite — `design-foundation` follow-up F9): nie uruchamiać `npm run build` w trakcie e2e;
czerwony pierwszy przebieg z błędami „chunk does not exist” powtórzyć, zanim uzna się go za regresję.

## References

- Research i decyzje N1–N17: `context/archive/2026-09-29-design-foundation/research.md` (§Follow-up)
- Poprzednia zmiana: `context/archive/2026-09-29-design-foundation/plan.md`, `reviews/impl-review.md` (F1, F2 — focus i obramowania)
- Pakiet: `context/foundation/design/` — makiety `design/screens/03-nowe-propozycje.png`, `04-plan-miesiaca.png`; `src/components/plan/MonthGrid.astro`, `layout/AppHeader.astro`, `ui/ScopeToggle.astro`, `billing/PaywallDialog.astro`
- Kolejka: `context/foundation/next-actions.md` Krok 10
- Warunki jakościowe siatki: `context/foundation/prd-v2.md:318-325`
- Reguły e2e: `tests/e2e/E2E-RULES.md`
- Lekcje o bramkach: `context/foundation/lessons.md` („Kryterium weryfikacji musi móc nie przejść”, „Bramka grepowa…”)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Powłoka planera i nagłówek aplikacji

#### Automated

- [x] 1.1 Lint, build, testy jednostkowe — 9167b80
- [x] 1.2 Pasek ma aktywną pozycję nawigacji — 9167b80
- [x] 1.3 Pasek bez kosmicznych klas — 9167b80
- [x] 1.4 Trzy strony używają wspólnego szkieletu — 9167b80
- [x] 1.5 Cały e2e zielony — 9167b80

#### Manual

- [ ] 1.6 Pasek przy 390 / 768 / 1440 px zgodny z makietami, aktywna pigułka właściwa
- [ ] 1.7 „Wyloguj się” widoczny i działa, nawigacja klawiaturą
- [ ] 1.8 Zawartość trzech ekranów bez zmian względem produkcji

### Phase 2: Siatka miesiąca

#### Automated

- [x] 2.1 Lint, build — 183ca25
- [x] 2.2 Testy modelu siatki przechodzą — 183ca25
- [x] 2.3 Strona miesiąca bez przypięcia — 183ca25
- [x] 2.4 Brak kosmicznych klas w siatce — 183ca25
- [x] 2.5 Siatka nie renderuje weekendu jako kolumny — 183ca25
- [x] 2.6 Nowy test wysokości przechodzi i był widziany na czerwono — 183ca25
- [x] 2.7 Cały e2e zielony — 183ca25

#### Manual

- [ ] 2.8 `/plan/month` przy 1440 px zgodne z makietą poza świadomymi odstępstwami
- [ ] 2.9 Przy 390 i 768 px siatka jest listą tygodni
- [ ] 2.10 Miesiąc zaczynający się w weekend i tydzień na granicy miesięcy
- [ ] 2.11 Tydzień z dwoma hasłami i pusty tydzień z CTA
- [ ] 2.12 Plan weekendowy w dopisku otwiera właściwy dzień
- [ ] 2.13 Podgląd dnia: hover, Tab, Esc, mieści się w ekranie

### Phase 3: Ekran tygodnia

#### Automated

- [x] 3.1 Lint, build, testy — 2f3ea34
- [x] 3.2 Strona tygodnia bez przypięcia — 2f3ea34
- [x] 3.3 Brak kosmicznych klas na tygodniu — 2f3ea34
- [x] 3.4 Etykieta wiązana przez e2e została — 2f3ea34
- [x] 3.5 Cały e2e zielony — 2f3ea34

#### Manual

- [ ] 3.6 `/plan/week` przy 390 / 768 / 1440 px, panel przyklejony od 900 px
- [ ] 3.7 Pełny przebieg generowania, zapisu, akceptacji i usunięcia lokalnie
- [ ] 3.8 Błąd generowania dnia i ponowienie czytelne
- [ ] 3.9 Przełącznik zakresu i przyciski PDF
- [ ] 3.10 Fokus widoczny, cele ≥ 44 px

### Phase 4: Ekran dnia

#### Automated

- [x] 4.1 Lint, build, testy — 652f4e7
- [x] 4.2 Żadna strona planera nie jest przypięta — 652f4e7
- [x] 4.3 Brak kosmicznych klas w całym planerze — 652f4e7
- [x] 4.4 Tytuł propozycji nadal jest nagłówkiem — 652f4e7
- [x] 4.5 Cały e2e zielony — 652f4e7

#### Manual

- [ ] 4.6 `/plan?date=` przy 390 / 768 / 1440 px: pusty, roboczy, zaakceptowany
- [ ] 4.7 Generowanie, edycja, „Zapytaj model”, akceptacja, cofnięcie, usunięcie
- [ ] 4.8 Usuwanie odsunięte od akceptacji
- [ ] 4.9 Dzień i tydzień spójne, przełącznik działa w obie strony
- [ ] 4.10 Fokus widoczny, cele ≥ 44 px, pole daty czytelne

### Phase 5: Słownictwo z makiet

#### Automated

- [x] 5.1 Lint, build — bcdd839
- [x] 5.2 Testy jednostkowe na nowym brzmieniu przechodzą — bcdd839
- [x] 5.3 Stare słownictwo akceptacji zniknęło z kodu i testów — bcdd839
- [x] 5.4 „Roboczy” jako stan planu zniknął, „dzień roboczy” został — bcdd839
- [x] 5.5 Stałe niosą nowe brzmienie — bcdd839
- [x] 5.6 Cały e2e zielony — bcdd839

#### Manual

- [ ] 5.7 Trzy ekrany bez starego słownictwa
- [ ] 5.8 Wydruki PDF z dniem niezatwierdzonym czytelne
- [ ] 5.9 Nazwy dostępne kafelków i przycisków w nowym brzmieniu

### Phase 6: Własne okno potwierdzeń

#### Automated

- [x] 6.1 Lint, build — d173446
- [x] 6.2 Testy treści potwierdzeń przechodzą — d173446
- [x] 6.3 W kodzie nie ma okna systemowego — d173446
- [x] 6.4 Testy nie nasłuchują okna systemowego — d173446
- [x] 6.5 Każde z sześciu miejsc pyta przez hook — d173446
- [x] 6.6 Testy odmowy są widziane na czerwono — d173446
- [x] 6.7 Cały e2e zielony — d173446

#### Manual

- [ ] 6.8 Sześć okien: wygląd, Esc, pułapka fokusu, powrót fokusu
- [ ] 6.9 Usuwanie i regeneracja: fokus na przycisku bezpiecznym
- [ ] 6.10 Tydzień mieszany: zawężenie i okno z liczbą dni
- [ ] 6.11 Podwójne kliknięcie nie otwiera dwóch okien
- [ ] 6.12 Okno przy 390 px

### Phase 7: Sprzątanie i przekazanie

#### Automated

- [x] 7.1 Lint, build, testy — b60f753
- [x] 7.2 Izolacja usunięta z kodu — b60f753
- [x] 7.3 Tło kosmiczne usunięte — b60f753
- [x] 7.4 Reguła o potwierdzeniach zapisana — b60f753
- [x] 7.5 Cały e2e zielony — b60f753

#### Manual

- [ ] 7.6 Przegląd wszystkich ekranów przy 390 / 768 / 1440 px
- [ ] 7.7 Ilustracja na landingu z tematami tygodni
- [ ] 7.8 Przejście na produkcji po merge'u
