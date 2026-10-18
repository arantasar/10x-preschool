# Okres próbny i stan planu konta (S-23) — plan implementacji

## Overview

Każde konto założone od wejścia tego slice'u dostaje przy rejestracji wiersz uprawnienia w modelu
„plan + dostęp do daty”: `plan = 'basic'`, `access_until` = dzień rejestracji (Europe/Warsaw)
+ 1 miesiąc, włącznie, `source = 'trial'`. Wiersz zakłada wyzwalacz na `auth.users`, który zostaje
`security invoker` — jedynym definerem w produkcie pozostaje `delete_own_account`. Nauczycielka
widzi w `/ustawienia`, w karcie „Konto”, do kiedy ma pełny dostęp — tylko do odczytu i słowami
prawdziwymi dziś, bo płatności nie istnieją, a Regulamin mówi, że Temio jest bezpłatne.

Realizuje `S-23` z `roadmap.md` (FR-030; PRD v3 §Business Logic „Druga reguła”, §Access Control
„Stan planu konta — kto go zmienia”). Na tym modelu stoją `S-24`…`S-27`: płatności przesuwają tę
samą datę, `S-24` zakłada wiersze kontom sprzed płatności, `S-27` wpina stan planu w
`claim_generation` jako źródło limitu nr 2.

## Current State Analysis

- Konto nie ma dziś żadnego stanu planu. Limit generowania pochodzi z nadpisania konta
  (`public.fair_use_overrides`, S-28) albo z konfiguracji `FAIR_USE_*`; w `claim_generation`
  (`supabase/migrations/20261018120000_fair_use_overrides.sql`) czeka zarezerwowane miejsce
  „2. (from S-23) the account's plan”.
- Przed `S-27` okres próbny, Basic i stan po wygaśnięciu znaczą w praktyce to samo: fair use
  z konfiguracji. Wpięcie planu w limit niczego by dziś nie zmieniło.
- Regulamin (`src/content/legal/regulamin.md`): „Temio jest bezpłatne”, § 3 ust. 2 „Wszystkie usługi
  … są nieodpłatne”; FAQ (`src/lib/faq.ts`) nie mówi o cenach, dopóki ich nie ma. Karta nie może
  więc mówić „Basic”, „okres próbny” ani „potem plan darmowy”.
- Konta sprzed slice'u (w tym testerki) mają `created_at` sprzed ponad miesiąca. Pokazanie im
  czegokolwiek o planie wyprzedziłoby uprzedzenie z `S-24` — dokładnie to, czego roadmapa zabrania.
- Rejestracja: `src/pages/api/auth/signup.ts` woła `supabase.auth.signUp`; GoTrue wstawia wiersz
  `auth.users` jako rola `supabase_auth_admin`, która **nie ma** uprawnień do schematu `public`
  (dokumentacja Supabase, Auth Hooks). Błąd wyzwalacza wraca z `signUp` jako błąd i trasa
  przekierowuje z kodem (fallback `connection_failed`) — istniejąca ścieżka.
- Fikstury pgTAP wstawiają konta do `auth.users` jako `postgres`; po tym slice'ie wyzwalacz
  zadziała także w nich (nieszkodliwe — żaden istniejący test nie liczy wierszy nowej tabeli).
- Warstwa `*.db.test.ts` (`vitest.db.config.ts`) zakłada konta przez `service.auth.admin.createUser`
  (`src/lib/services/__fixtures__/supabase-local.ts:147`) — czyli prawdziwą drogą GoTrue.
- Polityka prywatności 1.2, pkt 2.1 „Konto i logowanie” wylicza dane konta; nie zna daty dostępu.

## Desired End State

- Konto założone po wdrożeniu ma dokładnie jeden wiersz `public.account_entitlements` z
  `access_until` = dzień rejestracji w Warszawie + 1 miesiąc (17.10 → 17.11; 31.01 → 28/29.02).
- Rejestracja, której wyzwalacz nie zapisze wiersza, nie dochodzi do skutku — nie istnieje konto
  bez uprawnienia założone po wdrożeniu.
