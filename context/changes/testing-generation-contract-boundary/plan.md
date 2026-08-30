# Runner testów + granica model→kontrakt→zapis — plan implementacji

## Overview

Faza 1 rolloutu z `context/foundation/test-plan.md` §3. Stawiamy runner testów, na którym oprą się fazy 2–4, i domykamy dwa ryzyka: **#2** (odpowiedź spoza kontraktu kończy się cichym pustym planem) oraz **#5** (awaria dostawcy prezentuje się jako sukces albo mylący błąd).

Research zmienił przesłankę fazy i to jest jej najważniejsze ustalenie: **serwerowa ścieżka generowania nie ma dziury „cichego pustego planu"**. Każda gałąź `callOpenRouter` rzuca, zod wypada bezwarunkowo przed zapisem, zapis jest pojedynczą atomową funkcją Postgresa. Testy na tej ścieżce są więc testami **regresji na zachowaniu, które działa** — a warto je napisać, bo dziś ta gwarancja trzyma się wyłącznie na dyscyplinie TypeScriptu i kolejności instrukcji, których nic nie egzekwuje.

Ryzyko #2 jest realne, ale mieszka **poza** tą ścieżką, w trzech niezależnych miejscach: strażniki typów w wyspach przepuszczają pustą tablicę (`.every()` na `[]` to `true`), `save_day_plan_generation` commituje `'[]'::jsonb`, a taki dzień renderuje się na trzech ekranach na trzy różne sposoby i żaden z nich to błąd. Ryzyko #5 wypada gorzej: pięć klas awarii daje bajtowo identyczne 503 „Usługa jest chwilowo przeciążona", w tym przypadek, w którym dostawca **odpowiedział**, tylko niepoprawnym body — a to kosztuje jeszcze płatne ponowienie.

Plan robi więc trzy rzeczy naraz: stawia infrastrukturę, pisze testy regresji tam, gdzie kod jest poprawny, i **naprawia** dwie gałęzie, które kłamią nauczycielowi.

## Current State Analysis

**Runner nie istnieje.** `find` na `vitest.config*`, `vite.config*`, `*.test.ts`, `*.spec.ts`, `jest.config*` zwraca pustkę. Jedyne testy to 71 asercji pgTAP w trzech plikach (`supabase/tests/database/`), uruchamiane ręcznie przez `npm run test:db`, **nigdy w CI**. `ci.yml` robi `npm ci` → `astro sync` → `lint` → `build` i nie deployuje; deploy robi Cloudflare Workers Builds spoza repo, więc **merge do `master` jest releasem**, a PR jest ostatnim miejscem, w którym cokolwiek da się zatrzymać.

**Grunt pod runner jest zielony i zweryfikowany empirycznie w tej sesji, nie założony.** Spike (zainstalowany, uruchomiony, cofnięty — drzewo czyste):

- `vitest@4.1.11` deklaruje `vite: ^6 || ^7 || ^8` i `@types/node: >=24`. Po instalacji **Vite pozostał zdeduplikowany na 7.3.3 w całym drzewie, włącznie z gałęzią pod `vitest`** — ryzyka podwójnej instancji nie ma.
- **`getViteConfig()` wywołane wprost na `astro.config.mjs` nie działa.** `@cloudflare/vite-plugin@1.36.3` odrzuca konfigurację startową: `Error: The following environment options are incompatible with the Cloudflare Vite plugin: "ssr" environment: resolve.external: [...]`. Vitest wstrzykuje `resolve.external` w środowisko `ssr`, a plugin waliduje to w `configResolved` i **przerywa cały przebieg** (`Startup Error`), nie pojedynczy test.
- Przekazanie `{ adapter: undefined, integrations: [] }` jako `inlineAstroConfig` **nie pomaga** — Astro i tak ładuje `astro.config.mjs` z dysku i scala. Ta próba została wykonana i zakończyła się identycznym błędem.
- **Działa** `getViteConfig(viteConfig, { configFile: "./astro.config.test.mjs" })`, gdzie plik testowy re-eksportuje prawdziwą konfigurację bez adaptera. W tym układzie test importujący `activity-generator.ts` — czyli `astro:env/server` **plus** dwa importy `?raw` **plus** dwa JSON-y — przechodzi (`2 passed`, 130 ms) i w wyjściu nie ma już szumu Cloudflare.
- **`test` nie istnieje w typie `ViteUserConfig` Astro**: `error TS2353: Object literal may only specify known properties, and 'test' does not exist in type 'UserConfig'`. Naprawia to `/// <reference types="vitest/config" />` w pierwszej linii — zweryfikowane, `tsc --noEmit` czysty.
- `npx eslint` na pliku konfiguracyjnym i na pliku testowym przeszedł **bez żadnego override'u**. `tsconfig.json` ma `include: ["**/*"]`, więc pliki testowe są typowane.
- **Żaden sekret nie jest potrzebny.** Wszystkie cztery zmienne w `astro.config.mjs` są `optional: true`, więc `astro:env/server` zwraca `undefined` zamiast rzucać.

**Granica sieciowa to dokładnie jedno wywołanie.** `fetch(OPENROUTER_URL, …)` w `callOpenRouter` (`src/lib/services/activity-generator.ts:231`) — bez SDK, bez wrappera, bez wstrzykiwanego klienta. Obie publiczne funkcje schodzą do niego. Podmiana `globalThis.fetch` przechwytuje 100% ruchu, a `categorizeStatus`, `GenerationError`, `runWithBudget` i mapowanie w trasie wykonują się naprawdę. To jest granica, której wymaga §4 test-planu, i **żaden test w tej fazie nie ma powodu mockować modułu wewnętrznego**.

**Kolaps klas awarii — dokładny kształt.** W `callOpenRouter:262` jeden warunek łączy trzy różne rzeczy:

```ts
if (!choice || choice.finish_reason === "error" || choice.error) {
  throw new GenerationError("transient", "OpenRouter przerwał generowanie w trakcie.", …);
}
```

`!choice` jest prawdziwe, gdy `response.json()` **nie sparsowało się** (`.catch(() => null)` na linii 255) albo gdy w body nie ma tablicy `choices`. To nie jest ta sama awaria co `finish_reason === "error"` — tam dostawca uczciwie melduje, że przerwał w trakcie i drugie podejście ma sens. Tu dostawca odpowiedział **czymś spoza kontraktu**, a `transient` kupuje za to płatne ponowienie i pokazuje nauczycielowi 503 „przeciążona". Osobno: `finish_reason === "length"` **nie jest nigdzie sprawdzane ani logowane**, mimo że komentarz na `activity-generator.ts:48-61` dokumentuje tę awarię jako zaobserwowaną (Gemini palący 728–972 tokenów rozumowania, JSON ucięty w połowie stringa).

