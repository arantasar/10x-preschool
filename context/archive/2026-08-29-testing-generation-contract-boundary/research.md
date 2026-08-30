---
date: 2026-08-29T13:58:16+02:00
researcher: Janusz Guzowski
git_commit: f70c5f000c761e8da4b2807c556d5e5498989e55
branch: master
repository: 10x-preschool
topic: "Faza 1 rolloutu testów: runner + granica model→kontrakt→zapis (ryzyka #2, #5)"
tags: [research, codebase, test-plan, phase-1, vitest, activity-generator, day-plan-store, openrouter]
status: complete
last_updated: 2026-08-29
last_updated_by: Janusz Guzowski
---

# Research: runner testów + granica model→kontrakt→zapis

**Data**: 2026-08-29 13:58 +02:00
**Researcher**: Janusz Guzowski
**Git commit**: `f70c5f0` (wypchnięty; permalinki: `https://github.com/arantasar/10x-preschool/blob/f70c5f0/<ścieżka>#L<linia>`)
**Branch**: master
**Repozytorium**: 10x-preschool

## Research Question

Faza 1 z [test-plan.md](../../foundation/test-plan.md) §3: udowodnić, że **odpowiedź spoza
kontraktu i awaria dostawcy kończą się uczciwą porażką, a nie cichym pustym planem**
(ryzyka #2 i #5) — oraz postawić runner testów, na którym oprą się fazy 2–4.

Zakres ustalony z użytkownikiem: granica serwera + kontrakt, który konsumuje UI (bez
testów renderujących komponenty); runner zbadany na tyle, by `/10x-plan` mógł podjąć
decyzję konfiguracyjną.

## Summary

**Główny wniosek: przesłanka fazy jest w połowie nieaktualna, i to jest dobra wiadomość
zmieniona w konkretną robotę.**

Serwerowa ścieżka generowania **już dziś nie ma dziury „cichego pustego planu"**. Każda
gałąź w `callOpenRouter` rzuca, walidacja zoda wypada bezwarunkowo **przed** jakimkolwiek
zapisem, a zapis jest **pojedynczą atomową funkcją Postgresa**. Odpowiedź spoza kontraktu
nie może zostać zapisana ani zwrócona jako 200. Testy na tej ścieżce są więc **testami
regresji na zachowaniu, które działa** — a to nie jest strata: gwarancja trzyma się dziś
wyłącznie na dyscyplinie TypeScriptu i kolejności instrukcji, których nic nie egzekwuje.

Ale ryzyko #2 jest realne — **tylko mieszka piętro wyżej, niż plan zakładał**. Znaleziono
trzy niezależne dziury, wszystkie poza ścieżką, którą faza miała pokryć:

1. **Strażniki typów w wyspach przepuszczają pustą tablicę.** `isOutlineBody` i
   `isDayPlanBody` kończą się `.every(...)`, a `.every()` na `[]` zwraca `true`. Body
   `{"themes": []}` albo `{"plan": {...}, "activities": []}` przechodzi jako **sukces**.
   Tablica tygodnia oznacza taki dzień jako `done`.
2. **Pusta partia jest legalna w schemacie.** `save_day_plan_generation` z `'[]'::jsonb`
   commituje: podbija licznik, czyści `accepted_at`, wstawia zero aktywności. Jedyne, co
   stoi między modelem a tym stanem, to `.length(3)` w zodzie — nie ma CHECK-a, nie ma
   triggera, nie ma dolnej granicy.
3. **Taki dzień renderuje się na trzy różne sposoby, żaden z nich to błąd**: „brak planu"
   na widoku dnia, `done` na tablicy tygodnia, **zaplanowany** na siatce miesiąca
   (`readMonthSummary` w ogóle nie czyta `activities`).

Ryzyko #5 wypada gorzej: **obietnica „każda klasa awarii daje inny, uczciwy komunikat"
nie jest dziś spełniona.** Timeout, błąd sieci, 429, 5xx **i 200 z niepoprawnym JSON-em**
dają bajtowo identyczne 503 „Usługa generowania jest chwilowo przeciążona". Przypadek
z niepoprawnym body jest wprost mylący — dostawca odpowiedział, a nauczyciel czyta
o przeciążeniu — i dodatkowo kosztuje płatne ponowienie.

**Runner:** grunt zielony. Vite jest zdeduplikowany na 7.3.3 w całym drzewie, `getViteConfig`
jest wyeksportowane przez `astro@6.3.1`, żaden moduł w `src/` nie dotyka globali Workers,
a wszystkie cztery zmienne środowiskowe są `optional` — więc **testy jednostkowe nie
potrzebują żadnego sekretu**. Jedyna realna przeszkoda to wirtualny moduł `astro:env/server`.

## Detailed Findings

### 1. Granica sieciowa — jeden goły `fetch`, dokładnie jeden

Cały ruch do LLM przechodzi przez jedno wywołanie: [activity-generator.ts:231](../../../src/lib/services/activity-generator.ts#L231),
`fetch(OPENROUTER_URL, { method: "POST", signal: AbortSignal.timeout(timeoutMs), ... })`.
Bez SDK, bez wrappera, bez wstrzykiwanego klienta. Obie publiczne funkcje —
`generateDayActivities` ([:380](../../../src/lib/services/activity-generator.ts#L380)) i
`generateWeekOutline` ([:424](../../../src/lib/services/activity-generator.ts#L424)) — schodzą
do niego przez prywatne `callOpenRouter` ([:228](../../../src/lib/services/activity-generator.ts#L228)).

To jest dokładnie ta granica, której wymaga §4 test-planu („Mockuj wyłącznie na granicy
sieciowej — nigdy modułów wewnętrznych"). Podmiana `globalThis.fetch` albo MSW przechwytuje
100% ruchu, a cała realna logika — `categorizeStatus`, `GenerationError`, `runWithBudget`,
mapowanie w trasie — wykonuje się naprawdę. **Żaden test w tej fazie nie ma powodu mockować
modułu wewnętrznego.**

URL to stała modułu: `https://openrouter.ai/api/v1/chat/completions`
([:24](../../../src/lib/services/activity-generator.ts#L24)).

### 2. Kontrakt — dwie warstwy, i zod jest tą, która trzyma

| Warstwa | Gdzie | Co egzekwuje |
|---|---|---|
| JSON Schema wysyłany do dostawcy | [day-plan.schema.json](../../../src/lib/services/prompts/day-plan.schema.json), użyty w [activity-generator.ts:189-192](../../../src/lib/services/activity-generator.ts#L189-L192) | `minItems: 3` / `maxItems: 3`, `additionalProperties: false`, granice długości |
| zod, lokalnie po `JSON.parse` | `dayPlanProposalSchema`, [day-plan-contract.ts:31-40](../../../src/lib/services/day-plan-contract.ts#L31-L40) | `.length(ACTIVITY_COUNT)` = 3, `tytul` 1–200, `opis` 1–4000 |

**`provider.require_parameters` jest świadomie pominięte**
([:196-208](../../../src/lib/services/activity-generator.ts#L196-L208)) — dostawca może przyjąć
`response_format` i po cichu je zignorować. Addendum z przeglądu S-01 nazywa to wprost:
*„Łapie to dopiero `dayPlanProposalSchema`"*. **Zod jest jedyną realną gwarancją kształtu.**

Dwie świadome rozbieżności między warstwami, obie udokumentowane w kodzie:

- **Nadmiarowe klucze**: JSON Schema mówi `additionalProperties: false`, zod v4 domyślnie
  *obcina*. Uzasadnienie w [day-plan-contract.ts:25-29](../../../src/lib/services/day-plan-contract.ts#L25-L29):
  odrzucenie zamieniłoby jeden zbędny klucz w nieudaną generację, za którą nauczyciel płaci
  10–30 sekundami.
- **Unikalność `dzien` w konspekcie tygodnia**: JSON Schema tego nie wyraża, zod dokłada
  `.refine` ([:84-86](../../../src/lib/services/day-plan-contract.ts#L84-L86)). Bez tego
  `1,2,2,4,5` przechodzi i środa zostaje bez tematu.

### 3. Ścieżka parsowania — **każda gałąź rzuca**

Prześledzona krok po kroku w `callOpenRouter` ([:228-283](../../../src/lib/services/activity-generator.ts#L228-L283)):

| Krok | Linia | Zachowanie przy awarii |
|---|---|---|
| `fetch` w try/catch | [:231-244](../../../src/lib/services/activity-generator.ts#L231-L244) | rzuca `transient` |
| `!response.ok` | [:246-253](../../../src/lib/services/activity-generator.ts#L246-L253) | rzuca wg `categorizeStatus` |
| `response.json().catch(() => null)` | [:255](../../../src/lib/services/activity-generator.ts#L255) | `null` płynie dalej… |
| `firstChoice(data)` → `!choice` | [:262-267](../../../src/lib/services/activity-generator.ts#L262-L267) | …i **tu rzuca** `transient` |
| pusty `content` | [:269-272](../../../src/lib/services/activity-generator.ts#L269-L272) | rzuca `invalid` |
| `JSON.parse` | [:274-279](../../../src/lib/services/activity-generator.ts#L274-L279) | rzuca `invalid` |
| `dayPlanProposalSchema.safeParse` | [:397-400](../../../src/lib/services/activity-generator.ts#L397-L400) | rzuca `invalid` |

Nie znaleziono **żadnego** `safeParse` zwracającego wartość domyślną, **żadnego** `?? []` na
tablicy aktywności ani **żadnego** `try/catch` połykającego naruszenie kontraktu na tej
ścieżce. Jedyny miękki fallback to `extractUsage`
([:498-506](../../../src/lib/services/activity-generator.ts#L498-L506)), który dotyczy wyłącznie
telemetrii kosztu.

**Kolejność walidacja→zapis jest twarda i testowalna**: `generateDayActivities` jest awaitowane
w [generate.ts:151](../../../src/pages/api/day-plan/generate.ts#L151), a `saveGeneration`
osiągane dopiero w [:166](../../../src/pages/api/day-plan/generate.ts#L166). Rzut z walidacji
wraca przez [:155-157](../../../src/pages/api/day-plan/generate.ts#L155-L157) i zapis nigdy nie
startuje. **Asercja do napisania: przy odpowiedzi spoza kontraktu klient Supabase nie dostaje
ani jednego wywołania `rpc`.**

### 4. Gdzie „cichy pusty plan" faktycznie żyje — trzy dziury

#### 4a. `.every()` na pustej tablicy — najmocniejsze znalezisko

[WeekPlanBoard.tsx:508-515](../../../src/components/plan/WeekPlanBoard.tsx#L508-L515):

```ts
function isOutlineBody(body: unknown): body is { themes: {...}[] } {
  if (!isRecord(body) || !Array.isArray(body.themes)) return false;
  return body.themes.every((item) => isRecord(item) && ...);
}
```

Brak sprawdzenia długości, brak sprawdzenia, że daty odpowiadają żądanemu tygodniowi,
a `.every()` na `[]` to `true`. Dalej [:186-191](../../../src/components/plan/WeekPlanBoard.tsx#L186-L191)
i [:207](../../../src/components/plan/WeekPlanBoard.tsx#L207) używają `themeByDate.get(date) ?? null`
— dwa punkty połknięcia. **Efekt**: body `{"themes": []}` daje sukces bez błędu, a wszystkie
pięć dni generuje się na gołym haśle bez tematu. Krok konspektu, który istnieje po to, żeby
tydzień nie był pięcioma wariantami jednego pomysłu, nie robi nic.

Ten sam wzorzec dla planu dnia: [DayPlanEditor.tsx:651-669](../../../src/components/plan/DayPlanEditor.tsx#L651-L669)
i [WeekPlanBoard.tsx:485-506](../../../src/components/plan/WeekPlanBoard.tsx#L485-L506) —
`{plan: {...}, activities: []}` przechodzi jako sukces, `status: "done"`
([:93](../../../src/components/plan/WeekPlanBoard.tsx#L93)), a `readyCount`
([:58](../../../src/components/plan/WeekPlanBoard.tsx#L58)) liczy taki dzień jako gotowy.

> Dziś serwer nie potrafi wyprodukować takiego body (zod trzyma), więc jest to luka
> w obronie w głąb, nie żywy bug. Ale **jest osiągalna dla każdego testu, który podmienia
> `fetch`** — i to jest warstwa, na której ryzyko #2 się materializuje.

#### 4b. Pusta partia commituje się w bazie

`insert ... select from jsonb_array_elements('[]'::jsonb)` wstawia zero wierszy i **nie
podnosi wyjątku**. Efekt: wiersz `day_plans` z podbitym `current_generation`, wyczyszczonym
`accepted_at` i zerem aktywności.

`ACTIVITY_COUNT = 3` **nie jest egzekwowane nigdzie w schemacie** — trzyma je wyłącznie
`.length(3)` w zodzie. Dowodzi tego własny pgTAP projektu, który woła pisarza z jednoelementową
tablicą i asertuje `lives_ok`
([day_plan_write.test.sql:244-254](../../../supabase/tests/database/day_plan_write.test.sql#L244-L254)).
**Dolnej granicy nie ma w ogóle.**

Górna granica *istnieje*, ale wynosi 20, nie 3 — przez `check (ordinal between 1 and 20)`
plus `unique (plan_id, generation, ordinal)`
([20260720162247_bound_plan_and_activity_input.sql:38-46](../../../supabase/migrations/20260720162247_bound_plan_and_activity_input.sql#L38-L46)).
To domyka lekcję *„Domknij górną granicę wierszy potomnych"* z [lessons.md](../../foundation/lessons.md)
— **ale tylko górną**.

#### 4c. Pusty dzień kłamie inaczej na każdym z trzech ekranów

| Widok | Co pokazuje | Dlaczego |
|---|---|---|
| `/plan` (dzień) | „Ten dzień nie ma jeszcze planu." | [DayPlanEditor.tsx:80](../../../src/components/plan/DayPlanEditor.tsx#L80), `hasActivities` |
| `/plan/week` | kafelek **`done`**, pusta lista | [WeekPlanBoard.tsx:425](../../../src/components/plan/WeekPlanBoard.tsx#L425) — status z samego wiersza planu |
| `/plan/month` | **zaplanowany** | `readMonthSummary` ([day-plan-store.ts:492-514](../../../src/lib/services/day-plan-store.ts#L492-L514)) w ogóle nie czyta `activities` |

Trzy różne odpowiedzi na ten sam stan, żadna z nich to błąd. Deweloperzy to widzieli —
komentarz w [DayPlanEditor.tsx:477-481](../../../src/components/plan/DayPlanEditor.tsx#L477-L481)
opisuje ten stan jako „nieosiągalny przez ścieżki aplikacji, ale gdyby istniał, byłby dniem,
który najbardziej wymaga skasowania".

### 5. Klasy awarii dostawcy (ryzyko #5) — kolaps do jednego komunikatu

Mapowanie: `generationFailure` ([generate.ts:57-71](../../../src/pages/api/day-plan/generate.ts#L57-L71)),
tablice `STATUS_BY_CATEGORY` ([:40-44](../../../src/pages/api/day-plan/generate.ts#L40-L44),
`config:500, transient:503, invalid:502`) i `MESSAGE_BY_CATEGORY` ([:51-55](../../../src/pages/api/day-plan/generate.ts#L51-L55)).

| Awaria dostawcy | Kategoria | Ponowienie | HTTP | Komunikat |
|---|---|---|---|---|
| błąd sieci / DNS | `transient` [:241-244](../../../src/lib/services/activity-generator.ts#L241-L244) | tak | 503 | „…chwilowo przeciążona" |
| **timeout 45 s** | `transient` — **ta sama gałąź**, `TimeoutError` nie jest rozpoznawany | tak | 503 | **identyczny** |
| **429** | `transient` [:117](../../../src/lib/services/activity-generator.ts#L117) | tak | 503 | **identyczny** |
| **5xx** | `transient` — **ta sama gałąź co 429** | tak | 503 | **identyczny** |
| **200 z niepoprawnym JSON-em** | `null` → `!choice` → `transient` [:262](../../../src/lib/services/activity-generator.ts#L262) | **tak** | 503 | **identyczny** |
| 200, obcięty payload (`finish_reason: "length"`) | `invalid` | nie | 502 | „Coś poszło nie tak…" |
| brak klucza API | `config` [:366-372](../../../src/lib/services/activity-generator.ts#L366-L372), przed `fetch` | nie | 500 | „…niedostępne, skontaktuj się z administratorem" |

**Pięć różnych awarii → jeden bajtowo identyczny komunikat.** Rozróżnienie istnieje wyłącznie
w logu (`logError("generation.failed", { category, status, ... })`,
[:339-347](../../../src/lib/services/activity-generator.ts#L339-L347)), gdzie `status` oddziela
429 od 503 od transportu.

Dwa przypadki są wprost mylące:

- **200 z niepoprawnym body** raportowane jako „usługa przeciążona" — dostawca odpowiedział,
  i to naszym kosztem, bo trafia jeszcze na płatne ponowienie.
- **`finish_reason: "length"` jest niewidoczne.** Kod sprawdza wyłącznie `=== "error"`
  ([:262](../../../src/lib/services/activity-generator.ts#L262)); `"length"` nie jest ani
  wykrywane, ani logowane, mimo że komentarz [:48-61](../../../src/lib/services/activity-generator.ts#L48-L61)
  dokumentuje dokładnie tę awarię jako zaobserwowaną (Gemini palący 728–972 tokenów rozumowania).
  Podniesienie `MAX_TOKENS` do 4000 to mitygacja, nie detekcja.

**Co za to działa strukturalnie:** żadna awaria dostawcy nie kończy się zapisem. Wszystkie
rzucają przed [generate.ts:166](../../../src/pages/api/day-plan/generate.ts#L166), więc
niezmiennik „awaria nie zostawia zapisu" trzyma się z konstrukcji dla wszystkich sześciu klas.

Timeout i ponowienie są realne: `AbortSignal.timeout` na
[:233](../../../src/lib/services/activity-generator.ts#L233), `ATTEMPT_TIMEOUT_MS = 45_000`
i `TOTAL_BUDGET_MS = 60_000` ([day-plan-limits.ts:59-62](../../../src/lib/day-plan-limits.ts#L59-L62)),
jedno ponowienie wyłącznie dla `transient`, stały backoff 1 s
([:319-364](../../../src/lib/services/activity-generator.ts#L319-L364)).

### 6. Zapis — atomowy, ale wołany dwa razy

**Atomowość nie jest luką.** Cały zapis to jedno `supabase.rpc("save_day_plan_generation", ...)`
([day-plan-store.ts:172](../../../src/lib/services/day-plan-store.ts#L172)) — w całym `src/`
nie ma ani jednego `.insert()`. Funkcja plpgsql biegnie w jednej niejawnej transakcji:
upsert rodzica → `delete` starej partii → `insert` dzieci z `with ordinality`
([20260823232953_day_theme_and_absent_guard.sql:142-166](../../../supabase/migrations/20260823232953_day_theme_and_absent_guard.sql#L142-L166)).
Wyjątek w insercie dzieci cofa podbicie licznika, czyszczenie `accepted_at` i skasowanie
poprzedniej partii. **Po nieudanym zapisie w bazie nie zostaje nic.**

Kolejność (rodzic → delete → dzieci) jest wymuszona przez trigger `activities_enforce_generation`
([20260823095136…:59-97](../../../supabase/migrations/20260823095136_day_plan_generation_write_contract.sql#L59-L97)),
którego nagłówek mówi wprost: *„upsert first, then delete, then insert. The reverse order
… is precisely what the trigger makes impossible."*

**Realna luka to podwójny zapis, nie częściowy.** `saveGeneration`
([:218-233](../../../src/lib/services/day-plan-store.ts#L218-L233)) ponawia RPC raz przy każdym
`StoreError` poza `conflict`, i jest to świadomie nieidempotentne — własny docblock
([:213-216](../../../src/lib/services/day-plan-store.ts#L213-L216)): *„jeśli pierwsze wywołanie
się zacommitowało i zgubiła się tylko odpowiedź, ponowienie zapisuje drugą generację tych
samych trzech propozycji"*. Każda próba jest atomowa; para nie jest.

**Wstrzykiwalność jest już zrobiona i to konwencja, nie przypadek** —
[day-plan-store.ts:22-26](../../../src/lib/services/day-plan-store.ts#L22-L26): *„Klient jest
zawsze pierwszym argumentem, nigdy singletonem modułu."* Trasy dostają klienta z
`context.locals.supabase` ([middleware.ts:17](../../../src/middleware.ts#L17)), więc `locals`
**jest** punktem wstrzyknięcia — nie trzeba dotykać kodu produkcyjnego, żeby podstawić
atrapę.

### 7. Runner — ograniczenia i stan zerowy

**Stan wyjściowy: całkowicie greenfield.** `find` na `vitest.config*`, `vite.config*`,
`*.test.ts`, `*.spec.ts`, `jest.config*` zwraca **pustkę**. Brak `node_modules/vitest`.
Jedyne testy to 71 asercji pgTAP w trzech plikach, uruchamiane ręcznie przez `npm run test:db`
— **nigdy w CI**.

| Ograniczenie | Ustalenie |
|---|---|
| **Vite** | Zainstalowane **7.3.3**, zdeduplikowane w całym drzewie (5 konsumentów, wszystkie `deduped`). `overrides.vite: ^7.3.2` jest identyczne z zależnością `astro@6.3.1` — nie wymusza niczego wbrew, tylko trzyma jedną kopię. **Brak ryzyka podwójnej instancji.** |
| **Vitest** | Linia **4.x** (`^6.0.0 \|\| ^7.0.0`) pasuje; **2.x wykluczone** (`^5.0.0`). 3.x też pasuje. Wersję trzeba zweryfikować empirycznie po instalacji. |
| **Konfiguracja** | `getViteConfig` **jest wyeksportowane** przez `astro@6.3.1` (`node_modules/astro/dist/config/entrypoint.js:32`). Daje `astro:env/server`, alias `@/*`, `?raw` i Tailwind bez duplikowania konfiguracji. |
| **Środowisko** | `environment: 'node'` — Astro 6 **usunęło** renderowanie komponentów Astro w środowiskach klienckich (`jsdom`/`happy-dom`). Zgodne z §4 test-planu. |
| **Blokada** | Wirtualny moduł `astro:env/server` importują trzy moduły: [config-status.ts:1](../../../src/lib/config-status.ts#L1), [supabase.ts:3](../../../src/lib/supabase.ts#L3), [activity-generator.ts:1](../../../src/lib/services/activity-generator.ts#L1). Ten ostatni dokłada importy `?raw` ([:14](../../../src/lib/services/activity-generator.ts#L14), [:16](../../../src/lib/services/activity-generator.ts#L16)). **To jedyna realna przeszkoda.** |
| **Sekrety** | **Żadne nie są potrzebne.** Wszystkie cztery zmienne są `optional: true` ([astro.config.mjs:24-30](../../../astro.config.mjs#L24-L30)), więc `astro:env/server` zwraca `undefined` zamiast rzucać. Test ścieżki *nieskonfigurowanej* nie potrzebuje niczego; test ścieżki skonfigurowanej wstrzykuje wartości, nie prawdziwe klucze. |
| **ESLint** | `strictTypeChecked` + `stylisticTypeChecked` z `projectService`, **bez żadnego zawężenia `files`** — pliki testowe będą lintowane w pełni. `no-undef` jest już wyłączone dla `.ts`, ale przy globalach `describe`/`it` zapali się `no-unsafe-call`. **Import z `"vitest"` zamiast `types: ["vitest/globals"]`** omija i to, i konieczność zawężania nieistniejącej dziś tablicy `types`. Override dla plików testowych i tak będzie potrzebny (`no-non-null-assertion`, `unbound-method`, `no-unsafe-assignment`); idiom istnieje już w [eslint.config.js:62-80](../../../eslint.config.js#L62-L80). |
| **CI** | Miejsce wstawienia: między `npm run lint` a `npm run build` w [ci.yml](../../../.github/workflows/ci.yml), **koniecznie po `npx astro sync`** — to on generuje `.astro/env.d.ts`, a `.astro/` jest w `.gitignore`. Node w CI to gołe `22`, `.nvmrc` mówi `22.14.0`. |

**Moduły importowalne dziś bez żadnej instalacji poza runnerem** (7 z 10 w `src/lib/`):
`day-plan-limits.ts`, `day-plan-dates.ts`, `day-plans.ts`, `utils.ts`,
`services/day-plan-contract.ts`, `services/day-plan-http.ts`, `services/day-plan-store.ts`.
Niedostępne bez rozwiązania `astro:env/server`: `activity-generator.ts`, `supabase.ts`,
`config-status.ts`.

**Ryzyko do spike'u, nie do założenia:** `getViteConfig` załaduje adapter `cloudflare()`,
który ciągnie `@cloudflare/vite-plugin@1.36.3`. Czy ten plugin nie przeszkadza Vitestowi
w środowisku `node`, nie da się rozstrzygnąć z samej konfiguracji. Żaden moduł w `src/` nie
używa globali Workers (sprawdzone: `caches`, `WebSocketPair`, `waitUntil`, `locals.runtime`
— jedyne trafienie to komentarz w [day-plan-dates.ts:22](../../../src/lib/day-plan-dates.ts#L22)),
więc `node` *powinno* wystarczyć.

### 8. `compare-models.sh` — „bramka jakości", która nie potrafi zawieść

Skrypt sam nazywa się *„The quality gate"*, ale [scripts/compare-models.sh:416-417](../../../scripts/compare-models.sh#L416-L417)
kończy się **bezwarunkowym `exit 0`**: *„A failed call is a finding about a candidate, not
a broken script."* **Jako krok CI przechodziłby zawsze.** To wprost lekcja
*„Kryterium weryfikacji musi móc nie przejść"* z [lessons.md](../../foundation/lessons.md),
tyle że w skrypcie zamiast w planie.

Jego komentarz [:38-40](../../../scripts/compare-models.sh#L38-L40) wskazuje na tę fazę
palcem: *„Deliberately outside CI. The project has no TS runner …, automated tests are
Module 3."* Skrypt sprawdza dziś statusy, które warto przenieść do asercji: `partial_failure`
(200 z `finish_reason == "error"`), `truncated_budget` (nieparsowalne **i** `finish_reason == "length"`
— czyli rozróżnienie, którego produkcyjny kod **nie** robi), `schema_mismatch`, `duplicate_days`.
Szczegóły należą do Fazy 2, ale `truncated_budget` jest bezpośrednio istotny dla ryzyka #5.

## Code References

- `src/lib/services/activity-generator.ts:231` — jedyne wywołanie `fetch` do dostawcy; granica do mockowania
- `src/lib/services/activity-generator.ts:228-283` — `callOpenRouter`, wszystkie gałęzie awarii
- `src/lib/services/activity-generator.ts:113-121` — `categorizeStatus`; tu 429 i 5xx zlewają się w jedno
- `src/lib/services/activity-generator.ts:262` — jedyne odczytanie `finish_reason`, tylko `=== "error"`
- `src/lib/services/activity-generator.ts:319-364` — `runWithBudget`, jedno ponowienie, backoff 1 s
- `src/lib/services/day-plan-contract.ts:31-40` — `dayPlanProposalSchema`, jedyny egzekutor liczby 3
- `src/lib/services/day-plan-contract.ts:100-104` — `toDayThemes`, mapuje po pozycji po sortowaniu, nie po `dzien`
- `src/lib/services/day-plan-store.ts:172` — jedyny zapis generacji, `rpc`
- `src/lib/services/day-plan-store.ts:218-233` — ponowienie zapisu, świadomie nieidempotentne
- `src/pages/api/day-plan/generate.ts:87` — `export const POST: APIRoute`, wywoływalne wprost w teście
- `src/pages/api/day-plan/generate.ts:151-175` — kolejność: generuj → (rzut wraca) → zapisz → odczytaj
- `src/components/plan/WeekPlanBoard.tsx:508-515` — `isOutlineBody`, `.every()` na `[]`
- `src/components/plan/DayPlanEditor.tsx:651-669` — `isDayPlanBody`, ten sam wzorzec
- `supabase/migrations/20260720162247_bound_plan_and_activity_input.sql:38-46` — górna granica 20 wierszy
- `supabase/tests/database/rls_isolation.test.sql` — idiom testowy repo (23 asercje, anty-próżniowość)

## Architecture Insights

- **Niezmienniki mieszkają w schemacie, nie w TypeScripcie** — to zapisana zasada projektu
  ([20260823193447_confirm_replacing_accepted_plan.sql](../../../supabase/migrations/20260823193447_confirm_replacing_accepted_plan.sql)).
  Liczba 3 jest **wyjątkiem od tej zasady**: żyje wyłącznie w zodzie. Dolna granica nie żyje nigdzie.
- **Klient Supabase zawsze jako pierwszy argument** — konwencja opisana i uzasadniona
  w [day-plan-store.ts:22-26](../../../src/lib/services/day-plan-store.ts#L22-L26). Dzięki niej
  faza nie wymaga żadnego refaktoru pod testowalność.
- **PostgREST nie daje klientowi transakcji**, więc jedynym pisarzem partii jest funkcja
  Postgresa. Ta decyzja jest tym, co czyni „częściowy zapis" niereprezentowalnym.
- **Anty-próżniowość jest lokalną kulturą testów.** `rls_isolation.test.sql:152-156` stwierdza
  wprost, że każda asercja negatywna przeszłaby przy polityce deny-all, i trzyma blok pozytywny
  po to, żeby były rozróżniające — *„nie kasuj ich, żeby «uprościć» zestaw"*. Testy Vitest będą
  mierzone tą samą miarą.

## Historical Context (from prior changes)

- [context/archive/2026-08-22-first-day-generation/plan.md](../../archive/2026-08-22-first-day-generation/plan.md)
  §What We're NOT Doing: *„**Bez testów automatycznych logiki generowania.** Projekt ma tylko
  `test:db` (pgTAP); testy to Moduł 3."* — ta faza jest obiecanym domknięciem.
- Tamże, Addendum z `/10x-impl-review`: dostawca może zignorować `response_format`, a łapie to
  dopiero zod — **uzasadnia, dlaczego test kontraktu musi iść przez granicę sieciową**, a nie
  przez sam schemat.
- [context/archive/2026-08-23-edit-accept-day-plan/plan.md](../../archive/2026-08-23-edit-accept-day-plan/plan.md)
  §Key Discoveries formułuje ryzyko #2 dosłownie: *„Awaria jest cicha: `selectCurrentGeneration`
  uczciwie zwróci pustą tablicę … nauczyciel zobaczy pusty plan — bez błędu, wyjątku ani wpisu
  w logu."* Trigger zamknął to po stronie bazy; §4a pokazuje, że **kształt tej awarii wciąż
  dociera do UI nieoznaczony**.
- Tamże, §Success Criteria: *„Generowanie tworzy … **trzy** wiersze w `activities`"* było zawsze
  kryterium **manualnym**. Automatyzacja tego liczenia to rdzeń tej fazy.
- [context/archive/2026-08-23-week-generation/plan.md](../../archive/2026-08-23-week-generation/plan.md)
  §What We're NOT Doing: jedna transakcja **na dzień, nigdy na tydzień** — częściowo wygenerowany
  tydzień jest normalnym, oczekiwanym wynikiem (`Promise.allSettled`). Test tygodnia nie może
  traktować tego jako awarii.

## Open Questions

Cztery rozstrzygnięcia dla `/10x-plan`; pierwsze dwa zmieniają zakres fazy, nie tylko jej treść.

1. **Czy faza *naprawia* kolaps klas awarii, czy tylko go *utrwala*?** Cel fazy z §3 brzmi
   „inny, uczciwy komunikat dla każdej klasy", a kod tego nie robi (§5). Test napisany pod
   obecne zachowanie zabetonuje 503 „przeciążona" dla 200 z popsutym JSON-em. To jest wybór
   między testem charakteryzującym a zmianą produktową — i należy do planu, nie do researchu.
2. **Czy `.every()`-na-pustej-tablicy (§4a) należy do tej fazy?** Uzgodniony zakres zatrzymał
   się na „kontrakcie, który konsumuje UI", a to znalezisko *jest* na granicy kontraktu — ale
   jego naprawa to zmiana w wyspach React. Alternatywa: zapisać jako wejście do Fazy 4.
3. **Czy dolna granica liczby aktywności (§4b) idzie do schematu w tej fazie, czy do Fazy 3?**
   Faza 3 ma pgTAP w zakresie; ta faza ma ryzyko #2. Dziura jest jedna, właściciel niejasny —
   a lekcja *„Odroczone sprzątanie danych musi mieć właściciela"* mówi, żeby nie zostawić tego
   bez nazwiska.
4. **MSW czy `vi.stubGlobal('fetch', ...)`?** Oba trafiają w tę samą granicę. MSW daje gotowe
   `HttpResponse.error()`, kody statusu i `delay` do timeoutu, kosztem zależności; `stubGlobal`
   z `unstubGlobals: true` nie kosztuje nic, ale wymaga ręcznego budowania `Response`. Przy
   jednym URL-u i sześciu klasach awarii różnica jest mała — decyzja kosztu × sygnału.

Do zweryfikowania empirycznie w trakcie planu (spike, nie założenie): interakcja
`@cloudflare/vite-plugin` z Vitestem w środowisku `node` (§7) oraz dokładna rozwiązana wersja
Vitest wobec Vite 7.3.3.
