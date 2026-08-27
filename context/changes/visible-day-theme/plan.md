# Widoczny podtytuł dnia — plan implementacji

## Overview

`day_plans.theme` — podtytuł dnia wycięty z hasła przy generowaniu tygodnia (S-03) — istnieje w bazie i jest pokazywany **wyłącznie** na tablicy tygodnia. Siatka miesiąca i widok dnia go nie czytają, więc pięć dni jednego hasła wygląda tam identycznie: pięć razy „Dinozaury".

Ten slice pokazuje istniejący podtytuł na tych dwóch powierzchniach. Jest **wyłącznie odczytowy**: bez migracji, bez zmiany ścieżki zapisu, bez dotykania generatora i promptów, bez nowego zapytania do bazy.

## Current State Analysis

**Dane są na miejscu i są w zasięgu.** Kolumna `day_plans.theme` powstała w `supabase/migrations/20260823232953_day_theme_and_absent_guard.sql` — `text`, nullowalna, z CHECK `day_plans_theme_length` (1–200 znaków; `THEME_MAX` w `src/lib/day-plan-limits.ts:38` jest jego lustrem). Komentarz kolumny mówi wprost: `null` to ważny stan trwały, nie brak danych.

**Odczyt miesiąca zatrzymuje się o jedną kolumnę za wcześnie.** `readMonthSummary` (`src/lib/services/day-plan-store.ts`) robi `select("plan_date, prompt, accepted_at")` na zakresie ~42 dni i mapuje wynik na `DayPlanSummary` (`src/types.ts:100-104`), który ma dokładnie te trzy pola. Dołożenie tematu to jedna kolumna w `select` i jedno pole w typie — **to samo zapytanie**, nie drugie.

**Kafelek ma dziś dokładnie jedną linię tekstu.** `src/components/plan/MonthGrid.astro` renderuje `summary.prompt` w `<span class="truncate text-[10px] leading-tight …" title={summary.prompt}>`, wewnątrz `<a class="flex min-h-14 flex-col justify-between …">`. `aria-label` kafelka niesie dziś datę ISO i status (`zaakceptowany` / `roboczy` / `brak planu`), a `title` — samo hasło.

**Widok dnia nie pokazuje tematu w ogóle.** `src/pages/plan.astro` czyta pełny plan przez `readDayPlan` po stronie serwera (`initialPlan`), renderuje nagłówek „Plan dnia" + `formatPlanDate(planDate)` + akapit instruktażowy, po czym oddaje `initialPlan` wyspie `DayPlanEditor`. Wyspa tematu nie używa i nie wysyła.

