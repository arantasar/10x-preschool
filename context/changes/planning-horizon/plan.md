# Horyzont planowania (S-31) — plan implementacji

## Overview

Nauczycielka generuje plany tylko dla dni w oknie liczonym od dziś (Europe/Warsaw): od początku
poprzedniego miesiąca do końca następnego, z obu stron dopełnionym do pełnego tygodnia. Próba
wygenerowania dnia dalej w przód dostaje po polsku datę, od której będzie to możliwe; próba
wygenerowania dnia sprzed okna dostaje zdanie, że na te dni generować już się nie da. Zapisane plany
zostają bez zmian, a ich oglądanie, ręczna edycja, poprawianie aktywności (refine), zatwierdzanie,
usuwanie i druk nie podlegają oknu.

Realizuje `S-31` z `roadmap.md` (decyzja 2026-10-18: zapas planów na lata w okresie próbnym blokuje
horyzont, nie długość próby). Musi wejść przed falą nowych kont z `S-30`.

## Current State Analysis

- Nic nie ogranicza daty generowania. `generateDayPlanRequestSchema` i
  `generateWeekDayRequestSchema` (`src/lib/services/day-plan-contract.ts:202`, `:256`) przyjmują
  każdą datę `z.iso.date()`, `weekOutlineRequestSchema` (`:239`) każdy zestaw 1–5 dat, a
  `saveWeekPlanRequestSchema` (`:316`) zapisze dni pod dowolne daty.
- Limit fair use (150 dni-generacji w miesiącu, `src/lib/services/fair-use.ts`) liczy ilość, nie
  daty: w czterech miesiącach do 31.01.2027 to kilka lat szkolnych na zapas — w przód albo wstecz.
- Model wołają cztery trasy: `generate.ts`, `week/day.ts`, `week/outline.ts` (niosą daty) i
  `refine.ts` (nie niesie daty — poprawia jedną aktywność w otwartym planie). Każda z nich woła
  `claimGeneration` przed modelem.
- „Dziś” nauczycielki to `todayIsoDate()` (`src/lib/day-plan-dates.ts:37`, Europe/Warsaw); arytmetyka
  dat kalendarzowych to `addDays`, `addMonths`, `resolveWeekStart` w tym samym pliku, wszystkie w UTC.
- Wyspy pokazują każdą odpowiedź błędu przez `isErrorBody` i dodają link kontaktowy tylko przy
  `isLimitBody` (`src/lib/day-plan-guards.ts:186`, `:199`); `retryable: false` chowa „Spróbuj ponownie”.
- `plan.astro` i `plan/week.astro` rozstrzygają dzień/tydzień po stronie serwera i przekazują go do
  `DayPlanEditor` / `WeekPlanBoard`; formularze generowania są w `DayPlanEditor.tsx:556` i
  `WeekPlanBoard.tsx:913`.

## Desired End State

- Dziś (2026-10-18) okno to **2026-08-31 – 2026-12-06**: poniedziałek tygodnia, w którym wypada
  1 września, do niedzieli tygodnia, w którym wypada 30 listopada.
- `POST` na `generate`, `week/day`, `week/outline` i `week/save` z choćby jedną datą spoza okna
  odpowiada **422** z `{ error, retryable: false, horizon: { opens_on } }`, nie dotyka bazy i nie
  rezerwuje wiersza w `generation_ledger`.
- `/plan?date=…` i `/plan/week?from=…` poza oknem pokazują notkę zamiast formularza generowania;
  zapisane plany na tych stronach działają jak dziś.
- `/pomoc` odpowiada, jak daleko naprzód można planować.

Weryfikacja: testy jednostkowe reguły i tras (`npm test`), ręcznie w `npm run dev` na dniu
z grudnia/stycznia i z sierpnia.

### Key Discoveries:

- Testy tras mają daty na sztywno (`"2026-09-14"` w `generate.test.ts:34`, `week/day.test.ts:40`,
  `week/outline.test.ts:35`, `week/save.test.ts:20`, `week/day.db.test.ts:32`). Dziś są w oknie, ale
  od 2026-11-01 dolna granica to 2026-09-28 — bez przypiętego zegara te testy zaczną padać same
  z siebie. `generate.test.ts:73` i `week/day.test.ts:78` już mają `vi.useFakeTimers()`, tylko bez
  `vi.setSystemTime`.
- Okno zależy wyłącznie od miesiąca dzisiejszej daty, więc „od kiedy” dla dnia za daleko to zawsze
  1. dzień jakiegoś miesiąca.
