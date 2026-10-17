# Indywidualne limity fair use (S-28) — plan implementacji

## Overview

Właściciel może nadać wybranemu kontu własny miesięczny limit generowania — wyższy, niższy albo
bez sufitu — wpisem w dashboardzie Supabase, bez deployu. Nowa tabela `public.fair_use_overrides`
trzyma jeden wiersz na konto; `claim_generation` sprawdza go przy każdej rezerwacji i, jeśli wpis
obowiązuje, używa jego liczb zamiast limitów z konfiguracji. Księga zapisuje wywołania jak dotąd,
także dla kont bez sufitu. Na start: konto właściciela i konto jednej testerki wskazanej przez właściciela, oba bez sufitu.

Realizuje slice `S-28` z `roadmap.md`. Jest prerekwizytem `S-23`, który dołoży stan planu konta
jako kolejne źródło limitu.

## Current State Analysis

- `claim_generation(p_kind, p_day_limit, p_refine_limit, p_refund_allowance, p_plan_date default null, p_enforce default true)`
  (`supabase/migrations/20261017170000_claim_generation_outline_ceiling.sql`) dostaje limity jako
  argumenty od `src/lib/services/fair-use.ts`, który czyta je z `FAIR_USE_*`. Funkcja nie wie, czyje
  to konto, poza `auth.uid()` do liczenia zużycia.
- Funkcja jest `security invoker` i ma taka zostać: `delete_own_account` to jedyna funkcja
  `security definer` w produkcie (CLAUDE.md). Wszystko, co funkcja czyta, musi więc być czytelne
  dla wołającej nauczycielki przez RLS.
- Repozytorium `arantasar/10x-preschool` jest **publiczne**. Adresy e-mail i identyfikatory kont
  nie mogą trafić do migracji, testów ani dokumentów w gicie — wpisy dla konkretnych osób powstają
  wyłącznie w dashboardzie.
- Konto testerki najpewniej nie istnieje (usunięte); nadpisanie przypięte do konta powstanie
  dopiero po jej ponownej rejestracji.
- Polityka prywatności 1.1, pkt 2.7 „Limit generowania” opisuje księgę; nie mówi nic o limicie
  indywidualnym.

## Desired End State

- Konto z wpisem bez sufitu (`days_per_month` i `refines_per_month` = `null`) generuje dowolnie dużo
  i nigdy nie dostaje odmowy; każde wywołanie nadal zostawia wiersz w księdze.
- Konto z wpisem liczbowym ma dokładnie ten limit — także niższy niż domyślny.
- Po dacie `valid_until` (Europe/Warsaw, włącznie) konto wraca do limitu z konfiguracji bez
  niczyjej interwencji, a wygasły wpis znika w najbliższym przebiegu crona.
- Nauczycielka może odczytać wyłącznie własny wpis i nie może żadnego wstawić, zmienić ani usunąć.
- `fair-use.ts`, cztery trasy i wyspy są bez zmian.
- Polityka prywatności 1.2 wspomina limit indywidualny.

### Key Discoveries:

- Miejsce zmiany: zapytanie liczące i warunek `v_allowed` w `claim_generation` (`20261017170000_claim_generation_outline_ceiling.sql`).
- Wzorzec tabeli z RLS, cronem i testami izolacji: `supabase/migrations/20261017150000_generation_ledger.sql`, `supabase/tests/database/generation_ledger.test.sql`.
- Kaskada z kontem i jej test: `supabase/tests/database/delete_own_account.test.sql`.
- Strefa czasowa: Europe/Warsaw, jak w `claim_generation` i `src/lib/day-plan-dates.ts`.

## What We're NOT Doing

- Żadnych imion, nazwisk ani adresów konkretnych osób w repozytorium (jest publiczne) — tylko w dashboardzie.
- Żadnego panelu ani UI — ani dla właściciela, ani informacji dla nauczycielki. Wpisy robi się w SQL Editorze.
- Żadnego słowa „bez limitu” w produkcie (zasada z `context/foundation/design/design/README.md`).
- Przypinania nadpisania do adresu e-mail ani nadawania go „z góry” kontu, które nie istnieje.
- Stanu planu konta (Darmowy, okres próbny, Basic) — `S-23`, `S-27`.
- Zmian w puli zwrotów (`FAIR_USE_REFUNDS_PER_MONTH` zostaje globalna) i w trybie `observe`.
- Zmian w `fair-use.ts`, trasach i testach tras.
- Wpisów dla konkretnych osób w jakimkolwiek pliku repozytorium.

## Implementation Approach

