# Limit fair use (S-21) — plan implementacji

## Overview

Każde wywołanie modelu (dzień, dzień tygodnia, szkic tygodnia, poprawka aktywności) zostawia wiersz
w nowej księdze `public.generation_ledger`. Zanim trasa zawoła model, rezerwuje wiersz funkcją
`claim_generation`, która w jednej transakcji, pod blokadą doradczą na konto, liczy zużycie w bieżącym
miesiącu kalendarzowym (Europe/Warsaw) i odmawia ponad limit. Po wywołaniu trasa oznacza wiersz
`succeeded` albo `failed`; nieudane nie liczą się do limitu w granicach miesięcznej puli zwrotów.
Ponad limit nauczycielka dostaje 429 z polskim zdaniem podającym dzień powrotu i link
„Napisz do nas” do `/kontakt`. Błąd samej księgi **nie** zatrzymuje generowania (Guardrail 1).

Realizuje FR-027 i FR-038 z `prd-v3.md`, slice `S-21` z `roadmap.md`.

## Current State Analysis

- Cztery trasy wołają model i żadna nie zostawia śladu, który dałoby się policzyć:
  `generate.ts` zapisuje przez `save_day_plan_generation`, ale regeneracja nadpisuje wiersz
  `day_plans` (upsert po `user_id, plan_date`); `week/day.ts`, `week/outline.ts` i `refine.ts`
  zwracają wynik bez zapisu.
- Tydzień to jedno wywołanie `week/outline.ts`, a potem pięć **równoległych** `week/day.ts`
  z wyspy `WeekPlanBoard.tsx:213`. Sprawdzenie i zapis zużycia muszą być jedną operacją w bazie.
- Wszystkie cztery trasy odpowiadają kopertą `{ error, retryable }` z `day-plan-http.ts`; wyspy
  pokazują `body.error` jako tekst (`DayPlanEditor.tsx:629-655`, `WeekDayCard.tsx:152-170`,
  `WeekPlanBoard.tsx:498`). Link do kontaktu wymaga nowego pola.
- Jedyna funkcja `security definer` w produkcie to `delete_own_account` (CLAUDE.md, „the only
  operation above RLS”). Ta zmiana jej nie dokłada.
- `regulamin.md:78` już opisuje limit dokładnie tak, jak go budujemy. `polityka-prywatnosci.md`
  §2.6 obiecuje ≤ 7 dni dla danych bezpieczeństwa w bazie — miesięczna księga się pod to nie
  mieści, potrzebuje własnego punktu.

## Desired End State

- Nauczycielka w typowym miesiącu nie widzi niczego nowego.
- Konto, które w bieżącym miesiącu (Europe/Warsaw) zużyło 150 dni-generacji (albo 300 poprawek),
  przy kolejnej próbie dostaje — w miejscu wyniku — komunikat:
  „Wykorzystano miesięczny limit generowania. Generowanie znów będzie możliwe od 1 listopada.”
  oraz link „Napisz do nas” (`/kontakt`). Wyspa nie pokazuje „Spróbuj ponownie”.
- Pięć równoległych `week/day` przy zużyciu 148/150 przepuszcza dokładnie dwa.
- Gdy `claim_generation` zwraca błąd (baza, brak funkcji po nieudanym `db push`), generowanie idzie
  dalej, a log ma `fair_use.claim_failed`.
- Księga trzyma wiersze 13 miesięcy (pg_cron), znika kaskadą z kontem, a polityka prywatności 1.1
  to opisuje.

Weryfikacja: testy z faz 1–3, ręczny scenariusz z Testing Strategy na lokalnym stosie.

### Key Discoveries:

- Wzorzec insert-only + RLS + cron retencji: `supabase/migrations/20261009120000_contact_messages.sql`.
- Wspólna koperta odpowiedzi i miejsce na nową: `src/lib/services/day-plan-http.ts` (`generationFailure`, `storeFailure`).
- Strefa czasowa produktu: `src/lib/day-plan-dates.ts:28-37` (Europe/Warsaw zakodowane na sztywno, świadomie).
- Odczyt env w runtime: `astro.config.mjs` `env.schema`, `access: "secret"` z tego samego powodu co `LEGACY_HOST`.
- Stub Supabase obsługuje jedno `rpc()` z jedną odpowiedzią: `src/lib/services/__fixtures__/supabase.ts` — trzeba go nauczyć rozróżniać nazwę funkcji.
- Testy pgTAP: `supabase/tests/database/*.test.sql` (`npm run test:db`); trasa + prawdziwy klient: `*.db.test.ts` (`npm run test:db:api`).
- Typy: `npx supabase gen types typescript --local > src/db/database.types.ts`.

