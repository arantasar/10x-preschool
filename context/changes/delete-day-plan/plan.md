# Usunięcie planu dnia — plan implementacji

## Overview

Nauczyciel usuwa zapisany plan wybranego dnia z poziomu widoku tego dnia. Wiersz `day_plans` znika, kaskada klucza obcego zabiera jego aktywności, a dzień wraca do stanu **nieodróżnialnego od dnia nigdy nieplanowanego** — na wszystkich trzech powierzchniach (miesiąc, tydzień, dzień) i dla `save_day_plan_generation`, więc generowanie tygodnia znowu go obejmie.

Kasowanie jest **twarde**. Roadmapowy Outcome S-05 zakładał skreślenie miękkie; ta decyzja została odwrócona w sesji planowania i faza 4 koryguje roadmapę do stanu faktycznego.

Slice **nie ma migracji**: polityka `authenticated users can delete their own day plans` i `on delete cascade` na `activities_plan_id_user_id_fkey` istnieją od F-01 i nigdy nie były przez nikogo używane. Ten slice jest ich pierwszym użytkownikiem i pierwszym dowodem, że działają.

## Current State Analysis

**Kasowanie jest już w schemacie, kompletne, od pierwszej migracji.** `20260718211452_day_plans_and_activities.sql` tworzy politykę DELETE dla `authenticated` (`using ((select auth.uid()) = user_id)`), jawny deny dla `anon`, oraz `constraint activities_plan_id_user_id_fkey foreign key (plan_id, user_id) references public.day_plans (id, user_id) on delete cascade`. Późniejsze migracje tego nie ruszały: `20260720162553` zdjął `authenticated` wyłącznie **UPDATE** (`revoke update on public.day_plans from authenticated`), przywilej DELETE został nietknięty. `revoke all … from anon` z F-01 dotyczy tylko roli anonimowej.

**Ryzyka, które roadmapa przypisała temu slice'owi, są ryzykami skreślenia miękkiego i przy twardym nie powstają.** (1) „Nowa kolumna nie dziedziczy grantu UPDATE" — nie dodajemy kolumny. (2) „Skreślony miękko dzień wciąż zajmuje `unique (user_id, plan_date)` i czyta się jako `v_exists = true`" — skasowany wiersz nie zajmuje nic; `select … for update` w `save_day_plan_generation` nie znajduje niczego, `v_exists` zostaje `null`, `coalesce(v_exists, false)` daje `false`, `p_require_absent` przepuszcza. To jest własność, którą faza 1 asertuje wprost, a nie zakłada.

**Ścieżki odczytu nie wymagają ani jednej zmiany.** `readDayPlan`, `readDayPlanById`, `readWeekPlans` i `readMonthSummary` (`src/lib/services/day-plan-store.ts`) pytają o wiersze, które istnieją. Po `delete` nie ma wiersza, więc `readDayPlan` zwraca `null`, `readWeekPlans` nie zakłada klucza w mapie, a `readMonthSummary` nie zwraca rekordu — czyli dokładnie to, co każda z tych funkcji już dziś znaczy przez „ten dzień jest wolny". To jest jedyna i cała różnica między twardym a miękkim kasowaniem w warstwie aplikacji: miękkie wymagałoby nauczenia skreślenia wszystkich czterech.

**`generate.ts` też nie wymaga zmiany.** Tania przedkontrola (`src/pages/api/day-plan/generate.ts:123`) woła `readDayPlan` i pyta o `existing`. Po skasowaniu `existing` jest `null`, więc ani `only_if_absent`, ani gałąź `accepted_at` się nie odpalają.

**Wyspa nie umie dziś przyjąć sukcesu bez planu.** `mutate()` (`src/components/plan/DayPlanEditor.tsx:128`) uznaje odpowiedź za udaną tylko gdy `response.ok && isDayPlanBody(body)`. Kasowanie nie ma planu do zwrócenia, więc bez zmiany w `mutate` udane `204` wylądowałoby w gałęzi błędu. `mutate` ma już precedens rozgałęziania po `busyKind` — `if (busyKind === "generating") setPrompt(body.plan.prompt)` (linia 136) — i to jest kształt, który ta zmiana powtarza.

**Nagłówek dnia jest statycznym SSR i wyspa go nie dosięga.** `src/pages/plan.astro:55` renderuje `{initialPlan?.plan.theme && <p …>{initialPlan.plan.theme}</p>}`. S-08 przyjął to świadomie, z uzasadnieniem „temat jest z poziomu tej strony niezmienny" — bo `DayPlanEditor` nie wysyła `theme`, a `coalesce` w zapisie zachowuje istniejący. Kasowanie łamie dokładnie ten niezmiennik: po nim temat **powinien** zniknąć, a wyspa nie ma jak go usunąć. To jest powód, dla którego ten slice po skasowaniu przeładowuje stronę zamiast tylko czyścić stan (patrz Critical Implementation Details).

