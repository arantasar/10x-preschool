---
change_id: edit-accept-day-plan
title: Edit accept day plan
status: impl_reviewed
created: 2026-08-23
updated: 2026-08-23
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

### 2026-08-23 — F-01 migrations stay local for now (plan step 1.7)

`20260720162247`, `20260720162553` and `20260720163134` have still never been
applied to the hosted project. Deliberately deferred rather than pushed as part
of this phase: S-02 is being built and verified against the local stack, and
`npx supabase db push` is a prerequisite for shipping S-02 remotely, not for
implementing it. Without `20260720162553` in particular the column grants stay
wide on hosted, so several assumptions in `plan.md` do not hold there.

Owner: Janusz. Gate: before S-02 reaches the hosted project.

### 2026-08-23 — trigger raises two different SQLSTATEs (Phase 1 adaptation)

`plan.md` writes `enforce_activity_generation` as a single
`new.generation is distinct from (select ...)` test, which answers
`check_violation` for both a genuine counter mismatch and a plan row RLS hides.
The second case collides with F-01's `rls_isolation.test.sql` assertion #10,
which asserts `42501` for a cross-account insert — the BEFORE INSERT trigger
runs ahead of the RLS WITH CHECK, so the suite went red on a change that had
not weakened isolation at all.

Adopted after review: the trigger reads the counter into a variable, answers
`insufficient_privilege` when the plan is not visible (the code RLS itself
would have given) and `check_violation` only for a real mismatch. Same refusal,
same single indexed query, F-01's proof untouched.

### 2026-08-23 — the plan's function-grant recipe was incomplete

`plan.md` prescribes `revoke all ... from public` followed by
`grant execute ... to authenticated`. On Supabase that leaves `anon` holding
EXECUTE: `alter default privileges in schema public grant execute on functions
to anon, authenticated, service_role` lands as a *direct* grant, which a revoke
from PUBLIC does not touch. Confirmed by reading `pg_proc.proacl` after running
exactly the plan's two statements. The migration carries an explicit
`revoke all on function ... from anon` as well.


### 2026-08-23 — `.dev.vars` points at the hosted project (blocks manual testing)

`SUPABASE_URL` in `.dev.vars` is `https://tponbccoxczjyoqwliyx.supabase.co`, not
the local stack. None of the five migrations have been applied there — the three
F-01 ones deferred in step 1.7, plus this change's write-contract migration — so
a dev server started as-is fails every write in this slice.

Also found: the local stack itself was half-dead (kong, rest, studio and pg_meta
had exited eight days ago while db and auth stayed up), which is why pgTAP
worked all along and nothing else would have. Fixed with
`npx supabase stop && npx supabase start`.

Before manual verification, one of two things has to happen: point `.dev.vars` at
`http://127.0.0.1:54321` with the local anon key, or run `npx supabase db push`
so hosted catches up. `.dev.vars` was left holding its original hosted values.

### 2026-08-23 — the wire envelope moved out of the routes (Phase 3 adaptation)

`plan.md` gives each route its own error envelope. Three routes now answer with
it, and the island has a single response handler — three copies of the
status/message table would drift, and the drift would make that handler wrong
for whichever route moved. Lifted into `src/lib/services/day-plan-http.ts`;
`generate.ts` was folded onto it, which is why it appears in the Phase 3 diff.

`invalid` maps to 500 rather than 400 on purpose: by the time the store refuses
a value, zod has already accepted it against the same bound the CHECK enforces,
so the two disagreeing is our bug, not the caller's.

### 2026-08-23 — `.dev.vars` left pointing at LOCAL Supabase

Deliberate, on request, so manual verification can start without a hosted push.
`.dev.vars` is gitignored, so nothing about this is committed.

To go back to the hosted project, replace the two lines with:

    SUPABASE_URL=https://tponbccoxczjyoqwliyx.supabase.co
    SUPABASE_KEY=<the hosted anon key>

and remember hosted still has none of the five migrations — see the 1.7 note.

### 2026-08-23 — acceptance timestamp was rendering in two time zones (Phase 4 fix)

`formatAcceptedAt` used an unpinned `Intl.DateTimeFormat`. Workers run in UTC and
the teacher's browser does not, so SSR emitted `23 sierpnia 09:31` and hydration
re-rendered `11:31`: a mismatch, and a wrong time on first paint. Moved into
`day-plan-dates.ts` and pinned to `Europe/Warsaw`, alongside the same decision
`todayIsoDate` already makes for resolving `?date=`.

### 2026-08-23 — `GenerationProgress.startedAt` became optional (Phase 4 adaptation)

