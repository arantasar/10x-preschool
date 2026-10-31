# Bramki jakości w CI + e2e ścieżki krytycznej — Implementation Plan

## Overview

Faza 4 rolloutu test-planu (`Krok 9`). Plan stawia przed merge'em do `master` cały zestaw e2e ze ścieżką krytyczną (generowanie → edycja → zatwierdzenie), z dostawcą LLM podmienionym na granicy sieciowej, ucisza szum joba `db` i na końcu zamienia checki doradcze w wymagane.

Kolejność jest celowa: najpierw czerwień ma znaczyć regresję, dopiero potem może blokować.

## Current State Analysis

- `ci.yml` ma joby `ci`, `db`, `content-safety-gate`. E2E nie stoi w CI.
- Repozytorium jest **publiczne**, ochrona gałęzi jest dostępna i nie jest włączona (`404 Branch not protected`). §5 test-planu i `change.md` opisują stan sprzed upublicznienia.
- 7 z ostatnich 40 przebiegów CI pada na `Start the local Supabase stack`; w 4 sprawdzonych logach to `toomanyrequests: Data limit exceeded` z `public.ecr.aws`.
- Zestaw e2e: 45/45 lokalnie (17,2 s, ciepły serwer). `support/env.ts` czyta `E2E_*` z `process.env`, `playwright.config.ts` ma ustawienia CI.
- `OPENROUTER_URL` to stała (`activity-generator.ts:36`), a wywołanie idzie z workerd, więc `page.route()` go nie widzi.
- Post-edit hook już istnieje (`.claude/settings.json:22-38`).

## Desired End State

- PR z regresją w lint, unit, bazie, e2e albo (przy zmianie promptu) bezpieczeństwie treści ma czerwony check i `mergeStateStatus: BLOCKED`.
- Job `e2e` uruchamia cały zestaw, także spec ścieżki krytycznej i dwa specy ryzyka #5.
- Przebieg z testem `flaky` jest czerwony.
- Limit ECR nie wywraca przebiegu, gdy cache obrazów istnieje.
- Lokalny `npm run test:e2e` nie może wywołać prawdziwego dostawcy.
- Dokumenty opisują stan rzeczywisty.

Weryfikacja: tymczasowy czerwony PR pokazuje `BLOCKED`, a pięć kolejnych przebiegów na PR-ze fazy jest zielonych.

### Key Discoveries:

- Wrapper z transformem Vite przeszedł całą drogę na macOS: `PROBE-TRANSFORM env=ssr hit=true`, `generate: 200`, `stub calls: 1` (`research.md` §5).
- `configureServer` działa pod `@cloudflare/vite-plugin`: `/__e2e-stub` daje 200 na serwerze e2e i 404 na zwykłym dev (próba 2026-10-30).
- `webServer.env` nie dociera do aplikacji; wrangler czyta `.dev.vars`, więc job musi go zapisać (`research.md` §3).
- Playwright 1.62 ma `failOnFlakyTests` (`node_modules/playwright/types/test.d.ts:1269`).
- `generation_ledger` ma kolumnę `plan_date`, a migracja odbiera prawa tylko `anon` i `authenticated` (`20261017150000_generation_ledger.sql:47,69`).
- `db` wyklucza `mailpit`, a `password-reset.spec.ts` go potrzebuje; `test db` dociąga też `pg_prove`.
- Obrazy potrzebne obu jobom: ok. 2,8 GB przed kompresją (`postgres`, `gotrue`, `postgrest`, `kong`, `mailpit`, `pg_prove`).
- `content-safety-gate` zawsze się raportuje na PR-ze, bo filtr ścieżek jest krokiem w jobie, nie `paths:` workflow.

## What We're NOT Doing

- Smoke po deployu: sygnał przychodzi po wdrożeniu, a Workers Builds nie daje punktu zaczepienia.
- Poprawka `DELETE … .maybeSingle()` (`next-actions.md:586`): zmiana produkcyjna bez związku z CI. Dostaje nowego właściciela.
- Rozszerzenie mapy ryzyk o płatności (`next-actions.md:326-328`): dostaje nowego właściciela.
- `enforce_admins: true` i wymóg PR-a dla commitów `docs`/`chore`.
- Check `Workers Builds` jako wymagany.
- Zmiana `fullyParallel` albo liczby workerów jako lekarstwo na niestabilność (`next-actions.md:576`).
- `OPENROUTER_BASE_URL` ani jakakolwiek zmiana `activity-generator.ts`.
- Przejście na `astro preview`, chyba że Faza 4 wykaże, że dev jest niestabilny.
- Testy etapów `GenerationProgress` po 4 s i później.
- Nowy test dla post-edit hooka: wymaga tylko aktualizacji dokumentu.