## What We're NOT Doing

- Pula zależna od stanu planu (Darmowy 5 dni, okres próbny, Basic) — `S-23`, `S-27`. Model danych to przewiduje (kolumna `plan_date`), ale nic tu jej nie liczy.
- Liczenie dni do miesiąca `plan_date` (reguła FR-031) — `S-27`.
- Widoczny licznik zużycia, cennik w komunikacie — nie przed płatnościami.
- Limit na zakładanie kont (nadużycie przez nowe konta co miesiąc) — Open Questions #7, ryzyko przyjęte.
- Panel administracyjny do zdejmowania limitu konkretnemu kontu — właściciel ma dashboard Supabase i przełącznik `FAIR_USE_MODE`.
- Zmiana bramki bezpieczeństwa treści, promptów, modeli.
- Test E2E komunikatu (decyzja: unit + DB + pgTAP; E2E w CI to Krok 9).

## Implementation Approach

Księga, nie licznik. Wiersz na każde wywołanie modelu (`kind`: `day` | `outline` | `refine`),
ze stanem `reserved → succeeded | failed`. Zużycie w miesiącu liczy się z wierszy, więc nie ma
kolumny, którą nauczycielka mogłaby wyzerować: może tylko dopisywać wiersze do własnej księgi
(co szkodzi wyłącznie jej) i przestawiać `reserved` na `failed` — a to ogranicza pula zwrotów.

**Dlaczego nie `security definer`:** wszystko, co trasa robi tokenem nauczycielki, nauczycielka
może zrobić skryptem przez `/rest/v1/rpc`. Definer nie zamyka żadnej z tych dróg, a łamie
niezmiennik z CLAUDE.md. Granice bierze na siebie schemat: RLS, uprawnienie `update` tylko na
kolumnie `status`, wyzwalacz przejść, pula zwrotów w zapytaniu liczącym.

**Limity z konfiguracji, przekazywane przez serwer.** `claim_generation` przyjmuje limity jako
argumenty. Wywołanie RPC bezpośrednio z zawyżonym limitem tylko dopisuje wiersz — nie wywołuje
modelu, więc niczego nie omija. Odnotowane w komentarzu migracji.

**Fail-open w jednym miejscu.** `src/lib/services/fair-use.ts` łapie każdy błąd księgi, loguje
go i zwraca „dozwolone, bez rezerwacji”. Trasy nie mają własnej obsługi błędów księgi.

## Critical Implementation Details

- **Kolejność w `generate.ts`:** rezerwacja **po** odczycie `readDayPlan` i obu odmowach
  (`only_if_absent`, niezatwierdzona podmiana) — konflikt nie zużywa dnia ani zwrotu — i **przed**
  `generateDayActivities`. Oznaczenie `failed` obejmuje też błąd zapisu (`saveGeneration`), bo
  nauczycielka nie dostała dnia.
- **Konfiguracja nie może wywrócić trasy.** `envField.number` dla sekretu waliduje przy odczycie
  w runtime i rzuca przy złej wartości — to zatrzymałoby generowanie przez literówkę w dashboardzie.
  Dlatego `envField.string`, a parsowanie z domyślnymi i logiem `fair_use.config_invalid`
  w `fair-use.ts`.
- **Szkic tygodnia:** `kind = 'outline'` zużywa 0 dni, ale `claim_generation` odmawia, gdy do
  limitu dni nie zostało ani jednego — nauczycielka jest zatrzymana przy pierwszym kliknięciu,
  a nie po czekaniu na tematy.
- **Oznaczenie wyniku nie blokuje odpowiedzi** dłużej niż jeden round-trip i jego błąd jest tylko
  logowany (`fair_use.finish_failed`) — wiersz zostaje `reserved` i liczy się jak sukces (błąd
  w stronę liczenia).

## Phase 1: Księga w bazie

### Overview

