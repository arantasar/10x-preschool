# Basic do 31.01.2027 dla kont sprzed startu płatności (S-30) — plan implementacji

## Overview

Konto założone przed startem płatności dostaje pełny dostęp do 31.01.2027 włącznie, a nie na
miesiąc od rejestracji. Konto założone później dostaje miesiąc, jak dziś. Reguła to jedna zmiana
w funkcji wyzwalacza z `S-23`:
`access_until = greatest(dzień rejestracji w Warszawie + 1 miesiąc, 2027-01-31)`. Ta sama migracja
wyrównuje wiersze okresu próbnego założone od wdrożenia `S-23`.

Realizuje `S-30` z `roadmap.md` (decyzja 2026-10-18: wariant mieszany). Wspólna data daje jedno
uprzedzenie (`S-24`) i jedną falę decyzji „płacę albo plan darmowy” 1.02.2027. Przy 30 dniach
konto z listopada miałoby w dniu startu `S-27` wygasły dostęp i trafiłoby na plan darmowy bez
uprzedzenia.

## Current State Analysis

- `public.start_trial_entitlement()` (`supabase/migrations/20261018140000_account_entitlements.sql`)
  liczy `((coalesce(new.created_at, now()) at time zone 'Europe/Warsaw')::date + interval '1 month')::date`,
  `source = 'trial'`. Jest `security invoker`, ma `search_path = ''`, nie łapie wyjątków, a
  `execute` jest odebrane `public, anon, authenticated`.
- Na produkcji (od wdrożenia `S-23`, 2026-10-18) każde nowe konto ma wiersz z datą za miesiąc.
  Trzy konta (właściciel i testerki) mają `source = 'owner'`, `access_until = '2099-12-31'`,
  wpisane w SQL Editorze. Nie wolno ich ruszyć.
- Karta w `/ustawienia` (`src/lib/account-entitlement.ts`, `accessCard`) czyta `access_until` i
  pokaże „Pełny dostęp — do 31 stycznia 2027” bez żadnej zmiany w kodzie aplikacji.
- Testy zakładają „+1 miesiąc”:
  - `supabase/tests/database/account_entitlements.test.sql`, przypadki 10–12: 17.10.2026 → 17.11.2026;
    31.01.2027 → 28.02.2027 i 31.01.2028 → 29.02.2028; 31.10.2026 23:30 UTC → 1.12.2026;
  - `src/lib/account-entitlement.db.test.ts`: `access_until = plusOneMonth(todayIsoDate())`.
- Lokalna baza ma dziś wiersze `trial` z datą za miesiąc: stałe nauczycielki z fikstur powstają
  przez GoTrue. Dzięki temu da się sprawdzić wyrównanie na prawdziwych wierszach przez
  `migration up`, bez resetu.

## Desired End State

- Rejestracja do 31.12.2026 włącznie (w Warszawie) daje `access_until = 2027-01-31`. Rejestracja
  od 1.01.2027 daje dzień rejestracji + 1 miesiąc (15.01.2027 → 15.02.2027).
- Każdy wiersz `source = 'trial'` z datą wcześniejszą niż 2027-01-31 ma po migracji 2027-01-31.
  Wiersze `owner` i wiersze z datą późniejszą zostają bez zmian.
- `greatest` **nie wymaga cofania** przy starcie płatności: od rejestracji 1.01.2027 „+1 miesiąc”
  zawsze wypada po 31.01.2027, więc stała przestaje działać sama. Druga migracja jest potrzebna
  tylko wtedy, gdy termin się przesunie.
- Przesunięcie terminu (opóźnienie płatności) to nowa migracja: zmienia stałą w funkcji i
  przesuwa wiersze `trial` z dotychczasową datą. Procedura jest zapisana w CLAUDE.md.
- Funkcja zostaje `security invoker`; `delete_own_account` pozostaje jedynym definerem.
- Aplikacja, karta, RLS, granty i polityka prywatności są bez zmian.

### Key Discoveries:

- Jedyne miejsce reguły: `start_trial_entitlement()` w `20261018140000_account_entitlements.sql:85-101`.
- `create or replace function` zachowuje właściciela, granty i odebrane uprawnienia, a wyzwalacz
  `on_auth_user_created_start_trial` wskazuje na funkcję po nazwie, więc nie trzeba go tworzyć
  od nowa.