**Strażniki w wyspach są zduplikowane i rozjechane.** `isRecord`, `isDayPlanBody` i `isErrorBody` istnieją **w dwóch kopiach** — `WeekPlanBoard.tsx:481-515` i `DayPlanEditor.tsx:647-673` — i kopie **nie są identyczne**: wersja z `WeekPlanBoard` sprawdza `typeof plan.current_generation !== "number"`, wersja z `DayPlanEditor` tego nie robi. Żadna z tych funkcji nie jest eksportowana, więc dziś nie da się ich przetestować inaczej niż przez wyspę. Obie kończą się `.every(...)`, a `[].every()` to `true`.

**Dolna granica liczby aktywności nie istnieje nigdzie.** `insert … select from jsonb_array_elements('[]'::jsonb)` wstawia zero wierszy i **nie podnosi wyjątku**: powstaje `day_plans` z podbitym `current_generation`, wyczyszczonym `accepted_at` i zerem aktywności. Górna granica istnieje, ale wynosi 20 (`check (ordinal between 1 and 20)`), nie 3. `ACTIVITY_COUNT = 3` trzyma wyłącznie `.length(3)` w zodzie.

**Istniejący pgTAP zakłada partie jednoelementowe.** Trzynaście call-site'ów w `day_plan_write.test.sql` i `day_plan_delete.test.sql` woła pisarza z jednym elementem, a `day_plan_write.test.sql:244-254` wprost asertuje `lives_ok` na takim wywołaniu. **To jest powód, dla którego dolną granicą jest „niepusta", a nie „dokładnie 3"** — patrz Key Discoveries.

**Wstrzykiwalność jest już zrobiona.** `day-plan-store.ts:22-26`: „Klient jest zawsze pierwszym argumentem, nigdy singletonem modułu." Trasy dostają klienta z `context.locals.supabase`, więc `locals` **jest** punktem wstrzyknięcia. Faza nie wymaga żadnego refaktoru pod testowalność po stronie zapisu.

**Anty-próżniowość jest lokalną kulturą testów.** `rls_isolation.test.sql:152-156` stwierdza wprost, że każda asercja negatywna przeszłaby przy polityce deny-all, i trzyma blok pozytywny po to, żeby były rozróżniające — *„nie kasuj ich, żeby «uprościć» zestaw"*. Testy Vitest są mierzone tą samą miarą, i to jest ta sama reguła co „Kryterium weryfikacji musi móc nie przejść" z `lessons.md`.

## Desired End State

`npm test` uruchamia zestaw Vitest, który przechodzi lokalnie i w CI na każdym PR-ze przed merge'em do `master`. Zestaw dowodzi — na granicy sieciowej, nigdy przez mock modułu wewnętrznego — że:

1. każda z sześciu klas awarii dostawcy kończy się **odpowiedzią błędu i zerem wywołań `rpc`**, a dwie klasy, które dziś kłamią, mówią prawdę: niepoprawne body dostawcy to `invalid`/502 **bez płatnego ponowienia**, a ucięta odpowiedź (`finish_reason: "length"`) jest wykrywana i logowana pod własną nazwą;
2. odpowiedź spoza kontraktu (dwie aktywności, zero aktywności, brak pola, przekroczona długość) nigdy nie dociera do zapisu;
3. szczęśliwa ścieżka woła `rpc` **dokładnie raz**, z dokładnie trzema aktywnościami;
4. pusta partia jest **odmawiana przez schemat**, nie przez TypeScript;
5. strażniki wysp — teraz jeden wspólny moduł zamiast dwóch rozjechanych kopii — odrzucają pustą tablicę.

`test-plan.md` §6.1 i §6.2 przestają być „TBD", §5 ma bramkę `unit + integration` jako `wired`, a §3 wiersz Fazy 1 jest `complete`.

### Key Discoveries

- **Adapter Cloudflare wywraca Vitest na starcie, a nie na teście** — `@cloudflare/vite-plugin` waliduje `resolve.external` w `configResolved` i rzuca `Startup Error`. Jedyna działająca ścieżka to `configFile` wskazujący na konfigurację bez adaptera (zweryfikowane w tej sesji, oba warianty bez `configFile` sprawdzone i odrzucone).
- **`astro.config.test.mjs` musi importować prawdziwą konfigurację, nie kopiować jej.** Schemat `env` żyje w `astro.config.mjs` i jest tym, co daje `astro:env/server`. Kopia rozjechałaby się przy pierwszej nowej zmiennej.
- **`!choice` łączy dwie różne awarie w jednym warunku** (`activity-generator.ts:262`) — nieparsowalne body dostawcy i uczciwie zgłoszone przerwanie generowania. Rozdzielenie ich jest całą naprawą ryzyka #5 w tej fazie.
- **Dolna granica to „niepusta", nie „dokładnie 3"** — i to jest właściwa granica, nie kompromis. „Partia nigdy nie jest pusta" to niezmiennik strukturalny; „dokładnie 3" to decyzja kontraktu promptu, która może się zmienić bez migracji. Wersja z trójką zepsułaby 13+ istniejących asercji pgTAP i przypięłaby schemat do liczby należącej do promptu.
- **`isDayPlanBody` istnieje w dwóch rozjechanych kopiach** — ekstrakcja musi wybrać jedną. Wybieramy **ostrzejszą** (tę z `current_generation`).
- **Strażniki nie mogą zamieszkać obok zoda.** `day-plan-contract.ts:3-7` mówi wprost, dlaczego granice żyją w `day-plan-limits`: wyspa ich potrzebuje i **nie wolno jej wciągnąć zoda do bundla klienta**. Wspólny moduł strażników podlega temu samemu zakazowi.
- **Runner nie potrzebuje żadnego sekretu**, ale testy skonfigurowanej ścieżki potrzebują `OPENROUTER_API_KEY` **niepustego** — `requireConfigured()` rzuca `config` przed `fetch`. Wstrzykujemy wartość, nigdy prawdziwy klucz.

## What We're NOT Doing

