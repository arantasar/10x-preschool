# Operacje dnia z poziomu tygodnia (S-11) — plan implementacji

## Overview

Nauczyciel może cofnąć akceptację dnia (FR-015) i usunąć zapisany plan dnia (FR-016), nie wychodząc z `/plan/week`. Każda karta dnia dostaje w stopce przełącznik akceptacji i przycisk kasowania. Obie operacje wołają istniejące trasy i **nazywają dzień, którego dotyczą**: w nazwie dostępnej przycisku, w dialogu kasowania i w komunikacie po operacji. To jest warunek, z którym runda Sokratejska utrzymała FR-015.

Świadomy dopisek zakresu ponad literę FR-015/016: przełącznik działa w obie strony („Akceptuj dzień" / „Cofnij akceptację"). PRD uzasadnił bezpieczeństwo FR-015 tym, że „pomyłka kosztuje jedno kliknięcie". W tygodniu jest to prawdą tylko wtedy, gdy powrót leży pod tym samym przyciskiem.

## Current State Analysis

- **Oba prymitywy stoją i nie wymagają zmian.** `POST /api/day-plan/accept` przyjmuje `accepted: false` i pilnuje `expected_generation` (`src/pages/api/day-plan/accept.ts:46`, `setAcceptance` w `src/lib/services/day-plan-store.ts:476`). `DELETE /api/day-plan?date=` kasuje po dacie i odpowiada `204` (`src/pages/api/day-plan/index.ts:75`, `deleteDayPlan` w `day-plan-store.ts:543`). Izolację kont egzekwuje RLS; nowa powierzchnia nie otwiera nowej ścieżki zapisu.
- **Widok tygodnia nie ma dziś żadnej operacji na pojedynczym dniu** poza „Ponów ten dzień" po nieudanym generowaniu. Karta (`src/components/plan/WeekDayCard.tsx`) jest z założenia tylko do odczytu i linkuje do `/plan?date=`. Tydzień ma jedną operację akceptacji — „Akceptuj tydzień (N)", hurtem (`WeekPlanBoard.tsx:509`).
- **Przesłanka PRD jest częściowo nieaktualna.** FR-015 zakłada, że „w tygodniu nauczyciel widzi kafelki, nie pełne aktywności". Karta już pokazuje tytuły i opisy wszystkich aktywności (`WeekDayCard.tsx:142-152`). Warunek nazywania dnia obowiązuje dalej, bo jest o celowaniu, nie o treści — ale ryzyko „klikania w ciemno" jest mniejsze, niż PRD zakładał.
- **Martwy zaułek w istniejącej kopii.** `ALL_ACCEPTED_MESSAGE` (`src/lib/week-generation.ts`) mówi „Cofnij akceptację dnia, żeby wygenerować go jeszcze raz" na stronie, na której tego nie da się zrobić. Ta pozycja czyni to zdanie wykonalnym w miejscu — bez zmiany jego treści.
- **Maszyna stanów wyspy jest główną trudnością, nie zapis.** `WeekPlanBoard` trzyma niezapisane partie (`batch`, status `held`) i pozwala ponowić zapis tylko wtedy, gdy każdy niezaakceptowany dzień ma partię (`heldSetIsComplete`, `:112`). Cofnięcie akceptacji albo skasowanie dnia w tym stanie zmienia zbiór celów pod trzymanymi partiami — „Zapisz tydzień" znika, a zapłacone generowania utykają.
- **Kasowanie w widoku dnia przeładowuje stronę** (`DayPlanEditor.tsx:166-175`), bo podtytuł dnia jest statycznym SSR poza wyspą. W tygodniu wyspa renderuje całą kartę, więc skasowany dzień da się zresetować lokalnie do kształtu, który `initialDays` nadaje dniowi bez planu.

## Desired End State

Na `/plan/week` każda karta dnia z planem ma w stopce, obok „Otwórz dzień":

- przełącznik **„Akceptuj dzień" / „Cofnij akceptację"** (gdy dzień ma aktywności) — bez dialogu; po operacji karta pokazuje komunikat nazywający dzień i nowy stan, a przycisk jest drogą powrotną;
- odsunięty, wyciszony przycisk **„Usuń plan dnia"** — zawsze z dialogiem, który nazywa dzień i mówi, że dzień jest zaakceptowany, jeśli jest; po zgodzie karta wraca do „Ten dzień nie ma jeszcze planu" bez przeładowania.