Tabela, funkcja rezerwacji, wyzwalacz przejść, retencja, typy i testy pgTAP. Po tej fazie
księga działa w bazie; nic jej jeszcze nie woła.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/20261017150000_generation_ledger.sql`

**Intent**: Trwały, odporny na równoległość zapis każdego wywołania modelu i jedno miejsce, które
decyduje, czy konto zmieści się w limicie. Nagłówek w stylu `contact_messages.sql` (purpose,
affected, special considerations, rollback z `cron.unschedule`).

**Contract**:

- `public.generation_ledger`: `id uuid pk default gen_random_uuid()`,
  `user_id uuid not null default auth.uid() references auth.users on delete cascade`,
  `kind text not null check (kind in ('day','outline','refine'))`,
  `plan_date date null` (dzień, którego dotyczy generowanie; pod `S-27`),
  `status text not null default 'reserved' check (status in ('reserved','succeeded','failed'))`,
  `created_at timestamptz not null default now()`, `finished_at timestamptz null`.
  Indeks `(user_id, created_at)`.
- Uprawnienia: `revoke all … from anon, authenticated`; `grant select, insert on … to authenticated`;
  `grant update (status) on … to authenticated`. Brak `delete`. RLS włączone; polityki per
  operacja: select własnych, insert z `with check (user_id = auth.uid() and status = 'reserved')`,
  update własnych.
- Wyzwalacz `before update`: przepuszcza wyłącznie `reserved → succeeded|failed`, ustawia
  `finished_at = now()`; każda inna zmiana (w tym `user_id`, `kind`, `created_at` przez
  bezpośredni update) rzuca wyjątek z własnym kodem SQLSTATE.
- `public.claim_generation(p_kind text, p_plan_date date, p_day_limit int, p_refine_limit int, p_refund_allowance int, p_enforce boolean default true)`
  `returns table (ledger_id uuid, allowed boolean, resets_on date)`, `security invoker`,
  `set search_path = ''`:
  1. `pg_advisory_xact_lock` na kluczu z `auth.uid()` (np. `hashtextextended('generation_ledger:' || auth.uid()::text, 0)`).
  2. Początek miesiąca = `date_trunc('month', now() at time zone 'Europe/Warsaw')`; `resets_on` = pierwszy dzień następnego miesiąca.
  3. Zużycie rodziny (`day` dla `day`/`outline`, `refine` dla `refine`) = wiersze nie-`failed`
     + `greatest(0, failed - p_refund_allowance)`. Pula zwrotów liczona osobno dla każdej rodziny.
  4. `day`/`refine`: dozwolone, gdy zużycie + 1 ≤ limit; `outline`: dozwolone, gdy zużycie dni + 1 ≤ limit dni.
  5. Dozwolone → insert wiersza `reserved`, zwrot jego `id` i `allowed = true`; niedozwolone przy `p_enforce` → `ledger_id = null`, `allowed = false`, nic nie zapisuje; niedozwolone bez `p_enforce` (tryb `observe`) → insert wiersza, `allowed = false`, `ledger_id` niepusty.
  Wywołanie bez sesji (`auth.uid()` null) rzuca wyjątek.
- `grant execute … to authenticated`, `revoke … from public, anon`.
- Retencja: `cron.schedule('generation-ledger-retention', …, 'delete … where created_at < now() - interval ''13 months''')`.
- Komentarz w migracji: limity są argumentami, bo bezpośrednie RPC z zawyżonym limitem nie woła modelu; pula zwrotów to granica dla skryptu przestawiającego własne wiersze na `failed`.

#### 2. Typy

**File**: `src/db/database.types.ts`

**Intent**: Regeneracja po migracji, żeby `supabase.rpc("claim_generation")` i `from("generation_ledger")` były typowane.

**Contract**: wyjście `npx supabase gen types typescript --local`.

#### 3. Testy pgTAP

**File**: `supabase/tests/database/generation_ledger.test.sql`

**Intent**: Dowód niezmienników w samej bazie, wzorem `contact_messages.test.sql` i `rls_isolation.test.sql`.

**Contract**: przypadki — dozwolone poniżej limitu i odmowa na limicie (`ledger_id` null, brak nowego wiersza); `outline` przy 0 pozostałych dniach odmawia, przy 1 przechodzi i nie zużywa dnia; `failed` nie liczy się do wysokości puli zwrotów, ponad pulą liczy się; rodziny `day` i `refine` liczą się osobno; wiersze z poprzedniego miesiąca (wstawione z `created_at` w przeszłości jako superuser) się nie liczą; `resets_on` = 1. dzień następnego miesiąca; wyzwalacz odrzuca `succeeded → failed`, `failed → reserved`, zmianę `user_id`; nauczyciel B nie widzi ani nie zmienia wierszy A; `delete` jest odrzucony; usunięcie konta kasuje wiersze; job `generation-ledger-retention` istnieje.

### Success Criteria:

#### Automated Verification:

- Migracja aplikuje się na czysto: `npx supabase db reset`
- Testy pgTAP przechodzą: `npm run test:db`
- Typy regenerują się, a `git diff --stat src/db/database.types.ts` pokazuje zmianę: `npx supabase gen types typescript --local > src/db/database.types.ts`
- Lint przechodzi: `npm run lint`

#### Manual Verification:

- W Studio lokalnym tabela ma RLS włączone, a polityki są per operacja (select / insert / update), bez `delete`

**Implementation Note**: Po zielonej automatyce poczekaj na potwierdzenie ręcznej weryfikacji, zanim przejdziesz dalej.

---

## Phase 2: Serwis i konfiguracja

### Overview

Jedno miejsce w kodzie aplikacji, które rozmawia z księgą, czyta konfigurację i robi fail-open;
nowa odpowiedź 429 w kopercie; predykat dla wysp.

### Changes Required:

#### 1. Konfiguracja

**File**: `astro.config.mjs`, `.env.example`

**Intent**: Próg w konfiguracji, nie w kodzie (decyzja 2026-10-17), zmienialny bez deployu.

**Contract**: cztery `envField.string({ context: "server", access: "secret", optional: true })` z komentarzem w stylu sąsiednich: `FAIR_USE_DAYS_PER_MONTH` (domyślnie 150), `FAIR_USE_REFINES_PER_MONTH` (300), `FAIR_USE_REFUNDS_PER_MONTH` (30), `FAIR_USE_MODE` (`enforce` | `observe`, domyślnie `enforce`; `observe` rezerwuje i loguje, ale nigdy nie odmawia). Nazwy w `.env.example` bez wartości.

#### 2. Serwis

**File**: `src/lib/services/fair-use.ts`

**Intent**: Rezerwacja i oznaczenie wyniku z gwarancją, że żaden błąd księgi ani konfiguracji nie wyjdzie do trasy.

**Contract**:

- `claimGeneration(supabase, kind: "day" | "outline" | "refine", planDate?: string): Promise<FairUseClaim>`, gdzie
  `FairUseClaim = { allowed: true; ledgerId: string | null } | { allowed: false; resetsOn: string }`.
  `ledgerId: null` = fail-open (błąd RPC, wyjątek, pusta odpowiedź) — logowane jako `fair_use.claim_failed` z `kind` i kodem błędu. Odmowa logowana jako `fair_use.limit_reached` (dane do kalibracji). Tryb `observe` przekazuje `p_enforce = false`; funkcja zapisuje wtedy wiersz także ponad limitem i zwraca `allowed = false` z niepustym `ledger_id` — serwis zamienia to w `{ allowed: true, ledgerId }` z logiem `fair_use.would_limit`.
- `finishGeneration(supabase, ledgerId: string | null, outcome: "succeeded" | "failed"): Promise<void>` — `null` nic nie robi; błąd logowany jako `fair_use.finish_failed`, nigdy nie rzucany. Wykonuje `update generation_ledger set status = … where id = …` (RLS i wyzwalacz robią resztę).
- Parsowanie konfiguracji przy każdym wywołaniu (bez stanu modułu — Worker i tak nie gwarantuje jego trwałości): liczba całkowita ≥ 1, inaczej domyślna i log `fair_use.config_invalid` z nazwą zmiennej. Pusta/nieustawiona wartość to domyślna bez logu.
- Logi w stylu `day-plan-http.ts` (`console.error` z obiektem pól, eslint-disable).

#### 3. Odpowiedź 429

**File**: `src/lib/services/day-plan-http.ts`

**Intent**: Komunikat FR-027 w tej samej kopercie co reszta, z polem, z którego wyspa zrobi link.

**Contract**: `fairUseExceeded(resetsOn: string): Response` → status `429`, body `{ error, retryable: false, limit: { resets_on } }`. `error`: „Wykorzystano miesięczny limit generowania. Generowanie znów będzie możliwe od {d MMMM}.” — data sformatowana `Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", timeZone: "Europe/Warsaw" })` (dopełniacz: „1 listopada”). Bez „Napisz do nas” w zdaniu — link dokłada wyspa. Typ `DayPlanErrorBody` zyskuje opcjonalne `limit?: { resets_on: string }` (addytywnie, jak `acceptance_cleared`).

