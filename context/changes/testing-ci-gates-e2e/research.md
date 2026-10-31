---
date: 2026-10-30T22:12:51+01:00
researcher: Janusz Guzowski
git_commit: 0b09d06cb7c260f3c6750af5e1c91073eb3bfdc9
branch: feat/testing-ci-gates-e2e
repository: 10x-preschool (arantasar/10x-preschool, public)
topic: "Bramki jakości w CI + e2e ścieżki krytycznej — Faza 4 rolloutu test-planu"
tags: [research, codebase, ci, github-actions, branch-protection, playwright, e2e, openrouter, supabase, docker]
status: complete
last_updated: 2026-10-30
last_updated_by: Janusz Guzowski
---

# Research: Bramki jakości w CI + e2e ścieżki krytycznej (Faza 4)

**Date**: 2026-10-30T22:12:51+01:00
**Researcher**: Janusz Guzowski
**Git Commit**: `0b09d06` (HEAD = `origin/master`; gałąź `feat/testing-ci-gates-e2e` bez własnych commitów)
**Branch**: `feat/testing-ci-gates-e2e`
**Repository**: `arantasar/10x-preschool` — repozytorium **publiczne** (`gh repo view`, 2026-10-30)

## Research Question

Faza 4 z `context/foundation/test-plan.md` (`Krok 9` w `next-actions.md`): zamknąć podłogę przed merge'em do `master`, który deployuje wprost na produkcję. Z `change.md`:

- e2e ścieżki login → dzień → hasło → generowanie → edycja → „Zatwierdź”, z dostawcą LLM podmienionym na granicy sieciowej; zepsuty krok ma wywracać przebieg;
- regresja w unit/integration, bazie albo e2e ma dawać czerwony check na PR-ze, zanim ktoś kliknie merge;
- decyzja, czy i jak istniejące e2e chodzą w CI;
- opcjonalnie §5: post-edit hook, smoke po deployu.

## Summary

Trzy ustalenia zmieniają kształt fazy:

1. **Przesłanka „brak branch protection” jest nieaktualna.** Repozytorium jest publiczne, a `gh api …/branches/master/protection` odpowiada dziś `404 Branch not protected`, nie `403 Upgrade to GitHub Pro`. Ochrona gałęzi jest dostępna i po prostu nie została włączona. `change.md` („make that signal impossible to miss, not pretend to enforce it”) i §5 test-planu opisują stan sprzed upublicznienia, a §5 sam każe to przejrzeć, „gdy repozytorium zmieni status”. Faza może teraz realnie blokować merge. Cena: obecny przepływ wypycha commity prosto na `master`, a job `db` bywa czerwony bez związku z kodem (punkt 2).
2. **Najsłabszy sygnał w CI to nie brak e2e, tylko szum `db`.** Wszystkie 7 czerwonych przebiegów CI z ostatnich 40 pada na kroku `Start the local Supabase stack`. W czterech sprawdzonych logach przyczyną jest `toomanyrequests: Data limit exceeded` z `public.ecr.aws`. Dwa ostatnie przebiegi na `master` (2026-10-28) są czerwone właśnie z tego powodu, więc nie mówią nic o kodzie. Drugi job startujący Supabase podwoi pobrania pod tym samym limitem. **Wymagany check przy tej awaryjności blokowałby merge przez limit rejestru, więc cache albo ponowienia muszą wejść przed włączeniem ochrony.**
3. **Atrapa dostawcy nie wymaga zmiany kodu produkcyjnego i jest sprawdzona.** Wrapper konfiguracji Astro z pluginem Vite przepisuje URL w `activity-generator.ts`. Próba z 2026-10-30 przeszła całą drogę: plugin zadziałał w środowisku `ssr` (workerd), prawdziwa trasa `POST /api/day-plan/generate` z prawdziwą sesją zawołała atrapę na `127.0.0.1` dokładnie raz i odpowiedziała 200. Dzięki temu nie powstaje zmienna środowiskowa przekierowująca prompty produkcji, a zmiana nie odpala płatnej bramki treści.