- **Bez testów renderujących komponenty.** Zakres uzgodniony z użytkownikiem to granica serwera + kontrakt konsumowany przez UI. Strażniki testujemy jako czyste funkcje po ekstrakcji, nie przez montowanie wyspy. §7 test-planu wyklucza snapshoty i testy wizualne.
- **Bez pełnego rozdzielenia klas awarii na sześć komunikatów.** Naprawiamy dwie gałęzie, które kłamią; timeout, 429 i 5xx dalej dzielą jedno **uczciwe** 503, bo nauczyciel nie może zareagować na nie inaczej.
- **Bez rozszerzania pgTAP.** Faza 3 rolloutu jest właścicielem `supabase/tests/database/`. Migracja z tej fazy nie łamie żadnej istniejącej asercji — to warunek, pod którym wybrano granicę „niepusta".
- **Bez testów `Promise.allSettled` na trasie tygodnia.** Częściowo wygenerowany tydzień jest normalnym, oczekiwanym wynikiem (`context/archive/2026-08-23-week-generation/plan.md`); ta ścieżka należy do Fazy 3.
- **Bez naprawy `readMonthSummary`**, które pokazuje pusty dzień jako „zaplanowany". Po migracji z fazy 4 taki stan przestaje być osiągalny przez zapis; korekta samego odczytu to zmiana produktowa poza tym rolloutem.
- **Bez ruszania `scripts/compare-models.sh`** i jego bezwarunkowego `exit 0`. To Faza 2 rolloutu (bramka bezpieczeństwa treści).
- **Bez `astro check` w CI.** Bramka nie istnieje dziś i ta faza jej nie wprowadza.
- **Bez e2e i bez Playwrighta.** Faza 4.

## Implementation Approach

Pięć faz w kolejności rosnącego ryzyka, każda zostawiająca drzewo zielone. Faza 1 stawia infrastrukturę i bramkę CI, więc **wszystkie kolejne commity są już przez nią pilnowane**. Fazy 2 i 3 idą od najtańszej warstwy (unit na granicy sieciowej) do integracji na trasie. Faza 4 domyka obronę w głąb w schemacie i w wyspach. Faza 5 zamienia to, czego się nauczyliśmy, w cookbook, który czyta `/10x-tdd`.

Testy mockują **wyłącznie `globalThis.fetch`**. Klient Supabase jest podstawiany jako atrapa przez `context.locals`, co konwencja projektu już umożliwia. Każda asercja negatywna („zapis się nie odbył", „ponowienia nie było") musi zostać sprawdzona mutacją — zgodnie z `lessons.md` i z nagłówkami istniejących plików pgTAP.

## Critical Implementation Details

**Kolejność w Fazie 1 jest wymuszona.** Krok CI (`npm test`) musi trafić do `ci.yml` **po** `npx astro sync`, bo to on generuje `.astro/env.d.ts`, a `.astro/` jest w `.gitignore`. Bez tego `astro:env/server` nie ma typów w świeżym checkoucie.

**Bramka CI może nie przejść dopiero, gdy istnieje test, który potrafi zawieść.** Nie wolno domknąć Fazy 1 na pustym zestawie: `vitest run` bez plików testowych kończy się błędem albo sukcesem zależnie od `passWithNoTests`, i w obu wypadkach nie sprawdza niczego. Faza 1 kończy się na teście, który został **zobaczony na czerwono** przed zazielenieniem.

**Timeout testujemy przez odrzucenie, nie przez czekanie.** `ATTEMPT_TIMEOUT_MS` to 45 s, `TOTAL_BUDGET_MS` 60 s, a `RETRY_BACKOFF_MS` to realny `setTimeout` w `runWithBudget:361`. Test klasy „timeout" podstawia `fetch`, który odrzuca `DOMException("…", "TimeoutError")` — to jest dokładnie to, co robi `AbortSignal.timeout`, i przechodzi tą samą gałęzią `catch` na `activity-generator.ts:241`. Test ponowienia musi wystawić **fake timers**, inaczej każdy przypadek `transient` kosztuje sekundę realnego czasu.

**`runWithBudget` ponawia tylko `transient` i tylko gdy zostało budżetu.** Po naprawie z Fazy 2 nieparsowalne body przestaje być `transient`, więc **liczba wywołań `fetch` spada z 2 na 1** — i to jest najostrzejsza asercja tej naprawy, mocniejsza niż sam kod statusu.

## Phase 1: Runner + bramka CI

### Overview

Vitest uruchamia się lokalnie i w CI na konfiguracji, którą spike potwierdził. Faza kończy się na teście, który realnie coś sprawdza.

**Zanim powstanie pierwszy commit: `git branch --show-current` mówi dziś `master`.** `CLAUDE.md` §Git wymaga gałęzi funkcyjnej dla każdego slice'u od S-03 w górę. Załóż ją przed czymkolwiek innym.

### Changes Required:

#### 1. Zależność runnera

**File**: `package.json`

**Intent**: Dodać Vitest jako zależność deweloperską i wystawić `npm test` jako nazwę, którą wołają CI i cookbook.

**Contract**: `devDependencies.vitest` w linii `^4.1.11` (zweryfikowane: `vite: ^6 || ^7 || ^8`, `@types/node: >=24` — zgodne z Vite 7.3.3 w drzewie i Node 24). Nowy skrypt `"test": "vitest run"`. Skrypt `test:db` zostaje nietknięty — to osobna bramka o osobnym cyklu życia.

#### 2. Konfiguracja Astro dla testów

**File**: `astro.config.test.mjs` (nowy, w katalogu głównym)

**Intent**: Dać `getViteConfig` konfigurację bez adaptera Cloudflare, zachowując schemat `env` jako jedyne źródło prawdy. Bez tego pliku Vitest nie wstaje w ogóle.

**Contract**: Domyślny eksport rozszerzający import z `./astro.config.mjs`, z `adapter` i `integrations` usuniętymi. Musi **importować**, nie kopiować — schemat `env` z `astro.config.mjs` jest tym, co daje testom `astro:env/server`.

```js
import base from "./astro.config.mjs";
export default { ...base, adapter: undefined, integrations: [] };
```

Plik zasługuje na komentarz nagłówkowy z powodem swojego istnienia — dosłowną treścią błędu `@cloudflare/vite-plugin`. Bez niego następny czytelnik usunie go jako duplikat.

#### 3. Konfiguracja Vitest

**File**: `vitest.config.ts` (nowy, w katalogu głównym)

**Intent**: Uruchomić Vitest w środowisku `node` na wirtualnych modułach Astro.

**Contract**: `/// <reference types="vitest/config" />` **w pierwszej linii** — bez niej `tsc --noEmit` zgłasza `TS2353: 'test' does not exist in type 'UserConfig'`. Eksport z `getViteConfig(viteConfig, { configFile: "./astro.config.test.mjs" })`. W `test`: `environment: "node"` (Astro 6 usunęło renderowanie komponentów w środowiskach klienckich), `include: ["src/**/*.test.ts"]` (zgodnie z decyzją o ko-lokacji), `unstubGlobals: true` (automatyczne cofanie podmiany `fetch` między testami).

#### 4. Wykluczenie plików testowych z bundla

**File**: `astro.config.mjs` lub `tsconfig.json` — zależnie od tego, co pokaże weryfikacja