#### 4. Predykat dla wysp

**File**: `src/lib/day-plan-guards.ts`

**Intent**: Wyspy rozpoznają odpowiedź limitu bez zoda.

**Contract**: `isLimitBody(body: unknown): body is { error: string; retryable: false; limit: { resets_on: string } }`. Ścieżka `/kontakt` wpisana w miejscu użycia, jak w `AccountMenu.tsx:96` i `LegalLayout.astro:81` — projekt nie ma na nią stałej i ta zmiana jej nie wprowadza.

#### 5. Testy jednostkowe

**File**: `src/lib/services/fair-use.test.ts`, `src/lib/services/day-plan-http.test.ts` (nowy lub istniejący), `src/lib/day-plan-guards.test.ts`

**Contract**: fail-open przy błędzie RPC i przy wyjątku; odmowa → `allowed: false` z `resetsOn`; tryb `observe` nigdy nie odmawia; zła wartość konfiguracji → domyślna; `finishGeneration(null, …)` nie woła RPC; błąd `finish` nie rzuca; `fairUseExceeded("2026-11-01")` → 429 i „od 1 listopada”; `isLimitBody` odrzuca brak `limit`, `limit` bez `resets_on` i zwykłą kopertę błędu.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe przechodzą: `npm test`
- Lint i typy przechodzą: `npm run lint`
- Build przechodzi: `npm run build`

