<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Runner testów + granica model→kontrakt→zapis

- **Plan**: `context/changes/testing-generation-contract-boundary/plan.md`
- **Scope**: Fazy 1–5 (pełny plan, 41/41 pozycji Progress `[x]`)
- **Date**: 2026-08-30
- **Verdict**: NEEDS ATTENTION → APPROVED (triage 2026-08-30 — wszystkie 10 uwag naprawionych, bramki przebiegnięte ponownie)
- **Findings**: 0 critical, 6 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

Kryteria automatyczne przebiegnięte ponownie i niezależnie: 26/26 zielonych
(`npm ls vite`, `npm test` 57/57, `tsc --noEmit`, `npm run lint`, `npm run build`,
grep na `dist/`, mutacja 1.7, `npm run test:db` 71/71, `supabase db reset`,
odmowa U0003 na żywej bazie, cztery kryteria §5 na `test-plan.md`).
Każda planowana zmiana pliku ma werdykt MATCH; zero scope creepu; żadna z ośmiu
granic `## What We're NOT Doing` nie została naruszona.

## Findings

### F1 — Awaria transportu w trakcie czytania body straciła automatyczne ponowienie

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/activity-generator.ts:255-269
- **Detail**: `response.json().catch(() => null)` skleja trzy różne warunki w jedno `null`, a nowa gałąź `if (!choice)` klasyfikuje wszystkie trzy jako `invalid`, którego `runWithBudget` nie ponawia. Jeden z tych warunków to **awaria transportu po nagłówkach**: 200 przyszło, po czym połączenie padło albo `AbortSignal.timeout` zadziałał w trakcie strumienia — wtedy odrzuca `response.json()`, a nie `fetch`. Zweryfikowane empirycznie odrzuceniem `json()` przez `DOMException("AbortError")`: wynik to `category: "invalid"`, `errorType: "unrecognized_response_shape"`, `fetchCalls: 1`. Przed Fazą 2 była to klasa `transient` z dwoma podejściami. Ironia jest podwójna: faza istniała po to, żeby log przestał kłamać, a ta ścieżka nazywa teraz zerwane połączenie „odpowiedzią bez rozpoznawalnego kształtu". Skutek ograniczony — `RETRYABLE_BY_CATEGORY.invalid` to `true`, więc nauczyciel wciąż dostaje przycisk ponowienia — ale automatyczne wyleczenie zniknęło dla realnej klasy przejściowej.
- **Fix A ⭐ Recommended**: Rozdzielić „body się nie sparsowało" od „sparsowane body nie ma `choices`" — pierwsze zostaje `transient`, drugie `invalid`.
  - Strength: Przywraca ponowienie dokładnie tam, gdzie ma sens, i zostawia naprawę Fazy 2 nietkniętą tam, gdzie była słuszna. Fixture do testu transportu jest trywialny, a `unparsableBodyResponse` już pokrywa drugi przypadek.
  - Tradeoff: Jedna gałąź więcej w `callOpenRouter`; trzeba przechwycić wynik `json()` zamiast `.catch(() => null)`.
  - Confidence: HIGH — zachowanie obu ścieżek zmierzone, nie wywnioskowane.
  - Blind spot: Nie zmierzyłem, jak często ta klasa występuje realnie u dostawcy.
- **Fix B**: Zostawić kod, poprawić komentarz tak, żeby przyznawał, że gałąź obejmuje też awarię transportu.
  - Strength: Zero ryzyka regresji; dokumentuje świadomy kompromis.
  - Tradeoff: Utrwala utratę ponowienia i mylącą etykietę w logu operatora.
  - Confidence: MEDIUM — zależy, czy uznasz utratę auto-retry za akceptowalną.
  - Blind spot: Brak danych o częstości zerwań w trakcie strumienia na Workers.
- **Decision**: FIXED via Fix A — rozdzielone po typie odrzucenia (`SyntaxError` → `invalid`/`unparsable_response_body`; reszta → `transient`/`response_body_aborted`). Nowy fixture `abortedBodyResponse`, dwa nowe testy, mutacja potwierdzona (sklejenie klas czerwieni dokładnie te dwa).

