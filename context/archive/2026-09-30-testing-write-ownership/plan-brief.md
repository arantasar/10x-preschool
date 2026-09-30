# Ochrona zapisu i własności (Faza 3) — Plan Brief

> Full plan: `context/changes/testing-write-ownership/plan.md`
> Research: `context/changes/testing-write-ownership/research.md`

## What & Why

Faza 3 rolloutu test-planu przypina testami trzy ryzyka i jeden dług:
- **#3** — dzień zatwierdzony ginie tylko po zgodzie nazywającej ten dzień;
- **#4** — cudzy zasób daje jawną odmowę, nie cichy pusty wynik;
- **#7** — kasowanie zdejmuje dokładnie jeden dzień jednego właściciela;
- dług **`U0003`** — odmowa pustej partii bez żadnej asercji.

Kod już zachowuje się poprawnie. Chodzi o to, żeby regresja przestała być cicha, zanim merge do `master` wypuści ją na produkcję.

## Starting Point

- Własność stoi wyłącznie na RLS: trasy nie filtrują po `user_id`.
- `accept.ts` i `index.ts` (GET/DELETE) nie mają testów, a 409 przed płatnym wywołaniem modelu w `generate.ts` jest bez dowodu.
- pgTAP ma 98 asercji w 4 plikach, zero dla `U0003`, a writer tygodnia jest testowany na jednym koncie.
- CI nie uruchamia żadnej bazy.

## Desired End State

Każde twierdzenie ma dowód w najtańszej warstwie, która je naprawdę sprawdza:
- pgTAP: niezmienniki bazy;
- atrapa w `npm test`: zachowanie tras niezależne od własności;
- nowa warstwa „trasa jako funkcja + prawdziwy `supabase-js` zalogowany jako A albo B”: własność na trasie, RLS i tłumaczenie na HTTP naraz.

Obie warstwy bazy biegną w CI w osobnym, doradczym jobie `db`. §6.3 test-planu jest gotowym przepisem.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Wzorzec §6.3 | Hybryda: atrapa dla zachowań bez własności, prawdziwy klient A/B dla własności | Atrapa nie potrafi dowieść RLS, a prawdziwy stos dla 400/401 to koszt bez sygnału | Research → Plan |
| Gdzie biegnie warstwa bazy | Jeden osobny job `db` w CI (`supabase start -x …` → `test:db` → `test:db:api`) | Domyka bramkę §5 dla obu warstw; osobny znaczek, bez sekretów | Plan |
| Semantyka #3 | Tydzień: zgoda = data + `accepted_at`; dzień: boolean | Stan po S-10, nie „zgoda per data” z test-planu | Research |
| Asymetria zgody dnia | Nie przypinać testem; pozycja w `next-actions.md` z właścicielem | Zmiana zachowania nie należy do fazy testowej, ale nie może zginąć | Plan |
| Powierzchnia #4 | Jawne 404 dla tras adresowanych id (`accept`, `activity/[id]`); trasy datowe: „nie dotyka wiersza B” | Trasa po dacie nie potrafi nazwać cudzego wiersza | Research |
| `generate` na prawdziwym kliencie | Nie; własność zapisu niesie `week/save` | Podmiana `fetch` dla modelu łamie też `supabase-js` | Plan |
| `.maybeSingle()` na wielowierszowym DELETE | Rozstrzygnąć w rytuale mutacji (wyłączony RLS), zapisać wynik | Odpowiedź z prawdziwego PostgREST za darmo, bez testu psującego bazę | Plan |
| Dowód mutacji | Komentarz przy asercji + wiersz Manual w Progress | Dowód żyje obok testu i przeżywa archiwizację | Plan |
| Backport test-planu | Ostatnia faza tego planu | §6.3 nie może zostać „TBD” po fazie, która miała go wypełnić | Plan |

## Scope

**In scope:**
- pgTAP: `U0003` (4 gałęzie + kolejność + wycofanie w tygodniu), sąsiad dnia i tygodnia, tydzień dwóch kont, DELETE po dacie na dwóch kontach
- Atrapa: `delete()` i `day_plans.update()`; testy `generate` (dzień zatwierdzony), `index` GET/DELETE, `accept`
- Nowa warstwa `*.db.test.ts` + `vitest.db.config.ts` + `npm run test:db:api`
- Job `db` w `ci.yml`
- Backport do `test-plan.md` i `next-actions.md`

**Out of scope:**
- Zmiany produkcyjne, w tym wyrównanie zgody dnia do tygodnia
- Nowe e2e, blokujące bramki, trasy bez bazy (`refine`, `week/day`, `week/outline`)
- Trwały test obrony w głąb dla DELETE

## Architecture / Approach

Od dołu w górę:

pgTAP (baza) → atrapa (trasa bez RLS) → trasa + prawdziwy klient A/B (trasa z RLS) → CI → dokumentacja.

Nowa warstwa woła eksportowane `GET`/`POST`/`PATCH`/`DELETE` jak w §6.2, ale `locals.supabase` to klient zalogowany na lokalnym stosie. Helper `__fixtures__/supabase-local.ts`:
- zakłada konta i zasiewa kluczem serwisowym (nigdy przez niego nie asertuje);
- pada głośno bez stosu;
- odmawia adresu innego niż localhost.

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. pgTAP | `U0003` i luki #3/#7 przypięte w bazie | Psucie migracji w rytuale mutacji niecofnięte przed commitem |
| 2. Atrapa | `generate` 409 przed modelem, `index`, `accept` z testami | Atrapa rozrośnie się w drugi PostgREST |
| 3. Prawdziwy klient A/B | Wzorzec §6.3, własność na 4 trasach | Cichy „skip” bez stosu; kolizje danych między przebiegami |
| 4. Job `db` | Warstwy bazy w CI | Lista `-x` wywraca start; czas joba |
| 5. Backport | test-plan i next-actions zgodne ze stanem | Diff tabel markdown mylący przez przerównanie |

**Prerequisites:** Docker + `npx supabase start` lokalnie; gałąź `feat/testing-write-ownership` (już aktywna).
**Estimated effort:** ~3–4 sesje (fazy 1 i 3 największe, 4 zależy od pierwszego przebiegu CI).

## Open Risks & Assumptions

- `supabase start -x …` z wykluczeniami może wymagać zawężenia listy, gdy GoTrue albo Kong zależy od wykluczonego kontenera.
- Czas joba `db` jest nieznany (pobieranie obrazów bez cache). Mierzony przy pierwszym przebiegu.
- Jeśli rytuał mutacji pokaże, że wielowierszowy DELETE przechodzi bez błędu, powstaje pozycja „obrona w głąb” w `next-actions.md`. Naprawa nie jest częścią tej fazy.
- Bramki pozostają doradcze: ostatnią realną bramką jest człowiek czytający checki.

## Success Criteria (Summary)

- Zepsucie RLS, pre-checku w `generate`, odmowy `U0003` albo zakresu writera tygodnia daje czerwony test, a na PR-ze czerwony znaczek `db` albo `ci`.
- §6.3 pozwala dopisać test własności nowej trasy bez czytania tej zmiany.
- Faza 3 ma w test-planie status `complete`, a Krok 6 w `next-actions.md` jest zamknięty.