#### Manual Verification:

- Treść komunikatu przeczytana po polsku na głos brzmi naturalnie (dopełniacz miesiąca, bez anglicyzmów)

**Implementation Note**: Po zielonej automatyce poczekaj na potwierdzenie ręcznej weryfikacji.

---

## Phase 3: Cztery trasy

### Overview

Rezerwacja przed modelem i oznaczenie wyniku po nim w `generate.ts`, `week/day.ts`,
`week/outline.ts`, `refine.ts`; testy tras i test równoległości na prawdziwej bazie.

### Changes Required:

#### 1. Trasy

**File**: `src/pages/api/day-plan/generate.ts`, `src/pages/api/day-plan/week/day.ts`, `src/pages/api/day-plan/week/outline.ts`, `src/pages/api/day-plan/refine.ts`

**Intent**: Każde wywołanie modelu przechodzi przez księgę; ponad limit trasa odpowiada `fairUseExceeded`, zanim zapłaci za model.

**Contract**: po walidacji i sprawdzeniu `supabase` (w `generate.ts` — także po odczycie istniejącego planu i obu odmowach): `claimGeneration(supabase, kind, plan_date)`; `allowed: false` → `fairUseExceeded(resetsOn)`. Po modelu: sukces → `finishGeneration(…, "succeeded")`, każdy błąd modelu (a w `generate.ts` także zapisu) → `"failed"`, potem dotychczasowa odpowiedź. `kind`: `generate`/`week/day` → `day`, `outline` → `outline` (bez `plan_date`), `refine` → `refine`. `week/day.ts`, `outline.ts` i `refine.ts` sprawdzają dziś `context.locals.supabase` bez przypisania — przypisz go do `const supabase` jak w `generate.ts` (na tym opiera się bramka 3.3). Komentarz trasy dopisuje jedno zdanie o księdze w stylu istniejących.

#### 2. Stub Supabase

**File**: `src/lib/services/__fixtures__/supabase.ts`

**Intent**: Testy tras rozróżniają `claim_generation` od `save_day_plan_generation`.

**Contract**: `rpc(name, args)` odpowiada per nazwa; nowe opcje stubu: wynik claimu (dozwolone / odmowa z datą / błąd) i rejestr wywołań oraz update'ów `generation_ledger`, żeby test mógł sprawdzić oznaczenie. Domyślnie claim dozwolony — istniejące testy przechodzą bez zmian.

#### 3. Testy tras

**File**: `generate.test.ts`, `refine.test.ts`, `week/day.test.ts`, nowy `week/outline.test.ts`

**Contract**: dla każdej trasy — odmowa → 429 z `limit.resets_on` i **model nie wywołany**; błąd claimu → generowanie idzie dalej (fail-open); sukces → `succeeded`; błąd modelu → `failed`. `generate.ts`: konflikt (`only_if_absent`, niezatwierdzona podmiana) nie wywołuje claimu; błąd zapisu → `failed`.

