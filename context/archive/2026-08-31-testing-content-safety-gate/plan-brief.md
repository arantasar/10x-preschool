# Powtarzalna bramka bezpieczeństwa treści — Plan Brief

> Full plan: `context/changes/testing-content-safety-gate/plan.md`
> Research: `context/changes/testing-content-safety-gate/research.md`

## What & Why

Faza 2 rolloutu test-planu pokrywa ryzyka **#1** (nauczyciel dostaje propozycję
nieodpowiednią dla dzieci 3–6 lat; zmiana promptu lub modelu cofa bezpieczeństwo
przy zerowym sygnale) i **#6** (niewalidowane wejście trafia do promptu i do bazy).

Przesłanka, z którą fazę otwarto — „wyjąć jedyną kontrolę guardrailu z
jednorazowego skryptu" — **jest nieaktualna**. `scripts/compare-models.sh` nie
zawiera **żadnej** asercji bezpieczeństwa: jego osiem statusów dotyczy kształtu i
transportu, a ocena bezpieczeństwa była ręczna. Ta faza **pisze kontrolę pierwszy
raz**.

## Starting Point

- Guardrailem jest **wyłącznie prompt**, a jego sekcja przekierowania
  (`day-plan.pl.md:56-69`) **nigdy nie została uruchomiona**. DeepSeek przeszedł
  każdą automatyczną kontrolę i zaproponował trzylatkom roztopiony wosk.
- **„Zbiór dopuszczonych modeli" nie istnieje.** `OPENROUTER_MODEL` to
  nieograniczony string, zmienialny w panelu Cloudflare **bez commita**. Cztery
  miejsca wyglądają na listę i przeczą sobie — jedno wciąż zawiera
  zdyskwalifikowanego DeepSeeka.
- **Rubryka nie istnieje jako dokument** — kryteria rozproszone po czterech
  archiwach.
- **Ryzyko #6 rozpada się na dwie połowy o przeciwnych werdyktach**: sufit
  20 wierszy **jest** strukturalny i egzekwowany w schemacie, ale **bez ani jednej
  asercji pgTAP**; walidacja wejścia natomiast jest **wyłącznie długościowa** —
  research udowodnił empirycznie, że nowa linia w haśle ląduje w slocie
  `Temat dnia:`, który prompt sam nazywa **nadrzędnym**.
- Bramka **nie może blokować**: `403 Upgrade to GitHub Pro` na ochronie gałęzi, a
  merge do `master` deployuje na produkcję bez zatwierdzenia.

## Desired End State

