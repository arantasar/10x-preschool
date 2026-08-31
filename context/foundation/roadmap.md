---
project: 10xPreschool
version: 1
status: draft
created: 2026-06-27
updated: 2026-08-31
prd_version: 1
main_goal: low-complexity
top_blocker: time
milestone_id: usable-month-plan
milestone_seq: 1
milestone_status: done
---

# Roadmap: 10xPreschool

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-01: Użyteczny plan miesiąca** — Status: done (zamknięty 2026-08-30)

- **Intent:** Nauczyciel prowadzi pełny cykl planowania miesiąca w jednym miejscu: generuje propozycje dla dnia i dla tygodnia, edytuje je i zatwierdza, porządkuje siatkę miesiąca i odczytuje z niej, co jest zaplanowane — bez wychodzenia do zewnętrznych narzędzi.
- **Source materials:** `context/foundation/prd.md` (v1), rozszerzone o pozycje uzgodnione bezpośrednio z użytkownikiem (`S-04`…`S-08`) — patrz Open Roadmap Questions #3.
- **Done when:** każdy `F-NN` i `S-NN` poniżej ma status `done`. **Zmieniony 2026-08-30:** kryterium zostało spełnione po jawnym wypisaniu `S-07` z zakresu kamienia — patrz Zmiana zakresu poniżej. Kamień zamknięty z ośmioma pozycjami `done` z dziewięciu.
- **Zmiana zakresu 2026-08-30 (user):** `S-07` (`month-day-preview`) **wypisany z `M-01` i przeniesiony do `M-02`**. Powód: `S-07` był `ready`, ale jego FR nie istnieje — PRD v1 wyczerpał się na `S-03` (Open Roadmap Questions #3), więc zbudowanie go przed przebiegiem PRD v2 oznaczałoby dopisywanie FR wstecz do gotowego kodu. Zamiast trzymać kamień otwarty na zależności papierowej, zakres został skrócony świadomie. **Koszt jest realny i nazwany:** intent `M-01` mówi „porządkuje siatkę miesiąca **i odczytuje z niej, co jest zaplanowane**" — ten ostatni człon to dokładnie `S-07`, więc kamień zamyka się bez części własnego celu. Alternatywa (odwrócenie kolejności: PRD v2 przed `S-07`, kamień zamknięty w pełni) została rozważona i odrzucona na rzecz czystego konta pod `M-02`.
- **Scope anchors:** FR-001…FR-009, US-01. Adoptowane wstecznie 2026-08-26: roadmapa powstała 2026-06-27, przed wprowadzeniem warstwy kamieni milowych, i została owinięta jako `M-01` bez zmiany treści ani statusów pozycji.

## Vision recap

Nauczyciele przedszkolni raz w miesiącu samodzielnie planują 20–22 dni zajęć — żmudne,
kreatywne zadanie powodujące paraliż decyzyjny. 10xPreschool zamienia krótkie hasło
(np. „Dinozaury") w konkretne, gotowe do użycia propozycje aktywności dla dzieci 3–6 lat
za pomocą LLM — nisza pomijana przez duże platformy EdTech. Rdzeń wartości to jakość
generowania: propozycje muszą być trafne, kompletne i bezpieczne dla małych dzieci.

## North star

**S-01: Nauczyciel loguje się, wybiera dzień, wpisuje hasło i widzi wygenerowaną, bezpieczną propozycję aktywności** — to najmniejszy przepływ, który dowodzi rdzenia hipotezy (czy LLM jest wystarczająco dobry dla tej niszy), więc planujemy go najwcześniej, jak pozwalają zależności.

> Gwiazda przewodnia (north star) = najmniejszy przepływ end-to-end, którego udane
> dostarczenie udowadnia główną hipotezę produktu — umieszczony tak wcześnie, jak
> pozwalają zależności, bo cała reszta ma znaczenie tylko wtedy, gdy ten przepływ działa.

## At a glance

| ID   | Change ID                 | Outcome (user can …)                                               | Prerequisites | PRD refs                                              | Status      |
| ---- | ------------------------- | ------------------------------------------------------------------ | ------------- | ----------------------------------------------------- | ----------- |
| F-01 | plan-persistence-baseline | (foundation) tabela planów z RLS izoluje dane per konto            | —             | Access Control, NFR prywatności                       | done        |
| S-01 | first-day-generation      | zalogować się, wybrać dzień, wpisać hasło i wygenerować propozycję | —             | FR-001, FR-002, FR-004, FR-005, FR-006, FR-007, US-01 | done        |
| S-02 | edit-accept-day-plan      | edytować, zaakceptować i zapisać propozycję dla dnia               | S-01, F-01    | FR-008, FR-009, US-01                                 | done        |
| S-03 | week-generation           | wygenerować propozycje dla całego tygodnia roboczego (US-01)       | S-01, F-01    | FR-004, US-01                                         | done        |
| S-04 | month-home                | wylądować w widoku miesiąca jako ekranie głównym aplikacji         | S-03          | FR-004, US-01                                         | done        |
| S-05 | delete-day-plan           | usunąć zapisany plan dnia z poziomu widoku tego dnia               | S-02, S-03    | Access Control (brak FR — pyt. 3)                     | done        |
| S-06 | sign-out                  | wylogować się z aplikacji z dowolnego ekranu                       | S-04          | FR-003                                                | done        |
| S-07 | month-day-preview         | podejrzeć aktywności dnia bez opuszczania siatki miesiąca          | S-04          | FR-004, US-01 (brak FR — pyt. 3)                      | ready → M-02 |
| S-08 | visible-day-theme         | odróżnić dni jednego hasła po podtytule dnia w miesiącu i w dniu   | S-03, S-04    | FR-004, US-01 (brak FR — pyt. 3)                      | done        |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                                      | Chain                    | Note                                                                                                                                            |
| ------ | ------------------------------------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| A      | Rdzeń generowania                          | `S-01` → `S-03`          | Gwiazda przewodnia najpierw; `S-03` rozszerza generowanie z dnia na tydzień i dołącza do `F-01`.                                                |
| B      | Zapis, zatwierdzanie i porządkowanie planu | `F-01` → `S-02` → `S-05` | `F-01` może iść równolegle do `S-01`; `S-02` dołącza do Stream A przy `S-01`; `S-05` domyka tę samą pętlę od drugiej strony — cofnięcie zapisu. |
| C      | Ekran główny i nawigacja                   | `S-04` → `S-08` → `S-07` | Dołącza do Stream A przy `S-03`, w którym siatka miesiąca powstała jako p6; `S-04` promuje ją na punkt wejścia, `S-08` różnicuje kafelki podtytułem dnia, `S-07` dokłada podgląd aktywności w miejscu. |
| D      | Sesja i konto                              | `S-06`                   | Domknięty 2026-08-26 wewnątrz `S-04`: powłoka, na którą `S-06` czekał, powstała jako jego faza 1 i od razu poniosła kontrolkę wylogowania.      |

## Baseline

What's already in place in the codebase as of `2026-08-26` (auto-researched + user-confirmed;
odświeżone przy dopisaniu S-04…S-07 — pierwotna wersja opisywała stan z `2026-06-27`, sprzed F-01).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6 SSR + React 19 islands, Tailwind 4, shadcn/ui (`src/layouts/Layout.astro`, komponenty auth). Ekrany planowania: `src/pages/plan.astro` (dzień), `src/pages/plan/week.astro` (tydzień), `src/pages/plan/month.astro` + `src/components/plan/MonthGrid.astro` (siatka miesiąca, p6 z S-03).
- **Backend / API:** present — obok auth istnieją trasy domenowe: `src/pages/api/day-plan/{index,generate,accept}.ts`, `day-plan/activity/[id].ts`, `day-plan/week/outline.ts`. Warstwa serwisowa w `src/lib/services/` (generator, kontrakt, HTTP, store, prompty).
- **Data:** present — 7 migracji w `supabase/migrations/`; `day_plans` + `activities` z RLS per operacja/rola, wąskimi grantami kolumnowymi UPDATE i `save_day_plan_generation` jako **jedynym** pisarzem partii aktywności.
- **Auth:** present — klient SSR Supabase (`src/lib/supabase.ts`), middleware z `PROTECTED_ROUTES = ["/plan"]` (`src/middleware.ts`), endpointy + strony signin/signup/signout. Wylogowanie: `POST /api/auth/signout` działa, a widoczny przycisk stoi od `S-04` w powłoce zalogowanej aplikacji (`src/components/AppHeader.astro`), obecnej na `/plan`, `/plan/week` i `/plan/month`. Opis sprzed `S-04` — jedyny przycisk w `Topbar.astro`, czyli na stronie dla **nie**zalogowanych, drugi na `/dashboard` — jest nieaktualny: `/dashboard` został skasowany w `S-04`.
- **Deploy / infra:** present — `wrangler.jsonc`, adapter `@astrojs/cloudflare`, `.github/workflows/ci.yml`. Akcje przed-deployowe wciąż otwarte wg `infrastructure.md` (Workers Paid — zalecane dla zapasu CPU, nie twardy wymóg; flagi kompatybilności). Streaming tras LLM **skreślony z tej listy 2026-08-22**: nie jest mitygacją limitu platformy, tylko decyzją UX — patrz S-01 § Decyzje.
- **Observability:** absent — brak biblioteki logowania / śledzenia błędów w zależnościach.

## Foundations

### F-01: Minimalna warstwa danych z izolacją per konto

- **Outcome:** (foundation) istnieje minimalny schemat przechowywania planów (dzień → hasło, propozycje, stan zaakceptowania) z politykami RLS, które udostępniają wiersze wyłącznie właścicielowi konta.
- **Change ID:** plan-persistence-baseline
- **PRD refs:** Access Control, NFR prywatności
- **Unlocks:** S-02 (edycja/akceptacja/zapis dnia), S-03 (zapis planu tygodnia); realizuje kontrakt prywatności (dane prywatne dla konta, treści niedostępne dla innych użytkowników ani operatorów) wymagany przez oba slice'y zanim trafi do nich jakikolwiek zapis.
- **Prerequisites:** —
- **Parallel with:** S-01 (gwiazda przewodnia wyświetla propozycje efemerycznie, nie wymaga zapisu)
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Sekwencjonowane jako minimalny enabler, nie „cała baza danych" — schemat obejmuje tylko to, czego potrzebują S-02 i S-03. Ryzyko: źle ustawione RLS wycieka plany między kontami (narusza NFR prywatności), dlatego polityki per-operacja są częścią kontraktu foundacji, a nie dodatkiem.
- **Status:** done

## Slices

### S-01: Generowanie propozycji dla jednego dnia (gwiazda przewodnia)

- **Outcome:** Nauczyciel loguje się, wybiera dzień w kalendarzu, wpisuje hasło i otrzymuje wygenerowaną propozycję aktywności (z widocznym postępem operacji, po polsku, z treścią bezpieczną dla dzieci 3–6 lat); może ponownie wygenerować propozycję dla tego dnia.
- **Change ID:** first-day-generation
- **PRD refs:** FR-001, FR-002, FR-004, FR-005, FR-006, FR-007, US-01
- **Prerequisites:** —
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:** — (wszystkie rozstrzygnięte, patrz niżej)
- **Decyzje (2026-08-22, user):**
  - **Guardrail bezpieczeństwa treści — na poziomie promptu.** Bez post-filtra w MVP. Wymóg wieku 3–6 lat i języka polskiego wchodzi do instrukcji systemowej. Świadomie przyjęte ryzyko, nie przeoczenie: nie ma drugiej warstwy, która złapie wpadkę modelu, więc jakość promptu jest jedynym zabezpieczeniem guardrailu, który PRD nazywa nienegocjowalnym. Jeśli akceptacja propozycji będzie niska albo pojawi się treść nieodpowiednia — post-filtr wraca na stół.
  - **Dostawca LLM — OpenRouter.** Model wpisany na sztywno w pierwszej iteracji; lista modeli do wyboru przez użytkownika to możliwe późniejsze rozszerzenie, poza zakresem S-01. Wprowadza nowy sekret (`OPENROUTER_API_KEY`) do `.env.example`, `.dev.vars` i `wrangler secret put` — czyli pierwszy sekret w projekcie poza Supabase.
  - **Streaming NIE jest wymogiem platformy.** Pierwotna niewiadoma („czy 10–30 s wywołanie zmieści się w limicie CPU Workers", `infrastructure.md` Ryzyko 3) opierała się na pomyleniu czasu CPU z czasem ściennym. Dokumentacja Cloudflare: *„Waiting on network requests (such as `fetch()` calls, KV reads, or database queries) does not count toward CPU time"* oraz *„There is no hard limit on duration for HTTP-triggered Workers. As long as the client remains connected, the Worker can continue processing, making subrequests, and streaming a response body."* Oczekiwanie na odpowiedź OpenRoutera to I/O, nie CPU — nie kumuluje się w kierunku limitu. Streaming zostaje **decyzją UX** (roadmapowy wymóg „z widocznym postępem operacji"), a nie mitygacją limitu; prostym MVP jest wywołanie bez streamingu ze wskaźnikiem postępu. ⚠️ `infrastructure.md` (Ryzyko 1, Ryzyko 3, rejestr ryzyk, „Immediate actions") wciąż niesie starą tezę i wymaga korekty.
- **Risk:** To slice o najwyższej wadze — niesie rdzeń hipotezy produktu i jedyną nienegocjowalną inwestycję (bezpieczeństwo + trafność generowania). Auth jest już w baseline, więc zostaje tylko dodać trasy generowania do `PROTECTED_ROUTES`. Sekwencjonowane pierwsze, bo cała reszta roadmapy ma sens tylko, jeśli jakość generowania się broni. Główne zagrożenie: niska trafność/akceptacja propozycji lub treść nieodpowiednia dla wieku — oba widoczne dopiero na realnym wyjściu LLM.
- **Status:** done

### S-02: Edycja, akceptacja i zapis planu dnia

- **Outcome:** Nauczyciel może edytować treść wygenerowanej propozycji, jawnie ją zaakceptować, a zatwierdzony plan dnia zostaje zapisany i jest prywatny dla jego konta.
- **Change ID:** edit-accept-day-plan
- **PRD refs:** FR-008, FR-009, US-01
- **Prerequisites:** S-01, F-01
- **Parallel with:** S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Domyka pętlę „keep" (od propozycji do zatwierdzonego planu) — bez tego generowanie jest demem, nie narzędziem. Sekwencjonowane po S-01 (musi istnieć propozycja do edycji) i F-01 (musi istnieć gdzie zapisać). Zagrożenie minimalne; główny haczyk to spójność stanu „roboczy vs zaakceptowany".
- **Zobowiązania przeniesione z F-01 (przegląd implementacji, F5):** Schemat zamyka drogę *przejęcia* wiersza (kolumny `activities.generation` i `plan_id` są poza grantem UPDATE), ale **nie wymusza poprawności przy INSERT**. Nic w bazie nie sprawdza, że nowo zapisana partia ma `activities.generation = day_plans.current_generation` — polityka INSERT pyta tylko o własność (`auth.uid() = user_id`), a CHECK tylko o `generation >= 1`. Skutek błędu jest cichy: [selectCurrentGeneration](src/lib/day-plans.ts#L14) uczciwie zwróci pustą tablicę, brandowany typ `CurrentActivity` potwierdzi „to jest bieżące", nauczyciel zobaczy pusty plan — bez błędu, wyjątku ani wpisu w logu. To ten sam kształt awarii, dla którego istnieje licznik generacji, tylko przesunięty z odczytu na zapis. S-02 (jako pierwszy zapis do `activities`) musi:
  - zdecydować protokół regeneracji — „podbij `current_generation`, potem wstaw partię" vs „wstaw, potem podbij" — i wykonać go **w jednej transakcji**;
  - wymusić niezmiennik, najlepiej triggerem `BEFORE INSERT` walidującym `new.generation = (select current_generation from day_plans where id = new.plan_id)`, który przy okazji uniemożliwia wariant „wstaw, potem podbij";
  - dotyczy każdego zapisu do `activities`, więc **S-03 (`week-generation`) dziedziczy to samo zobowiązanie**.
- **Status:** done

### S-03: Generowanie dla całego tygodnia roboczego

- **Outcome:** Nauczyciel może wybrać tydzień i wygenerować propozycję dla każdego dnia roboczego, a regeneracja jednego dnia nie wpływa na pozostałe (pełna US-01).
- **Change ID:** week-generation
- **PRD refs:** FR-004, US-01
- **Prerequisites:** S-01, F-01
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:**
  - ~~Czy tydzień to N niezależnych wywołań LLM (per dzień) czy jedno wywołanie wsadowe~~ — **rozstrzygnięte w `context/changes/week-generation/plan.md`**: 1 tanie wywołanie szkicu + 5 niezależnych wywołań dnia, równolegle. Wsadowy zapis odrzucony jawnie (§ What We're NOT Doing) — drugi pisarz oznaczałby drugie miejsce powtarzające protokół licznika generacji. Izolacja regeneracji wychodzi z `unique (user_id, plan_date)`.
  - ~~Jak odróżnić pięć dni od siebie~~ — **rozstrzygnięte tamże**: szkic tygodnia rozkłada hasło na pięć rozłącznych tematów, temat trafia do modelu **i** do kolumny `day_plans.theme`, więc przeżywa regenerację dnia (`coalesce` w upsercie). Dzień tygodnia trafia do promptu na obu ścieżkach — także przy pojedynczym dniu, co domyka F4 z S-01 również dla `/plan?date=` (patrz plan § Addendum 2026-08-26). (źródło: `/10x-impl-review` S-01, F4)
- **Risk:** Rozszerza udowodniony przepływ dzienny na skalę tygodnia — realna jednostka pracy nauczyciela. Sekwencjonowane po S-01 (ten sam mechanizm generowania) i F-01 (zapis wielu dni). Zagrożenie: koszt API i czas operacji rosną liniowo z dniami; przy granulacji per-dzień postęp i regeneracja zostają izolowane zgodnie z AC US-01.
- **Open follow-ups:** `context/changes/week-generation/follow-ups/review-fixes.md` — ekspozycja na hasło wykluczające rośnie wraz ze szkicem tygodnia (właściciel: Janusz, bramka: najbliższa iteracja promptu); hosted project nadal bez migracji.
- **Status:** done

### S-04: Widok miesiąca jako ekran główny

- **Outcome:** Zalogowany nauczyciel po wejściu do aplikacji ląduje w widoku miesiąca i z niego wchodzi w tydzień oraz w pojedynczy dzień — bez osobnego pulpitu jako przystanku.
- **Change ID:** month-home
- **PRD refs:** FR-004, US-01 — samo pojęcie „ekranu głównego" nie ma własnego FR w PRD v1, patrz Open Roadmap Questions #3
- **Prerequisites:** S-03
- **Parallel with:** S-05
- **Blockers:** —
- **Unknowns:**
  - ~~Czy `/dashboard` znika, czy zostaje jako trwałe przekierowanie na `/plan/month` — Owner: Janusz. Block: nie (rozstrzygnięcie należy do `/10x-plan`; zakładki i `PROTECTED_ROUTES` to koszt, nie ryzyko).~~ Rozstrzygnięte 2026-08-26 w planie `S-04`: trasa znika w całości — plik, wpis w `PROTECTED_ROUTES`, linki w interfejsie i wzmianki w `README.md` oraz `CLAUDE.md` — bez przekierowania. Kontrolka wylogowania przeniosła się wcześniej do powłoki (`src/components/AppHeader.astro`), więc kasowanie nie zamyka sesji bez wyjścia. Koszt przyjęty świadomie: zakładki na `/dashboard` przestają działać.
- **Risk:** Ten slice **nie buduje siatki** — ta powstała jako p6 wewnątrz `S-03` (`src/pages/plan/month.astro`, `src/components/plan/MonthGrid.astro`) — tylko przenosi punkt wejścia: `POST /api/auth/signin` przekierowuje dziś na `/`, a `/` renderuje stronę marketingową (`src/pages/index.astro` → `Welcome.astro`). Zagrożenie jest jedno i jest ciche: `/dashboard` trzyma **jedyny w zalogowanej aplikacji** widoczny przycisk wylogowania, a linki „← Wróć do pulpitu" w `src/pages/plan.astro:37` i `src/pages/plan/month.astro:46` celują w niego wprost. Wygaszenie pulpitu przed `S-06` zostawia nauczyciela bez wyjścia z sesji — więc `S-04` albo zachowuje tę kontrolkę do czasu `S-06`, albo przenosi ją razem z nawigacją.
- **Status:** done

### S-05: Usunięcie zapisanego planu dnia

- **Outcome:** Nauczyciel może usunąć zapisany plan wybranego dnia z poziomu widoku tego dnia; wiersz `day_plans` i jego aktywności są usuwane trwale (kasowanie twarde), a dzień wraca do stanu **nieodróżnialnego od dnia nigdy nieplanowanego** — na wszystkich powierzchniach, na których jest pokazywany, i dla generowania tygodnia, które obejmuje go ponownie zamiast pominąć.
- **Change ID:** delete-day-plan
- **PRD refs:** Access Control (ścieżka kasująca jest zapisem wrażliwym na własność) — brak własnego FR w PRD v1, patrz Open Roadmap Questions #3
- **Prerequisites:** S-02, S-03
- **Parallel with:** S-04
- **Blockers:** —
- **Unknowns:**
  - ~~Czy „usunięcie" skreśla cały wiersz `day_plans`, czy tylko bieżącą partię `activities`, zostawiając hasło~~ — **rozstrzygnięte 2026-08-27 w `/10x-plan`: cały wiersz, twardo.** Powody: PRD nie stawia wymogu retencji; produkt nie ma cofania nigdzie indziej (S-02 usunął undo świadomie); skreślenie miękkie zostawiłoby w tabeli dane bez czytelnika i bez właściciela sprzątania — dokładnie to, przed czym ostrzega `lessons.md` („Odroczone sprzątanie danych musi mieć właściciela"). Odwraca to pierwotny Outcome tej pozycji.
- **Risk:** Oba ostrza opisane niżej są ostrzami **skreślenia miękkiego** i zostały **uniknięte przez wybór kształtu**, nie zmitygowane — kasowanie twarde ich nie tworzy. Opis zostaje, bo obie pułapki są prawdziwe i będą prawdziwe dla każdej kolumny dodanej do `day_plans` w przyszłości. **(1) Nowa kolumna nie dziedziczy grantu UPDATE.** `20260720162553_narrow_authenticated_update_columns.sql` zdjął grant tabelaryczny i oddał listę kolumn po nazwie, właśnie po to, żeby kolumnę dodaną później trzeba było rozważyć. Bez `grant update (…)` zapis kończy się `42501`, który `categorize()` w `src/lib/services/day-plan-store.ts` mapuje na config/500 — dokładnie ta pułapka, którą migracja `theme` musiała rozbroić jawnie. Nie powstaje tutaj, bo slice nie dodaje kolumny (ani żadnej migracji). **(2) Skreślony miękko dzień wciąż zajmowałby `unique (user_id, plan_date)`** i wciąż czytałby się jako `v_exists = true` w `save_day_plan_generation`, więc generowanie tygodnia z `p_require_absent` **pominęłoby** dzień, który nauczyciel uważa za pusty — cicho, bez błędu i bez wpisu w logu. Skasowany wiersz nie zajmuje nic: `v_exists` zostaje `null`, `coalesce(v_exists, false)` daje `false`, generacja przechodzi. Ta własność jest asertowana w `supabase/tests/database/day_plan_delete.test.sql`, a nie zakładana. Z tego samego powodu żadna ścieżka odczytu (`readDayPlan`, `readWeekPlans`, `readMonthSummary`) nie wymagała zmiany. **Ryzyko, które faktycznie zajęło ich miejsce, to nieodwracalność.** Kasowanie jest trwałe, obejmuje hasło i wszystkie propozycje, i stoi przed nim wyłącznie dialog potwierdzenia w przeglądarce — nie ma kosza, nie ma „Cofnij", nie ma odmowy po stronie schematu, na którą można by liczyć, gdy dialog zawiedzie.
- **Status:** done

### S-06: Wylogowanie z aplikacji

- **Outcome:** Nauczyciel może wylogować się z aplikacji z dowolnego ekranu, na którym pracuje, a nie tylko ze strony startowej dla niezalogowanych.
- **Change ID:** sign-out
- **PRD refs:** FR-003 (nice-to-have; odparkowane 2026-08-26 — pozycja znika z `## Kandydaci do następnego kamienia (M-02)

> **Sekcja tymczasowa.** Nie należy do schematu roadmapy — `/10x-roadmap` przy
> regeneracji pod `M-02` odtwarza plik z sekcji wymaganych i **tę usunie**. Musi
> zostać skonsumowana przez `/10x-shape` (krok 3 w `next-actions.md`), zanim to
> nastąpi. Runbook o tym przypomina.

Zgłoszone przez użytkownika 2026-08-30 i przetriagowane. **To nie są jeszcze slice'y** —
żaden nie ma FR w PRD v1, a dwa wymagają zmiany PRD, nie dopisania do niego. Kolejność
wejścia: `/10x-shape` (brownfield) → `/10x-prd` (v2, domyka też Open Roadmap Questions #3)
→ `/10x-roadmap` (zamknięcie `M-01`, otwarcie `M-02`). Dopiero wtedy stają się `S-NN`.

| Kandydat | Charakter | Uwaga |
| --- | --- | --- |
| **`S-07` — podgląd aktywności w siatce miesiąca (+ powiększony kafelek)** | UI, **`ready`, decyzje zamknięte** | wypisany z `M-01` 2026-08-30; jedyny kandydat gotowy do planowania od zaraz — pierwszy slice `M-02` |
| Regeneracja tygodnia z zastępowaniem istniejących dni | ścieżka generowania — **najcięższy z paczki** | patrz Decyzje poniżej |
| Cofnięcie akceptacji i usunięcie dnia z poziomu tygodnia | UI + istniejący prymityw | `setAcceptance(…, false)` już istnieje; brakuje powierzchni w tygodniu |
| Blokada edycji zaakceptowanego dnia / tygodnia | maszyna stanów | zawężone 2026-08-30 — patrz Decyzje |
| Układ przycisków w widoku dnia (cofnięcie akceptacji, usunięcie pod przyciskiem generowania) | UI | wchodzi razem z powyższym; osobno oznacza przesuwanie tych samych przycisków dwa razy |
| Wydruk zaakceptowanego tygodnia (dzień na stronę) | nowa funkcja | czysty dodatek, nic nie łamie |

**Decyzje ustalone 2026-08-30 (user) — regeneracja tygodnia:**

- **Zastępowanie obejmuje także dni zaakceptowane.** Nauczyciel, który chce zmienić motyw
  całego tygodnia, nie ma wchodzić w pięć dni po kolei.
- **Potwierdzenie musi być uczciwe** — „zastąpisz 5 dni, w tym 3 zaakceptowane", nie
  generyczne „na pewno?".
- **Blokada „tydzień zaakceptowany" dotyczy edycji przypadkowej** (inline w kafelkach);
  operacje jawne — regeneruj tydzień, cofnij akceptację, usuń dzień — pozostają dostępne.

**Co ta pozycja pociąga za sobą** (do przeniesienia w shape-notes, nie do rozstrzygnięcia tutaj):

1. Dzisiejsza blokada w widoku tygodnia **nie dotyczy akceptacji** — generowanie pomija
   każdy dzień, który ma *jakikolwiek* plan, także roboczy szkic. To nie jest zmiana
   komunikatu, tylko nowa zdolność.
2. Kryterium akceptacji `S-03` („regeneracja jednego dnia nie wpływa na pozostałe")
   wymaga przeformułowania — nowa operacja świadomie rusza pięć dni naraz.
3. Ryzyko #3 w `test-plan.md` §2 zostaje ważne, ale jego kryterium ochrony zmienia się z
   „nigdy nie niszczy" na „nigdy nie niszczy **bez jawnego potwierdzenia**, a po
   potwierdzeniu podmienia komplet". Faza 3 rolloutu (§3) idzie **po** tym slice'ie.
4. Kolejność operacji: stary tydzień nie może zniknąć, zanim nowy nie jest gotowy —
   inaczej awaria dostawcy LLM zostawia pięć pustych dni zamiast pięciu starych.

**Poza paczką `M-02`:**

- **Rodzaje aktywności (plastyczne / muzyczne / ruchowe)** — wymaga **odwrócenia**
  `prd.md` §Non-Goals i pozycji w §Parked poniżej, nie dopisania FR. Osobna sesja
  `/10x-shape` z researchem **dziedzinowym** (typowe aktywności przedszkolne) — to nie
  jest zadanie dla `/10x-research`, który czyta kodebazę. Otwarte w samym pomyśle: wybór
  typu przez nauczyciela vs. nacisk na typ w tygodniu vs. równomierne rozłożenie.
- **Monetyzacja** — własny kamień milowy, nie funkcja. Sekwencjonowana po powyższych, bo
  to one są kandydatami na „za subskrypcją". Wymaga powrotu do `infrastructure.md`.
- **Polska wersja strony głównej** — ✅ **dostarczona 2026-08-30** jako zmiana
  `pl-landing-copy`, poza roadmapą: bez FR i bez wiersza `S-NN`. Zakres wyszedł szerszy niż
  sam landing — objął cały lejek niezalogowanego (powłoka `Layout.astro` z `lang="pl"`,
  strona główna, ekrany logowania, rejestracji i potwierdzenia e-maila). Archiwum:
  `context/archive/2026-08-30-pl-landing-copy/`. Otwarty ogon: angielskie komunikaty błędów
  z Supabase na ekranach auth — follow-up z właścicielem, wejście przy najbliższej zmianie
  w `src/pages/api/auth/*` (`next-actions.md` §Otwarte ogony po Kroku 1).

## Parked`)
- **Prerequisites:** S-04
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Najmniejszy z czwórki i w dużej części już zbudowany: `POST /api/auth/signout` działa (`src/pages/api/auth/signout.ts`), a przycisk istnieje w `src/components/Topbar.astro` — tyle że Topbar renderuje się wyłącznie wewnątrz `Welcome.astro`, czyli na stronie dla **nie**zalogowanych, a drugie wejście stoi na `/dashboard`. Praca jest więc powłoką i umiejscowieniem, nie endpointem. Sekwencjonowany po `S-04`, bo dopiero tam powstaje trwała powłoka zalogowanej aplikacji; odwrotna kolejność znaczyłaby budowanie kontrolki w pulpicie, który `S-04` wygasza. Zagrożenie odwrotne niż zwykle: slice jest na tyle mały, że łatwo go dorzucić „przy okazji" do `S-04` — wtedy FR-003 nigdy nie dostaje własnego wpisu w `## Done`.
- **Status:** done — dostarczone 2026-08-26 wewnątrz `S-04` (`month-home`), faza 1: powłoka `src/components/AppHeader.astro` niesie przycisk „Wyloguj się" na `/plan`, `/plan/week` i `/plan/month`, czyli na każdym ekranie zalogowanej aplikacji. FR-003 skonsumowane tam, nie tutaj; slice nie dostaje własnego change-id ani własnego archiwum. Zagrożenie opisane wyżej — „łatwo go dorzucić przy okazji, wtedy FR-003 nigdy nie dostaje wpisu w `## Done`" — zmaterializowało się co do kształtu; ten wpis jest tym, co je rozbraja.

### S-07: Podgląd aktywności w siatce miesiąca

- **Outcome:** Nauczyciel widzi, co jest zaplanowane na dany dzień, bez opuszczania siatki miesiąca — dziś kafelek pokazuje wyłącznie hasło, nie aktywności.
- **Change ID:** month-day-preview
- **Kamień:** **wypisany z `M-01` 2026-08-30, należy do `M-02`** — patrz §Milestone §Zmiana zakresu. Wiersz zostaje tutaj do czasu, aż `/10x-roadmap` zregeneruje roadmapę pod `M-02` i przeniesie go do nowej dekompozycji.
- **PRD refs:** FR-004, US-01 — sam podgląd nie ma własnego FR w PRD v1, patrz Open Roadmap Questions #3
- **Prerequisites:** S-04
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** — (obie rozstrzygnięte 2026-08-30, patrz Decyzje poniżej)
- **Decyzje ustalone 2026-08-30 (user):**
  - **Wzorzec interakcji: podgląd na `:hover` oraz `:focus-visible`; kliknięcie kafelka otwiera dzień.** Zarzut „hover nie istnieje na dotyku i nie jest osiągalny z klawiatury" zostaje zdjęty nie przez drugie wejście do podglądu, tylko przez uznanie, że **podgląd jest akceleratorem, a nie jedyną drogą do informacji**: na każdym wejściu kliknięcie/Enter otwiera dzień, gdzie widać komplet. Nikt nie traci dostępu do treści — traci skrót. `:focus-visible` domyka lukę klawiatury niskim kosztem, bo kafelek jest już `<a>` i stoi w kolejności tabulacji.
  - **Podgląd jest wyłącznie do odczytu** — żadnej edycji na hoverze.
  - **Dane podglądu dociągane na żądanie (na hover), nie z góry dla całego miesiąca.** Preload (np. bieżącego tygodnia) świadomie odłożony jako możliwa przyszła optymalizacja, nie zakres tego slice'a. Do ugruntowania przez `/10x-research`: opóźnienie na najechaniu, anulowanie żądania przy zejściu z kafelka, pamięć podręczna już pobranych dni.
- **Zakres zawężony przez stan kodu (2026-08-30):** kliknięcie kafelka **już** prowadzi do `/plan?date=` — ta ścieżka istnieje i nie jest budowana od nowa. To, co dziś wygląda jak tooltip, to natywny atrybut `title`; slice go zastępuje. Ucięcie podtytułu to jednolinijkowy `truncate` — kafelek musi dostać więcej wysokości na `theme`, i to jest ta sama zmiana, co pozycja „kafelek mieści cały podtytuł" z listy poprawek z 2026-08-30 (wchodzi tutaj, nie osobno: powiększony kafelek i panel podglądu konkurują o tę samą siatkę siedmiu kolumn).
- **Dług PRD:** `PRD refs` tego slice'a zostają puste do czasu przejścia PRD v2 (Open Roadmap Questions #3). Slice można planować i implementować wcześniej, ale **nie archiwizować z pustą rubryką** — v2 obejmuje `S-04`…`S-08` jednym przebiegiem.
- **Risk:** Jedyny z czwórki naprawdę otwarty — użytkownik nazwał go „do przegadania i poszukania najlepszych pomysłów". Ryzyko nie leży w kodzie, tylko w tym, że hover jako pierwszy pomysł jest wygodny do zbudowania i słaby w użyciu: gęsta siatka 7 kolumn, dotyk bez hovera, klawiatura bez ścieżki. Sekwencjonowany po `S-04`, bo dopiero wtedy siatka jest ekranem, na którym nauczyciel faktycznie spędza czas — wcześniej podgląd optymalizowałby widok, do którego prawie się nie zagląda. Interakcja z `S-05`: dzień skreślony miękko nie może mieć podglądu, więc kolejność `S-05` → `S-07` jest tańsza niż odwrotna. Interakcja z `S-08`: podtytuł dnia zdejmuje z tego slice'a część ciężaru — jeśli kafelek już odróżnia pięć dni jednego hasła, podgląd aktywności przestaje być jedynym sposobem, żeby zobaczyć, czym te dni się różnią, i można go projektować spokojniej. Odblokowany 2026-08-30: rozstrzygnięcie wzorca interakcji zdjęło jedyny blokujący unknown.
- **Status:** ready

### S-08: Widoczny podtytuł dnia

- **Outcome:** Nauczyciel odróżnia od siebie dni jednego hasła bez wchodzenia w każdy z nich — kafelek w siatce miesiąca i nagłówek widoku dnia pokazują podtytuł dnia („Dinozaury — co jadły dinozaury"), a nie pięć razy to samo hasło.
- **Change ID:** visible-day-theme
- **PRD refs:** FR-004, US-01 — czytelność planu miesiąca nie ma własnego FR w PRD v1, patrz Open Roadmap Questions #3
- **Prerequisites:** S-03 (temat dzienny powstaje w szkicu tygodnia i jest zapisywany w wierszu planu), S-04 (siatka miesiąca jest ekranem, na którym problem boli)
- **Parallel with:** S-05
- **Blockers:** —
- **Unknowns:**
  - Co pokazuje kafelek dnia, który tematu nie ma — dzień wygenerowany pojedynczo z `/plan?date=`, bez przejścia przez szkic tygodnia, nigdy go nie dostał. Owner: Janusz. Block: nie — wariant domyślny to zachowanie dzisiejsze (hasło jako jedyna linia); decyzja o kształcie należy do `/10x-plan`.
- **Zakres ustalony 2026-08-26 (user):** slice jest **wyłącznie odczytowy**. Generator i prompty zostają nietknięte — szkic tygodnia już produkuje pięć rozłącznych ujęć hasła i już zapisuje je w wierszu planu; brakuje wyłącznie ich pokazania poza tablicą tygodnia. Dwa rozszerzenia zostały jawnie odrzucone przy wyborze zakresu i **nie wchodzą** do tego slice'a: (1) nadanie tematu dniowi generowanemu pojedynczo — wymagałoby dotknięcia ścieżki generowania dnia i promptu; (2) iteracja jakościowa na promptcie szkicu tygodnia, żeby tematy lepiej czytały się jako podtytuł. Oba pozostają otwarte jako możliwa przyszła pozycja, żadne nie blokuje tego slice'a.
- **Risk:** Najtańsza pozycja w roadmapie i jedyna czysto odczytowa — cała treść już istnieje, więc ryzyko nie leży w generowaniu, tylko w niespójności ekranów. Trzy znane ostrza. **(1) Temat jest nullowalny i to nie jest przypadek brzegowy, tylko normalny stan** — dzień wygenerowany poza tygodniem nigdy tematu nie miał, a dzień, którego generowanie w tygodniu padło, nie ma nawet wiersza (szkic tygodnia świadomie nic nie zapisuje — patrz komentarz projektowy w trasie szkicu). Każda powierzchnia musi mieć zdefiniowane zachowanie dla braku tematu, inaczej kafelek traci linię tekstu, którą dziś ma. **(2) Tablica tygodnia pokazuje temat już dziś** i robi to z dwóch źródeł — z zapisanego planu albo z kopii trzymanej w wyspie — więc nowe powierzchnie muszą pokazywać to samo co ona, a nie własną interpretację; rozjazd między tygodniem a miesiącem byłby gorszy niż dzisiejsze pięć razy „Dinozaury". **(3) To ta sama ścieżka odczytu miesiąca, którą `S-05` będzie musiał nauczyć skreślenia miękkiego, a `S-07` rozszerzyć o aktywności** — trzy slice'y dokładają do jednego zapytania, więc kolejność ma znaczenie. `S-08` idzie pierwszy, bo ustala, co kafelek pokazuje w stanie spoczynku, zanim `S-07` zdecyduje, co pokazuje po interakcji.
- **Status:** done

## Backlog Handoff

| Roadmap ID | Change ID                 | Suggested issue title                                | Ready for `/10x-plan` | Notes                                                           |
| ---------- | ------------------------- | ---------------------------------------------------- | --------------------- | --------------------------------------------------------------- |
| F-01       | plan-persistence-baseline | Minimalny schemat planów + RLS izolacji per konto    | yes                   | Może iść równolegle do S-01                                     |
| S-01       | first-day-generation      | Generowanie propozycji aktywności dla jednego dnia   | yes                   | Gwiazda przewodnia — `/10x-plan first-day-generation`           |
| S-02       | edit-accept-day-plan      | Edycja, akceptacja i zapis planu dnia                | no                    | Czeka na S-01 + F-01                                            |
| S-03       | week-generation           | Generowanie planu dla całego tygodnia roboczego      | no                    | Czeka na S-01 + F-01                                            |
| S-04       | month-home                | Widok miesiąca jako ekran główny aplikacji           | yes                   | `/10x-plan month-home`                                          |
| S-05       | delete-day-plan           | Usunięcie zapisanego planu dnia                      | yes                   | `/10x-plan delete-day-plan`; może iść równolegle do S-04        |
| S-06       | sign-out                  | Wylogowanie dostępne z powłoki zalogowanej aplikacji | —                     | Dostarczone w S-04 (`month-home`, faza 1) — nie planować osobno |
| S-07       | month-day-preview         | Podgląd aktywności dnia w siatce miesiąca            | po PRD v2             | odblokowany 2026-08-30, wypisany z `M-01`; planować jako pierwszy slice `M-02` |
| S-08       | visible-day-theme         | Widoczny podtytuł dnia w miesiącu i w widoku dnia    | yes                   | `/10x-plan visible-day-theme`; może iść równolegle do S-05      |

## Open Roadmap Questions

1. **Reset hasła** — czy MVP wymaga mechanizmu odzyskiwania hasła przez e-mail? Owner: decyzja produktowa. Block: nie (MVP może startować bez, ale nie nadaje się do produkcji bez rozwiązania) — roadmap-wide.
2. **Limit regeneracji** — czy istnieje limit liczby wywołań AI dla jednego użytkownika (koszt API)? Owner: decyzja techniczno-biznesowa. Block: nie dla MVP — gates: S-01, S-03.
3. **Pokrycie w PRD dla S-04…S-07** — PRD v1 wyczerpał się na `S-03`: wszystkie must-have FR (FR-001…FR-009 poza nice-to-have FR-003) są skonsumowane przez F-01…S-03. Usunięcie planu dnia, ekran główny, podgląd aktywności i czytelność podtytułu dnia nie mają własnych FR — roadmapa wyprzedza tu PRD, co jest odwróceniem normalnego kierunku. Owner: Janusz. Block: nie (slice'y da się zaplanować z opisu) — gates: S-04, S-05, S-07, S-08. Domknięcie: `/10x-shape` (brownfield) → `/10x-prd` z nowymi FR w `prd-v2.md` i bumpem `prd_version` we frontmatterze, zanim któryś z tych slice'ów trafi do archiwum z pustą rubryką „PRD refs". **Pytanie pozostaje otwarte po zamknięciu `M-01` (2026-08-30)** — `S-04`, `S-05` i `S-08` są już zarchiwizowane z pustą rubryką, więc dług jest zaciągnięty, nie uniknięty; PRD v2 spłaca go wstecz. `S-07` wyszedł z tej czwórki, bo przeniesiono go do `M-02`, gdzie dostanie FR przed planowaniem.

## Parked

- **Profile grup przedszkolnych** — Why parked: PRD §Non-Goals — plan jest własnością nauczyciela, nie grupy.
- **Dane o dzieciach (imiona, potrzeby, alergie)** — Why parked: PRD §Non-Goals — poza zakresem MVP.
- **Generowanie materiałów dodatkowych (karty pracy, grafiki, audio)** — Why parked: PRD §Non-Goals — MVP proponuje tylko tytuł i opis aktywności.
- **Filtrowanie po typach zajęć (plastyczne/muzyczne/ruchowe)** — Why parked: PRD §Non-Goals — AI decyduje o formie aktywności na podstawie hasła.

## Milestone History

(Append-only. Przenoszone verbatim do roadmapy każdego kolejnego kamienia.)

- **M-01: Użyteczny plan miesiąca** (`usable-month-plan`) — closed 2026-08-30. Nauczyciel prowadzi pełny cykl planowania miesiąca w jednym miejscu: generuje dzień i tydzień, edytuje, akceptuje, usuwa i odróżnia dni po podtytule.
  - **Zamknięty z niepełnym zakresem.** `S-07` (`month-day-preview`, podgląd aktywności w siatce miesiąca) został 2026-08-30 jawnie wypisany z kamienia i przeniesiony do `M-02`. Kamień zamknął się więc **bez odczytu aktywności z siatki**, mimo że ten człon stoi wprost w jego intencie.
  - **Dlaczego mimo to zamknięty:** `S-07` był `ready`, ale bez własnego FR (PRD v1 wyczerpał się na `S-03` — Open Roadmap Questions #3). Zbudowanie go przed PRD v2 oznaczałoby dopisywanie wymagania wstecz do gotowego kodu; trzymanie kamienia otwartego oznaczałoby blokowanie go zależnością papierową. Wybrano trzecią drogę: skrócić zakres świadomie i wejść w `M-02` z czystym kontem.
  - **Dług przeniesiony dalej:** `S-04`, `S-05` i `S-08` są zarchiwizowane z pustą rubryką „PRD refs". PRD v2 spłaca to wstecz.

## Done

- **F-01: (foundation) istnieje minimalny schemat przechowywania planów (dzień → hasło, propozycje, stan zaakceptowania) z politykami RLS, które udostępniają wiersze wyłącznie właścicielowi konta.** — Archived 2026-08-22 → `context/archive/2026-07-18-plan-persistence-baseline/`. Lesson: —.
- **S-01: Nauczyciel loguje się, wybiera dzień w kalendarzu, wpisuje hasło i otrzymuje wygenerowaną propozycję aktywności (z widocznym postępem operacji, po polsku, z treścią bezpieczną dla dzieci 3–6 lat); może ponownie wygenerować propozycję dla tego dnia.** — Archived 2026-08-22 → `context/archive/2026-08-22-first-day-generation/`. Lesson: —.
- **S-02: Nauczyciel może edytować treść wygenerowanej propozycji, jawnie ją zaakceptować, a zatwierdzony plan dnia zostaje zapisany i jest prywatny dla jego konta.** — Archived 2026-08-23 → `context/archive/2026-08-23-edit-accept-day-plan/`. Lesson: —.
- **S-03: Nauczyciel może wybrać tydzień i wygenerować propozycję dla każdego dnia roboczego, a regeneracja jednego dnia nie wpływa na pozostałe (pełna US-01).** — Archived 2026-08-26 → `context/archive/2026-08-23-week-generation/`. Lesson: —.
- **S-06: Nauczyciel może wylogować się z aplikacji z dowolnego ekranu, na którym pracuje, a nie tylko ze strony startowej dla niezalogowanych (FR-003).** — Delivered 2026-08-26 wewnątrz `S-04` (`month-home`, faza 1: `src/components/AppHeader.astro`); bez własnego change-id i bez własnego archiwum. Lesson: —.
- **S-04: Zalogowany nauczyciel po wejściu do aplikacji ląduje w widoku miesiąca i z niego wchodzi w tydzień oraz w pojedynczy dzień — bez osobnego pulpitu jako przystanku.** — Archived 2026-08-26 → `context/archive/2026-08-26-month-home/`. Lesson: —.
- **S-08: Nauczyciel odróżnia od siebie dni jednego hasła bez wchodzenia w każdy z nich — kafelek w siatce miesiąca i nagłówek widoku dnia pokazują podtytuł dnia („Dinozaury — co jadły dinozaury"), a nie pięć razy to samo hasło.** — Archived 2026-08-27 → `context/archive/2026-08-27-visible-day-theme/`. Lesson: „Kryterium weryfikacji musi móc nie przejść".
- **S-05: Nauczyciel może usunąć zapisany plan wybranego dnia z poziomu widoku tego dnia; wiersz `day_plans` i jego aktywności są usuwane trwale (kasowanie twarde), a dzień wraca do stanu **nieodróżnialnego od dnia nigdy nieplanowanego** — na wszystkich powierzchniach, na których jest pokazywany, i dla generowania tygodnia, które obejmuje go ponownie zamiast pominąć.** — Archived 2026-08-29 → `context/archive/2026-08-27-delete-day-plan/`. Lesson: „Kryterium »poza X nietknięte« musi być odporne na przerównanie".