#### 4. Test równoległości i izolacji na prawdziwej bazie

**File**: `src/pages/api/day-plan/week/day.db.test.ts` (nowy)

**Intent**: Ryzyko kamienia (równoległe `week/day`) sprawdzone tam, gdzie żyje.

**Contract**: dwa nowe helpery w `src/lib/services/__fixtures__/supabase-local.ts` obok `deleteContactMessages` i tą samą drogą administracyjną: `seedLedger(userId, count, kind)` i `deleteLedgerRows(userId)` (w `afterEach`). Nauczyciel A z 148 wierszami `day` w tym miesiącu → pięć równoległych `claim_generation` z limitem 150 → dokładnie dwa `ledger_id` niepuste i 150 wierszy po teście; nauczyciel B w tym czasie dostaje `allowed`. Model mockowany — test dotyczy księgi, nie OpenRouter.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe tras przechodzą: `npm test`
- Testy na prawdziwej bazie przechodzą: `npm run test:db:api`
- Każda z czterech tras woła claim — bramka na wywołaniu, nie na nazwie: `grep -c "claimGeneration(supabase" src/pages/api/day-plan/generate.ts src/pages/api/day-plan/refine.ts src/pages/api/day-plan/week/day.ts src/pages/api/day-plan/week/outline.ts` zwraca 1 dla każdego pliku (sprawdź na stanie przed fazą — musi dać 0)
- Lint i build: `npm run lint && npm run build`

#### Manual Verification:

- Lokalnie, z `FAIR_USE_DAYS_PER_MONTH=2` w `.dev.vars`: trzeci dzień w edytorze dnia dostaje komunikat zamiast propozycji
- Lokalnie, z wyłączoną funkcją (`drop function public.claim_generation` w Studio): generowanie działa, w logu `fair_use.claim_failed`; potem `npx supabase db reset`

**Implementation Note**: Po zielonej automatyce poczekaj na potwierdzenie ręcznej weryfikacji.

---

## Phase 4: Wyspy

### Overview

Link „Napisz do nas” obok komunikatu limitu w edytorze dnia, na karcie dnia tygodnia
i przy nieudanym szkicu tygodnia.

### Changes Required:

#### 1. Edytor dnia

**File**: `src/components/plan/DayPlanEditor.tsx`

**Intent**: Przy odpowiedzi limitu (`isLimitBody`) w bloku `role="alert"` pojawia się link do kontaktu w miejscu przycisku ponowienia; dotyczy generowania i poprawki aktywności.

**Contract**: stan porażki zyskuje flagę `contactSuggested` (nazwa do decyzji implementacji), ustawianą z `isLimitBody`; link `<a>` w stylu istniejącego „Zaloguj się ponownie”, min. 44 px wysokości.

#### 2. Tydzień

**File**: `src/components/plan/WeekPlanBoard.tsx`, `src/components/plan/WeekDayCard.tsx`

**Intent**: To samo dla dnia tygodnia, który dostał 429, i dla porażki szkicu tygodnia. Przy pięciu równoległych dniach część może przejść, część dostać limit — każda karta mówi o sobie.

**Contract**: `DayState` zyskuje tę samą flagę; karta renderuje link przy `status: "failed"` z flagą. Komunikat porażki szkicu (`WeekPlanBoard.tsx:~498`) — tak samo.

### Success Criteria:

#### Automated Verification:

- Lint, typy, build: `npm run lint && npm run build`
- Testy jednostkowe nadal przechodzą: `npm test`

#### Manual Verification:

- Z `FAIR_USE_DAYS_PER_MONTH=3`: generowanie tygodnia daje 3 dni gotowe i 2 karty z komunikatem i linkiem, bez „Spróbuj ponownie”
- Z limitem już wyczerpanym: kliknięcie „Generuj tydzień” zatrzymuje się na szkicu z komunikatem i linkiem
- Poprawka aktywności przy `FAIR_USE_REFINES_PER_MONTH=1`: druga poprawka dostaje komunikat z linkiem
- Link prowadzi na `/kontakt`; widok mobilny (390 px) nie łamie układu

**Implementation Note**: Po zielonej automatyce poczekaj na potwierdzenie ręcznej weryfikacji.

---

## Phase 5: Dokumenty i prawo

### Overview

Polityka prywatności opisuje księgę; CLAUDE.md niesie kontrakt; roadmapa zna stan.

### Changes Required:

#### 1. Polityka prywatności