- Dopełnienie do tygodnia z obu stron sprawia, że tydzień roboczy (pn–pt) jest zawsze w całości
  w oknie albo w całości poza nim — tablica tygodnia nie potrzebuje stanu „część dni zablokowana”.

## What We're NOT Doing

- Wyjątków dla kont z `fair_use_overrides` — okno obowiązuje wszystkich (decyzja 2026-10-18).
- Zwolnienia regeneracji istniejącego planu — generowanie dnia poza oknem jest odmawiane bez względu
  na to, czy plan już istnieje.
- Sprawdzania okna w `refine.ts` (brak daty; to edycja otwartego planu) ani w `accept`, `activity/[id]`,
  `DELETE /api/day-plan`, `month` (odczyt i druk).
- Konfiguracji w zmiennych środowiskowych — reguła jest stałą w kodzie.
- Oznaczania dni poza oknem na siatce `/plan/month`.
- Zmian w bazie danych — bez migracji.

## Implementation Approach

Jedna czysta funkcja decyduje, czy zestaw dat mieści się w oknie dla danego „dziś”, i zwraca
odmowę z danymi do zdania. Trasy wołają ją zaraz po walidacji zod — przed odczytem z bazy i przed
`claimGeneration` — więc odmowa jest darmowa i nie zostawia śladu w ledgerze. Strony liczą tę samą
odmowę po stronie serwera dla dnia/tygodnia, który pokazują, i podają ją wyspom jako prop; UI jest
wygodą, egzekwuje serwer.

## Critical Implementation Details

**Kolejność w trasach.** Sprawdzenie okna stoi po `safeParse`, a przed `context.locals.supabase` /
`readDayPlan` / `claimGeneration`. W `week/outline.ts` i `week/save.ts` jedna data spoza okna odmawia
całego żądania (zapis tygodnia jest wszystko-albo-nic).

**Zegar w testach.** Każdy test trasy, którego dane zawierają datę, przypina `vi.setSystemTime` na
moment, w którym ta data jest w oknie (np. `2026-09-15T10:00:00+02:00`); testy `.db.test.ts` bez
fałszywych timerów dostają `vi.useFakeTimers({ toFake: ["Date"] })` albo równoważne przypięcie,
żeby nie zatrzymać `fetch`/supabase.

## Phase 1: Reguła horyzontu

### Overview

Czysty moduł liczący okno, odmowę i polskie zdania, pokryty testami jednostkowymi.

### Changes Required:

#### 1. Moduł reguły

**File**: `src/lib/planning-horizon.ts` (nowy)

**Intent**: Jedno miejsce, które wie, co znaczy „za daleko” i „za dawno”; używane przez trasy
i strony, żeby obie strony nie mogły się rozjechać (ta sama motywacja co `day-plan-dates.ts`).

**Contract**:

- `generationWindow(today: string): { first: string; last: string }` — `first` = poniedziałek
  tygodnia zawierającego 1. dzień miesiąca poprzedzającego `today`; `last` = niedziela tygodnia
  zawierającego ostatni dzień miesiąca następującego po `today`. Zbudowane na `addMonths`,
  `addDays`, `resolveWeekStart`.
- `type HorizonRefusal = { kind: "too_far"; opensOn: string } | { kind: "too_old"; firstAllowed: string }`.
- `checkGenerationDates(dates: readonly string[], today = todayIsoDate()): HorizonRefusal | null` —
  `null`, gdy każda data jest w oknie. Przy kilku datach poza oknem decyduje najdalsza w przód
  (`too_far` ma pierwszeństwo, bo jego `opensOn` jest użyteczne); `opensOn` = 1. dzień najwcześniejszego
  miesiąca `M`, dla którego `generationWindow(M-01).last >= data`.
- `horizonMessage(refusal: HorizonRefusal): string` — `too_far`: „Ten dzień będzie można zaplanować
  od {d MMMM rrrr}.” (zawsze z rokiem, formatem jak `RESETS_ON_FORMAT` w `day-plan-http.ts`);
  `too_old`: „Plany można generować od {data} — wcześniejsze
  dni możesz przeglądać, poprawiać i drukować, ale nie generować.” Dla zestawu (tydzień) zdania
  mówią o „tym tygodniu” — funkcja przyjmuje `scope: "day" | "week"`.

#### 2. Testy reguły

**File**: `src/lib/planning-horizon.test.ts` (nowy)