`plan.md` says to keep `GenerationProgress` unchanged. It could not stay quite
unchanged: the repo's `react-hooks/purity` rule rejects `Date.now()` anywhere in
a component body, which is where the island used to stamp the start of a
generation. Stamping it inside the async mutate was rejected the same way;
stamping it in an effect was rejected by `no cascading setState in effect`. A
lazy state initialiser is the one place React sanctions reading the wall clock,
so the component now settles its own origin when no `startedAt` is given.
Behaviour with an explicit `startedAt` is unchanged.

### 2026-08-23 — potwierdzenie regeneracji tylko na planie zaakceptowanym (poprawka)

Pierwsza wersja `DayPlanEditor` pytała o potwierdzenie przy każdej regeneracji
planu, który ma propozycje. `plan.md` mówi wprost: „Na planie roboczym
potwierdzenie nie jest potrzebne" — autor planu to rozważył. Regeneracja zawsze
usuwa poprzednią partię, ale na planie roboczym nauczyciel wciąż iteruje i nic
w te propozycje nie zainwestował; pytanie jest wtedy tarciem bez decyzji za nim.
Pyta się więc tylko wtedy, gdy jest akceptacja do stracenia.

### 2026-08-23 — jak zamknięto pozycje Manual

Aplikacja była sterowana w prawdziwej przeglądarce: `chrome-headless-shell`
(już obecny w cache Playwrighta na tej maszynie) przez CDP, po natywnym
WebSockecie Node'a — bez instalowania czegokolwiek i bez zmian w `package.json`.
Skrypty pomocnicze zostały w katalogu tymczasowym sesji, nie w repo.

Zamknięte bez wywołań modelu: 3.6, 3.7, 3.8, 4.8, 4.9, 4.10 (a wcześniej 2.9,
4.6, 4.7, 4.11, 4.12). Warto odnotować dwie:

- **4.8** — po wpisaniu tekstu i kliknięciu „Anuluj" poleciało **zero** żądań,
  oba pola wróciły do poprzedniej treści, a wiersz w bazie pozostał nietknięty.
- **4.10** — żądanie zostało zatrzymane w locie (`window.fetch` bez rozwiązania),
  co pozwoliło obejrzeć cały harmonogram wskaźnika: 1 s, 6 s, 14 s, 32 s i 48 s
  pokazały kolejno pięć etapów, z licznikiem sekund i bursztynowym etapem
  ponowienia. Żaden token nie został wydany.

Zamknięte dwoma realnymi generacjami (za zgodą, `openai/gpt-5.6-luna`):
2.6, 2.7, 2.8, 4.5. Przebieg na pustym dniu `2026-11-05`:

1. Generowanie (4 s) → trzy propozycje, plan roboczy → **2.6**
2. Odświeżenie → te same trzy propozycje → **2.8**
3. Edycja tytułu → zapis → akceptacja → odświeżenie → wszystko na miejscu → **4.5**
4. Regeneracja z nowym hasłem, po potwierdzeniu ostrzeżenia → `current_generation`
   = 2, **trzy** wiersze w `activities` (nie sześć), akceptacja cofnięta, `prompt`
   podmieniony → **2.7**

Dane testowe (`2026-09-14`, `2026-11-05`, konta `p3-a@` i `p3-b@test.local`)
zostały w lokalnej bazie — mogą się przydać przy S-03.

### 2026-08-23 — dwie funkcje odczytu ponad plan (przegląd implementacji, F7)

`plan.md` (Faza 2 §1) wymienia **cztery** funkcje serwisu. Jest ich pięć:
`readDayPlanById` doszła, bo trasy `PATCH /activity/[id]` i `POST /accept`
trzymają `plan_id`, a nie datę, i musiały odczytać plan po zapisie tą samą
ścieżką co SSR. Idzie przez `readCurrentActivities` → `selectCurrentGeneration`,
więc lejek konstruktora `CurrentActivity` pozostaje jeden. Odchylenie
niezapisane w chwili wprowadzenia — odnotowane tutaj przy triagu przeglądu.

Przegląd dołożył szóstą, `GET /api/day-plan?date=` (nowa trasa, też spoza planu).
Powód w F5: po nieudanej mutacji wyspa musi porównać się z serwerem, zanim
zaproponuje ponowienie — inaczej „Spróbuj ponownie" stoi nad widokiem sprzed
żądania, którego wynik jest nieznany. Trasa jest tylko do odczytu, oddaje tę samą
kopertę co reszta i odpowiada 404 na dzień bez planu.

### 2026-08-23 — potwierdzenie regeneracji zeszło do schematu (przegląd, F1)

Reguła „regeneracja na zaakceptowanym planie wymaga potwierdzenia" była
zaimplementowana wyłącznie jako `window.confirm` w wyspie, sterowany jej własną
kopią `accepted_at`. Pisarz nie sprawdzał nic. Dwie ścieżki omijały pytanie:
nieudany odczyt SSR renderował dzień jako pusty, a druga karta trzymała stan
sprzed akceptacji. Obie kończyły się usunięciem zaakceptowanej partii bez pytania,
a ten slice nie ma undo.