**Tablica tygodnia jest wzorcem odniesienia i jest poprawna.** `src/components/plan/WeekDayCard.tsx:43` rozstrzyga `day.plan?.plan.theme ?? day.theme`, a linia 60 renderuje `{theme && <p className="mt-1 text-sm text-purple-200/90">{theme}</p>}` — warunkowo, nigdy z placeholderem. To zachowanie, które dwie nowe powierzchnie mają powtórzyć (ryzyko 2 z roadmapy: rozjazd między ekranami byłby gorszy niż dzisiejsze pięć razy „Dinozaury").

**Brak runnera testów JS.** `package.json` ma `lint`, `build`, `test:db` (pgTAP przez `supabase test db`). Weryfikacja automatyczna w tym projekcie to `npm run lint`, `npx astro check`, `npm run build` plus punktowe `grep` — tak robi każdy zarchiwizowany plan.

**`lessons.md` nie ma tu zastosowania.** Wszystkie trzy reguły dotyczą zapisów zasilanych przez LLM i promptu jako warstwy bezpieczeństwa. Ten slice nic nie zapisuje i nie dotyka promptu.

## Desired End State

Nauczyciel patrzący na siatkę miesiąca odróżnia od siebie dni jednego hasła bez wchodzenia w żaden z nich: kafelek dnia z tematem pokazuje hasło (przygaszone) nad tematem (wyróżnionym), a najechanie myszą albo czytnik ekranu podają pełny, nieucięty tekst. Dzień bez tematu wygląda dokładnie tak jak dziś. Wejście w dzień pokazuje ten sam temat pod datą w nagłówku.

Weryfikacja: wygenerowany tydzień z jednego hasła daje w siatce miesiąca pięć kafelków z pięcioma różnymi drugimi liniami; dzień wygenerowany pojedynczo z `/plan?date=` ma jedną linię, tak jak przed zmianą.

### Key Discoveries:

- `readMonthSummary` (`src/lib/services/day-plan-store.ts`) — jedyna ścieżka odczytu miesiąca; `select("plan_date, prompt, accepted_at")` to jedyne miejsce, w którym temat trzeba dopuścić do siatki.
- `DayPlanSummary` (`src/types.ts:100-104`) — model odczytowy miesiąca, świadomie bez aktywności; dołożenie `theme` mieści się w tej intencji (jedna kolumna tej samej tabeli), dołożenie aktywności by się nie mieściło — to `S-07`.
- `WeekDayCard.tsx:60` — wzorzec renderowania tematu do skopiowania: warunek `theme &&`, ton `text-purple-200/90`, pozycja bezpośrednio pod tożsamością dnia.
- `20260823232953_day_theme_and_absent_guard.sql` — `coalesce` w `save_day_plan_generation` sprawia, że pojedyncza regeneracja dnia **zachowuje** temat zamiast go zerować.
- `MonthGrid.astro` — wewnętrzny `div.grid.grid-cols-7` ma domyślne `align-items: stretch`, więc kafelki w jednym wierszu tygodnia i tak wyrównują się do najwyższego; mieszanie dni z tematem i bez tematu **nie** produkuje poszarpanych wysokości.
- Brak `*.test.ts` / `vitest` / `playwright` w repo — bramka automatyczna to lint + `astro check` + build + `grep`.

## What We're NOT Doing

Zakres ustalony 2026-08-26 z użytkownikiem i potwierdzony w tej sesji planowania:

- **Nie nadajemy tematu dniowi generowanemu pojedynczo** z `/plan?date=`. To wymagałoby dotknięcia ścieżki generowania dnia i promptu; `null` zostaje ważnym stanem trwałym.
- **Nie iterujemy na promptcie szkicu tygodnia**, żeby tematy lepiej czytały się jako podtytuł. Jakość tematów jest poza tym slice'em.
- **Nie dotykamy `WeekDayCard.tsx` ani `WeekPlanBoard.tsx`.** Tablica tygodnia już pokazuje temat poprawnie; jej kopia w wyspie (`day.theme`) i jej komunikat „temat tygodnia dla niego przepadł" zostają bez zmian.
- **Nie wyciągamy wspólnego komponentu/helpera** do renderowania tematu. Trzy wywołania (wyspa React, komponent Astro, strona Astro) mają różne rozmiary, tony i zachowania dla `null`; wspólna jednostka byłaby większą maszynerią niż trzy warunkowe renderowania.
- **Nie dokładamy aktywności do odczytu miesiąca** — to `S-07` (`month-day-preview`, dziś `blocked`).
- **Nie uczymy odczytu miesiąca skreślenia miękkiego** — to `S-05` (`delete-day-plan`, dziś `ready`, może iść równolegle).
- **Nie ruszamy migracji ani RLS.** Kolumna, CHECK i granty istnieją od S-03.

## Implementation Approach

Dwie fazy, każda odpowiadająca jednemu ekranowi, każda samodzielnie wdrażalna i weryfikowalna.

Faza 1 przepycha `theme` przez jedyną ścieżkę odczytu miesiąca i przebudowuje kafelek na dwuliniowy. Faza 2 dokłada linię w nagłówku SSR widoku dnia, korzystając z planu, który ta strona i tak już czyta.

Kolejność jest istotna z powodu ryzyka 3 z roadmapy: `S-08`, `S-05` i `S-07` dokładają do tego samego zapytania miesiąca. `S-08` idzie pierwszy, bo ustala, co kafelek pokazuje **w stanie spoczynku**, zanim `S-07` zdecyduje, co pokazuje po interakcji.

## Critical Implementation Details

**Temat nie może zdezaktualizować się w nagłówku SSR widoku dnia — i to nie jest przypadek, tylko własność ścieżki zapisu.** `DayPlanEditor` wysyła do `/api/day-plan/generate` wyłącznie `plan_date`, `prompt` i `confirm_replace` (`src/components/plan/DayPlanEditor.tsx:204`). Brak `theme` w żądaniu oznacza pominięty `p_theme` (`day-plan-store.ts`, `callSaveGeneration`), a `coalesce` w `save_day_plan_generation` zachowuje istniejącą wartość. Z poziomu `/plan?date=` temat jest więc **niezmienny**: dzień z tematem go nie traci przy regeneracji, dzień bez tematu go nie zyskuje. Dlatego podtytuł może być statycznym tekstem SSR i nie musi wchodzić do wyspy ani do jej ścieżek odświeżania.

**Wysokość kafelka.** Dzisiejszy `min-h-14` (56px) mieści treść: numer dnia (`text-xs`, ~16px) + jedna linia `text-[10px] leading-tight` (~12px) + `p-1.5` (12px) ≈ 40px. Druga linia dokłada ~12px, czyli ~52px — technicznie wciąż poniżej 56px, ale bez zapasu i przy `justify-between`, które rozepchnie linie na skrajne krawędzie. Podłogę podnosimy do `min-h-16` (64px) i to **wybór między 16 a 18 rozstrzyga wizualna kontrola w Manual Verification**, nie arytmetyka.

## Phase 1: Podtytuł w siatce miesiąca

### Overview

Temat dociera z bazy do kafelka i jest na nim widoczny — jako druga linia, w tooltipie i w nazwie dostępnej.

### Changes Required:

#### 1. Model odczytowy miesiąca

**File**: `src/types.ts`

**Intent**: `DayPlanSummary` zyskuje temat, żeby siatka miesiąca mogła go pokazać. Doklejamy też jedno zdanie do istniejącego komentarza typu: `theme` jest nullowalny i `null` to stan trwały, a nie brak danych — bez tego następny czytelnik potraktuje go jako przypadek brzegowy.

**Contract**: `readonly theme: string | null` w `interface DayPlanSummary`. `string | null`, nie `string | undefined` — to bezpośrednie odwzorowanie nullowalnej kolumny, tak jak `theme: string | null` w `src/db/database.types.ts:86` i w `DayState` (`WeekDayCard.tsx:26`).

#### 2. Odczyt miesiąca

**File**: `src/lib/services/day-plan-store.ts`

**Intent**: `readMonthSummary` czyta czwartą kolumnę i przepuszcza ją do wyniku. To wciąż jedno zapytanie na cały zakres — bez dodatkowego round-tripu i bez sięgania do `activities`.

**Contract**: `select("plan_date, prompt, accepted_at, theme")`; mapowanie wzbogacone o `theme: row.theme`. Doc-comment funkcji zostaje — nadal „zatrzymuje się na `day_plans`", co po tej zmianie jest wciąż prawdą.

#### 3. Kafelek dnia

**File**: `src/components/plan/MonthGrid.astro`

**Intent**: Kafelek dnia z tematem pokazuje dwie linie: hasło przygaszone u góry jako kotwica tygodnia, temat wyróżniony pod nim jako to, co odróżnia pięć dni od siebie. Dzień bez tematu renderuje się dokładnie jak dziś — jedna linia, bez placeholdera i bez rezerwowanej pustej linii. Tooltip i nazwa dostępna niosą pełny tekst, bo obie linie są ucinane przy ~12–16 znakach i bez tego temat byłby nieosiągalny dla dotyku i dla czytnika ekranu.

**Contract**:

- Blok tekstowy renderowany dalej pod warunkiem `summary` (bez planu — bez tekstu, jak dziś).
- Linia hasła: `truncate text-[10px] leading-tight`, ton przygaszony względem dzisiejszego `text-blue-100/70` (np. `text-blue-100/50`).
- Linia tematu: renderowana **tylko** gdy `summary.theme` — `truncate text-[10px] leading-tight text-purple-200/90`. Ton fioletowy jest cytatem z `WeekDayCard.tsx:60` i to jest jego jedyne uzasadnienie; nie wolno go tu wymyślić na nowo.
- `min-h-14` → `min-h-16` na `<a>`.
- `title`: `summary.theme ? \`${summary.prompt} — ${summary.theme}\` : summary.prompt`.
- `aria-label`: rozszerzony o treść przed statusem. Dzień z planem: `Plan na <ISO> — <hasło>[ — <temat>] — zaakceptowany|roboczy`. Dzień bez planu: bez zmian (`Plan na <ISO> — brak planu`).
- `WeekDayCard.tsx` i `WeekPlanBoard.tsx` pozostają nietknięte.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Typy i szablony Astro przechodzą: `npx astro check`
- Build produkcyjny przechodzi: `npm run build`
- Odczyt miesiąca niesie temat: `grep -n 'plan_date, prompt, accepted_at, theme' src/lib/services/day-plan-store.ts` zwraca trafienie
- Tablica tygodnia nietknięta: `git diff --name-only` nie zawiera `src/components/plan/WeekDayCard.tsx` ani `src/components/plan/WeekPlanBoard.tsx`
- Brak placeholdera dla dnia bez tematu: `grep -rn 'bez tematu\|brak tematu' src/components/plan/MonthGrid.astro` zwraca pusto

#### Manual Verification:

- Tydzień wygenerowany z jednego hasła daje w siatce miesiąca pięć kafelków z pięcioma różnymi drugimi liniami
- Dzień wygenerowany pojedynczo z `/plan?date=` ma w siatce jedną linię — dokładnie jak przed zmianą
- Wysokość kafelka jest wystarczająca: obie linie są czytelne i nie zlewają się z numerem dnia (jeśli nie — `min-h-16` → `min-h-18`)
- Kafelki w jednym wierszu tygodnia mają równą wysokość mimo mieszania dni z tematem i bez
- Najechanie na kafelek pokazuje pełne „hasło — temat"
- Nawigacja klawiaturą po siatce czyta hasło i temat przed statusem
- Miesiąc z sześcioma wierszami tygodni nadal mieści się rozsądnie na ekranie laptopa
- Legenda pod siatką i przycisk „Zaplanuj tydzień" nie rozjechały się po zmianie wysokości kafelka

**Implementation Note**: Po zakończeniu tej fazy i przejściu weryfikacji automatycznej zatrzymaj się i poczekaj na ręczne potwierdzenie od człowieka, zanim przejdziesz do fazy 2.

---

## Phase 2: Podtytuł w widoku dnia

### Overview

Wejście w dzień pokazuje ten sam temat co kafelek, pod datą w nagłówku.

### Changes Required:

#### 1. Nagłówek widoku dnia

**File**: `src/pages/plan.astro`

**Intent**: Nagłówek strony dnia zyskuje linię z tematem pod sformatowaną datą — ten sam tekst, który kafelek pokazał w siatce, więc przejście z miesiąca do dnia potwierdza wybór zamiast go gubić. Tekst zostaje w nagłówku SSR i nie wchodzi do wyspy: temat jest z poziomu tej strony niezmienny (patrz Critical Implementation Details), a `DayPlanEditor` nie ma powodu przyjmować kolejnego propa tylko po to, żeby wyświetlić stały napis (reguła z CLAUDE.md — Astro do wyświetlania, React do stanu).

**Contract**: Renderowanie warunkowe na `initialPlan?.plan.theme`, wstawione bezpośrednio po `<p class="mt-1 text-lg text-blue-100">{formatPlanDate(planDate)}</p>` i **przed** akapitem instruktażowym. Ton `text-purple-200/90` — ten sam cytat z `WeekDayCard.tsx:60` co w fazie 1. Sam temat, bez hasła: hasło jest widoczne w polu „Hasło dnia" w karcie tuż poniżej, a tablica tygodnia też pokazuje sam temat.

Ścieżka `readFailed` nie wymaga osobnej obsługi — gdy odczyt padł, `initialPlan` jest `null` i warunek nie renderuje nic. `DayPlanEditor.tsx` pozostaje nietknięty.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Typy i szablony Astro przechodzą: `npx astro check`
- Build produkcyjny przechodzi: `npm run build`
- Wyspa nietknięta: `git diff --name-only` nie zawiera `src/components/plan/DayPlanEditor.tsx`
- Temat renderowany warunkowo: `grep -n 'plan.theme' src/pages/plan.astro` zwraca trafienie

#### Manual Verification:

- Wejście z siatki miesiąca w dzień z tematem pokazuje w nagłówku ten sam tekst, który był na kafelku
- Dzień bez tematu ma nagłówek dokładnie taki jak przed zmianą — bez pustej linii i bez przesunięcia akapitu instruktażowego
- Regeneracja planu z `/plan?date=` **nie** usuwa podtytułu z nagłówka po odświeżeniu strony (potwierdza `coalesce` w ścieżce zapisu)
- Stan błędu odczytu (`readFailed`) nadal pokazuje panel „Nie udało się wczytać tego dnia" bez śladu po podtytule
- Trzy ekrany — miesiąc, tydzień, dzień — pokazują dla tego samego dnia ten sam tekst tematu

**Implementation Note**: Po zakończeniu tej fazy i przejściu weryfikacji automatycznej zatrzymaj się i poczekaj na ręczne potwierdzenie od człowieka.

---

## Testing Strategy

Projekt nie ma runnera testów JS — `package.json` wystawia `lint`, `build` i `test:db` (pgTAP). Ten slice nie dokłada testów bazodanowych, bo nie zmienia schematu ani ścieżki zapisu; istniejące testy pgTAP zostają bramką dla kolumny i CHECK-a, które S-03 już pokrył.

### Weryfikacja statyczna:

- `npm run lint`, `npx astro check`, `npm run build` po każdej fazie
- Punktowe `grep` wymienione w Success Criteria — pilnują, że zmiana trafiła tam, gdzie miała, i **nie** trafiła tam, gdzie nie miała

### Testowanie ręczne — scenariusze:

1. Wygeneruj tydzień z jednego hasła (`/plan/week?from=<poniedziałek>`), wróć do `/plan/month` — pięć kafelków ma pięć różnych drugich linii.
2. Wygeneruj dzień pojedynczo z `/plan?date=` na dzień spoza tego tygodnia, wróć do miesiąca — kafelek ma jedną linię.
3. Wejdź w dzień z tematem — nagłówek pokazuje ten sam tekst co kafelek.
4. Zregeneruj ten dzień z `/plan?date=`, odśwież — podtytuł nadal jest.
5. Najedź myszą na kafelek z długim tematem — tooltip pokazuje pełne „hasło — temat".
6. Przejdź siatkę klawiaturą (Tab) z włączonym czytnikiem ekranu — hasło i temat są czytane przed statusem.
7. Otwórz miesiąc, w którym generowanie tygodnia raz padło (dzień bez wiersza planu) — kafelek jest w stanie „brak planu", bez pustej linii.

## Performance Considerations

Brak wpływu. `readMonthSummary` czyta jedną kolumnę więcej w tym samym zapytaniu na tym samym zakresie (~42 wiersze) — bez dodatkowego round-tripu, bez `activities`, bez zmiany planu zapytania. Kafelek rośnie o jeden warunkowy element DOM, w siatce renderowanej po stronie serwera bez hydratacji.

## Migration Notes

Brak migracji. Kolumna `theme`, CHECK `day_plans_theme_length` i granty kolumnowe dla `authenticated` istnieją od `20260823232953_day_theme_and_absent_guard.sql`. Rollback tego slice'a to cofnięcie zmian w czterech plikach źródłowych — nic nie zostaje w bazie.

## References

- Roadmapa, pozycja `S-08`: `context/foundation/roadmap.md`
- Wzorzec renderowania tematu: `src/components/plan/WeekDayCard.tsx:43,60`
- Pochodzenie kolumny i `coalesce` w zapisie: `supabase/migrations/20260823232953_day_theme_and_absent_guard.sql`
- Ścieżka odczytu miesiąca: `src/lib/services/day-plan-store.ts` (`readMonthSummary`)
- Poprzedni slice na tej samej powierzchni: `context/archive/2026-08-26-month-home/plan.md`

## Progress

> Konwencja: `- [ ]` do zrobienia, `- [x]` zrobione. Dopisz ` — <commit sha>`, kiedy krok wyląduje. Nie zmieniaj nazw kroków.

### Phase 1: Podtytuł w siatce miesiąca

#### Automated

- [x] 1.1 Lint przechodzi: `npm run lint`
- [x] 1.2 Typy i szablony Astro przechodzą: `npx astro check`
- [x] 1.3 Build produkcyjny przechodzi: `npm run build`
- [x] 1.4 Odczyt miesiąca niesie temat (`grep` na `select` w `day-plan-store.ts`)
- [x] 1.5 Tablica tygodnia nietknięta (`git diff --name-only` bez `WeekDayCard.tsx` i `WeekPlanBoard.tsx`)
- [x] 1.6 Brak placeholdera dla dnia bez tematu (`grep` na `MonthGrid.astro`)

#### Manual

- [ ] 1.7 Pięć dni jednego hasła ma pięć różnych drugich linii
- [ ] 1.8 Dzień bez tematu ma jedną linię, jak przed zmianą
- [ ] 1.9 Wysokość kafelka wystarczająca dla dwóch linii (rozstrzygnięcie `min-h-16` vs `min-h-18`)
- [ ] 1.10 Kafelki w wierszu tygodnia mają równą wysokość mimo mieszania dni z tematem i bez
- [ ] 1.11 Tooltip pokazuje pełne „hasło — temat"
- [ ] 1.12 Nazwa dostępna czyta hasło i temat przed statusem
- [ ] 1.13 Miesiąc z sześcioma wierszami mieści się na ekranie laptopa
- [ ] 1.14 Legenda i przycisk „Zaplanuj tydzień" nie rozjechały się

### Phase 2: Podtytuł w widoku dnia

#### Automated

- [ ] 2.1 Lint przechodzi: `npm run lint`
- [ ] 2.2 Typy i szablony Astro przechodzą: `npx astro check`
- [ ] 2.3 Build produkcyjny przechodzi: `npm run build`
- [ ] 2.4 Wyspa nietknięta (`git diff --name-only` bez `DayPlanEditor.tsx`)
- [ ] 2.5 Temat renderowany warunkowo (`grep` na `plan.astro`)

#### Manual

- [ ] 2.6 Nagłówek dnia pokazuje ten sam tekst co kafelek w siatce
- [ ] 2.7 Dzień bez tematu ma nagłówek jak przed zmianą
- [ ] 2.8 Regeneracja z `/plan?date=` nie usuwa podtytułu po odświeżeniu
- [ ] 2.9 Stan `readFailed` bez śladu po podtytule
- [ ] 2.10 Miesiąc, tydzień i dzień pokazują dla tego samego dnia ten sam tekst
