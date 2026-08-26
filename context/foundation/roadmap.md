---
project: 10xPreschool
version: 1
status: draft
created: 2026-06-27
updated: 2026-08-26
prd_version: 1
main_goal: low-complexity
top_blocker: time
---

# Roadmap: 10xPreschool

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

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
| S-04 | month-home                | wylądować w widoku miesiąca jako ekranie głównym aplikacji         | S-03          | FR-004, US-01                                         | in-progress |
| S-05 | delete-day-plan           | usunąć zapisany plan dnia z poziomu widoku tego dnia               | S-02, S-03    | Access Control (brak FR — pyt. 3)                     | ready       |
| S-06 | sign-out                  | wylogować się z aplikacji z dowolnego ekranu                       | S-04          | FR-003                                                | done        |
| S-07 | month-day-preview         | podejrzeć aktywności dnia bez opuszczania siatki miesiąca          | S-04          | FR-004, US-01 (brak FR — pyt. 3)                      | blocked     |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                                      | Chain                    | Note                                                                                                                                            |
| ------ | ------------------------------------------ | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| A      | Rdzeń generowania                          | `S-01` → `S-03`          | Gwiazda przewodnia najpierw; `S-03` rozszerza generowanie z dnia na tydzień i dołącza do `F-01`.                                                |
| B      | Zapis, zatwierdzanie i porządkowanie planu | `F-01` → `S-02` → `S-05` | `F-01` może iść równolegle do `S-01`; `S-02` dołącza do Stream A przy `S-01`; `S-05` domyka tę samą pętlę od drugiej strony — cofnięcie zapisu. |
| C      | Ekran główny i nawigacja                   | `S-03` → `S-04` → `S-07` | Siatka miesiąca powstała jako p6 wewnątrz `S-03`; `S-04` promuje ją na punkt wejścia, `S-07` dokłada podgląd dnia w miejscu.                    |
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
- **Status:** in-progress

### S-05: Usunięcie zapisanego planu dnia

- **Outcome:** Nauczyciel może usunąć zapisany plan wybranego dnia z poziomu widoku tego dnia; dzień wraca do stanu „brak planu" wszędzie, gdzie jest pokazywany, a dane pozostają w bazie (skreślenie miękkie).
- **Change ID:** delete-day-plan
- **PRD refs:** Access Control (ścieżka kasująca jest zapisem wrażliwym na własność) — brak własnego FR w PRD v1, patrz Open Roadmap Questions #3
- **Prerequisites:** S-02, S-03
- **Parallel with:** S-04
- **Blockers:** —
- **Unknowns:**
  - Czy „usunięcie" skreśla cały wiersz `day_plans`, czy tylko bieżącą partię `activities`, zostawiając hasło — Owner: Janusz. Block: nie — decyzja dla `/10x-plan`, ale rozstrzyga kształt kolumny i wszystkich ścieżek odczytu.
- **Risk:** „Dane w bazie nie muszą być usuwane" oznacza skreślenie miękkie, a to w tym schemacie ma dwa znane ostrza — oba już raz zadziałały. **(1) Nowa kolumna nie dziedziczy grantu UPDATE.** `20260720162553_narrow_authenticated_update_columns.sql` zdjął grant tabelaryczny i oddał listę kolumn po nazwie, właśnie po to, żeby kolumnę dodaną później trzeba było rozważyć. Bez `grant update (…)` zapis kończy się `42501`, który `categorize()` w `src/lib/services/day-plan-store.ts` mapuje na config/500 — dokładnie ta pułapka, którą migracja `theme` musiała rozbroić jawnie. **(2) Skreślony miękko dzień wciąż zajmuje `unique (user_id, plan_date)`** i wciąż czyta się jako `v_exists = true` w `save_day_plan_generation`, więc generowanie tygodnia z `p_require_absent` **pominęłoby** dzień, który nauczyciel uważa za pusty — cicho, bez błędu i bez wpisu w logu. To ten sam kształt awarii, dla którego istnieje licznik generacji. Każda ścieżka odczytu (`readDayPlan`, `readMonthSummary`, `selectCurrentGeneration`) musi nauczyć się skreślenia w tym samym slice'ie, inaczej dzień „usunięty" wraca w siatce miesiąca.
- **Status:** ready

### S-06: Wylogowanie z aplikacji