**Intent**: Upewnić się, że `*.test.ts` nie trafia do bundla SSR ani do wyniku `astro check`.

**Contract**: `astro build` buduje tylko to, co osiągalne z tras, więc ko-lokowany `.test.ts` **prawdopodobnie** nie ma jak trafić do wyniku. To jest do **sprawdzenia, nie do założenia**: kryterium automatyczne poniżej to weryfikuje, i tylko jeśli wypadnie negatywnie, dokładamy wykluczenie. Nie dodawaj konfiguracji „na wszelki wypadek".

#### 5. Pierwszy test — i on musi umieć zawieść

**File**: `src/lib/services/day-plan-contract.test.ts` (nowy)

**Intent**: Zamknąć fazę na teście, który realnie sprawdza kontrakt, a nie na placeholderze. `day-plan-contract.ts` jest najlepszym pierwszym celem: nie dotyka `astro:env/server`, jest czystą funkcją i trzyma **jedyny** egzekutor liczby 3.

**Contract**: `dayPlanProposalSchema` odrzuca tablice o długości 0, 2 i 4, przyjmuje 3; `.refine` na unikalności `dzien` w `weekOutlineSchema` odrzuca `1,2,2,4,5`. Import przez `import { describe, expect, it } from "vitest"` — **nie** przez `globals: true`. Research ustalił, że globale zapaliłyby `no-unsafe-call` przy `strictTypeChecked`, a import omija to bez zawężania nieistniejącej dziś tablicy `types`.

#### 6. Krok CI

**File**: `.github/workflows/ci.yml`

**Intent**: Bramka staje przed merge'em do `master`, który deployuje na produkcję bez kroku zatwierdzenia.

**Contract**: `- run: npm test` między `npm run lint` a `npm run build`. **Koniecznie po `npx astro sync`** (patrz Critical Implementation Details). Bez `env:` — żaden sekret nie jest potrzebny.

### Success Criteria:

#### Automated Verification:

- Instalacja nie rozbija dedupliakcji Vite: `npm ls vite` pokazuje wyłącznie `7.3.3` i `deduped`, także w gałęzi pod `vitest`
- Runner wstaje i przechodzi: `npm test`
- Typy są czyste: `npx astro sync && npx tsc --noEmit` nie zgłasza błędu w `vitest.config.ts` ani w żadnym `*.test.ts`
- Lint przechodzi bez nowego override'u: `npm run lint`
- Build nie regresuje: `npm run build`
- Pliki testowe nie trafiają do bundla: `npm run build && grep -rl "day-plan-contract.test" dist/ || echo "not bundled"` zwraca `not bundled`
- Bramka potrafi zawieść: po odwróceniu jednej asercji w `day-plan-contract.test.ts` `npm test` **kończy się kodem ≠ 0**; asercja wraca do poprawnej postaci, `npm test` znów zielone

#### Manual Verification:

- `astro.config.test.mjs` niesie w nagłówku dosłowną treść błędu `@cloudflare/vite-plugin`, więc następny czytelnik wie, dlaczego plik istnieje i czego nie wolno w nim uprościć
- Krok `npm test` jest widoczny w logu CI na PR-ze i stoi po `astro sync`, a przed `build`

**Implementation Note**: Po zazielenieniu kryteriów automatycznych zatrzymaj się i potwierdź z człowiekiem, że test faktycznie widziano na czerwono, zanim ruszy Faza 2.

---

## Phase 2: Klasy awarii dostawcy (ryzyko #5)

### Overview

Naprawa dwóch gałęzi, które kłamią nauczycielowi, i testy jednostkowe na wszystkich sześciu klasach awarii — na granicy sieciowej, przez podmianę `fetch`.

### Changes Required:

#### 1. Rozdzielenie nieparsowalnego body od przerwanego generowania

**File**: `src/lib/services/activity-generator.ts`

**Intent**: `!choice` znaczy „dostawca odpowiedział czymś spoza kontraktu" i należy do kategorii `invalid`; `finish_reason === "error"` i `choice.error` znaczą „dostawca uczciwie zgłosił przerwanie" i zostają `transient`. Dziś jeden warunek łączy oba, przez co niepoprawne body kosztuje płatne ponowienie i pokazuje 503 „przeciążona".

**Contract**: Warunek na `activity-generator.ts:262` rozpada się na dwa. `!choice` → `GenerationError("invalid", …)` z komunikatem nazywającym przyczynę (odpowiedź nie ma rozpoznawalnego kształtu). Pozostałe dwa sygnały zostają `transient` z dzisiejszym komunikatem i dzisiejszym `status`/`errorType`. Kategoria `invalid` mapuje się w trasie na 502 i `retryable: false` — bez zmian w `generate.ts`, tabele `STATUS_BY_CATEGORY` i `MESSAGE_BY_CATEGORY` już to obsługują.

#### 2. Wykrycie uciętej odpowiedzi

**File**: `src/lib/services/activity-generator.ts`

**Intent**: `finish_reason: "length"` jest udokumentowaną, zaobserwowaną awarią (komentarz na `:48-61`), a kod jej nie wykrywa ani nie loguje — dociera do nauczyciela jako generyczne `invalid` po pełnym oczekiwaniu, z niczym w logu, co nazwałoby przyczynę.

**Contract**: Osobna gałąź przed próbą `JSON.parse`, kategoria `invalid` (ponowienie tego samego żądania z tym samym `MAX_TOKENS` nie ma jak pomóc), własny komunikat wewnętrzny i `errorType` rozpoznawalny w logu. Komunikat dla nauczyciela zostaje ten z `MESSAGE_BY_CATEGORY.invalid` — rozróżnienie jest dla operatora, nie dla nauczyciela.

#### 3. Pomocnik do podmiany granicy sieciowej

**File**: `src/lib/services/__fixtures__/openrouter.ts` (nowy) — nazwa katalogu do uzgodnienia z konwencją, którą utrwali §6

**Intent**: Jedno miejsce, które buduje odpowiedzi OpenRoutera i awarie transportu, żeby sześć klas awarii czytało się jako sześć wierszy, a nie sześć bloków `new Response(JSON.stringify(...))`.

