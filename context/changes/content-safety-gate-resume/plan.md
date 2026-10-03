# Odwieszenie bramki bezpieczeństwa treści (F-02) — Implementation Plan

## Overview

Bramka bezpieczeństwa treści jest od 2026-09-19 zawieszona jednym przełącznikiem. Powodem był koszt: konto OpenRouter wyschło w trakcie `week-regeneration-replace`. W tym stanie na produkcję weszły dwie zmiany promptów, których nikt nie ocenił: outline tygodnia na podzbiorze dni (`ab7f734`) i nowy `refine-activity.pl.md` (`S-15`). Ten fundament przywraca bramkę **na stałe**: każdy dopuszczony model × każdy produkcyjny tryb, sędzia skalibrowany przed macierzą, bramka w CI na PR-ach dotykających promptu, modelu albo samej bramki. Mechanizm zawieszenia znika z repozytorium. Gdy pierwszy przebieg wyjdzie czerwony, fundament niesie poprawkę promptu i zamyka się dopiero na zielonym przebiegu pełnej macierzy.

## Current State Analysis

- **Przełącznik**: `src/lib/services/gate-suspension.ts` eksportuje `GATE_SUSPENDED = process.env.RUN_CONTENT_SAFETY_GATE !== "1"`, notice i `warnIfSuspended`. Korzystają z niego trzy miejsca:
  - `content-safety.gate.test.ts:9,111-116`;
  - `content-safety-judge.gate.test.ts:4,11-15`;
  - `vitest.gate.config.ts:10,17-20`.
  Do tego ogon `node -e … process.exit(2)` w skrypcie `test:gate` (`package.json:11`).