Nazwy dostępne obu przycisków zaczynają się od widocznej etykiety i zawierają datę dnia. Nieudana operacja zostawia komunikat w tej karcie i odczytuje ten jeden dzień z serwera. Kontrolki są wyłączone, gdy tydzień trzyma niezapisane propozycje albo trwa operacja tygodniowa. Widok dnia, trasy API, warstwa serwisowa i schemat są nietknięte. Trzy testy e2e dowodzą zakresu kasowania, odmowy w dialogu i celowania cofnięcia akceptacji; mapa ryzyk ma ryzyko #9.

Weryfikacja: Progress tego planu, w tym trzy celowe psucia w Fazie 3, które muszą zapalić testy na czerwono.

### Key Discoveries:

- `setAcceptance` rozróżnia „cudzy/nieistniejący" (`not_found`, 404) od „zmieniony w innym miejscu" (`conflict`, 409) kosztem jednego odczytu na ścieżce porażki (`day-plan-store.ts:500-517`). Komunikat 409 z `day-plan-http.ts:89` każe „Odśwież stronę" — po odczycie dnia w karcie to zdanie przestaje być prawdziwe.
- `deleteDayPlan` celowo **nie** warunkuje kasowania na `expected_generation` — decyzja S-05 (`context/archive/2026-08-27-delete-day-plan/plan.md:57`: „«ten dzień ma być pusty» jest prawdziwe niezależnie od tego, która partia w nim stoi"). Ta pozycja ją dziedziczy.
- Dialog kasowania w widoku dnia jest bezwarunkowy i nazywa skutek, nie pyta „czy na pewno" (`DayPlanEditor.tsx:355-380`). Operacja odwracalna nie pyta (`setAcceptance`, `:337`). To jest reguła „jawność proporcjonalna do skutku" z PRD v2 §Business Logic Changes.
- Po przebiegu tygodnia dni zaakceptowane mają `status: "skipped"` (`WeekPlanBoard.tsx:395-397`). `StatusBadge` pokazuje „Pominięty — dzień zaakceptowany" dla `skipped` bez `accepted_at` (`WeekDayCard.tsx:198-206`) — patrz §Critical Implementation Details.
- Ogon z `next-actions.md` §„Otwarte ogony po `edit-unaccepts-day`" (wyścig w `acceptance_cleared`) ma bramkę wejścia „jeśli pole zacznie czytać ktokolwiek poza `DayPlanEditor`". Ta pozycja go nie czyta — karta tygodnia nie edytuje treści — więc bramka nie jest wyzwalana.
- Wzorzec czystego modułu tekstów bez zależności, testowanego bez renderowania: `src/lib/week-generation.ts` + `week-generation.test.ts`.
- Wzorzec e2e na dialog przeglądarki (trzy asercje: dialog padł, żądanie nie poleciało, stan przeżył przeładowanie): `tests/e2e/day-plan-delete-confirmation.spec.ts`. Wzorzec zakresu kasowania z dniem sąsiednim: `tests/e2e/day-plan-delete-scope.spec.ts`.

## What We're NOT Doing

- **Żadnej zmiany w trasach API, `src/lib/services/`, schemacie ani RLS.** Oba prymitywy wystarczają.
- **Żadnego warunku `expected_generation` przy kasowaniu** — decyzja S-05 obowiązuje. Stan akceptacji w dialogu pochodzi z kopii wyspy i bywa nieaktualny; kasowanie go nie sprawdza.
- **Żadnej zmiany w widoku dnia.** `DayPlanEditor.tsx` — dialog kasowania bez daty (dzień to strona), bez zdania o akceptacji — zostaje, jak jest.
- **Żadnej edycji treści w karcie tygodnia.** Edycja zostaje w `/plan?date=`; ogon `acceptance_cleared` nie jest wyzwalany.
- **Żadnego nowego komponentu shadcn** (menu, AlertDialog). Dialog to `window.confirm`, spójnie z każdą inną operacją w projekcie i z istniejącymi testami e2e.
- **Żadnego cofania (undo) kasowania** — PRD v2 §Non-Goals.
- **Żadnej zmiany w siatce miesiąca.** Czyta SSR przy każdym wejściu, więc widzi skutek bez zmian w kodzie.
- **Żadnej zmiany treści `ALL_ACCEPTED_MESSAGE`** — staje się wykonalne, nie nieprawdziwe.

## Implementation Approach

Trzy warstwy, od najtańszej do najdroższej w sprawdzeniu. Najpierw **teksty** — wszystko, co nazywa dzień, żyje w czystym module i ma testy jednostkowe, bo zdanie w dialogu jest jedyną barierą przed nieodwracalnym kasowaniem. Potem **wyspa** — `WeekPlanBoard` jest właścicielem obu operacji (żądania, blokady, stan), `WeekDayCard` tylko renderuje stopkę i woła callbacki; tak samo podzielono dziś „Ponów ten dzień". Na końcu **e2e**, bo dialog przeglądarki i cel kliknięcia nie mają innego domu niż przeglądarka — każdy test przejechany na czerwono celowym psuciem.

Operacje dnia biorą blokadę tygodnia (`weekInFlight`), więc serializują się ze sobą i z każdą operacją tygodniową. Dla jednego nauczyciela klikającego pojedyncze dni to nie kosztuje nic, a zamyka całą klasę wyścigów z generowaniem tygodnia, którego partycja czyta stan akceptacji.

## Critical Implementation Details

**Kolejność: blokada przed dialogiem.** `deleteDay` sprawdza `weekInFlight` **przed** `window.confirm` i bierze ją synchronicznie przed pierwszym `await`. W odwrotnej kolejności nauczyciel wyraża zgodę na operację, która potem cicho przepada. To jest ta sama pułapka, którą `saveDraft` w `DayPlanEditor.tsx:292-296` opisuje wprost.

**`204` nie ma ciała.** Udane kasowanie odpowiada `204`, więc `response.json()` odrzuca, a strażnik `isDayPlanBody(null)` jest fałszywy. Gałąź sukcesu kasowania musi rozstrzygać po `response.ok`, zanim cokolwiek parsuje — inaczej udane kasowanie zostanie zgłoszone jako porażka (`DayPlanEditor.tsx:160-171` opisuje dokładnie ten błąd).

**Sukces przełącznika resetuje `status` do `"done"`** i czyści `error`/`retryable`. Bez tego dzień zaakceptowany, który przeszedł przez przebieg tygodnia (`skipped`), po cofnięciu akceptacji pokazuje plakietkę „Pominięty — dzień zaakceptowany" — zdanie fałszywe w obu połowach. To samo dotyczy dnia ze statusem `failed` po nieudanym „Akceptuj tydzień".

**Komunikat i błąd karty nie przeżywają późniejszej operacji na tym dniu.** Czyszczone na starcie każdej operacji dnia, w `generateDay` i w `acceptWeek` dla dni, których dotyka — ta sama reguła co `clearedByEdit` w S-12 (`DayPlanEditor.tsx:150-155`). Inaczej „Cofnięto akceptację: wtorek…" stoi pod zieloną plakietką po „Akceptuj tydzień".

**Region `role="status"` istnieje, zanim dostanie treść.** Czytniki ekranu niepewnie ogłaszają element żywego regionu wstawiony razem z treścią; kontener komunikatu renderuje się w karcie zawsze (pusty), a zmienia się tylko jego zawartość.

---

## Phase 1: Treści i nazwy operacji

### Overview

Czysty moduł bez zależności poza `@/lib/day-plan-dates`, który produkuje każde zdanie i każdą nazwę dostępną nazywającą dzień. Testowany bez renderowania.

### Changes Required:

#### 1. Moduł tekstów operacji dnia

**File**: `src/lib/week-day-controls.ts` (nowy)

**Intent**: Jedno miejsce na zdania, które nazywają dzień przy operacjach z tygodnia. Moduł, a nie funkcje w `WeekPlanBoard.tsx`, z tego samego powodu co `week-generation.ts`: zdanie w dialogu kasowania jest jedyną ochroną przed nieodwracalną operacją, a twierdzenie sprawdzalne tylko przez wyrenderowanie drzewa React to twierdzenie, którego nikt nie sprawdza.

**Contract**: Wszystkie funkcje czyste, przyjmują `planDate` (ISO) i datę formatują przez `formatPlanDate`. Nie importują zod ani React.

- `deleteConfirmation(planDate, accepted: boolean): string` — nazywa dzień, przy `accepted` dodaje zdanie o akceptacji, zawsze kończy zdaniem o nieodwracalności. Brzmienie wyjściowe (uzgodnione przy planowaniu): „Usunąć plan na poniedziałek, 9 listopada 2026? Ten dzień jest zaakceptowany. Usunięcie skasuje hasło i wszystkie propozycje tego dnia. Tej operacji nie można cofnąć." Zdanie „Ten dzień jest zaakceptowany." **tylko** przy `accepted`.
- `acceptanceNotice(planDate, accepted: boolean): string` — komunikat po przełączeniu, nazywa dzień i nowy stan. Przy cofnięciu mówi, że plan wrócił do roboczego i że akceptację przywraca ten sam przycisk.
- `deletedNotice(planDate): string` — komunikat po skasowaniu, nazywa dzień.
- `acceptanceControlName(planDate, accepted: boolean): string` i `deleteControlName(planDate): string` — nazwy dostępne przycisków. Każda **zaczyna się od widocznej etykiety** („Cofnij akceptację" / „Akceptuj dzień" / „Usuń plan dnia") i zawiera datę — WCAG 2.5.3 (Label in Name), a zarazem uchwyt dla lokatorów e2e.
- `conflictMessage` (stała) — zdanie dla 409 z trasy akceptacji: dzień zmienił się w innym miejscu, a karta pokazuje teraz jego aktualny stan. Bez „Odśwież stronę" — karta właśnie się odświeżyła.

#### 2. Testy jednostkowe

**File**: `src/lib/week-day-controls.test.ts` (nowy)

**Intent**: Dowód, że każde zdanie nazywa dzień i że zdanie o akceptacji pojawia się dokładnie wtedy, gdy powinno.

**Contract**: Przypadki co najmniej: dialog zawiera `formatPlanDate(planDate)` w obu wariantach; zawiera „Ten dzień jest zaakceptowany." przy `accepted: true` i **nie** zawiera go przy `false` (asercja nieobecności kotwiczona na pełnym zdaniu, nie na rdzeniu „zaakceptow", który pada też w innych zdaniach); oba warianty kończą się zdaniem o nieodwracalności; oba komunikaty i obie nazwy zawierają datę; każda nazwa dostępna `startsWith` widoczną etykietą właściwą dla stanu.

### Success Criteria:

#### Automated Verification:

- Testy modułu przechodzą: `npm test -- src/lib/week-day-controls.test.ts`
- Asercja nieobecności potrafi nie przejść: po tymczasowym dołączaniu zdania o akceptacji bezwarunkowo test wariantu `accepted: false` jest czerwony; zmiana wycofana
- Lint przechodzi: `npm run lint`

#### Manual Verification:

- Zdania czytają się naturalnie po polsku, bezosobowo (jak reszta kopii wysp), z datą w formie „poniedziałek, 9 listopada 2026"

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed Fazą 2.

---

## Phase 2: Operacje dnia w wyspie tygodnia

### Overview

`WeekPlanBoard` dostaje dwie operacje dnia (przełącznik akceptacji, kasowanie) z blokadą, obsługą błędu w karcie i ponownym odczytem dnia. `WeekDayCard` dostaje stopkę z kontrolkami i region komunikatu.

### Changes Required:

#### 1. Stan karty

**File**: `src/components/plan/WeekDayCard.tsx`

**Intent**: Karta musi umieć powiedzieć, co się właśnie stało z tym dniem, i co się nie udało — osobno od błędu generowania, bo `status: "failed"` znaczy w tej wyspie „generowanie padło" i niesie czerwoną ramkę oraz podpowiedzi o ponowieniu generowania.

**Contract**: `DayState` zyskuje dwa pola: `notice: string | null` (nazwany wynik ostatniej udanej operacji dnia) i `actionError: string | null` (porażka operacji dnia). `DayStatus` bez zmian. `initialDays` w `WeekPlanBoard.tsx` inicjuje oba na `null`.

#### 2. Stopka karty

**File**: `src/components/plan/WeekDayCard.tsx`

**Intent**: Operacje stoją pod treścią, której dotyczą. Kasowanie jest odsunięte i wyciszone (obrys, nie wypełnienie) — to samo rozliczenie „Warunku układu" co w widoku dnia po S-12 (`DayPlanEditor.tsx:585-603`): operacja nieodwracalna nie siedzi obok tej, w którą oko wpada.

**Contract**:
- Nowe propsy: `controlsDisabled: boolean`, `onToggleAcceptance: () => void`, `onDelete: () => void`. Istniejące `disabled` i `onRetry` bez zmian.
- Stopka: „Otwórz dzień" (jak dziś), przełącznik, kasowanie odsunięte na prawo. Na wąskim ekranie kasowanie może zejść do osobnej linii — ważne, żeby nie stało tuż przy przełączniku.
- Przełącznik widoczny, gdy `day.plan !== null` i plan ma aktywności (ta sama bramka co w widoku dnia); etykieta według `accepted_at`, ikony `Check` / `Undo2` jak w `DayPlanEditor`. Kasowanie widoczne, gdy `day.plan !== null`; ikona `Trash2`, etykieta „Usuń plan dnia". Oba `type="button"`, oba z `aria-label` z `acceptanceControlName` / `deleteControlName`.
- Region komunikatu `role="status"` renderowany zawsze, z `day.notice` jako treścią.
- `day.actionError` renderowany jako `role="alert"` w karcie, bez zmiany ramki karty.
- Komentarz nagłówkowy komponentu („Read-only on purpose") poprawiony: treść nadal edytuje się wyłącznie w widoku dnia, ale akceptacja i kasowanie dnia mieszkają teraz także tutaj.

#### 3. Operacje dnia

**File**: `src/components/plan/WeekPlanBoard.tsx`

**Intent**: Wyspa jest właścicielem obu operacji tak, jak jest właścicielem generowania, ponowienia i „Akceptuj tydzień": trzyma blokady, woła trasy, stosuje odpowiedź.

**Contract**:
- `Busy` zyskuje wariant na operację dnia (np. `"managing"`); etykieta przycisku generowania go nie rozróżnia.
- `toggleAcceptance(planDate)`: jeśli `weekInFlight` — wraca. Bierze `weekInFlight`, czyści `failure` tygodnia oraz `notice`/`actionError` tego dnia, `POST /api/day-plan/accept` z `plan_id`, `accepted: !accepted_at`, `expected_generation: current_generation`. Sukces (`isDayPlanBody`): `plan` z odpowiedzi, `status: "done"`, `error: null`, `retryable: false`, `notice: acceptanceNotice(…)`. Porażka: patrz niżej.
- `deleteDay(planDate)`: jeśli `weekInFlight` — wraca, **zanim** pokaże dialog. `window.confirm(deleteConfirmation(planDate, accepted))`; odmowa — nic, żadnego żądania. Zgoda: bierze `weekInFlight`, czyści jak wyżej, `DELETE /api/day-plan?date=${planDate}` bez ciała. Sukces (`response.ok`, bez parsowania): dzień wraca do kształtu, który `initialDays` nadaje dniowi bez planu (`status: "empty"`, `plan`, `batch`, `theme` na `null`) z `notice: deletedNotice(…)`.
- Porażka obu operacji: `401` → `failure` tygodnia z `signInRequired` (istniejący wzorzec). Inaczej `actionError` = `conflictMessage` dla `409` z trasy akceptacji, w pozostałych wypadkach `body.error` przez `isErrorBody` albo polski komunikat zastępczy, a potem `reconcileDay(planDate)`. Brak połączenia → komunikat jak w reszcie wyspy + `reconcileDay`.
- `reconcileDay(planDate)`: `GET /api/day-plan?date=`. `404` → dzień pusty (bez `notice`). `200` + `isDayPlanBody` → `plan` z odpowiedzi, `status: "done"`. Każda inna odpowiedź i własna porażka — połknięte, karta zostaje, jak była (uzasadnienie w `DayPlanEditor.tsx:104-129`).
- `finally` każdej operacji dnia zwalnia `weekInFlight` i wraca do `busy: "idle"`.
- `generateDay` i `acceptWeek` czyszczą `notice`/`actionError` dni, których dotykają (§Critical Implementation Details).

#### 4. Bramka kontrolek i podpowiedź

**File**: `src/components/plan/WeekPlanBoard.tsx`

**Intent**: Zbiór dni do zapisu nie może się zmienić pod trzymanymi partiami — dlatego kontrolki dnia są wyłączone, gdy tydzień trzyma niezapisane propozycje, i nauczyciel musi wiedzieć dlaczego.

**Contract**: `controlsDisabled={isBusy || heldCount > 0}` dla każdej karty. Istniejący baner „N dni czeka na zapis…" (`:658-671`) dostaje zdanie, że pojedynczych dni nie można teraz zmieniać, dopóki tydzień nie zostanie zapisany albo propozycje odrzucone.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Pełny zestaw jednostkowy przechodzi: `npm test`
- Dialog wyłącznie przy kasowaniu i przy przebiegu tygodnia: `grep -c 'window.confirm(' src/components/plan/WeekPlanBoard.tsx` zwraca `2`, a `grep -c 'window.confirm(' src/components/plan/WeekDayCard.tsx` zwraca `0` _(przed zmianą: 1 i 0 — pierwsza bramka czerwona na stanie wyjściowym; dialog dopisany do przełącznika daje 3)_
- Kasowanie idzie przez istniejącą trasę: `grep -c 'method: "DELETE"' src/components/plan/WeekPlanBoard.tsx` zwraca `1` _(przed zmianą: 0)_
- Serwer, schemat i widok dnia nietknięte: `git diff --name-only master...HEAD -- src/pages/api src/lib/services supabase src/components/plan/DayPlanEditor.tsx` zwraca pusto _(zakres `master...HEAD`, więc widzi zakomitowane zmiany — `lessons.md`, „Kryterium weryfikacji musi móc nie przejść")_

#### Manual Verification:

- Dzień zaakceptowany: „Cofnij akceptację" nie pokazuje dialogu; karta pokazuje komunikat z datą, plakietkę „Plan roboczy" i przycisk „Akceptuj dzień"; jego kliknięcie przywraca akceptację z komunikatem z datą
- „Usuń plan dnia" na dniu zaakceptowanym: dialog nazywa dzień i zawiera zdanie o akceptacji; na dniu roboczym — nazywa dzień, bez tego zdania. „Anuluj" nie robi nic. „OK" → karta „Ten dzień nie ma jeszcze planu" z komunikatem, „Gotowe N z 5" spada o jeden, bez przeładowania strony
- Skasowany dzień: ponowne „Generuj tydzień" go obejmuje (nie jest „Nietknięty"); siatka miesiąca pokazuje go jako wolny
- Po przebiegu tygodnia dzień zaakceptowany z plakietką „Nietknięty": po cofnięciu akceptacji plakietka mówi „Plan roboczy", nie „Pominięty — dzień zaakceptowany"
- Stan `held` (DevTools → Network request blocking na `/api/day-plan/week/save`, potem „Generuj tydzień"): przełączniki i kasowanie wyłączone, baner mówi dlaczego; po odblokowaniu i „Zapisz tydzień" kontrolki wracają
- Konflikt: dzień otwarty w drugiej karcie i wygenerowany ponownie; w pierwszej „Cofnij akceptację" → komunikat bez „Odśwież stronę", karta pokazuje aktualne aktywności z serwera
- Układ na 375 px i na desktopie: stopka czytelna, kasowanie odsunięte i wyciszone, nic nie wystaje poza kartę
- Klawiatura: Tab dochodzi do „Otwórz dzień", przełącznika i kasowania w kolejności czytania; w panelu Accessibility DevTools nazwa każdego przycisku zawiera datę

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed Fazą 3.

---

## Phase 3: Testy e2e i mapa ryzyk

### Overview

Trzy testy Playwright na nowej powierzchni, każdy przejechany na czerwono celowym psuciem, i ryzyko #9 w `test-plan.md`, do którego testy się odwołują.

### Changes Required:

#### 1. Ryzyko #9 w mapie ryzyk

**File**: `context/foundation/test-plan.md`

**Intent**: Roadmapa nazywa ryzyko S-11 wprost — „nie leży w zapisie, tylko w celowaniu" — a mapa ryzyk go nie ma. `E2E-RULES.md` wymaga, żeby nazwa testu nazywała ryzyko z numerem. Precedens: S-12 dopisał ryzyko #8.

**Contract**: Nowy wiersz #9 w §2 Risk Map: operacja z poziomu tygodnia (cofnięcie akceptacji, kasowanie) trafia w inny dzień niż wskazany, bo tydzień pokazuje pięć kart obok siebie; Impact High (kasowanie jest nieodwracalne), Likelihood Low; źródła: `roadmap.md` S-11 §Risk, `prd-v2.md` FR-015 (Socrates). Nowy wiersz #9 w §Risk Response Guidance: co musi być prawdą (operacja zmienia dokładnie wskazany dzień, a nazwa tego dnia pada przed kasowaniem i po cofnięciu akceptacji), fałszywe przekonanie („karta jest w DOM-ie pod datą, więc klik trafia w tę datę"), typ testu e2e, antywzorzec (test z jednym dniem w tygodniu — strukturalnie nie wykryje trafienia w sąsiada). Tabela §3 Phased Rollout bez zmian — to pokrycie spoza rolloutu, jak warstwa e2e z 2026-09-03.

#### 2. Pomocnik tygodnia w danych testowych

**File**: `tests/e2e/support/test-data.ts`

**Intent**: Testy tygodnia potrzebują poniedziałku, a nie dowolnego dnia, i pięciu wolnych dni po nim.

**Contract**: `uniqueWeekStart(): string` — poniedziałek w oknie testowym. Zarezerwuj co najmniej 14 dni (`uniquePlanDate(14)`) i przesuń **w przód** do najbliższego poniedziałku; przesunięcie wstecz może wejść w okno zarezerwowane przez poprzednie wywołanie.

#### 3. Testy

**File**: `tests/e2e/week-day-controls.spec.ts` (nowy)

**Intent**: Dowód, że operacje z tygodnia trafiają w dzień, który nazywają, i że dialog kasowania jest barierą, a nie ozdobą.

**Contract**: Wzorzec i reguły: `seed.spec.ts`, `E2E-RULES.md`; `waitForIslands` przed pierwszym kliknięciem; sprzątanie w `afterEach` po `id` zasianych planów. Lokatory przycisków po nazwie dostępnej z datą — to jest zarazem asercja FR-015. Datę w oczekiwanym brzmieniu test liczy sam (`Intl.DateTimeFormat("pl-PL", …)` z tymi samymi opcjami co `formatPlanDate`), zamiast importować kod aplikacji.

- **„ryzyko #7, #9: usunięcie z tygodnia zdejmuje dokładnie wskazany dzień"** — zasiane dwa sąsiednie dni zaakceptowane jednego tygodnia. Kasowanie drugiego; handler dialogu sprawdza, że `dialog.message()` zawiera datę drugiego dnia i zdanie o akceptacji, potem akceptuje. Po przeładowaniu: drugi dzień bez planu, pierwszy z tytułem swojej aktywności.
- **„ryzyko #7: odmowa w dialogu kasowania z tygodnia nie kasuje niczego"** — trzy asercje z `day-plan-delete-confirmation.spec.ts`: dialog się pokazał, żadne żądanie `DELETE` na `/api/day-plan` nie poleciało, plan przeżył przeładowanie.
- **„ryzyko #9: cofnięcie akceptacji z tygodnia zdejmuje akceptację wyłącznie wskazanego dnia"** — dwa sąsiednie dni zaakceptowane. Cofnięcie drugiego; zarejestrowany handler dialogu zapisuje, że nie pokazał się żaden dialog; komunikat z datą drugiego dnia widoczny. Po przeładowaniu: drugi dzień „Plan roboczy", pierwszy nadal zaakceptowany.

### Success Criteria:

#### Automated Verification:

- Nowe testy przechodzą: `npm run test:e2e -- tests/e2e/week-day-controls.spec.ts` _(lokalna Supabase uruchomiona; **nie** zaraz po `npm run build` na reużywanym serwerze dev — pułapka opisana w `next-actions.md` §„Otwarte ogony po `edit-unaccepts-day`")_
- Cały zestaw e2e przechodzi: `npm run test:e2e`
- Celowe psucie A: `deleteDay` ignoruje wynik `window.confirm` → test odmowy czerwony; zmiana wycofana
- Celowe psucie B: `toggleAcceptance` celuje w `week.days[0]` zamiast w `planDate` → test #9 czerwony; zmiana wycofana
- Celowe psucie C: `deleteConfirmation` bez daty → test zakresu kasowania czerwony na asercji treści dialogu; zmiana wycofana
- Lint przechodzi: `npm run lint`

#### Manual Verification:

- Wiersze #9 w §2 i §Risk Response Guidance `test-plan.md` czytają się spójnie z #7 i #8; nazwy testów zawierają numery ryzyk

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie.

---

## Testing Strategy

### Unit Tests:

- `src/lib/week-day-controls.test.ts` — każde zdanie i każda nazwa dostępna zawiera datę; zdanie o akceptacji w dialogu kasowania dokładnie wtedy, gdy dzień jest zaakceptowany; nazwy dostępne zaczynają się od widocznej etykiety.

### Integration Tests:

- Brak nowych. Trasy są nietknięte, a ich zachowanie (zakres kasowania, 409 przy nieaktualnej generacji, izolacja kont) jest pokryte pgTAP i e2e z S-05. Tani wzorzec testu trasy z `test-plan.md` §6.3 jest wciąż TBD i należy do fazy 3 rolloutu.

### E2E Tests:

- `tests/e2e/week-day-controls.spec.ts` — zakres kasowania z tygodnia, odmowa w dialogu, celowanie cofnięcia akceptacji. Każdy test przejechany na czerwono celowym psuciem (Faza 3).

### Manual Testing Steps:

1. Tydzień z trzema dniami zaakceptowanymi i dwoma roboczymi: cofnij akceptację środy, zaakceptuj ją z powrotem tym samym przyciskiem.
2. Usuń czwartek (roboczy) — dialog bez zdania o akceptacji; usuń piątek (zaakceptowany) — dialog ze zdaniem.
3. „Generuj tydzień" z nowym hasłem — czwartek i piątek są celami, nie „Nietknięte".
4. Stan `held` przez blokowanie żądania zapisu — kontrolki wyłączone, baner tłumaczy.
5. Dwie karty przeglądarki — konflikt przy przełączniku kończy się aktualnym stanem dnia w karcie.

## Performance Considerations

Brak. Jedno żądanie na operację i jeden odczyt dnia wyłącznie na ścieżce porażki. Brak nowych zapytań przy renderze strony.

## Migration Notes

Brak zmiany schematu i danych. Wydanie = merge do `master` (Cloudflare Workers Builds), jak każdy slice.

## References

- Roadmapa: `context/foundation/roadmap.md` — S-11 (§Slices, §Risk)
- PRD: `context/foundation/prd-v2.md` — FR-015, FR-016 (z notami Socratesa), §Guardrails #1–#2, §Business Logic Changes reguła 2, §Constraints „Warunek układu"
- Kasowanie w widoku dnia i decyzja o braku `expected_generation`: `context/archive/2026-08-27-delete-day-plan/plan.md:56-57`
- Reguła jawności i rozliczenie warunku układu w widoku dnia: `context/archive/2026-09-20-edit-unaccepts-day/plan.md` (Faza 3)
- Wzorce w kodzie: `src/components/plan/DayPlanEditor.tsx:337-380` (akceptacja, kasowanie), `:115-129` (`reconcile`); `src/lib/week-generation.ts` (czysty moduł tekstów)
- Wzorce e2e: `tests/e2e/day-plan-delete-confirmation.spec.ts`, `tests/e2e/day-plan-delete-scope.spec.ts`, `tests/e2e/E2E-RULES.md`
- Reguły: `context/foundation/lessons.md` — „Kryterium weryfikacji musi móc nie przejść", „Bramka grepowa musi celować w konstrukcję i przejechać oba stany"

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Treści i nazwy operacji

#### Automated

- [x] 1.1 Testy modułu przechodzą: `npm test -- src/lib/week-day-controls.test.ts` — 65f6006
- [x] 1.2 Asercja nieobecności potrafi nie przejść (zdanie o akceptacji dołączane bezwarunkowo → test `accepted: false` czerwony; wycofane) — 65f6006
- [x] 1.3 Lint przechodzi: `npm run lint` — 65f6006

#### Manual

- [x] 1.4 Zdania czytają się naturalnie po polsku, bezosobowo, z datą w formie „poniedziałek, 9 listopada 2026"

### Phase 2: Operacje dnia w wyspie tygodnia

#### Automated

- [x] 2.1 Lint przechodzi: `npm run lint` — e4ed568
- [x] 2.2 Build przechodzi: `npm run build` — e4ed568
- [x] 2.3 Pełny zestaw jednostkowy przechodzi: `npm test` — e4ed568
- [x] 2.4 Dialog wyłącznie przy kasowaniu i przebiegu tygodnia: `window.confirm(` — 2 w `WeekPlanBoard.tsx`, 0 w `WeekDayCard.tsx` — e4ed568
- [x] 2.5 Kasowanie przez istniejącą trasę: `method: "DELETE"` — 1 w `WeekPlanBoard.tsx` — e4ed568
- [x] 2.6 Serwer, schemat i widok dnia nietknięte: `git diff --name-only master...HEAD -- src/pages/api src/lib/services supabase src/components/plan/DayPlanEditor.tsx` pusto — e4ed568

#### Manual

- [x] 2.7 Przełącznik bez dialogu, komunikat z datą, powrót tym samym przyciskiem
- [x] 2.8 Dialog kasowania nazywa dzień i akceptację tylko przy dniu zaakceptowanym; „Anuluj" nic nie robi; „OK" czyści kartę bez przeładowania
- [x] 2.9 Skasowany dzień wraca do generowania tygodnia i do siatki miesiąca jako wolny
- [x] 2.10 Dzień „Nietknięty" po cofnięciu akceptacji ma plakietkę „Plan roboczy"
- [x] 2.11 Stan `held`: kontrolki wyłączone, baner tłumaczy; po zapisie wracają
- [x] 2.12 Konflikt z drugą kartą: komunikat bez „Odśwież stronę", karta z aktualnym stanem
- [x] 2.13 Układ na 375 px i desktopie: kasowanie odsunięte i wyciszone
- [x] 2.14 Klawiatura i nazwy dostępne z datą

### Phase 3: Testy e2e i mapa ryzyk

#### Automated

- [x] 3.1 Nowe testy przechodzą: `npm run test:e2e -- tests/e2e/week-day-controls.spec.ts` — 9ee2001
- [x] 3.2 Cały zestaw e2e przechodzi: `npm run test:e2e` — 9ee2001
- [x] 3.3 Celowe psucie A (dialog ignorowany) → test odmowy czerwony; wycofane — 9ee2001
- [x] 3.4 Celowe psucie B (przełącznik celuje w `week.days[0]`) → test #9 czerwony; wycofane — 9ee2001
- [x] 3.5 Celowe psucie C (dialog bez daty) → test zakresu czerwony; wycofane — 9ee2001
- [x] 3.6 Lint przechodzi: `npm run lint` — 9ee2001

#### Manual

- [x] 3.7 Ryzyko #9 w `test-plan.md` spójne z #7 i #8; nazwy testów z numerami ryzyk