`save_day_plan_generation` dostała czwarty argument `p_confirm_replace` (domyślnie
`false`), sprawdzany **przed** upsertem — po nim nie ma już śladu po akceptacji,
którą trzeba chronić — z `for update` na tym pierwszym odczycie, żeby druga sesja
nie zaakceptowała planu między sprawdzeniem a zapisem. Odmowa to `U0001`,
odróżnialne od `23514`: pierwsze jest decyzją, drugie naszym błędem.

Trasa generowania sprawdza to samo *przed* wywołaniem modelu — sama odmowa i tak
przyszłaby z funkcji, ale dotarcie do niej kosztowałoby nauczyciela 30 s i tokeny
za partię, która nigdy nie zostanie zapisana.

### 2026-08-23 — akceptacja jest teraz warunkowa (przegląd, F4)

Lustrzane odbicie F1: `accepted_at` ustawiane po samym `plan_id` pozwalało
karcie z nieaktualnym widokiem podpisać propozycje, których nikt na niej nie
widział. `acceptPlanRequestSchema` niesie `expected_generation`, a `setAcceptance`
filtruje po nim. Zero wierszy rozstrzyga jeden dodatkowy odczyt — plan widoczny,
ale przesunięty → `conflict`/409; niewidoczny → `not_found`/404, bez wyroczni
istnienia.

### 2026-08-23 — pełny przebieg mutacyjny pakietu pgTAP (przegląd, F9)

Pozycja 1.6 była odhaczona bez zapisanego dowodu — jako jedyna pozycja Manual w
tej zmianie. Przegląd powtórzył sprawdzenie systematycznie: każdy strażnik
psuty osobno w bazie, pakiet uruchamiany, stan przywracany ze skryptu zbudowanego
z obu migracji. Wynik (numery testów z przebiegu):

| mutacja | czerwienieje |
| --- | --- |
| `drop trigger activities_enforce_generation` | 1, 2, 3, 23 |
| `drop trigger activities_edit_clears_acceptance` | 18, 19 |
| zdjęcie klauzuli `when` z tego triggera | 20, 24 |
| `delete … generation < v_generation` → `< 0` | 13, 14 |
| upsert nie zeruje `accepted_at` | 15 |
| upsert nie podbija licznika | cały plik (kolizja unikalności) |
| `grant execute … to anon` | 25 |
| brak `p_confirm_replace` w funkcji | 8, 9, 10 |
| **`with ordinality` → `row_number() over ()`** | **nic — pakiet zielony** |

Ostatni wiersz to realna luka i powód, dla którego warto było to powtórzyć.
Komentarz przy asercji twierdził, że dowodzi ona wyboru `with ordinality`; dla
trzyelementowej tablicy oba konstrukty dają to samo, więc nie dowodziła niczego
takiego. Żadna asercja behawioralna tego nie rozdzieli — gwarancja siedzi w
wyborze konstruktu, a nie w stanie, który po sobie zostawia. Doszła więc asercja
strukturalna na `pg_get_functiondef`, sprawdzona tą samą mutacją: czerwienieje.
Komentarz mówi teraz, co asercja behawioralna faktycznie pokrywa (same ordinale).

Pakiet: 51 testów, zielony.

### 2026-08-23 — `accepted_at` stemplowane zegarem workera, nie bazy (przegląd, F10)

`plan.md` (Faza 2 §1) mówi „ustawia `accepted_at` na `now()`". Kod pisze
`new Date().toISOString()` z workera. Świadomie: PostgREST nie potrafi wysłać
`now()` jako wartości UPDATE-a bez kolejnego RPC, a robienie drugiej funkcji
Postgresa dla jednej kolumny znaczyłoby więcej schematu niż ta różnica jest
warta.

Co dalej obowiązuje: zwracane `accepted_at` pochodzi z wiersza, nie z tego
zapisu — `accept.ts` odczytuje plan ponownie po zapisie. Ryzyko jest jedno i
ograniczone: CHECK `day_plans_accepted_after_created` odrzuca akceptację
wcześniejszą niż utworzenie planu, co wymagałoby akceptacji w tej samej
milisekundzie co utworzenie *oraz* zegara workera cofniętego względem Postgresa.
Człowiek klikający przycisk tam nie dojdzie, a gdyby doszedł, wychodzi to jako
`invalid` z nazwaną kontrolą, nie jako zły wiersz.

Odnotowane, bo to jedyna trwała wartość w tym slice pochodząca z zegara spoza
bazy — przy zasadzie „baza jest jedynym źródłem prawdy" warto, żeby wyjątek był
wypisany, a nie domyślny.