- **CI**: job `content-safety-gate` (`.github/workflows/ci.yml`) zachował wykrywanie zmian, ale zamiast `npm run test:gate` drukuje `::warning::`. Przed zawieszeniem job miał kroki `setup-node` → `npm ci` → `npx astro sync` → `npm run test:gate` z `SUPABASE_URL`, `SUPABASE_KEY`, `OPENROUTER_API_KEY` (`git show 90eee38 -- .github/workflows/ci.yml`). Sekret `OPENROUTER_API_KEY` nadal istnieje w repo (`gh secret list`, 2026-09-02). Job jest doradczy, bo branch protection jest niedostępne.
- **Filtr ścieżek** łapie `prompts/*.{pl.md,schema.json}`, `allowed-models.ts`, `^src/lib/services/content-safety` i `vitest.gate.config.ts`. **Nie łapie** dwóch plików, choć oba zmieniają to, co bramka ocenia albo jak:
  - `src/lib/services/__fixtures__/content-safety.ts` (hasła, przypadki refine, fixture'y kalibracyjne);
  - `src/lib/services/gate-retry.ts`.
- **Macierz** (`content-safety.gate.test.ts:34`): `GATE_MODES = ["day", "day-weekday", "day-themed", "week", "activity"]`. Pokrycie: 2 modele (`allowed-models.ts`) × 8 haseł (`GATE_KEYWORDS`) × 4 tryby dnia/tygodnia, plus 2 modele × 6 przypadków `REFINE_GATE_CASES`. Przed macierzą w `beforeAll` idzie kalibracja sędziego, a osobny plik kalibracji powtarza ją jako testy.
- **Tryby a trasy produkcyjne**:

  | Trasa | Tryb bramki |
  | --- | --- |
  | `generate.ts` (kontekst zawsze z `planDate`) | `day-weekday` |
  | `week/day.ts` (z tematem) | `day-themed` |
  | `week/outline.ts` | `week` |
  | `refine.ts` | `activity` |

  Tryb `day` to baseline bez kontekstu, którego żadna trasa nie wysyła (`activity-generator.ts:118-128`).
- **Sędzia**: `anthropic/claude-haiku-4.5` (`content-safety-judge.ts:38`). Przeszedł z Opus 5 przy zawieszeniu i **nigdy nie był kalibrowany**: kalibracja była zawieszona razem z resztą.
- **Koszt**: wyniki generowania niosą `cost` z `usage.cost` (`activity-generator.ts:98-149`), a werdykt sędziego kosztu nie niesie. Raport (`content-safety-report.ts:33-52`) nie mówi nic o koszcie. Roadmapa trzyma koszt przebiegu jako otwarty Unknown F-02.

## Desired End State

- `npm run test:gate` uruchamia obie warstwy bramki bez żadnej zmiennej środowiskowej i kończy się kodem Vitesta: `0` na zielono, `1` na czerwono. W repo nie ma `gate-suspension.ts`, `RUN_CONTENT_SAFETY_GATE` ani `describe.skip` w plikach bramki.
- Macierz pokrywa 2 modele × 8 haseł × `day-weekday`, `day-themed`, `week` + 2 modele × 6 przypadków × `activity`. Bez `day`.
- Sędzia przeszedł kalibrację na żywo, a komentarz przy `JUDGE_MODEL` zapisuje datę i wynik tej kalibracji.
- Raport bramki podaje sumaryczny koszt generowania przebiegu i mówi wprost, że koszt sędziego nie jest wliczony.
- Przebieg pełnej macierzy jest zielony. Jego raport (data, sędzia, modele, tryby, koszt, ewentualne poprawki promptów) leży w `context/changes/content-safety-gate-resume/gate-runs.md`.
- Job CI `content-safety-gate` na PR-ze z dopasowaną ścieżką uruchamia `npm run test:gate` z sekretem, a step summary pokazuje raport. Dowód: PR tego fundamentu, bo sam dotyka `src/lib/services/content-safety*`.
- `next-actions.md`, `test-plan.md` §6.5 i roadmapa opisują bramkę jako działającą.

### Key Discoveries:

- `vitest.gate.config.ts:9-20` drukuje notice z configu, bo domyślny reporter zwija stderr pliku, w którym wszystko jest pominięte. Po usunięciu przełącznika ten blok znika w całości, razem z importem.
- `content-safety.gate.test.ts:121-133` (`beforeAll`) przerywa macierz, gdy sędzia oblewa fixture. Na tym opiera się decyzja o kolejności „kalibracja przed macierzą”, więc zostaje bez zmian.
- `gate-retry.ts` ponawia wyłącznie transport i `402 in_flight_budget_exhausted`, nigdy werdykt. Nie zmieniamy go.
- `GATE_CONCURRENCY = 3` i `fileParallelism: false` są zmierzone na limicie rezerwacji OpenRouter. Nie stroimy ich.
- Historia: `git show 90eee38` to dokładny diff zawieszenia, więc przywrócenie joba CI jest jego odwrotnością plus poszerzony filtr.

## What We're NOT Doing

- Nie zmieniamy rubryki sędziego, żeby przeszedł kalibrację. Dostrajanie rubryki do fixture'ów to bramka polująca na zieleń. Na oblaną kalibrację odpowiada wyłącznie wyższa klasa sędziego.
- Nie dodajemy trybu „outline na podzbiorze dni”: prompt jest parametryzowany liczbą `{{count}}`, a tryb `week` przechodzi tę samą ścieżkę. Odnotowane w `gate-runs.md` jako świadoma granica.
- Nie usuwamy `day-themed` (wariant z ogona po Kroku 2). To trasa produkcyjna `week/day.ts`, a jej pominięcie łamie Guardrail 2.
- Brak crona i brak `workflow_dispatch`. Dryf modelu po stronie dostawcy między zmianami promptu zostaje niepilnowany, to decyzja świadoma.
- Brak jednorazowego przebiegu z DeepSeekiem jako kontroli negatywnej i brak testu ze wstrzykniętym wyjściem.
- Nie liczymy kosztu sędziego, bo to wymagałoby zmiany kontraktu `judgeContentSafety`.
- Nie czynimy bramki blokującą. Branch protection jest niedostępne i CI zostaje doradcze.
- Nie zmieniamy `GATE_KEYWORDS` ani `REFINE_GATE_CASES`.

## Implementation Approach

Kolejność wynika z zasady „żadna macierz na nieskalibrowanym sędzim”:

1. Najpierw sama kalibracja, na żywo, przy jeszcze istniejącym przełączniku (`RUN_CONTENT_SAFETY_GATE=1`, sam plik kalibracji). Najtańszy przebieg odpowiada na pytanie, czy Haiku w ogóle się nadaje.
2. Potem zmiany offline w macierzy: bez `day`, z kosztem w raporcie. Weryfikujemy je testem jednostkowym raportu, zanim pójdzie pierwsza złotówka na macierz.
3. Potem przebieg pełnej macierzy z poprawkami promptów aż do zieleni.
4. Na końcu usunięcie przełącznika i przywrócenie CI. PR fundamentu sam uruchamia bramkę w CI, i to jest dowód okablowania.

Prace idą na gałęzi `feat/content-safety-gate-resume`: przed pierwszym commitem `git branch --show-current` musi pokazać tę gałąź, nie `master`.

## Critical Implementation Details

- **Kolejność kroków na żywo.** Kalibracja (faza 1) musi przejść, zanim ruszy macierz (faza 3). `beforeAll` macierzy to wymusza i tak, ale osobny przebieg fazy 1 kosztuje kilka wywołań sędziego zamiast setki. Przed fazą 1 trzeba doładować konto OpenRouter: bez tego `402` od Gemini zwraca stan z 2026-09-19 i każda decyzja o sędzim jest nieczytelna.
- **Szczebel sędziego.** Kolejność: Haiku 4.5 → aktualny Sonnet na OpenRouter → Opus. Dokładny identyfikator Sonneta trzeba sprawdzić na liście modeli OpenRouter w momencie implementacji, nie zgadywać. Każdy szczebel to pełny przebieg `content-safety-judge.gate.test.ts`. Ten sam sędzia musi potem ocenić macierz, więc zmiana sędziego po fazie 3 oznacza powtórzenie fazy 3.
- **Poprawka promptu w fazie 3.** Każda edycja pliku w `src/lib/services/prompts/` oznacza ponowny przebieg **pełnej** macierzy, nie tylko czerwonej komórki (`lessons.md` §3). W `gate-runs.md` lądują wszystkie przebiegi, także czerwone, z raportem, a nie tylko ostatni zielony.

## Phase 1: Kalibracja sędziego na żywo

### Overview

Rozstrzyga, który sędzia ocenia macierz. Kod zmienia się tylko wtedy, gdy Haiku obleje.

### Changes Required:

#### 1. Przebieg kalibracji

**File**: brak zmian w kodzie przy zielonym Haiku.

**Intent**: Uruchom sam plik kalibracji na żywo, przy obecnym przełączniku. Gdy przejdzie, Haiku zostaje. Gdy obleje, podnieś `JUDGE_MODEL` o jeden szczebel i powtórz.

**Contract**: `RUN_CONTENT_SAFETY_GATE=1 npx vitest run --config vitest.gate.config.ts src/lib/services/content-safety-judge.gate.test.ts`, wymaga `OPENROUTER_API_KEY` w `.env`.

#### 2. Zapis decyzji o sędzim

**File**: `src/lib/services/content-safety-judge.ts`

**Intent**: Zastąp akapit „it is suspended with the rest of the gate, so this model has not been calibrated” zapisem faktu: data kalibracji, wynik, ewentualne szczeble oblane po drodze. Przy zmianie szczebla zmień też `JUDGE_MODEL`.

**Contract**: komentarz nad `JUDGE_MODEL` (`:16-37`) i sama stała. Żadnej zmiany sygnatury.

#### 3. Dziennik przebiegów

**File**: `context/changes/content-safety-gate-resume/gate-runs.md` (nowy)

**Intent**: Pierwszy wpis to wynik kalibracji: data, sędzia, fixture'y przeszłe i oblane, a przy oblanym szczeblu cytat werdyktu.

**Contract**: jeden nagłówek `## <data> — <co>` na przebieg.

### Success Criteria:

#### Automated Verification:

- Kalibracja na żywo przechodzi na sędzim wpisanym w `JUDGE_MODEL`, a `vitest` raportuje 5 testów **passed**, nie skipped: `RUN_CONTENT_SAFETY_GATE=1 npx vitest run --config vitest.gate.config.ts src/lib/services/content-safety-judge.gate.test.ts`
- `npm run lint` i `npm test` przechodzą

#### Manual Verification:

- Wynik w `gate-runs.md` zgadza się z wyjściem przebiegu, a liczba fixture'ów odpowiada `CONTENT_SAFETY_FIXTURES.length`
- Komentarz przy `JUDGE_MODEL` nie twierdzi już, że sędzia jest nieskalibrowany

**Implementation Note**: Po fazie zatrzymaj się na ręczne potwierdzenie przed fazą 2.

---

## Phase 2: Macierz bez `day` i koszt w raporcie

### Overview

Zmiany offline, które ustalają kształt macierzy i to, co raport mówi o koszcie, zanim ruszy płatny przebieg.

### Changes Required:

#### 1. Tryby macierzy

**File**: `src/lib/services/content-safety.gate.test.ts`

**Intent**: Usuń `day` z `GATE_MODES` i wywołanie `generateDayActivities(keyword, undefined, { model })` razem z jego gałęzią oceny. Popraw komentarz nad `GATE_MODES`: cztery tryby = cztery trasy produkcyjne, `day` odpadł jako baseline, którego żadna trasa nie wysyła. Komentarz o `activity` jako „pierwszym po odwieszeniu” zostaw do fazy 4.

**Contract**: `GATE_MODES = ["day-weekday", "day-themed", "week", "activity"]`, a `Promise.allSettled` niesie dwa wywołania (outline, `day-weekday`).

#### 2. Suma kosztu

**File**: `src/lib/services/content-safety.gate.test.ts`, `src/lib/services/content-safety-report.ts`

**Intent**: Macierz sumuje `cost` z każdego udanego wywołania generowania (`null` liczy jako brak danych, nie zero), a raport drukuje linię kosztu w obu gałęziach, zielonej i czerwonej. Linia mówi wprost, że koszt sędziego nie jest wliczony i ile wywołań nie zwróciło kosztu.

**Contract**: `GateReportInput` dostaje pole `generationCost: { readonly total: number; readonly missing: number }`. Linia w sekcji pokrycia raportu, po polsku.

#### 3. Test raportu

**File**: `src/lib/services/content-safety-report.test.ts` (nowy, warstwa `npm test`)

**Intent**: Przypnij, że raport zawiera linię kosztu w obu gałęziach i nazywa brakujące koszty. Przypnij też, że zawiera każdy model i każdy tryb z wejścia: na tym opierają się asercje `expect(report).toContain(...)` w macierzy.

**Contract**: test czystej funkcji `formatGateReport`, bez sieci.

#### 4. Komentarz w generatorze i dokumentacja macierzy

**File**: `src/lib/services/activity-generator.ts`, `context/foundation/test-plan.md`

**Intent**:
- `activity-generator.ts:118-128`: komentarz mówi, że bramka pokrywa `day`, `day-weekday` i `day-themed` „by name”. Przepisz go: bramka pokrywa dwie konfiguracje produkcyjne, a baseline bez kontekstu jest nieosiągalny z tras.
- `test-plan.md` §6.5: opis macierzy wymienia cztery tryby, w tym `activity`.
- Wiersz „Ograniczenie liczby trybów” w §Otwarte ogony po Kroku 2 (`next-actions.md`) zamknij z adnotacją, że wykonano połowę (bez `day`), a `day-themed` został z powodu Guardrail 2.

**Contract**: tylko komentarz i proza, kod generatora bez zmian.

### Success Criteria:

#### Automated Verification:

- `npm test` przechodzi, w tym nowy `content-safety-report.test.ts`
- `npm run lint` przechodzi
- W pliku macierzy nie ma wywołania generatora bez kontekstu. Bramka celuje w konstrukcję, nie w identyfikator (`lessons.md` §6): `grep -nE 'generateDayActivities\(keyword, undefined' src/lib/services/content-safety.gate.test.ts` zwraca pusto. Przed zmianą zwraca jedną linię, co sprawdzasz na `master`.
- `GATE_MODES` nie zawiera `day`: `grep -nE 'GATE_MODES = \[[^]]*"day"[],]' src/lib/services/content-safety.gate.test.ts` zwraca pusto. Na `master` trafia w linię 35. Goły grep na `"day",` nie nadaje się, bo trafia też w `kind: "day"` w `dayInput`, które zostaje.

#### Manual Verification:

- Żaden produkcyjny caller nie woła `generateDayActivities` bez kontekstu. Sprawdź `grep -rn "generateDayActivities(" src/pages`: każde wywołanie przekazuje kontekst z `planDate`.

**Implementation Note**: Po fazie zatrzymaj się na ręczne potwierdzenie przed fazą 3.

---

## Phase 3: Przebieg pełnej macierzy i poprawki promptów

### Overview

Właściwe odwieszenie: pełna macierz na skalibrowanym sędzim aż do zieleni.

### Changes Required:

#### 1. Przebieg

**File**: brak zmian w kodzie przy zielonym przebiegu.

**Intent**: Uruchom obie warstwy bramki na żywo. Raport (stdout) i podsumowanie Vitesta skopiuj do `gate-runs.md`.

**Contract**: `RUN_CONTENT_SAFETY_GATE=1 npm run test:gate`.

#### 2. Poprawki promptów (tylko przy czerwonym przebiegu)

**File**: plik promptu odpowiadający czerwonemu trybowi. Najpewniej `src/lib/services/prompts/refine-activity.pl.md` (`activity`), możliwie `day-plan.pl.md` albo `week-outline.pl.md`.

**Intent**: Napraw prompt tak, żeby czerwona komórka przeszła, nie zmieniając zachowania na bezpiecznych kontrolach. Po każdej edycji promptu puść ponownie pełną macierz, nie samą komórkę. Gdy tylko Gemini jest czerwony na trybie, którego poprawka promptu psuje luna, zatrzymaj się i wróć do właściciela: usunięcie modelu z `ALLOWED_MODELS` nie było wybraną drogą.

**Contract**: treść promptu. Schematy JSON (`*.schema.json`) bez zmian, bo zmiana schematu to zmiana kontraktu generatora, poza zakresem.

#### 3. Dziennik

**File**: `context/changes/content-safety-gate-resume/gate-runs.md`

**Intent**:
- Każdy przebieg dostaje własny wpis: data, sędzia, liczba komórek, koszt generowania z raportu, findingi z cytatami, a przy poprawce nazwa pliku i jednozdaniowy opis zmiany.
- Ostatni wpis jest zielony.
- Odnotuj granicę: outline na podzbiorze dni nie jest osobnym trybem.

#### 4. Poprawka planu z 2026-10-01: sędzia na wejściu `week` (decyzja właściciela)

**Powód**: dwa czerwone przebiegi (`gate-runs.md`). Po poprawce promptów z przebiegu 1 wszystkie naruszenia są w trybie `week` i żadne nie wskazuje treści wyjścia: Haiku cytuje hasło z własnej wiadomości (`Hasło: …`) jako naruszenie. Kalibracja tego nie łapie, bo nie ma fixture'u `kind: "week"`. Poprawka promptu nie sięga tej przyczyny. Właściciel wybrał a + b w ustalonej kolejności, z Sonnetem jako planem awaryjnym.

Ten punkt świadomie odchodzi od dwóch zapisów planu:
- „Na oblaną kalibrację odpowiada wyłącznie wyższa klasa sędziego”. Tu kalibracja przechodziła, ale była ślepa na tryb `week`.
- Wejście sędziego było poza zakresem. Zmieniamy wyłącznie wiadomość do sędziego (`buildJudgeUserMessage`) i zadanie w `SYSTEM_MESSAGE`. Rubryka (`content-safety-rubric.pl.md`) i sygnatura `judgeContentSafety` zostają bez zmian.

Kolejność, każdy krok przed następnym:

1. **Fixture'y tygodniowe na starym formacie.** Do `CONTENT_SAFETY_FIXTURES` dochodzą dwa fixture'y `kind: "week"`:
   - bezpieczny: prawdziwe wyjście outline'u dla „Halloween — duchy i krew” po poprawce promptu;
   - niebezpieczny: skonstruowany, z oczekiwanym cytatem na słowie spoza hasła, żeby cytat samego hasła nie mógł go zaliczyć.

   Kalibracja na **starym** formacie musi wyjść czerwono na fixture'ze bezpiecznym. To dowód, że fixture łapie wadę (`lessons.md` §4). Wynik idzie do `gate-runs.md`.
2. **Wiadomość do sędziego.** Hasło lub polecenie nauczyciela trafia do wyraźnie oznaczonej sekcji kontekstu. Zadanie mówi wprost, że kontekstu się nie ocenia i nie cytuje. Kalibracja z 7 fixture'ami przechodzi w całości.
3. **Pełna macierz, dwa zielone przebiegi z rzędu.** Generowanie idzie z temperaturą 0.8, a naruszenia zmieniały się między przebiegami. Każda zmiana promptu lub sędzia zeruje licznik.
4. **Plan awaryjny.** Jeśli po kroku 2 zostają wyłącznie błędy osądu (zła klauzula, bezpieczne hasło kontrolne oznaczone), sędzia idzie szczebel wyżej: aktualny Sonnet z listy modeli OpenRouter. Wracamy wtedy do kroku 2: kalibracja, potem dwa zielone przebiegi.

### Success Criteria:

#### Automated Verification:

- Ostatni przebieg `RUN_CONTENT_SAFETY_GATE=1 npm run test:gate` kończy się kodem `0`, a raport ma nagłówek „0 naruszeń” i wymienia oba modele i cztery tryby
- Podsumowanie Vitesta pokazuje obie warstwy jako **passed**, nie skipped
- Po poprawce promptu `npm test` i `npm run lint` przechodzą

#### Manual Verification:

- Każdy przebieg z tej fazy, łącznie z czerwonymi, ma wpis w `gate-runs.md`
- Przy poprawce promptu przeczytaj wyjścia bezpiecznych kontroli (np. „Kolory”, „dopisz słowa piosenki”) i oceń je jako nauczycielka. Poprawka nie może zamienić dobrych propozycji w odmowy.
- Linia kosztu w `gate-runs.md` odpowiada na Unknown roadmapy „koszt przebiegu”

**Implementation Note**: Po fazie zatrzymaj się na ręczne potwierdzenie przed fazą 4.

---

## Phase 4: Usunięcie zawieszenia i bramka w CI

### Overview

Bramka staje się stanem domyślnym repo. CI ocenia każdy PR, który zmienia to, co bramka ocenia.

### Changes Required:

#### 1. Przełącznik

**File**: `src/lib/services/gate-suspension.ts` (usunięty), `content-safety.gate.test.ts`, `content-safety-judge.gate.test.ts`, `content-safety-judge.ts` (komentarz z `RUN_CONTENT_SAFETY_GATE=1`), `vitest.gate.config.ts`, `package.json`

**Intent**:
- Usuń moduł, importy, `gateDescribe` (wraca zwykłe `describe`) i blok notice w configu.
- Skrypt `test:gate` wraca do `vitest run --config vitest.gate.config.ts`.
- Komentarze, które opisują stan zawieszenia, przepisz albo usuń. Dotyczy to komentarza przy `GATE_MODES` o `activity` „first to run once it is back” oraz akapitu w `content-safety-judge.gate.test.ts:11-12`.

**Contract**: `npm run test:gate` bez zmiennych środowiskowych uruchamia obie warstwy.

#### 2. Job CI

**File**: `.github/workflows/ci.yml`

**Intent**:
- Przywróć kroki sprzed `90eee38`: `setup-node` → `npm ci` → `npx astro sync` → `npm run test:gate` z trzema sekretami, każdy z `if: steps.changes.outputs.run == 'true'`.
- Usuń krok notice i komentarz „SUSPENDED”.
- Dodaj `timeout-minutes` (test ma sufit 10 min plus kalibracja i instalacja).
- Poszerz filtr ścieżek o `src/lib/services/__fixtures__/content-safety.ts` i `src/lib/services/gate-`. Wyrażenie stoi w jednym miejscu, bo krok notice z drugą kopią znika.

**Contract**: filtr ścieżek, jeden regex:
`^src/lib/services/prompts/.*\.(pl\.md|schema\.json)$|^src/lib/services/allowed-models\.ts$|^src/lib/services/content-safety|^src/lib/services/__fixtures__/content-safety\.ts$|^src/lib/services/gate-|^vitest\.gate\.config\.ts$`

#### 3. Dokumentacja stanu

**File**: `context/foundation/next-actions.md`, `context/foundation/roadmap.md`, `context/foundation/test-plan.md`

**Intent**:
- `next-actions.md` §Stan: zastąp punkt „zawieszona od 2026-09-19” stanem odwieszenia z datą i odnośnikiem do `gate-runs.md`. Zamknij wiersz w tabeli Kroku 14 dotyczący odwieszenia.
- `roadmap.md`: F-02 `done`, a Baseline „Deploy / infra” i „Poza sześcioma warstwami” bez „zawieszona”.
- `test-plan.md` §6.5: opisz filtr ścieżek CI i dopisz zasadę, że każdy przebieg trafia do `gate-runs.md` danej zmiany.

**Contract**: proza. Status w tabeli At a glance zmieniaj z odpornością na przerównanie (`lessons.md` §5).

#### 4. Poprawka planu z 2026-10-03: tańsza bramka (decyzja właściciela)

**Powód**: koszt. Faza 3 przeszła na Sonnecie 5.5, ale doładowanie konta OpenRouter wyczerpało się w przebiegu 6. Sędzia jest drogą częścią przebiegu, a raport nie mierzy jego kosztu. Bramka, która przy każdej zmianie promptu kosztuje wielokrotność miesięcznego użycia aplikacji, nie przetrwa. Właściciel doładował konto ostatni raz w tym miesiącu, więc na żywo idą tylko jedna kalibracja, jeden pełny przebieg lokalny (4.4) i przebieg CI na PR-ze (4.5).

Zakres, wszystko offline poza dwoma przebiegami:

1. **Koszt sędziego w raporcie.** `judgeContentSafety` zwraca obok werdyktu koszt (`usage.cost`, suma obu stopni) i informację o eskalacji. Raport drukuje koszt generowania i koszt sędziego osobno. To świadomie odwraca zapis „Nie liczymy kosztu sędziego” z §What We're NOT Doing.
2. **Sędzia dwustopniowy.** Każde wyjście, które przejdzie warstwę deterministyczną, ocenia Haiku 4.5. Tylko werdykt „niebezpieczne” od Haiku idzie do Sonneta 5.5, a werdykt Sonneta jest ostateczny. To stała reguła w kodzie, nie ponawianie: każde wejście dostaje najwyżej jedną ocenę każdego stopnia. Uzasadnienie z faz 1–3: błędy Haiku były fałszywymi alarmami, a niebezpieczne fixture'y łapał. Słabość nazwana wprost: niebezpieczna treść przepuszczona przez Haiku nie trafia do Sonneta, a chronią przed tym niebezpieczne fixture'y kalibracji.
3. **Cache rubryki.** `cache_control: {"type": "ephemeral"}` na najwyższym poziomie żądania sędziego (OpenRouter, automatyczne cache'owanie dla Anthropic). Rubryka jest identyczna w każdym wywołaniu.
4. **Jedna kalibracja na przebieg.** Kalibracja przechodzi z `content-safety-judge.gate.test.ts` do pliku macierzy jako testy przed macierzą. Macierz nie rusza, gdy któryś fixture oblał, więc zasada „żadna macierz na nieskalibrowanym sędzim” zostaje. Osobny plik znika, a sama kalibracja to `npm run test:gate -- -t calibration`.
5. **Zakres trybów według zmienionych plików.** Pure funkcja w `src/lib/services/gate-scope.ts` mapuje zmienione pliki na tryby:
   - `day-plan.*` → `day-weekday`, `day-themed`;
   - `week-outline.*` → `week`, `day-themed`;
   - `refine-activity.*` → `activity`;
   - wszystko inne z filtru CI (sędzia, rubryka, raport, model, fixture'y, `gate-*`, config) → pełna macierz.

   CI przekazuje listę zmienionych plików, a lokalnie bez listy idzie pełna macierz. Raport mówi wprost, czy przebieg był pełną macierzą. Każdy model jest zawsze objęty (`lessons.md` §3).
6. **Fałszywy alarm „przepraszam”.** Marker liczy się jako odmowa tylko na początku zdania, czyli w kształcie „Przepraszam, nie mogę…”, a nie na liście grzecznościowych słów w poprawnym przekierowaniu.

Odrzucone: sędzia bez rozumowania, bo żądanie sędziego nie włącza rozumowania (pomiar z punktu 1 to potwierdzi); mniej haseł; generowanie z temperaturą 0; Gemini poza bramką.

### Success Criteria:

#### Automated Verification:

- Żadnego śladu przełącznika w kodzie i konfiguracji: `grep -rnE 'RUN_CONTENT_SAFETY_GATE|gate-suspension|GATE_SUSPENDED|describe\.skip' src vitest.gate.config.ts package.json .github` zwraca pusto. Na `master` trafia w 7 plików, w tym w komentarz `content-safety-judge.ts`, co sprawdzasz przed zmianą.
- Filtr ścieżek rozróżnia oba stany, a regex jest skopiowany z `ci.yml`. Dla listy `src/lib/services/__fixtures__/content-safety.ts`, `src/lib/services/gate-retry.ts`, `src/lib/services/prompts/refine-activity.pl.md` każda linia pasuje. Dla `src/lib/services/activity-generator.ts` i `src/pages/api/day-plan/refine.ts` żadna nie pasuje. Weryfikacja: `printf … | grep -E '<regex>'` w obu kierunkach.
- `npm test`, `npm run lint` i `npm run build` przechodzą
- `npm run test:gate` bez zmiennych środowiskowych kończy się kodem `0` i ocenia, a nie pomija. To ostatni lokalny przebieg przed PR-em, z wpisem w `gate-runs.md`.
- Na PR-ze fundamentu (`gh pr checks <nr>`) job `content-safety-gate` przechodzi, a jego log zawiera krok `npm run test:gate`, nie `Report that the gate is suspended`.

#### Manual Verification:

- Step summary joba `content-safety-gate` na PR-ze pokazuje raport bramki (nagłówek, modele, tryby, koszt), a nie notice o zawieszeniu
- `roadmap.md` diff (`git diff -w master..HEAD -- context/foundation/roadmap.md`) zmienia tylko F-02 i Baseline
- Gałąź `feat/content-safety-gate-resume`, nie `master`, w każdym commicie

**Implementation Note**: Merge do `master` to wydanie na produkcję. Prompt poprawiony w fazie 3 wchodzi do nauczycielek dopiero wtedy, więc merge następuje po zielonym jobie na PR-ze i ręcznym potwierdzeniu.

---

## Testing Strategy

### Unit Tests:

- `content-safety-report.test.ts`: linia kosztu w gałęzi zielonej i czerwonej, nazwanie brakujących kosztów, obecność każdego modelu i trybu z wejścia.

### Integration Tests:

- Warstwa bramki na żywo (`npm run test:gate`):
  - kalibracja sędziego: 5 fixture'ów, w tym dwa niebezpieczne. To powtarzalna kontrola negatywna, czyli dowód, że bramka potrafi nie przejść.
  - macierz: 2 × 8 × 3 + 2 × 6.
- CI: PR fundamentu jako dowód okablowania, bo filtr ścieżek go łapie.

### Manual Testing Steps:

1. Po fazie 1: przeczytaj werdykty sędziego na fixture'ach niebezpiecznych. Klauzula i cytat mają wskazywać właściwy fragment.
2. Po fazie 3: przy poprawce promptu przejdź w aplikacji (`npm run dev`) jedną poprawkę aktywności poleceniem z `REFINE_GATE_CASES` i oceń odpowiedź.
3. Po fazie 4: otwórz step summary joba na PR-ze.

## Performance Considerations

Jeden pełny przebieg to:
- 48 wywołań generowania dnia/tygodnia (16 outline + 16 `day-weekday` + 16 `day-themed`);
- 12 wywołań refine;
- 60 wywołań sędziego macierzy;
- 10 wywołań kalibracji (`beforeAll` + osobny plik).

Usunięcie `day` zdejmuje 16 generowań i 16 ocen. Gemini jest około 5× droższy od luny na token. `GATE_CONCURRENCY` i `fileParallelism` zostają bez zmian (zmierzone na limicie rezerwacji).

## Migration Notes

Brak zmian danych. Wycofanie odwieszenia to świadomy revert commitu fazy 4, widoczny w historii. Nie ma już przełącznika, który dałoby się przestawić bez commita.

## References

- Roadmapa: `context/foundation/roadmap.md` §F-02
- PRD: `context/foundation/prd-v3.md` Guardrail 2, §Constraints „Odwieszenie bramki”
- Zawieszenie: commit `90eee38`, `src/lib/services/gate-suspension.ts`
- Budowa bramki: `context/archive/2026-08-31-testing-content-safety-gate/` (plan, `negative-control.md`)
- Tryb `activity`: `context/archive/2026-09-28-follow-up-questions/`
- Lekcje: `context/foundation/lessons.md` §3 (bramka na każdym modelu), §4 i §6 (kryterium musi umieć nie przejść, grep na konstrukcję), §5 (tabele markdown)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Kalibracja sędziego na żywo

#### Automated

- [x] 1.1 Kalibracja na żywo przechodzi na sędzim z `JUDGE_MODEL` — 5 testów passed, nie skipped — 3b74915
- [x] 1.2 `npm run lint` i `npm test` przechodzą — 3b74915

#### Manual

- [ ] 1.3 Wynik w `gate-runs.md` zgadza się z wyjściem przebiegu
- [ ] 1.4 Komentarz przy `JUDGE_MODEL` nie twierdzi, że sędzia jest nieskalibrowany

### Phase 2: Macierz bez `day` i koszt w raporcie

#### Automated

- [x] 2.1 `npm test` przechodzi, w tym `content-safety-report.test.ts` — 9f98fd2
- [x] 2.2 `npm run lint` przechodzi — 9f98fd2
- [x] 2.3 Grep na `generateDayActivities(keyword, undefined` w pliku macierzy pusty (na `master` jedna linia) — 9f98fd2
- [x] 2.4 Grep na `GATE_MODES` z `"day"` pusty (na `master` trafia w linię 35) — 9f98fd2

#### Manual

- [ ] 2.5 Żaden produkcyjny caller nie woła `generateDayActivities` bez kontekstu

### Phase 3: Przebieg pełnej macierzy i poprawki promptów

#### Automated

- [x] 3.1 Ostatni przebieg `npm run test:gate` kończy się kodem 0, raport „0 naruszeń” z oboma modelami i czterema trybami — 9126025
- [x] 3.2 Obie warstwy passed, nie skipped — 9126025
- [x] 3.3 Po poprawce promptu `npm test` i `npm run lint` przechodzą — 9126025
- [x] 3.7 Fixture `week` bezpieczny wychodzi czerwono na starym formacie wiadomości sędziego — 9126025
- [x] 3.8 Kalibracja po zmianie wiadomości sędziego — 7 testów passed — 9126025
- [x] 3.9 Dwa zielone przebiegi pełnej macierzy z rzędu na tym samym sędzim i promptach — 9126025

#### Manual

- [ ] 3.4 Każdy przebieg fazy ma wpis w `gate-runs.md`
- [ ] 3.5 Bezpieczne kontrole po poprawce promptu ocenione jako nauczycielka — brak odmów
- [ ] 3.6 Linia kosztu w `gate-runs.md` odpowiada na Unknown roadmapy

### Phase 4: Usunięcie zawieszenia i bramka w CI

#### Automated

- [x] 4.1 Grep na ślady przełącznika pusty (na `master` 7 plików) — 96bfb95
- [x] 4.2 Filtr ścieżek rozróżnia oba stany na liście kontrolnej — 96bfb95
- [x] 4.3 `npm test`, `npm run lint`, `npm run build` przechodzą — 96bfb95
- [x] 4.4 `npm run test:gate` bez env kończy się kodem 0 i ocenia — 96bfb95
- [x] 4.5 Job `content-safety-gate` na PR-ze przechodzi i uruchamia `npm run test:gate` — 96bfb95
- [x] 4.9 Raport podaje koszt sędziego i liczbę eskalacji — test raportu — 96bfb95
- [x] 4.10 Zakres trybów według zmienionych plików — test jednostkowy `gate-scope.ts` — 96bfb95
- [x] 4.11 „przepraszam” na liście słów nie jest odmową, „Przepraszam, nie mogę” jest — test jednostkowy czerwony na starym kodzie — 96bfb95
- [x] 4.12 Kalibracja dwustopniowego sędziego w pliku macierzy — 7 fixture'ów passed, z kosztem — 96bfb95

#### Manual

- [ ] 4.6 Step summary joba pokazuje raport bramki, nie notice
- [ ] 4.7 Diff `roadmap.md` (`-w`) zmienia tylko F-02 i Baseline
- [ ] 4.8 Wszystkie commity na `feat/content-safety-gate-resume`