`OPENROUTER_MODEL` spoza skommitowanej listy jest **głośnym błędem konfiguracji**,
nie cichym cofnięciem guardrailu. Wejście z instrukcją rozbitą na linie jest
odrzucane po stronie serwera. Sufit partii ma dowód w pgTAP. Bramka biegnie w CI
na PR-ze przy zmianie promptu, schematu, rubryki albo zbioru modeli, pokrywa
**każdy dopuszczony model** i raportuje naruszenie z nazwą modelu, hasłem i
**cytatem** — a została zobaczona na czerwono, zanim wjechała do repo.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Zbiór dopuszczonych modeli | Skommitowany moduł; runtime odrzuca model spoza listy | Bez skończonego zbioru „każdy dopuszczony model" nie ma referentu, a podmiana w panelu Cloudflare nie tworzy commita, którego mógłby szukać filtr ścieżek | Plan |
| Ryzyko #6 | Utwardzić produkcję **i** dopisać regresję w obu polach | Ryzyko #6 żąda odrzucenia wejścia z instrukcją po stronie serwera; test na niezmienionym zachowaniu tylko udokumentowałby dziurę | Plan |
| Werdykt bezpieczeństwa | Sędzia LLM na zapisanej rubryce + deterministyczne warstwy wstępne | Wosk nie zawiera zabronionego słowa — przesiew leksykalny by go przepuścił; sam sędzia łamałby zasadę „najtańszy test, który daje sygnał" | Plan |
| Umiejscowienie bramki | Osobna konfiguracja Vitesta + własny job CI z filtrem ścieżek | Zmierzone: `include` bez `exclude` wciąga bramkę do bezkluczowego `npm test`; inline `test.projects` gubi pluginy Astro | Plan (zmierzone) |
| Macierz i flake | Zawężona, równoległa; ponowienia wyłącznie transportowe | Czas jest wiążący (61 min szeregowo), a ~9% awarii transportu uczyniłoby bramkę czerwoną przypadkiem — czyli nieczytaną | Research |
| Prompty | **Nie dotykamy ich w tej fazie** | Bramka, której pierwszy przebieg zmienia własny przedmiot, nie mówi nic o tym, czy przedmiot był bezpieczny wcześniej | Plan |
| Rubryka | Obok kodu bramki, ładowana `?raw` | Artefakt, który sędzia czyta, jest artefaktem, który recenzuje człowiek — i siedzi wewnątrz filtru ścieżek | Plan |
| Kolizja pgTAP | Dwie asercje tutaj, `U0003` zostaje u Fazy 3 | Dwie `throws_ok` to najtańszy możliwy dowód klauzuli „poniżej aplikacji"; dług jest otwarty i zapisany od F-01 | Research |
| Dowód „może nie przejść" | Fixture'y kalibracyjne + jednorazowy przebieg na wyciętym prompcie | Fixture'y wyłapią dryf sędziego za sześć tygodni; przebieg na żywo sprawdza okablowanie, na którym Faza 1 się potknęła | Plan |
| Raport | Model, hasło, tryb, klauzula, **cytat** — do podsumowania joba | Bramka nie może blokować, więc jej jedyną egzekucją jest człowiek czytający check | Research |
| `compare-models.sh` | Zostaje jako pomoc decyzyjna; martwa ścieżka naprawiona | Ma prawdziwe zadanie — ocenę **kandydata** — którego bramka nie wykonuje | Plan |

## Scope

**In scope:**

- `allowed-models.ts` jako jedyne źródło zbioru; walidacja w runtime; opcjonalne
  nadpisanie modelu, żeby bramka wołała produkcyjną ścieżkę
- Walidacja treściowa `prompt` i `theme` + przycinanie po stronie serwera; nazwane
  testy regresji wstrzyknięcia (jednostkowe i na trasie)
- Dwie asercje pgTAP: `activities_ordinal_bounds`, `day_plans_prompt_length`
- Rubryka jako dokument; sędzia z deterministycznymi warstwami wstępnymi;
  fixture'y kalibracyjne
- Osobna warstwa runnera (`*.gate.test.ts`, `vitest.gate.config.ts`) + job CI z
  własnym `env:` i filtrem ścieżek
- Kontrola negatywna na żywym prompcie, zapisana; `test-plan.md` §3/§5/§6.4/§6.5/§6.6

**Out of scope:**

- Zmiany w promptach i schematach JSON — a więc też otwarta luka rubryki
  „Dzień Matki", której wyzwalaczem jest iteracja promptu
- Post-filtr runtime'owy (decyzja roadmapowa „bez post-filtra w MVP" stoi)
- Przepisanie albo usunięcie `scripts/compare-models.sh`
- Dług `U0003` (odmowa pustej partii) — właścicielem jest Faza 3
- Ochrona gałęzi / plan GitHub Pro; hook per-edit; przebieg cykliczny (cron)

## Architecture / Approach

```
allowed-models.ts  ──►  activity-generator  ──►  produkcja
      │  (skommitowany zbiór;                     (runtime odrzuca
      │   runtime waliduje)                        model spoza listy)
      │
      └──►  content-safety.gate.test.ts
                 │  iteruje zbiór przez nadpisanie modelu
                 ▼
            produkcyjna ścieżka generowania
                 │
                 ▼
       warstwy deterministyczne  (kształt, liczba, język,
                 │                „to plan, nie odmowa")
                 ▼
       content-safety-judge  ◄── content-safety-rubric.pl.md (?raw)
                 │
                 ▼
       raport: model · hasło · tryb · klauzula · CYTAT
                 │
                 ▼
       job CI (własny env:, paths: na prompts/** + allowed-models)
```