**Izolacja kasowania między kontami jest już przetestowana; kaskada nie.** `supabase/tests/database/rls_isolation.test.sql` asertuje, że kasowanie cudzego planu dotyka zero wierszy (`day_plans_delete`) i że kasowanie własnego dotyka dokładnie jednego (`day_plans_self_delete`). Ale ta druga asercja kasuje **najpierw** aktywności, a dopiero potem plan — komentarz w linii 193 mówi o tym wprost („rob the activities delete assertion of its subject"). Kaskada nie jest więc przez nic sprawdzana, a od niej zależy cały ten slice.

**Bramka automatyczna.** `npm run lint`, `npx astro check`, `npm run build` (tak robi każdy zarchiwizowany plan) plus pgTAP przez `npm run test:db` — dwa pliki, `plan(23)` i `plan(42)`. Brak runnera testów JS. `test:db` nie stoi w CI (`.github/workflows/ci.yml` robi `npm ci`, `astro sync`, lint, build) i ten slice tego nie zmienia.

**`lessons.md` — dwie reguły mają tu zastosowanie.** „Odroczone sprzątanie danych musi mieć właściciela" jest argumentem **za** twardym kasowaniem: skreślenie miękkie zostawiłoby w tabeli wiersze bez czytelnika i bez właściciela sprzątania. „Kryterium weryfikacji musi móc nie przejść" wymusza kształt asercji pgTAP w fazie 1 — każda musi zostać sprawdzona mutacją, zgodnie z metodą, którą oba istniejące pliki testowe deklarują w nagłówku.

**Gałąź.** Repo stoi na `master`. CLAUDE.md wymaga gałęzi funkcyjnej przed **pierwszym** commitem tego slice'u.

## Desired End State

Nauczyciel otwiera dzień z zapisanym planem, klika „Usuń plan dnia", potwierdza dialog nazywający stratę — i ląduje na tym samym dniu, pustym: formularz hasła bez treści, komunikat „Ten dzień nie ma jeszcze planu", nagłówek bez podtytułu. Powrót do siatki miesiąca pokazuje kafelek w stanie „brak planu". Wygenerowanie tygodnia, w którym ten dzień leży, obejmuje go ponownie zamiast pominąć.

Weryfikacja: dzień skasowany i dzień nigdy nieplanowany są nieodróżnialne na wszystkich trzech ekranach oraz dla `p_require_absent` — i to ostatnie jest asertowane w pgTAP, a nie tylko oglądane.

### Key Discoveries:

- `20260718211452_day_plans_and_activities.sql` — polityka DELETE dla `authenticated` i `on delete cascade` na `activities_plan_id_user_id_fkey` istnieją od F-01; slice nie potrzebuje migracji.
- `20260720162553_narrow_authenticated_update_columns.sql` — zdjął `authenticated` wyłącznie UPDATE. Przywilej DELETE nietknięty; faza 1 asertuje to wprost, zamiast na tym polegać.
- `save_day_plan_generation` w `20260823232953_day_theme_and_absent_guard.sql` — `coalesce(v_exists, false)` sprawia, że skasowany dzień jest dla `p_require_absent` dniem wolnym. Zero zmian w funkcji.
- `src/lib/services/day-plan-store.ts` — cztery ścieżki odczytu, wszystkie pytają o istniejące wiersze; twarde kasowanie nie dotyka żadnej. `updateActivityText` (linia 249) to wzorzec dla `deleteDayPlan`: `.select(…).maybeSingle()`, pusty wynik → `not_found`, nigdy filtr na `user_id` (robi to RLS).
- `src/components/plan/DayPlanEditor.tsx:136` — `mutate()` ma już precedens rozgałęziania sukcesu po `busyKind`; kasowanie dokłada drugi.
- `src/pages/plan.astro:55` — podtytuł dnia jest statycznym SSR poza zasięgiem wyspy; to przesądza o przeładowaniu po skasowaniu.
- `supabase/tests/database/rls_isolation.test.sql:193` — asercja kasowania własnego planu celowo kasuje aktywności pierwsza, więc kaskada jest dziś nieprzetestowana.

## What We're NOT Doing

Zakres ustalony w tej sesji planowania:

- **Nie kasujemy miękko.** Bez kolumny `deleted_at`, bez grantu kolumnowego, bez filtrów w ścieżkach odczytu, bez zmiany `save_day_plan_generation`. Odwraca to Outcome S-05; faza 4 koryguje roadmapę.
- **Nie robimy cofania.** Ani okna „Cofnij" w wyspie, ani kosza. Produkt nie ma cofania nigdzie indziej — S-02 usunął undo świadomie (`20260823095136`, sekcja 4: „there is no undo to decrement it"). `window.confirm` jest jedyną i całą ochroną przed pomyłką.
- **Nie kasujemy samych propozycji z zachowaniem hasła.** To stworzyłoby trzeci stan („plan istnieje, ale jest pusty"), którego dziś nie ma nigdzie: kafelek miesiąca pokazywałby dzień jako zaplanowany, a generowanie tygodnia by go pominęło.
- **Nie dokładamy kasowania do tablicy tygodnia ani do siatki miesiąca.** Outcome S-05 mówi „z poziomu widoku tego dnia" — jedna powierzchnia, na której nauczyciel widzi treść, którą kasuje. `WeekPlanBoard.tsx`, `WeekDayCard.tsx` i `MonthGrid.astro` pozostają nietknięte.
- **Nie warunkujemy kasowania na `expected_generation`.** Akceptacja poświadcza konkretną partię i dlatego jej potrzebuje; „ten dzień ma być pusty" jest prawdziwe niezależnie od tego, która partia w nim stoi.
- **Nie ruszamy migracji, RLS ani grantów.** Wszystko, czego ten slice potrzebuje, stoi od F-01.
- **Nie wpinamy `test:db` do CI.** To zakres konfiguracji CI, nie tego slice'u. Nowy plik testowy uruchamia się lokalnie, tak jak dwa istniejące.
- **Nie zmieniamy koperty odpowiedzi dla istniejących tras.** `generate`, `accept` i `activity/[id]` odpowiadają dalej pełnym planem.

## Implementation Approach

Cztery fazy w kolejności od dołu stosu do góry, każda samodzielnie weryfikowalna.

Faza 1 dokłada jedną funkcję do warstwy store i **nowy plik pgTAP**, który dowodzi czterech własności, o których aplikacja milczy, gdy pękną: że `authenticated` naprawdę ma przywilej DELETE, że kaskada zabiera aktywności skasowanego dnia i tylko jego, i że po skasowaniu `p_require_absent` znowu przepuszcza generację. Faza 2 wystawia to jako `DELETE` na istniejącej trasie. Faza 3 dokłada przycisk i dialog. Faza 4 domyka roadmapę.

Nowy plik testowy, a nie dopisek do istniejących, bo oba mają w nagłówku zadeklarowaną tożsamość: `rls_isolation.test.sql` to dowód izolacji kont z F-01, `day_plan_write.test.sql` to własności ścieżki zapisu z S-02. Kasowanie jest trzecią własnością i dostaje trzeci plik — tak jak S-02 dostał drugi.

## Critical Implementation Details

**Po skasowaniu strona się przeładowuje, i to nie jest wygoda, tylko poprawność.** Podtytuł dnia (`src/pages/plan.astro:55`) jest statycznym tekstem SSR renderowanym z `initialPlan.plan.theme`. Wyspa nie ma do niego dostępu. Gdyby kasowanie tylko ustawiło `plan: null` po stronie klienta, nauczyciel zostałby z nagłówkiem niosącym temat skasowanego dnia nad komunikatem „Ten dzień nie ma jeszcze planu" — sprzeczność tego samego rodzaju co „brak planu" pomylone z „nie udało się odczytać", którą S-02 i S-04 wyplewiały z każdego ekranu. `window.location.assign('/plan?date=<dzień>')` po sukcesie oddaje SSR jedyne źródło prawdy o opróżnionym dniu: nagłówek, formularz i komunikat pustego dnia powstają razem, z jednego odczytu. Alternatywą byłoby wciągnięcie tematu do wyspy, co cofnęłoby świadomą decyzję S-08 i przesunęło podtytuł z nagłówka do karty.

**`204` nie ma ciała i `mutate()` musi to wiedzieć zawczasu.** `await response.json().catch(() => null)` na odpowiedzi bez ciała daje `null`, a `isDayPlanBody(null)` jest `false` — bez jawnej gałęzi dla `busyKind === "deleting"` udane kasowanie zameldowałoby się jako błąd „Nie udało się zapisać zmiany", po czym `reconcile()` pokazałby pusty dzień. Nauczyciel zobaczyłby komunikat o porażce nad skutkiem sukcesu.

**Przycisk kasowania nie może być bramkowany na `hasActivities`.** Sekcja z propozycjami i przyciskiem akceptacji renderuje się pod warunkiem `plan && hasActivities` (`DayPlanEditor.tsx:364`). Wiersz `day_plans` bez żywej partii jest przez ścieżki aplikacji nieosiągalny, ale gdyby powstał, byłby dokładnie tym dniem, który najbardziej wymaga skasowania: niewidoczny jako plan, a blokujący `p_require_absent` przy generowaniu tygodnia. Warunkiem renderowania przycisku jest `plan !== null`, nie obecność propozycji.

## Phase 1: Kasowanie w warstwie danych

### Overview

`deleteDayPlan` w warstwie store, plus nowy plik pgTAP dowodzący czterech własności schematu, których złamanie nie daje w aplikacji żadnego objawu.

### Changes Required:

#### 1. Funkcja kasująca w warstwie store

**File**: `src/lib/services/day-plan-store.ts`

**Intent**: Jedna funkcja kasująca plan dnia, adresowana datą — tak jak `readDayPlan`, i z tego samego powodu: `unique (user_id, plan_date)` plus RLS oznaczają co najwyżej jeden wiersz na nauczyciela na dzień. Kaskada FK zabiera aktywności; funkcja o nich nie wie i nie ma prawa wiedzieć. Wiersz niewidoczny pod RLS — cudzy albo nieistniejący — nie podnosi błędu, tylko nie dotyka żadnego wiersza, więc pusty wynik jest sprawdzany jawnie i odpowiada `not_found`, nigdy błędem przywileju: powiedzenie „to istnieje, ale nie jest twoje" jest wyrocznią istnienia. Ten sam wzorzec i to samo uzasadnienie co w `updateActivityText`.

**Contract**: `export async function deleteDayPlan(supabase: DayPlanClient, planDate: string): Promise<void>` w sekcji „Writes", umieszczona za `setAcceptance`. Realizacja przez `.from("day_plans").delete().eq("plan_date", planDate).select("id").maybeSingle()`; błąd → `toStoreError(error, "Nie udało się usunąć planu dnia")`; brak danych → `new StoreError("not_found", …, { userMessage: "Ten dzień nie ma planu do usunięcia." })`. Bez filtra na `user_id` — konwencja modułu zapisana w jego komentarzu nagłówkowym: robi to polityka, a zbędny filtr w kodzie stałby się tym, czemu ludzie zaczynają ufać zamiast niej. Bez ponowienia — inaczej niż `saveGeneration`, którego ponowienie kupuje ratunek dla generacji wartej 10–30 s i tokenów; tu ponowienie po utraconej odpowiedzi trafiłoby na `not_found` i zamieniło sukces w komunikat o porażce.

#### 2. Suita pgTAP dla kasowania

**File**: `supabase/tests/database/day_plan_delete.test.sql` (nowy)

**Intent**: Dowód czterech własności, na których stoi cały slice, a które w aplikacji pękają bezobjawowo: brak przywileju DELETE zamienia się w `42501` → config/500 („skontaktuj się z administratorem") na akcji, która nie ma nic wspólnego z konfiguracją; brak kaskady zostawia osierocone aktywności, których nikt nie odczyta; kaskada zbyt szeroka zabiera plany innych dni tego samego nauczyciela; a dzień skasowany, który dla `p_require_absent` wciąż istnieje, byłby cicho pomijany przez generowanie tygodnia — dokładnie ta awaria, którą roadmapa przypisała skreśleniu miękkiemu. Nagłówek pliku ma nazwać tę wspólną cechę i zadeklarować metodę mutacyjną, tak jak robią to oba istniejące pliki.

**Contract**: `begin; select plan(6); … rollback;`. Fixtures w kształcie z `day_plan_write.test.sql`: dwoje nauczycieli w `auth.users`, nauczyciel A z **dwoma** planami w różnych dniach, każdy z własną partią aktywności — drugi plan jest po to, żeby asercja kaskady mogła nie przejść przy kaskadzie zbyt szerokiej. Sekcja kasująca uruchamiana jako `authenticated` przez `set local "request.jwt.claims"` + `set local role authenticated`. Temp table `affected_rows` na liczbę dotkniętych wierszy, tak jak w `rls_isolation.test.sql` — RLS filtruje po cichu, więc kasowanie osądza się liczbą wierszy, nie brakiem błędu.

Sześć asercji:

1. `ok(has_table_privilege('authenticated', 'public.day_plans', 'delete'), …)` — strukturalna, bo `20260720162553` zdjął przywilej UPDATE i dowodem, że nie zabrał przy okazji DELETE, jest tylko sam katalog.
2. Nauczyciel A kasuje własny dzień → dokładnie jeden wiersz.
3. Aktywności tego dnia znikają → `count(*) = 0` dla jego `plan_id`, mimo że nikt ich nie kasował wprost.
4. Aktywności **drugiego** dnia tego samego nauczyciela zostają nietknięte → `count(*)` bez zmian.
5. `save_day_plan_generation(<skasowana data>, …, p_require_absent => true)` **przechodzi** i zwraca plan o `current_generation = 1` — dzień jest naprawdę wolny, nie tylko niewidoczny.
6. Kasowanie dnia, którego nie ma (albo należy do B), dotyka zera wierszy i nie podnosi wyjątku — to jest `not_found`, które warstwa store mapuje na 404.

Metoda z nagłówków obu istniejących suit obowiązuje: każdą asercję sprawdzić mutacją (zdjąć `on delete cascade`, odebrać przywilej, przestawić `coalesce` na `true`) i potwierdzić, że idzie na czerwono. Asercja, która zostaje zielona po zepsuciu rzeczy, której dotyczy, nie testuje niczego.

Nie dopisujemy nic do `rls_isolation.test.sql` ani `day_plan_write.test.sql` — izolacja kasowania jest tam pokryta (`day_plans_delete`, `day_plans_self_delete`) i te pliki mają zostać czytelne jako dokładnie to, czym są.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Build produkcyjny przechodzi: `npm run build`
- Cała suita bazodanowa przechodzi, łącznie z nowym plikiem: `npm run test:db`
- Nowa suita ma sześć asercji i wszystkie przechodzą: `npm run test:db` raportuje `day_plan_delete` bez `not ok`
- Slice nie dokłada migracji: `git diff --name-only master...HEAD -- supabase/migrations/` zwraca pusto
- Ścieżki odczytu nietknięte: `git diff master...HEAD -- src/lib/services/day-plan-store.ts | grep '^[-+].*readMonthSummary\|^[-+].*readWeekPlans\|^[-+].*readDayPlan'` zwraca pusto

#### Manual Verification:

- Każda z sześciu asercji sprawdzona mutacją i zaobserwowana na czerwono; w szczególności asercja 3 po zdjęciu `on delete cascade` i asercja 5 po zamianie `coalesce(v_exists, false)` na `true` (obie mutacje cofnięte przed commitem)
- Asercja 4 przechodzi na czerwono, gdy kaskadę rozszerzyć na wszystkie plany nauczyciela — bez tego asercja 3 przechodziłaby także przy kaskadzie zabierającej za dużo

**Implementation Note**: Po zakończeniu tej fazy i przejściu weryfikacji automatycznej zatrzymaj się i poczekaj na ręczne potwierdzenie od człowieka, zanim przejdziesz do fazy 2.

---

## Phase 2: Trasa DELETE

### Overview

`DELETE /api/day-plan?date=YYYY-MM-DD` — druga metoda w pliku, który już obsługuje `GET` na tym samym adresie i z tym samym parametrem.

### Changes Required:

#### 1. Odpowiedź bez treści

**File**: `src/lib/services/day-plan-http.ts`

**Intent**: Kasowanie nie ma planu do zwrócenia, a `json()` zawsze serializuje ciało. Helper na `204` dołącza do rodziny `unauthorized` / `badRequest` / `unconfigured`, żeby kształt odpowiedzi pozostał własnością tego modułu, a nie decyzją podejmowaną w trasie. Komentarz nagłówkowy modułu mówi, że trasy mają być dla wyspy nieodróżnialne; ta odpowiedź świadomie odróżnia się od pozostałych i to musi być widoczne tutaj, a nie odkrywane w wyspie.

**Contract**: `export function noContent(): Response` zwracająca `new Response(null, { status: 204 })`. Ciało `null`, nie `""` — `204` z ciałem jest niezgodne ze specyfikacją i część runtime'ów to odrzuca. Bez nagłówka `Content-Type`.

#### 2. Metoda DELETE na trasie dnia

**File**: `src/pages/api/day-plan/index.ts`

**Intent**: Kasuje plan wskazanego dnia. Ta sama sekwencja bramek co `GET` w tym samym pliku, w tej samej kolejności — sesja, klient Supabase, walidacja daty — bo obie metody adresują ten sam zasób tym samym parametrem i rozjazd między nimi byłby pułapką dla następnego czytelnika. Uwierzytelnienie sprawdzane tutaj, a nie zostawione middleware'owi, z tego samego powodu co w każdej trasie tego katalogu: przekierowanie na `/auth/signin` wyspa zinterpretowałaby jako błąd parsowania JSON-a.

**Contract**: `export const DELETE: APIRoute` obok istniejącego `GET`. Kolejno: `unauthorized()` przy braku `context.locals.user`; `unconfigured()` przy braku `context.locals.supabase`; `badRequest("Podaj poprawną datę.")` gdy `planDateSchema.safeParse(context.url.searchParams.get("date"))` nie przechodzi. Następnie `await deleteDayPlan(supabase, parsed.data)` w `try`, `noContent()` na sukces, `storeFailure(error)` w `catch`. Brak ciała `JSON` w żądaniu — trasa czyta wyłącznie query string, jak `GET`. `prerender = false` już stoi w pliku i obejmuje obie metody.

Odmowa `not_found` przechodzi przez `storeFailure` jako `404` z `userMessage` ustawionym w `deleteDayPlan` — te same tabele `STATUS_BY_CATEGORY` i `MESSAGE_BY_CATEGORY`, bez nowej kategorii i bez nowego kodu SQLSTATE. `categorize()` nie wymaga zmiany: kasowanie nie podnosi kodu, którego by nie znała.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Typy i szablony Astro przechodzą: `npx astro check`
- Build produkcyjny przechodzi: `npm run build`
- Trasa eksportuje DELETE: `grep -n 'export const DELETE' src/pages/api/day-plan/index.ts` zwraca trafienie
- Nie powstał nowy plik trasy: `git diff --name-only master...HEAD -- src/pages/api/` zawiera wyłącznie `src/pages/api/day-plan/index.ts`
- Wyspa jeszcze nietknięta w tej fazie: `git diff --name-only master...HEAD` nie zawiera `src/components/plan/DayPlanEditor.tsx`

#### Manual Verification:

- `curl -X DELETE` z ciasteczkiem sesji na dzień z planem zwraca `204` bez ciała, a `GET` na ten sam dzień zaraz potem zwraca `404`
- To samo wywołanie powtórzone drugi raz zwraca `404` z komunikatem „Ten dzień nie ma planu do usunięcia."
- `DELETE` bez sesji zwraca `401` jako JSON, a nie przekierowanie na `/auth/signin`
- `DELETE` z `?date=` w złym formacie zwraca `400`
- Po skasowaniu dnia siatka miesiąca pokazuje ten dzień jako „brak planu", a tablica tygodnia jako dzień wolny — bez żadnej zmiany w kodzie tych ekranów
- Generowanie tygodnia obejmującego skasowany dzień generuje go ponownie, zamiast oznaczyć jako „pominięty"

**Implementation Note**: Po zakończeniu tej fazy i przejściu weryfikacji automatycznej zatrzymaj się i poczekaj na ręczne potwierdzenie od człowieka, zanim przejdziesz do fazy 3.

---

## Phase 3: Przycisk w widoku dnia

### Overview

Przycisk „Usuń plan dnia" w `DayPlanEditor`, dialog nazywający stratę i powrót na ten sam dzień w stanie pustym.

### Changes Required:

#### 1. Kasowanie w wyspie dnia

**File**: `src/components/plan/DayPlanEditor.tsx`

**Intent**: Nauczyciel usuwa plan dnia z ekranu, na którym widzi jego treść, i po potwierdzeniu ląduje na tym samym dniu w stanie pustym. Kasowanie idzie przez istniejące `mutate()` — jeden strażnik `inFlight`, jedna koperta błędów, jedno `reconcile()` po porażce — a nie obok niego. Sukces wymaga jednak drugiego kształtu, bo `204` nie ma ciała, i skutkuje nawigacją, a nie czyszczeniem stanu: podtytuł dnia mieszka w nagłówku SSR poza zasięgiem wyspy (patrz Critical Implementation Details).

Dialog jest bezwarunkowy, inaczej niż przy regeneracji. Tam pytanie zadaje się tylko przy planie zaakceptowanym, bo regeneracja daje w zamian nową partię, a nauczyciel iterujący nad wersją roboczą nie zainwestował jeszcze w to, co widzi. Kasowanie nie daje w zamian nic i plan roboczy też kosztował 10–30 s oraz tokeny.

**Contract**:

- `type Busy` rozszerzony o `"deleting"`.
- `mutate()`: gałąź sukcesu poszerzona o przypadek bez ciała. Kształt zgodny z istniejącym precedensem rozgałęzienia po `busyKind` (linia 136): gdy `busyKind === "deleting"` i `response.ok`, sukcesem jest sam status, po czym `window.location.assign(\`/plan?date=${planDate}\`)`. Ścieżka porażki, `reconcile()` i `finally` bez zmian.
- `function deletePlan(): void` — wychodzi wcześnie gdy `!plan`; `window.confirm` z tekstem nazywającym stratę i jej nieodwracalność (hasło i propozycje znikają, dzień wraca do stanu bez planu, operacji nie można cofnąć); po potwierdzeniu `void mutate(() => fetch(\`/api/day-plan?date=${planDate}\`, { method: "DELETE" }), "deleting")`. Bez nagłówka `Content-Type` i bez ciała — trasa czyta query string.
- Przycisk renderowany pod warunkiem **`plan !== null`**, nie `hasActivities` (uzasadnienie w Critical Implementation Details). Umieszczony pod przyciskiem akceptacji, wizualnie odróżniony jako akcja destrukcyjna i wyraźnie słabszy niż „Akceptuj plan" — to nie jest akcja, w którą wzrok ma wpadać. Ikona `Trash2` z `lucide-react` (biblioteka już w zależnościach). `disabled={isBusy || draft !== null}`, tak jak przycisk akceptacji: kasowanie w trakcie otwartej edycji propozycji porzuciłoby niezapisany tekst bez słowa.
- Etykieta przycisku odzwierciedla stan: `busy === "deleting" ? "Usuwam…" : "Usuń plan dnia"`.
- `plan.astro` nietknięty — stan pusty, nagłówek bez podtytułu i komunikat „Ten dzień nie ma jeszcze planu" powstają z odczytu SSR po nawigacji.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Build produkcyjny przechodzi: `npm run build`
- Wyspa kasuje przez istniejącą trasę: `grep -n 'method: "DELETE"' src/components/plan/DayPlanEditor.tsx` zwraca trafienie
- Dialog jest bezwarunkowy — nie stoi za sprawdzeniem akceptacji: `grep -n -B3 'window.confirm' src/components/plan/DayPlanEditor.tsx` pokazuje dwa wystąpienia, z których tylko to w `generate()` jest poprzedzone `if (accepted)`
- Ekrany miesiąca i tygodnia nietknięte przez cały slice: `git diff --name-only master...HEAD` nie zawiera `src/components/plan/MonthGrid.astro`, `src/components/plan/WeekPlanBoard.tsx` ani `src/components/plan/WeekDayCard.tsx`
- Strona dnia nietknięta: `git diff --name-only master...HEAD` nie zawiera `src/pages/plan.astro`

#### Manual Verification:

- Dzień z planem roboczym: przycisk widoczny, dialog się pokazuje, anulowanie nie zmienia niczego
- Dzień z planem zaakceptowanym: ten sam dialog, ta sama treść — potwierdzenie nie jest zależne od stanu akceptacji
- Po potwierdzeniu nauczyciel ląduje na tym samym dniu: formularz hasła pusty, komunikat „Ten dzień nie ma jeszcze planu", **brak podtytułu w nagłówku**
- Dzień skasowany i dzień nigdy nieplanowany wyglądają identycznie — porównane obok siebie w dwóch zakładkach
- Dzień bez planu nie pokazuje przycisku kasowania w ogóle
- Przycisk jest niedostępny w trakcie generowania oraz przy otwartej edycji propozycji
- Kasowanie przy zerwanym połączeniu pokazuje komunikat o braku połączenia i **nie** nawiguje; plan zostaje na ekranie
- Skasowanie dnia, który w drugiej zakładce już został skasowany, kończy się komunikatem „Ten dzień nie ma planu do usunięcia." zamiast nawigacji
- Ścieżka „usuń i wygeneruj od nowa" działa w jednym miejscu: po skasowaniu formularz jest gotowy do wpisania nowego hasła
- Powrót do siatki miesiąca po skasowaniu pokazuje kafelek w stanie „brak planu"

**Implementation Note**: Po zakończeniu tej fazy i przejściu weryfikacji automatycznej zatrzymaj się i poczekaj na ręczne potwierdzenie od człowieka, zanim przejdziesz do fazy 4.

---

## Phase 4: Domknięcie roadmapy

### Overview

Roadmapa opisuje S-05 jako skreślenie miękkie. Po tym slice'ie opisuje kasowanie twarde.

### Changes Required:

#### 1. Pozycja S-05 w roadmapie

**File**: `context/foundation/roadmap.md`

**Intent**: Outcome, Unknowns i Risk pozycji S-05 opisują projekt, który nie został zbudowany. Zostawienie ich to dryf dokumentacji dokładnie tego rodzaju, przed którym ostrzega `lessons.md` — z tą różnicą, że tu nie chodzi o odroczone sprzątanie, tylko o zapis decyzji, która została odwrócona świadomie. Roadmapa ma po tym slice'ie mówić, co stoi w kodzie, i nieść powód odwrócenia, żeby następny czytelnik nie odtwarzał tej rozmowy od zera.

**Contract**: W bloku `### S-05: Usunięcie zapisanego planu dnia`:

- `- **Outcome:**` — „dane pozostają w bazie (skreślenie miękkie)" zastąpione stwierdzeniem, że wiersz `day_plans` i jego aktywności są usuwane trwale, a dzień wraca do stanu nieodróżnialnego od nigdy nieplanowanego.
- `- **Unknowns:**` — pytanie „czy usunięcie skreśla cały wiersz, czy tylko bieżącą partię" oznaczone jako rozstrzygnięte 2026-08-27 w `/10x-plan`: cały wiersz, twardo, z datą i powodem (brak wymogu retencji w PRD; produkt nie ma cofania nigdzie indziej; skreślenie miękkie zostawiłoby rezydentne dane bez czytelnika).
- `- **Risk:**` — oba ostrza opisane jako **uniknięte przez wybór kształtu**, nie jako zmitygowane. Zachować ich opis (są prawdziwe i będą prawdziwe dla każdej przyszłej kolumny), ale nazwać wprost, że twarde kasowanie ich nie tworzy, i dopisać, co zajęło ich miejsce jako faktyczne ryzyko: nieodwracalność pojedynczego kliknięcia, przed którą stoi wyłącznie dialog potwierdzenia.
- `- **Status:**` — `done` dopiero przy archiwizacji slice'u, nie w tej fazie. `/10x-plan` ustawił `planning`, `/10x-implement` ustawi `in-progress`.
- Wiersz `S-05` w tabeli `## At a glance` — kolumna **Status** zgodna z blokiem; kolumna Outcome („usunąć zapisany plan dnia z poziomu widoku tego dnia") pozostaje poprawna i nie wymaga zmiany.
- Wiersz `S-05` w tabeli `## Backlog Handoff` — tytuł „Usunięcie zapisanego planu dnia **(skreślenie miękkie)**" traci nawias. To trzecie i ostatnie miejsce, w którym roadmapa niesie odrzucony kształt; łatwo je przeoczyć, bo leży ~50 linii pod blokiem S-05.
- Frontmatter `updated:` na `2026-08-27`.

Sekcja `## Baseline` nie wymaga zmiany: opisuje 7 migracji i `save_day_plan_generation` jako jedynego pisarza partii aktywności, a slice nie zmienia ani jednego, ani drugiego. Nota Stream B w `## Streams` („`S-05` domyka tę samą pętlę od drugiej strony — cofnięcie zapisu") też zostaje — jest po tej decyzji prawdziwsza, nie mniej prawdziwa.

### Success Criteria:

#### Automated Verification:

- Roadmapa nie opisuje już skreślenia miękkiego w S-05: `awk '/^### S-05/,/^### S-06/' context/foundation/roadmap.md | grep -i 'miękk'` zwraca wyłącznie zdania nazywające je odrzuconą alternatywą, nigdy stanem docelowym
- Tabela `Backlog Handoff` też nie: `grep -n 'delete-day-plan.*skreślenie miękkie' context/foundation/roadmap.md` zwraca pusto
- Niewiadoma jest oznaczona jako rozstrzygnięta: `awk '/^### S-05/,/^### S-06/' context/foundation/roadmap.md | grep -c 'rozstrzygnięt'` zwraca co najmniej 1
- Frontmatter zaktualizowany: `grep -n '^updated: 2026-08-27' context/foundation/roadmap.md` zwraca trafienie
- Poza S-05 i frontmatterem roadmapa nietknięta: `git diff master...HEAD -- context/foundation/roadmap.md` nie pokazuje zmian w blokach `### F-01` … `### S-04` ani `### S-06` … `### S-08`
- Lint i build nadal przechodzą: `npm run lint && npm run build`

#### Manual Verification:

- Czytelnik, który nie brał udziału w tej sesji, po przeczytaniu samego bloku S-05 wie, co zostało zbudowane i dlaczego odrzucono skreślenie miękkie
- Tabela `At a glance` i blok S-05 nie mówią o sobie dwóch różnych rzeczy
- Ryzyko nieodwracalności jest w roadmapie nazwane, a nie tylko w tym planie

**Implementation Note**: Po zakończeniu tej fazy i przejściu weryfikacji automatycznej zatrzymaj się i poczekaj na ręczne potwierdzenie od człowieka.

---

## Testing Strategy

Projekt nie ma runnera testów JS. Bramka automatyczna to `npm run lint`, `npx astro check`, `npm run build` oraz pgTAP przez `npm run test:db`.

### Testy bazodanowe (pgTAP):

Nowy plik `supabase/tests/database/day_plan_delete.test.sql`, sześć asercji, wszystkie sprawdzone mutacją zgodnie z metodą, którą obie istniejące suity deklarują w nagłówku:

- `authenticated` ma przywilej DELETE na `day_plans` (strukturalna — jedynym dowodem jest katalog)
- kasowanie własnego dnia dotyka dokładnie jednego wiersza
- kaskada zabiera aktywności tego dnia
- kaskada **nie** zabiera aktywności innego dnia tego samego nauczyciela
- `save_day_plan_generation(…, p_require_absent => true)` przechodzi na skasowaną datę i startuje od `current_generation = 1`
- kasowanie dnia nieistniejącego lub cudzego dotyka zera wierszy i nie podnosi wyjątku

Izolacja kasowania między kontami nie jest tu powtarzana — pokrywają ją `day_plans_delete` i `day_plans_self_delete` w `rls_isolation.test.sql`.

### Weryfikacja statyczna:

`npm run lint`, `npx astro check`, `npm run build` po każdej fazie, plus punktowe `grep` z Success Criteria. Kryteria „czegoś nie ma" używają zakresu `master...HEAD`, nie gołego `git diff` — reguła z `lessons.md`: kryterium bez zakresu przechodzi bezwarunkowo po commicie fazy.

### Testowanie ręczne — scenariusze:

1. Wygeneruj plan dnia, skasuj go, porównaj ekran z dniem nigdy nieplanowanym otwartym obok — mają być nieodróżnialne, łącznie z brakiem podtytułu w nagłówku.
2. Wygeneruj tydzień z jednego hasła, skasuj środę, wygeneruj ten sam tydzień ponownie — środa ma zostać wygenerowana, nie oznaczona jako „pominięty".
3. Zaakceptuj plan dnia, skasuj — dialog ma się pokazać z tą samą treścią co dla planu roboczego.
4. Otwórz ten sam dzień w dwóch zakładkach, skasuj w pierwszej, spróbuj skasować w drugiej — komunikat „Ten dzień nie ma planu do usunięcia.", bez nawigacji.
5. Rozpocznij edycję propozycji, sprawdź, że przycisk kasowania jest niedostępny.
6. Odetnij sieć (DevTools offline), kliknij kasowanie — komunikat o braku połączenia, plan zostaje na ekranie.
7. Skasuj dzień, wróć do siatki miesiąca — kafelek w stanie „brak planu"; wejdź w tydzień — dzień wolny.
8. Skasuj dzień i od razu wygeneruj nowy plan z tym samym hasłem — nowy plan startuje od `current_generation = 1` (widoczne po skutkach: akceptacja działa bez odświeżania strony).

## Performance Considerations

Bez wpływu. Kasowanie to jeden `DELETE` po `plan_date` pod RLS, wsparty `unique (user_id, plan_date)`; kaskada usuwa co najwyżej 20 wierszy `activities` (górna granica z `activities_ordinal_bounds`), znajdowanych po `activities_plan_id_generation_ordinal_key`. Żadne zapytanie odczytowe nie zmienia kształtu. Wyspa nie zyskuje nowego stanu ani nowego efektu — jedno wywołanie `fetch` i nawigacja.

## Migration Notes

Brak migracji. Polityka DELETE, przywilej `authenticated` i `on delete cascade` istnieją od `20260718211452_day_plans_and_activities.sql`.

Rollback slice'u to cofnięcie zmian w czterech plikach źródłowych i usunięcie nowego pliku testowego — w bazie nie zostaje nic. Dane skasowane w międzyczasie nie wracają; to jest własność wybranego kształtu, nie luka w rollbacku.

**Gałąź.** Repo stoi na `master`. Przed pierwszym commitem tego slice'u utwórz gałąź funkcyjną — reguła z CLAUDE.md, obowiązująca od S-03 bezwarunkowo.

## References

- Pozycja w roadmapie: `S-05` w `context/foundation/roadmap.md`
- Kontrakt kasowania w schemacie: `supabase/migrations/20260718211452_day_plans_and_activities.sql`
- Przywileje `authenticated`: `supabase/migrations/20260720162553_narrow_authenticated_update_columns.sql`
- `p_require_absent` i `coalesce(v_exists, false)`: `supabase/migrations/20260823232953_day_theme_and_absent_guard.sql`
- Wzorzec dla `deleteDayPlan`: `updateActivityText` w `src/lib/services/day-plan-store.ts`
- Wzorce suit pgTAP: `supabase/tests/database/rls_isolation.test.sql`, `supabase/tests/database/day_plan_write.test.sql`
- Decyzja o podtytule w SSR, którą ten slice respektuje: `context/archive/2026-08-27-visible-day-theme/plan.md`
- Poprzedni slice na tej samej wyspie: `context/archive/2026-08-23-edit-accept-day-plan/plan.md`

## Progress

> Konwencja: `- [ ]` do zrobienia, `- [x]` zrobione. Dopisz ` — <commit sha>`, kiedy krok wyląduje. Nie zmieniaj nazw kroków.

### Phase 1: Kasowanie w warstwie danych

#### Automated

- [x] 1.1 Lint przechodzi: `npm run lint`
- [x] 1.2 Typy przechodzą: `npx astro check`
- [x] 1.3 Build produkcyjny przechodzi: `npm run build`
- [x] 1.4 Cała suita bazodanowa przechodzi: `npm run test:db`
- [x] 1.5 Nowa suita `day_plan_delete` ma sześć asercji i żadnego `not ok`
- [x] 1.6 Slice nie dokłada migracji (`git diff --name-only master...HEAD -- supabase/migrations/` pusto)
- [x] 1.7 Ścieżki odczytu nietknięte (`git diff master...HEAD` na `day-plan-store.ts` bez zmian w `readDayPlan`/`readWeekPlans`/`readMonthSummary`)

#### Manual

- [ ] 1.8 Każda z sześciu asercji sprawdzona mutacją i zaobserwowana na czerwono (mutacje cofnięte przed commitem)
- [ ] 1.9 Asercja kaskady „tylko ten dzień" idzie na czerwono przy kaskadzie rozszerzonej na wszystkie plany nauczyciela

### Phase 2: Trasa DELETE

#### Automated

- [ ] 2.1 Lint przechodzi: `npm run lint`
- [ ] 2.2 Typy i szablony Astro przechodzą: `npx astro check`
- [ ] 2.3 Build produkcyjny przechodzi: `npm run build`
- [ ] 2.4 Trasa eksportuje `DELETE` (`grep` na `src/pages/api/day-plan/index.ts`)
- [ ] 2.5 Nie powstał nowy plik trasy (`git diff --name-only master...HEAD -- src/pages/api/`)
- [ ] 2.6 Wyspa jeszcze nietknięta w tej fazie (`git diff --name-only master...HEAD` bez `DayPlanEditor.tsx`)

#### Manual

- [ ] 2.7 `DELETE` na dzień z planem zwraca `204`, a `GET` zaraz potem `404`
- [ ] 2.8 Powtórzony `DELETE` zwraca `404` z komunikatem „Ten dzień nie ma planu do usunięcia."
- [ ] 2.9 `DELETE` bez sesji zwraca `401` jako JSON, nie przekierowanie
- [ ] 2.10 `DELETE` ze złą datą zwraca `400`
- [ ] 2.11 Siatka miesiąca i tablica tygodnia pokazują skasowany dzień jako wolny bez zmian w ich kodzie
- [ ] 2.12 Generowanie tygodnia obejmuje skasowany dzień zamiast go pominąć

### Phase 3: Przycisk w widoku dnia

#### Automated

- [ ] 3.1 Lint przechodzi: `npm run lint`
- [ ] 3.2 Typy przechodzą: `npx astro check`
- [ ] 3.3 Build produkcyjny przechodzi: `npm run build`
- [ ] 3.4 Wyspa kasuje przez trasę `DELETE` (`grep` na `DayPlanEditor.tsx`)
- [ ] 3.5 Dialog kasowania jest bezwarunkowy — tylko `window.confirm` w `generate()` stoi za `if (accepted)`
- [ ] 3.6 Ekrany miesiąca i tygodnia nietknięte przez cały slice (`git diff --name-only master...HEAD`)
- [ ] 3.7 `src/pages/plan.astro` nietknięty (`git diff --name-only master...HEAD`)

#### Manual

- [ ] 3.8 Plan roboczy: przycisk widoczny, dialog się pokazuje, anulowanie nic nie zmienia
- [ ] 3.9 Plan zaakceptowany: ten sam dialog i ta sama treść
- [ ] 3.10 Po skasowaniu nauczyciel jest na tym samym dniu, pustym, bez podtytułu w nagłówku
- [ ] 3.11 Dzień skasowany i dzień nigdy nieplanowany są nieodróżnialne (porównane obok siebie)
- [ ] 3.12 Dzień bez planu nie pokazuje przycisku kasowania
- [ ] 3.13 Przycisk niedostępny w trakcie generowania i przy otwartej edycji propozycji
- [ ] 3.14 Kasowanie offline pokazuje błąd i **nie** nawiguje; plan zostaje na ekranie
- [ ] 3.15 Kasowanie dnia skasowanego już w drugiej zakładce kończy się komunikatem, nie nawigacją
- [ ] 3.16 Ścieżka „usuń i wygeneruj od nowa" działa bez opuszczania strony dnia
- [ ] 3.17 Powrót do siatki miesiąca pokazuje kafelek w stanie „brak planu"

### Phase 4: Domknięcie roadmapy

#### Automated

- [ ] 4.1 S-05 nie opisuje już skreślenia miękkiego jako stanu docelowego (`awk` + `grep` na bloku S-05)
- [ ] 4.2 Tabela `Backlog Handoff` bez „(skreślenie miękkie)" (`grep`)
- [ ] 4.3 Niewiadoma S-05 oznaczona jako rozstrzygnięta (`awk` + `grep -c 'rozstrzygnięt'`)
- [ ] 4.4 Frontmatter `updated: 2026-08-27` (`grep`)
- [ ] 4.5 Poza S-05 i frontmatterem roadmapa nietknięta (`git diff master...HEAD -- context/foundation/roadmap.md`)
- [ ] 4.6 Lint i build nadal przechodzą: `npm run lint && npm run build`

#### Manual

- [ ] 4.7 Blok S-05 czytany samodzielnie tłumaczy, co zbudowano i dlaczego odrzucono skreślenie miękkie
- [ ] 4.8 Tabela `At a glance` i blok S-05 są zgodne
- [ ] 4.9 Ryzyko nieodwracalności jest nazwane w roadmapie
