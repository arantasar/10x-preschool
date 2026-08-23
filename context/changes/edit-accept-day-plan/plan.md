# S-02 `edit-accept-day-plan` — plan implementacji

## Overview

Nauczyciel generuje propozycje dla dnia, poprawia je, akceptuje — i wszystko to **zostaje**.
S-02 jest slice'em, w którym aplikacja po raz pierwszy pisze do własnej bazy: F-01 zbudowało
schemat i dowiodło izolacji, S-01 zbudowało generowanie i nie zapisuje nic. Ta zmiana domyka
pętlę „keep": od efemerycznej propozycji do zatwierdzonego planu dnia.

Rdzeniem nie jest UI edycji, tylko **protokół zapisu**. Regeneracja to co najmniej dwa polecenia
(podbij licznik, wstaw partię), a PostgREST nie daje transakcji po stronie klienta. Dlatego
jedynym pisarzem partii jest funkcja Postgresa, a niezmiennik `activities.generation =
day_plans.current_generation` egzekwuje trigger — zobowiązanie, które przegląd implementacji F-01
zostawił imiennie temu slice'owi i które dziedziczy po nim S-03.

## Current State Analysis

Zweryfikowane w kodzie (nie tylko w dokumentach) na commicie `67ad5c3`:

- **Schemat jest gotowy i celowo wąski.** Migracja
  [20260720162553](supabase/migrations/20260720162553_narrow_authenticated_update_columns.sql)
  daje `authenticated` UPDATE wyłącznie na `day_plans (plan_date, prompt, current_generation,
  accepted_at)` i `activities (ordinal, title, description)`. To odwzorowuje FR-008 (edycja
  tytułu/opisu) i FR-009 (ustawienie `accepted_at`) niemal jeden do jednego — granty cięto
  z myślą o S-02.