## Implementation Approach

Pięć faz, każda zostawia repozytorium w działającym stanie, wszystkie na `feat/testing-ci-gates-e2e`. Fazy 1–4 dają sygnał, Faza 5 go egzekwuje.

Zasady:

- Bez nowych sekretów repozytorium.
- Bez zmian w plikach z filtru `FULL_MATRIX`, więc płatna bramka nie rusza.
- Każda asercja niosąca ryzyko zobaczona na czerwono (`lessons.md`: „Kryterium weryfikacji musi móc nie przejść”).

## Critical Implementation Details

- **Timing & lifecycle.** Obrazy zapisuje wyłącznie job `db`, po testach, bo tylko on ma komplet z `pg_prove`. Przy missie `db` i `e2e` pobierają równolegle; to akceptowane, bo miss jest rzadki. Wpis nieużywany przez 7 dni GitHub usuwa, więc po przerwie pierwszy przebieg znów pobiera. Czerwień z tego powodu poprawia się ponowieniem joba.
- **Ochrona a sprawdzenie.** Ochronę włączamy przed merge'em PR-a fazy: wymagane nazwy muszą być znane GitHubowi, a tymczasowy czerwony PR dowodzi blokady, zanim cokolwiek trafi na produkcję. Zmiana ustawień repozytorium wymaga osobnej zgody właściciela w tym momencie.
- **Stały slot.** Spec ścieżki krytycznej używa stałej daty, więc sprząta także **przed** testem. Inaczej przerwany przebieg zostawia plan i każdy kolejny pada.

---

## Phase 1: Stabilny stos Supabase w CI

### Overview

Wspólna akcja startu stosu z cache obrazów, wpięta na razie tylko w `db`. Zmniejsza szum, zanim dojdzie drugi job.

### Changes Required:

#### 1. Akcja złożona

**File**: `.github/actions/supabase-stack/action.yml` (nowy)

**Intent**: Jedno miejsce na przypięcie Postgresa, listę `-x`, cache obrazów, start i eksport zmiennych.

**Contract**:

- wejście `save-images` (domyślnie `false`);
- kroki przeniesione z `ci.yml:53-71` razem z komentarzami;
- `-x` bez `mailpit`, wspólna lista dla obu jobów;
- klucz: system + wersja z `node_modules/supabase/package.json` + przypięty Postgres, bez `restore-keys`, żeby nie wczytać cudzego zestawu;
- `docker load` tylko przy trafieniu;
- eksport `API_URL`, `PUBLISHABLE_KEY`, `SECRET_KEY` bez zmian (także bez cudzysłowów).

Zapis przez `actions/cache/save` musi się dać wywołać po testach, np. jako druga akcja albo krok joba `db` z warunkiem `cache-hit != 'true'` i `success()`.

#### 2. Job `db`

**File**: `.github/workflows/ci.yml`

**Intent**: Użyć akcji i zapisać obrazy po udanych testach.

**Contract**: Nazwa joba i kroki `test:db`, `test:db:api` bez zmian. Komentarz nad jobem dostaje informację o cache. `timeout-minutes: 15` zostaje.

### Success Criteria:

#### Automated Verification:

- Lint workflow przechodzi: `npx --yes actionlint@latest` albo równoważny parser YAML, gdy actionlint niedostępny
- Pierwszy przebieg `db` na PR-ze jest zielony i zapisuje cache: `gh cache list --key supabase-images` pokazuje wpis
- Drugi przebieg `db` wczytuje obrazy: `gh run view <id> --log` zawiera trafienie cache i nie zawiera `Pulling`/`toomanyrequests` dla obrazów z zestawu
- `gh api repos/{owner}/{repo}/actions/cache/usage` nie zbliża się do limitu repozytorium

#### Manual Verification:

- Czas `db` przy trafieniu nie jest gorszy niż dotychczasowe ~2 min 22 s + 1 min; czas zapisany w `research.md`-owym ogonie albo w §6.7
- Ewentualne błędy pozostałych obrazów z `pg_prove` obejrzane w logu

**Implementation Note**: Po automatycznej weryfikacji poczekaj na potwierdzenie człowieka.

---

## Phase 2: Atrapa dostawcy i serwer e2e

### Overview

Atrapa HTTP i wrapper konfiguracji, wpięte w Playwrighta. Wszystkie lokalne przebiegi e2e idą przez serwer, który nie potrafi wywołać prawdziwego dostawcy.

### Changes Required:

#### 1. Atrapa

**File**: `tests/e2e/support/llm-stub.mjs` (nowy)

**Intent**: Lokalny serwer w kształcie OpenRoutera, bez importów z `src/` (anty-wzorzec #5).

**Contract**:

- nasłuch na `127.0.0.1:4398`;
- `POST /v1/chat/completions`: tryb po `response_format.json_schema.name` (`propozycja_dnia`, `szkic_tygodnia`, `poprawiona_aktywnosc`), odpowiedź `{model, usage:{cost:0}, choices:[{finish_reason:"stop", message:{content}}]}`;
- dzień: dokładnie 3 aktywności, tytuły zawierają hasło;
- awaria sterowana hasłem z prefiksem `stub-awaria-503` → `503` z kopertą błędu;
- `GET /__calls?haslo=…` → liczba wywołań z danym hasłem, odporna na `fullyParallel`.

Pozostałe tryby zwracają poprawny kontrakt, choć dziś używa ich tylko ręczny debug.

#### 2. Wrapper konfiguracji

**File**: `astro.config.e2e.mjs` (nowy)

**Intent**: Dev bez zmian w kodzie produkcyjnym. Importuje prawdziwą konfigurację, jak `astro.config.test.mjs`.

**Contract**:

- plugin `apply: "serve"`, `enforce: "pre"`;
- `transform` dla `services/activity-generator.ts`: zamienia URL i **rzuca błąd, gdy go nie znalazł**;
- `configureServer`: `/__e2e-stub` → 200;
- własny `cacheDir` (`node_modules/.vite-e2e`), żeby nie walczyć ze zwykłym dev (F9);
- ścisły port 4321, tak by zajęty port kończył się od razu, jeśli opcja działa pod Astro.

Komentarz nagłówkowy wyjaśnia, dlaczego to wrapper, a nie zmienna środowiskowa: żaden przełącznik nie istnieje w produkcji.

#### 3. Skrypty i Playwright

**File**: `package.json`, `playwright.config.ts`

**Intent**: Znacznik sprawia, że zwykły `npm run dev` nie może zostać użyty ponownie.

**Contract**:

- skrypt `dev:e2e` = `astro dev --config astro.config.e2e.mjs`;
- `webServer` jako tablica: atrapa (`url` na `/__calls`) i `dev:e2e` (`url: ${BASE_URL}/__e2e-stub`), `reuseExistingServer: !process.env.CI`;
- nagłówkowy komentarz konfiguracji zaktualizowany.

#### 4. Dokumentacja uruchomienia

**File**: `.env.e2e.example`

**Intent**: Powiedzieć, że działający `npm run dev` trzeba zatrzymać, a do debugowania służy `npm run dev:e2e`.

**Contract**: Komentarz, bez nowych zmiennych.

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npm test`, `npm run build` przechodzą
- `npm run test:e2e` przechodzi 45/45 (po zatrzymaniu zwykłego dev)
- `git diff --name-only master..HEAD | grep -E 'activity-generator|generation-error|allowed-models|prompts/'` nic nie zwraca
- Próba na stanie zepsutym: tymczasowa zmiana szukanego URL-a w pluginie wywraca `npm run dev:e2e` przy imporcie trasy; po cofnięciu działa
- Przy działającym zwykłym `npm run dev` `npm run test:e2e` kończy się błędem startu serwera, a `/__calls` nie rośnie
- `dist/` po `npm run build` nie zawiera `127.0.0.1:4398`: `grep -r "127.0.0.1:4398" dist` nic nie zwraca

#### Manual Verification:

- `npm run dev:e2e` + kliknięcie „Generuj” w przeglądarce daje plan z hasłem w tytułach, bez kosztu po stronie OpenRoutera

**Implementation Note**: Po automatycznej weryfikacji poczekaj na potwierdzenie człowieka.

---

## Phase 3: Ścieżka krytyczna i ryzyko #5

### Overview

Trzy specy na atrapie, po jednym teście w pliku, zgodnie z §6.6. Wejściem jest `/10x-e2e`.

### Changes Required:

#### 1. Dane i sprzątanie

**File**: `tests/e2e/support/test-data.ts`, `tests/e2e/support/supabase-admin.ts`

**Intent**: Nowy slot i sprzątanie dnia, który powstał przez UI.

**Contract**:

- `weekStartInHorizon` przyjmuje slot `3`; lista w komentarzu dopisana: pn ścieżka krytyczna, wt #5 awaria, śr #5 w toku. Wtorek i środa slotu mogą wypaść w kolejnym miesiącu, ale dzień pozostaje w oknie dzięki dopełnieniu do niedzieli;
- nowy helper kasuje `day_plans` po `user_id` + `plan_date` i wiersze `generation_ledger` po tych samych polach, tylko dla podanego konta. Sprawdzenie, czy klucz serwisowy ma `delete` na księdze, należy do implementacji; brak prawa zmienia sposób sprzątania, nie schemat.

#### 2. Spec ścieżki krytycznej

**File**: `tests/e2e/critical-path.spec.ts` (nowy)

**Intent**: Przepływ miesiąc → dzień → hasło → „Generuj” → edycja → „Zatwierdź plan” przez prawdziwą sesję, trasy, RLS i zapis.

**Contract**:

- nazwa niesie ryzyko: `ścieżka krytyczna — …`;
- sprzątanie w `beforeEach` i `afterEach`;
- start z `/plan/month?month=…`, wejście przez link `Plan na ${iso} — brak planu`, `waitForIslands` przed każdą pierwszą interakcją na stronie;
- hasło z `uniqueStamp()`; kliknięcie „Generuj” (`exact: true`) razem z `waitForResponse` na trasie, z timeoutem pokrywającym zimną kompilację;
- asercje: tytuł z hasłem w regionie planu, `/__calls` = 1 dla tego hasła, po edycji i przeładowaniu nowy tytuł, po zatwierdzeniu i przeładowaniu baner `Plan zatwierdzony` oraz kafel `… — zatwierdzony` w miesiącu.

Klucz serwisowy służy wyłącznie do sprzątania.

#### 3. Specy ryzyka #5

**File**: `tests/e2e/generation-failure.spec.ts`, `tests/e2e/generation-progress.spec.ts` (nowe)

**Intent**: Uczciwa porażka i widoczny stan w toku w przeglądarce.

**Contract**:

- **Awaria:** hasło `stub-awaria-503-${stamp}`; `role="alert"` z komunikatem `generationFailure` dla `transient` (dokładny tekst z mapy, nie przepisany z ekranu bez sprawdzenia źródła), `/__calls` = 2 (jedno ponowienie), po przeładowaniu `Ten dzień czeka na pomysły.`
- **W toku:** `page.route("**/api/day-plan/generate")` wstrzymuje żądanie w przeglądarce; test asertuje `Wysyłam hasło do modelu…` i `Generuję…`, potem `route.continue()` i wynik końcowy. Nic nie jest mockowane.

#### 4. Reguły e2e

**File**: `tests/e2e/E2E-RULES.md`

**Intent**: Tabela granic i reguła „Generowanie za oknem: tylko test odmowy” przestają mówić prawdę.

**Contract**: Wiersz OpenRoutera: „atrapa HTTP dla specs generowania, zasiew dla reszty”. Reguła o oknach pozostaje dla testów odmowy, zasiew pozostaje domyślny poza tymi trzema specami.

### Success Criteria:

#### Automated Verification:

- `npx playwright test critical-path generation-failure generation-progress` przechodzi trzy razy pod rząd
- `npm run test:e2e` przechodzi 48/48
- `grep -n "waitForTimeout" tests/e2e/critical-path.spec.ts tests/e2e/generation-failure.spec.ts tests/e2e/generation-progress.spec.ts` nic nie zwraca
- Rytuał mutacji, każde psucie cofnięte przed commitem, a wynik zapisany w §6.7:
  - trasa `generate` nie woła `saveGeneration` → ścieżka krytyczna czerwona
  - trasa `activity/[id]` odpowiada sukcesem bez zapisu → czerwona po przeładowaniu
  - trasa `accept` odpowiada sukcesem bez zapisu → czerwona po przeładowaniu
  - atrapa zwraca 2 aktywności → ścieżka krytyczna czerwona
  - wyspa ignoruje błąd generowania → spec awarii czerwony
  - `GenerationProgress` nie renderuje się → spec w toku czerwony

#### Manual Verification:

- Trace spec ścieżki krytycznej obejrzany: każdy krok widoczny, bez kliknięć przed hydracją

**Implementation Note**: Po automatycznej weryfikacji poczekaj na potwierdzenie człowieka.

---

## Phase 4: Job `e2e` w CI

### Overview

Cały zestaw jako osobny job i osobny znaczek. Tu mierzymy zimny start i decydujemy o poprawce F9.

### Changes Required:

#### 1. Zimny start

**File**: `astro.config.mjs`

**Intent**: Zamknąć F9: pierwszy przebieg na pustym cache ma być zielony.

**Contract**: Najpierw pomiar na pustym `node_modules/.vite-e2e`. Jeśli przebieg ma `flaky` lub czerwone testy, `vite.optimizeDeps.include` z listą z `review-fixes.md` (F9), rozszerzoną tym, co pokaże log przeoptymalizowania. Jeśli pomiar jest czysty, wpisać to w §6.7 i nie zmieniać konfiguracji. Komentarz nad opcją mówi dlaczego.

#### 2. Playwright w CI

**File**: `playwright.config.ts`

**Intent**: Flake ma być widoczny, a porażka czytelna z PR-a.

**Contract**: `failOnFlakyTests: !!process.env.CI`, `retries: 2` zostaje dla trace'a; reporter CI dostaje `github`.

#### 3. Job

**File**: `.github/workflows/ci.yml`

**Intent**: Osobny znaczek, bez sekretów repozytorium, także na push do `master`.

**Contract**:

- job `e2e`, `timeout-minutes: 20`, bez `paths:`;
- `checkout`, `setup-node`, `npm ci`, `astro sync`, akcja `supabase-stack` z `save-images: false`;
- krok zapisuje `.dev.vars` (`SUPABASE_URL=$API_URL`, `SUPABASE_KEY=$PUBLISHABLE_KEY`, atrapa `OPENROUTER_API_KEY`, testowe klucze Turnstile, puste `CONTACT_TO`);
- zmienne `E2E_SUPABASE_URL`, `E2E_SUPABASE_SECRET_KEY`, `E2E_PASSWORD`;
- `npx playwright install --with-deps chromium`, `npm run test:e2e`;
- artefakt `playwright-report/` z `if: ${{ !cancelled() }}`;
- komentarz nad jobem w stylu `db`: czemu osobny, skąd klucze, że atrapa nie wymaga sekretów.

### Success Criteria:

#### Automated Verification:

- Job `e2e` zielony na PR-ze
- Log przebiegu nie zawiera `openrouter.ai` po stronie aplikacji: `gh run view <id> --log | grep -c "generation.succeeded.*model: 'stub'"` ≥ 1
- Tymczasowy commit z psuciem (`accept` bez zapisu) daje czerwony `e2e`, artefakt z raportem i adnotację na PR-ze; cofnięty
- Tymczasowo niestabilny test (pada przy pierwszej próbie, przechodzi przy drugiej) daje czerwony przebieg; cofnięty
- `gh pr view --json statusCheckRollup` pokazuje osobno `ci`, `db`, `e2e`

#### Manual Verification:

- Czas joba zapisany w §6.7 i akceptowalny
- Raport HTML z artefaktu otwiera się i pokazuje trace

**Implementation Note**: Po automatycznej weryfikacji poczekaj na potwierdzenie człowieka.

---

## Phase 5: Egzekwowanie i dokumentacja

### Overview

Dowód stabilności, ochrona `master`, dowód blokady, dokumenty.

### Changes Required:

#### 1. Dowód stabilności

**File**: brak (przebiegi na PR-ze fazy)

**Intent**: Pięć kolejnych zielonych przebiegów `db` i `e2e`, bez `flaky` i bez błędu pobierania.

**Contract**: Identyfikatory przebiegów zapisane w §6.7. Czerwień liczy od nowa; przyczyna zapisana, zanim licznik ruszy dalej.

#### 2. Ochrona `master`

**File**: ustawienia repozytorium (bez pliku w gicie)

**Intent**: Czerwony check blokuje merge, admin może świadomie ominąć.

**Contract**: **Tylko po zgodzie właściciela w tym momencie.** `PUT /repos/{owner}/{repo}/branches/master/protection` z `required_status_checks.contexts: ["ci","db","e2e","content-safety-gate"]`, `strict: false`, `enforce_admins: false`, `required_pull_request_reviews: null`, `restrictions: null`.

Przy zapisie odczytać, czy zwykły `git push` administratora na `master` nadal przechodzi z ostrzeżeniem obejścia. Jeśli nie, `CLAUDE.md` §Git i przepływ `chore(archive)` trzeba opisać na nowo.

#### 3. Dokumenty

**File**: `context/foundation/test-plan.md`, `CLAUDE.md`, `context/foundation/lessons.md`, `context/foundation/next-actions.md`, `tests/e2e/E2E-RULES.md`

**Intent**: Stan zapisany ma być stanem prawdziwym.

**Contract**:

- `test-plan.md`: §3 status, §4 wiersz e2e, §5 akapit o ochronie i tabela bramek (także hook jako istniejący), §6.6 (`dev:e2e`, atrapa, sprzątanie), §6.7 notatka fazy;
- `CLAUDE.md` §CI: lista jobów, ochrona `master`, brak sekretów `SUPABASE_*`, §Commands `dev:e2e`, `test:e2e`;
- `lessons.md:58`: dopisek „od Fazy 4 e2e stoi w CI”, reszta reguły zostaje;
- `next-actions.md`: stan fazy, wiersze `:564-566`, `:576` i `:587` zamknięte, `:586` i `:326-328` z nowym właścicielem i warunkiem. Wpis z właścicielem dla cache obrazów (po wygaśnięciu) i dla ponownej oceny limitu ECR.

### Success Criteria:

#### Automated Verification:

- `gh api repos/{owner}/{repo}/branches/master/protection --jq '.required_status_checks.contexts'` zwraca cztery nazwy
- Tymczasowy PR z czerwonym `e2e`: `gh pr view <nr> --json mergeStateStatus` zwraca `BLOCKED`; PR zamknięty bez merge'a
- Ten sam PR po naprawie zwraca `CLEAN`, potem zamknięty
- `grep -n "403 Upgrade to GitHub Pro" context/foundation/test-plan.md` występuje wyłącznie w opisie historycznym albo wcale
- `npm run lint`, `npm test`, `npm run build` przechodzą

#### Manual Verification:

- Właściciel widzi na PR-ze czerwony `e2e` i przycisk merge zablokowany lub wymagający świadomego obejścia
- Merge PR-a fazy wdrożony na `https://temio.pl`, a generowanie na produkcji działa jak przed zmianą
- Pierwszy commit `chore`/`docs` po merge'u przechodzi zgodnie z ustaleniem z punktu 2

**Implementation Note**: Po automatycznej weryfikacji poczekaj na potwierdzenie człowieka.

---

## Testing Strategy

### Unit Tests:

Brak nowych: faza nie zmienia kodu aplikacji. `npm test` pilnuje, że nic się nie rozjechało.

### Integration Tests:

Bez zmian, `db` działa na nowej akcji.

### E2E:

- Ścieżka krytyczna na prawdziwej sesji, trasach, RLS i zapisie.
- Ryzyko #5: awaria transient z jednym ponowieniem oraz stan w toku.
- Pozostałe 45 testów bez zmian.

### Manual Testing Steps:

1. Zatrzymać `npm run dev`, uruchomić `npm run test:e2e`.
2. Otworzyć raport z artefaktu czerwonego przebiegu.
3. Sprawdzić na tymczasowym PR-ze, że przycisk merge jest zablokowany.
4. Po merge'u sprawdzić generowanie na produkcji.

## Performance Considerations

Budżet joba `e2e`: 20 min. Cache obrazów ma skracać `db`, ale `docker load` kilku GB też kosztuje. Czas obu jobów ląduje w §6.7. Runner ma mniej rdzeni niż maszyna lokalna, więc 17 s nie jest punktem odniesienia.

## Migration Notes

Brak migracji bazy. Wycofanie ochrony: `DELETE /repos/{owner}/{repo}/branches/master/protection`. Wycofanie joba: usunięcie `e2e` z listy wymaganych **przed** usunięciem go z `ci.yml`, inaczej każdy PR czeka bez końca na check, który się nie pojawi.

## References

- Research: `context/changes/testing-ci-gates-e2e/research.md`
- Wzorzec joba: `.github/workflows/ci.yml:41-73`
- Wzorzec wrappera: `astro.config.test.mjs`
- Wzorzec specu: `tests/e2e/seed.spec.ts`, `tests/e2e/regenerate-confirmation.spec.ts`
- F9: `context/archive/2026-09-29-design-foundation/follow-ups/review-fixes.md:15-29`
- Reguły: `tests/e2e/E2E-RULES.md`, `context/foundation/test-plan.md` §6.6

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Stabilny stos Supabase w CI

#### Automated

- [x] 1.1 Lint workflow przechodzi — 45c3bcb
- [x] 1.2 Pierwszy przebieg `db` zielony i zapisuje cache — 45c3bcb
- [x] 1.3 Drugi przebieg `db` wczytuje obrazy z cache — 45c3bcb
- [x] 1.4 Zużycie cache nie zbliża się do limitu repozytorium — 45c3bcb

#### Manual

- [ ] 1.5 Czas `db` przy trafieniu zapisany i akceptowalny
- [ ] 1.6 Ewentualne błędy obrazów z `pg_prove` obejrzane w logu

### Phase 2: Atrapa dostawcy i serwer e2e

#### Automated

- [x] 2.1 `npm run lint`, `npm test`, `npm run build` przechodzą — b47ebe0
- [x] 2.2 `npm run test:e2e` przechodzi 45/45 — b47ebe0
- [x] 2.3 Diff nie dotyka plików z filtru bramki treści — b47ebe0
- [x] 2.4 Plugin rzuca błąd, gdy nie znajdzie URL-a — b47ebe0
- [x] 2.5 Przy zwykłym `npm run dev` `test:e2e` kończy się błędem startu — b47ebe0
- [x] 2.6 `dist/` nie zawiera adresu atrapy — b47ebe0

#### Manual

- [ ] 2.7 Ręczne generowanie na `dev:e2e` działa bez kosztu

### Phase 3: Ścieżka krytyczna i ryzyko #5

#### Automated

- [x] 3.1 Trzy nowe specy przechodzą trzy razy pod rząd — c860d02
- [x] 3.2 `npm run test:e2e` przechodzi 48/48 — c860d02
- [x] 3.3 Brak `waitForTimeout` w nowych specach — c860d02
- [x] 3.4 Rytuał mutacji wykonany i zapisany w §6.7 — c860d02

#### Manual

- [ ] 3.5 Trace specu ścieżki krytycznej obejrzany

### Phase 4: Job `e2e` w CI

#### Automated

- [ ] 4.1 Job `e2e` zielony na PR-ze
- [ ] 4.2 Log przebiegu potwierdza wywołanie atrapy
- [ ] 4.3 Psucie daje czerwony `e2e`, artefakt i adnotację
- [ ] 4.4 Test niestabilny daje czerwony przebieg
- [ ] 4.5 `ci`, `db`, `e2e` raportują się osobno

#### Manual

- [ ] 4.6 Czas joba zapisany w §6.7 i akceptowalny
- [ ] 4.7 Raport HTML z artefaktu otwiera się z trace'em

### Phase 5: Egzekwowanie i dokumentacja

#### Automated

- [ ] 5.1 Ochrona zwraca cztery wymagane checki
- [ ] 5.2 Tymczasowy czerwony PR ma `BLOCKED`
- [ ] 5.3 Ten sam PR po naprawie ma `CLEAN`
- [ ] 5.4 Akapit o `403` w test-planie zaktualizowany
- [ ] 5.5 `npm run lint`, `npm test`, `npm run build` przechodzą

#### Manual

- [ ] 5.6 Właściciel widzi zablokowany merge przy czerwonym `e2e`
- [ ] 5.7 Po merge'u generowanie na produkcji działa
- [ ] 5.8 Pierwszy commit `chore`/`docs` przechodzi zgodnie z ustaleniem