### F2 — Odmowa U0003 nie ma żadnej asercji na żadnej warstwie

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Success Criteria
- **Location**: supabase/migrations/20260830092600_reject_empty_activity_batch.sql:57-62
- **Detail**: Usunąłem cały blok `if` z migracji, zresetowałem bazę i przebiegłem oba zestawy: **71 asercji pgTAP i 57 testów Vitest pozostaje zielonych**. Odmowa pustej partii jest sercem Fazy 4 i jedyną rzeczą, którą ta migracja wnosi, a nic jej nie pilnuje. Narusza to zarówno `lessons.md` („Kryterium weryfikacji musi móc nie przejść"), jak i metodę zadeklarowaną w nagłówku `day_plan_write.test.sql:11-14` — *„every assertion below was checked by mutation… an assertion that stays green with the trigger dropped is not testing the trigger"*. Weryfikacja 4.5 była realna, ale jednorazowa i ręczna. Osobno: kolejność U0003 przed U0002 też jest niezapięta, choć analogiczna para U0001/U0002 została celowo zapięta przypadkiem „oba strażniki naraz" (`day_plan_write.test.sql:361-377`). Plan świadomie oddał `supabase/tests/database/` Fazie 3 rolloutu, ale **żaden artefakt nie przypisuje U0003 właścicielowi** — wiersz Fazy 3 w §3 `test-plan.md` mówi o RLS i kontrakcie zapisu, nie o tej odmowie.
- **Fix A ⭐ Recommended**: Dopisać U0003 jako nazwane zobowiązanie do wiersza Fazy 3 w §3 `test-plan.md` (i do §6.4), zostawiając pgTAP tam, gdzie plan go umieścił.
  - Strength: Respektuje granicę „Bez rozszerzania pgTAP" z `## What We're NOT Doing`, a jednocześnie domyka regułę `lessons.md` o odroczeniu z nazwanym właścicielem. Koszt: dwie linie.
  - Tradeoff: Niezmiennik zostaje bez automatycznej blokady do czasu Fazy 3 rolloutu.
  - Confidence: HIGH — to dokładnie ten sam wzorzec, którego wymaga zapisana reguła „Odroczone sprzątanie danych musi mieć właściciela".
  - Blind spot: Nie wiem, jak odległa w czasie jest Faza 3 rolloutu.
- **Fix B**: Dopisać `throws_ok(… '[]'::jsonb …, 'U0003')` plus asercje „licznik nie drgnął, stara partia nietknięta" do `day_plan_write.test.sql` teraz.
  - Strength: Niezmiennik zapięty natychmiast, mutacja przestaje przechodzić.
  - Tradeoff: Łamie jawną granicę zakresu tej zmiany i podnosi `plan(42)`, co kryterium 4.2 wprost chroniło.
  - Confidence: HIGH co do skuteczności, MEDIUM co do tego, czy warto łamać zakres.
  - Blind spot: Brak.
- **Decision**: FIXED via Fix A — U0003 przypisane Fazie 3 rolloutu w §3 `test-plan.md` i opisane jako dług otwarty w §6.4, z wymaganym kształtem asercji. Granica „Bez rozszerzania pgTAP" nienaruszona.

### F3 — Kontrola przedwdrożeniowa nie mogła nie przejść

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: context/changes/testing-generation-contract-boundary/plan.md:456
- **Detail**: `## Migration Notes` wymaga przed zastosowaniem na środowisku z danymi: `select id from day_plans p where not exists (select 1 from activities a where a.plan_id = p.id and a.generation = p.current_generation)` — „musi zwrócić zero wierszy". Uruchomiłem to lokalnie: zwraca `0`, ale **tabela `day_plans` ma lokalnie 0 wierszy w ogóle**, bo baza była resetowana. Kryterium przeszło bezwarunkowo — dokładnie ten wzorzec, który `lessons.md` nazywa „komentarzem, nie bramką". Na produkcji niesprawdzone, a ma znaczenie nie tylko dla migracji (ta nie rusza istniejących wierszy), lecz dla **zaostrzonego strażnika**: istniejący dzień bez aktywności przestaje być akceptowany przez `isDayPlanBody`, więc w `reconcile` daje cichy no-op, a w `mutate` — komunikat o niepowodzeniu zapisu, który się powiódł. Powiązane: pozycja 1.9 („krok `npm test` widoczny w logu CI na PR-ze") jest odhaczona, a żaden przebieg CI nie powstał — jedynym dowodem jest linia w YAML-u.
- **Fix**: Uruchomić zapytanie na produkcyjnym Supabase przed merge'em i odnotować wynik w `change.md`; jeśli zwróci wiersze, zdecydować o nich przed wdrożeniem.
- **Decision**: FIXED — `change.md` dostał sekcję „Warunki przed merge'em do `master`" z dwiema pozycjami do odhaczenia: zapytanie o dni bez aktywności na produkcji i potwierdzenie kroku `npm test` w logu CI.

### F4 — `it.each` z wierszem `[]` gubi przypadek testowy

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/day-plan-guards.test.ts:56
- **Detail**: `it.each([null, undefined, 42, "plan", [], {}])` — Vitest rozwija wiersz będący tablicą w listę argumentów, więc wiersz `[]` podaje **zero** argumentów i `value` jest `undefined`. Przebieg verbose potwierdza: `rejects undefined` występuje **dwa razy**, a testu `rejects []` nie ma wcale. `isDayPlanBody([])` faktycznie zwraca `false`, ale z powodu braku `body.plan`, nie dlatego, że strażnik kiedykolwiek zobaczył tablicę.
- **Fix**: Owinąć wiersze — `it.each([[null], [undefined], [42], ["plan"], [[]], [{}]])`.
- **Decision**: FIXED — wiersze `it.each` owinięte; `rejects []` istnieje, duplikat `rejects undefined` zniknął.

### F5 — `rpcError` w atrapie: martwa powierzchnia udająca pokrycie

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/services/__fixtures__/supabase.ts:41
- **Detail**: `rpcError` jest zadeklarowany, zdestrukturyzowany i wpięty w atrapę, ale `grep -rn rpcError src` zwraca wyłącznie sam fixture — żaden test go nie podaje. W efekcie gałąź `case "U0003": return "invalid"`, dodana w tym samym commicie, **nigdy się nie wykonuje w teście**, podobnie jak pętla ponowienia w `saveGeneration`.
- **Fix**: Dodać przypadek trasy z `rpcError: { code: "U0003", … }` asertujący 500, `retryable: false` i dwa wywołania `rpc` — pokrywa klasyfikację i ponowienie naraz.
- **Decision**: FIXED — dodany test trasy na odmowę U0003 (500, `retryable: false`, dwa wywołania `rpc`); mutacja potwierdzona (usunięcie `case "U0003"` czerwieni go).

### F6 — Brak odnotowania decyzji o roadmapie

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/testing-generation-contract-boundary/change.md
- **Detail**: Faza 5 §4 wymaga: *„sprawdź, czy [roadmapa] niesie pozycję o `Change ID` równym `testing-generation-contract-boundary` — jeśli tak, przesuń jej Status; jeśli nie, zostaw nietkniętą **i odnotuj to**"*. Sprawdzenie zostało wykonane (roadmapa nie ma takiej pozycji) i słusznie nic nie ruszono, ale notatka nie istnieje w żadnym artefakcie — `grep -rn roadmap` w folderze zmiany trafia tylko w nagłówki samego planu. Pół kroku, wyłącznie dokumentacja.
- **Fix**: Dopisać jedną linię do `## Notes` w `change.md`: roadmapa nie niesie pozycji o tym `Change ID`, zostawiona nietknięta.
- **Decision**: FIXED — `change.md` dostał sekcję „Roadmapa" odnotowującą brak pozycji o tym `Change ID`.

### F7 — Komentarz opisuje dziurę jako zamkniętą, choć ścieżka SSR jej nie domyka

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/day-plan-guards.ts:29-36
- **Detail**: Komentarz mówi w czasie przeszłym, że pusta partia „the week board marked the day `done`, `readyCount` counted it as ready" — jakby oba objawy zostały zamknięte. Zamknięte są tylko ścieżki `fetch`. `WeekPlanBoard.tsx:59` liczy `readyCount` po `day.plan !== null`, bez patrzenia na `activities.length`, a `:426` ustawia `status: plan ? "done" : "empty"` wprost z SSR-owego `WeekPlanView`. Migracja usuwa źródło, więc to obrona w głąb, nie żywy błąd — ale komentarz obiecuje więcej, niż kod dostarcza.
- **Fix**: Przeredagować komentarz tak, żeby nazywał zakres: strażniki domykają ścieżki `fetch`, źródło domyka migracja, ścieżka SSR pozostaje niezabezpieczona.
- **Decision**: FIXED — komentarz nazywa teraz zakres: strażniki domykają `fetch`, migracja domyka źródło, ścieżka SSR pozostaje otwarta, tylko nieosiągalna.

### F8 — Defekt w planie: `invalid` nie ma `retryable: false`

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/testing-generation-contract-boundary/plan.md:198
- **Detail**: Faza 2 §1 twierdzi: *„Kategoria `invalid` mapuje się w trasie na 502 i `retryable: false`"*. To nieprawda o kodzie sprzed zmiany i po niej — `activity-generator.ts:81` ma `invalid: true`, celowo („a fresh roll of the model often lands inside the contract"), a `generate.ts:68` to przekazuje. Implementacja poszła za silniejszą instrukcją z tej samej klauzuli („bez zmian w `generate.ts`") i zrobiła dobrze. Skutek: „bez płatnego ponowienia" jest prawdą o ponowieniu **automatycznym** (1 wywołanie `fetch` zamiast 2), ale nauczyciel wciąż dostaje przycisk. Defekt planu, nie implementacji — istotny, jeśli plan będzie później czytany jako źródło prawdy.
- **Fix**: Poprawić klauzulę w planie na „502 i `retryable: true`; oszczędność dotyczy ponowienia automatycznego".
- **Decision**: FIXED — klauzula Fazy 2 w planie skorygowana z adnotacją przeglądu.

### F9 — `isOutlineBody` powiela kształt `DayTheme`

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/day-plan-guards.ts:69
- **Detail**: Predykat deklaruje kształt inline jako `{ themes: { plan_date: string; theme: string }[] }`, podczas gdy `DayTheme` z `src/types.ts` ma dokładnie te dwa pola i jest tym, co serializuje trasa konspektu. CLAUDE.md umieszcza współdzielone DTO w `src/types.ts`. Duplikat został odziedziczony po `WeekPlanBoard`, ale ekstrakcja do wspólnego modułu była momentem na jego zwinięcie.
- **Fix**: Zmienić sygnaturę na `body is { themes: DayTheme[] }` i zaimportować typ.
- **Decision**: FIXED — `isOutlineBody` używa `DayTheme` z `src/types.ts`.

### F10 — `saveGeneration` ponawia U0003 wbrew własnemu komentarzowi

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/day-plan-store.ts:123-131, 227-242
- **Detail**: Komentarz przy `U0003` argumentuje terminalność („the same empty batch would be refused identically"), ale `saveGeneration` ponawia każdy `StoreError` o kategorii innej niż `conflict`. Pusta partia jest więc wysyłana do Postgresa dwa razy. Nieszkodliwe — nic się nie zapisało za żadnym razem — ale deklarowana intencja i zachowanie się rozjeżdżają, i to samo dotyczy `not_found` oraz `config`.
- **Fix**: Albo poszerzyć strażnik do `conflict | invalid`, albo usunąć tezę o terminalności z komentarza, żeby następny czytelnik nie wywnioskował bariery, której nie ma.
- **Decision**: FIXED via „popraw komentarz" — komentarz przyznaje, że `saveGeneration` ponawia U0003 i uzasadnia, dlaczego lista wyjątków nie jest tego warta.