**File**: `src/content/legal/polityka-prywatnosci.md`, `src/lib/legal.ts`

**Intent**: Księga to nowe dane per konto z retencją 13 miesięcy — §2.6 (≤ 7 dni) jej nie obejmuje.

**Contract**: nowy punkt (np. „2.7. Limit generowania”, z przesunięciem numeracji i odsyłaczy) — Dane: identyfikator Konta, rodzaj generowania, data planowanego dnia, czas i wynik; bez treści hasła i propozycji. Cel: limit chroniący przed nadużyciem (Regulamin § 7 ust. 4) i ustalenie jego wysokości. Podstawa: art. 6 ust. 1 lit. f RODO. Jak długo: 13 miesięcy, usuwane automatycznie; z Kontem od razu. §8: bez nowej pozycji (kaskada) — upewnij się, że lista „co zostaje” nadal jest prawdziwa. `PRIVACY_VERSION = "1.1"`, `PRIVACY_PUBLISHED_ON` = dzień scalenia.

#### 2. CLAUDE.md

**File**: `CLAUDE.md`

**Intent**: Następny slice (`S-23`, `S-27`) i każda nowa trasa wołająca model muszą znać kontrakt.

**Contract**: krótka sekcja „Fair use” w Architecture: każda trasa wołająca model przechodzi przez `claimGeneration`/`finishGeneration`; księga insert-only + update(status), bez `security definer` (i dlaczego); fail-open; `FAIR_USE_*` w konfiguracji; migracja musi trafić na hostowany projekt (`npx supabase db push`) razem ze scaleniem — inaczej limit milczy (fail-open), a nie psuje generowania.

#### 3. Roadmapa

**File**: `context/foundation/roadmap.md`

**Intent**: `S-21` → `in progress` przy starcie, `done` przy zamknięciu; „Sufit poprawek aktywności” rozstrzygnięty (300, w konfiguracji).

**Contract**: tylko wiersz `S-21` w tabeli i blok `### S-21`.

### Success Criteria:

#### Automated Verification:

- Testy stron prawnych przechodzą: `npm test -- legal`
- Build: `npm run build`
- Zmiana roadmapy nie wyszła poza `S-21` (odporne na przerównanie): `git diff -w master..HEAD -- context/foundation/roadmap.md | grep '^[-+]|' | grep -v 'S-21'` jest puste

#### Manual Verification:

- `/polityka-prywatnosci` pokazuje wersję 1.1 i nowy punkt; odsyłacze w tekście wskazują właściwe numery
- Po scaleniu: `npx supabase db push` wykonany, a na produkcji jedno generowanie zostawia wiersz w `generation_ledger` (dashboard)

**Implementation Note**: Po zielonej automatyce poczekaj na potwierdzenie ręcznej weryfikacji.

---

## Testing Strategy

### Unit Tests:

- `fair-use.ts`: fail-open (błąd RPC, wyjątek), odmowa, tryb `observe`, zła konfiguracja, `finish` z `null` i z błędem.
- `day-plan-http.ts`: 429, kształt body, polski dopełniacz miesiąca, także dla grudnia → „1 stycznia”.
- `day-plan-guards.ts`: `isLimitBody`.
- Cztery trasy: odmowa nie woła modelu, fail-open, oznaczenie wyniku; `generate.ts` — konflikt nie rezerwuje.

### Integration Tests:

- pgTAP: limity, rodziny, pula zwrotów, miesiąc, przejścia, RLS, kaskada, job retencji.
- `week/day.db.test.ts`: pięć równoległych rezerwacji przy 148/150 → dokładnie dwie; izolacja kont.

### Manual Testing Steps:

1. `.dev.vars`: `FAIR_USE_DAYS_PER_MONTH=3`; wygeneruj tydzień → 3 dni, 2 karty z linkiem.
2. Wygeneruj dzień w edytorze → komunikat „od 1 {następnego miesiąca}” i link.
3. `FAIR_USE_MODE=observe` → generowanie działa, log `fair_use.would_limit`.
4. `drop function public.claim_generation` → generowanie działa, log `fair_use.claim_failed`; `db reset`.
5. Usuń wartości z `.dev.vars` → zwykły miesiąc niczego nie pokazuje.

## Performance Considerations

Jeden dodatkowy round-trip PostgREST przed modelem i jeden po — pomijalne wobec 10–30 s generowania. Blokada doradcza szereguje wyłącznie wywołania jednego konta. Zapytanie liczące korzysta z indeksu `(user_id, created_at)`; przy 150 + 300 wierszach na miesiąc to setki wierszy na konto.