Jedno nowe źródło limitu, czytane w jednym miejscu. `claim_generation` po zablokowaniu konta
odczytuje obowiązujący wpis dla `auth.uid()`; jeśli istnieje, jego kolumny zastępują argumenty
`p_day_limit` / `p_refine_limit`, a `null` w kolumnie znaczy „ta rodzina bez sufitu”. Kolejność
źródeł — nadpisanie konta, potem (od `S-23`) plan konta, potem konfiguracja — jest zapisana
w komentarzu migracji, żeby `S-23` dokładał źródło, a nie przerabiał funkcję.

Sygnatura funkcji się nie zmienia, więc warstwa aplikacji nic nie widzi. Tabela jest
tylko-do-odczytu dla API: zapisuje ją właściciel z dashboardu (rola `postgres`, ponad RLS).

## Critical Implementation Details

- **Odczyt wpisu po blokadzie doradczej**, w tej samej transakcji co liczenie — żeby pięć
  równoległych `week/day` widziało ten sam limit.
- **„Obowiązuje”** = `valid_until is null or valid_until >= (now() at time zone 'Europe/Warsaw')::date`.
  Ta sama data liczy się w cronie, inaczej wpis mógłby zniknąć dzień za wcześnie albo działać dzień po terminie.
- **Tryb `observe`** (`p_enforce = false`) działa bez zmian: konto bez sufitu dostaje `allowed = true`, więc nie pojawia się w logu `fair_use.would_limit`.

## Phase 1: Nadpisania w bazie

### Overview