**Intent**: Przypiąć granice, na których reguła kalendarzowa najłatwiej się myli.

**Contract**: przypadki co najmniej: dziś 2026-10-18 → okno 2026-08-31…2026-12-06; dziś 1. i ostatni
dzień miesiąca (skok okna); przełom roku (dziś 2026-12-15 → `last` w lutym 2027, `first` w listopadzie);
luty w roku przestępnym i nieprzestępnym; miesiąc zaczynający się w poniedziałek (bez dopełnienia
w tył) i kończący w niedzielę; dzień `last` i `last + 1`, `first` i `first − 1`; `opensOn` dla dnia
w tygodniu dopełnienia (np. 2026-12-03 przy dziś 2026-10-18 jest w oknie; 2026-12-07 → `opensOn`
2026-11-01); pusty zestaw dat → `null`.

### Success Criteria:

#### Automated Verification:

- Testy reguły przechodzą: `npx vitest run src/lib/planning-horizon.test.ts`
- Lint przechodzi: `npm run lint`

#### Manual Verification:

- Zdania z `horizonMessage` przeczytane na głos brzmią jak polski, nie jak tłumaczenie (data
  w dopełniaczu: „od 1 listopada 2026”).

**Implementation Note**: Po fazie i zielonych testach automatycznych zatrzymaj się na ręczne
potwierdzenie przed fazą 2.

---

## Phase 2: Egzekwowanie po stronie serwera

### Overview

Cztery trasy odmawiają dat spoza okna jedną wspólną odpowiedzią, zanim dotkną bazy lub ledgera.

### Changes Required:

#### 1. Odpowiedź odmowy

**File**: `src/lib/services/day-plan-http.ts`

**Intent**: Wspólna odpowiedź 422, której wyspy nie muszą znać — `isErrorBody` ją pokaże,
`retryable: false` schowa „Spróbuj ponownie”, a brak `limit` nie doda linku kontaktowego.

**Contract**: `outsideHorizon(refusal: HorizonRefusal, scope: "day" | "week"): Response` → status 422,
`DayPlanErrorBody` z `error: horizonMessage(…)`, `retryable: false`, `horizon: { opens_on: string | null }`
(`null` dla `too_old`). `DayPlanErrorBody` dostaje opcjonalne `horizon`, tak jak ma `limit`.

#### 2. Trasy

**Files**: `src/pages/api/day-plan/generate.ts`, `week/day.ts`, `week/outline.ts`, `week/save.ts`

**Intent**: Sprawdzić okno po walidacji, przed bazą i przed `claimGeneration`.

**Contract**: `generate.ts` i `week/day.ts` — `checkGenerationDates([plan_date])`, `scope: "day"`;
`week/outline.ts` — `parsed.data.dates`, `scope: "week"`; `week/save.ts` —
`parsed.data.days.map(d => d.plan_date)`, `scope: "week"`. Odmowa → `return outsideHorizon(…)`.
Komentarze nagłówkowe tras dostają jedno zdanie o horyzoncie (jak dziś o fair use).

#### 3. Testy tras

**Files**: `generate.test.ts`, `week/day.test.ts`, `week/outline.test.ts`, `week/save.test.ts`,
`week/day.db.test.ts` (oraz każdy inny test tych tras z datą na sztywno)

**Intent**: Nowe przypadki odmowy i odporność istniejących testów na upływ czasu.

**Contract**: w każdym pliku przypięty zegar (`vi.setSystemTime`), przy którym dotychczasowe daty są
w oknie. Nowe przypadki na trasę: data za daleko → 422, `horizon.opens_on` zgodne z regułą,
`error` po polsku, **`rpc` i `fetch` niewywołane** (brak claimu i modelu); data za dawno → 422,
`opens_on: null`. Dla `outline` i `save`: jeden dzień spoza okna w zestawie → odmowa całości.
Dla `generate`: odmowa także wtedy, gdy dzień ma zapisany plan (bez odczytu `readDayPlan`).

#### 4. Zasada w CLAUDE.md

**File**: `CLAUDE.md`

**Intent**: Następna trasa wołająca model nie może pominąć okna, tak jak nie może pominąć claimu.

**Contract**: nowy akapit `### Planning horizon` po `### Fair use`: okno (reguła), moduł
`src/lib/planning-horizon.ts`, lista tras (`generate`, `week/day`, `week/outline`, `week/save`), że
sprawdzenie stoi przed bazą i claimem, że `refine` jest zwolniony (brak daty — edycja), że
overrides go nie omijają, i że testy tras z datą przypinają zegar.