- `public.set_updated_at()` (wyzwalacz `account_entitlements_set_updated_at`, impl-review F2
  `S-23`) zaktualizuje `updated_at` wyrównanych wierszy sam.
- Polityka prywatności 1.3 pkt 2.1 opisuje już „datę, do której masz pełny dostęp” — wersja się
  nie zmienia.
- Słownik zakazany (`Basic`, `okres próbny`, `plan darmowy`, `bez limitu`, cena) obowiązuje dalej:
  ten slice nie dodaje żadnego tekstu w produkcie.

## What We're NOT Doing

- Żadnej tabeli konfiguracji z datą startu: stała w funkcji (decyzja planu).
- Żadnej migracji „zdejmującej” `greatest` przy starcie płatności — nie jest potrzebna.
- Żadnego tekstu w produkcie: ani „potem cena założycielska”, ani „okres próbny” — to `S-22`/`S-25`.
- Żadnego uprzedzenia o 1.02.2027 — to `S-24`.
- Żadnej zmiany wierszy `owner`, nadpisań `fair_use_overrides` ani `claim_generation`.
- Żadnego limitu horyzontu planowania — to `S-31`.
- Żadnych danych osób w migracji ani testach — repozytorium jest publiczne. Wyrównanie wybiera
  wiersze po `source` i dacie, nigdy po koncie.

## Implementation Approach

Najpierw baza i testy, bo ryzyko slice'u jest w bazie: błąd w funkcji blokuje każdą rejestrację,
a źle zawężony `update` mógłby skrócić wiersze `owner`. Testy dat piszemy tak, żeby na starej
funkcji były czerwone. Potem CLAUDE.md, roadmapa i wdrożenie z próbną rejestracją.

## Critical Implementation Details

- **Kolejność wdrożenia:** migracja musi trafić na produkcję (`npx supabase db push`) razem z
  merge'em. Bez niej nowe konta dostają datę za miesiąc, a ich wiersze wyrówna dopiero ta
  migracja. Kod aplikacji się nie zmienia, więc obie kolejności są bezpieczne. Po pushu: jedna
  próbna rejestracja na produkcji, bo błąd w funkcji blokuje **każdą** rejestrację.
- **Zakres `update`:** dokładnie `source = 'trial' and access_until < date '2027-01-31'`. Bez
  warunku na `source` wyrównanie dotknęłoby wierszy `owner`. Bez warunku na datę cofnęłoby daty
  późniejsze. Przy dzisiejszych danych żadnej takiej daty nie ma, ale reguła ma być poprawna
  także przy powtórzeniu.

## Phase 1: Reguła w bazie

### Overview