- **Niezmiennik zapisu nie istnieje.** Polityka INSERT na `activities` pyta tylko o własność
  (`auth.uid() = user_id`), CHECK tylko o `generation >= 1`. Nic nie wiąże nowej partii z licznikiem
  planu. Awaria jest cicha: [selectCurrentGeneration](src/lib/day-plans.ts#L14) uczciwie zwróci
  pustą tablicę, brandowany `CurrentActivity` potwierdzi „to jest bieżące", nauczyciel zobaczy
  pusty plan — bez błędu, wyjątku ani wpisu w logu.
- **S-01 nie zapisuje niczego i mówi o tym wprost.**
  [GenerateDayPlanForm.tsx:12-16](src/components/plan/GenerateDayPlanForm.tsx#L12-L16) nazywa wyspę
  „stanem generacji", a copy w UI ([:229](src/components/plan/GenerateDayPlanForm.tsx#L229)) obiecuje
  nauczycielowi, że propozycje znikną po odświeżeniu.
- **Trasa generowania waliduje `plan_date` i ją wyrzuca.**
  [generate.ts:102-104](src/pages/api/day-plan/generate.ts#L102-L104) — świadomie, „S-01 stores
  nothing". Kontrakt wire'owy był trzymany stabilnie właśnie pod ten slice.
- **Deklaracja retencji nie ma egzekutora.** Komentarz tabeli `activities` twierdzi „at most the
  current and immediately previous batch are retained" — nic nie sprząta. To dokładnie reguła #2
  z `lessons.md` („odroczone sprzątanie danych musi mieć właściciela").
- **`src/lib/services/` istnieje** od S-01 (`activity-generator.ts`, `day-plan-contract.ts`), ale
  **żaden moduł nie dotyka Supabase poza `src/lib/supabase.ts`** — S-02 ustanawia wzorzec dostępu
  do danych dla całego projektu.
- **Weryfikacja to pgTAP i nic więcej.** `npm run test:db` (23/23), `npm run lint`, `astro check`,
  `npm run build`. Nie ma runnera testów TS/React.
- **⚠️ Trzy migracje F-01 nigdy nie trafiły na hosted project.** `20260720162247`,
  `20260720162553`, `20260720163134` są lokalne (przegląd F-01, notka przy F4/F5). S-02 zależy od
  wszystkich trzech — bez nich granty są szerokie, a CHECK-i długości nie istnieją.
- **`Database["public"]["Functions"]` to typowany slot** w [database.types.ts](src/db/database.types.ts#L115) —
  RPC otypuje się samo po regeneracji. Plik jest wyłączony z ESLint i Prettiera
  ([.prettierignore](.prettierignore#L5), [eslint.config.js:73](eslint.config.js#L73)).

## Desired End State

Nauczyciel wchodzi na `/plan?date=2026-09-14`, widzi zapisany plan tego dnia wyrenderowany przez
serwer (albo pusty formularz, jeśli planu nie ma). Generuje — plan i trzy propozycje lądują w bazie
jednym zapisem. Poprawia tytuł jednej propozycji, zapisuje ją; plan wraca do stanu roboczego.
Akceptuje. Odświeża stronę — wszystko jest na miejscu, ze stanem „zaakceptowany". Generuje ponownie,
potwierdza ostrzeżenie — stara partia znika, akceptacja się kasuje, licznik idzie o jeden w górę.

Weryfikacja: pgTAP dowodzi, że partia z niezgodną generacją nie da się wstawić, że regeneracja jest
atomowa, że stara partia jest usuwana, że edycja treści kasuje akceptację i że nauczyciel B nie
dosięgnie planu nauczyciela A przez funkcję. Ręcznie: pełny przepływ w przeglądarce plus odświeżenie
na każdym kroku.

### Key Discoveries:

- Kolumnowe granty z F-01 pokrywają dokładnie te kolumny, których S-02 potrzebuje —
  [20260720162553](supabase/migrations/20260720162553_narrow_authenticated_update_columns.sql).
  Nie trzeba ich poszerzać i **nie wolno**.
- `unique (plan_id, generation, ordinal)` + `check (ordinal between 1 and 20)` już ograniczają partię
  do 20 wierszy strukturalnie — [20260720162247](supabase/migrations/20260720162247_bound_plan_and_activity_input.sql#L44-L50).
  `ACTIVITY_COUNT = 3` w [day-plan-limits.ts:31](src/lib/day-plan-limits.ts#L31).
- `PlanAcceptance` w [types.ts:54-56](src/types.ts#L54-L56) i `acceptanceOf` w
  [day-plans.ts:22](src/lib/day-plans.ts#L22) już modelują stan draft/accepted — S-02 je konsumuje,
  nie wymyśla od nowa.
- Wzorzec `set_updated_at` ([migracja pierwsza](supabase/migrations/20260718211452_day_plans_and_activities.sql))
  pokazuje przyjętą konwencję funkcji: `language plpgsql`, `security invoker`, `set search_path = ''`.
- Trasa API broni się sama (401 JSON), strona idzie przez `PROTECTED_ROUTES` —
  [middleware.ts:4-8](src/middleware.ts#L4-L8) tłumaczy dlaczego. S-02 powiela ten rozdział.

## What We're NOT Doing

- **Żadnego widoku listy ani kalendarza.** `/plan` obsługuje jeden dzień; wybór daty to picker.
  FR-004 i widok wielodniowy należą do S-03 `week-generation`.
- **Żadnego undo.** Nadpisana partia jest usuwana. Komentarz tabeli mówiący o „previous batch"
  zostaje **poprawiony** w tej samej migracji, a nie zostawiony jako nieprawda.
- **Żadnego runnera testów TS/React.** Strategia testowania to Moduł 3.
- **Żadnej zmiany promptu ani modelu.** Reguła z `lessons.md` („bramka musi objąć każdy dopuszczony
  model") oznacza, że dotknięcie promptu wymaga przebiegu `compare-models.sh` — poza zakresem.
- **Żadnego usuwania planu dnia.** Nie ma FR; nauczyciel nadpisuje przez regenerację.
- **Żadnego tłumaczenia `dashboard.astro`** — zostaje po angielsku, jak po S-01.
- **Żadnego limitu regeneracji.** Otwarte pytanie roadmapy, nie blokuje MVP.

## Implementation Approach

Jedna zasada organizuje całość: **baza jest jedynym źródłem prawdy o planie, a niezmienniki mieszkają
w schemacie, nie w TypeScripcie.** To kontynuacja linii F-01, gdzie własność wymusza złożony klucz
obcy, a nie kod aplikacji.

Konsekwencje:

1. Partię pisze **jedna funkcja Postgresa** — atomowo, bo PostgREST nie daje transakcji klientowi.
2. Zgodność generacji egzekwuje **trigger `BEFORE INSERT`**, niezależnie od tego, kto pisze. Funkcja
   sama przypisuje `generation`, więc żaden wołający nie podaje tej liczby — nie ma czego pomylić.
3. Reguła „edycja treści cofa akceptację" też jest **triggerem**, a nie parą wywołań w serwisie —
   inaczej częściowa awaria zostawia poprawiony tekst na zaakceptowanym planie, czyli dokładnie stan,
   który ta reguła wyklucza.
4. Wyspa React przestaje być stanem planu i staje się jego widokiem. Stan początkowy przychodzi
   z serwera jako props; każda mutacja to request i ponowny odczyt.

## Critical Implementation Details

**Kolejność w obrębie transakcji zapisu.** `insert … on conflict (user_id, plan_date) do update`
podbija licznik i **jednocześnie bierze blokadę wiersza** — dwie równoległe regeneracje tego samego
dnia szeregują się same, bez jawnego `for update`. Dopiero po tym wolno usunąć starą partię i wstawić
nową, żeby trigger widział już nowy licznik. Odwrotna kolejność („wstaw, potem podbij") jest tym, co
trigger ma uniemożliwić — nie jest wariantem do rozważenia.

**Kolejność propozycji nie może wyjść z `row_number() over ()`.** Bez `order by` to niedeterministyczne.
`jsonb_array_elements(...) with ordinality` zachowuje kolejność, w której model je zwrócił, a właśnie
ta kolejność trafia do `ordinal`.

**Trigger czytający `day_plans` pod RLS.** Gdy RLS ukryje wiersz planu, podzapytanie zwraca `NULL`,
a `new.generation is distinct from NULL` jest prawdą — czyli odmowa. To bezpieczny kierunek awarii
i tak ma zostać.

**Funkcje mają domyślnie `EXECUTE` dla `PUBLIC`.** Sam `grant execute … to authenticated` nie
zamyka `anon` — trzeba najpierw `revoke all … from public`. To ten sam mechanizm, co przy grantach
kolumnowych w F-01: revoke i grant są śledzone osobno.

## Phase 1: Kontrakt zapisu w schemacie

### Overview

Migracja wnosząca trigger niezmiennika, trigger cofający akceptację, funkcję zapisu partii oraz
korektę komentarza retencji. Dowód pgTAP powstaje **w tej samej fazie** — F-01 pokazało, czym kończy
się schemat wypuszczony na zaufanie (6 z 13 asercji przechodziło jałowo).

### Changes Required:

#### 1. Migracja: kontrakt zapisu

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_day_plan_generation_write_contract.sql`
(znacznik z `date +%Y%m%d%H%M%S`)

**Intent**: Wnieść do schematu trzy rzeczy, których F-01 świadomie nie dodało, bo nie miało
wołającego: niezmiennik generacji, atomowy zapis partii i regułę „edycja cofa akceptację".
Nagłówek migracji ma nazwać przegląd F-01 (F5, „Residual") jako źródło — tak jak robią to trzy
migracje naprawcze F-01.

**Contract**: Trzy funkcje, dwa triggery, jedna korekta komentarza, granty na funkcję.

Trigger niezmiennika — predykat jest kontraktem, na którym opiera się reszta planu:

```sql
create function public.enforce_activity_generation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.generation is distinct from (
    select current_generation from public.day_plans where id = new.plan_id
  ) then
    raise exception
      'activities.generation % does not match current_generation for plan %',
      new.generation, new.plan_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger activities_enforce_generation
  before insert on public.activities
  for each row execute function public.enforce_activity_generation();
```

Funkcja zapisu — sygnatura i kolejność poleceń, od których zależą Fazy 2–4:

```sql
create function public.save_day_plan_generation(
  p_plan_date date, p_prompt text, p_activities jsonb
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare v_plan_id uuid; v_generation smallint;
begin
  insert into public.day_plans (user_id, plan_date, prompt)
  values ((select auth.uid()), p_plan_date, p_prompt)
  on conflict (user_id, plan_date) do update
    set prompt = excluded.prompt,
        current_generation = public.day_plans.current_generation + 1,
        accepted_at = null
  returning id, current_generation into v_plan_id, v_generation;

  delete from public.activities
   where plan_id = v_plan_id and generation < v_generation;

  insert into public.activities
    (plan_id, user_id, generation, ordinal, title, description)
  select v_plan_id, (select auth.uid()), v_generation, ord::smallint,
         item ->> 'title', item ->> 'description'
    from jsonb_array_elements(p_activities) with ordinality as t(item, ord);

  return v_plan_id;
end;
$$;
```

Zwracany jest sam `plan_id` — partię i tak odczytuje `readDayPlan` (Faza 2), które jest potrzebne
dla SSR. Jedna ścieżka odczytu zamiast dwóch.

Trigger cofający akceptację — `when` jest tu istotne, bo zmiana samego `ordinal` nie jest zmianą
treści i nie ma unieważniać zatwierdzenia:

```sql
create trigger activities_edit_clears_acceptance
  after update on public.activities
  for each row
  when (old.title is distinct from new.title
     or old.description is distinct from new.description)
  execute function public.clear_plan_acceptance();
```

Granty: `revoke all on function public.save_day_plan_generation(date, text, jsonb) from public;`
a następnie `grant execute … to authenticated;` — w tej kolejności, bo domyślny `EXECUTE` dla
`PUBLIC` nie zniknie od samego grantu.

Korekta komentarza: `comment on table public.activities` traci zdanie o „immediately previous batch"
na rzecz stanu faktycznego — rezydentna jest wyłącznie bieżąca partia, a `save_day_plan_generation`
usuwa starsze w tym samym zapisie. Deklaracja retencji dostaje wreszcie egzekutora, czego wymaga
reguła #2 z `lessons.md`.

#### 2. Regeneracja typów

**File**: `src/db/database.types.ts`

**Intent**: Odświeżyć wygenerowane typy, żeby `save_day_plan_generation` pojawiło się w
`Database["public"]["Functions"]` i `supabase.rpc(...)` był typowany bez asercji.

**Contract**: Wyjście `npx supabase gen types typescript --local > src/db/database.types.ts`.
Plik jest generowany — nigdy nie edytowany ręcznie; wykluczenia z ESLint i Prettiera już istnieją.

#### 3. Dowód pgTAP

**File**: `supabase/tests/database/day_plan_write.test.sql` (nowy plik, obok `rls_isolation.test.sql`)

**Intent**: Dowieść własności, których nie widać w kodzie aplikacji i których żadna awaria nie
zasygnalizuje. Osobny plik, bo `rls_isolation.test.sql` dowodzi izolacji F-01 i ma zostać czytelny
jako właśnie ten dowód.

**Contract**: Asercje pokrywające:

- wstawienie `activities` z `generation` innym niż `current_generation` planu podnosi `check_violation`
  (`throws_ok`), w obie strony — za niskim i za wysokim;
- `save_day_plan_generation` na nieistniejącym dniu tworzy plan z `current_generation = 1`
  i trzema wierszami o `ordinal` 1–3 w kolejności z wejściowego JSON-a;
- powtórne wywołanie dla tego samego dnia podbija licznik do 2, **usuwa** partię generacji 1
  (`is(count(*), 3)` na całej tabeli dla planu, nie tylko na bieżącej generacji) i zeruje `accepted_at`;
- `prompt` po regeneracji to nowe hasło;
- UPDATE `title` na `activities` kasuje `accepted_at` planu; UPDATE samego `ordinal` **nie** kasuje;
- nauczyciel B wywołujący funkcję dla daty, dla której plan ma nauczyciel A, dostaje **własny** plan,
  a plan A pozostaje nietknięty (`security invoker` + RLS, nie przejęcie wiersza);
- `anon` nie ma `EXECUTE` na funkcji.

Każdą asercję sprawdzić mutacją — metoda z przeglądu F-01: zepsuć to, co asercja rzekomo bada,
i potwierdzić, że test czerwienieje. Asercja, która przechodzi po usunięciu triggera, nie bada triggera.

### Success Criteria:

#### Automated Verification:

- Migracje aplikują się od zera: `npx supabase db reset`
- Cały pakiet pgTAP przechodzi, łącznie z pakietem F-01: `npm run test:db`
- Typy regenerują się bez błędu: `npx supabase gen types typescript --local`
- Lint czysty: `npm run lint`
- Kontrola typów bez błędów: `npx astro check`

#### Manual Verification:

- Każda nowa asercja pgTAP sprawdzona mutacją — usunięcie triggera / odwrócenie kolejności w funkcji
  / zdjęcie `when` z triggera akceptacji zapala odpowiedni test na czerwono
- Trzy zaległe migracje F-01 są na hosted project (`npx supabase db push`) albo świadomie odłożone
  z zapisaną decyzją

**Implementation Note**: Po tej fazie i przejściu automatycznej weryfikacji zatrzymaj się i poczekaj
na potwierdzenie mutation-checków przez człowieka, zanim ruszysz dalej. To jedyna faza, w której
niezmiennik da się jeszcze zmienić tanio.

---

## Phase 2: Warstwa dostępu do danych i zapis w trasie generowania

### Overview

Pierwszy moduł projektu dotykający Supabase poza `src/lib/supabase.ts`. Trasa generowania przestaje
być czystą funkcją i zaczyna zapisywać.

### Changes Required:

#### 1. Serwis dostępu do planów

**File**: `src/lib/services/day-plan-store.ts`

**Intent**: Skupić wszystkie odczyty i zapisy planu dnia w jednym module. Trafia do `services/`,
a nie do `src/lib/`, bo dotyka dwóch tabel — reguła z CLAUDE.md.

**Contract**: Cztery funkcje, wszystkie przyjmujące klienta Supabase jako pierwszy argument (żeby
sesja wołającego, a więc i RLS, była jawna, a nie ukryta w module):

- `saveGeneration(supabase, command: GenerateDayPlanCommand): Promise<string>` — wywołuje RPC,
  zwraca `plan_id`. **Jedno ponowienie** przy błędzie: awaria zapisu po udanej generacji kosztuje
  nauczyciela 10–30 s i tokeny, a realny przypadek to chwilowa usterka połączenia, nie trwała.
  Ponowienie jest tanie (milisekundy), więc opłaca się zawsze; drugie niepowodzenie jest błędem.
- `readDayPlan(supabase, planDate: string): Promise<DayPlanWithCurrentActivities | null>` — odczytuje
  plan i jego aktywności, przepuszcza je przez `selectCurrentGeneration`. To **jedyny** konstruktor
  `CurrentActivity` w ścieżce odczytu; nie omijać go.
- `updateActivityText(supabase, activityId, { title, description })` — prosty UPDATE; kasowanie
  akceptacji robi trigger, nie ten kod.
- `setAcceptance(supabase, planId, accepted: boolean)` — ustawia `accepted_at` na `now()` albo `null`.

Błędy Supabase mapować na kategorie w duchu `GenerationErrorCategory` z
[activity-generator.ts:62](src/lib/services/activity-generator.ts#L62), żeby trasy mogły odpowiadać
tą samą kopertą `{ error, retryable }`. Nie importować `GenerationError` — to błąd modelu, nie bazy.

#### 2. Trasa generowania zapisuje

**File**: `src/pages/api/day-plan/generate.ts`

**Intent**: Po udanej generacji zapisać partię i odpowiedzieć zapisanym planem zamiast luźnymi
propozycjami. `plan_date` przestaje być etykietą żądania, a komentarz z linii 102–104 znika razem
z powodem swojego istnienia.

**Contract**: Ciało odpowiedzi zmienia się z `{ activities: ActivityDraft[] }` na
`{ plan: DayPlan, activities: CurrentActivity[] }`. Ścieżka: sesja → zod → `generateDayActivities`
→ `saveGeneration` → `readDayPlan` → 200. Niepowodzenie zapisu po ponowieniu daje 503 z
`retryable: true` i polskim komunikatem — **bez** zwracania niezapisanych propozycji; jedno źródło
prawdy oznacza, że nie ma reprezentacji „propozycja bez wiersza".

#### 3. Klient Supabase dla tras API

**File**: `src/middleware.ts`

**Intent**: Udostępnić trasom API klienta Supabase związanego z sesją żądania, zamiast tworzyć go
drugi raz w każdej trasie. Middleware już go buduje w [linii 11](src/middleware.ts#L11) i wyrzuca
po ustaleniu użytkownika.

**Contract**: `context.locals.supabase` obok istniejącego `context.locals.user`; deklaracja
w `src/env.d.ts` w interfejsie `App.Locals`. Typ z `createClient` — nie `any`, nie `SupabaseClient`
bez parametru `Database`.

### Success Criteria:

#### Automated Verification:

- Lint czysty: `npm run lint`
- Kontrola typów bez błędów: `npx astro check`
- Build przechodzi: `npm run build`
- Build bez `SUPABASE_URL` / `SUPABASE_KEY` nadal przechodzi (wzorzec `config-status`)
- `POST /api/day-plan/generate` bez sesji odpowiada 401 z `content-type: application/json`

#### Manual Verification:

- Generowanie na `/plan` tworzy wiersz w `day_plans` i trzy w `activities` (sprawdzone w Supabase Studio)
- Ponowna generacja tego samego dnia: `current_generation` = 2, w `activities` **trzy** wiersze, nie sześć
- Odświeżenie strony po generowaniu nie gubi propozycji
- Symulowana awaria zapisu (zatrzymany lokalny Supabase) daje czytelny polski komunikat z ponowieniem,
  a nie wyjątek ani propozycje bez zapisu

**Implementation Note**: Po tej fazie zatrzymaj się na ręczne potwierdzenie, zanim ruszysz dalej.

---

## Phase 3: Trasy edycji i akceptacji

### Overview

Dwie trasy realizujące FR-008 i FR-009. Obie cienkie: sesja → zod → serwis → koperta błędu.

### Changes Required:

#### 1. Edycja jednej propozycji

**File**: `src/pages/api/day-plan/activity/[id].ts`

**Intent**: Zapisać poprawiony tytuł i opis jednej aktywności. Granularność jest jednostkowa,
bo taki jest wybrany protokół zapisu — jeden przycisk Zapisz przy jednej propozycji.

**Contract**: `PATCH`, `prerender = false`. Ciało walidowane zodem przeciwko `TITLE_MAX`
i `DESCRIPTION_MAX` z [day-plan-limits.ts](src/lib/day-plan-limits.ts#L26-L27) — te same granice,
co CHECK-i w bazie. `id` jako UUID. Odpowiedź: zaktualizowany plan i partia (to samo ciało, co
trasa generowania), bo edycja zmienia też `accepted_at` planu przez trigger i klient musi zobaczyć
oba fakty naraz. RLS załatwia autoryzację — brak wiersza to 404, nie 403.

#### 2. Akceptacja planu

**File**: `src/pages/api/day-plan/accept.ts`

**Intent**: Jawnie zatwierdzić plan dnia albo cofnąć zatwierdzenie (FR-009).

**Contract**: `POST`, ciało `{ plan_id: uuid, accepted: boolean }`. Ustawia `accepted_at` na `now()`
lub `null`. Odpowiedź jak wyżej. Zwrócony `accepted_at` pochodzi z bazy, nie z zegara przeglądarki.

#### 3. Kontrakty wire'owe w jednym miejscu

**File**: `src/lib/services/day-plan-contract.ts`

**Intent**: Dopisać schematy zoda dla nowych ciał żądań tam, gdzie już mieszka
`generateDayPlanRequestSchema`, zamiast rozsypywać walidację po trasach.

**Contract**: `updateActivityRequestSchema`, `acceptPlanRequestSchema` plus wyprowadzone typy.
Granice czytane z `day-plan-limits`, nie przepisywane.

### Success Criteria:

#### Automated Verification:

- Lint czysty: `npm run lint`
- Kontrola typów bez błędów: `npx astro check`
- Build przechodzi: `npm run build`
- Obie nowe trasy bez sesji odpowiadają 401 z `content-type: application/json`
- `PATCH` z tytułem dłuższym niż 200 znaków odpowiada 400 (przy aktywnej sesji)

#### Manual Verification:

- Edycja tytułu zapisuje się i po odświeżeniu jest widoczna
- Edycja zaakceptowanego planu wraca do stanu roboczego (`accepted_at` = null) w tej samej odpowiedzi
- Akceptacja i cofnięcie akceptacji działają w obie strony
- `PATCH` na `id` aktywności innego konta odpowiada 404, a nie modyfikuje wiersza

**Implementation Note**: Po tej fazie zatrzymaj się na ręczne potwierdzenie, zanim ruszysz dalej.

---

## Phase 4: Ekran planu dnia

### Overview

`/plan` przestaje być formularzem generowania, a staje się widokiem jednego dnia. Wyspa dostaje stan
początkowy z serwera i traci rolę właściciela propozycji.

### Changes Required:

#### 1. Strona renderuje zapisany dzień

**File**: `src/pages/plan.astro`

**Intent**: Odczytać dzień z query stringa, pobrać plan po stronie serwera i podać wyspie jako props,
żeby zapisany plan był na ekranie w pierwszym renderze — bez stanu ładowania.

**Contract**: `?date=YYYY-MM-DD`, brak lub niepoprawna wartość → dzisiejsza data lokalna
(logika `todayIsoDate` z [GenerateDayPlanForm.tsx:266](src/components/plan/GenerateDayPlanForm.tsx#L266)
przenosi się do modułu współdzielonego, bo potrzebują jej teraz serwer i klient). Odczyt przez
`readDayPlan` na `Astro.locals.supabase`. Props wyspy: `planDate` i `initialPlan` (`DayPlanWithCurrentActivities | null`).

#### 2. Wyspa staje się edytorem

**File**: `src/components/plan/DayPlanEditor.tsx` (z `GenerateDayPlanForm.tsx`)

**Intent**: Przepisać wyspę tak, żeby stanem był zapisany plan, a nie wynik ostatniego fetcha.
Nazwa się zmienia, bo komponent nie jest już formularzem generowania.

**Contract**: Stan inicjowany z propsów. Zmiana daty to nawigacja do `/plan?date=…`, nie zmiana
stanu — dzięki temu URL identyfikuje dzień i odświeżenie działa. Każda mutacja (generuj, zapisz
aktywność, akceptuj) wysyła request i zastępuje stan tym, co wróciło z serwera; nie ma optymistycznych
zapisów.

Widoki jednej propozycji: podgląd (tytuł, opis, przycisk Edytuj) i edycja (dwa pola, Zapisz, Anuluj).
Anuluj przywraca wartości sprzed edycji — to jedyny powód, dla którego ten protokół wygrał
z autozapisem, więc musi faktycznie działać.

Akceptacja: przycisk widoczny tylko gdy plan ma aktywności. Stan zaakceptowany oznaczony wizualnie
i tekstem z datą; przy nim możliwość cofnięcia.

Regeneracja na zaakceptowanym planie: potwierdzenie nazywające konsekwencję — stare propozycje
zostaną **usunięte**, a akceptacja cofnięta. Ten klik jest nieodwracalny, bo wybrana retencja usuwa
poprzednią partię. Na planie roboczym potwierdzenie nie jest potrzebne.

Zachować z S-01 bez zmian: `GenerationProgress`, strażnik `inFlight` przed podwójnym wysłaniem,
rozróżnianie `retryable`, obsługę 401 z linkiem do logowania.

#### 3. Copy przestaje kłamać

**File**: `src/components/plan/DayPlanEditor.tsx`, `src/pages/plan.astro`

**Intent**: Usunąć zdanie „Propozycje nie są jeszcze zapisywane — po odświeżeniu strony znikną"
i zastąpić je informacją o stanie planu (roboczy / zaakceptowany). Cały nowy tekst po polsku — NFR.

**Contract**: Nagłówek strony wspomina wybrany dzień. Pusty dzień ma własny stan („Ten dzień nie ma
jeszcze planu").

### Success Criteria:

#### Automated Verification:

- Lint czysty: `npm run lint`
- Kontrola typów bez błędów: `npx astro check`
- Build przechodzi: `npm run build`
- `GET /plan?date=2026-09-14` bez sesji przekierowuje na `/auth/signin` (302)

#### Manual Verification:

- Pełny przepływ: generuj → edytuj → akceptuj → odśwież — stan przeżywa każdy krok
- Zmiana daty na dzień z zapisanym planem pokazuje go w pierwszym renderze, bez migotania
- Zmiana daty na pusty dzień pokazuje formularz generowania
- Anuluj w trybie edycji przywraca poprzedni tekst i nic nie zapisuje
- Regeneracja zaakceptowanego planu pyta o potwierdzenie i nazywa konsekwencje; anulowanie nic nie zmienia
- Wskaźnik postępu zachowuje się jak w S-01 (etapy, licznik sekund, komunikat o ponowieniu)
- Przycisk akceptacji nie pojawia się na dniu bez propozycji
- Cały interfejs po polsku

---

## Testing Strategy

### pgTAP (`npm run test:db`):

Cały ciężar dowodowy tej zmiany. Pokrycie wypisane w Fazie 1: niezgodna generacja odrzucona w obie
strony, atomowość i retencja regeneracji, kasowanie akceptacji przez edycję treści (i **brak**
kasowania przy zmianie `ordinal`), izolacja funkcji między kontami, brak `EXECUTE` dla `anon`.

Zasada odziedziczona po przeglądzie F-01: **nigdy nie przyjmować, że test przechodzi** — zepsuć to,
co rzekomo bada, i potwierdzić czerwień. Sześć z trzynastu asercji F-01 przechodziło jałowo, dopóki
nikt tego nie zrobił.

### Weryfikacja ręczna:

1. Wygeneruj plan na dziś; sprawdź w Studio, że są cztery wiersze (1 plan + 3 aktywności).
2. Odśwież — plan jest.
3. Popraw tytuł pierwszej propozycji, zapisz; odśwież — poprawka jest.
4. Zaakceptuj; odśwież — stan zaakceptowany z datą.
5. Popraw opis — plan wraca do roboczego w tej samej odpowiedzi.
6. Zaakceptuj ponownie, potem generuj ponownie; potwierdź ostrzeżenie. Nowe propozycje, stan roboczy,
   w `activities` trzy wiersze, `current_generation` = 3.
7. Przełącz datę na inny dzień i z powrotem — oba plany niezależne.
8. Zaloguj się na drugie konto; ten sam dzień jest pusty.

### Czego nie testujemy automatycznie:

Maszyna stanów wyspy (roboczy / edycja / zaakceptowany) — brak runnera TS to świadoma decyzja tego
slice'u. To najczęściej dotykany kod tej zmiany i jednocześnie jedyny bez siatki regresyjnej;
odnotowane niżej jako ryzyko.

## Performance Considerations

Skala z PRD jest mała (jeden nauczyciel, ~22 plany miesięcznie, 3 aktywności na plan), więc nic tu
nie jest gorące. Dwie rzeczy warte odnotowania mimo to:

- Zapis partii to jeden round trip do bazy zamiast trzech — funkcja robi upsert, delete i insert
  w jednym wywołaniu.
- Trigger `BEFORE INSERT` wykonuje jedno indeksowane zapytanie po kluczu głównym `day_plans` na każdy
  wstawiany wiersz — trzy na generację. Przy partii ograniczonej do 20 wierszy to nie jest koszt,
  który trzeba optymalizować.
- SSR planu to dwa zapytania (plan + aktywności), oba po indeksowanych kolumnach.

## Migration Notes

**Zaległość z F-01 jest warunkiem wstępnym.** `20260720162247`, `20260720162553` i `20260720163134`
nie były pushowane na hosted project. Bez `20260720162553` granty kolumnowe są szerokie i część
założeń tego planu przestaje obowiązywać zdalnie. `npx supabase db push` przed albo razem z migracją
Fazy 1.

Migracja Fazy 1 jest addytywna — dodaje funkcje, triggery i granty, nie zmienia kolumn ani danych.
Obie tabele są w praktyce puste (nic dotąd nie pisało), więc nowy trigger nie ma czego walidować
wstecz. Wycofanie to `drop trigger` / `drop function` w odwrotnej kolejności.

## References

- Roadmapa, slice S-02 wraz z zobowiązaniami przeniesionymi z F-01: `context/foundation/roadmap.md`
- Źródło zobowiązania (F5, „Residual"): `context/archive/2026-07-18-plan-persistence-baseline/reviews/impl-review.md`
- Kontekst S-01, w tym decyzja o modelu i guardrailu: `context/archive/2026-08-22-first-day-generation/plan.md`
- Reguły: `context/foundation/lessons.md` (#1 górna granica wierszy, #2 właściciel sprzątania,
  #3 bramka jakości promptu)
- Schemat i granty: `supabase/migrations/20260718211452_day_plans_and_activities.sql`,
  `supabase/migrations/20260720162553_narrow_authenticated_update_columns.sql`
- Wzorzec dowodu: `supabase/tests/database/rls_isolation.test.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Kontrakt zapisu w schemacie

#### Automated

- [x] 1.1 Migracje aplikują się od zera: `npx supabase db reset` — 95fa8c7
- [x] 1.2 Cały pakiet pgTAP przechodzi, łącznie z pakietem F-01: `npm run test:db` — 95fa8c7
- [x] 1.3 Typy regenerują się bez błędu: `npx supabase gen types typescript --local` — 95fa8c7
- [x] 1.4 Lint czysty: `npm run lint` — 95fa8c7
- [x] 1.5 Kontrola typów bez błędów: `npx astro check` — 95fa8c7

#### Manual

- [x] 1.6 Każda nowa asercja pgTAP sprawdzona mutacją — 95fa8c7
- [x] 1.7 Trzy zaległe migracje F-01 na hosted project albo świadomie odłożone z zapisaną decyzją — 95fa8c7

### Phase 2: Warstwa dostępu do danych i zapis w trasie generowania

#### Automated

- [x] 2.1 Lint czysty: `npm run lint`
- [x] 2.2 Kontrola typów bez błędów: `npx astro check`
- [x] 2.3 Build przechodzi: `npm run build`
- [x] 2.4 Build bez `SUPABASE_URL` / `SUPABASE_KEY` nadal przechodzi
- [x] 2.5 `POST /api/day-plan/generate` bez sesji odpowiada 401 z `content-type: application/json`

#### Manual

- [ ] 2.6 Generowanie tworzy wiersz w `day_plans` i trzy w `activities`
- [ ] 2.7 Ponowna generacja: `current_generation` = 2, trzy wiersze w `activities`, nie sześć
- [ ] 2.8 Odświeżenie strony po generowaniu nie gubi propozycji
- [ ] 2.9 Symulowana awaria zapisu daje czytelny polski komunikat z ponowieniem

### Phase 3: Trasy edycji i akceptacji

#### Automated

- [ ] 3.1 Lint czysty: `npm run lint`
- [ ] 3.2 Kontrola typów bez błędów: `npx astro check`
- [ ] 3.3 Build przechodzi: `npm run build`
- [ ] 3.4 Obie nowe trasy bez sesji odpowiadają 401 z `content-type: application/json`
- [ ] 3.5 `PATCH` z tytułem dłuższym niż 200 znaków odpowiada 400

#### Manual

- [ ] 3.6 Edycja tytułu zapisuje się i przeżywa odświeżenie
- [ ] 3.7 Edycja zaakceptowanego planu wraca do stanu roboczego w tej samej odpowiedzi
- [ ] 3.8 Akceptacja i cofnięcie akceptacji działają w obie strony
- [ ] 3.9 `PATCH` na aktywność innego konta odpowiada 404 i nic nie modyfikuje

### Phase 4: Ekran planu dnia

#### Automated

- [ ] 4.1 Lint czysty: `npm run lint`
- [ ] 4.2 Kontrola typów bez błędów: `npx astro check`
- [ ] 4.3 Build przechodzi: `npm run build`
- [ ] 4.4 `GET /plan?date=…` bez sesji przekierowuje na `/auth/signin` (302)

#### Manual

- [ ] 4.5 Pełny przepływ generuj → edytuj → akceptuj → odśwież przeżywa każdy krok
- [ ] 4.6 Zmiana daty na dzień z planem pokazuje go w pierwszym renderze
- [ ] 4.7 Zmiana daty na pusty dzień pokazuje formularz generowania
- [ ] 4.8 Anuluj w trybie edycji przywraca poprzedni tekst i nic nie zapisuje
- [ ] 4.9 Regeneracja zaakceptowanego planu pyta o potwierdzenie i nazywa konsekwencje
- [ ] 4.10 Wskaźnik postępu zachowuje się jak w S-01
- [ ] 4.11 Przycisk akceptacji nie pojawia się na dniu bez propozycji
- [ ] 4.12 Cały interfejs po polsku