- Nauczycielka czyta wyłącznie własny wiersz i nie może żadnego wstawić, zmienić ani usunąć;
  `anon` nie czyta nic. Wiersz znika z kontem (kaskada).
- `/ustawienia` pokazuje w karcie „Konto” wiersz „Pełny dostęp — do 17 listopada 2026” z
  dopiskiem „Wszystkie funkcje Temio są dziś bezpłatne.” — tylko gdy wiersz istnieje i
  `access_until` ≥ dziś (Warszawa). Bez wiersza, po dacie albo przy błędzie odczytu karta wygląda
  jak dziś.
- Konta sprzed wdrożenia nie mają wiersza i nie widzą zmiany. Testerki dostają wiersz ręcznie
  (`access_until = 2027-01-31`, `source = 'owner'`) w SQL Editorze.
- `claim_generation`, `fair-use.ts` i trasy są bez zmian.
- Polityka prywatności 1.3 wymienia datę dostępu w pkt 2.1.

### Key Discoveries:

- Wzorzec tabeli read-only dla API z jedną polityką `select`: `20261018120000_fair_use_overrides.sql`
  (`revoke all … from anon, authenticated; grant select … to authenticated`).
- Konwencja daty: `date` w Europe/Warsaw, włącznie — `fair_use_overrides.valid_until`; to samo
  liczenie „dziś” w SQL: `(now() at time zone 'Europe/Warsaw')::date`, w TS: `todayIsoDate()`
  (`src/lib/day-plan-dates.ts:34`).
- Uprawnienia dla `supabase_auth_admin`: `grant usage on schema public`, jawne granty na tabelę,
  bez `security definer` (dokumentacja Supabase, Auth Hooks — Context7 `/supabase/supabase`).
- Kaskada z kontem i jej test: `supabase/tests/database/delete_own_account.test.sql`.
- Wiersz w karcie „Konto”: istniejący blok `bg-owies` z e-mailem w `src/pages/ustawienia.astro`.

## What We're NOT Doing