Nowa migracja z regułą `greatest` i wyrównaniem wierszy, przepisane przypadki dat w pgTAP,
nowa oczekiwana data w teście przez GoTrue.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/20261018160000_trial_until_launch.sql`

**Intent**: Dać kontom sprzed startu płatności wspólną datę 31.01.2027 i wyrównać konta założone
od wdrożenia `S-23`, bez ruszania kont `owner`.

**Contract**:
- `create or replace function public.start_trial_entitlement()`: ta sama sygnatura, `returns trigger`,
  `language plpgsql`, `security invoker`, `set search_path = ''`, jedno `insert` bez łapania
  wyjątków. `access_until` liczone jako
  `greatest(((coalesce(new.created_at, now()) at time zone 'Europe/Warsaw')::date + interval '1 month')::date, date '2027-01-31')`.
  Komentarz w ciele: stała to „ostatni dzień przed startem płatności”, a od rejestracji
  1.01.2027 przestaje działać sama.
- `comment on function` zaktualizowany o regułę daty.
- `update public.account_entitlements set access_until = date '2027-01-31' where source = 'trial' and access_until < date '2027-01-31';`
- Nagłówek jak w `20261018140000`: cel (`S-30`), niezmienniki (jedyny definer, read-only dla API,
  repo publiczne, wiersze `owner` nietknięte), addytywność, procedura przesunięcia terminu,
  rollback (poprzednia definicja funkcji z `20261018140000`; wyrównanych dat się nie cofa, bo
  wydłużenie dostępu niczego nie odbiera).
- Wyzwalacza, tabeli, polityk i grantów migracja nie dotyka.

#### 2. Testy pgTAP

**File**: `supabase/tests/database/account_entitlements.test.sql`

**Intent**: Testy dat opisują obowiązującą regułę i są czerwone na starej funkcji.

**Contract** — przypadki dat (wstawienia jak dziś, jako właściciel, z jawnym `created_at`):
- 17.10.2026 10:00 UTC → 2027-01-31 (zastępuje 17.10 → 17.11);
- 31.12.2026 10:00 UTC → 2027-01-31 (ostatni dzień przed startem);
- 15.01.2027 10:00 UTC → 2027-02-15 (stała już nie działa);
- 31.01.2027 → 2027-02-28 i 31.01.2028 → 2028-02-29 (koniec miesiąca, bez zmian);
- 31.12.2026 23:30 UTC (= 1.01.2027 w Warszawie) → 2027-02-01 (zastępuje przypadek strefy 31.10 → 1.12).
- Wyrównanie (`update` z migracji uruchomiony ponownie w teście jako to samo zdanie): wiersz
  `trial` z datą 2026-11-17 → 2027-01-31; wiersz `owner` z 2099-12-31 → bez zmian; wiersz `trial`
  z 2027-02-15 → bez zmian.
- `plan(N)` zaktualizowany; metadane (invoker, `search_path`, jedyny definer) zostają i
  przechodzą na nowej funkcji.

#### 3. Test przez GoTrue

**File**: `src/lib/account-entitlement.db.test.ts`

**Intent**: Konto założone prawdziwą drogą GoTrue dostaje datę według nowej reguły.

**Contract**: oczekiwane `access_until` = późniejsza z dat `plusOneMonth(todayIsoDate())` i
`"2027-01-31"` (porównanie ciągów ISO). Bez zmiany fikstur.

### Success Criteria:

#### Automated Verification:

- Wyrównanie na prawdziwych wierszach: przed `npx supabase migration up` zapytanie
  `select count(*) from public.account_entitlements where source = 'trial' and access_until < '2027-01-31'`
  na lokalnej bazie zwraca > 0 (stałe nauczycielki), po nim zwraca 0, a wiersz `owner` dodany
  przed migracją ma nadal 2099-12-31
- Testy dat są czerwone na starej funkcji: nowe przypadki uruchomione przed migracją nie
  przechodzą (sprawdzone raz, odnotowane w commicie)
- Testy pgTAP przechodzą (wszystkie pliki): `npm run test:db`
- Test przez GoTrue przechodzi: `npm run test:db:api`
- Migracja stosuje się na czysto: `npx supabase db reset`, potem ponownie `npm run test:db`
- Aplikacja nietknięta: `git diff --name-only master..HEAD -- src/ ':!src/lib/account-entitlement.db.test.ts'` zwraca pusto
- Lint i build: `npm run lint && npm run build`

#### Manual Verification:

- Lokalnie: rejestracja przez `/auth/signup` (Inbucket), a `/ustawienia` pokazuje „Pełny dostęp — do 31 stycznia 2027”

**Implementation Note**: Po zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie
przed fazą 2.

---

## Phase 2: Dokumenty i wdrożenie

### Overview

CLAUDE.md, roadmapa, migracja na produkcji i próbna rejestracja.

### Changes Required:

#### 1. CLAUDE.md

**File**: `CLAUDE.md`

**Intent**: Zapisać regułę daty i procedurę przesunięcia terminu, na których stoją `S-24`…`S-27`.

**Contract**: w sekcji „Plan state” zdanie o wyzwalaczu („sign-up day in Warsaw + 1 month”)
zmienione na `greatest(sign-up day in Warsaw + 1 month, 2027-01-31)`, z dopiskiem: stała to
ostatni dzień przed startem płatności i przestaje działać sama od rejestracji 1.01.2027;
przesunięcie terminu to **nowa migracja**, która zmienia stałą i przesuwa wiersze
`source = 'trial'` z dotychczasową datą — nigdy SQL Editor, bo funkcja w repo i na produkcji
musi być ta sama.

#### 2. Roadmapa

**File**: `context/foundation/roadmap.md`

**Intent**: Poprawić założenie o drugiej migracji w `S-30`.

**Contract**: w `### S-30` Unknown „Kształt” oznaczony jako rozstrzygnięty: `greatest` ze stałą w
funkcji, wyrównanie w tej samej migracji, **bez** migracji zdejmującej przy starcie płatności
(stała przestaje działać sama). Status w bloku i w tabeli zmienia się przy archiwizacji.

