# S-03 `week-generation` — plan implementacji

## Overview

Nauczyciel wybiera tydzień, wpisuje **jedno** hasło i dostaje propozycje dla każdego dnia roboczego —
a regeneracja jednego dnia nie rusza pozostałych. To domyka US-01 w całości: S-01 dowiodło, że model
umie zaplanować dzień, S-02 dało temu trwałość, a S-03 przenosi to na jednostkę pracy, którą
nauczyciel faktycznie planuje.

Rdzeniem nie jest widok tygodnia, tylko **rozdzielenie hasła na pięć różnych dni**. Pięć wywołań tego
samego hasła to nie tydzień zajęć, tylko pięć wariantów tego samego pomysłu — dokładnie to, przed czym
ostrzega finding F4 z przeglądu S-01. Dlatego jedno tanie wywołanie układa najpierw **łuk tygodnia**
(temat na dzień), a dopiero potem pięć równoległych wywołań dnia generuje aktywności, każde ze swoim
tematem. Temat mieszka w kolumnie `day_plans.theme`, więc regeneracja dnia miesiąc później wciąż zna
swoje miejsce w tygodniu.

## Current State Analysis

Zweryfikowane w kodzie na commicie `f9f8b87`:

- **Cała mechanika dnia nadaje się do ponownego użycia bez zmian strukturalnych.**
  [generate.ts](src/pages/api/day-plan/generate.ts) → `generateDayActivities` → `saveGeneration` →
  RPC `save_day_plan_generation`. Zapis jest atomowy per dzień, a `unique (user_id, plan_date)`
  ([20260718211452](supabase/migrations/20260718211452_day_plans_and_activities.sql#L34)) sprawia, że
  pięć dni to pięć niezależnych wierszy — **izolacja regeneracji z AC US-01 wychodzi za darmo**.
- **Data nie trafia do modelu.** [generate.ts:134](src/pages/api/day-plan/generate.ts#L134) woła
  `generateDayActivities(parsed.data.prompt)` — sam prompt. `plan_date` jest walidowana i używana
  wyłącznie jako klucz zapisu.
- **Prompt i schemat są zakontraktowane na jeden dzień i dokładnie trzy propozycje.**
  [day-plan.pl.md:25](src/lib/services/prompts/day-plan.pl.md#L25), `minItems/maxItems: 3` w
  [day-plan.schema.json](src/lib/services/prompts/day-plan.schema.json) oraz `.length(ACTIVITY_COUNT)`
  w [day-plan-contract.ts:39](src/lib/services/day-plan-contract.ts#L39).
- **Trigger `activities_enforce_generation` obowiązuje każdy zapis do `activities`**
  ([20260823095136](supabase/migrations/20260823095136_day_plan_generation_write_contract.sql#L94)) —
  zobowiązanie przekazane S-03 imiennie. Każdy nowy pisarz musi iść przez RPC albo powtórzyć jego
  protokół; ten plan nie dodaje drugiego pisarza.
- **UPDATE dla `authenticated` jest kolumnowy.**
  [20260720162553](supabase/migrations/20260720162553_narrow_authenticated_update_columns.sql#L30)
  zabrało UPDATE tabelaryczny i oddało wyłącznie `(plan_date, prompt, current_generation,
  accepted_at)`. Nowa kolumna **nie** dziedziczy tego grantu.
- **Budżety czasu są per wywołanie:** `ATTEMPT_TIMEOUT_MS` 45 s, `TOTAL_BUDGET_MS` 60 s
  ([day-plan-limits.ts:41](src/lib/day-plan-limits.ts#L41)). Workers nie liczy oczekiwania na I/O do
  limitu CPU (decyzja zapisana przy S-01), więc pięć równoległych wywołań mieści się bez zmian
  platformowych.
- **`GenerationProgress` sam ustala swój początek** ([:53](src/components/plan/GenerationProgress.tsx#L53)),
  więc pięć instancji obok siebie działa bez koordynacji z góry.
- **Ochrona przed nadpisaniem jest w schemacie, nie w kliencie** — `p_confirm_replace` i `U0001`
  ([20260823193447](supabase/migrations/20260823193447_confirm_replacing_accepted_plan.sql#L63)). To
  wynik krytycznego findingu F1 z przeglądu S-02 i wzorzec, który ten plan powtarza dla nowej reguły.
- **Weryfikacja to pgTAP i nic więcej.** `npm run test:db` (51 testów), `npm run lint`,
  `npx astro check`, `npm run build`. Brak runnera testów TS/React. Dane testowe z S-02
  (`2026-09-14`, `2026-11-05`, konta `p3-a@`/`p3-b@test.local`) zostały w lokalnej bazie celowo pod ten slice.
- **`.dev.vars` wskazuje lokalny stack**, a hosted project **nie ma żadnej z sześciu migracji**
  (notka z `change.md` S-02, krok 1.7). To nie blokuje implementacji, blokuje wdrożenie.

## Desired End State

Nauczyciel wchodzi na `/plan/month?month=2026-09`, widzi siatkę miesiąca z zaznaczonymi dniami, które
mają plan (roboczy albo zaakceptowany), i klika w tydzień. Na `/plan/week?from=2026-09-14` wpisuje
„Dinozaury" i klika **Generuj tydzień**. Jedno wywołanie układa łuk — poniedziałek „tropy i ślady",
wtorek „jak wyglądał dinozaur", … — po czym pięć kart rusza równolegle, każda z własnym wskaźnikiem
postępu i licznikiem sekund. Po ~20 sekundach pięć kart pokazuje po trzy propozycje, wyraźnie różne
między dniami. Jeden dzień padł na 429 — ta jedna karta ma komunikat i własne **Ponów**, cztery
pozostałe są zapisane. Nauczyciel ponawia ten dzień, klika **Akceptuj tydzień**, wchodzi w środę przez
`/plan?date=`, poprawia tam tytuł i regeneruje ten jeden dzień — wraca do tygodnia i widzi, że środa
się zmieniła, a cztery pozostałe dni stoją nietknięte, ze swoimi akceptacjami.

Dzień, który już ma plan, nie jest ruszany przez generowanie tygodnia: karta pokazuje istniejące
propozycje i etykietę „pominięty — ten dzień ma już plan".

### Key Discoveries:

- **RPC jest `security invoker`**, więc `on conflict do update set theme = …` wykonuje się z
  uprawnieniami wołającego — nowa kolumna wymaga jawnego `grant update (theme)` dla `authenticated`.
  Bez tego generowanie kończy się `42501`, które
  [`categorize`](src/lib/services/day-plan-store.ts#L111) mapuje na `config`/500, czyli „skontaktuj się
  z administratorem" po pełnym, opłaconym wywołaniu modelu.
- **Regeneracja dnia z `/plan?date=` nie zna tematu.** `DayPlanEditor` wysyła `plan_date`, `prompt`
  i `confirm_replace` — nic więcej. Upsert z `theme = excluded.theme` wyzerowałby temat przy każdej
  regeneracji dnia, cicho wypinając ten dzień z łuku tygodnia. Stąd `coalesce`.
- **Temat trafia do bazy dopiero przy zapisie udanej generacji dnia** — dzień, który padł, nie ma
  wiersza, więc nie ma gdzie trzymać tematu. Ponowienie w tej samej sesji bierze temat ze stanu wyspy;
  po odświeżeniu strony ten temat już nie istnieje. Konsekwencja jest zapisana w § Critical
  Implementation Details i widoczna dla nauczyciela, a nie ukryta.
- **`PROTECTED_ROUTES` używa `startsWith("/plan")`** ([middleware.ts:28](src/middleware.ts#L28)), więc
  `/plan/week` i `/plan/month` są chronione bez zmian. Trasy API zostają poza listą i sprawdzają sesję
  same — z powodu opisanego w [day-plan-http.ts:70](src/lib/services/day-plan-http.ts#L70).
- **`Database["public"]["Functions"]` to typowany slot** ([database.types.ts](src/db/database.types.ts)),
  więc zmiana sygnatury RPC otypuje się sama po regeneracji. Plik jest wyłączony z ESLint i Prettiera.
- **Zmiana sygnatury RPC wymaga `drop` + `create`**, nie `create or replace` — inaczej zostają dwa
  przeciążenia i `supabase.rpc` staje się niejednoznaczne (wniosek z 20260823193447). Granty nie
  przeżywają dropa i wymagają **dwóch** revoke'ów: z `public` i osobno z `anon`.

## What We're NOT Doing

- **Edycji propozycji w widoku tygodnia.** Poprawki tekstu zostają na `/plan?date=`; cały protokół
  edycji z S-02 (draft, Anuluj, `draftRef`, czyszczenie akceptacji triggerem) ma jedno miejsce.
- **Generowania weekendu.** Tydzień to poniedziałek–piątek. Dzień weekendowy nadal da się zaplanować
  wchodząc w `/plan?date=`.
- **Limitu kosztów ani licznika wywołań.** Roadmap Open Question 2 zostaje otwarte; ten slice dokłada
  wyłącznie widoczność (log `generation.succeeded` już niesie `cost`, a ekran mówi, ile wywołań
  kosztuje tydzień).
- **Wsadowego zapisu wielu dni jedną transakcją.** Pisarzem partii zostaje `save_day_plan_generation`,
  wołany raz na dzień. Drugi pisarz oznaczałby drugie miejsce, w którym trzeba powtórzyć protokół
  licznika generacji.
- **Streamingu odpowiedzi.** Postęp jest per karta, tak jak dziś per dzień — decyzja z S-01 zostaje.
- **Undo.** Nie ma go dla dnia i nie pojawia się dla tygodnia.

## Implementation Approach

Trzy warstwy, każda dokładająca się do istniejącej zamiast obok niej:

1. **Schemat** dostaje jedną kolumnę i dwie nowe reguły w tym samym RPC, który już jest jedynym
   pisarzem: „zachowaj temat, jeśli nie podano nowego" oraz „odmów, jeśli ten dzień ma już plan".
   Druga reguła to polityka pomijania dni z planem — i idzie do schematu, a nie do wyspy, bo dokładnie
   taki client-only guard był krytycznym findingiem F1 przeglądu S-02.
2. **Model** dostaje drugi, tani kontrakt: hasło + pięć dat → pięć tematów. Prompt dnia uczy się
   przyjmować temat i dzień tygodnia; bez nich działa dokładnie jak dziś, więc `/plan?date=` nie
   zmienia zachowania.
3. **Klient** orkiestruje. Wyspa tygodnia woła szkic, potem pięć razy istniejącą trasę dnia przez
   `Promise.allSettled`, i pięć razy istniejącą trasę akceptacji. Żadna z tych ścieżek nie jest nowa —
   nowe jest tylko to, że jest ich pięć naraz i że każda ma własny stan na ekranie.

Bramka jakości (Faza 3) stoi między kontraktem modelu a UI celowo: prompt jest jedyną warstwą
bezpieczeństwa treści (`lessons.md` #3), a ten slice zmienia oba prompty naraz.

## Critical Implementation Details

**Kolejność i uprawnienia w migracji.** `grant update (theme)` musi znaleźć się w tej samej migracji co
kolumna. RPC jest `security invoker`, więc bez tego grantu upsert kończy się `insufficient_privilege`
— po opłaconym wywołaniu modelu i z komunikatem kierującym nauczyciela do administratora. Analogicznie
`coalesce(excluded.theme, public.day_plans.theme)` w klauzuli `do update`: bez niego każda regeneracja
dnia z `/plan?date=` zeruje temat i nic tego nie sygnalizuje.

**Temat dnia, który padł, nie przeżywa odświeżenia.** Temat jest kolumną w `day_plans`, a wiersz
powstaje dopiero przy udanym zapisie. Ponowienie w tej samej sesji ma temat w stanie wyspy; po
przeładowaniu strony dzień bez planu jest nie do odróżnienia od dnia nigdy nie generowanego. Wyspa
ponawia wtedy z samym hasłem i **mówi to wprost** na karcie („ten dzień pójdzie z samego hasła —
wygeneruj tydzień od nowa, żeby wrócił do łuku"), zamiast po cichu wypaść z tygodnia.

**Współbieżność w wyspie jest inna niż w `DayPlanEditor`.** Tamta ma jeden `inFlight` na cały
komponent ([:67](src/components/plan/DayPlanEditor.tsx#L67)), bo mutacje dotyczą jednego planu. Tutaj
pięć żądań leci naraz i blokada musi być **per dzień**, nie globalna — inaczej pierwszy dzień, który
wystartuje, zablokuje cztery pozostałe. Globalna zostaje tylko na szkic i na „Generuj tydzień".

**429 przy pięciu równoległych wywołaniach.** `generateDayActivities` ponawia raz wewnątrz
([:271](src/lib/services/activity-generator.ts#L271)), więc wyspa **nie** ponawia automatycznie —
podwójne ponawianie przy rate limicie dokłada do pożaru i wydaje pieniądze bez zgody nauczyciela.
Ponowienie jest zawsze kliknięciem.

## Phase 1: Schemat — temat dnia i odmowa nadpisania

### Overview

Kolumna `theme`, dwie nowe reguły w RPC i grant kolumnowy — wszystko w jednej migracji, bo dopiero
razem tworzą spójny kontrakt zapisu. Tabele nie są już puste (dane testowe z S-02), więc kolumna
wchodzi jako nullable.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_day_theme_and_absent_guard.sql`

**Intent**: Dać dniowi trwały temat ze szkicu tygodnia i przenieść regułę „nie ruszaj dnia, który ma
plan" do schematu, gdzie mieszkają pozostałe reguły destrukcyjnego zapisu.

**Contract**:
- `alter table public.day_plans add column theme text` + `constraint day_plans_theme_length check (theme is null or char_length(theme) between 1 and 200)`; komentarz kolumny mówi, że `null` znaczy „dzień spoza łuku tygodnia", a nie „brak danych".
- `grant update (theme) on public.day_plans to authenticated` — dołącza do listy z `20260720162553`, która celowo wylicza kolumny zamiast dawać UPDATE tabelaryczny.
- `drop function public.save_day_plan_generation(date, text, jsonb, boolean)` i utworzenie nowej z sygnaturą `(p_plan_date date, p_prompt text, p_activities jsonb, p_confirm_replace boolean default false, p_theme text default null, p_require_absent boolean default false)`.
- Pierwszy odczyt `for update` czyta teraz dwie rzeczy zamiast jednej: czy wiersz istnieje i czy jest zaakceptowany. Kolejność odmów: `p_require_absent` + wiersz istnieje → `U0002`; następnie dotychczasowe `U0001`. `U0002` przed `U0001`, bo „ten dzień ma już plan" jest odpowiedzią pełniejszą niż „ten dzień jest zaakceptowany".
- `on conflict (user_id, plan_date) do update set … theme = coalesce(excluded.theme, public.day_plans.theme)`.
- Regranty dla nowej sygnatury: `revoke all … from public`, `revoke all … from anon`, `grant execute … to authenticated`.

#### 2. Asercje pgTAP

**File**: `supabase/tests/database/day_plan_write.test.sql`

**Intent**: Każda nowa reguła schematu dostaje asercję, która czerwienieje pod mutacją usuwającą tę regułę — tak jak wykazał to systematycznie przegląd S-02 (F9).

**Contract**: nowe asercje pokrywają: (a) zapis z `p_theme` ustawia kolumnę; (b) kolejny zapis bez `p_theme` **zachowuje** poprzedni temat; (c) kolejny zapis z nowym `p_theme` go podmienia; (d) `p_require_absent := true` na dniu z planem → `U0002`, wiersz i partia nietknięte; (e) `p_require_absent := true` na dniu pustym → zapis przechodzi; (f) `has_column_privilege('authenticated', 'public.day_plans', 'theme', 'UPDATE')` jest prawdą, a `has_function_privilege('anon', …)` dla nowej sygnatury fałszem; (g) CHECK odrzuca temat pusty i dłuższy niż 200 znaków.

#### 3. Typy i limity

**File**: `src/db/database.types.ts`, `src/lib/day-plan-limits.ts`

**Intent**: Zregenerować typy po zmianie sygnatury i dopisać `THEME_MAX` obok pozostałych granic mirrorujących CHECK-i.

**Contract**: `npx supabase gen types typescript --local > src/db/database.types.ts`; `export const THEME_MAX = 200;` z komentarzem wskazującym `day_plans_theme_length` jako ten sam pokrętło.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` przechodzi czysto
- `npm run test:db` zielony, z nowymi asercjami
- Każda nowa asercja czerwienieje pod mutacją usuwającą swojego strażnika (zdjęcie `coalesce`, zdjęcie sprawdzenia `p_require_absent`, zdjęcie grantu kolumnowego, zdjęcie CHECK-a)
- `npx supabase gen types typescript --local` daje wynik bajt w bajt zgodny z plikiem w repo
- `npm run lint`, `npx astro check`, `npm run build` czyste

#### Manual Verification:

- Bezpośrednie wywołanie RPC przez PostgREST z `p_require_absent := true` na dniu, który ma plan: `U0002`, plan i propozycje nietknięte
- Regeneracja dnia przez UI `/plan?date=` na dniu z tematem: temat po zapisie nadal ten sam

**Implementation Note**: Po zaliczeniu automatycznej weryfikacji zatrzymaj się na potwierdzenie testów ręcznych przed przejściem do Fazy 2.

---

## Phase 2: Kontrakt szkicu tygodnia

### Overview

Drugi kontrakt modelu — tani i krótki — plus nauczenie promptu dnia przyjmowania tematu i dnia
tygodnia. Bez tematu prompt dnia zachowuje się dokładnie jak dziś, więc `/plan?date=` nie zmienia
działania.

### Changes Required:

#### 1. Prompt i schemat szkicu

**File**: `src/lib/services/prompts/week-outline.pl.md`, `src/lib/services/prompts/week-outline.schema.json`

**Intent**: Rozłożyć jedno hasło na pięć rozłącznych tematów dziennych, bez proponowania aktywności — to zostaje zadaniem promptu dnia.

**Contract**: Prompt powtarza sekcje „Odbiorca" i „Język" z `day-plan.pl.md` (odbiorca 3–6 lat, wyłącznie polski, ta sama lista tego, co niedopuszczalne) oraz tę samą regułę przesuwania hasła nieodpowiedniego na najbliższy bezpieczny wariant. Dokłada: pięć tematów, po jednym na dzień roboczy; tematy mają być **różnymi ujęciami** hasła, nie wariantami tej samej aktywności; każdy do 200 znaków; wolno wykorzystać rytm tygodnia (wejście w temat / rozwinięcie / podsumowanie). Schemat: `{ "tematy": [ { "dzien": integer 1..5, "temat": string 1..200 } ] }`, `minItems`/`maxItems` 5, `additionalProperties: false` — ten sam kształt sterowania co `day-plan.schema.json`.

#### 2. Walidacja kontraktu

**File**: `src/lib/services/day-plan-contract.ts`

**Intent**: Dołożyć zod-owy odpowiednik schematu szkicu — faktyczną gwarancję kształtu, bo `response_format` steruje modelem, a nie typuje odpowiedzi.

**Contract**: `weekOutlineSchema` z `.length(WEEK_DAYS)` (z tego samego powodu, dla którego `dayPlanProposalSchema` powtarza `ACTIVITY_COUNT`) i sprawdzeniem, że numery `dzien` są unikalne i pokrywają 1..5 — model zwracający dwa razy „wtorek" przeszedłby `length` i zostawiłby dzień bez tematu. `toDayThemes(outline, dates): { plan_date: string; theme: string }[]` mapuje pozycję na datę. Nieznane klucze stripowane, jak w istniejącym schemacie.

#### 3. Generator

**File**: `src/lib/services/activity-generator.ts`

**Intent**: Wydzielić jedno wywołanie OpenRoutera jako funkcję współdzieloną przez oba kontrakty i dołożyć generowanie szkicu; rozszerzyć generowanie dnia o kontekst tygodnia.

**Contract**: `callOpenRouter(body, timeoutMs): Promise<unknown>` przejmuje obecną obsługę statusów, `finish_reason: "error"`, pustej treści i `JSON.parse` — bez zmiany kategorii błędów ani logowania. `generateDayActivities(keyword, context?)` gdzie `context?: { planDate: string; theme?: string }`; kontekst składa wiadomość użytkownika (hasło, dzień tygodnia po polsku, temat, jeśli jest), a jego brak daje dokładnie dzisiejsze `content: keyword`. Nowe `generateWeekOutline(keyword, dates): Promise<DayTheme[]>` z własnym, krótszym budżetem czasu i tą samą polityką pojedynczego ponowienia dla `transient`.

#### 4. Stałe i etykiety

**File**: `src/lib/day-plan-limits.ts`, `src/lib/day-plan-dates.ts`

**Intent**: Domknąć liczby, które zna zarówno serwer, jak i wyspa, oraz dać polską nazwę dnia tygodnia dla promptu i dla kart.

**Contract**: `WEEK_DAYS = 5`; `OUTLINE_ATTEMPT_TIMEOUT_MS` / `OUTLINE_TOTAL_BUDGET_MS` (krótsze niż dzienne — odpowiedź to pięć krótkich stringów, nie piętnaście opisów). `weekdayLabel(isoDate): string` — `poniedziałek`…`piątek`, pinowane do `Europe/Warsaw`/UTC tak samo jak `formatPlanDate`.

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npx astro check`, `npm run build` czyste
- `npm run test:db` nadal zielony (faza nie rusza schematu)

#### Manual Verification:

- Wywołanie `generateWeekOutline` z hasłem „Dinozaury": pięć tematów, różnych między sobą, po polsku, każdy ≤ 200 znaków
- Wywołanie `generateDayActivities` **bez** kontekstu daje wynik nieodróżnialny od dzisiejszego (kontrakt dnia nie zmienił zachowania dla `/plan?date=`)
- Wywołanie z kontekstem: trzy propozycje wyraźnie osadzone w podanym temacie

**Implementation Note**: Zatrzymaj się na potwierdzenie przed Fazą 3 — bramka jakości ocenia dokładnie te dwa prompty.

---

## Phase 3: Bramka jakości promptów

### Overview

`lessons.md` #3: kiedy prompt jest jedyną warstwą bezpieczeństwa treści, bramka musi objąć **każdy
model dopuszczony do konfiguracji**, a każda zmiana promptu wymaga ponownego przebiegu. Ten slice
zmienia oba prompty naraz, a `OPENROUTER_MODEL` nadal da się podmienić bez deployu.

### Changes Required:

#### 1. Rozszerzenie skryptu porównawczego

**File**: `scripts/compare-models.sh`

**Intent**: Uruchomić oba prompty przez te same trzy modele i te same pięć haseł, czytając prompty i schematy prosto z `src/lib/services/prompts/` — przebieg na kopii dowodziłby czegoś o kopii.

**Contract**: Przełącznik trybu (`PROMPT=day|week-outline`, domyślnie oba). Tryb `week-outline` wysyła hasło i pięć dat; tryb `day` składa wiadomość użytkownika tak samo jak `generateDayActivities` z kontekstem, biorąc tematy z odpowiadającego przebiegu szkicu — inaczej bramka oceniałaby prompt dnia w konfiguracji, w której produkcja go nie używa. Modele, hasła, `MAX_TIME`, `TEMPERATURE` i `MAX_TOKENS` bez zmian.

#### 2. Przebieg i ocena

**File**: `context/changes/week-generation/model-outputs/`, `context/changes/week-generation/model-comparison.md`

**Intent**: Zapisać surowe wyjścia i ocenę, tak jak zrobiło to S-01 — dokument ma odpowiadać na pytanie „czy przy tej zmianie promptu bezpieczeństwo się utrzymało", a nie „który model jest ładniejszy".

**Contract**: Ocena po kryteriach z S-01 (bezpieczeństwo, adekwatność wiekowa, polszczyzna, wykonalność w zwykłej sali) plus dwa nowe dla szkicu: rozłączność tematów i to, czy hasło nieodpowiednie zostało przesunięte, a nie skomentowane odmową. Werdykt kończy się jawną decyzją o `DEFAULT_MODEL` — utrzymanym albo zmienionym, z uzasadnieniem.

### Success Criteria:

#### Automated Verification:

- `./scripts/compare-models.sh` kończy się kodem 0 dla obu trybów i trzech modeli
- Każde wyjście przechodzi walidację kształtu (`jq`: pięć tematów o unikalnych `dzien`; trzy aktywności na dzień)

#### Manual Verification:

- Przegląd wszystkich wyjść pod kątem treści nieodpowiedniej dla dzieci 3–6 lat; żadne naruszenie nie zostaje bez decyzji zapisanej w `model-comparison.md`
- Tematy w obrębie tygodnia są rozłączne dla wszystkich pięciu haseł testowych
- Hasło „Dzień Matki" (to, na którym S-01 sprawdzało wykluczanie dzieci) nie regresowało po dołożeniu tematu do promptu dnia

**Implementation Note**: To jest bramka, nie formalność. Jeśli którykolwiek dopuszczony model zawodzi na bezpieczeństwie, decyzja (zawężenie listy modeli, poprawka promptu, ponowny przebieg) zapada tutaj — przed UI.

---

## Phase 4: Warstwa danych i trasy

### Overview

Odczyt tygodnia i miesiąca w jedynym module dostępu do danych, nowa trasa szkicu i dwa nowe pola w
trasie dnia. Nic tu nie renderuje.

### Changes Required:

#### 1. Helpery dat

**File**: `src/lib/day-plan-dates.ts`

**Intent**: Dać serwerowi i wyspie jedną definicję tego, czym jest „tydzień od poniedziałku" i „miesiąc" — skopiowana implementacja jest dokładnie tym, co ten moduł powstał eliminować (S-02).

**Contract**: `resolveWeekStart(value): string` — dowolna data ISO przycięta do swojego poniedziałku, `null`/śmieć → poniedziałek bieżącego tygodnia wg `todayIsoDate()` (fallback, nie błąd, tak jak `resolvePlanDate`). `workingDaysOf(monday): readonly string[]` — pięć dat. `resolveMonth(value): string` (`YYYY-MM`), `weeksOfMonth(month): readonly string[]` — poniedziałki tygodni dotykających miesiąca. `formatWeekRange(monday): string` — np. `14–18 września 2026`.

#### 2. Odczyt tygodnia i miesiąca

**File**: `src/lib/services/day-plan-store.ts`

**Intent**: Dołożyć dwa odczyty do jedynego modułu, który sięga do tych tabel, bez otwierania drugiej drogi do `CurrentActivity`.

**Contract**: `readWeekPlans(supabase, dates): Promise<Map<string, DayPlanWithCurrentActivities>>` — jedno zapytanie o plany (`.in("plan_date", dates)`), jedno o propozycje (`.in("plan_id", ids)`, `order("ordinal")`), po czym `selectCurrentGeneration` per plan; brak filtra po `user_id`, tak jak w całym module (robi to RLS). Dzień bez planu po prostu nie ma klucza w mapie. `readMonthSummary(supabase, fromDate, toDate): Promise<DayPlanSummary[]>` — same `day_plans`, bez propozycji: siatka miesiąca potrzebuje tylko „jest plan / jest zaakceptowany".

#### 3. Kontrakt wejścia

**File**: `src/lib/services/day-plan-contract.ts`, `src/types.ts`

**Intent**: Przenieść temat i politykę pomijania na drut, oraz nazwać nowe modele odczytu.

**Contract**: `generateDayPlanRequestSchema` zyskuje `theme: z.string().min(1).max(THEME_MAX).optional()` i `only_if_absent: z.boolean().default(false)` — obie domyślne wartości są bezpieczne dla starszego klienta (brak tematu = zachowaj istniejący, brak flagi = zachowanie sprzed slice'u). `weekOutlineRequestSchema`: `{ prompt, dates: z.array(z.iso.date()).length(WEEK_DAYS) }`. W `types.ts`: `DayTheme`, `WeekPlanView`, `DayPlanSummary`; `GenerateDayPlanCommand` zyskuje `theme` i `require_absent`.

#### 4. Trasa szkicu

**File**: `src/pages/api/day-plan/week/outline.ts`

**Intent**: Wywołać model po łuk tygodnia i oddać go klientowi. Nic nie zapisuje — temat trafia do bazy dopiero z generacją dnia, która go używa.

**Contract**: `POST`, ta sama sekwencja bramek co `generate.ts` (sesja → `json()` → zod → `supabase`), odpowiedź `{ themes: DayTheme[] }`, błędy przez istniejącą kopertę `{ error, retryable }` z tą samą tabelą statusów per kategoria.

#### 5. Trasa dnia

**File**: `src/pages/api/day-plan/generate.ts`, `src/lib/services/day-plan-store.ts`, `src/lib/services/day-plan-http.ts`

**Intent**: Przekazać temat do modelu i do zapisu, a politykę pomijania sprawdzić przed wywołaniem modelu — z tego samego powodu, dla którego sprawdzane jest tam `confirm_replace`: odmowa po 30 sekundach kosztuje tokeny za partię, która nigdy nie zostanie zapisana.

**Contract**: `generateDayActivities(prompt, { planDate, theme })`; `saveGeneration` przekazuje `p_theme` i `p_require_absent`. Istniejący pre-check rozszerza się o „`only_if_absent` i plan istnieje → `conflict`". W `day-plan-http.ts` `U0002` mapuje się na kategorię `conflict` z komunikatem nazywającym przyczynę („Ten dzień ma już plan — nie został nadpisany."), przez `userMessage` na miejscu rzutu, bo domyślny komunikat kategorii mówi o odświeżeniu strony.

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npx astro check`, `npm run build` czyste
- `npm run test:db` zielony
- Build bez `SUPABASE_URL`/`SUPABASE_KEY` przechodzi (jak w CI)

#### Manual Verification:

- `POST /api/day-plan/week/outline` bez sesji → 401 `application/json`; z sesją → pięć tematów
- `POST /api/day-plan/generate` z `only_if_absent: true` na dniu z planem → 409 z komunikatem o istniejącym planie, **bez** wywołania modelu (brak wpisu `generation.succeeded` w logu)
- Ten sam request z `theme` na dniu pustym → plan zapisany, kolumna `theme` ustawiona
- Regeneracja z `/plan?date=` (bez `theme`) → temat zachowany
- Odczyt tygodnia zawierającego dni dwóch różnych kont zwraca wyłącznie dni wołającego

**Implementation Note**: Zatrzymaj się na potwierdzenie przed Fazą 5.

---

## Phase 5: Ekran tygodnia

### Overview

Nowa strona i nowa wyspa. Wyspa jest orkiestratorem: woła szkic, potem pięć generowań równolegle,
potem — na życzenie — pięć akceptacji. Stan jest per dzień, bo porażek i ponowień jest pięć.

### Changes Required:

#### 1. Strona

**File**: `src/pages/plan/week.astro`

**Intent**: Wyrenderować tydzień po stronie serwera, żeby zapisane dni były na ekranie w pierwszym malowaniu — ten sam powód, dla którego robi to `plan.astro`.

**Contract**: `resolveWeekStart(Astro.url.searchParams.get("from"))` → `workingDaysOf` → `readWeekPlans`. Powtarza rozdział, którego nauczyło S-02: „brak planu" i „nie udało się odczytać" renderują się **inaczej** — nieudany odczyt nie pokazuje zaproszenia do generowania, bo generowanie na dniu, o którym nic nie wiemy, może skasować zaakceptowany plan. Nawigacja: poprzedni/następny tydzień i powrót do miesiąca.

#### 2. Wyspa tygodnia

**File**: `src/components/plan/WeekPlanBoard.tsx`

**Intent**: Zamienić jedno hasło w pięć zapisanych dni, pokazując po drodze, co się dzieje z każdym z nich z osobna.

**Contract**: Stan per dzień (`empty | skipped | generating | done | failed`) plus stan globalny dla szkicu. „Generuj tydzień": szkic → `Promise.allSettled` na dniach **bez** planu, każdy z `theme`, `only_if_absent: true`. Dni z planem od razu wchodzą w `skipped` i nie generują niczego. Blokada `inFlight` jest per dzień; globalna obejmuje wyłącznie szkic i przycisk tygodnia. Ponowienie jest zawsze kliknięciem, nigdy automatem (wewnętrzne ponowienie generatora już istnieje). „Akceptuj tydzień": `Promise.allSettled` na `POST /api/day-plan/accept` dla dni gotowych i niezaakceptowanych, każdy ze swoim `expected_generation` z widoku. Podsumowanie „gotowe 4 z 5" i notka o koszcie (jedno wywołanie szkicu + po jednym na dzień). Rozpoznawanie odpowiedzi przez predykaty typu, jak w `DayPlanEditor` — `DayPlanView`, nie brandowany typ.

#### 3. Karta dnia

**File**: `src/components/plan/WeekDayCard.tsx`

**Intent**: Jeden dzień na ekranie tygodnia: co się w nim dzieje i co można z nim zrobić bez wychodzenia.

**Contract**: Nagłówek (`weekdayLabel` + data), temat, stan akceptacji (`acceptanceOf`), trzy propozycje w trybie tylko do odczytu, `GenerationProgress` w trakcie generowania, komunikat + „Ponów" przy porażce, etykieta „pominięty — ten dzień ma już plan" oraz link „Otwórz dzień" do `/plan?date=`. Dzień bez zapamiętanego tematu mówi wprost, że ponowienie pójdzie z samego hasła.

#### 4. Wejście

**File**: `src/pages/dashboard.astro`

**Intent**: Dać wejście w tydzień z pulpitu.

**Contract**: Link do `/plan/week` obok istniejącego „Generuj plan dnia".

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npx astro check`, `npm run build` czyste
- `GET /plan/week` bez sesji → 302 na `/auth/signin` (pokryte przez `startsWith("/plan")`)
- `npm run test:db` zielony

#### Manual Verification:

- Pusty tydzień + hasło „Dinozaury" → pięć kart generuje się równolegle, każda z własnym licznikiem sekund; po zakończeniu pięć dni z **wyraźnie różnymi** propozycjami
- Tydzień z jednym dniem zajętym → ten dzień oznaczony „pominięty", jego propozycje nietknięte, cztery pozostałe wygenerowane
- Sztuczna porażka jednego dnia (przerwany `fetch`) → cztery dni zapisane, jeden z komunikatem i „Ponów"; ponowienie domyka tydzień bez ruszania pozostałych
- „Akceptuj tydzień" → wszystkie gotowe dni zaakceptowane; po odświeżeniu stan się utrzymuje
- Regeneracja jednego dnia z `/plan?date=` → w tygodniu zmienił się tylko ten dzień, akceptacje pozostałych stoją (AC US-01)
- Odświeżenie w trakcie generowania nie zostawia planu w stanie sprzecznym

**Implementation Note**: Zatrzymaj się na potwierdzenie przed Fazą 6.

---

## Phase 6: Siatka miesiąca

### Overview

Punkt wejścia: miesiąc pokazuje, które dni mają plan, i prowadzi w tydzień albo w dzień. Bez
generowania i bez edycji — sama nawigacja i stan.

### Changes Required:

#### 1. Strona miesiąca

**File**: `src/pages/plan/month.astro`

**Intent**: Pokazać rytm, w którym nauczyciel faktycznie pracuje (PRD: 20–22 dni raz w miesiącu), i stąd wchodzić w tygodnie.

**Contract**: `resolveMonth(Astro.url.searchParams.get("month"))` → zakres dat → `readMonthSummary`. Ten sam rozdział „pusto" vs „nie udało się odczytać" co pozostałe strony. Nawigacja poprzedni/następny miesiąc.

#### 2. Siatka

**File**: `src/components/plan/MonthGrid.astro`

**Intent**: Wyświetlić dane przekazane w propsach — bez stanu, więc komponent Astro, nie React (reguła z `CLAUDE.md`).

**Contract**: Tygodnie w wierszach, dni robocze wyróżnione. Każdy dzień: numer, znacznik stanu (brak planu / roboczy / zaakceptowany) i link do `/plan?date=`. Każdy wiersz: link „Zaplanuj tydzień" do `/plan/week?from=`. Weekendy widoczne, ale wyraźnie poza zakresem generowania tygodnia.

#### 3. Wejście

**File**: `src/pages/dashboard.astro`, `src/pages/plan/week.astro`

**Intent**: Domknąć nawigację w obie strony.

**Contract**: Link do `/plan/month` z pulpitu i powrót do miesiąca z widoku tygodnia.

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npx astro check`, `npm run build` czyste
- `GET /plan/month` bez sesji → 302 na `/auth/signin`

#### Manual Verification:

- Miesiąc z danymi testowymi pokazuje właściwe dni jako mające plan, z rozróżnieniem roboczy/zaakceptowany
- Wejście w tydzień z siatki trafia w ten tydzień, który został kliknięty; wejście w dzień trafia w ten dzień
- Miesiąc drugiego konta nie pokazuje dni pierwszego
- Przejście przez granicę roku (grudzień → styczeń) działa w obie strony

---

## Testing Strategy

### pgTAP (`npm run test:db`):

- Zapis z tematem, bez tematu (zachowanie) i z nowym tematem (podmiana)
- `p_require_absent` na dniu zajętym (`U0002`, wiersz nietknięty) i na pustym (zapis przechodzi)
- Granty: `authenticated` ma UPDATE na `theme`, `anon` nie ma EXECUTE na nowej sygnaturze
- CHECK długości tematu: pusty i 201 znaków odrzucone
- Każda nowa asercja weryfikowana mutacją usuwającą jej strażnika — praktyka wprowadzona przez przegląd S-02 (F9), która wykryła tam asercję nic nie dowodzącą

### Weryfikacja ręczna:

1. Pusty tydzień → generowanie → pięć różnych dni
2. Tydzień z dniem zajętym → ten dzień pominięty, reszta wygenerowana
3. Wymuszona porażka jednego dnia → sukcesy zachowane, ponowienie punktowe
4. Akceptacja tygodnia → stan trwały po odświeżeniu
5. Regeneracja jednego dnia z `/plan?date=` → pozostałe dni i ich akceptacje nietknięte (AC US-01)
6. Temat zachowany po regeneracji dnia bez tematu
7. Izolacja kont na tygodniu i na miesiącu
8. Bramka jakości: wyjścia trzech modeli dla obu promptów przejrzane pod kątem bezpieczeństwa

### Czego nie testujemy automatycznie:

Zachowania wyspy (brak runnera TS/React — Moduł 3) oraz jakości treści modelu, która z definicji nie
jest deterministyczna. Bramka z Fazy 3 jest jednorazowym sprawdzeniem decyzyjnym, nie regresyjnym — i
jest tak opisana w skrypcie od S-01.

## Performance Considerations

Pięć równoległych wywołań to pięć podżądań w oknie jednego kliknięcia, każde po 10–30 s. Workers nie
liczy oczekiwania na I/O do czasu CPU, a każde żądanie to osobne wywołanie Workera, więc limit
podżądań na żądanie nie jest tu w grze — to wyspa, nie serwer, trzyma pięć połączeń. Realne ryzyko to
429 po stronie OpenRoutera; obsługa jest już w generatorze (jedno ponowienie z backoffem dla
`transient`), a wyspa świadomie **nie** dokłada drugiego. Odczyt tygodnia to dwa zapytania niezależnie
od liczby dni (`in (…)`), a odczyt miesiąca jedno — bez propozycji, bo siatka ich nie pokazuje.

## Migration Notes

Kolumna wchodzi jako nullable, bo tabele nie są już puste (dane testowe z S-02). `null` w `theme` to
prawidłowy stan trwały — dzień zaplanowany poza tygodniem nie ma tematu i nigdy go mieć nie będzie.
Rollback: `drop column theme`, przywrócenie czteroargumentowej funkcji z `20260823193447` i jej
grantów.

**Hosted project nadal nie ma żadnej z migracji** (notka z `change.md` S-02, krok 1.7). Ta migracja
dokłada się do tej samej kolejki; `npx supabase db push` pozostaje warunkiem wdrożenia, nie
implementacji.

## Addendum — 2026-08-26, po przeglądzie implementacyjnym

**Kontrakt dnia z Fazy 2 został w implementacji świadomie zmieniony i ten zapis go prostuje.**

Plan mówił dwukrotnie, że brak kontekstu daje `content: keyword` i że „`/plan?date=` nie zmienia
działania" (§ Faza 2, Overview i Changes Required #3). Sama funkcja `generateDayActivities` tak
działa — ale `generate.ts` przekazuje kontekst **bezwarunkowo**, więc pojedynczy dzień jedzie z dniem
tygodnia (bez tematu, bo nie ma szkicu). To była decyzja implementacyjna z uzasadnieniem w kodzie:
data w promptcie zamyka finding F4 przeglądu S-01 także dla ścieżki jednodniowej, nie tylko dla
tygodnia.

Decyzja zostaje. Prostujemy zapis, nie kod — z jednym warunkiem, który przegląd wymusił: bramka
jakości musi objąć tę konfigurację. Do `compare-models.sh` doszedł czwarty tryb **`day-weekday`**
(hasło + dzień tygodnia, bez tematu), przebiegnięty 2026-08-26 dla trzech modeli i pięciu haseł —
14/15, zero naruszeń treści, decyzja o `DEFAULT_MODEL` bez zmian. Szczegóły w `model-comparison.md`
§ „Ponowny przebieg 2026-08-26".

Konfiguracje promptu dnia, jakie realnie istnieją, i tryb bramki, który każdą pokrywa:

| Konfiguracja | Kto ją wysyła | Tryb bramki |
| --- | --- | --- |
| samo hasło | nikt — punkt odniesienia S-01 | `day` |
| hasło + dzień tygodnia | `/plan?date=` (trasa dnia) | `day-weekday` |
| hasło + dzień tygodnia + temat | generowanie tygodnia | `day-themed` |

Kryterium 2.4 („wynik nieodróżnialny od dzisiejszego") pozostaje zaznaczone jako spełnione, bo
dotyczy funkcji `generateDayActivities` wywołanej bez kontekstu — i tam nadal jest prawdziwe. Nie
dotyczyło trasy, i to jest luka, którą ten addendum zamyka.

## References

- Roadmap: `context/foundation/roadmap.md` § S-03 (oba Unknowns rozstrzygnięte tym planem)
- Lekcje: `context/foundation/lessons.md` #3 (bramka jakości promptu) — Faza 3
- Poprzedni slice: `context/archive/2026-08-23-edit-accept-day-plan/plan.md`, przegląd F1/F4/F9
- Finding, który ten slice zamyka: `context/archive/2026-08-22-first-day-generation/reviews/impl-review.md` F4
- Kontrakt zapisu: `supabase/migrations/20260823095136_day_plan_generation_write_contract.sql`, `supabase/migrations/20260823193447_confirm_replacing_accepted_plan.sql`

## Progress

> Konwencja: `- [ ]` do zrobienia, `- [x]` zrobione. Dopisz ` — <commit sha>`, gdy krok wyląduje.
> Nie zmieniaj tytułów kroków. Patrz `references/progress-format.md`.

### Phase 1: Schemat — temat dnia i odmowa nadpisania

#### Automated

- [x] 1.1 `npx supabase db reset` przechodzi czysto — 0c78d67
- [x] 1.2 `npm run test:db` zielony, z nowymi asercjami — 0c78d67
- [x] 1.3 Każda nowa asercja czerwienieje pod mutacją usuwającą swojego strażnika — 0c78d67
- [x] 1.4 `npx supabase gen types typescript --local` bajt w bajt zgodny z plikiem w repo — 0c78d67
- [x] 1.5 `npm run lint`, `npx astro check`, `npm run build` czyste — 0c78d67

#### Manual

- [x] 1.6 RPC z `p_require_absent := true` na dniu zajętym → `U0002`, plan nietknięty — 0c78d67
- [x] 1.7 Regeneracja dnia z UI zachowuje temat — 0c78d67

### Phase 2: Kontrakt szkicu tygodnia

#### Automated

- [x] 2.1 `npm run lint`, `npx astro check`, `npm run build` czyste — b04832e
- [x] 2.2 `npm run test:db` nadal zielony — b04832e

#### Manual

- [x] 2.3 `generateWeekOutline("Dinozaury")` → pięć różnych tematów po polsku, każdy ≤ 200 znaków — b04832e
- [x] 2.4 `generateDayActivities` bez kontekstu daje wynik nieodróżnialny od dzisiejszego — b04832e
- [x] 2.5 `generateDayActivities` z kontekstem → propozycje osadzone w temacie — b04832e

### Phase 3: Bramka jakości promptów

#### Automated

- [x] 3.1 `./scripts/compare-models.sh` kończy się kodem 0 dla obu trybów i trzech modeli — 3216c04
- [x] 3.2 Walidacja kształtu wyjść przez `jq` przechodzi dla wszystkich przebiegów — 3216c04

#### Manual

- [x] 3.3 Przegląd wszystkich wyjść pod kątem treści nieodpowiedniej; każde naruszenie z zapisaną decyzją — 3216c04
- [x] 3.4 Tematy rozłączne dla wszystkich pięciu haseł testowych — 3216c04
- [x] 3.5 Hasło „Dzień Matki" bez regresji po dołożeniu tematu do promptu dnia — 3216c04
- [x] 3.6 `model-comparison.md` kończy się jawną decyzją o `DEFAULT_MODEL` — 3216c04

### Phase 4: Warstwa danych i trasy

#### Automated

- [x] 4.1 `npm run lint`, `npx astro check`, `npm run build` czyste — 4b7f3ca
- [x] 4.2 `npm run test:db` zielony — 4b7f3ca
- [x] 4.3 Build bez `SUPABASE_URL`/`SUPABASE_KEY` przechodzi — 4b7f3ca

#### Manual

- [x] 4.4 `POST /api/day-plan/week/outline` bez sesji → 401 JSON; z sesją → pięć tematów — 4b7f3ca
- [x] 4.5 `only_if_absent: true` na dniu zajętym → 409 bez wywołania modelu — 4b7f3ca
- [x] 4.6 `theme` na dniu pustym → plan zapisany z ustawioną kolumną — 4b7f3ca
- [x] 4.7 Regeneracja bez `theme` zachowuje temat — 4b7f3ca
- [x] 4.8 Odczyt tygodnia zwraca wyłącznie dni wołającego konta — 4b7f3ca

### Phase 5: Ekran tygodnia

#### Automated

- [x] 5.1 `npm run lint`, `npx astro check`, `npm run build` czyste — 8eefc5f
- [x] 5.2 `GET /plan/week` bez sesji → 302 na `/auth/signin` — 8eefc5f
- [x] 5.3 `npm run test:db` zielony — 8eefc5f

#### Manual

- [x] 5.4 Pusty tydzień → pięć kart równolegle, pięć wyraźnie różnych dni — 8eefc5f
- [x] 5.5 Tydzień z dniem zajętym → dzień pominięty i nietknięty — 8eefc5f
- [x] 5.6 Porażka jednego dnia → sukcesy zachowane, ponowienie punktowe domyka tydzień — 8eefc5f
- [x] 5.7 „Akceptuj tydzień" → stan trwały po odświeżeniu — 8eefc5f
- [x] 5.8 Regeneracja jednego dnia nie rusza pozostałych (AC US-01) — 8eefc5f
- [x] 5.9 Odświeżenie w trakcie generowania nie zostawia stanu sprzecznego — 8eefc5f

### Phase 6: Siatka miesiąca

#### Automated

- [x] 6.1 `npm run lint`, `npx astro check`, `npm run build` czyste — 6cde46c
- [x] 6.2 `GET /plan/month` bez sesji → 302 na `/auth/signin` — 6cde46c

#### Manual

- [x] 6.3 Siatka pokazuje właściwe dni z rozróżnieniem roboczy/zaakceptowany — 6cde46c
- [x] 6.4 Wejście w tydzień i w dzień trafia we właściwy tydzień i dzień — 6cde46c
- [x] 6.5 Miesiąc drugiego konta nie pokazuje dni pierwszego — 6cde46c
- [x] 6.6 Przejście grudzień → styczeń działa w obie strony — 6cde46c