### Success Criteria:

#### Automated Verification:

- Wszystkie testy jednostkowe przechodzą: `npm test`
- Każda z czterech tras wywołuje sprawdzenie dokładnie raz:
  `grep -c "checkGenerationDates(" src/pages/api/day-plan/generate.ts src/pages/api/day-plan/week/day.ts src/pages/api/day-plan/week/outline.ts src/pages/api/day-plan/week/save.ts`
  zwraca `1` dla każdego pliku (przed fazą zwraca `0` — bramka potrafi nie przejść)
- Testy integracyjne z lokalną bazą przechodzą: `npm run test:db:api`
- Lint i build przechodzą: `npm run lint && npm run build`

#### Manual Verification:

- W `npm run dev`, z narzędzi deweloperskich: `POST /api/day-plan/generate` z `plan_date`
  w styczniu 2027 → 422 i zdanie „Ten dzień będzie można zaplanować od 1 grudnia 2026.”;
  w lokalnym Supabase brak nowego wiersza w `generation_ledger`.

**Implementation Note**: Po fazie i zielonych testach automatycznych zatrzymaj się na ręczne
potwierdzenie przed fazą 3.

---

## Phase 3: UI i treść

### Overview

Strony dnia i tygodnia mówią o oknie, zanim nauczycielka wpisze hasło; FAQ mówi, jak daleko
można planować; roadmapa odnotowuje zakończenie.

### Changes Required:

#### 1. Strony

**Files**: `src/pages/plan.astro`, `src/pages/plan/week.astro`

**Intent**: Policzyć odmowę dla pokazywanego dnia / dni roboczych tygodnia po stronie serwera
i podać ją wyspie.

**Contract**: nowy prop `horizonNotice: string | null` (gotowe zdanie z `horizonMessage`) na
`DayPlanEditor` i `WeekPlanBoard`.

#### 2. Wyspy

**Files**: `src/components/plan/DayPlanEditor.tsx`, `src/components/plan/WeekPlanBoard.tsx`

**Intent**: Gdy `horizonNotice` nie jest `null`, w miejscu formularza generowania stoi notka z tym
zdaniem; zapisany plan dnia, karty dni tygodnia, refine, edycja, zatwierdzanie, usuwanie i druk
działają bez zmian. Gdy dzień nie ma planu i jest poza oknem, strona pokazuje tylko notkę.

**Contract**: formularze w `DayPlanEditor.tsx:556` i `WeekPlanBoard.tsx:913` renderowane warunkowo;
notka jako tekst (nie `role="alert"` — to stan strony, nie zdarzenie), w stylu istniejących notek
informacyjnych na planie. Bez nowego stanu w reducerach.

#### 3. FAQ

**File**: `src/lib/faq.ts`

**Intent**: Prawdziwa dziś odpowiedź na „Jak daleko naprzód mogę planować?” w sekcji `dzialanie`.

**Contract**: nowy `FaqItem`: plany generujesz do końca następnego miesiąca i od początku
poprzedniego; zapisane plany możesz zawsze przeglądać, poprawiać, zatwierdzać i drukować. Bez słów
„okres próbny”, „Basic”, ceny.

#### 4. Roadmapa

**File**: `context/foundation/roadmap.md`

**Intent**: Zamknąć niewiadome `S-31` decyzjami z planu i ustawić status.

**Contract**: w bloku `### S-31` niewiadome przekreślone z rozstrzygnięciem (okno kalendarzowe,
stała w kodzie, cztery trasy + `refine` zwolniony); status `done` w bloku i w tabeli `At a glance`;
wiersz Backlog Handoff bez „rekomendacja: 8 tygodni”.

### Success Criteria:

#### Automated Verification:

- Testy, lint i build przechodzą: `npm test && npm run lint && npm run build`
- Oba widoki dostają prop: `grep -c "horizonNotice={" src/pages/plan.astro src/pages/plan/week.astro`
  zwraca `1` dla każdego pliku
- Poza `S-31` roadmapa nie zmieniła treści: `git diff -w master..HEAD -- context/foundation/roadmap.md`
  pokazuje zmiany tylko w wierszach `S-31` (szum wyrównania tabel pominięty przez `-w`)

#### Manual Verification:

- `/plan?date=2027-01-12` bez planu: notka „Ten dzień będzie można zaplanować od 1 grudnia 2026.”, brak
  pola hasła i przycisku.
