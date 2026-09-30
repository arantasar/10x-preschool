# Ochrona zapisu i własności (Faza 3 rolloutu) — Implementation Plan

## Overview

Faza 3 z `context/foundation/test-plan.md` przypina testami trzy ryzyka: zniszczenie dnia zatwierdzonego (#3), dostęp do cudzego zasobu (#4) i zakres kasowania (#7). Domyka też dług `U0003`. Kod produkcyjny zachowuje się już poprawnie, więc ta faza niczego nie naprawia, tylko sprawia, że regresja przestaje być cicha. Przy okazji powstaje wzorzec §6.3: **trasa wołana jako funkcja z prawdziwym klientem `supabase-js` zalogowanym jako konto A albo B**. Warstwa bazy (pgTAP i ta nowa warstwa) trafia do CI jako osobny, doradczy job.

## Current State Analysis

Pełny obraz jest w `research.md`. Tu tylko to, co wyznacza kształt planu:

- **Własność = RLS + `security invoker` + klient z sesji.** Żadna trasa ani funkcja magazynu nie filtruje po `user_id` (`src/lib/services/day-plan-store.ts:25-31`). Test na atrapie nie może więc dowieść własności, bo atrapa zwraca to, co jej kazano.
- **Niewidoczne = `not_found` 404, jawnie**: `setAcceptance` (`day-plan-store.ts:490-531`), `updateActivityText` (`:432-452`), `deleteDayPlan` (`:557-573`). Intencja #4 „jawna odmowa, nie cichy pusty wynik” jest już w kodzie. Faza ją przypina.
- **Jawna odmowa ma sens tylko dla tras adresowanych id** (`accept` — `plan_id`, `activity/[id]`). Trasy adresowane datą (`GET`/`DELETE /api/day-plan`, `generate`, `week/save`) nie potrafią nazwać cudzego wiersza. Dla nich własność brzmi: „operacja B na dacie D nie dotyka wiersza A na D”.
- **Braki testów tras**:
  - `accept.ts` i `index.ts` (GET/DELETE) nie mają pliku testu;
  - `generate.test.ts` nie ma przypadku z dniem zatwierdzonym, więc 409 przed płatnym wywołaniem modelu (`generate.ts:88-108`) jest bez dowodu;
  - `activity/[id].test.ts` ma jeden przypadek niewidoczności, na jednym koncie.
- **Atrapa** `src/lib/services/__fixtures__/supabase.ts` nie ma `from("day_plans").update()` ani `.delete()`.
- **pgTAP**: 4 pliki, 98 asercji (`plan(6)`, `plan(50)`, `plan(23)`, `plan(19)`), zero `U0003`. `week_plan_write.test.sql` ma jedno konto.
- **CI** (`.github/workflows/ci.yml`): job `ci` bez Supabase i doradczy `content-safety-gate`. CLI `supabase` 2.98.2 jest devDependency. `supabase status -o env` wystawia `API_URL`, `PUBLISHABLE_KEY` i `SECRET_KEY`. `supabase start -x` przyjmuje nazwy kontenerów: `gotrue, realtime, storage-api, imgproxy, kong, mailpit, postgrest, postgres-meta, studio, edge-runtime, logflare, vector, supavisor`.
- **Semantyka #3 po S-10**:
  - zgoda tygodnia = `{plan_date, accepted_at}`;
  - zgoda dnia = boolean `confirm_replace`.

  Tę asymetrię S-10 zostawił świadomie i ta faza jej **nie przypina**.

## Desired End State

- `npm run test:db` (pgTAP) asertuje:
  - wszystkie cztery gałęzie `U0003` z kolejnością przed `U0002` i `U0001`;
  - „zatwierdzony sąsiad przeżywa” dla dnia i tygodnia;
  - „drugie konto zapisuje tydzień na datach A — A nietknięte”;
  - DELETE po dacie, gdy A i B mają ten sam dzień.
- `npm test` (atrapa) asertuje:
  - `generate`: 409 przed modelem i bez zapisu, zgoda → zapis, wyścig `U0001` → 409 bez ponowienia;
  - `GET`/`DELETE /api/day-plan` i `POST /api/day-plan/accept`: statusy, envelope, liczba wywołań.
- `npm run test:db:api` (nowa warstwa, prawdziwy lokalny stos, dwa konta) asertuje:
  - cudzy `plan_id` i cudze `activity id` dają 404 `retryable: false`, a wiersz A jest nietknięty (sprawdzone **jako A**);
  - B na dacie A widzi i kasuje wyłącznie swoje;
  - `week/save` B na datach A nie rusza A;
  - każda asercja negatywna ma kontrolę pozytywną właściciela.
- Job `db` w CI uruchamia obie warstwy bazy na PR i pushu do `master`.
- `test-plan.md`: §6.3 opisuje wzorzec, §2/§3/§4/§5/§6.4/§6.7/§8 odpowiadają stanowi po fazie, status Fazy 3 = `complete`.
- `next-actions.md`: Krok 6 zamknięty, a asymetria zgody jest pozycją z właścicielem.

### Key Discoveries:

- `src/lib/services/day-plan-store.ts:35` — `DayPlanClient = SupabaseClient<Database>`. Klient z `createClient<Database>(url, publishableKey)` pasuje wprost do `locals.supabase`, bez rzutowania.
- `src/pages/api/day-plan/week/save.ts:1-5` — nie woła modelu, więc niesie „zapis dwóch kont” na prawdziwym kliencie. `generate` zostaje na atrapie, bo jego test podmienia `globalThis.fetch`, a to ta sama granica, przez którą rozmawia `supabase-js`.
- `tests/e2e/support/supabase-admin.ts:5-15` — reguła „klucz serwisowy wyłącznie do zasiewu i sprzątania, nigdy do asercji” przenosi się 1:1.
- `tests/e2e/support/test-data.ts` — `uniquePlanDate()`/`plusDays()`: unikalność w dacie, konta stałe.
- `vitest.gate.config.ts` — wzorzec osobnego pliku konfiguracyjnego wołającego `getViteConfig` po swojemu. `test.projects` inline nie dziedziczy pluginów Astro (§6.5).
- `supabase/tests/database/week_plan_write.test.sql:55-100` — fixture z parami {draft, accepted} na osobnych datach i stałym `accepted_at`. Nowe przypadki dostają własne daty.
- `supabase/tests/database/rls_isolation.test.sql` — A i B mają już wiersz na 2026-03-02; asercja DELETE po dacie mieści się w tym pliku.

## What We're NOT Doing

- Zmiany produkcyjne. Wyjątkiem byłaby regresja znaleziona przez nowy test, ale taka poprawka idzie osobnym commitem z nazwą błędu i nie jest celem fazy.
- Wyrównanie zgody dnia do zgody tygodnia (`accepted_at`). Ta faza wpisuje je tylko do `next-actions.md` jako pozycję z właścicielem.
- Test przypinający asymetrię zgody dnia jako zamierzoną.
- `generate` na prawdziwym kliencie (patrz Key Discoveries).
- Trwały test `.maybeSingle()` przy zepsutym RLS. Rozstrzyga się jednorazowo w rytuale mutacji Fazy 3, a wynik trafia do §6.7.
- Nowe testy e2e i jakiekolwiek zmiany w `tests/e2e/`.
- Blokujące bramki (ochrona gałęzi niedostępna, §5).
- `refine`, `week/day`, `week/outline`, `month`: nie adresują cudzego zasobu albo nie dotykają bazy.

## Implementation Approach

Każde twierdzenie ląduje w najtańszej warstwie, która je **naprawdę** dowodzi (§1 „koszt × sygnał”):

| Twierdzenie | Warstwa |
|---|---|
| niezmiennik egzekwowany przez bazę (`U0003`, zakres writera, zakres DELETE) | pgTAP |
| zachowanie trasy niezależne od własności (409 przed modelem, brak ponowienia, 400/401 bez bazy, mapowanie błędów) | atrapa w `npm test` |
| własność na trasie (RLS + tłumaczenie na HTTP naraz) | trasa jako funkcja + prawdziwy klient A/B |

Fazy idą od dołu w górę: najpierw baza, potem atrapa, potem nowa warstwa, CI i na końcu dokumentacja opisująca to, co faktycznie powstało.

**Rytuał mutacji jest częścią każdej fazy, nie dodatkiem.** Każda nowa asercja (albo spójna grupa) zostaje zobaczona na czerwono przez psucie, które nazywa ryzyko. Psucie zostaje cofnięte przed commitem. Dowód żyje w pliku testu: jak w istniejących plikach pgTAP, nagłówek „checked by mutation”, a przy asercji albo grupie komentarz z nazwą psucia. Każda faza ma w Progress wiersz Manual, który to potwierdza.

## Critical Implementation Details

- **Warstwa z prawdziwym klientem nie może się „cicho pominąć”.** Gdy brak stosu albo zmiennych, przebieg ma paść głośno na starcie, a nie oznaczyć testy jako `skip`. Pominięty test w CI to zielony znaczek bez sprawdzenia czegokolwiek, dokładnie to, przed czym ostrzega lessons.md.
- **Ochrona przed celowaniem w produkcję.** Konfiguracja albo helper odmawia startu, gdy `API_URL` nie wskazuje `127.0.0.1`/`localhost`. Test zakłada konta i kasuje dni.
- **Asercja „A nietknięte” czyta jako A**, zalogowanym klientem A, nigdy kluczem serwisowym. Przez klucz serwisowy wolno wyłącznie zakładać konta, zasiewać i sprzątać (po `id`, nie po dacie, bo sprzątanie po dacie skasowałoby wiersz drugiego konta).
- **Zasiew dnia zatwierdzonego**: `created_at` i `accepted_at` z jednego odczytu, bo inaczej `day_plans_accepted_after_created` wywraca zasiew (§6.7 pkt 4).
- **Kolejność zmiennych w CI**: `supabase status -o env` trzeba wypisać do `$GITHUB_ENV` **po** `supabase start`, a przed `test:db:api`.

## Phase 1: pgTAP — dług `U0003` i luki #3/#7

### Overview

Baza dostaje asercje na wszystko, co egzekwuje sama i czego dziś nikt nie sprawdza. Zero zmian w migracjach.

### Changes Required:

#### 1. Writer dnia — `U0003` i sąsiad

**File**: `supabase/tests/database/day_plan_write.test.sql`

**Intent**: Przypiąć odmowę pustej partii i jej kolejność wobec innych odmów oraz dowieść, że regeneracja ze zgodą nie dotyka zatwierdzonego sąsiada.

**Contract**:
- `throws_ok(…, 'U0003')` dla `p_activities` = `'[]'::jsonb`, `null` i nie-tablicy, **jako `authenticated`** (dzisiejsze jedyne `'[]'` idzie jako `anon` i kończy się na grancie, :635-641);
- po odmowie na dniu już zaplanowanym: `current_generation` bez zmian i stara partia nietknięta;
- pusta partia z `p_require_absent => true` na dniu zaplanowanym → `U0003`, nie `U0002`;
- pusta partia bez zgody na dniu zatwierdzonym → `U0003`, nie `U0001`;
- regeneracja dnia X ze zgodą → zatwierdzony dzień X+1 tego samego konta nietknięty (hasło, licznik, `accepted_at`, tytuły partii);
- `plan(N)` podbity o faktyczną liczbę nowych asercji.

#### 2. Writer tygodnia — `U0003`, sąsiad poza zestawem, drugie konto

**File**: `supabase/tests/database/week_plan_write.test.sql`

**Intent**: Przypiąć trzy gałęzie `U0003` writera tygodnia z wycofaniem całej transakcji, dowieść ścieżki „Tylko do przejrzenia” (dzień zatwierdzony spoza `p_days` przeżywa) i dołożyć drugie konto.

**Contract**:
- `U0003` dla `p_days` = `'[]'`, `null` i nie-tablicy; dla `plan_date` brakującego albo nie `YYYY-MM-DD`; dla pustej partii dnia;
- pusta partia dnia **po** dniu zapisanym wcześniej w tej samej tablicy → wcześniejszy dzień wycofany (ta sama własność, którą :134-167 dowodzi dla `U0001`);
- zestaw z samym draftem tygodnia, w którym jest dzień zatwierdzony → dzień zatwierdzony nietknięty (hasło, licznik, `accepted_at`, partia);
- fixture dostaje konto B (nowe daty, własne dni zatwierdzone konta A):
  - B zapisuje tydzień na tych datach bez zgody → sukces dla B;
  - wiersze A nietknięte, a asercja czyta je po przełączeniu `request.jwt.claims` z powrotem na A;
- `plan(19)` podbity o faktyczną liczbę.

#### 3. DELETE po dacie na dwóch kontach tej samej daty

**File**: `supabase/tests/database/rls_isolation.test.sql`

**Intent**: Dowieść kształtu zapytania aplikacji (`delete … where plan_date = D`), gdy A i B mają dzień D. Dziś `day_plan_delete` ma B na innej dacie, a `rls_isolation` filtruje po `user_id`.

**Contract**:
- jako A: `delete from public.day_plans where plan_date = '2026-03-02' returning 1` → dokładnie 1 wiersz;
- jako B: plan i propozycje B na tę datę nietknięte;
- asercje stoją **po** istniejących, żeby nie naruszyć ich fixture'ów, albo w obrębie transakcji z własnym zasiewem;
- `plan(23)` podbity.

#### 4. Nagłówki mutacji

**File**: wszystkie trzy pliki powyżej

**Intent**: Każda nowa asercja albo grupa ma komentarz z psuciem, które ją zapaliło na czerwono.

**Contract**: minimalny zestaw psuć:
- usunięty blok `U0003` w writerze dnia;
- blok `U0003` przeniesiony poniżej `for update` / `U0002`;
- usunięte `U0003` w writerze tygodnia, w każdej z trzech gałęzi osobno;
- pętla tygodnia rozszerzona na dni spoza `p_days` (np. `update … accepted_at = null where user_id = auth.uid() and plan_date between …`);
- `where plan_date = D` w asercji DELETE bez RLS (`set local role postgres`), które musi dać 2 wiersze.

Psucie migracji robi się lokalnie przez `CREATE OR REPLACE` w `psql` albo edycję migracji z `supabase db reset` i zawsze się je cofa.

### Success Criteria:

#### Automated Verification:

- `npm run test:db` zielony; łączna liczba asercji > 98, a każdy plik raportuje `plan(N)` zgodny z faktycznym
- `grep -c "'U0003'" supabase/tests/database/day_plan_write.test.sql` ≥ 3 i `grep -c "'U0003'" supabase/tests/database/week_plan_write.test.sql` ≥ 5 (literał kodu w wywołaniu `throws_ok`, nie w komentarzu — komentarze piszą „U0003” bez apostrofów)
- `git diff --name-only master..HEAD -- supabase/migrations` pusty (faza nie zmienia migracji)

#### Manual Verification:

- Każde psucie z listy zapaliło co najmniej jedną nową asercję; psucie cofnięte, `supabase db reset` + `npm run test:db` znów zielone
- Komentarze mutacji są w plikach przy odpowiednich asercjach

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Trasy na atrapie — zachowanie bez własności (`npm test`)

### Overview

Atrapa dostaje dwie metody i ani jednej więcej. Trasy `generate`, `index` (GET/DELETE) i `accept` dostają testy wszystkiego, co nie zależy od RLS: statusów, envelope, kolejności walidacja → baza → model, liczby wywołań i braku ponowienia.

### Changes Required:

#### 1. Atrapa PostgREST

**File**: `src/lib/services/__fixtures__/supabase.ts`

**Intent**: Obsłużyć `setAcceptance` i `deleteDayPlan` dokładnie tak głęboko, jak te funkcje wołają builder, i nic ponad to (§6.2).

**Contract**:
- `from("day_plans").update(values).eq().eq().select().maybeSingle()` (setAcceptance);
- `from("day_plans").delete().eq(column, value).select().maybeSingle()` (deleteDayPlan);
- szpiedzy `dayPlansUpdate` i `delete` w zwracanym `SupabaseStub`, a `delete` rejestruje argumenty `eq`;
- nowe opcje: wynik `update` (wiersz / `null` / błąd), odczyt po pustym update (`existing` / `null`), wynik `delete` (wiersz / `null` / błąd);
- docblock u góry pliku uzupełniony o nowe łańcuchy;
- istniejące testy przechodzą bez zmian.

#### 2. `generate` — dzień zatwierdzony

**File**: `src/pages/api/day-plan/generate.test.ts`

**Intent**: Przypiąć wstępną odmowę, która chroni koszt modelu, oraz odmowę writera w wyścigu.

**Contract**: nowy `describe` z trzema przypadkami na tym samym dniu (`existingPlan` z `accepted_at`):
- `confirm_replace: false` → 409, `fetch` nie wołany, `rpc` nie wołany;
- `confirm_replace: true` → `rpc` wołany raz z `p_confirm_replace: true`. To kontrola pozytywna, bez której pierwszy przypadek przechodzi przy trasie odmawiającej zawsze;
- pre-check przepuszcza (`existingPlan` bez `accepted_at`), `rpc` odpowiada `U0001` → 409, `retryable: false`, `rpc` wołany **dokładnie raz**.

Żaden przypadek nie asertuje, że zgoda dnia nie jest związana z `accepted_at`.

#### 3. `GET`/`DELETE /api/day-plan`

**File**: `src/pages/api/day-plan/index.test.ts` (nowy)

**Intent**: Pierwszy test tej trasy. Obejmuje zachowania bramek i mapowania, bez twierdzeń o własności.

**Contract**:
- oba: brak `user` → 401 i `from` nie wołany; brak klienta → 500 `unconfigured`; zła albo brakująca data → 400 i `from` nie wołany;
- GET: dzień jest → 200 z planem; dnia nie ma → 404 „Ten dzień nie ma jeszcze planu.”, `retryable: false`;
- DELETE: sukces → 204 bez body, a `delete` przyjął `eq("plan_date", <data z zapytania>)`; pusty wynik → 404 „Ten dzień nie ma planu do usunięcia.”, `retryable: false`; błąd przejściowy → 503 i `delete` wołany **dokładnie raz** (brak ponowienia); nigdy 204 przy błędzie.

#### 4. `POST /api/day-plan/accept`

**File**: `src/pages/api/day-plan/accept.test.ts` (nowy)

**Intent**: Pierwszy test tej trasy. Rozdziela trzy wyniki pustego update, które dla nauczyciela znaczą co innego.

**Contract**:
- 401/500/400 jak wyżej (400 dla złego JSON-a i dla body spoza `acceptPlanRequestSchema`);
- update trafił → 200 z planem odczytanym z bazy, a `dayPlansUpdate` dostał `accepted_at` ≠ null przy `accepted: true` i `null` przy `false`;
- update pusty, odczyt widzi wiersz → 409 `conflict`;
- update pusty, odczyt nic nie widzi → 404 „Nie znaleziono tego planu dnia.”, `retryable: false`, update wołany dokładnie raz.

### Success Criteria:

#### Automated Verification:

- `npm test` zielony, w tym nowe pliki `index.test.ts` i `accept.test.ts`
- `npm run lint` zielony
- `npx astro sync && npx tsc --noEmit` bez błędów (jeśli `lint` już obejmuje typy — wystarczy `lint`)

#### Manual Verification:

- Psucia zobaczone na czerwono i cofnięte, każde odnotowane komentarzem w teście:
  - usunięty pre-check w `generate.ts:101-105` zapala przypadek 409-przed-modelem;
  - pre-check zawsze odmawiający zapala kontrolę pozytywną;
  - dodane ponowienie w `deleteDayPlan` zapala „dokładnie raz”;
  - `not_found` → `conflict` w `setAcceptance` zapala 404.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Trasa + prawdziwy klient A/B — wzorzec §6.3 (`npm run test:db:api`)

### Overview

Nowa warstwa: trasy wołane jako funkcje (jak w §6.2), ale z `locals.supabase` = prawdziwy `supabase-js` zalogowany jako konto A albo B na lokalnym stosie. Dowodzi trasy i RLS naraz, bez HTTP, middleware i przeglądarki.

### Changes Required:

#### 1. Konfiguracja warstwy

**Files**: `vitest.db.config.ts` (nowy), `vitest.config.ts`, `package.json`

**Intent**: Osobny zestaw poza `npm test`, bo wymaga Dockera i kluczy. Ten sam wzorzec co `vitest.gate.config.ts`.

**Contract**:
- `vitest.db.config.ts` woła `getViteConfig(…, { configFile: "./astro.config.test.mjs" })`;
- `include: ["src/**/*.db.test.ts"]`, `environment: "node"`, `fileParallelism: false` (wspólne konta);
- `vitest.config.ts`: `exclude` dostaje `"src/**/*.db.test.ts"` obok `*.gate.test.ts`;
- `package.json`: skrypt `"test:db:api": "vitest run --config vitest.db.config.ts"`.

#### 2. Wsparcie: konta, zasiew, sprzątanie

**File**: `src/lib/services/__fixtures__/supabase-local.ts` (nowy)

**Intent**: Jedno miejsce, które zna lokalny stos. Zakłada dwa stałe konta, loguje je publishable key i zasiewa oraz sprząta kluczem serwisowym.

**Contract**:
- zmienne `API_URL`, `PUBLISHABLE_KEY`, `SECRET_KEY`, nazwane dokładnie jak w `supabase status -o env`. Gdy brak w środowisku, helper uzupełnia je jednym wywołaniem `npx supabase status -o env`. Gdy i to zawiedzie, **rzuca** z komunikatem „uruchom `npx supabase start`”; nie pomija testów;
- odmawia pracy, gdy `API_URL` nie jest `localhost`/`127.0.0.1`;
- eksporty (nazwy do ustalenia w implementacji, kształt stały):
  - `teacherClient("a" | "b") → Promise<{ client: DayPlanClient; userId: string }>` — konto zakładane idempotentnie (`email_confirm: true`), klient zalogowany `signInWithPassword`, `persistSession: false`;
  - `seedDay(userId, date, { accepted?, activities })` → `{ planId, activityIds }`, klucz serwisowy, `created_at`/`accepted_at` z jednego odczytu;
  - `cleanup(planIds)` — kasuje po `id`;
  - `uniquePlanDate()`/`plusDays()` — przeniesione z `tests/e2e/support/test-data.ts` albo z niego zaimportowane, bez duplikowania logiki;
- docblock powtarza regułę z `supabase-admin.ts:5-15`: klucz serwisowy nigdy do asercji;
- konta mają własne adresy (`api-teacher-a@example.test`, `api-teacher-b@example.test`), odrębne od e2e.

#### 3. Testy własności

**Files**: `src/pages/api/day-plan/accept.db.test.ts`, `src/pages/api/day-plan/activity/[id].db.test.ts`, `src/pages/api/day-plan/index.db.test.ts`, `src/pages/api/day-plan/week/save.db.test.ts` (nowe)

**Intent**: Każdy przypadek ma dwa konta i kontrolę pozytywną właściciela. „A nietknięte” jest czytane klientem A.

**Contract**:
- **accept**: B wysyła `plan_id` A (poprawny `expected_generation`) → 404 „Nie znaleziono tego planu dnia.”, `retryable: false`; A czyta swój plan: `accepted_at` bez zmian. Kontrola: A zatwierdza własny → 200 i `accepted_at` ustawione.
- **activity/[id]**: B wysyła id propozycji A → 404, `retryable: false`; A czyta: tytuł, opis i `accepted_at` bez zmian. Kontrola: A edytuje własną → 200.
- **GET po dacie**: A ma dzień D, B nie → B dostaje 404 i nic z danych A w body. Kontrola: A dostaje 200 ze swoim hasłem. Wariant: A i B mają D → B dostaje **swoje** hasło.
- **DELETE po dacie**:
  - A i B mają D, A ma też D+1 → DELETE A na D daje 204; A nie widzi D, widzi D+1; B (klientem B) widzi swoje D z propozycjami;
  - B kasuje D, na którym tylko A ma plan → 404, `retryable: false`; A widzi D.
- **week/save**: A ma zatwierdzony D; B zapisuje tydzień zawierający D bez zgody → 200 dla B; A czyta D: hasło, licznik, `accepted_at` i partia bez zmian; B czyta D: swoje hasło.
- `afterEach` sprząta po `id` wszystko, co zasiał albo co trasa utworzyła (id z odpowiedzi).

#### 4. Rytuał mutacji i rozstrzygnięcie `.maybeSingle()`

**Intent**: Zobaczyć każdy test własności na czerwono przez zepsucie RLS i przy okazji ustalić, co prawdziwy PostgREST robi z `DELETE … .maybeSingle()` trafiającym w dwa wiersze.

**Contract**: psucia lokalne przez `psql` i zawsze cofane (`supabase db reset`):
- polityka select `day_plans` otwarta dla wszystkich (`using (true)`) zapala GET i accept;
- polityka delete + select `day_plans` otwarta → w teście DELETE zapisać **faktyczny** wynik: 204 i dwa wiersze znikają / błąd PGRST116 i wycofanie / inny. Wynik trafia do komentarza przy teście i do §6.7 w Fazie 5;
- polityka update `activities` otwarta zapala `activity/[id]`;
- `security invoker` → `definer` na writerze tygodnia (albo pętla ignorująca `auth.uid()`) zapala `week/save`.

Jeśli okaże się, że dwa wiersze znikają bez błędu, Faza 5 dopisuje do `next-actions.md` pozycję „obrona w głąb dla DELETE” z właścicielem. **Nie** naprawiamy tego w tej fazie.

### Success Criteria:

#### Automated Verification:

- Przy działającym `npx supabase start`: `npm run test:db:api` zielony, dwa przebiegi pod rząd (unikalność dat, sprzątanie)
- `npm test` nie uruchamia żadnego `*.db.test.ts`: `npm test -- --reporter=verbose 2>&1 | grep -c "\.db\.test\.ts"` == 0 (sprawdzone też na stanie zepsutym — bez wpisu w `exclude` wynik > 0)
- Bez stosu (`npx supabase stop`): `npm run test:db:api` kończy się kodem ≠ 0 z komunikatem o stosie, nie „skipped”
- `npm run lint` zielony

#### Manual Verification:

- Każde psucie RLS zapaliło odpowiadający test; wszystkie cofnięte
- Wynik `.maybeSingle()` na wielowierszowym DELETE zanotowany (komentarz w `index.db.test.ts` + notatka do Fazy 5)
- Po przebiegu w lokalnej bazie nie zostają wiersze kont `api-teacher-*` (sprawdzone w Studio albo `psql`)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Job `db` w CI

### Overview

Bramka §5 „testy bazy” przestaje być wyłącznie lokalna. Osobny, doradczy job, żeby czerwień bazy miała własny znaczek.

### Changes Required:

#### 1. Workflow

**File**: `.github/workflows/ci.yml`

**Intent**: Nowy job `db` na tych samych triggerach co `ci` (PR do `master`, push do `master`), uruchamiający pgTAP i warstwę trasy z prawdziwym klientem.

**Contract**:
- kroki: checkout → setup-node 22 z cache npm → `npm ci` → `npx astro sync` → `npx supabase start -x studio,imgproxy,realtime,storage-api,edge-runtime,logflare,vector,supavisor,mailpit,postgres-meta` (zostają Postgres, GoTrue, PostgREST, Kong) → `npx supabase status -o env >> "$GITHUB_ENV"` → `npm run test:db` → `npm run test:db:api`;
- bez sekretów repozytorium;
- komentarz nad jobem jak przy `content-safety-gate`: doradczy (ochrona gałęzi niedostępna), osobny job, bo nie potrzebuje sekretów ani buildu, a czerwień bazy ma być widoczna osobno.

Jeśli lista `-x` wywróci start (np. GoTrue zależy od wykluczonego kontenera), zawęź wykluczenia i zapisz powód w komentarzu.

### Success Criteria:

#### Automated Verification:

- `npx actionlint .github/workflows/ci.yml` bez błędów (albo `gh workflow view` po pushu, jeśli actionlint niedostępny)
- Po pushu gałęzi i otwarciu PR: `gh pr checks` pokazuje `db` jako `pass`

#### Manual Verification:

- W logu joba widać, że oba zestawy faktycznie się wykonały (liczba asercji pgTAP i liczba testów Vitest > 0), a brak `supabase/seed.sql` nie przerwał startu
- Zmierzony czas joba zanotowany do §6.7
- Kontrola negatywna w CI: tymczasowy commit psujący jedną asercję (np. odwrócone oczekiwanie w `index.db.test.ts`) daje czerwony `db`; commit cofnięty (revert albo force-push na gałęzi feature)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Backport dokumentacji

### Overview

`test-plan.md` i `next-actions.md` opisują stan po fazie, nie przed nią. §6.3 dostaje wzorzec, który faktycznie powstał.

### Changes Required:

#### 1. Test plan

**File**: `context/foundation/test-plan.md`

**Intent**: Zamknąć Fazę 3 i wprowadzić korekty zgłoszone w `research.md` § „Backport do test-planu”.

**Contract**:
- §2 Risk Response #3, „Co dowodzi ochrony”: „Zatwierdzony dzień przeżywa każdą regenerację i generowanie tygodnia, na które nie padła zgoda nazywająca ten dzień (w tygodniu także jego `accepted_at`); zgoda zastępuje go i cofa zatwierdzenie”. „Kontekst” dostaje „zgoda dnia (boolean) vs zgoda tygodnia (data + `accepted_at`)”;
- §2 #4: dopisek o powierzchni jawnej odmowy (trasy adresowane id) i o trasach datowych („nie dotyka wiersza drugiego konta”);
- §3: cel Fazy 3 w nowym brzmieniu, status `complete`, folder → ścieżka archiwum po `/10x-archive` (albo zostaje `context/changes/…` do czasu archiwizacji);
- §3 notatka o e2e: #3 ma warstwę przeglądarkową od S-10 (`regenerate-confirmation.spec.ts`);
- §4 wiersz database: liczba plików i asercji po fazie, uruchamianie w CI; nowy wiersz „integration (trasa + prawdziwy klient)” z `npm run test:db:api`;
- §5: „testy bazy” → wired w CI (job `db`, doradczy);
- §6.3: pełny wzorzec (lokalizacja `*.db.test.ts`, test referencyjny, konfiguracja, helper, reguła klucza serwisowego, obowiązkowa kontrola pozytywna, „głośno, nie skip”, kiedy tutaj vs atrapa vs pgTAP vs e2e);
- §6.2: jedno zdanie odsyłające własność do §6.3;
- §6.4: dług `U0003` zamknięty (gdzie i jak); nazwy plików i liczby aktualne;
- §6.7: notatka Fazy 3 — czego faza nauczyła, zmierzony czas joba, wynik `.maybeSingle()`, ewentualne niespodzianki;
- §8: daty przeglądu.

#### 2. Next actions

**File**: `context/foundation/next-actions.md`

**Intent**: Zamknąć Krok 6 i nie zgubić asymetrii zgody.

**Contract**:
- Krok 6 → `✅ … — ZROBIONE <data>` z 2–3 zdaniami wyniku;
- :246-247 „zgoda per data” → „zgoda per data i `accepted_at`”;
- nowa pozycja w sekcji otwartych ogonów: „Zgoda dnia (`confirm_replace`, boolean) nie jest związana z wersją zatwierdzenia, w przeciwieństwie do tygodnia” — z właścicielem (przyszły slice) i odnośnikiem do `research.md`;
- ewentualna pozycja „obrona w głąb dla DELETE” (jeśli Faza 3 tak rozstrzygnie);
- „Stan” u góry pliku zaktualizowany.

#### 3. Change

**File**: `context/changes/testing-write-ownership/change.md`

**Intent**: `status` odpowiada stanowi prac (`implemented` przed archiwizacją), `updated` z bieżącą datą.

### Success Criteria:

#### Automated Verification:

- `grep -c "integration + pgTAP | complete |" context/foundation/test-plan.md` == 1 (dziś `planned`, więc 0)
- `grep -c "TBD — see §3 Phase 3" context/foundation/test-plan.md` == 0 (dziś == 1)
- `grep -c "73 asercje" context/foundation/test-plan.md` == 0 (dziś == 1)
- `grep -n "Zaakceptowany dzień przeżywa" context/foundation/test-plan.md` pusty (stare brzmienie celu Fazy 3 usunięte)

#### Manual Verification:

- §6.3 czyta się jako samodzielny przepis: ktoś spoza tej zmiany dopisze według niego test własności nowej trasy
- `git diff -w master..HEAD -- context/foundation/test-plan.md` dotyka wyłącznie sekcji wymienionych wyżej (szum przerównania tabel dopuszczony — patrz lessons „odporne na przerównanie”)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding.

---

## Testing Strategy

### Unit Tests:

- Brak nowych testów czysto jednostkowych. Treść okien zgody i podział targets/untouched/consented są już pokryte (`confirmations.test.ts`, `week-generation.test.ts`).

### Integration Tests:

- Atrapa (`npm test`): `generate` (409 przed modelem, zgoda, wyścig), `index` GET/DELETE, `accept`.
- Prawdziwy klient (`npm run test:db:api`): `accept`, `activity/[id]`, `index` GET/DELETE, `week/save`, każdy na dwóch kontach z kontrolą pozytywną.
- pgTAP (`npm run test:db`): `U0003` ×4 gałęzie z kolejnością, sąsiad dnia i tygodnia, tydzień dwóch kont, DELETE po dacie na dwóch kontach.

### Manual Testing Steps:

1. `npx supabase start && npm run test:db && npm run test:db:api && npm test` — wszystkie zielone.
2. Dla każdej fazy przejść listę psuć, zobaczyć czerwień, cofnąć.
3. `npx supabase stop && npm run test:db:api` — głośna porażka, nie skip.
4. PR: znaczek `db` zielony, a kontrola negatywna daje czerwony.

## Performance Considerations

- `npm test` zostaje sekundowy: nowa warstwa jest wykluczona z domyślnego zestawu.
- Job `db` pobiera obrazy przy każdym przebiegu (brak cache Dockera). Mierzymy przy pierwszym przebiegu. Jeśli przekroczy ~6 min, rozważ cache obrazów jako osobną pozycję w `next-actions.md`, nie w tej fazie.

## Migration Notes

Brak migracji. Psucia w rytuale mutacji są wyłącznie lokalne i cofane `supabase db reset`.

## References

- Research: `context/changes/testing-write-ownership/research.md`
- Test plan: `context/foundation/test-plan.md` §2, §3, §6.2–§6.4, §6.7
- Wzorzec osobnej warstwy Vitest: `vitest.gate.config.ts`
- Wzorzec zasiewu i reguły klucza serwisowego: `tests/e2e/support/supabase-admin.ts:5-15`, `tests/e2e/support/test-data.ts`
- Test referencyjny trasy na atrapie: `src/pages/api/day-plan/activity/[id].test.ts`
- Writer tygodnia: `supabase/migrations/20260929120000_week_writer_consent_versions.sql:50-182`
- Writer dnia: `supabase/migrations/20260920110000_theme_follows_haslo.sql:56-126`
- S-10 (asymetria zgody): `context/archive/2026-09-28-accepted-day-replacement/plan-brief.md:42`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: pgTAP — dług `U0003` i luki #3/#7

#### Automated

- [x] 1.1 `npm run test:db` zielony; łączna liczba asercji > 98, `plan(N)` zgodny w każdym pliku — 662e565
- [x] 1.2 `grep -c "'U0003'"` ≥ 3 w `day_plan_write.test.sql` i ≥ 5 w `week_plan_write.test.sql` — 662e565
- [x] 1.3 `git diff --name-only master..HEAD -- supabase/migrations` pusty — 662e565

#### Manual

- [x] 1.4 Każde psucie z listy zapaliło nową asercję; cofnięte, zestaw znów zielony — 662e565 (dowód: komentarze mutacji w trzech plikach pgTAP; zestaw zielony w review 2026-09-30)
- [x] 1.5 Komentarze mutacji przy nowych asercjach — 662e565

### Phase 2: Trasy na atrapie — zachowanie bez własności (`npm test`)

#### Automated

- [x] 2.1 `npm test` zielony, w tym `index.test.ts` i `accept.test.ts` — 5047f42
- [x] 2.2 `npm run lint` zielony — 5047f42
- [x] 2.3 Typy bez błędów (`astro sync` + `tsc --noEmit` albo `lint`) — 5047f42

#### Manual

- [x] 2.4 Psucia (pre-check, pre-check zawsze odmawiający, ponowienie DELETE, `not_found`→`conflict`) zobaczone na czerwono i cofnięte — 5047f42 (dowód: komentarze „Checked by mutation” w `generate`/`index`/`accept.test.ts`)

### Phase 3: Trasa + prawdziwy klient A/B — wzorzec §6.3 (`npm run test:db:api`)

#### Automated

- [x] 3.1 `npm run test:db:api` zielony, dwa przebiegi pod rząd — 0d71a1e
- [x] 3.2 `npm test` nie uruchamia `*.db.test.ts` (grep == 0; > 0 bez wpisu w `exclude`) — 0d71a1e
- [x] 3.3 Bez stosu `npm run test:db:api` kończy się kodem ≠ 0, nie „skipped” — 0d71a1e
- [x] 3.4 `npm run lint` zielony — 0d71a1e

#### Manual

- [x] 3.5 Każde psucie RLS zapaliło odpowiadający test; cofnięte — 0d71a1e (dowód: komentarze w `*.db.test.ts`, test-plan §6.7 pkt 1–2; `activity/[id]` zapala się dopiero przy select + update — zanotowane)
- [x] 3.6 Wynik `.maybeSingle()` na wielowierszowym DELETE zanotowany — 0d71a1e (`index.db.test.ts`, §6.7 pkt 1)
- [x] 3.7 Brak pozostałych wierszy kont `api-teacher-*` po przebiegu — sprawdzone w review 2026-09-30 (0 wierszy po dwóch przebiegach)

### Phase 4: Job `db` w CI

#### Automated

- [x] 4.1 `actionlint` (albo `gh workflow view`) bez błędów — 82321c3
- [x] 4.2 `gh pr checks` pokazuje `db` jako `pass` — 82321c3

#### Manual

- [x] 4.3 Log joba: oba zestawy wykonane, brak `seed.sql` nie przerwał startu — run 36766052693 (pgTAP PASS, 4 pliki / 8 testów Vitest)
- [x] 4.4 Czas joba zmierzony i zanotowany — 1606f7c (§6.7: 2 min 22 s)
- [ ] 4.5 Kontrola negatywna w CI dała czerwony `db`; cofnięta — NIE WYKONANE (review 2026-09-30: brak celowo czerwonego przebiegu w historii gałęzi; czerwone przebiegi to crash Postgresa i limit ECR, nie asercja)

### Phase 5: Backport dokumentacji

#### Automated

- [x] 5.1 Wiersz Fazy 3 w §3 ma status `complete` — 1606f7c
- [x] 5.2 „TBD — see §3 Phase 3” zniknęło z test-planu — 1606f7c
- [x] 5.3 „73 asercje” zniknęło z test-planu — 1606f7c
- [x] 5.4 Stare brzmienie „Zaakceptowany dzień przeżywa” zniknęło — 1606f7c

#### Manual

- [ ] 5.5 §6.3 czytelny jako samodzielny przepis
- [ ] 5.6 `git diff -w` test-planu dotyka wyłącznie wymienionych sekcji