Tabela, RLS, cron sprzątający wygasłe wpisy, nowa wersja `claim_generation`, testy pgTAP i typy.
Po tej fazie limit indywidualny działa w bazie; aplikacja korzysta z niego bez zmian w kodzie.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/20261018120000_fair_use_overrides.sql`

**Intent**: Trwałe, odporne na nadużycie źródło indywidualnego limitu i jego jedyny czytelnik.
Nagłówek w stylu `20261017150000_generation_ledger.sql` (purpose, affected, special considerations,
rollback), w tym zdanie, że repozytorium jest publiczne i wpisy dla osób powstają tylko w dashboardzie.

**Contract**:

- `public.fair_use_overrides`: `user_id uuid primary key references auth.users on delete cascade`,
  `days_per_month int null check (days_per_month >= 1)`,
  `refines_per_month int null check (refines_per_month >= 1)`,
  `valid_until date null`, `created_at timestamptz not null default now()`.
  Komentarze na tabeli i kolumnach: `null` = bez sufitu dla tej rodziny; `valid_until` włącznie, Europe/Warsaw.
- Uprawnienia: `revoke all … from anon, authenticated`; `grant select … to authenticated`. RLS włączone;
  jedna polityka `select` własnego wiersza (`user_id = (select auth.uid())`). Brak polityk insert/update/delete.
- `create or replace function public.claim_generation(…)` — ta sama sygnatura i ta sama treść co w
  `20261017170000`, plus: po blokadzie odczyt obowiązującego wpisu dla `v_uid`; jeśli jest, jego
  kolumny zastępują `p_day_limit` / `p_refine_limit`; limit `null` znaczy „zawsze dozwolone” dla tej
  rodziny (szkic tygodnia wymaga miejsca w obu, jak dotąd). Nadal `security invoker`,
  `set search_path = ''`. Grant/revoke jak w `20261017170000`.
- Komentarz w funkcji: kolejność źródeł limitu (nadpisanie konta → plan konta od `S-23` → argumenty z konfiguracji).
- Cron: `cron.schedule('fair-use-overrides-expiry', …, 'delete from public.fair_use_overrides where valid_until < (now() at time zone ''Europe/Warsaw'')::date')`.

#### 2. Typy

**File**: `src/db/database.types.ts`

**Intent**: Regeneracja po migracji (nowa tabela).

**Contract**: wyjście `npx supabase gen types typescript --local`.

#### 3. Testy pgTAP

**File**: `supabase/tests/database/fair_use_overrides.test.sql`

**Intent**: Dowód niezmienników w bazie, wzorem `generation_ledger.test.sql`.

**Contract**: przypadki —
- konto z wpisem bez sufitu przechodzi przy zużyciu ponad limit z argumentów, a rezerwacja zostawia wiersz w księdze;
- wpis liczbowy wyższy niż argument dopuszcza ponad argument i odmawia na swojej liczbie;
- wpis liczbowy niższy niż argument odmawia wcześniej;
- `null` w jednej rodzinie i liczba w drugiej działają niezależnie, a szkic tygodnia wymaga miejsca w obu;
- wpis z `valid_until` w przeszłości jest ignorowany (obowiązuje argument), a z `valid_until` = dziś (Warsaw) jeszcze obowiązuje;
- konto bez wpisu zachowuje się jak dotąd;
- nauczycielka czyta tylko własny wpis, nie widzi cudzego, a `insert`, `update` i `delete` dostaje 42501;
- anon nie czyta niczego;
- `CHECK` odrzuca 0;
- usunięcie konta kasuje wpis;
- job `fair-use-overrides-expiry` istnieje, usuwa wpis wygasły, a zostawia wpis z dzisiejszą datą i bezterminowy;
- `claim_generation` jest nadal `security invoker`.

### Success Criteria:

#### Automated Verification:

- Migracja aplikuje się na czysto: `npx supabase db reset`
- Testy pgTAP przechodzą (także `generation_ledger.test.sql` bez zmian): `npm run test:db`
- Typy regenerują się, a `git diff --stat src/db/database.types.ts` pokazuje zmianę: `npx supabase gen types typescript --local > src/db/database.types.ts`
- Testy na prawdziwej bazie przechodzą bez zmian: `npm run test:db:api`
- Testy jednostkowe, lint i build: `npm test && npm run lint && npm run build`

#### Manual Verification:

- W Studio lokalnym tabela ma RLS włączone i jedną politykę `select`, bez insert/update/delete

**Implementation Note**: Po zielonej automatyce poczekaj na potwierdzenie ręcznej weryfikacji, zanim przejdziesz dalej.

---

## Phase 2: Dokumenty i uruchomienie

### Overview

Polityka prywatności, CLAUDE.md i roadmapa opisują limit indywidualny; po scaleniu właściciel
nadaje go swojemu kontu, a testerce po jej rejestracji.

### Changes Required:

#### 1. Polityka prywatności

**File**: `src/content/legal/polityka-prywatnosci.md`, `src/lib/legal.ts`

**Intent**: Wysokość indywidualnego limitu i jego termin to nowe dane per konto.

**Contract**: w pkt 2.7 jedno zdanie w „Dane”: jeśli ustalimy dla Konta indywidualny limit, zapisujemy
jego wysokość i datę, do której obowiązuje; w „Jak długo”: do końca obowiązywania albo usunięcia Konta.
Bez zmian numeracji. `PRIVACY_VERSION = "1.2"`, `PRIVACY_PUBLISHED_ON` = dzień scalenia.

#### 2. CLAUDE.md

**File**: `CLAUDE.md`

**Intent**: Następny slice (`S-23`) musi wiedzieć, gdzie i w jakiej kolejności dokładać źródło limitu.

**Contract**: w sekcji „Fair use” jeden punkt: `public.fair_use_overrides` (tylko-do-odczytu dla API,
własny wiersz; `null` = bez sufitu; `valid_until`; cron `fair-use-overrides-expiry`), kolejność źródeł
w `claim_generation`, wpisy wyłącznie w dashboardzie — repozytorium jest publiczne.

#### 3. Roadmapa

**File**: `context/foundation/roadmap.md`

**Intent**: `S-28` → `in progress`; niewiadome rozstrzygnięte.

**Contract**: tylko wiersz `S-28` w tabeli i blok `### S-28`.

### Success Criteria:

#### Automated Verification:

- Testy stron prawnych przechodzą: `npm test -- legal`
- Build: `npm run build`
- W tabeli roadmapy zmienił się wyłącznie wiersz `S-28` (zakotwiczone na kolumnie ID, odporne na przerównanie i na wzmianki „S-28” w prerekwizytach innych wierszy): `git diff -w master..HEAD -- context/foundation/roadmap.md | grep '^[-+]|' | grep -v '^[-+]| S-28 '` jest puste
- Żaden adres e-mail nie trafił do zmian tej gałęzi: `git diff master..HEAD -- . ':(exclude)context/foundation/design' | grep -E '^\+.*[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}' | grep -v -E '@(example\.test|test\.local|temio\.pl|anthropic\.com)'` jest puste

#### Manual Verification:

- `/polityka-prywatnosci` pokazuje wersję 1.2 i nowe zdanie w pkt 2.7
- Po scaleniu: `npx supabase db push` wykonany, a w SQL Editorze produkcji wpis bez sufitu dla konta właściciela: `insert into public.fair_use_overrides (user_id) select id from auth.users where email = '<adres właściciela>';`
- Po rejestracji testerki: ten sam wpis dla jej konta
- Na produkcji konto właściciela przy `FAIR_USE_DAYS_PER_MONTH=1` (na chwilę) generuje drugi dzień bez komunikatu, a każde generowanie zostawia wiersz w `generation_ledger`; potem wartość wraca