- Żadnej zmiany `claim_generation` ani limitów — stan planu jako źródło limitu wpina `S-27`.
- Żadnego backfillu kont sprzed wdrożenia — wiersze i prezent to `S-24` (#5 otwarte).
  Do tego czasu „brak wiersza” znaczy „konto sprzed płatności”, **nie** „plan darmowy”.
- Żadnego słowa „Basic”, „okres próbny”, „plan darmowy”, „bez limitu” ani ceny w produkcie — to
  zmienia `S-22`/`S-25`, kiedy stanie się prawdą. Bez zmian w Regulaminie i FAQ.
- Żadnej ścieżki zapisu uprawnienia z aplikacji ani panelu — tylko wyzwalacz i SQL Editor.
- Żadnego crona wygasania: wiersz trwa (płatności `S-25`/`S-26` będą przesuwać jego datę), znika
  z kontem.
- Żadnego komunikatu o końcu dostępu — po dacie karta znika; co dalej, mówi `S-24`/`S-27`.
- Żadnych danych konkretnych osób (testerek, właściciela) w repozytorium — jest publiczne.
- Żadnego wskazania stanu w `AccountMenu` ani w nagłówku.

## Implementation Approach

Najpierw baza: tabela, RLS, wyzwalacz i dowód w pgTAP oraz w teście przez GoTrue — bo ryzyko
slice'u to zablokowana rejestracja albo uprawnienie, które nauczycielka mogłaby sobie nadać.
Potem odczyt i karta: czysta funkcja decydująca o widoczności (testowana jednostkowo) i cienki
odczyt przez klienta nauczycielki, z zasadą „błąd = brak karty + log”. Na końcu dokumenty i
uruchomienie: polityka prywatności, CLAUDE.md, `db push` razem z merge'em, wiersze testerek.

## Critical Implementation Details

- **Kolejność wdrożenia:** migracja musi trafić na hostowany projekt (`npx supabase db push`)
  razem z merge'em. Bez niej aplikacja działa (odczyt zwraca błąd → brak karty), a rejestracja
  dalej działa, tylko bez wiersza — konta założone w tym oknie trzeba będzie uzupełnić ręcznie.
  Odwrotnie (migracja przed merge'em) jest bezpieczne. Po pushu: jedna próbna rejestracja na
  produkcji, bo błąd uprawnień wyzwalacza blokuje **każdą** rejestrację.
- **Rola wyzwalacza:** funkcja `security invoker` działa jako `supabase_auth_admin`. Potrzebuje
  `usage` na `public`, `insert` na tabeli i polityki `for insert to supabase_auth_admin` (RLS jest
  włączone, a rola nie omija RLS). `set search_path = ''` i pełne nazwy. pgTAP musi wstawić konto
  **jako `supabase_auth_admin`** (`set local role`), inaczej test przejdzie jako `postgres` i niczego
  nie dowiedzie — to bramka, która musi umieć nie przejść (lessons.md).

## Phase 1: Uprawnienie w bazie

### Overview

Tabela `public.account_entitlements`, wyzwalacz zakładający okres próbny przy rejestracji, testy
izolacji i ścieżki rejestracji, regenerowane typy.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/20261018140000_account_entitlements.sql`

**Intent**: Wprowadzić jedyny model uprawnienia konta („plan + dostęp do daty”) i założyć okres
próbny każdemu nowemu kontu, bez definera i bez ścieżki zapisu dla nauczycielki.

**Contract**:
- Tabela: `user_id uuid primary key references auth.users(id) on delete cascade`,
  `plan text not null check (plan in ('basic'))`, `access_until date not null`,
  `source text not null check (source in ('trial', 'owner'))` (`S-25`/`S-26` rozszerzą listę),
  `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`.
  Komentarze na tabeli i kolumnach: `access_until` włącznie, Europe/Warsaw; brak wiersza = konto
  sprzed płatności (do `S-24`); zapis wyłącznie wyzwalaczem i w SQL Editorze.
- RLS włączone; `revoke all … from anon, authenticated`; `grant select … to authenticated`;
  polityka `select to authenticated using (user_id = (select auth.uid()))`.
- `grant usage on schema public to supabase_auth_admin`; `grant insert on … to supabase_auth_admin`;
  polityka `for insert to supabase_auth_admin with check (true)`.
- Funkcja `public.start_trial_entitlement()` — `returns trigger`, `security invoker`,
  `set search_path = ''`; jedno `insert` z `access_until =
  ((new.created_at at time zone 'Europe/Warsaw')::date + interval '1 month')::date`,
  `source = 'trial'`, bez łapania wyjątków. `revoke execute … from public, anon, authenticated`.
- Wyzwalacz `on_auth_user_created_start_trial` `after insert on auth.users for each row`.
- Nagłówek migracji jak w `20261018120000`: cel, niezmienniki (jedyny definer, read-only dla API,
  repo publiczne), addytywność, rollback (`drop trigger …; drop function …; drop table …`).
- `claim_generation` **nie jest** zmieniana.

#### 2. Typy

**File**: `src/db/database.types.ts`

**Intent**: Klient TS zna nową tabelę.

**Contract**: wyjście `npx supabase gen types typescript --local`.

#### 3. Testy pgTAP

**File**: `supabase/tests/database/account_entitlements.test.sql`

**Intent**: Dowieść ścieżki rejestracji pod prawdziwą rolą i izolacji kont.

**Contract** — przypadki:
- metadane: `start_trial_entitlement` nie jest `prosecdef`; `delete_own_account` nadal jedynym
  definerem w `public` (zapytanie po `pg_proc`).
- wstawienie konta **jako `supabase_auth_admin`** tworzy wiersz `basic` / `trial`;
- daty: `created_at` 17.10 → 17.11; 31.01 → koniec lutego; rejestracja o 23:30 UTC 31.10
  (= 1.11 w Warszawie) → 1.12 — przypadek strefy czasowej;
- jako nauczycielka A: widzi swój wiersz, nie widzi wiersza B; `insert`, `update`, `delete` własnego
  wiersza odrzucone (brak grantu) albo bez efektu;
- `anon` nie czyta nic;
- `check` odrzuca nieznany `plan` i `source`;
- usunięcie konta usuwa wiersz (kaskada).

#### 4. Test przez GoTrue

**File**: `src/lib/account-entitlement.db.test.ts`

**Intent**: Dowieść, że konto założone prawdziwą drogą GoTrue (`service.auth.admin.createUser`)
dostaje wiersz — ścieżka, której pgTAP nie widzi.

**Contract**: unikalny adres z sufiksem czasu, odczyt wiersza przez klienta tej nauczycielki
(`access_until` = dziś w Warszawie + 1 miesiąc), usunięcie konta w sprzątaniu. Potrzebny eksport
pomocników z `supabase-local.ts` (klient serwisowy / logowanie dowolnym adresem), jeśli dziś ich nie
ma — bez zmiany zachowania dwóch stałych nauczycielek.

### Success Criteria:

#### Automated Verification:

- Migracja stosuje się na czysto: `npx supabase db reset`
- Testy pgTAP przechodzą (nowy plik i wszystkie dotychczasowe): `npm run test:db`
- Bramka roli umie nie przejść: przy wykomentowanym `grant insert … to supabase_auth_admin` test
  „wstawienie jako `supabase_auth_admin`” jest czerwony (sprawdzone raz, odnotowane w commicie)
- Test przez GoTrue przechodzi: `npm run test:db:api`
- Typy się regenerują, a `git diff --stat master..HEAD -- src/db/database.types.ts` pokazuje zmianę
- `claim_generation` nietknięta: `git diff --name-only master..HEAD -- supabase/migrations` zwraca
  tylko nową migrację, a `grep -c "claim_generation" supabase/migrations/20261018140000_account_entitlements.sql` == 0
- Lint i build: `npm run lint && npm run build`

#### Manual Verification:

- Lokalnie: rejestracja przez `/auth/signup` (Inbucket) kończy się sukcesem, a w Studio pojawia się
  wiersz z poprawną datą

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie
przed fazą 2.

---

## Phase 2: Karta dostępu w ustawieniach

### Overview

Odczyt uprawnienia nauczycielki i wiersz w karcie „Konto” w `/ustawienia`, widoczny tylko w
trakcie dostępu.

### Changes Required:

#### 1. Typ

**File**: `src/types.ts`

**Intent**: Wspólny kształt uprawnienia dla `S-24`…`S-27`.

**Contract**: `AccountEntitlement { plan: "basic"; accessUntil: string /* YYYY-MM-DD */; source: "trial" | "owner" }`.

#### 2. Odczyt i decyzja o karcie

**File**: `src/lib/account-entitlement.ts` (jedna tabela, jeden wołający → `src/lib/`, nie `services/`)

**Intent**: Oddzielić decyzję „co pokazać” (czysta, testowana) od odczytu (cienki, odporny na błąd).

**Contract**:
- `accessCard(entitlement: AccountEntitlement | null, today: string): { untilLabel: string } | null`
  — `null` bez wiersza i gdy `accessUntil < today`; `untilLabel` w formie „17 listopada 2026”
  (`Intl.DateTimeFormat("pl-PL", { day, month: "long", year, timeZone: "UTC" })`, jak w
  `day-plan-dates.ts`).
- `readAccountEntitlement(supabase): Promise<AccountEntitlement | null>` — `select` własnego wiersza
  (`maybeSingle`); błąd albo nieoczekiwany kształt → `null` + log `account_entitlement.read_failed`
  (wzorzec `logEvent` z `fair-use.ts`). Strona nie ma własnej obsługi błędu.

#### 3. Karta

**File**: `src/pages/ustawienia.astro`

**Intent**: Pokazać datę dostępu w istniejącej karcie „Konto”, bez nowej pozycji menu.

**Contract**: drugi blok `bg-owies` pod blokiem e-maila, renderowany tylko gdy `accessCard(…)` ≠ `null`:
etykieta „Dostęp”, wartość „Pełny dostęp — do {untilLabel}”, opis „Wszystkie funkcje Temio są dziś
bezpłatne.”. Klient: ten sam `Astro.locals`/`createClient`, którego używa strona; `today` z
`todayIsoDate()`.

#### 4. Testy jednostkowe

**File**: `src/lib/account-entitlement.test.ts`

**Contract**: `accessCard` — brak wiersza → `null`; `accessUntil` = dziś → karta (włącznie);
wczoraj → `null`; etykieta z polskim dopełniaczem miesiąca; `readAccountEntitlement` — błąd
PostgREST i zły kształt → `null` + log (stub klienta jak w istniejących testach serwisów).

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe przechodzą: `npm test`
- Słownik zakazany nie trafił do produktu: `git diff master..HEAD -- src/ | grep -E '^\+.*(Basic|okres próbny|plan darmowy|bez limitu)'`
  zwraca pusto — bramka sprawdzona raz na czerwono przez tymczasowe „Basic” w etykiecie
- Lint i build: `npm run lint && npm run build`

#### Manual Verification:

- Nowe konto lokalnie: `/ustawienia` pokazuje „Pełny dostęp — do …” z datą za miesiąc
- Konto bez wiersza (jedna ze stałych nauczycielek z fikstur): `/ustawienia` wygląda jak przed zmianą
- Wiersz z `access_until` = wczoraj (zmiana w Studio): karta znika; = dziś: karta jest
- Widok ≤ 600 px: blok układa się jak blok e-maila

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie
przed fazą 3.

---

## Phase 3: Dokumenty i uruchomienie

### Overview

Polityka prywatności, zasady w CLAUDE.md, migracja na produkcji, wiersze testerek, roadmapa.

### Changes Required:

#### 1. Polityka prywatności

**Files**: `src/content/legal/polityka-prywatnosci.md`, `src/lib/legal.ts`

**Intent**: Nowa dana konta jest opisana, zanim zacznie powstawać na produkcji.

**Contract**: pkt 2.1 „Dane”: dopisek „datę, do której masz pełny dostęp do Serwisu”; okres jak
reszta 2.1 (do usunięcia Konta). `PRIVACY_VERSION = "1.3"`, `PRIVACY_PUBLISHED_ON` = dzień wydania.

#### 2. CLAUDE.md

**File**: `CLAUDE.md`

**Intent**: Zapisać niezmienniki, na których staną `S-24`…`S-27`.

**Contract**: nowa sekcja „Plan state” w Architecture: tabela `public.account_entitlements`
(„plan + dostęp do daty”, `access_until` włącznie w Warszawie); wiersz zakłada wyzwalacz
`security invoker` z grantami dla `supabase_auth_admin` (definer nadal tylko `delete_own_account`);
read-only dla API, zapis wyłącznie wyzwalaczem i SQL Editorem, wiersze osób nigdy w repo; **brak
wiersza = konto sprzed płatności, nie plan darmowy** (do `S-24`); karta w `/ustawienia` mówi tylko
to, co prawdziwe dziś; `claim_generation` jeszcze go nie czyta (`S-27`); migracja musi trafić na
produkcję z merge'em, a po pushu — próbna rejestracja.

#### 3. Roadmapa

**File**: `context/foundation/roadmap.md`

**Intent**: Rozstrzygnięty Unknown testerów i status.

**Contract**: w `### S-23` Unknown „Testerzy” oznaczony jako rozstrzygnięty (wiersz `source = 'owner'`
w SQL Editorze); status w bloku i w tabeli zmienia się przy archiwizacji.

### Success Criteria:

#### Automated Verification:

- `grep -n 'PRIVACY_VERSION = "1.3"' src/lib/legal.ts` zwraca jedną linię
- `grep -n "pełny dostęp do Serwisu" src/content/legal/polityka-prywatnosci.md` zwraca jedną linię w pkt 2.1
- Lint i build: `npm run lint && npm run build`

#### Manual Verification:

- `npx supabase db push` na hostowany projekt razem z merge'em; w dashboardzie istnieje tabela i wyzwalacz
- Próbna rejestracja na `https://temio.pl` kończy się sukcesem, wiersz ma poprawną datę; konto próbne usunięte
- `/polityka-prywatnosci` pokazuje wersję 1.3 i nowy dopisek w pkt 2.1
- Wiersze testerek w SQL Editorze (`access_until = '2027-01-31'`, `source = 'owner'`) — po rejestracji każdej; karta pokazuje „do 31 stycznia 2027”

---

## Testing Strategy

### Unit Tests:

- `accessCard`: granice dat (dziś włącznie, wczoraj nie), brak wiersza, etykieta.
- `readAccountEntitlement`: fail-open na błąd i zły kształt.

### Integration Tests:

- pgTAP: wyzwalacz jako `supabase_auth_admin`, daty ze strefą czasową i końcem miesiąca, izolacja,
  brak zapisu dla nauczycielki, kaskada, jedyny definer.
- `*.db.test.ts`: konto przez GoTrue dostaje wiersz czytelny dla właścicielki.

### Manual Testing Steps:

1. Zarejestruj konto lokalnie i potwierdź e-mail w Inbucket; otwórz `/ustawienia` — karta z datą.
2. W Studio ustaw `access_until` na wczoraj — karta znika; na dziś — wraca.
3. Zaloguj się na konto sprzed migracji — ustawienia jak dawniej.
4. Po pushu na produkcję: próbna rejestracja, wiersz w dashboardzie, usunięcie konta próbnego.

## Performance Considerations

Jeden `select` po kluczu głównym na render `/ustawienia`; jedno `insert` na rejestrację. Bez wpływu.

## Migration Notes

Addytywna: nowa tabela, funkcja, wyzwalacz i granty; żadnej zmiany istniejących obiektów ani danych.
Rollback: `drop trigger on_auth_user_created_start_trial on auth.users; drop function
public.start_trial_entitlement(); drop table public.account_entitlements;`. Konta założone między
merge'em a `db push` nie mają wiersza — uzupełnić w SQL Editorze z ich `created_at`.

## References

- Roadmapa: `context/foundation/roadmap.md` §S-23; PRD: `context/foundation/prd-v3.md` FR-030, §Business Logic „Druga reguła”, §Access Control
- Model „plan + dostęp do daty”: `context/foundation/monetization.md` §4.5
- Wzorzec tabeli read-only: `supabase/migrations/20261018120000_fair_use_overrides.sql`
- Poprzedni plan: `context/archive/2026-10-17-fair-use-overrides/plan.md`
- Supabase Auth Hooks — granty dla `supabase_auth_admin` bez `security definer` (Context7 `/supabase/supabase`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Uprawnienie w bazie

#### Automated

- [x] 1.1 Migracja stosuje się na czysto — 9785ae9
- [x] 1.2 Testy pgTAP przechodzą (nowy plik i wszystkie dotychczasowe) — 9785ae9
- [x] 1.3 Bramka roli umie nie przejść — 9785ae9
- [x] 1.4 Test przez GoTrue przechodzi — 9785ae9
- [x] 1.5 Typy się regenerują i pokazują zmianę — 9785ae9
- [x] 1.6 `claim_generation` nietknięta — 9785ae9
- [x] 1.7 Lint i build — 9785ae9

#### Manual

- [ ] 1.8 Lokalna rejestracja tworzy wiersz z poprawną datą

### Phase 2: Karta dostępu w ustawieniach

#### Automated

- [x] 2.1 Testy jednostkowe przechodzą — 2e84f89
- [x] 2.2 Słownik zakazany nie trafił do produktu — 2e84f89
- [x] 2.3 Lint i build — 2e84f89

#### Manual

- [ ] 2.4 Nowe konto widzi „Pełny dostęp — do …”
- [ ] 2.5 Konto bez wiersza wygląda jak przed zmianą
- [ ] 2.6 Granica daty: wczoraj bez karty, dziś z kartą
- [ ] 2.7 Widok ≤ 600 px

### Phase 3: Dokumenty i uruchomienie

#### Automated

- [x] 3.1 `PRIVACY_VERSION` = 1.3 — e52aba3
- [x] 3.2 Dopisek w pkt 2.1 polityki — e52aba3
- [x] 3.3 Lint i build — e52aba3

#### Manual

- [ ] 3.4 `db push` na produkcję z merge'em
- [ ] 3.5 Próbna rejestracja na produkcji
- [ ] 3.6 `/polityka-prywatnosci` pokazuje 1.3
- [ ] 3.7 Wiersze testerek w SQL Editorze
