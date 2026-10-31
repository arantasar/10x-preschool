# Bramki jakości w CI + e2e ścieżki krytycznej — Plan Brief

> Full plan: `context/changes/testing-ci-gates-e2e/plan.md`
> Research: `context/changes/testing-ci-gates-e2e/research.md`

## What & Why

Merge do `master` wdraża aplikację na produkcję bez kroku zatwierdzenia, a e2e nie stoi w CI. Plan stawia cały zestaw e2e ze ścieżką generowanie → edycja → zatwierdzenie przed merge'em i sprawia, że czerwony check realnie go blokuje. To też warunek wejścia płatności (`Krok 9`, termin 2027-01-20).

## Starting Point

CI ma joby `ci`, `db` i `content-safety-gate`, wszystkie doradcze. 45 testów e2e działa tylko lokalnie i omija generowanie. Około 18% przebiegów pada na limicie pobrań obrazów, a repozytorium stało się publiczne, więc ochrona `master` jest dostępna, choć dokumenty mówią inaczej.

## Desired End State

PR z regresją ma czerwony check i jest zablokowany, a administrator może go scalić tylko świadomie. Job `e2e` uruchamia 48 testów bez sekretów repozytorium i bez prawdziwego dostawcy. Niestabilny test czerwieni przebieg, zamiast przejść po ponowieniu.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Atrapa LLM | Wrapper Astro + transform Vite + serwer HTTP | Sprawdzone end-to-end i bez przełącznika w produkcji | Research |
| Egzekwowanie | Wymagane checki, `enforce_admins: false` | Czerwień wymaga świadomego obejścia, a przepływ `docs`/`chore` ma szansę zostać | Plan |
| Limit ECR | Cache obrazów, osobne joby | Mniej pobrań i osobne znaczki dla bazy i e2e | Plan |
| Zakres zestawu | Cały zestaw w CI | Te specy złapały S-31, gdy CI ich nie uruchamiało | Research |
| Ryzyko #5 | W zakresie | Ta sama atrapa, mały koszt | Plan |
| Test flaky | `failOnFlakyTests` + `retries: 2` | Niestabilność jest widoczna, a trace zostaje | Plan |
| Ochrona lokalna | Znacznik `/__e2e-stub` i skrypt `dev:e2e` | Zwykły serwer dev nie zostanie użyty, więc nie ma prawdziwego wywołania | Plan |
| Wymagane checki | `ci`, `db`, `e2e`, `content-safety-gate` | Reguła z `lessons.md` o bramce przed scaleniem staje się egzekwowana | Plan |
| Próg włączenia | 5 zielonych przebiegów z rzędu | Prosty dowód tuż przed zmianą ustawień | Plan |
| Runtime e2e | `astro dev`, `preview` jako plan B | Atrapa jest sprawdzona na dev | Research |

## Scope

**In scope:**

- cache obrazów i akcja `supabase-stack`;
- atrapa dostawcy, `astro.config.e2e.mjs`, `dev:e2e`;
- spec ścieżki krytycznej i dwa specy ryzyka #5;
- job `e2e`, pomiar zimnego startu i ewentualna poprawka F9;
- ochrona `master`, aktualizacja dokumentów.

**Out of scope:**

- smoke po deployu;
- `DELETE … .maybeSingle()`;
- mapa ryzyk o płatności;
- `enforce_admins: true`;
- zmiany kodu generowania.

## Architecture / Approach

Playwright uruchamia dwa serwery: atrapę HTTP na `127.0.0.1:4398` i `astro dev` z wrapperem. Plugin Vite w trybie `serve` podmienia URL OpenRoutera, a build produkcyjny go nie widzi. Reszta (sesja, trasy, RLS, zapis) jest prawdziwa, na lokalnym stosie Supabase.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Stabilny stos | Cache obrazów dla `db` | Rozmiar i czas `docker load` niezmierzone |
| 2. Atrapa i serwer e2e | Lokalne e2e bez prawdziwego dostawcy | Port i strict start pod Astro |
| 3. Specy | Ścieżka krytyczna i #5, rytuał mutacji | Stały slot i sprzątanie księgi |
| 4. Job `e2e` | Cały zestaw w CI, flaky na czerwono | Zimny start na runnerze |
| 5. Egzekwowanie | Ochrona `master`, dowód `BLOCKED`, dokumenty | Zachowanie pushy `docs`/`chore` |

**Prerequisites:** gałąź `feat/testing-ci-gates-e2e`, działający Docker lokalnie; zgoda właściciela w momencie włączania ochrony.
**Estimated effort:** ~3–4 sesje na 5 faz.

## Open Risks & Assumptions

- Atrapa nie była uruchamiana na Linuksie ani w Actions; zweryfikuje to Faza 4.
- Cache nie usuwa limitu: po 7 dniach bezczynności lub zmianie wersji pierwszy przebieg znów pobiera.
- Brak środków w OpenRouterze zablokuje PR-y dotykające promptów do doładowania lub obejścia administratora.
- Pięć przebiegów nie wyklucza rzadkiego flake'a.
- Założenie: push administratora działa jako obejście; jeśli nie, trzeba opisać przepływ `docs`/`chore` na nowo.

## Success Criteria (Summary)

- Tymczasowy PR z czerwonym `e2e` ma `mergeStateStatus: BLOCKED`.
- Pięć kolejnych przebiegów `db` i `e2e` jest zielonych, bez flaky.
- Sześć celowych psuć zapala właściwe specy.