**Contract**: Funkcje budujące: poprawną odpowiedź 200 z zadanym `content`, odpowiedź 200 z zadanym `finish_reason`, odpowiedź o zadanym statusie z envelope błędu OpenRoutera, body nieparsowalne jako JSON, oraz odrzucenie `DOMException(…, "TimeoutError")` i zwykły błąd sieciowy. Pomocnik **nie** importuje niczego z `activity-generator.ts` — kształt odpowiedzi dostawcy musi być w teście opisany niezależnie, inaczej test sprawdza sam siebie (anty-wzorzec #5 z test-planu).

#### 4. Testy klas awarii

**File**: `src/lib/services/activity-generator.test.ts` (nowy)

**Intent**: Udowodnić, że każda klasa awarii daje właściwą kategorię, właściwą `retryable` i właściwą liczbę wywołań `fetch`.

**Contract**: `OPENROUTER_API_KEY` wstrzyknięte tak, żeby `requireConfigured()` przepuściło (podmiana modułu wirtualnego przez `vi.mock("astro:env/server", …)` — to **nie** jest mock modułu wewnętrznego, tylko dostarczenie konfiguracji). Fake timers, bo `RETRY_BACKOFF_MS` to realny `setTimeout`. Przypadki: błąd sieci, `TimeoutError`, 429, 500, 401, body nieparsowalne, `finish_reason: "error"`, `finish_reason: "length"`, pusty `content`, `content` niebędący JSON-em, odpowiedź niespełniająca zoda. Dla każdego: kategoria, `retryable`, i **liczba wywołań `fetch`** (2 dla `transient`, 1 dla reszty). Brak klucza → `config` **przy zerze wywołań `fetch`**.

### Success Criteria:

#### Automated Verification:

- `npm test` zielone
- `npm run lint`, `npx tsc --noEmit`, `npm run build` bez regresji
- Nieparsowalne body daje `invalid` przy **dokładnie jednym** wywołaniu `fetch` — asercja na liczniku, nie tylko na kategorii
- `finish_reason: "length"` daje `invalid` i **nie** jest ponawiane
- 429 i 5xx dalej dają `transient` przy **dwóch** wywołaniach `fetch` — dowód, że naprawa nie zabrała ponowienia tam, gdzie ono ma sens
- Każdy test klasy awarii widziany na czerwono: tymczasowe odwrócenie naprawy z pkt. 1 psuje **wyłącznie** przypadek nieparsowalnego body i pozostawia resztę zieloną

#### Manual Verification:

- Log z nieparsowalnego body nazywa przyczynę inaczej niż log z `finish_reason: "error"` — dwa różne zdarzenia są rozróżnialne dla operatora
- Nauczyciel przy nieparsowalnym body czyta „Coś poszło nie tak podczas generowania", nie „Usługa jest chwilowo przeciążona"

**Implementation Note**: Zatrzymaj się po tej fazie na potwierdzenie, że zmiana kategorii nie zmieniła zachowania żadnej klasy, która działała poprawnie.

---

## Phase 3: Granica kontrakt→zapis (ryzyko #2, serwer)

### Overview

Testy integracyjne na `POST /api/day-plan/generate`: odpowiedź spoza kontraktu kończy się błędem i **zerem** wywołań `rpc`, a szczęśliwa ścieżka woła `rpc` dokładnie raz z trzema aktywnościami.

### Changes Required:

#### 1. Atrapa klienta Supabase

**File**: `src/lib/services/__fixtures__/supabase.ts` (nowy)

**Intent**: Podstawić klienta przez `context.locals` — punkt wstrzyknięcia, który konwencja projektu już zapewnia (`day-plan-store.ts:22-26`), więc kod produkcyjny nie wymaga zmiany.

**Contract**: Atrapa z liczonym `rpc` i z `from(...).select(...)` na tyle, na ile potrzebują `readDayPlan` i `requireSaved`. Musi umieć zwrócić „dzień nie istnieje" (ścieżka przedkontroli w `generate.ts:123`) i „zapis się udał". Liczniki wywołań są tym, co asertujemy — nie same wartości zwrotne.

#### 2. Testy trasy generowania

**File**: `src/pages/api/day-plan/generate.test.ts` (nowy)

**Intent**: `POST` jest eksportowany i wywoływalny wprost, więc trasa testuje się bez serwera HTTP.

**Contract**: Wywołanie `POST({ request, locals })` z ręcznie zbudowanym `Request` i atrapą `locals`. Przypadki: (a) model zwraca dwie aktywności → odpowiedź 502, `rpc` **zero razy**; (b) model zwraca zero aktywności → to samo; (c) model zwraca brak pola `aktywnosci` → to samo; (d) model przekracza `DESCRIPTION_MAX` → to samo; (e) awaria dostawcy z Fazy 2 → właściwy status, `rpc` zero razy; (f) szczęśliwa ścieżka → 200, `rpc` **dokładnie raz**, a przekazany argument niesie **trzy** aktywności; (g) brak `locals.user` → 401 przy zerze wywołań `fetch`.

Przypadek (f) jest tym, co czyni resztę rozróżniającą — bez niego cały zestaw przechodziłby przy `rpc`, którego nikt nigdy nie woła. To jest ta sama zasada, którą deklaruje `rls_isolation.test.sql:152-156`.

#### 3. Kontrakt konspektu tygodnia

**File**: `src/lib/services/day-plan-contract.test.ts` (rozszerzenie z Fazy 1)

**Intent**: `.refine` na unikalności `dzien` jest jedyną regułą kontraktu z udokumentowaną, widoczną dla użytkownika awarią — bez niej `1,2,2,4,5` przechodzi i środa zostaje bez tematu.

**Contract**: Duplikat `dzien` odrzucony; komplet 1–5 przyjęty; `toDayThemes` mapuje po pozycji po sortowaniu (`day-plan-contract.ts:100-104`), więc test przypina wynik do dat, nie do numerów.

### Success Criteria:

#### Automated Verification:

- `npm test` zielone
- `npm run lint`, `npx tsc --noEmit`, `npm run build` bez regresji
- Każdy przypadek spoza kontraktu asertuje `rpc` **zero razy** — licznik, nie brak wyjątku
- Szczęśliwa ścieżka asertuje `rpc` **dokładnie raz** z trzema aktywnościami
- Zestaw jest rozróżniający: tymczasowa zamiana kolejności w `generate.ts` (zapis przed walidacją) psuje przypadki (a)–(e) i **zostawia (f) zielonym**

#### Manual Verification:

- Żaden test w tej fazie nie mockuje modułu z `src/lib/services/` — jedyne podmiany to `globalThis.fetch` i `locals`
- Atrapa Supabase nie odwzorowuje kształtu odpowiedzi PostgREST głębiej, niż wymagają tego wołane funkcje

**Implementation Note**: Zatrzymaj się przed Fazą 4 — od niej zaczynają się zmiany w schemacie i w wyspach.

---

## Phase 4: Domknięcie dziur pustego planu (ryzyko #2, obrona w głąb)

### Overview

Pusta partia przestaje być reprezentowalna w bazie, a strażniki wysp przestają ją przepuszczać. Dwie warstwy, jedna awaria.

### Changes Required:

#### 1. Migracja: partia nie może być pusta

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_reject_empty_activity_batch.sql` (nowy)

**Intent**: `ACTIVITY_COUNT` jest dziś egzekwowane wyłącznie w zodzie, wbrew zapisanej zasadzie projektu, że niezmienniki mieszkają w schemacie. Granica „niepusta" przenosi do schematu tę część, która jest niezmiennikiem strukturalnym, i zostawia „dokładnie 3" w zodzie, gdzie jest decyzją kontraktu promptu.

**Contract**: `create or replace function public.save_day_plan_generation(...)` z zachowaną sygnaturą sześciu argumentów i zachowanym `security invoker` / `set search_path = ''`. Nowy warunek **przed** upsertem rodzica: `jsonb_array_length(p_activities) = 0` → `raise exception` z własnym `errcode` w przestrzeni `U....` (dzisiejsze `U0001` i `U0002` są zajęte przez „accepted" i „already exists"). Odmowa musi paść przed podbiciem `current_generation`, inaczej pusta partia zostawia po sobie wyczyszczone `accepted_at`.

Nowy `errcode` wymaga sprawdzenia, jak `toStoreError` w `day-plan-store.ts` tłumaczy nieznane kody Postgresa — jeśli nieznany kod ląduje w kategorii dającej mylący komunikat, mapowanie dostaje jeden wiersz. **Sprawdź, nie zakładaj.**

> **Świadome ograniczenie, zapisane jako decyzja, nie przeoczenie**: granica jest „≥ 1", nie „= 3". Partia dwuelementowa dalej się zapisze. Nic w kodzie nie potrafi jej wyprodukować — zod trzyma trójkę przed zapisem — a granica równa trzem zepsułaby 13+ istniejących asercji pgTAP i przypięła schemat do liczby należącej do promptu. Właścicielem ewentualnego zaostrzenia jest Faza 3 rolloutu, która i tak jest właścicielem `supabase/tests/database/`.

#### 2. Wspólny moduł strażników

**File**: `src/lib/day-plan-guards.ts` (nowy)

**Intent**: `isRecord`, `isDayPlanBody`, `isErrorBody` istnieją w dwóch kopiach, które zdążyły się rozjechać. Ekstrakcja usuwa duplikat, godzi rozjazd i — po raz pierwszy — czyni te funkcje testowalnymi bez montowania wyspy.

**Contract**: Moduł w `src/lib/`, nie w `src/lib/services/`, i **bez importu zoda** — z tego samego powodu, dla którego istnieje `day-plan-limits` (`day-plan-contract.ts:3-7`: wyspa nie może wciągnąć zoda do bundla klienta). Eksportuje `isRecord`, `isDayPlanBody`, `isOutlineBody`, `isErrorBody`. `isDayPlanBody` przyjmuje wersję **ostrzejszą** — tę z `WeekPlanBoard`, sprawdzającą `current_generation`. Rozjazd i jego rozstrzygnięcie zasługują na komentarz: `DayPlanEditor` dostaje sprawdzenie, którego dotąd nie miał, i to jest zamierzone.

#### 3. Domknięcie `.every()` na pustej tablicy

**File**: `src/lib/day-plan-guards.ts`

**Intent**: `[].every()` zwraca `true`, więc `{"themes": []}` i `{"plan": {...}, "activities": []}` przechodzą dziś jako **sukces**. Tablica tygodnia oznacza taki dzień jako `done`, a `readyCount` liczy go jako gotowy.

**Contract**: Oba strażniki wymagają tablicy niepustej, zanim sprawdzą elementy. Granica jest „niepusta", nie „dokładnie 3" — spójnie z migracją i z tego samego powodu: wyspa nie jest miejscem, w którym mieszka liczba z kontraktu promptu.

#### 4. Wyspy używają wspólnego modułu

**File**: `src/components/plan/WeekPlanBoard.tsx`, `src/components/plan/DayPlanEditor.tsx`

**Intent**: Usunąć obie lokalne kopie na rzecz importu.

**Contract**: Import z `@/lib/day-plan-guards`; lokalne definicje znikają. Komentarze uzasadniające *narrowing zamiast asercji* (`WeekPlanBoard.tsx:475-480`, `DayPlanEditor.tsx:640-646`) przenoszą się do wspólnego modułu — niosą uzasadnienie, nie opis, i nie wolno ich zgubić przy przenosinach.

#### 5. Testy strażników

**File**: `src/lib/day-plan-guards.test.ts` (nowy)

**Intent**: Czyste funkcje, testowane wprost — bez renderowania, zgodnie z uzgodnionym zakresem i z §7 test-planu.

**Contract**: `{"themes": []}` odrzucone; `{"plan": {…}, "activities": []}` odrzucone; poprawne body przyjęte (przypadek rozróżniający); body z aktywnością bez `description` odrzucone; body bez `current_generation` odrzucone — to jest ta połowa rozjazdu, której `DayPlanEditor` dotąd nie łapał.

### Success Criteria:

#### Automated Verification:

- Migracja stosuje się czysto: `npx supabase db reset`
- Istniejący pgTAP przechodzi **bez zmian**: `npm run test:db` zielone, `plan(42)` i `plan(23)` bez modyfikacji — to jest warunek, pod którym wybrano granicę „niepusta"
- `npm test` zielone
- `npm run lint`, `npx tsc --noEmit`, `npm run build` bez regresji
- Migracja potrafi odmówić: ręczne wywołanie `save_day_plan_generation` z `'[]'::jsonb` w `psql` **rzuca**, a `select count(*) from day_plans where plan_date = <ta data>` zwraca `0` — dowód, że odmowa padła przed upsertem
- W `src/components/plan/` nie ma już definicji strażników: `grep -n "function isDayPlanBody\|function isRecord\|function isOutlineBody" src/components/plan/*.tsx` zwraca pustkę
- Zestaw strażników jest rozróżniający: przywrócenie `.every()` bez sprawdzenia długości psuje przypadki pustych tablic i zostawia przypadek poprawnego body zielonym

#### Manual Verification:

- `/plan/week` po ręcznym zwróceniu `{"themes": []}` (podmiana odpowiedzi w narzędziach deweloperskich) pokazuje **błąd**, a nie pięć dni bez tematu
- Nowy `errcode` dociera do nauczyciela jako sensowny komunikat, nie jako generyczna awaria zapisu — zweryfikowane przez `toStoreError`
- Komentarze uzasadniające narrowing przetrwały przenosiny do wspólnego modułu

**Implementation Note**: Ta faza dotyka schematu i wysp. Zatrzymaj się na pełne potwierdzenie manualne przed Fazą 5.

---

## Phase 5: Cookbook i status rolloutu

### Overview

To, czego faza się nauczyła, zostaje zapisane tam, gdzie następna faza i `/10x-tdd` to przeczytają.

### Changes Required:

#### 1. Cookbook §6.1 i §6.2

**File**: `context/foundation/test-plan.md`

**Intent**: §6.1 i §6.2 przestają być „TBD". Po Module 3 §6 jest kanoniczną odpowiedzią na „jak dodać test dla X w tym projekcie".

**Contract**: §6.1 (test jednostkowy) i §6.2 (test integracyjny), każde z: lokalizacją (ko-lokowany `*.test.ts` obok modułu), nazewnictwem, testem referencyjnym (`activity-generator.test.ts` dla jednostkowego, `generate.test.ts` dla integracyjnego), poleceniem uruchomienia (`npm test`) oraz **regułą, kiedy tutaj, a kiedy wyżej** — wzorem §6.4, które już taką regułę niesie. Reguła musi nazwać zasadę mockowania: wyłącznie `globalThis.fetch` i `locals`, nigdy moduł z `src/lib/`.

#### 2. Notatka z fazy

**File**: `context/foundation/test-plan.md` §6.6

**Intent**: Dwie–trzy linie o tym, czego faza nauczyła.

**Contract**: Co najmniej: adapter Cloudflare wywraca Vitest na starcie i wymaga `astro.config.test.mjs`; przesłanka fazy była w połowie nieaktualna, a ryzyko #2 mieszkało piętro wyżej, niż plan zakładał.

#### 3. Status bramki i fazy

**File**: `context/foundation/test-plan.md`

**Intent**: §5 i §3 mają odzwierciedlać stan faktyczny.

**Contract**: W §5 wiersz `unit + integration` zmienia `required after §3 Phase 1` na `required (wired)`. W §3 wiersz Fazy 1 zmienia Status na `complete`. Data w nagłówku („Last updated") i §8 „Strategy last reviewed" idą na dzień lądowania. Poza tymi polami §3, §5 i §8 nie są ruszane.

#### 4. Zamknięcie zmiany

**File**: `context/changes/testing-generation-contract-boundary/change.md`, `context/foundation/roadmap.md`

**Intent**: Stan zmiany i roadmapy zgodny z rzeczywistością.

**Contract**: `change.md` dostaje `status: implemented` i `updated: <dzień lądowania>`. Roadmapa: sprawdź, czy niesie pozycję o `Change ID` równym `testing-generation-contract-boundary` — jeśli tak, przesuń jej Status; jeśli nie, zostaw nietkniętą i odnotuj to.

### Success Criteria:

#### Automated Verification:

- W §6.1 i §6.2 nie ma już „TBD": `grep -n "TBD" context/foundation/test-plan.md` nie zwraca linii z sekcji 6.1 ani 6.2 (6.3 i 6.5 zostają „TBD" — należą do Faz 3 i 2)
- Wiersz Fazy 1 w §3 ma Status `complete`: `grep -n "complete" context/foundation/test-plan.md`
- Bramka `unit + integration` w §5 nie jest już warunkowa: `grep -n "required after §3 Phase 1" context/foundation/test-plan.md` zwraca pustkę
- Poza §3, §5, §6 i §8 test-plan nietknięty: `git diff -w master..HEAD -- context/foundation/test-plan.md` pokazuje zmiany wyłącznie w tych sekcjach (`-w`, bo edycja komórki Status przerównuje whitespace całej tabeli — patrz `lessons.md`)
- Cały zestaw dalej zielony: `npm test`, `npm run lint`, `npm run build`, `npm run test:db`

#### Manual Verification:

- §6.1 i §6.2 odpowiadają na „jak dodać test dla X" bez czytania kodu testów — czytelnik, który nie brał udziału w tej fazie, wie, gdzie utworzyć plik i czego nie wolno mockować
- Notatka §6.6 mówi, czego faza nauczyła, a nie co zrobiła

---

## Testing Strategy

### Unit Tests:

- `day-plan-contract.ts` — długości 0, 2, 3, 4; granice `TITLE_MAX` i `DESCRIPTION_MAX`; duplikat `dzien` w konspekcie; `toDayThemes` przypinające tematy do dat
- `activity-generator.ts` — sześć klas awarii, kategoria, `retryable` i **liczba wywołań `fetch`** dla każdej; brak klucza przy zerze wywołań
- `day-plan-guards.ts` — pusta tablica odrzucona w obu strażnikach; poprawne body przyjęte; brak `current_generation` odrzucony

### Integration Tests:

- `POST /api/day-plan/generate` — cztery kształty odpowiedzi spoza kontraktu, każdy z asercją `rpc` zero razy; szczęśliwa ścieżka z `rpc` dokładnie raz i trzema aktywnościami; 401 bez sesji przy zerze wywołań `fetch`

### Manual Testing Steps:

1. `npm run dev` z prawdziwym `OPENROUTER_API_KEY`; wygeneruj plan dnia — trzy propozycje, bez regresji względem dzisiejszego zachowania
2. Podmień `OPENROUTER_MODEL` na nieistniejący model; sprawdź, że nauczyciel czyta komunikat `config`, nie `transient`
3. W narzędziach deweloperskich podmień odpowiedź `/api/week-plan/outline` na `{"themes": []}`; `/plan/week` musi pokazać błąd, nie pięć dni bez tematu
4. `psql` na lokalnej bazie: `select public.save_day_plan_generation(current_date, 'x', '[]'::jsonb)` — musi rzucić, a po rzucie nie może istnieć wiersz `day_plans` na tę datę
5. Otwórz PR; sprawdź, że `npm test` widać w logu CI i że czerwony test blokuje merge

## Performance Considerations

Zestaw ma zostać sekundowy, nie minutowy — to warunek, pod którym bramka nie zacznie uwierać. Dwa realne zagrożenia: `RETRY_BACKOFF_MS` (realny `setTimeout`, mnożony przez liczbę przypadków `transient`) i `ATTEMPT_TIMEOUT_MS` = 45 s. Oba rozbraja to samo: fake timers w testach ponowienia i odrzucanie `TimeoutError` zamiast czekania na prawdziwy abort. Jeśli po Fazie 2 `npm test` przekracza ~10 s, przyczyną prawie na pewno jest brak fake timers w którymś przypadku `transient` — spike'owy przebieg dwóch testów zajął 130 ms.

## Migration Notes

Jedna migracja, w Fazie 4, `create or replace` na istniejącej funkcji. Nie zmienia sygnatury, nie dotyka tabel, nie wymaga backfillu. Wycofanie to `create or replace` z dzisiejszym ciałem.

Dane istniejące: żaden dzisiejszy wiersz nie narusza nowego warunku — pusta partia jest osiągalna tylko przez bezpośrednie wywołanie funkcji, a kod produkcyjny nigdy jej nie wysyła (zod trzyma trójkę). **Sprawdź to mimo wszystko** przed zastosowaniem na środowisku z danymi: `select id from day_plans p where not exists (select 1 from activities a where a.plan_id = p.id and a.generation = p.current_generation)` musi zwrócić zero wierszy.

## References

- Research: `context/changes/testing-generation-contract-boundary/research.md`
- Kontrakt jakości: `context/foundation/test-plan.md` §2 (ryzyka #2, #5), §3 (Faza 1), §4 (stack), §5 (bramki), §6 (cookbook)
- Reguły: `context/foundation/lessons.md` — „Kryterium weryfikacji musi móc nie przejść", „Kryterium «poza X nietknięte» musi być odporne na przerównanie", „Odroczone sprzątanie danych musi mieć właściciela"
- Idiom testowy repo: `supabase/tests/database/rls_isolation.test.sql:152-156` (anty-próżniowość)
- Granica sieciowa: `src/lib/services/activity-generator.ts:231`, kolaps klas: `:262`
- Strażniki do ekstrakcji: `src/components/plan/WeekPlanBoard.tsx:481-515`, `src/components/plan/DayPlanEditor.tsx:647-673`
- Pisarz partii: `supabase/migrations/20260823232953_day_theme_and_absent_guard.sql:100-170`
- Historia: `context/archive/2026-08-22-first-day-generation/plan.md` (§What We're NOT Doing — obietnica domknięta przez tę fazę)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Runner + bramka CI

#### Automated

- [x] 1.1 Instalacja nie rozbija deduplikacji Vite (`npm ls vite` — wyłącznie 7.3.3 i `deduped`) — 54e680c
- [x] 1.2 Runner wstaje i przechodzi (`npm test`) — 54e680c
- [x] 1.3 Typy czyste (`npx astro sync && npx tsc --noEmit`) — 54e680c
- [x] 1.4 Lint przechodzi bez nowego override'u (`npm run lint`) — 54e680c
- [x] 1.5 Build bez regresji (`npm run build`) — 54e680c
- [x] 1.6 Pliki testowe nie trafiają do bundla (grep na `dist/`) — 54e680c
- [x] 1.7 Bramka potrafi zawieść (odwrócona asercja → `npm test` kod ≠ 0, potem powrót do zieleni) — 54e680c

#### Manual

- [ ] 1.8 `astro.config.test.mjs` niesie w nagłówku dosłowną treść błędu `@cloudflare/vite-plugin`
- [ ] 1.9 Krok `npm test` widoczny w logu CI, po `astro sync`, przed `build`

### Phase 2: Klasy awarii dostawcy (ryzyko #5)

#### Automated

- [x] 2.1 `npm test` zielone — 34b696f
- [x] 2.2 `npm run lint`, `npx tsc --noEmit`, `npm run build` bez regresji — 34b696f
- [x] 2.3 Nieparsowalne body → `invalid` przy dokładnie jednym wywołaniu `fetch` — 34b696f
- [x] 2.4 `finish_reason: "length"` → `invalid`, bez ponowienia — 34b696f
- [x] 2.5 429 i 5xx dalej `transient` przy dwóch wywołaniach `fetch` — 34b696f
- [x] 2.6 Testy widziane na czerwono (odwrócenie naprawy psuje wyłącznie przypadek nieparsowalnego body) — 34b696f

#### Manual

- [ ] 2.7 Log rozróżnia nieparsowalne body od `finish_reason: "error"`
- [ ] 2.8 Nauczyciel przy nieparsowalnym body czyta komunikat `invalid`, nie „przeciążona"

### Phase 3: Granica kontrakt→zapis (ryzyko #2, serwer)

#### Automated

- [x] 3.1 `npm test` zielone — 42e62e4
- [x] 3.2 `npm run lint`, `npx tsc --noEmit`, `npm run build` bez regresji — 42e62e4
- [x] 3.3 Każdy przypadek spoza kontraktu asertuje `rpc` zero razy — 42e62e4
- [x] 3.4 Szczęśliwa ścieżka asertuje `rpc` dokładnie raz z trzema aktywnościami — 42e62e4
- [x] 3.5 Zestaw rozróżniający (zamiana kolejności zapis/walidacja psuje (a)–(e), zostawia (f) zielonym) — 42e62e4

#### Manual

- [ ] 3.6 Żaden test nie mockuje modułu z `src/lib/services/`
- [ ] 3.7 Atrapa Supabase nie odwzorowuje PostgREST głębiej, niż wymagają wołane funkcje

### Phase 4: Domknięcie dziur pustego planu (ryzyko #2, obrona w głąb)

#### Automated

- [x] 4.1 Migracja stosuje się czysto (`npx supabase db reset`)
- [x] 4.2 Istniejący pgTAP przechodzi bez zmian (`npm run test:db`, `plan(42)` i `plan(23)` nietknięte)
- [x] 4.3 `npm test` zielone
- [x] 4.4 `npm run lint`, `npx tsc --noEmit`, `npm run build` bez regresji
- [x] 4.5 Migracja potrafi odmówić (pusta partia rzuca, zero wierszy `day_plans` po rzucie)
- [x] 4.6 Brak definicji strażników w `src/components/plan/*.tsx` (grep pusty)
- [x] 4.7 Zestaw strażników rozróżniający (przywrócenie `.every()` psuje puste tablice, zostawia poprawne body zielonym)

#### Manual

- [ ] 4.8 `/plan/week` przy `{"themes": []}` pokazuje błąd, nie pięć dni bez tematu
- [ ] 4.9 Nowy `errcode` daje nauczycielowi sensowny komunikat przez `toStoreError`
- [ ] 4.10 Komentarze uzasadniające narrowing przetrwały przenosiny

### Phase 5: Cookbook i status rolloutu

#### Automated

- [ ] 5.1 §6.1 i §6.2 bez „TBD" (6.3 i 6.5 zostają)
- [ ] 5.2 Wiersz Fazy 1 w §3 ma Status `complete`
- [ ] 5.3 `required after §3 Phase 1` nie występuje już w §5
- [ ] 5.4 Poza §3, §5, §6, §8 test-plan nietknięty (`git diff -w master..HEAD`)
- [ ] 5.5 Cały zestaw zielony (`npm test`, `npm run lint`, `npm run build`, `npm run test:db`)

#### Manual

- [ ] 5.6 §6.1 i §6.2 odpowiadają na „jak dodać test dla X" bez czytania kodu testów
- [ ] 5.7 Notatka §6.6 mówi, czego faza nauczyła, a nie co zrobiła