- **Outcome:** Nauczyciel może wylogować się z aplikacji z dowolnego ekranu, na którym pracuje, a nie tylko ze strony startowej dla niezalogowanych.
- **Change ID:** sign-out
- **PRD refs:** FR-003 (nice-to-have; odparkowane 2026-08-26 — pozycja znika z `## Parked`)
- **Prerequisites:** S-04
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Najmniejszy z czwórki i w dużej części już zbudowany: `POST /api/auth/signout` działa (`src/pages/api/auth/signout.ts`), a przycisk istnieje w `src/components/Topbar.astro` — tyle że Topbar renderuje się wyłącznie wewnątrz `Welcome.astro`, czyli na stronie dla **nie**zalogowanych, a drugie wejście stoi na `/dashboard`. Praca jest więc powłoką i umiejscowieniem, nie endpointem. Sekwencjonowany po `S-04`, bo dopiero tam powstaje trwała powłoka zalogowanej aplikacji; odwrotna kolejność znaczyłaby budowanie kontrolki w pulpicie, który `S-04` wygasza. Zagrożenie odwrotne niż zwykle: slice jest na tyle mały, że łatwo go dorzucić „przy okazji" do `S-04` — wtedy FR-003 nigdy nie dostaje własnego wpisu w `## Done`.
- **Status:** done — dostarczone 2026-08-26 wewnątrz `S-04` (`month-home`), faza 1: powłoka `src/components/AppHeader.astro` niesie przycisk „Wyloguj się" na `/plan`, `/plan/week` i `/plan/month`, czyli na każdym ekranie zalogowanej aplikacji. FR-003 skonsumowane tam, nie tutaj; slice nie dostaje własnego change-id ani własnego archiwum. Zagrożenie opisane wyżej — „łatwo go dorzucić przy okazji, wtedy FR-003 nigdy nie dostaje wpisu w `## Done`" — zmaterializowało się co do kształtu; ten wpis jest tym, co je rozbraja.

### S-07: Podgląd aktywności w siatce miesiąca

- **Outcome:** Nauczyciel widzi, co jest zaplanowane na dany dzień, bez opuszczania siatki miesiąca — dziś kafelek pokazuje wyłącznie hasło, nie aktywności.
- **Change ID:** month-day-preview
- **PRD refs:** FR-004, US-01 — sam podgląd nie ma własnego FR w PRD v1, patrz Open Roadmap Questions #3
- **Prerequisites:** S-04
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Wzorzec interakcji — hover, kliknięcie, rozwinięcie wiersza tygodnia, panel boczny? — Owner: Janusz. Block: **tak**, bez tego slice nie ma kształtu. Sam hover nie wystarczy jako jedyna ścieżka: nie istnieje na dotyku i nie jest osiągalny z klawiatury, więc cokolwiek zostanie wybrane, potrzebuje drugiego wejścia.
  - Skąd biorą się dane podglądu — Owner: TBD. Block: nie. `readMonthSummary` (`src/lib/services/day-plan-store.ts`) czyta dziś trzy kolumny `day_plans` dla ~42 dni; podgląd aktywności to dołożenie `activities` bieżącej generacji dla całego zakresu — odczyt z góry vs. dociąganie na żądanie.
- **Risk:** Jedyny z czwórki naprawdę otwarty — użytkownik nazwał go „do przegadania i poszukania najlepszych pomysłów". Ryzyko nie leży w kodzie, tylko w tym, że hover jako pierwszy pomysł jest wygodny do zbudowania i słaby w użyciu: gęsta siatka 7 kolumn, dotyk bez hovera, klawiatura bez ścieżki. Sekwencjonowany po `S-04`, bo dopiero wtedy siatka jest ekranem, na którym nauczyciel faktycznie spędza czas — wcześniej podgląd optymalizowałby widok, do którego prawie się nie zagląda. Interakcja z `S-05`: dzień skreślony miękko nie może mieć podglądu, więc kolejność `S-05` → `S-07` jest tańsza niż odwrotna.
- **Status:** blocked

## Backlog Handoff

