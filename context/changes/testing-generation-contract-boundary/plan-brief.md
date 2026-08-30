# Runner testów + granica model→kontrakt→zapis — Plan Brief

> Full plan: `context/changes/testing-generation-contract-boundary/plan.md`
> Research: `context/changes/testing-generation-contract-boundary/research.md`

## What & Why

Faza 1 rolloutu z `test-plan.md` §3: postawić runner testów, na którym oprą się fazy 2–4, i udowodnić, że **odpowiedź spoza kontraktu oraz awaria dostawcy kończą się uczciwą porażką, a nie cichym pustym planem** (ryzyka #2 i #5).

Research zmienił przesłankę i to jest najważniejsze ustalenie tej fazy: serwerowa ścieżka generowania **nie ma** dziury cichego pustego planu — każda gałąź rzuca, zod wypada przed zapisem, zapis jest atomową funkcją Postgresa. Ryzyko #2 jest realne, ale mieszka piętro wyżej. Ryzyko #5 wypada gorzej, niż plan zakładał: pięć klas awarii daje bajtowo identyczne 503 „przeciążona", w tym przypadek, w którym dostawca odpowiedział — tylko niepoprawnym body — i kosztuje to jeszcze płatne ponowienie.

## Starting Point

Zero testów JS. Jedyna działająca warstwa to 71 asercji pgTAP uruchamianych ręcznie, nigdy w CI. `ci.yml` robi lint + build i nie deployuje — deploy robi Cloudflare Workers Builds spoza repo, więc **merge do `master` jest releasem**, a PR jest ostatnim miejscem, w którym cokolwiek da się zatrzymać. Granica sieciowa do LLM to dokładnie jeden `fetch`, a klient Supabase jest już wstrzykiwalny przez `locals` — faza nie wymaga refaktoru pod testowalność.

## Desired End State

`npm test` przechodzi lokalnie i w CI na każdym PR-ze. Zestaw dowodzi — na granicy sieciowej, nigdy przez mock modułu wewnętrznego — że każda klasa awarii dostawcy kończy się błędem i zerem zapisów, że odpowiedź spoza kontraktu nigdy nie dociera do bazy, że szczęśliwa ścieżka woła zapis dokładnie raz z trzema aktywnościami, i że pusta partia jest odmawiana przez schemat, nie przez TypeScript. Nauczyciel przestaje czytać „usługa przeciążona", kiedy dostawca odpowiedział.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Kolaps klas awarii | Naprawić tylko przypadki mylące | Nieparsowalne body → `invalid`/502 bez płatnego ponowienia; `finish_reason: "length"` wykrywane. Timeout/429/5xx dzielą jedno **uczciwe** 503 — nauczyciel i tak nie zareaguje inaczej | Plan |
| `.every()` na `[]` | Naprawić i przetestować tutaj | Najmocniejsze znalezisko researchu; strażniki to czyste funkcje, więc mieszczą się w zakresie „bez renderowania" | Plan |
| Dolna granica w schemacie | Migracja tutaj, granica „niepusta" (≥1) | „Partia nie jest pusta" to niezmiennik strukturalny; „dokładnie 3" to kontrakt promptu. Trójka zepsułaby 13+ istniejących asercji pgTAP | Plan |
| Mockowanie | `vi.stubGlobal("fetch")` | Jeden URL, sześć klas awarii — MSW nie zarabia na dependency; `Response` jest natywny w Node 24 | Plan |
| Konfiguracja runnera | `getViteConfig` + `astro.config.test.mjs` | Wariant bez pliku testowego **nie działa** — sprawdzone w tej sesji, patrz niżej | Research + spike |
| Bramka CI | Wire'ować w Fazie 1 | Merge do `master` deployuje bez zatwierdzenia; bramka, która nie stoi na PR, nie stoi nigdzie | test-plan §5 |
| Układ plików | Ko-lokowane `*.test.ts` | Test widoczny obok kodu, który pilnuje; zostaje konwencją cookbooka §6 | Plan |
| Zakres ścieżki tygodnia | Dzień głęboko, konspekt tylko kontraktowo | Wspólne rury przechodzą raz przez ścieżkę dnia; duplikat `dzien` to niezmiennik, którego nic innego nie łapie | Plan |

## Scope

**In scope:** Vitest + konfiguracja + `npm test` + krok CI · naprawa dwóch mylących gałęzi awarii · testy jednostkowe sześciu klas awarii · testy integracyjne trasy generowania (zapis zero/raz) · migracja odmawiająca pustej partii · ekstrakcja i naprawa strażników wysp · cookbook §6.1/§6.2 i status §3/§5.

**Out of scope:** testy renderujące komponenty · pełne rozdzielenie klas awarii na sześć komunikatów · rozszerzanie pgTAP (Faza 3) · `Promise.allSettled` na trasie tygodnia (Faza 3) · `readMonthSummary` pokazujące pusty dzień jako zaplanowany · `compare-models.sh` i jego `exit 0` (Faza 2) · e2e i Playwright (Faza 4) · `astro check` w CI.

## Architecture / Approach

Testy podmieniają **wyłącznie `globalThis.fetch`** — jedyną granicę sieciową — oraz `locals` dla klienta Supabase, co konwencja projektu już umożliwia. Cała realna logika (`categorizeStatus`, `GenerationError`, `runWithBudget`, mapowanie w trasie, zod) wykonuje się naprawdę. `POST` jest eksportowany, więc trasa testuje się bez serwera HTTP.

Kluczowa asercja nie jest asercją na kodzie statusu, tylko **na licznikach**: ile razy zawołano `fetch` (dowód, że ponowienie zaszło lub nie) i ile razy `rpc` (dowód, że zapis się nie odbył). Każdy blok negatywny ma obok siebie przypadek pozytywny, żeby zestaw był rozróżniający — to lokalna kultura testów tego repo (`rls_isolation.test.sql:152-156`) i ta sama reguła co „Kryterium weryfikacji musi móc nie przejść" z `lessons.md`.

## Phases at a Glance

| Faza | Co dostarcza | Główne ryzyko |
| --- | --- | --- |
| 1. Runner + bramka CI | `npm test` lokalnie i w CI, na konfiguracji potwierdzonej spike'em | Domknięcie fazy na pustym zestawie — bramka, która nie potrafi zawieść |
| 2. Klasy awarii dostawcy | Naprawa dwóch mylących gałęzi + testy sześciu klas | Realny `setTimeout` w ponowieniu; bez fake timers zestaw robi się minutowy |
| 3. Granica kontrakt→zapis | Testy integracyjne trasy: zapis zero razy / dokładnie raz | Zestaw próżniowy, jeśli zabraknie przypadku pozytywnego |
| 4. Domknięcie dziur pustego planu | Migracja + ekstrakcja i naprawa strażników | Nowy `errcode` może przez `toStoreError` dać mylący komunikat |
| 5. Cookbook i status | §6.1/§6.2 wypełnione, §3 i §5 zaktualizowane | Edycja komórki Status przerównuje whitespace całej tabeli |

**Prerequisites:** Docker + `npx supabase start` dla Fazy 4 · `OPENROUTER_API_KEY` tylko do weryfikacji manualnej · **gałąź funkcyjna przed pierwszym commitem** — `git branch --show-current` mówi dziś `master`, a `CLAUDE.md` §Git tego zabrania.
**Estimated effort:** ~3–4 sesje, pięć faz; Fazy 1 i 5 krótkie, Faza 4 najcięższa (schemat + wyspy).

## Open Risks & Assumptions

- **Blokada z adaptera Cloudflare jest rozwiązana, nie założona.** `getViteConfig` wywołane wprost na `astro.config.mjs` **nie działa** — `@cloudflare/vite-plugin` odrzuca `resolve.external` Vitesta i przerywa cały przebieg (`Startup Error`, nie pojedynczy test). Przekazanie `{ adapter: undefined }` też nie pomaga: Astro i tak ładuje konfigurację z dysku. Działa `configFile: "./astro.config.test.mjs"` — zweryfikowane w tej sesji, drzewo cofnięte do czystego.
- **`test` nie istnieje w typie `ViteUserConfig` Astro** (`TS2353`). Naprawia `/// <reference types="vitest/config" />` w pierwszej linii — zweryfikowane.
- **Granica „niepusta" zostawia lukę na partii dwuelementowej.** Nic w kodzie nie potrafi jej wyprodukować (zod trzyma trójkę przed zapisem), a zaostrzenie do trójki zepsułoby istniejący pgTAP. Zapisane jako decyzja z właścicielem — Faza 3 rolloutu — a nie jako przeoczenie.
- **`isDayPlanBody` ma dziś dwie rozjechane kopie**: wersja z `WeekPlanBoard` sprawdza `current_generation`, wersja z `DayPlanEditor` nie. Ekstrakcja przyjmuje ostrzejszą, więc `DayPlanEditor` **zyskuje sprawdzenie, którego nie miał** — zamierzone, ale to zmiana zachowania, nie czysty refaktor.
- **Nowy `errcode` migracji** musi zostać sprawdzony wobec `toStoreError`; nieznany kod Postgresa może wpaść w kategorię dającą mylący komunikat.

## Success Criteria (Summary)

- Czerwony test blokuje merge do `master` — i został **zobaczony na czerwono**, nie założony
- Odpowiedź spoza kontraktu nie zostawia po sobie ani jednego wywołania zapisu; szczęśliwa ścieżka woła go dokładnie raz z trzema aktywnościami
- Nauczyciel przy niepoprawnym body dostawcy czyta „coś poszło nie tak", nie „usługa przeciążona" — i nie płaci za ponowienie, które nie miało jak pomóc
- Pusty plan przestaje być reprezentowalny: baza go odmawia, a wyspy go nie przepuszczają