Stan wyjściowy jest dobry: **45/45 testów e2e zielonych lokalnie w 17,2 s** (2026-10-30, ciepły serwer dev), a `support/env.ts` i `playwright.config.ts` są już przygotowane pod CI. Sekret serwisowy z `next-actions.md:564` przestaje być problemem: w CI to jednorazowy klucz lokalnego stosu, tak jak w jobie `db`, bez sekretów repozytorium.

Główne ryzyko implementacji to pierwszy przebieg na zimnym cache Vite (F9 z `design-foundation`): w CI każdy przebieg jest pierwszy, a poprawka (`optimizeDeps`) nadal nie weszła.

## Detailed Findings

### 1. Stan bramek i egzekwowanie

Dziś [`ci.yml`](https://github.com/arantasar/10x-preschool/blob/0b09d06cb7c260f3c6750af5e1c91073eb3bfdc9/.github/workflows/ci.yml) ma trzy joby: `ci` (sync, lint, `npm test`, build), `db` (pgTAP + `test:db:api`) i `content-safety-gate` (tylko PR). Na PR-ze #60 raportowały się `ci`, `db`, `content-safety-gate` oraz `Workers Builds: 10x-preschool`.

Fakty z 2026-10-30:

- `gh repo view`: `visibility: PUBLIC`, `viewerPermission: ADMIN`. Plany z października już mówią o publicznym repozytorium (`context/archive/2026-10-17-trial-entitlement/plan.md:82`). Daty upublicznienia nie ustalono.
- `gh api repos/{owner}/{repo}/branches/master/protection` → `404 Branch not protected`; `gh api …/rulesets` → `[]`.
- GitHub Free obejmuje chronione gałęzie w repozytoriach publicznych.
- Sekrety repozytorium: wyłącznie `OPENROUTER_API_KEY`. `SUPABASE_URL`/`SUPABASE_KEY` z `ci.yml:24-25` nie istnieją, a build przechodzi (zmienne są opcjonalne).

Trzy konsekwencje dla projektu ochrony:

- **Commity bezpośrednie.** Historia pierwszego rodzica `master` zawiera commity bez PR-a (`docs(claude)…`, `chore(archive): close …`), a `CLAUDE.md` §Git dopuszcza je jako wyjątki. Wymagane checki odrzucą taki push, chyba że administrator ma obejście.
- **Administrator.** Przy `enforce_admins: false` właściciel nadal może scalić na czerwono, ale już świadomie, a nie przez przeoczenie. To realna różnica przy jednej osobie w projekcie. Przy `enforce_admins: true` każdy commit `docs`/`chore` musi przejść przez PR.
- **Pomijanie joba.** Dokumentacja GitHuba ostrzega, że workflow pominięty filtrem ścieżek zostawia wymagany check w stanie `Pending`. Tu tego nie ma: `content-safety-gate` filtruje krokiem wewnątrz joba, więc job zawsze się raportuje. Nowy job e2e nie powinien używać `paths:` na poziomie workflow, jeśli ma być wymagany. Zachowanie joba pominiętego warunkiem `if` warto sprawdzić, zanim gate trafi na listę wymaganych.

Precedensy widoczności: osobny job = osobny znaczek (`ci.yml:31-36`), raport w `GITHUB_STEP_SUMMARY` (§6.5). Ostrzeżenia z historii: PR #21 scalono mimo niezamkniętego joba bramki, a znaczek psujący się bez powodu „uczy ignorować znaczek” (`next-actions.md:587`).

### 2. Limit `public.ecr.aws`

| Data | Zdarzenie | Job/krok |
|---|---|---|
| 2026-10-17 | push | `db` / Start the local Supabase stack |
| 2026-10-18 (2×) | push | jw. |
| 2026-10-18 (2×) | pull_request | jw. |
| 2026-10-28 (2×) | push | jw. |

To wszystkie porażki z ostatnich 40 przebiegów (7/40, czyli ok. 18%). Log `toomanyrequests` potwierdzono w 4 z 7; pozostałych trzech nie sprawdzano. Na `next-actions.md:587` próg „trzeci taki przebieg” dawno minął, a właścicielem wpisu jest Krok 9.

Kandydaci:

- **Cache obrazów w Actions** (`docker save`/`load` + `actions/cache`). Klucz musi zawierać wersję CLI i przypięty Postgres. Miss nadal pobiera, ale cache z `master` jest dostępny dla PR-ów. Rozmiar i czas nie są zmierzone; limit cache na repozytorium trzeba sprawdzić.
- **Ponowienie `supabase start`.** Przegląd z fazy 3 zanotował: „A retry doesn't lower the quota”, a także niewiadomą, czy CLI zostawia kontenery po nieudanej próbie.
- **Jeden job z oboma poziomami** (baza + e2e na jednym stosie). Połowa pobrań, ale znika osobny znaczek, chyba że rozdzielą go kroki i raport.
- Community `setup-supabase-action` ma opcję pobierania z Docker Huba „z powodu limitów ECR”. To fork społeczności, nie oficjalne rozwiązanie. Oficjalnego stanowiska Supabase ani AWS w tej sprawie nie znaleziono.

**Dodatkowo:** job e2e nie może skopiować listy `-x` z `db`, bo `password-reset.spec.ts` potrzebuje Mailpita. Musi też przypiąć Postgresa (`17.6.1.127`), inaczej dostanie domyślny obraz, na którym serwer padał (§6.7).

### 3. Uruchomienie e2e w CI

Co już działa:

- `support/env.ts:36-44`: `E2E_*` czytane z `process.env` jako fallback.
- `playwright.config.ts`: `forbidOnly`, `retries: 2`, reporter HTML, `trace: on-first-retry` i `reuseExistingServer: !CI`.

Czego brakuje w jobie:

- **`.dev.vars` musi powstać w kroku.** Wrangler czyta `vars` z `wrangler.jsonc`, potem `.dev.vars`, a tylko pod jego nieobecność `.env`. `process.env` wchodzi wyłącznie z `CLOUDFLARE_INCLUDE_PROCESS_ENV=true`, więc `webServer.env` w Playwrighcie do aplikacji **nie dotrze** (odczyt `getVarsForDev` w wranglerze i `utils/env.js` adaptera, nie sprawdzono uruchomieniem). Potrzebne: `SUPABASE_URL`, `SUPABASE_KEY` (publikowalny lokalny), atrapa `OPENROUTER_API_KEY`, testowe klucze Turnstile. `CONTACT_TO` zostaje puste.
- **Zmienne testów:** `E2E_SUPABASE_URL`, `E2E_SUPABASE_SECRET_KEY`, `E2E_PASSWORD`, z eksportu `supabase status -o env` jak w `db`. Eksport filtruje wąsko, bo każda wartość trafia do nagłówków kroków.
- **Przeglądarka:** `npx playwright install --with-deps` (wystarczy `chromium`), artefakt `playwright-report/` z `if: ${{ !cancelled() }}`. Dziś raport powstaje, ale nikt go nie wynosi z runnera.
- **Port 4321 i `localhost`.** `additional_redirect_urls` obejmuje tylko 4321, a `astro dev` nasłuchuje na `[::1]`.
- `canonicalRedirect` dopasowuje host dokładnie, więc localhost nie jest przekierowywany (`canonical-host.ts`). KV i `send_email` powinny być symulowane lokalnie bez logowania do Cloudflare — wniosek z konfiguracji, nie z uruchomienia.

Ryzyka specyficzne dla CI:

- **Zimny cache Vite.** F9: pierwszy przebieg po zmianie zależności wywraca 1–14 testów (`context/archive/2026-09-29-design-foundation/follow-ups/review-fixes.md:15-29`). Proponowana poprawka to `vite.optimizeDeps.include` dla `react`, `react-dom`, `lucide-react`, `zod`, `pdf-lib`, `@pdf-lib/fontkit`, `@supabase/ssr`. W `astro.config.mjs` nadal jej nie ma.
- **`retries: 2` maskuje niestabilność.** Test zielony za drugim razem daje zielony przebieg, więc F9 wyglądałoby jak zdrowy zestaw. Playwright ma do tego opcję `failOnFlakyTests` albo raport testów `flaky` — do sprawdzenia przy planie.
- **Liczba workerów.** Dokumentacja Playwrighta zaleca `workers: 1` w CI dla stabilności, a `next-actions.md:576` zakazuje zmiany równoległości jako lekarstwa na wyścig serwera dev. Rozsądnie: nie stroić z góry, zmierzyć pierwszy przebieg. Runner ma mniej rdzeni niż lokalna maszyna.
- **Strefa czasowa.** Runner chodzi w UTC, serwer liczy Europe/Warsaw. Klasa błędu jest znana z `password-reset` (impl-review:122). `weekStartInHorizon` już liczy w Warszawie.
- **Dev a build.** Zagrożenia tylko dla serwera dev są udokumentowane (paski narzędzi dublujące propsy wysp, ucięta odpowiedź — commit `4aa6322`). Nigdzie nie ma zapisanej decyzji „dev czy `astro preview`”. Atrapa jest sprawdzona na dev, więc to punkt startowy; `preview` zostaje planem B, gdyby zimny start okazał się niestabilny. Ten sam plugin wbudowałby URL atrapy do `dist/`, co jest bezpieczne tylko w jobie bez deployu i wymaga osobnego sprawdzenia.

**Czy cały zestaw, czy tylko ścieżka krytyczna:** dowody przemawiają za całym. Dokładnie te specs złapały S-31 (F1: 6 testów, „would have reached `master` unnoticed”), a lekcja „Zmiana renderu strony wymaga inwentarza specs E2E” istnieje tylko dlatego, że CI ich nie uruchamia. Zdanie „e2e ma zostać mała” (§6.6) dotyczy dopisywania testów, nie ich uruchamiania. Czas CI jest niezmierzony; lokalny wynik 17 s pochodzi z ciepłego serwera, więc go nie przenoś.

Testy wcześniej zgłaszane jako czerwone (`month-print`, `week-print`, `help-and-contact`, planning-horizon impl-review:91) są zielone w przebiegu z 2026-10-30.

### 4. Ścieżka krytyczna w UI

| Krok | Lokator | Żądanie | Ref |
|---|---|---|---|
| Logowanie | `auth.setup.ts` — jedyne przejście przez formularz; porażka wywraca cały projekt `chromium` przez `dependencies` | `/api/auth/signin` | `tests/e2e/auth.setup.ts:20-41` |
| Miesiąc → dzień | link `Plan na ${iso} — brak planu` | GET `/plan?date=…` | `MonthGrid.tsx:77-80`, `month-grid.ts:65-71` |
| Hasło | `getByLabel("Hasło dnia")` | — | `DayPlanEditor.tsx:603` |
| Generowanie | przycisk `Generuj` (`exact: true`, bo „Generuj ponownie”); w toku `Generuję…` | POST `/api/day-plan/generate` | `:347`, `:642` |
| Wynik | region `Plan na ${formatPlanDate(date)}`, nagłówek `1. ${title}` | — | `:705`, `:903` |
| Edycja | `Edytuj propozycję: ${title}`, pola `Tytuł`/`Opis`, `Zapisz` | PATCH `/api/day-plan/activity/:id` | `:914`, `:988`, `:1004`, `:1083` |
| Zatwierdzenie | `Zatwierdź plan` (nieaktywny przy otwartym szkicu) | POST `/api/day-plan/accept` | `:801`, `:510` |
| Dowód | baner `Plan zatwierdzony …`, przycisk `Cofnij zatwierdzenie`, po przeładowaniu kafel `… — zatwierdzony` | — | `:882`, `month-grid.ts` |

Na tej ścieżce nie ma okien potwierdzeń (pojawiają się tylko przy dniu już zatwierdzonym i kasowaniu). Wyspa przechodzi dalej tylko, gdy `isDayPlanBody` przyjmie odpowiedź (`day-plan-guards.ts:44`).

Dane i sprzątanie:

- **Data:** `uniquePlanDate()` (rok 2100+) odpada, bo poza horyzontem nie ma formularza. Sloty `weekStartInHorizon` 0–2 są zajęte. Nowy slot `3` jest bezpieczny dla poniedziałku (najpóźniej 28. dzień następnego miesiąca); trzeba poszerzyć typ i dopisać go do listy w komentarzu (`test-data.ts:100-113`).
- **Sprzątanie:** `deleteSeededPlans` działa po `id`, a planu z UI nikt nie zasiał. Trzeba odczytać `id` kluczem serwisowym po `user_id` + `plan_date` właściciela. Nigdy nie kasować samą datą.
- **Limit:** każdy przebieg zużywa jeden dzień ze 150 miesięcznie dla stałego konta. W CI stos jest świeży, ale lokalnie wiersze `generation_ledger` zostają na 13 miesięcy, więc po ~150 przebiegach w miesiącu test dostanie 429 bez związku z kodem. Rozwiązanie do wyboru w planie: sprzątać księgę albo założyć osobne konto dla tego testu.
- **Porażka cicha:** `claimGeneration` jest fail-open, więc zepsuta księga nie zapali tego testu. To zgodne z CLAUDE.md §Fair use, ale ta bramka limitu nie pilnuje.
- **Czas:** `expect` ma domyślnie 5 s; zimna kompilacja trasy może tyle przekroczyć. Asercję po kliknięciu „Generuj” opierać na `waitForResponse` albo dłuższym timeoucie.

Asercje niosące ryzyko (zgodnie z §6.6 każda do zobaczenia na czerwono):

- tytuł z atrapy widać w regionie planu — dowód, że odpowiedź dostawcy przeszła przez kontrakt i zapis;
- atrapa odbiera wywołanie i dostaje hasło testu — dowód, że nie wyszło do prawdziwego OpenRoutera;
- edycja i zatwierdzenie przeżywają przeładowanie.

### 5. Atrapa dostawcy

`page.route()` nie sięga tego wywołania, a łatka na `fetch` z procesu testów też nie, bo `npm run dev` uruchamia trasę w workerd (`@astrojs/cloudflare` 13.5.0 montuje `@cloudflare/vite-plugin` na środowisku `ssr`). `OPENROUTER_URL` to stała bez odpowiednika w env (`activity-generator.ts:36`, użycie `:234`); `refine.ts`, `week/day.ts` i `week/outline.ts` idą przez ten sam `callOpenRouter`, a `content-safety-judge.ts:14` ma własną kopię URL-a, ale tylko dla bramki.

| Wariant | Kod produkcyjny | Bramka treści | Stan |
|---|---|---|---|
| **A. Wrapper `astro.config.e2e.mjs` + transform Vite** (precedens: `astro.config.test.mjs`) | bez zmian | nie rusza | **sprawdzony 2026-10-30, macOS** |
| B. `OPENROUTER_BASE_URL` z `astro:env` + strażnik `import.meta.env.DEV` i pętla zwrotna | zmiana `activity-generator.ts` + schemat env | ścieżka z `FULL_MATRIX`, pełna macierz (ok. 0,40 USD) raz | niesprawdzony |
| C. „Jedno prawdziwe wywołanie na przebieg” (`next-actions.md:565`) | bez zmian | — | odrzucony: koszt, niedeterminizm, sekret w PR-ach; historia wyczerpanych kont w §6.7 |

**Wynik próby wariantu A:** tymczasowy config z pluginem `enforce: "pre"`, serwer na porcie 4399 z osobnym `cacheDir`, atrapa HTTP na `127.0.0.1:4398`, konto `e2e-teacher-a` na lokalnym stosie, dzień 2026-12-04.

```
PROBE-TRANSFORM env=ssr hit=true
generate: 200 (plan z current_generation: 1)
stub calls: 1
[vite] generation.succeeded { attempt: 1, elapsedMs: 6, cost: 0, model: 'stub' }
cleanup delete: 204
```

Config, ciasteczka i plan usunięto po próbie. Wiersz w `generation_ledger` konta A na lokalnym stosie został. Plugin w próbie jest minimalny; nie uruchamiano go na Linuksie ani w Actions. Z workerd do `127.0.0.1` lokalna Supabase i tak już chodzi tą samą drogą.

Kruchość wariantu A: gdy stała zmieni wartość, `replace` przestanie trafiać po cichu. Dlatego plugin powinien **rzucać błąd, gdy nie znalazł URL-a**, zamiast polegać na samym liczniku.

Kontrakt atrapy:

- odpowiedź `{model, usage:{cost:0}, choices:[{finish_reason:"stop", message:{content:"<JSON>"}}]}`, gdzie `content` to `{aktywnosci:[{tytul,opis}]}`, dokładnie 3 pozycje, `tytul` 1–200, `opis` 1–4000 (`day-plan-contract.ts:39-47`);
- rozpoznanie trybu po `response_format.json_schema.name`: `propozycja_dnia`, `szkic_tygodnia`, `poprawiona_aktywnosc`;
- hasło w treści użytkownika (`Hasło: X\n…`) warto odbić w tytułach: dowód, że dotarło do „modelu”, i unikalność przy `fullyParallel`;
- punkt `/__calls` z licznikiem;
- `webServer` jako tablica z dwoma wpisami.
- Atrapa powinna leżeć poza `src/`, np. w `tests/e2e/support/`. Fixture'y `openrouter.ts` zwracają obiekty `Response` dla `fetch`, ale kształt można wykorzystać.

**Pułapka lokalna:** `reuseExistingServer: !CI`. Przy działającym zwykłym `npm run dev` lokalny `test:e2e` trafi na serwer bez pluginu, czyli wywoła prawdziwego dostawcę z prawdziwym kluczem z `.dev.vars`. To dokładnie stan z tej sesji (serwer na 4321 działał). Licznik w atrapie wykryje to dopiero po fakcie, a plan musi wybrać sposób zapobiegania, np. osobny skrypt albo sprawdzenie przed testem, że serwer ma plugin.

Ta sama atrapa to brakujący fundament pod ryzyko #5 w przeglądarce (`next-actions.md:566`: opóźnienie, awaria). `GenerationProgress` ma etapy od 4 s, a odpowiedź natychmiastowa pokazuje pasek zbyt krótko, by go asertować. Stan w toku można sprawdzić deterministycznie, wstrzymując `/api/day-plan/generate` przez `page.route` w przeglądarce, bez mockowania niczego. Czy #5 wchodzi do tej fazy, to decyzja zakresu.

### 6. Post-edit hook i smoke

- **Post-edit hook już istnieje.** `.claude/settings.json:22-38`: `PostToolUse` na `Write|Edit` odpala `post-edit-lint.sh` i `post-edit-typecheck.sh` (commit `a453be3`). §5 („recommended after §3 Phase 4”) i `change.md` mają to jako pracę do zrobienia; tu wystarczy aktualizacja dokumentu. Zakaz z planu bramki treści dotyczy sędziego LLM, nie tych skryptów.
- **Smoke po deployu nie ma punktu zaczepienia w repozytorium.** Workers Builds nie ma YAML-a, więc job musiałby sam wykryć koniec deployu. Precedensy są ręczne (`help-and-contact`, F8 z `design-foundation`). `infrastructure.md:107` zaleca smoke na stagingu, którego nie ma. Sygnał po merge'u i tak przychodzi po wdrożeniu; wycięcie tego z fazy kosztuje mało.

### 7. Dokumenty do aktualizacji po fazie

- `test-plan.md`: §5 (akapit o braku ochrony, tabela bramek, hook), §4 (wiersz e2e: „trzy testy”, „poza CI”), §6.6 (`Dane`, `Uruchomienie`), §6.7 (notatka fazy), status w §3.
- `CLAUDE.md` §CI: lista kroków `ci.yml` nie zawiera `npm test`, jobów `db`, `content-safety-gate` i e2e; `SUPABASE_*` opisane jako wymagane, a sekretów nie ma.
- `lessons.md:58`: „bo CI ich nie uruchamia” przestanie być prawdą.
- `next-actions.md:46-48`: faza `not started`, 37 testów; wiersze `:564-566`, `:576`, `:587` do domknięcia.
- `tests/e2e/E2E-RULES.md`: tabela „Generowanie przez OpenRouter — omijane”, reguła „Generowanie za oknem: tylko test odmowy”.

## Code References

Permalinki do `0b09d06`:

- [`.github/workflows/ci.yml:41-73`](https://github.com/arantasar/10x-preschool/blob/0b09d06cb7c260f3c6750af5e1c91073eb3bfdc9/.github/workflows/ci.yml#L41-L73) — job `db`: wzorzec do skopiowania
- [`playwright.config.ts`](https://github.com/arantasar/10x-preschool/blob/0b09d06cb7c260f3c6750af5e1c91073eb3bfdc9/playwright.config.ts) — `webServer`, `retries`, `reuseExistingServer`
- [`tests/e2e/support/env.ts:36-61`](https://github.com/arantasar/10x-preschool/blob/0b09d06cb7c260f3c6750af5e1c91073eb3bfdc9/tests/e2e/support/env.ts#L36-L61) — fallback na `process.env`
- [`tests/e2e/support/test-data.ts:92-118`](https://github.com/arantasar/10x-preschool/blob/0b09d06cb7c260f3c6750af5e1c91073eb3bfdc9/tests/e2e/support/test-data.ts#L92-L118) — sloty `weekStartInHorizon`
- [`src/lib/services/activity-generator.ts:36`](https://github.com/arantasar/10x-preschool/blob/0b09d06cb7c260f3c6750af5e1c91073eb3bfdc9/src/lib/services/activity-generator.ts#L36) — `OPENROUTER_URL`, cel transformacji
- [`src/lib/services/activity-generator.ts:563`](https://github.com/arantasar/10x-preschool/blob/0b09d06cb7c260f3c6750af5e1c91073eb3bfdc9/src/lib/services/activity-generator.ts#L563) — wymóg niepustego klucza
- [`src/pages/api/day-plan/generate.ts`](https://github.com/arantasar/10x-preschool/blob/0b09d06cb7c260f3c6750af5e1c91073eb3bfdc9/src/pages/api/day-plan/generate.ts) — kolejność: sesja → zod → horyzont → konflikty → claim → model → zapis → finish
- [`src/components/plan/DayPlanEditor.tsx`](https://github.com/arantasar/10x-preschool/blob/0b09d06cb7c260f3c6750af5e1c91073eb3bfdc9/src/components/plan/DayPlanEditor.tsx) — UI ścieżki krytycznej
- [`src/lib/services/gate-scope.ts:34-35`](https://github.com/arantasar/10x-preschool/blob/0b09d06cb7c260f3c6750af5e1c91073eb3bfdc9/src/lib/services/gate-scope.ts#L34-L35) — `FULL_MATRIX`
- [`astro.config.test.mjs`](https://github.com/arantasar/10x-preschool/blob/0b09d06cb7c260f3c6750af5e1c91073eb3bfdc9/astro.config.test.mjs) — precedens wrappera konfiguracji

## Architecture Insights

- **Granica sieciowa bywa granicą procesu.** W workerd „mockuj na sieci” znaczy prawdziwy serwer HTTP i przekierowanie celu, nie podmianę `fetch`.
- **Konfiguracja testowa przez wrapper, nie zmienna produkcyjna.** Repo już tak rozwiązało konflikt z adapterem w Vitest. Ten sam ruch tu chroni przed powstaniem przełącznika dostępnego w produkcji.
- **Sekret w CI to klucz jednorazowego stosu.** Nowe joby nie potrzebują sekretów repozytorium, więc działają też na PR-ach z forków, a to w publicznym repo ma znaczenie.
- **Sygnał przed egzekwowaniem.** Bramka staje się wymagana dopiero wtedy, gdy czerwień znaczy regresję. Kolejność: uciszyć szum, potem blokować.

## Historical Context (from prior changes)

- `context/archive/2026-08-29-testing-generation-contract-boundary/change.md:40-49` — decyzja 2026-08-30: „repozytorium zostaje prywatne, planu nie kupujemy”, źródło nieaktualnej przesłanki
- `context/archive/2026-09-30-testing-write-ownership/plan.md:347-349`, `reviews/impl-review.md:39-56` — projekt joba `db`; F2 wybrał ponowienie ręczne zamiast pętli
- `context/archive/2026-09-29-design-foundation/follow-ups/review-fixes.md:15-29` — F9, zimny cache Vite, właściciel: faza 4
- `context/archive/2026-10-18-planning-horizon/reviews/impl-review.md:25-37` — F1, 6 testów e2e padłych bez CI
- `context/archive/2026-10-13-password-change/reviews/impl-review.md:23` — długo działający serwer dev psuje testy wydruku na niezmienionym kodzie
- `context/foundation/next-actions.md:314-328` — zakres Kroku 9, w tym rozszerzenie mapy ryzyk o płatności
- `context/foundation/roadmap.md:79-80`, `next-actions.md:92` — S-25 i S-26 wymagają Kroku 9; „Płatności nie wchodzą bez e2e w CI”; termin płatności 2027-01-20

## Related Research

- `context/archive/2026-09-30-testing-write-ownership/research.md` — CI i warstwa `.db.test.ts`
- `context/archive/2026-08-31-testing-content-safety-gate/research.md` — bramka w CI i widoczność czerwieni

## Open Questions

Decyzje właściciela, do rozstrzygnięcia w `/10x-plan`:

1. **Egzekwowanie.** Włączyć ochronę `master` z wymaganymi checkami? Warianty: `enforce_admins: false` (scalenie na czerwono wymaga świadomego obejścia, commity `docs`/`chore` zostają) albo `true` (twarda blokada, każdy commit przez PR). Rekomendacja: `false`, po uciszeniu `db`. Wtedy trzeba też sprawdzić, czy zwykły push `docs`/`chore` przechodzi jako obejście administratora. Włączenie to zmiana ustawień repozytorium, nie kod, więc należy do właściciela.
2. **Rozwiązanie ECR.** Cache obrazów, ponowienia, czy wspólny job. Rekomendacja: cache, ze zmierzeniem rozmiaru; bez tego drugi job Supabase pogarsza problem.
3. **Zakres ryzyka #5 i `DELETE … .maybeSingle()`.** Oba przypisane do Kroku 9 (`next-actions.md:566`, `:586`). #5 korzysta z tej samej atrapy, a `:586` to zmiana produkcyjna niezwiązana z CI, więc kandydat na osobną pozycję.
4. **Rozszerzenie mapy ryzyk o płatności** (`next-actions.md:326-328`) — w tej fazie czy osobno.

Do zmierzenia w implementacji:

- czas pełnego zestawu i liczba przebiegów `flaky` na zimnym cache w Actions;
- działanie pluginu atrapy na Linuksie w Actions;
- rozmiar cache obrazów i jego wpływ na czas joba;
- zachowanie wymaganego checka dla joba pominiętego warunkiem `if`.

Źródła zewnętrzne: [Playwright — CI](https://playwright.dev/docs/ci), [Playwright — webServer](https://playwright.dev/docs/test-webserver), [GitHub — troubleshooting required status checks](https://docs.github.com/enterprise-server@3.14/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/troubleshooting-required-status-checks), [setup-supabase-action](https://github.com/bickoSiTiEff/setup-supabase-action), [supabase/setup-cli](https://github.com/supabase/setup-cli/blob/main/README.md).