| Roadmap ID | Change ID                 | Suggested issue title                                | Ready for `/10x-plan` | Notes                                                           |
| ---------- | ------------------------- | ---------------------------------------------------- | --------------------- | --------------------------------------------------------------- |
| F-01       | plan-persistence-baseline | Minimalny schemat planów + RLS izolacji per konto    | yes                   | Może iść równolegle do S-01                                     |
| S-01       | first-day-generation      | Generowanie propozycji aktywności dla jednego dnia   | yes                   | Gwiazda przewodnia — `/10x-plan first-day-generation`           |
| S-02       | edit-accept-day-plan      | Edycja, akceptacja i zapis planu dnia                | no                    | Czeka na S-01 + F-01                                            |
| S-03       | week-generation           | Generowanie planu dla całego tygodnia roboczego      | no                    | Czeka na S-01 + F-01                                            |
| S-04       | month-home                | Widok miesiąca jako ekran główny aplikacji           | yes                   | `/10x-plan month-home`                                          |
| S-05       | delete-day-plan           | Usunięcie zapisanego planu dnia (skreślenie miękkie) | yes                   | `/10x-plan delete-day-plan`; może iść równolegle do S-04        |
| S-06       | sign-out                  | Wylogowanie dostępne z powłoki zalogowanej aplikacji | —                     | Dostarczone w S-04 (`month-home`, faza 1) — nie planować osobno |
| S-07       | month-day-preview         | Podgląd aktywności dnia w siatce miesiąca            | no                    | Czeka na S-04 + rozstrzygnięcie wzorca interakcji               |

## Open Roadmap Questions

1. **Reset hasła** — czy MVP wymaga mechanizmu odzyskiwania hasła przez e-mail? Owner: decyzja produktowa. Block: nie (MVP może startować bez, ale nie nadaje się do produkcji bez rozwiązania) — roadmap-wide.
2. **Limit regeneracji** — czy istnieje limit liczby wywołań AI dla jednego użytkownika (koszt API)? Owner: decyzja techniczno-biznesowa. Block: nie dla MVP — gates: S-01, S-03.
3. **Pokrycie w PRD dla S-04…S-07** — PRD v1 wyczerpał się na `S-03`: wszystkie must-have FR (FR-001…FR-009 poza nice-to-have FR-003) są skonsumowane przez F-01…S-03. Usunięcie planu dnia, ekran główny i podgląd aktywności nie mają własnych FR — roadmapa wyprzedza tu PRD, co jest odwróceniem normalnego kierunku. Owner: Janusz. Block: nie (slice'y da się zaplanować z opisu) — gates: S-04, S-05, S-07. Domknięcie: `/10x-shape` (brownfield) → `/10x-prd` z nowymi FR w `prd-v2.md` i bumpem `prd_version` we frontmatterze, zanim któryś z tych slice'ów trafi do archiwum z pustą rubryką „PRD refs".

## Parked

- **Profile grup przedszkolnych** — Why parked: PRD §Non-Goals — plan jest własnością nauczyciela, nie grupy.
- **Dane o dzieciach (imiona, potrzeby, alergie)** — Why parked: PRD §Non-Goals — poza zakresem MVP.
- **Generowanie materiałów dodatkowych (karty pracy, grafiki, audio)** — Why parked: PRD §Non-Goals — MVP proponuje tylko tytuł i opis aktywności.
- **Filtrowanie po typach zajęć (plastyczne/muzyczne/ruchowe)** — Why parked: PRD §Non-Goals — AI decyduje o formie aktywności na podstawie hasła.

## Done

- **F-01: (foundation) istnieje minimalny schemat przechowywania planów (dzień → hasło, propozycje, stan zaakceptowania) z politykami RLS, które udostępniają wiersze wyłącznie właścicielowi konta.** — Archived 2026-08-22 → `context/archive/2026-07-18-plan-persistence-baseline/`. Lesson: —.
- **S-01: Nauczyciel loguje się, wybiera dzień w kalendarzu, wpisuje hasło i otrzymuje wygenerowaną propozycję aktywności (z widocznym postępem operacji, po polsku, z treścią bezpieczną dla dzieci 3–6 lat); może ponownie wygenerować propozycję dla tego dnia.** — Archived 2026-08-22 → `context/archive/2026-08-22-first-day-generation/`. Lesson: —.
- **S-02: Nauczyciel może edytować treść wygenerowanej propozycji, jawnie ją zaakceptować, a zatwierdzony plan dnia zostaje zapisany i jest prywatny dla jego konta.** — Archived 2026-08-23 → `context/archive/2026-08-23-edit-accept-day-plan/`. Lesson: —.
- **S-03: Nauczyciel może wybrać tydzień i wygenerować propozycję dla każdego dnia roboczego, a regeneracja jednego dnia nie wpływa na pozostałe (pełna US-01).** — Archived 2026-08-26 → `context/archive/2026-08-23-week-generation/`. Lesson: —.
- **S-06: Nauczyciel może wylogować się z aplikacji z dowolnego ekranu, na którym pracuje, a nie tylko ze strony startowej dla niezalogowanych (FR-003).** — Delivered 2026-08-26 wewnątrz `S-04` (`month-home`, faza 1: `src/components/AppHeader.astro`); bez własnego change-id i bez własnego archiwum. Lesson: —.