- `/plan/week?from=2027-01-11`: notka zamiast formularza tygodnia; nawigacja tydzień wstecz/naprzód działa.
- `/plan?date=2026-08-10` z planem zapisanym wcześniej (wstaw w lokalnej bazie): plan widoczny,
  edycja, refine, zatwierdzanie, usuwanie i PDF działają; notka zamiast „Wygeneruj ponownie”.
- `/plan?date=2026-12-04` i `/plan/week?from=2026-11-30`: formularz jest (tydzień dopełnienia).
- `/pomoc`: nowe pytanie i odpowiedź zgodna z zachowaniem.
- Telefon (≈375 px): notka nie rozpycha układu.

**Implementation Note**: Po fazie i zielonych testach automatycznych zatrzymaj się na ręczne
potwierdzenie.

---

## Testing Strategy

### Unit Tests:

- `planning-horizon.test.ts`: okno, granice miesięcy i roku, luty, dopełnienie tygodnia, `opensOn`,
  pierwszeństwo `too_far`.
- Testy tras: odmowa przed claimem i modelem (`rpc`/`fetch` niewywołane), kształt 422, odmowa całego
  zestawu w `outline`/`save`, odmowa regeneracji istniejącego planu.

### Integration Tests:

- `week/day.db.test.ts` i pozostałe `.db.test.ts` tras z datą: przechodzą z przypiętym zegarem.

### Manual Testing Steps:

1. Dzień za daleko i za dawno w `/plan`, tydzień za daleko w `/plan/week`.
2. Zapisany plan poza oknem: wszystko oprócz generowania działa.
3. Bezpośredni `POST` z datą spoza okna: 422, brak wiersza w ledgerze.

## Performance Considerations

Brak — sprawdzenie to arytmetyka na kilku datach, bez zapytań.

## Migration Notes

Bez migracji i bez `db push`. Plany zapisane wcześniej poza oknem zostają nietknięte. Merge do
`master` wdraża zmianę od razu.

## References

- Roadmapa: `context/foundation/roadmap.md` — `### S-31: Horyzont planowania`
- Wzorzec claimu przed modelem: `src/lib/services/fair-use.ts`, `src/pages/api/day-plan/generate.ts`
- Arytmetyka dat: `src/lib/day-plan-dates.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Reguła horyzontu

#### Automated

- [x] 1.1 Testy reguły przechodzą: `npx vitest run src/lib/planning-horizon.test.ts` — 66ca57b
- [x] 1.2 Lint przechodzi: `npm run lint` — 66ca57b

#### Manual

- [ ] 1.3 Zdania z `horizonMessage` brzmią jak polski (data w dopełniaczu)

### Phase 2: Egzekwowanie po stronie serwera

#### Automated

- [x] 2.1 Wszystkie testy jednostkowe przechodzą: `npm test` — bbc9f87
- [x] 2.2 Każda z czterech tras wywołuje `checkGenerationDates(` dokładnie raz (grep zwraca `1` na plik) — bbc9f87
- [x] 2.3 Testy integracyjne z lokalną bazą przechodzą: `npm run test:db:api` — bbc9f87
- [x] 2.4 Lint i build przechodzą: `npm run lint && npm run build` — bbc9f87

#### Manual

- [ ] 2.5 Bezpośredni `POST /api/day-plan/generate` ze styczniem 2027 → 422 z polskim zdaniem, brak wiersza w `generation_ledger`

### Phase 3: UI i treść

#### Automated

- [x] 3.1 Testy, lint i build przechodzą: `npm test && npm run lint && npm run build` — 74ee080
- [x] 3.2 Oba widoki przekazują `horizonNotice={` (grep zwraca `1` na plik) — 74ee080
- [x] 3.3 `git diff -w master..HEAD -- context/foundation/roadmap.md` zmienia tylko wiersze `S-31` — 74ee080

#### Manual

- [ ] 3.4 `/plan?date=2027-01-12`: notka zamiast formularza
- [ ] 3.5 `/plan/week?from=2027-01-11`: notka zamiast formularza, nawigacja działa
- [ ] 3.6 Zapisany plan poza oknem: edycja, refine, zatwierdzanie, usuwanie i PDF działają; brak „Wygeneruj ponownie”
- [ ] 3.7 Tydzień dopełnienia (`2026-11-30`) i `2026-12-04`: formularz jest
- [ ] 3.8 `/pomoc`: nowe pytanie zgodne z zachowaniem
- [ ] 3.9 Telefon (≈375 px): notka nie rozpycha układu