### Success Criteria:

#### Automated Verification:

- `grep -n "2027-01-31" CLAUDE.md` zwraca linię w sekcji „Plan state”
- `grep -n "sign-up day in Warsaw + 1 month)" CLAUDE.md` zwraca pusto (stare brzmienie usunięte)
- Lint i build: `npm run lint && npm run build`

#### Manual Verification:

- `npx supabase db push` na hostowany projekt razem z merge'em
- W SQL Editorze: wiersze `trial` mają `access_until = 2027-01-31`, a wiersze `owner` mają 2099-12-31
- Próbna rejestracja na `https://temio.pl`: karta „Pełny dostęp — do 31 stycznia 2027”; konto próbne usunięte

---

## Testing Strategy

### Unit Tests:

- Brak zmian: `accessCard` i `readAccountEntitlement` nie zależą od reguły daty.

### Integration Tests:

- pgTAP: granice reguły (przed i po 31.12.2026, strefa czasowa, koniec miesiąca), zakres
  wyrównania (`trial` przesunięty, `owner` i późniejsza data nietknięte), metadane funkcji.
- `*.db.test.ts`: konto przez GoTrue dostaje datę według nowej reguły.
- `migration up` na lokalnej bazie z prawdziwymi wierszami `trial`.

### Manual Testing Steps:

1. Zarejestruj konto lokalnie i otwórz `/ustawienia`: karta do 31 stycznia 2027.
2. Po pushu na produkcję sprawdź wiersze w SQL Editorze: `trial` mają 2027-01-31, `owner` 2099-12-31.
3. Próbna rejestracja na produkcji, potem usunięcie konta próbnego.

## Performance Considerations

Jeden `update` po małej tabeli w migracji; wyzwalacz robi to samo jedno `insert`. Bez wpływu.

## Migration Notes

Funkcja jest zastępowana w miejscu; wyzwalacz i granty zostają. Wyrównanie tylko wydłuża
dostęp, więc rollback przywraca poprzednią definicję funkcji z `20261018140000` i nie cofa dat.
Konta założone między merge'em a `db push` dostaną datę za miesiąc — wyrówna je ponowne
uruchomienie tego samego `update` w SQL Editorze (bez danych osób w repo).

## References

- Roadmapa: `context/foundation/roadmap.md` §S-30 (decyzja 2026-10-18), §S-24, §S-27
- Poprzedni plan: `context/archive/2026-10-17-trial-entitlement/plan.md`
- Migracja źródłowa: `supabase/migrations/20261018140000_account_entitlements.sql`
- Lessons: „Kryterium weryfikacji musi móc nie przejść” (testy dat czerwone na starej funkcji; liczenie przed i po `migration up`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Reguła w bazie

#### Automated

- [x] 1.1 Wyrównanie na prawdziwych wierszach (przed > 0, po = 0, `owner` nietknięty)
- [x] 1.2 Testy dat czerwone na starej funkcji
- [x] 1.3 Testy pgTAP przechodzą
- [x] 1.4 Test przez GoTrue przechodzi
- [x] 1.5 Migracja stosuje się na czysto
- [x] 1.6 Aplikacja nietknięta
- [x] 1.7 Lint i build

#### Manual

- [ ] 1.8 Lokalna rejestracja pokazuje kartę do 31 stycznia 2027

### Phase 2: Dokumenty i wdrożenie

#### Automated

- [ ] 2.1 CLAUDE.md zawiera nową regułę
- [ ] 2.2 Stare brzmienie usunięte
- [ ] 2.3 Lint i build

#### Manual

- [ ] 2.4 `db push` na produkcję z merge'em
- [ ] 2.5 Wiersze `trial` i `owner` na produkcji
- [ ] 2.6 Próbna rejestracja na produkcji