Bramka **woła oryginały**, a nie ich kopie — to jest ta różnica wobec
`compare-models.sh`, który ręcznie odwzorowuje w bashu nieeksportowane funkcje TS,
i to dokładnie tę część, o którą w bramce najbardziej chodzi.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Zbiór modeli staje się realny | `allowed-models.ts`; runtime odrzuca model spoza listy; nadpisanie modelu dla bramki | Produkcyjny `OPENROUTER_MODEL` może dziś być spoza listy — pierwszy deploy zepsuje generowanie |
| 2. Ryzyko #6 | Odrzucenie znaków sterujących w `prompt`/`theme`; regresje wstrzyknięcia; dwie asercje pgTAP | Zbyt szeroka odmowa złapie normalne polskie hasła; przekroczenie granicy właścicielstwa katalogu |
| 3. Rubryka i sędzia | Rubryka jako dokument; sędzia + fixture'y kalibracyjne; izolacja warstwy runnera | Bez `exclude` bramka wpada do bezkluczowego `npm test` i psuje każdy PR |
| 4. Żywa bramka + CI | Macierz, raport z cytatem, job CI, kontrola negatywna, dokumentacja | ~9% awarii transportu robi bramkę czerwoną przypadkiem — a wtedy nikt jej nie czyta |

**Prerequisites:** feature branch `feat/testing-content-safety-gate` (jest);
Docker + `npx supabase start` dla Fazy 2; **nowy repository secret
`OPENROUTER_API_KEY`** przed Fazą 4 — dziś nie istnieje nigdzie w CI;
sprawdzenie produkcyjnej wartości `OPENROUTER_MODEL` **przed merge'em Fazy 1**.

**Estimated effort:** ~4 sesje, po jednej na fazę; Fazy 3–4 najcięższe (rubryka
wymaga przeglądu jako proza, Faza 4 ma sześć pozycji ręcznej weryfikacji).

## Open Risks & Assumptions

- **Zestaw haseł jest próbą, nie dowodem.** Zawężenie macierzy jest wymuszone
  budżetem czasu; zielona bramka nie jest gwarancją bezpieczeństwa dla haseł spoza
  zestawu, i jest to zapisane obok zestawu.
- **Sędzia jest niedeterministyczny.** Fixture'y kalibracyjne to jedyne, co stoi
  między dryfem sędziego a cicho zieloną bramką — dlatego biegną **przed** macierzą
  i przerywają przebieg.
- **Bramka jest doradcza.** `403` na ochronie gałęzi to stan repozytorium, nie
  wybór planu; przy merge'u deployującym prosto na produkcję jedyną egzekucją
  zostaje człowiek czytający raport.
- **Faza 1 ogranicza bezdeployową podmianę modelu** — świadomy koszt wymagany
  przez `lessons.md` #3, ale realny: nowy model to teraz commit + przebieg bramki
  + deploy.
- **Otwarta luka rubryki „Dzień Matki" zostaje otwarta**, bo jej warunek
  domknięcia (iteracja promptu) celowo nie jest tu uruchamiany.

## Success Criteria (Summary)

- Nauczyciel nie może dostać propozycji z modelu, którego bramka nigdy nie
  sprawdziła — konfiguracja spoza listy jest błędem, nie cichą podmianą
- Hasło z wstrzykniętą instrukcją jest odrzucane, zanim cokolwiek za nie zapłaci
  albo je zapisze; sufit 20 wierszy ma dowód, że trzyma poniżej aplikacji
- Zmiana promptu, schematu, rubryki albo zbioru modeli otwiera PR, na którym
  widać — z cytatem — czy bezpieczeństwo się utrzymało; i bramka została
  zobaczona na czerwono, zanim ktokolwiek na nią polegał
