# Odwieszenie bramki bezpieczeństwa treści (F-02) — Plan Brief

> Full plan: `context/changes/content-safety-gate-resume/plan.md`

## What & Why

Bramka bezpieczeństwa treści to jedyny automatyczny strażnik, który sprawdza, czy propozycje dla dzieci 3–6 lat są bezpieczne. Jest zawieszona od 2026-09-19 z powodu kosztu. W tym czasie na produkcję weszły dwie zmiany promptów, których nikt nie ocenił. PRD v3 Guardrail 2: odwieszona bramka obejmuje każdy dopuszczony model i każdy tryb, a bramka zielona na części nie jest odwieszona. To też warunek wstępny gwiazdy przewodniej `S-22` i płatności.

## Starting Point

Jeden przełącznik (`gate-suspension.ts`) zamienia obie warstwy bramki w `describe.skip`, `npm run test:gate` kończy się kodem 2, a job CI drukuje tylko ostrzeżenie. Sędzia (`claude-haiku-4.5`) nigdy nie był kalibrowany. Macierz płaci za tryb `day`, którego żadna trasa nie wysyła.

## Desired End State

`npm run test:gate` ocenia zawsze, bez flag. Macierz to 2 modele × 4 tryby produkcyjne (`day-weekday`, `day-themed`, `week`, `activity`), oceniane przez skalibrowanego sędziego. Raport podaje koszt przebiegu. CI uruchamia bramkę na każdym PR-ze, który zmienia prompt, model, fixture'y albo samą bramkę. Zielony przebieg jest zapisany w `gate-runs.md`, a mechanizm zawieszenia zniknął z repo.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego |
| --- | --- | --- |
| Szerokość macierzy | Bez `day`, z `day-themed` | Cztery tryby = cztery trasy produkcyjne. Około −25% kosztu bez utraty pokrycia produkcji. Pominięcie `day-themed` łamałoby Guardrail 2. |
| Mechanizm zawieszenia | Usunięty w całości | Jeden stan bramki. Ponowne zawieszenie to jawny revert, nie zmiana env. |
| CI | PR + filtr ścieżek (poszerzony o fixture'y i `gate-*`) | Płaci tylko, gdy jest co oceniać, czyli dokładnie reguła `lessons.md` §3. Bez crona. |
| Czerwony przebieg | Poprawka promptu w F-02, pełna macierz ponownie | Zgodnie z roadmapą. Domyka dług `S-15`. |
| Sędzia oblewa kalibrację | Szczebel wyżej: Haiku → Sonnet → Opus | Płaci za sędziego tyle, ile trzeba. Rubryki nie stroimy pod fixture'y. |
| Dowód, że bramka umie nie przejść | Fixture'y niebezpieczne w kalibracji + PR fundamentu w CI | Zero dodatkowego kosztu. Sprawdza sędziego i okablowanie CI. |
| Koszt w raporcie | Suma kosztu generowania, bez sędziego (nazwane wprost) | Odpowiada na Unknown roadmapy bez zmiany kontraktu sędziego. |

## Scope

**In scope:** kalibracja sędziego na żywo; `GATE_MODES` bez `day`; linia kosztu w raporcie + test jednostkowy; przebiegi pełnej macierzy do zieleni z poprawkami promptów; usunięcie `gate-suspension.ts` i ogona exit 2; przywrócenie joba CI z poszerzonym filtrem; aktualizacja `test-plan.md` §6.5, `next-actions.md`, roadmapy.

**Out of scope:** zmiana rubryki; tryb „outline na podzbiorze dni”; cron i `workflow_dispatch`; jednorazowa kontrola z DeepSeekiem; koszt sędziego; bramka blokująca merge; zmiany haseł i przypadków refine; zmiany schematów JSON.

## Architecture / Approach

Kolejność to zasada „żadnej macierzy na nieskalibrowanym sędzim”:

1. tani przebieg kalibracji;
2. zmiany offline w macierzy i raporcie, weryfikowane `npm test`;
3. płatny przebieg macierzy z poprawkami;
4. usunięcie przełącznika.

PR fundamentu dotyka `content-safety*`, więc sam uruchamia przywróconą bramkę w CI i jest dowodem okablowania.

## Phases at a Glance

| Faza | Co dostarcza | Główne ryzyko |
| --- | --- | --- |
| 1. Kalibracja sędziego | Sędzia skalibrowany, decyzja zapisana przy `JUDGE_MODEL` | Haiku oblewa; dwa szczeble w górę podnoszą koszt sędziego |
| 2. Macierz bez `day` + koszt | 4 tryby produkcyjne, raport z kosztem, test raportu | Niskie: zmiany offline |
| 3. Pełna macierz do zieleni | Zielony przebieg w `gate-runs.md`, ewentualnie poprawiony prompt | Czerwone `activity`; poprawka promptu psuje bezpieczne kontrole; zakres otwarty |
| 4. Bez zawieszenia, bramka w CI | `test:gate` zawsze ocenia; CI uruchamia bramkę na PR | Merge = wydanie poprawionego promptu na produkcję |

**Prerequisites:** doładowane konto OpenRouter (lokalny klucz i sekret CI); gałąź `feat/content-safety-gate-resume` przed pierwszym commitem.
**Estimated effort:** ~2–3 sesje, w tym 1–N przebiegów na żywo w fazie 3.

## Open Risks & Assumptions

- Zakres fazy 3 jest otwarty: czerwony przebieg może wymagać kilku iteracji promptu, a każda kosztuje pełną macierz.
- Jeśli czerwony jest tylko Gemini, a poprawka psuje lunę, faza wraca do właściciela. Usunięcie modelu z listy nie było wybraną drogą.
- Zmiana sędziego po fazie 3 wymaga powtórzenia fazy 3.
- CI pozostaje doradcze: bramka działa, ale nie zatrzyma merge'a. Egzekwuje ją wyłącznie człowiek czytający check.
- Dryf modeli u dostawcy między zmianami promptu zostaje niepilnowany (brak crona).

## Success Criteria (Summary)

- Pełna macierz (oba modele × cztery tryby produkcyjne) przechodzi zielono na skalibrowanym sędzim, z zapisem w `gate-runs.md`.
- `npm run test:gate` ocenia bez flag, a na PR-ze zmieniającym prompt job CI pokazuje raport bramki, nie notice.
- W repo nie ma mechanizmu, który pozwalałby bramkę po cichu wyłączyć.