**Implementation Note**: Po zielonej automatyce poczekaj na potwierdzenie ręcznej weryfikacji.

---

## Testing Strategy

### Unit Tests:

- Brak nowych — warstwa aplikacji się nie zmienia; istniejące testy `fair-use.ts` i tras muszą przejść bez zmian.

### Integration Tests:

- pgTAP: bez sufitu, wyższy, niższy, rodziny osobno, szkic w obu rodzinach, ważność (wczoraj / dziś), konto bez wpisu, RLS i zakaz zapisu, anon, CHECK, kaskada, cron.
- `npm run test:db:api`: równoległość z `S-21` przechodzi bez zmian (konta testowe nie mają wpisów).

### Manual Testing Steps:

1. Lokalnie: `.dev.vars` z `FAIR_USE_DAYS_PER_MONTH=2`, pełny restart `npm run dev`.
2. W Studio: `insert into public.fair_use_overrides (user_id) select id from auth.users where email = '<lokalne konto>';` — trzeci dzień przechodzi.
3. `update public.fair_use_overrides set days_per_month = 1 …` — następny dzień dostaje komunikat.
4. `update … set days_per_month = null, valid_until = current_date - 1` — obowiązuje znowu limit 2.

## Performance Considerations

Jeden odczyt po kluczu głównym w transakcji, która już trzyma blokadę konta — pomijalny.

## Migration Notes

- Migracja jest addytywna; `create or replace` funkcji zachowuje sygnaturę, więc wdrożona aplikacja działa przed i po `db push`.
- Bez `db push` nic się nie psuje — nadpisania po prostu nie istnieją.
- Rollback: `select cron.unschedule('fair-use-overrides-expiry');`, ponowne wykonanie bloku funkcji z `20261017170000`, `drop table public.fair_use_overrides;`.
- Retencja ma właściciela: cron w tej migracji usuwa wygasłe wpisy, kaskada — wpisy usuniętych kont (reguła z `lessons.md`).

## References

- Roadmapa: `context/foundation/roadmap.md` `### S-28`
- Poprzedni slice: `context/archive/2026-10-17-fair-use-limit/plan.md`
- Funkcja: `supabase/migrations/20261017170000_claim_generation_outline_ceiling.sql`
- Wzorzec tabeli i testów: `supabase/migrations/20261017150000_generation_ledger.sql`, `supabase/tests/database/generation_ledger.test.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Nadpisania w bazie

#### Automated

- [x] 1.1 Migracja aplikuje się na czysto: `npx supabase db reset` — 9e249aa
- [x] 1.2 Testy pgTAP przechodzą: `npm run test:db` — 9e249aa
- [x] 1.3 Typy regenerują się, a `git diff --stat src/db/database.types.ts` pokazuje zmianę — 9e249aa
- [x] 1.4 Testy na prawdziwej bazie przechodzą bez zmian: `npm run test:db:api` — 9e249aa
- [x] 1.5 Testy jednostkowe, lint i build: `npm test && npm run lint && npm run build` — 9e249aa

#### Manual

- [x] 1.6 W Studio tabela ma RLS i jedną politykę `select`, bez insert/update/delete — dowód: pgTAP `fair_use_overrides.test.sql` (brak polityk poza SELECT, izolacja odczytu, 42501 na zapis)

### Phase 2: Dokumenty i uruchomienie

#### Automated

- [x] 2.1 Testy stron prawnych przechodzą: `npm test -- legal` — b28033b
- [x] 2.2 Build: `npm run build` — b28033b
- [x] 2.3 W tabeli roadmapy zmienił się wyłącznie wiersz `S-28` (`git diff -w master..HEAD`) — b28033b
- [x] 2.4 Żaden adres e-mail nie trafił do zmian tej gałęzi — b28033b

#### Manual

- [x] 2.5 `/polityka-prywatnosci` pokazuje 1.2 i nowe zdanie w pkt 2.7 — potwierdzone po scaleniu (de6280f)
- [x] 2.6 Po scaleniu `db push` wykonany i wpis bez sufitu dla konta właściciela — potwierdzone po scaleniu (de6280f)
- [ ] 2.7 Po rejestracji testerki wpis bez sufitu dla jej konta — czeka na rejestrację testerki (wpis w SQL Editorze, jak 2.6)
- [x] 2.8 Na produkcji konto właściciela przechodzi ponad limit, a księga zapisuje wywołania — potwierdzone po scaleniu (de6280f)
