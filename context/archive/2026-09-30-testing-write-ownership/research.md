---
date: 2026-09-30T19:23:14+02:00
researcher: Janusz Guzowski
git_commit: 4ca0e581b1343d5df46bda3433e3595f263f6a42
branch: feat/testing-write-ownership
repository: 10x-preschool (arantasar/10x-preschool, private)
topic: "Ochrona zapisu i własności — Faza 3 rolloutu test-planu (ryzyka #3, #4, #7 + dług U0003)"
tags: [research, codebase, day-plan-store, api-routes, rls, pgtap, week-writer, consent, ci]
status: complete
last_updated: 2026-09-30
last_updated_by: Janusz Guzowski
---

# Research: Ochrona zapisu i własności (Faza 3)

**Date**: 2026-09-30T19:23:14+02:00
**Researcher**: Janusz Guzowski
**Git Commit**: `4ca0e58` (gałąź `feat/testing-write-ownership` bez upstreamu)
**Branch**: `feat/testing-write-ownership`
**Repository**: `arantasar/10x-preschool` — repozytorium **prywatne**, więc odnośniki są ścieżkami względnymi (klikalne w IDE), nie permalinkami GitHuba

## Research Question

Faza 3 z [test-plan.md:93](../../foundation/test-plan.md#L93): *„Ochrona zapisu i własności"*, ryzyka #3, #4, #7 plus dług z §6.4 (odmowa pustej partii `U0003` bez asercji pgTAP). Typy testów: integration + pgTAP. Intencja z [change.md](change.md):

- **#3** — dzień zatwierdzony ginie tylko po jawnej zgodzie na ten konkretny dzień; research ma potwierdzić semantykę po S-09/S-10 i zgłosić backport; test nie może być szczęśliwą ścieżką na pustym dniu.
- **#4** — żądanie z konta B wobec zasobu konta A kończy się jawną odmową na warstwie API, nie cichym pustym wynikiem; dwa konta.
- **#7** — kasowanie zdejmuje dokładnie jeden dzień jednego właściciela; sąsiad, drugie konto i wiersze spoza zakresu przeżywają; żądanie wobec cudzego dnia nie kasuje nic.
- Tani wzorzec §6.3 („trasa jako funkcja + atrapa `locals` dwóch kont") i bramka §5 „testy bazy" w CI.

## Summary

Przesłanka fazy jest trafna co do luk, ale w trzech miejscach opisuje stan sprzed miesiąca. Kształt planu wyznacza pięć ustaleń:

1. **Semantyka #3 potwierdzona, ale „zgoda per data" to już nieprawda — i obie ścieżki mają różne zgody.** Tydzień: dzień zatwierdzony ginie tylko wtedy, gdy `p_confirm_accepted` nazywa **datę i `accepted_at`**, które nauczyciel widział ([20260929120000:124-134](../../../supabase/migrations/20260929120000_week_writer_consent_versions.sql#L124-L134)). Stan po przeglądzie S-10, nie „per data" z [next-actions.md:246-247](../../foundation/next-actions.md#L246-L247). Dzień: zgoda to nadal **boolean** `confirm_replace`. Wiąże się z jedną datą żądania, ale nie z wersją zatwierdzenia ([DayPlanEditor.tsx:318-332](../../../src/components/plan/DayPlanEditor.tsx#L318-L332), [20260920110000:95-99](../../../supabase/migrations/20260920110000_theme_follows_haslo.sql#L95-L99)); S-10 świadomie zostawił tę ścieżkę bez zmian. Backport do §2, §3 i §6.3 jest potrzebny (patrz niżej).

2. **Ryzyko #3 ma już mocny dowód na poziomie bazy, a lukę na poziomie trasy.** pgTAP pokrywa obie funkcje zapisu: U0001 bez zgody, stary batch i zatwierdzenie nietknięte, wywołanie konta B nie rusza dnia konta A, zgoda na inny dzień lub wcześniejsze zatwierdzenie nie wystarcza, null nie zgadza się na nic. Braki: **trasa `generate.ts` nie ma żadnego testu swojej wstępnej odmowy** (`accepted && !confirm_replace` → 409 **przed płatnym wywołaniem modelu**), a writer tygodnia nie ma asercji „dzień zatwierdzony spoza `p_days` przeżywa" — to ścieżka „Tylko do przejrzenia". Do tego §3 i notatka w §3 twierdzą, że e2e #3 „celowo nie dotyka", a [regenerate-confirmation.spec.ts](../../../tests/e2e/regenerate-confirmation.spec.ts) (S-10, 2026-09-28) pokrywa odmowę w oknach.

3. **Powierzchnia IDOR (#4) to dwie trasy adresowane identyfikatorem, nie wszystkie.** Trasy adresowane datą (`GET`/`DELETE /api/day-plan`, `generate`, `week/save`, `month`) nie potrafią nazwać cudzego wiersza: data plus sesja to zawsze wiersz wołającego. Dla nich własnością jest „operacja B na dacie D nie dotyka wiersza A na D", nie „odmowa". **Jawna odmowa ma sens tylko tam, gdzie klient podaje id:** `POST /api/day-plan/accept` (`plan_id`) i `PATCH /api/day-plan/activity/[id]`. Obie odmawiają `404` + `retryable: false` bez zapisu, bo magazyn jawnie sprawdza pusty wynik ([day-plan-store.ts:432-452](../../../src/lib/services/day-plan-store.ts#L432-L452), [:511-530](../../../src/lib/services/day-plan-store.ts#L511-L530)). Test ma tylko `activity/[id]`, jednym przypadkiem na jednym koncie. `accept.ts` i `index.ts` nie mają pliku testu w ogóle.

4. **Atrapa Supabase nie potrafi udowodnić własności — to rozstrzyga kształt wzorca §6.3.** Trasy nie filtrują po `user_id`: tożsamość jedzie wyłącznie w kliencie z `locals` ([day-plan-store.ts:25-31](../../../src/lib/services/day-plan-store.ts#L25-L31)). Test na atrapie „dwóch kont" może więc dowieść dwóch rzeczy: że trasa używa klienta z `locals`, oraz że niewidoczność zamienia na jawne 404 bez zapisu. Nie dowiedzie, że RLS cokolwiek ukrywa, bo atrapa zwraca to, co jej kazano. Tanią warstwą, która sprawdza **trasę i RLS naraz** bez HTTP, przeglądarki i middleware, jest trasa wołana jako funkcja z **prawdziwym klientem `supabase-js` zalogowanym jako A albo B** na lokalnym stosie. Ta sama faza i tak wprowadza lokalną bazę do CI — to decyzja dla planu (patrz Open Questions).

5. **`U0003` jest niezapięty szerzej, niż mówi §6.4.** Zero asercji na **czterech** gałęziach, nie jednej: pusta partia w writerze dnia oraz pusty zestaw dni, zła data i pusta partia dnia w writerze tygodnia ([20260929120000:72-108](../../../supabase/migrations/20260929120000_week_writer_consent_versions.sql#L72-L108)). Jedyne wywołanie z `'[]'` w pgTAP idzie jako `anon` i kończy się `42501` na grancie, zanim ciało funkcji ruszy ([day_plan_write.test.sql:635-641](../../../supabase/tests/database/day_plan_write.test.sql#L635-L641)). Liczby w §4/§6.4 są nieaktualne: dziś to **4 pliki i 98 asercji** (6 + 50 + 23 + 19), nie „3 pliki, 73 asercje".

Bramka §5 „testy bazy" do CI: `supabase` jest już devDependency (`^2.23.4`, [package.json:64](../../../package.json#L64)), a dokumentacja Supabase podaje dla pgTAP `supabase db start` + `supabase test db` (sam Postgres, bez GoTrue/PostgREST). Testy tras na prawdziwym kliencie wymagałyby pełnego `supabase start`.

## Detailed Findings

### Ryzyko #3 — semantyka po S-09/S-10

**Writer dnia** — `save_day_plan_generation`, żywa definicja w [20260920110000_theme_follows_haslo.sql:56-126](../../../supabase/migrations/20260920110000_theme_follows_haslo.sql#L56-L126):

- kolejność odmów: `U0003` (pusta partia, :74-80) → `select … for update` na `(auth.uid(), p_plan_date)` (:82-87) → `U0002` przy `p_require_absent` (:89-93) → `U0001`, gdy dzień zatwierdzony i `not p_confirm_replace` (:95-99);
- dopiero potem upsert: podbicie `current_generation`, `accepted_at = null`, skasowanie starszych generacji tylko **tego** `plan_id`, wstawienie nowej partii (:101-124);
- wszystko pod `auth.uid()`, `security invoker`, więc dzień innej daty ani innego konta nie wchodzi w zakres.

**Trasa dnia** — [generate.ts:88-108](../../../src/pages/api/day-plan/generate.ts#L88-L108) czyta dzień przed modelem i odmawia 409, gdy `existing.plan.accepted_at && !confirm_replace` (:101-105). Komentarz nazywa to wprost: „that refusal is the enforcement point and this is not" — ta wstępna kontrola chroni **pieniądze i 10–30 s**, nie dane. Wyścig za nią łapie `U0001` z writera → `conflict` → 409, **bez ponowienia** (`saveGeneration` nie ponawia `conflict`, [day-plan-store.ts:255-260](../../../src/lib/services/day-plan-store.ts#L255-L260)).

**Wyspa dnia** — [DayPlanEditor.tsx:318-332](../../../src/components/plan/DayPlanEditor.tsx#L318-L332): pyta tylko o dzień zatwierdzony, `confirm_replace: approved !== null`. Ponowienie wchodzi w `generate()` od nowa i pyta ponownie (:335-340), więc zgoda nie jest odtwarzana z domknięcia.

**Writer tygodnia** — `save_week_plan_generation(p_prompt, p_days jsonb, p_confirm_accepted jsonb)`, [20260929120000:50-168](../../../supabase/migrations/20260929120000_week_writer_consent_versions.sql#L50-L168):

- zgoda to lista `{plan_date, accepted_at}`, porównywana z wierszem trzymanym `for update`; zatwierdzenie ponowne dostaje nowe `accepted_at`, więc stara zgoda go nie obejmuje (:119-134);
- każdy raise w pętli wycofuje dni już zapisane w tym wywołaniu (jedna transakcja);
- dzień spoza `p_days` nie jest dotykany — pętla iteruje wyłącznie `p_days` (:84).

**Trasa tygodnia** — [week/save.ts:77-101](../../../src/pages/api/day-plan/week/save.ts#L77-L101): przekazuje `confirm_accepted` bez zmian. Zod odrzuca zgodę na dzień, którego zestaw nie zapisuje ([day-plan-contract.ts:326-338](../../../src/lib/services/day-plan-contract.ts#L326-L338)). `U0001` wraca jako 409 z datą w zdaniu (`weekConflictMessage`, [day-plan-store.ts:289-298](../../../src/lib/services/day-plan-store.ts#L289-L298)).

**Wyspa tygodnia** — [week-generation.ts:64-77](../../../src/lib/week-generation.ts#L64-L77) dzieli dni na `targets`, `untouched` i `consented`. [WeekPlanBoard.tsx:331](../../../src/components/plan/WeekPlanBoard.tsx#L331) wysyła `confirm_accepted: consented` „exactly as the teacher confirmed them, never recomputed from the board".

**Wniosek dla intencji #3.** „Ginie tylko po jawnej zgodzie na ten konkretny dzień" jest prawdą dla obu ścieżek. Precyzyjnie:
- tydzień — zgoda na **ten dzień w tej wersji zatwierdzenia**;
- dzień — zgoda na **ten dzień** (boolean w żądaniu jednej daty), bez wiązania z wersją. Karta otwarta, zatwierdzona na nowo w drugiej karcie po zgodzie w pierwszej — zastąpi nową wersję. To asymetria świadomie zostawiona przez S-10 ([plan-brief.md:42](../../archive/2026-09-28-accepted-day-replacement/plan-brief.md#L42)), nie cel tej fazy; test nie powinien jej betonować jako własności.

**Co już pokrywa #3:**

| Warstwa | Co dowodzi | Gdzie |
|---|---|---|
| pgTAP, dzień | `U0001` bez zgody; batch i zatwierdzenie nietknięte po odmowie; ze zgodą: ten sam `plan_id`, licznik 2, stary batch usunięty, zatwierdzenie cofnięte | [day_plan_write.test.sql:161-243](../../../supabase/tests/database/day_plan_write.test.sql#L161-L243) |
| pgTAP, dzień, dwa konta | B generuje na datę A → własny plan; B nie wstawi aktywności do planu A (`42501`); plan A (zatwierdzony) nietknięty | [day_plan_write.test.sql:526-576](../../../supabase/tests/database/day_plan_write.test.sql#L526-L576) |
| pgTAP, tydzień | zgoda zastępuje i cofa zatwierdzenie; brak zgody → `U0001` z datą, **draft zapisany wcześniej w pętli wycofany**; zgoda na inną datę, na wcześniejsze zatwierdzenie, `[null]`, `null`, pominięta lista → odmowa | [week_plan_write.test.sql:99-270](../../../supabase/tests/database/week_plan_write.test.sql#L99-L270) |
| trasa tygodnia | zgody przekazane dosłownie; pominięte → `[]`; 409 bez ponowienia; zgoda na dzień spoza zestawu → 400 | [week/save.test.ts:106-170](../../../src/pages/api/day-plan/week/save.test.ts#L106-L170), [:259-302](../../../src/pages/api/day-plan/week/save.test.ts#L259-L302) |
| unit | treść okien i podział na targets/untouched/consented | `confirmations.test.ts`, `week-generation.test.ts` |
| e2e | odmowa w oknie dnia i w obu oknach tygodnia nie wysyła żądania i zostawia zatwierdzenie | [regenerate-confirmation.spec.ts](../../../tests/e2e/regenerate-confirmation.spec.ts) |

**Luki #3 (kandydaci do planu):**

- **Trasa dnia, 409 przed modelem**: dzień zatwierdzony + `confirm_replace: false` → 409, `fetch` **nie** wołany (brak płatnej generacji), `rpc` nie wołany. Kontrola pozytywna na tym samym dniu: `confirm_replace: true` → `rpc` raz z `p_confirm_replace: true`. Wyścig: pre-check przepuszcza, `rpc` odpowiada `U0001` → 409 i `rpc` wołany **dokładnie raz**. Dziś [generate.test.ts](../../../src/pages/api/day-plan/generate.test.ts) nie ma żadnego przypadku z `accepted_at` w `existingPlan`.
- **Tydzień, sąsiad poza zestawem**: pgTAP — zestaw zawierający tylko draft zostawia zatwierdzony dzień tego samego tygodnia nietkniętym (hasło, licznik, `accepted_at`, batch). Jedyny dowód na „Tylko do przejrzenia" poniżej przeglądarki.
- **Tydzień, dwa konta**: pgTAP — B zapisuje tydzień na daty, na których A ma dzień zatwierdzony, bez zgody → sukces dla B, A nietknięty. Writer tygodnia dziś ma w teście tylko jedno konto (fixture: jeden użytkownik, [week_plan_write.test.sql:65-67](../../../supabase/tests/database/week_plan_write.test.sql#L65-L67)).
- **Dzień, sąsiad**: regeneracja dnia X ze zgodą zostawia zatwierdzony dzień X+1 nietknięty — w `day_plan_write` nie ma jawnej asercji z zatwierdzonym sąsiadem.

### Ryzyko #4 — własność na warstwie API

**Mechanizm.** Middleware tworzy jeden klient na żądanie z ciasteczek i wkłada go do `locals.supabase` ([middleware.ts:11-17](../../../src/middleware.ts#L11-L17)). Każda trasa sprawdza wyłącznie `locals.user` (401) i obecność klienta (500 `unconfigured`). Własność jest w całości sprawą RLS, zapisaną jako konwencja: „No function filters on `user_id`… the policies do it" ([day-plan-store.ts:29-31](../../../src/lib/services/day-plan-store.ts#L29-L31)).

**Mapa tras:**

| Trasa | Adresowanie | Zachowanie wobec cudzego zasobu | Test dziś |
|---|---|---|---|
| `GET /api/day-plan?date=` | data | B widzi **swój** dzień D lub 404 „Ten dzień nie ma jeszcze planu." | brak testu trasy; e2e [day-plan-ownership.spec.ts:85-87](../../../tests/e2e/day-plan-ownership.spec.ts#L85-L87) |
| `DELETE /api/day-plan?date=` | data | kasuje **swój** D albo 404 „Ten dzień nie ma planu do usunięcia." | brak testu trasy; e2e delete-scope |
| `POST /api/day-plan/accept` | **`plan_id`** | update nic nie trafia → dodatkowy odczyt → nie widać → `not_found` 404 „Nie znaleziono tego planu dnia." ([store:511-530](../../../src/lib/services/day-plan-store.ts#L511-L530)) | **brak** |
| `PATCH /api/day-plan/activity/[id]` | **`activity id`** | odczyt przed zapisem nic nie widzi → 404 „Nie znaleziono tej propozycji.", `update` nie wołany ([store:432-436](../../../src/lib/services/day-plan-store.ts#L432-L436)) | jeden przypadek, jedno konto ([[id].test.ts:100-111](../../../src/pages/api/day-plan/activity/%5Bid%5D.test.ts#L100-L111)) |
| `POST /api/day-plan/generate` | data | zapis pod `auth.uid()` — nowy wiersz B, A nietknięty | brak przypadku dwóch kont |
| `POST /api/day-plan/week/save` | daty | j.w., per dzień | brak przypadku dwóch kont |
| `GET /api/day-plan/month?month=` | miesiąc | czyta przez RLS | [month.test.ts](../../../src/pages/api/day-plan/month.test.ts) — atrapa, bez kont |
| `refine`, `week/day`, `week/outline` | — | nie dotykają bazy | — |

**Tłumaczenie błędów** ([day-plan-store.ts:106-167](../../../src/lib/services/day-plan-store.ts#L106-L167), [day-plan-http.ts:71-90](../../../src/lib/services/day-plan-http.ts#L71-L90)): `not_found` → 404, `retryable: false`, **bez rozróżnienia „nie istnieje" od „nie twoje"** (zamierzone, żeby nie było wyroczni istnienia). `42501` → `config` → **500 „Skontaktuj się z administratorem"**. Dziś żadna trasa nie dochodzi do `42501` przy cudzym zasobie, bo magazyn odmawia wcześniej na pustym odczycie. Test na prawdziwej bazie złapałby jednak regresję, w której cudzy dostęp zmienia 404 w mylące 500. Na atrapie jest ona niewidoczna.

**Wniosek dla intencji #4.** „Jawna odmowa, nie cichy pusty wynik" ma sens dla `accept` i `activity/[id]` (id). Dla tras adresowanych datą właściwą asercją jest „B na dacie D widzi i zmienia wyłącznie swoje; wiersz A na D nietknięty". Test „B dostaje 404 na dacie A" przechodzi też przy błędzie, w którym trasa czyta plan A i zwraca go jako plan B — tyle że wtedy A też musiałby widzieć dane w odpowiedzi B. Kontrola pozytywna (właściciel widzi swój) jest obowiązkowa, tak jak w e2e.

**Istniejąca infrastruktura:**
- atrapa [`__fixtures__/supabase.ts`](../../../src/lib/services/__fixtures__/supabase.ts) — **brak `.delete()`** i brak `from("day_plans").update()` (jest tylko `activities.update`). `setAcceptance` i `deleteDayPlan` nie przejdą przez nią bez rozszerzenia ([supabase.ts:157-178](../../../src/lib/services/__fixtures__/supabase.ts#L157-L178));
- konta e2e i zasiew przez klucz serwisowy: [tests/e2e/support/supabase-admin.ts](../../../tests/e2e/support/supabase-admin.ts) (`ensureTeacher`, `seedDayPlan`, `deleteSeededPlans`), konfiguracja [.env.e2e.example](../../../.env.e2e.example). Reguła „nigdy nie asertuj przez klucz serwisowy" (:5-15) przenosi się 1:1 na test trasy z prawdziwym klientem.

### Ryzyko #7 — zakres kasowania

**Ścieżka**: [index.ts:75-96](../../../src/pages/api/day-plan/index.ts#L75-L96) → [deleteDayPlan](../../../src/lib/services/day-plan-store.ts#L557-L573): `delete().eq("plan_date", D).select("id").maybeSingle()`. Pusty wynik → `not_found` 404. **Bez ponowienia** (celowo: ponowienie po zgubionej odpowiedzi zamieniłoby sukces w 404). Aktywności schodzą kaskadą `activities_plan_id_user_id_fkey`.

**Co już pokrywa #7:**
- pgTAP [day_plan_delete.test.sql](../../../supabase/tests/database/day_plan_delete.test.sql): przywilej `delete` (:91-94); własny dzień = 1 wiersz (:103-112); kaskada zabiera propozycje dnia (:118-123), ale nie drugiego dnia tego samego konta (:129-134); skasowany dzień wolny dla `p_require_absent` i startuje od generacji 1 (:151-168); kasowanie dnia B przez A = 0 wierszy, bez błędu (:190-199). Z komentarza pod :181-188: przy tym zapytaniu wiersz B ukrywa polityka **select**, nie delete;
- pgTAP [rls_isolation.test.sql:67-88](../../../supabase/tests/database/rls_isolation.test.sql#L67-L88): delete A wobec wierszy B (filtr `user_id`) = 0;
- e2e [day-plan-delete-scope.spec.ts](../../../tests/e2e/day-plan-delete-scope.spec.ts): zatwierdzony dzień A kasowany, sąsiad A i **ten sam dzień B** przeżywają; [day-plan-delete-confirmation.spec.ts](../../../tests/e2e/) — odmowa w oknie.

**Luki #7:**
- **Kształt zapytania aplikacji na dwóch kontach tej samej daty**: pgTAP nie ma „A: `delete … where plan_date = D`, gdy A i B mają D → 1 wiersz, plan i propozycje B nietknięte". `day_plan_delete` ma B na innej dacie (06-03), a `rls_isolation` filtruje po `user_id`, nie po dacie. Fixture `rls_isolation` ma przy tym A i B na tej samej dacie 2026-03-02, więc to jedna asercja więcej, nie nowy plik.
- **Trasa DELETE nie ma testu**: 204 i brak body; `eq("plan_date", D)` dokładnie z parametrem; 404 non-retryable przy niewidocznym dniu; zła data → 400 bez wywołania bazy; brak sesji → 401 bez bazy; **`delete` wołany dokładnie raz przy błędzie** (brak ponowienia); nieznany błąd → 503, nie 204.
- Obrona w głąb przy zepsutym RLS: `.maybeSingle()` na wielowierszowym delete — patrz Open Questions.

### Dług `U0003`

Rzucany w pięciu miejscach żywych definicji, **nieasertowany w żadnym**:

| Funkcja | Warunek | Linie |
|---|---|---|
| `save_day_plan_generation` | `p_activities` null / nie tablica / `'[]'` | [20260920110000:74-80](../../../supabase/migrations/20260920110000_theme_follows_haslo.sql#L74-L80) |
| `save_week_plan_generation` | `p_days` null / nie tablica / `'[]'` | [20260929120000:72-76](../../../supabase/migrations/20260929120000_week_writer_consent_versions.sql#L72-L76) |
| j.w. | `plan_date` brak lub nie `YYYY-MM-DD` | [:92-97](../../../supabase/migrations/20260929120000_week_writer_consent_versions.sql#L92-L97) |
| j.w. | partia dnia pusta | [:103-108](../../../supabase/migrations/20260929120000_week_writer_consent_versions.sql#L103-L108) |

Wymagany kształt z §6.4 ([test-plan.md:251-259](../../foundation/test-plan.md#L251-L259)): `throws_ok(… '[]'::jsonb …, 'U0003')`, „licznik nie drgnął, stara partia nietknięta" i pusta partia **na dniu już zaplanowanym**, żeby przypiąć kolejność `U0003` przed `U0002`. Odmowa pustej partii stoi **przed** `for update`, więc przypiąć trzeba też `U0003` przed `U0001` na dniu zatwierdzonym. Inaczej przeniesienie bloku niżej zamieniłoby „nasz błąd" w „odśwież stronę". Dla tygodnia: pusta partia dnia **po** dniu zapisanym wcześniej w tej samej pętli wycofuje także ten dzień — ta sama własność, którą [week_plan_write.test.sql:134-167](../../../supabase/tests/database/week_plan_write.test.sql#L134-L167) dowodzi dla `U0001`.

Strona aplikacji już jest: `U0003` → `invalid` → 500, nie `transient` ([day-plan-store.ts:127-143](../../../src/lib/services/day-plan-store.ts#L127-L143)); testy tras [generate.test.ts:159](../../../src/pages/api/day-plan/generate.test.ts#L159) i [week/save.test.ts:304](../../../src/pages/api/day-plan/week/save.test.ts#L304) na atrapie. Brakuje wyłącznie dowodu, że baza w ogóle rzuca ten kod.

### Bramka §5 „testy bazy" w CI

- [ci.yml](../../../.github/workflows/ci.yml): jeden job `ci` (`npm ci` → `astro sync` → lint → `npm test` → build) i doradczy `content-safety-gate`. Bez Supabase.
- `npm run test:db` = `supabase test db` ([package.json:17](../../../package.json#L17)). CLI jako devDependency, więc po `npm ci` wystarczy `npx supabase …` — `supabase/setup-cli` jest opcją, nie wymogiem.
- Dokumentacja Supabase (Context7, `/websites/supabase`, checked: 2026-09-30): `supabase db start` + `supabase test db` dla samego pgTAP; `supabase start` dla pełnego stosu. Runner `ubuntu-latest` ma Dockera.
- [config.toml](../../../supabase/config.toml): Postgres 17, `db.seed.enabled = true` — dla `db start` do sprawdzenia, czy seed istnieje i czy nie przeszkadza.
- Bramka zostaje **doradcza** (§5: brak ochrony gałęzi na darmowym planie prywatnego repo). Osobny job zamiast kroku w `ci`, na wzór `content-safety-gate`: pgTAP nie potrzebuje sekretów ani buildu, a czerwień bazy ma być widoczna osobnym znaczkiem.

## Code References

- `src/pages/api/day-plan/generate.ts:88-108` — wstępna odmowa dnia zatwierdzonego (409 przed modelem), nieprzetestowana
- `src/pages/api/day-plan/accept.ts:23-51` — trasa adresowana `plan_id`; brak pliku testu
- `src/pages/api/day-plan/index.ts:25-96` — `GET`/`DELETE` po dacie; brak pliku testu
- `src/pages/api/day-plan/activity/[id].ts:19-21` — „Authorization is RLS's, not this route's… answer is 404"
- `src/lib/services/day-plan-store.ts:106-167` — kody Postgresa → kategorie (`42501`→config, `U0001/2`→conflict, `U0003`→invalid)
- `src/lib/services/day-plan-store.ts:248-263` — ponowienie `saveGeneration` poza `conflict`
- `src/lib/services/day-plan-store.ts:490-531` — `setAcceptance`: pusty update → odczyt → `conflict` albo `not_found`
- `src/lib/services/day-plan-store.ts:557-573` — `deleteDayPlan`: po dacie, bez ponowienia
- `src/lib/services/day-plan-http.ts:71-90,155-170` — statusy i komunikaty kategorii
- `src/lib/services/__fixtures__/supabase.ts:115-183` — atrapa PostgREST; brak `delete()` i `day_plans.update()`
- `src/components/plan/DayPlanEditor.tsx:318-332` — zgoda dnia jako boolean
- `src/lib/week-generation.ts:64-77`, `src/components/plan/WeekPlanBoard.tsx:331` — zgoda tygodnia jako lista `{plan_date, accepted_at}`
- `supabase/migrations/20260920110000_theme_follows_haslo.sql:56-126` — żywy writer dnia
- `supabase/migrations/20260929120000_week_writer_consent_versions.sql:50-182` — żywy writer tygodnia i granty
- `supabase/migrations/20260823095136_day_plan_generation_write_contract.sql:59-95` — trigger `enforce_activity_generation` (`42501` dla planu niewidocznego)
- `supabase/tests/database/*.test.sql` — 4 pliki, 98 asercji; zero `U0003`
- `tests/e2e/regenerate-confirmation.spec.ts` — e2e #3 (odmowa w oknach), istniejące wbrew §3
- `tests/e2e/support/supabase-admin.ts` — konta A/B i zasiew kluczem serwisowym
- `.github/workflows/ci.yml` — bez Supabase

## Architecture Insights

- **Własność = RLS + `security invoker` + klient z sesji.** Żadna warstwa aplikacji nie filtruje po `user_id` i jest to reguła, nie przeoczenie. Test własności, który nie przechodzi przez prawdziwe polityki, testuje tylko to, że trasa **nie obchodzi** tego mechanizmu.
- **Niewidoczne = nieistniejące, jawnie.** Magazyn zamienia pusty wynik mutacji na `not_found` z polskim `userMessage`. „Cichy pusty wynik" z intencji #4 jest więc już zamknięty w kodzie; faza ma go **przypiąć**, nie naprawić.
- **Dwa rodzaje odmowy przy #3.** Wstępna kontrola w trasie chroni koszt, writer chroni dane. Test tylko jednej z nich zostawia drugą bez dowodu. Wyścig między nimi to osobny przypadek (409 bez ponowienia).
- **Mutacje na pgTAP są już zwyczajem.** Każdy plik pgTAP deklaruje „every assertion below was checked by mutation". Nowe asercje fazy muszą przejść ten sam rytuał (lessons: „Kryterium weryfikacji musi móc nie przejść").

## Historical Context (from prior changes)

- `context/archive/2026-09-28-accepted-day-replacement/plan-brief.md:42` — S-10 zostawił ścieżkę dnia z `confirm_replace` bez zmian
- `context/archive/2026-09-28-accepted-day-replacement/reviews/impl-review.md` — źródło przejścia „per data" → „per data + `accepted_at`" (migracja 20260929120000, nagłówek :5-18)
- `context/archive/2026-08-29-testing-generation-contract-boundary/` — Faza 1: runner, atrapa `locals`, pierwsza ręczna weryfikacja `U0003` przez `psql`
- `context/archive/2026-08-27-delete-day-plan/` — S-05, powstanie `day_plan_delete.test.sql` i decyzji „404, nie 403"
- `context/foundation/next-actions.md:240-260, 522-525` — Krok 6 i Pułapka 2 (warunek wejścia fazy spełniony)
- `context/foundation/test-plan.md:99-115` — notatka o e2e poza rolloutem (#3 „świadomie pominięte" — nieaktualne)

## Related Research

- `context/archive/2026-08-29-testing-generation-contract-boundary/research.md`
- `context/archive/2026-08-31-testing-content-safety-gate/research.md`

## Backport do test-planu (zgłoszenie dla `/10x-test-plan`)

1. **§2 Risk Response #3, kolumna „Co dowodzi ochrony"** ([test-plan.md:74](../../foundation/test-plan.md#L74)) i **cel Fazy 3 w §3** ([:93](../../foundation/test-plan.md#L93)): „Zaakceptowany dzień przeżywa regenerację…" → „Zatwierdzony dzień przeżywa każdą regenerację i generowanie tygodnia, na które nie padła zgoda nazywająca ten dzień (w tygodniu: także jego `accepted_at`); zgoda zastępuje go i cofa zatwierdzenie". Kolumna „Kontekst do ugruntowania" dostaje „zgoda dnia (boolean) vs zgoda tygodnia (data + `accepted_at`)".
2. **§3, notatka o e2e** ([:99-115](../../foundation/test-plan.md#L99-L115)): #3 ma warstwę przeglądarkową od S-10 (`regenerate-confirmation.spec.ts`, odmowa w oknach). Pułapka 2 jest spełniona.
3. **§4 wiersz database** ([:126](../../foundation/test-plan.md#L126)) i **§6.4** ([:244-254](../../foundation/test-plan.md#L244-L254)): 4 pliki (`week_plan_write.test.sql` doszedł w S-10), 98 asercji; dług `U0003` obejmuje też trzy gałęzie writera tygodnia.
4. **Anchor correction dla #4**: powierzchnia jawnej odmowy to trasy adresowane id (`accept`, `activity/[id]`). Trasy datowe asertuje się jako „nie dotyka wiersza drugiego konta", nie jako odmowę.
5. **next-actions.md:246-247**: „zgoda per data w S-10" → „zgoda per data i `accepted_at`".

## Open Questions

1. **Wzorzec §6.3: atrapa czy prawdziwy klient?** (decyzja dla `/10x-plan`)
   - **(a) Atrapa dwóch kont w `npm test`** — sekundowa, bez Dockera, w istniejącej bramce CI. Dowodzi, że trasa używa `locals.supabase` i zamienia niewidoczność na 404 bez zapisu. Nie dowodzi RLS. Wymaga rozszerzenia atrapy o `delete()` i `day_plans.update()`.
   - **(b) Trasa jako funkcja + prawdziwy `supabase-js` zalogowany jako A/B na lokalnym stosie** — osobny config Vitest, na wzór `vitest.gate.config.ts`, żeby `npm test` został bez kluczy. Dowodzi trasy i RLS naraz, łapie regresję 404→500. Wymaga pełnego `supabase start` w CI (GoTrue + PostgREST), nie samego `db start`.
   - Rekomendacja: **(b) dla asercji własności (#4, #7 na trasie) i (a) dla zachowania tras bez własności** (409 przed modelem, brak ponowienia DELETE, 400/401 bez bazy). To dzieli pracę zgodnie z §1 „koszt × sygnał". Jeśli (b) okaże się za drogie w CI, zostaje lokalne jak e2e, a do CI trafia tylko pgTAP.
2. **`.maybeSingle()` na wielowierszowym `DELETE`**: czy PostgREST wycofuje transakcję, gdy mutacja z odpowiedzią singular dotknie >1 wiersza (obrona w głąb przy zepsutym RLS)? Niezweryfikowane w tej sesji. Rozstrzyga się tylko na prawdziwym PostgREST (opcja 1b) albo w dokumentacji — nie w pgTAP.
3. **Asymetria zgody dnia (boolean) vs tygodnia (wersja)**: poza zakresem fazy testowej, ale warta pozycji w `next-actions.md` albo roadmapie, żeby nie zginęła. Faza 3 nie powinna jej przypinać testem jako zamierzonej.
4. **`supabase db start` a `db.seed.enabled = true`**: `sql_paths = ["./seed.sql"]` ([config.toml:65](../../../supabase/config.toml#L65)), a `supabase/seed.sql` **nie istnieje**. Lokalnie to działa (e2e i `test:db` biegną), więc brak pliku najpewniej kończy się ostrzeżeniem, nie błędem. Potwierdzić przy pierwszym przebiegu joba CI.
5. **Czas joba bazy w CI**: `db start` pobiera obraz Postgresa przy każdym przebiegu (brak cache Dockera między przebiegami). Zmierzyć przy pierwszym przebiegu i zapisać w §6.7.