## Migration Notes

- Obecne konta: księga startuje pusta, nic nie liczy się wstecz (PRD §Constraints „Migracja danych”).
- **Migracja musi trafić na hostowany projekt razem ze scaleniem** (`npx supabase db push`). Bez niej trasy działają (fail-open), a limit milczy — log `fair_use.claim_failed` na każdym generowaniu jest sygnałem.
- Rollback: `select cron.unschedule('generation-ledger-retention');`, potem `drop function public.claim_generation`, `drop table public.generation_ledger` — kod tras przeżyje to dzięki fail-open.
- Retencja ma właściciela: job `generation-ledger-retention` w tej migracji (reguła z `lessons.md`).

## References

- PRD: `context/foundation/prd-v3.md` FR-027, FR-037, FR-038, Guardrail 1, §Business Logic Changes, Open Questions #3
- Roadmapa: `context/foundation/roadmap.md` `### S-21`
- Monetyzacja: `context/foundation/monetization.md` §4.3, decyzje #10, #13
- Wzorzec tabeli insert-only i retencji: `supabase/migrations/20261009120000_contact_messages.sql`
- Koperta odpowiedzi: `src/lib/services/day-plan-http.ts`
- Regulamin o limicie: `src/content/legal/regulamin.md:78`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Księga w bazie

#### Automated

- [x] 1.1 Migracja aplikuje się na czysto: `npx supabase db reset` — 595a9ca
- [x] 1.2 Testy pgTAP przechodzą: `npm run test:db` — 595a9ca
- [x] 1.3 Typy regenerują się, a `git diff --stat src/db/database.types.ts` pokazuje zmianę — 595a9ca
- [x] 1.4 Lint przechodzi: `npm run lint` — 595a9ca

#### Manual

- [ ] 1.5 W Studio tabela ma RLS i polityki per operacja, bez `delete`

### Phase 2: Serwis i konfiguracja

#### Automated

- [x] 2.1 Testy jednostkowe przechodzą: `npm test`
- [x] 2.2 Lint i typy przechodzą: `npm run lint`
- [x] 2.3 Build przechodzi: `npm run build`

#### Manual

- [ ] 2.4 Treść komunikatu brzmi naturalnie po polsku

### Phase 3: Cztery trasy

#### Automated

- [ ] 3.1 Testy jednostkowe tras przechodzą: `npm test`
- [ ] 3.2 Testy na prawdziwej bazie przechodzą: `npm run test:db:api`
- [ ] 3.3 Każda z czterech tras woła `claimGeneration(supabase` dokładnie raz (bramka sprawdzona na stanie przed fazą)
- [ ] 3.4 Lint i build: `npm run lint && npm run build`

#### Manual

- [ ] 3.5 Z `FAIR_USE_DAYS_PER_MONTH=2` trzeci dzień dostaje komunikat
- [ ] 3.6 Bez funkcji `claim_generation` generowanie działa, log `fair_use.claim_failed`

### Phase 4: Wyspy

#### Automated

- [ ] 4.1 Lint, typy, build: `npm run lint && npm run build`
- [ ] 4.2 Testy jednostkowe nadal przechodzą: `npm test`

#### Manual

- [ ] 4.3 Tydzień przy limicie 3: 3 dni gotowe, 2 karty z komunikatem i linkiem
- [ ] 4.4 Wyczerpany limit zatrzymuje generowanie tygodnia na szkicu z linkiem
- [ ] 4.5 Druga poprawka przy `FAIR_USE_REFINES_PER_MONTH=1` dostaje komunikat z linkiem
- [ ] 4.6 Link prowadzi na `/kontakt`; widok 390 px bez złamań

### Phase 5: Dokumenty i prawo

#### Automated

- [ ] 5.1 Testy stron prawnych przechodzą: `npm test -- legal`
- [ ] 5.2 Build: `npm run build`
- [ ] 5.3 Zmiana roadmapy nie wyszła poza `S-21` (`git diff -w master..HEAD`)

#### Manual

- [ ] 5.4 `/polityka-prywatnosci` pokazuje 1.1 i nowy punkt z poprawnymi odsyłaczami
- [ ] 5.5 Po scaleniu `db push` wykonany, a generowanie na produkcji zostawia wiersz w księdze
