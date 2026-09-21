---
project: 10xPreschool
version: 2
status: draft
created: 2026-09-19
updated: 2026-09-21
prd_version: 2
main_goal: quality
top_blocker: decisions
milestone_id: manageable-month-plan
milestone_seq: 2
milestone_status: active
---

# Roadmap: 10xPreschool

> Derived from `context/foundation/prd-v2.md` (v2) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-02: Plan, którym da się zarządzać** — Status: active (otwarty 2026-09-19)

- **Intent:** Nauczyciel, który ma już zbudowany plan, potrafi go **poprawić, odczytać i wynieść poza aplikację**, nie wychodząc z widoku, w którym pracuje: regeneruje tydzień z zastępowaniem, cofa akceptację i usuwa dzień z poziomu tygodnia, ogląda aktywności wprost w siatce miesiąca i drukuje zaakceptowany tydzień.
- **Source materials:** `context/foundation/prd-v2.md` (v2), poprzedzone `shape-notes.md` (runda Sokratejska, 2026-09-19). Wszystkie pozycje mają własne FR — w odróżnieniu od `S-04`…`S-08` z `M-01`.
- **Done when:** każdy `S-NN` poniżej ma status `done`, **z jawnym wyjątkiem `S-10`** (`FR-013`, jedyny nice-to-have paczki). PRD §Scope of Change stwierdza wprost: „Kamień domyka się bez niego". `S-10` jest zaworem bezpieczeństwa, nie warunkiem zamknięcia.
- **Scope anchors:** FR-010…FR-017, FR-019, FR-020 (numer FR-018 celowo pusty — patrz PRD §Scope of Change); US-02, US-03.
- **Czego ten kamień nie robi:** nie spłaca długu PRD za `S-04`, `S-05` i `S-08`. Decyzja użytkownika 2026-09-19 — PRD v2 obejmuje wyłącznie `M-02`. Patrz Open Roadmap Questions #3; **nie wpisuj tu obietnicy spłaty** (Open Roadmap Questions #7 istnieje po to, żeby ta obietnica nie wróciła przy kolejnej regeneracji).

## Vision recap

10xPreschool zamienia krótkie hasło nauczyciela przedszkolnego (np. „Dinozaury") w konkretne,
gotowe do użycia propozycje aktywności dla dzieci 3–6 lat. `M-01` dowiózł **budowanie** planu:
nauczyciel składa miesiąc od zera. Czego nie dowiózł, to posługiwania się tym, co zbudował —
ból rozkłada się równomiernie na trzy osie i to jest ustalenie użytkownika, nie uproszczenie:
plan jest trudny do poprawienia (zmiana motywu tygodnia to pięć osobnych operacji), trudny do
odczytania (kafelek miesiąca pokazuje hasło i ucięty podtytuł) i nie wychodzi z aplikacji
(brak wydruku). `M-02` zamienia użytkownika, który plan **buduje**, w użytkownika, który
planem **zarządza**. Persona się nie zmienia, nowych użytkowników nie ma, a dla konta pustego
nie zmienia się nic.

## North star

**S-09: Nauczyciel generuje tydzień na nowo, zastępując istniejące dni niezaakceptowane, po potwierdzeniu podającym ich liczbę** — bo na tej pozycji stoi cała oś „poprawialności" z §Kryteria sukcesu Primary, i to ona pierwsza wystawia najtrudniejsze ryzyko paczki: operację ruszającą pięć dni naraz w systemie, który dotąd pisał jeden dzień na raz.

> **Gwiazda przewodnia** to najmniejsza pozycja dowożąca wartość od końca do końca, której
> udane wdrożenie dowodzi, że cały kamień ma sens — dlatego planuje się ją tak wcześnie, jak
> pozwalają zależności, a nie wtedy, gdy wypadnie po kolei. Reszta pozycji ma znaczenie tylko
> wtedy, gdy ta zadziała.

## At a glance

Tabela jest uporządkowana **rekomendowaną kolejnością planowania**, nie numerem ID — numery
`S-07` i `S-08` pochodzą z `M-01` i nie są przenumerowywane, żeby odwołania w `next-actions.md`,
`test-plan.md` i archiwum nie zaczęły wskazywać na co innego. Pierwszy nowy numer to `S-09`.

| ID    | Change ID                 | Outcome (user can …)                                                                        | Prerequisites        | PRD refs             | Status   |
| ----- | ------------------------- | ------------------------------------------------------------------------------------------- | -------------------- | -------------------- | -------- |
| S-09  | week-regeneration-replace | wygenerować tydzień na nowo, zastępując dni niezaakceptowane, po uczciwym potwierdzeniu     | S-03 (done, M-01)    | FR-012, FR-014, US-02 | done     |
| S-12  | edit-unaccepts-day        | poprawić treść dnia zaakceptowanego po potwierdzeniu, które zdejmuje akceptację             | S-02 (done, M-01)    | FR-017               | done     |
| S-11  | week-level-plan-controls  | cofnąć akceptację i usunąć zapisany plan dnia z poziomu widoku tygodnia                     | S-05 (done, M-01)    | FR-015, FR-016       | ready    |
| S-07  | month-day-preview         | podejrzeć aktywności dnia bez opuszczania siatki miesiąca, na nieuciętym kafelku            | S-08 (done, M-01)    | FR-010, FR-011, US-03 | ready    |
| S-13  | week-print                | wydrukować tydzień czytelny na papierze, ze szkicami roboczymi oznaczonymi                  | S-02 (done, M-01)    | FR-019, FR-020, US-02 | ready    |
| S-10  | accepted-day-replacement  | rozszerzyć zastępowanie tygodnia na dni zaakceptowane                                       | S-09, S-12           | FR-013               | proposed |

**Pięć z sześciu pozycji jest `ready` i wzajemnie równoległych.** To nie jest hojność
w liczeniu — wszystkie zależności `M-02` poza `S-10` są już `done` w `M-01`, więc kolejność
w tej tabeli jest **preferencją wynikającą z celu `quality`**, a nie przymusem grafu.
Jedyna twarda krawędź w całym kamieniu to `S-09` + `S-12` → `S-10`.

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                                 | Chain                        | Note                                                                                                                                                  |
| ------ | ------------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| A      | Zastępowanie i ochrona pracy gotowej  | `S-09` → `S-12` → `S-10`     | Jedyny łańcuch z prawdziwymi krawędziami. Gwiazda przewodnia otwiera go, reguła „jawność proporcjonalna do skutku" go domyka, zawór bezpieczeństwa zamyka. |
| B      | Zarządzanie planem z poziomu tygodnia | `S-11`                       | Samodzielny — oba prymitywy (`setAcceptance`, `deleteDayPlan`) istnieją; brakuje wyłącznie powierzchni w tygodniu.                                     |
| C      | Czytelność siatki miesiąca            | `S-07`                       | Samodzielny i jedyny z decyzjami zamkniętymi już 2026-08-30; przy celu `quality` ustępuje pozycjom ochronnym, ale można go wziąć równolegle o dowolnej porze. |
| D      | Wyjście planu poza aplikację          | `S-13`                       | Samodzielny; niesie jedyne kryterium Secondary i jedyne żywe pytanie otwarte paczki (układ wydruku).                                                   |

## Baseline

What's already in place in the codebase as of `2026-09-19` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6 SSR + React 19 (wyspy), Tailwind 4, shadcn/ui. Trzy ekrany planowania stoją: `src/pages/plan.astro` (dzień), `src/pages/plan/week.astro` (tydzień), `src/pages/plan/month.astro` + `src/components/plan/MonthGrid.astro` (miesiąc). Kafelek miesiąca dziś: natywny atrybut `title` plus `truncate` na haśle i na podtytule (`MonthGrid.astro:126-129`), kliknięcie prowadzi do `/plan?date=`.
- **Backend / API:** present — `src/pages/api/day-plan/{index,generate,accept}.ts`, `day-plan/activity/[id].ts`, `day-plan/week/outline.ts`; warstwa serwisowa w `src/lib/services/` (generator, kontrakt, HTTP, store, prompty, bramka bezpieczeństwa treści).
- **Data:** present — 8 migracji w `supabase/migrations/`; `day_plans` + `activities` z RLS per operacja i rola, wąskimi grantami kolumnowymi UPDATE i `save_day_plan_generation` jako **jedynym** pisarzem partii aktywności. Potwierdzenie podmiany istnieje już na poziomie **jednego** dnia (`20260823193447_confirm_replacing_accepted_plan.sql`).
- **Auth:** present — klient SSR Supabase (`src/lib/supabase.ts`), middleware z `PROTECTED_ROUTES = ["/plan"]`, endpointy i strony signin/signup/signout, wylogowanie w powłoce (`AppHeader.astro`).
- **Deploy / infra:** present — `wrangler.jsonc`, adapter `@astrojs/cloudflare`, `.github/workflows/ci.yml`. Wdrożenie produkcyjne stoi **poza repo** (Cloudflare Workers Builds): merge do gałęzi głównej jest wydaniem, bez kroku zatwierdzenia.
- **Observability:** absent — brak biblioteki logowania i śledzenia błędów w zależnościach. **Świadomie nieawansowana** mimo celu `quality`: żadne FR v2 jej nie implikuje.
- **Warstwa testów** (nie jest jedną z sześciu sondowanych warstw, ale rozstrzyga o kolejności — patrz PRD §Constraints): present — vitest jednostkowy, bramka bezpieczeństwa treści na żywych wywołaniach LLM (`npm run test:gate`), Playwright na gałęzi głównej od 2026-09-05 (`tests/e2e/`: 4 specy + `auth.setup.ts` + `support/`).
- **Wydruk:** absent — zero `@media print` i zero utility `print:` w całym `src/`. `S-13` startuje od pustej powierzchni, nie od poprawiania istniejącego arkusza.

## Foundations

**Brak. `M-02` nie otwiera żadnego `F-NN` i to jest ustalenie, nie luka.**

Fundament to prerekwizyt przekrojowy bez własnego efektu widocznego dla użytkownika, który
odblokowuje nazwane pozycje pionowe. W `M-02` żaden kandydat nie przechodzi tego testu:

- **Warstwa danych, API, auth, wdrożenia:** `present` w §Baseline. `M-01` potrzebował `F-01`,
  bo zapisu planów nie było wcale; `M-02` buduje na warstwie kompletnej.
- **Kontrakt zapisu „pięć dni jako komplet"** (`save_day_plan_generation` umie dziś jeden
  dzień) — najpoważniejszy kandydat i **świadomie złożony do `S-09`**, nie wyniesiony przed
  nawias. Nie jest przekrojowy: `S-11`, `S-12`, `S-13` go nie potrzebują, a `S-10` dociera do
  niego przez `S-09`. Wyniesienie go na `F-NN` dałoby fundament obsługujący jedną pozycję —
  czyli pracę poziomą pod inną nazwą.
- **Observability:** żadne FR v2 jej nie wymaga (patrz §Baseline).
- **Migracja schematu:** PRD §Constraints stwierdza, że żadne FR nie wymaga wprost zmiany
  schematu. Warunkowa pułapka grantów kolumnowych jest ostrzeżeniem dla slice'a, który
  ewentualnie doda pole — nie fundamentem.

## Slices

### S-09: Regeneracja tygodnia z zastępowaniem dni niezaakceptowanych (gwiazda przewodnia)

- **Outcome:** Nauczyciel może wygenerować tydzień na nowo pod nowym hasłem i dostać komplet nowych dni w miejsce dotychczasowych dni niezaakceptowanych — po potwierdzeniu, które uczciwie podaje, ile dni zostanie zastąpionych i ile z nich jest zaakceptowanych.
- **Change ID:** week-regeneration-replace
- **PRD refs:** FR-012, FR-014, US-02; §Kryteria sukcesu Primary; Guardrails #2 i #3; §Warunki jakościowe zmiany („Nieukończone zastąpienie tygodnia nie zostawia śladu")
- **Prerequisites:** S-03 (done, M-01 — generowanie tygodnia istnieje i jest tym, co ta pozycja zmienia)
- **Parallel with:** S-07, S-11, S-12, S-13
- **Blockers:** —
- **Unknowns:**
  - Czy zastępowanie obejmuje dni zaakceptowane — **rozstrzygnięte w PRD, nie tutaj**: nie obejmuje, dopóki nauczyciel nie rozszerzy operacji jawnie (`S-10`, FR-013, nice-to-have). Owner: rozstrzygnięte. Block: nie.
  - Limit regeneracji — ta operacja mnoży wywołania generowania przez pięć na jedno kliknięcie i czyni je łatwiejszymi do powtórzenia. Owner: decyzja techniczno-biznesowa. Block: nie (patrz Open Roadmap Questions #5).
- **Risk:** Pierwsza w kolejności, bo jest gwiazdą przewodnią i bo cel `quality` nie pozwala odkładać pozycji ryzykownej za wygodne. Trzy ostrza. **(1)** Dzisiejsza polityka pominięcia jest w kodzie (`WeekPlanBoard.tsx:104-117` — 409 na zajętym dniu daje `status: "skipped"`), a pomija **każdy** dzień z jakimkolwiek planem, także roboczy szkic — więc to nowa zdolność, nie zmiana komunikatu. **(2)** Kolejność operacji jest warunkiem, nie preferencją: stary tydzień nie może zniknąć, zanim nowy nie jest gotowy, inaczej awaria dostawcy LLM zostawia pięć pustych dni zamiast pięciu starych. **(3)** Guardrail #3 (spójność zapisanej partii) dziedziczy się tu po raz pierwszy na pięciu dniach naraz — `save_day_plan_generation` jest dziś jedynym pisarzem partii i umie jeden dzień. Kryterium akceptacji `S-03` („regeneracja jednego dnia nie wpływa na pozostałe") wymaga przeformułowania: ta operacja rusza pięć dni świadomie. **Następstwo dla rolloutu testów:** Faza 3 (`test-plan.md`) idzie **po** tej pozycji — wcześniej zabetonowałaby w asercjach semantykę „nigdy nie niszczy", którą FR-012 celowo zastępuje semantyką „nigdy bez jawnego potwierdzenia".
- **Status:** done

### S-12: Edycja dnia zaakceptowanego zdejmuje akceptację

- **Outcome:** Nauczyciel może poprawić treść dnia, który wcześniej zaakceptował — dostaje potwierdzenie, a po zgodzie dzień traci stan zaakceptowania, zamiast wyglądać na zatwierdzony z treścią zmienioną po akceptacji.
- **Change ID:** edit-unaccepts-day
- **PRD refs:** FR-017; §Business Logic Changes reguła 2 („Co znaczy «dzień zaakceptowany»"); §Constraints „Warunek układu"; §Constraints „Semantyka zastanych danych"
- **Prerequisites:** S-02 (done, M-01 — edycja i akceptacja dnia istnieją i są tym, co ta pozycja zmienia)
- **Parallel with:** S-07, S-09, S-11, S-13
- **Blockers:** —
- **Unknowns:**
  - Jak kafelek i nagłówek mają pokazywać dzień, który stracił akceptację przez edycję — wariant domyślny to stan „niezaakceptowany" nieodróżnialny od nigdy niezaakceptowanego. Owner: `/10x-plan`. Block: nie.
- **Risk:** Druga w kolejności, bo cel `quality` stawia regułę przed jej najcięższym zastosowaniem: FR-017 ustala zasadę **„jawność proporcjonalna do skutku"** — nic nie jest zakazane, ale wszystko, co niszczy pracę oznaczoną jako gotowa, pyta — a `S-10` jest tej zasady najostrzejszym wariantem. Trzy ostrza. **(1)** Ta pozycja **odwraca decyzję zapisaną w roadmapie `M-01`** (2026-08-30: „blokada dotyczy edycji przypadkowej, operacje jawne pozostają dostępne"); granica „edycja przypadkowa vs operacja jawna" okazała się nie do obronienia — system broniłby poprawić literówkę, a pozwalał skasować tydzień. Nośnikiem tej decyzji są `shape-notes.md` i PRD v2, nie ten plik (Open Roadmap Questions #2). **(2)** Zmienia się znaczenie danych już zapisanych: dni zaakceptowane pod regułą „etykieta stanu" będą czytane pod regułą „stwierdzenie o konkretnej treści". Przepisania danych to nie wymaga, ale wymaga świadomości, że część istniejących zaakceptowanych dni mogła być edytowana po akceptacji. **(3)** To **jedyna** pozycja `M-02` ruszająca operacje akceptacji w widoku dnia, więc wiąże ją warunek układu z §Constraints (dawne FR-018, wycofane z listy FR 2026-09-19 — numer nie jest reużywany): cofnięcie akceptacji i usunięcie dnia trafiają przy okazji w docelowe miejsce (przy przycisku generowania), żeby te same przyciski nie były przesuwane dwa razy. Przy rozmieszczeniu obowiązuje ostrożność — usunięcie planu jest nieodwracalne, a przycisk generowania bywa klikany wielokrotnie w jednej sesji.
- **Status:** done

### S-11: Cofnięcie akceptacji i usunięcie dnia z poziomu tygodnia

- **Outcome:** Nauczyciel może cofnąć akceptację dnia i usunąć zapisany plan dnia, nie wychodząc z widoku tygodnia — czyli z widoku, w którym faktycznie pracuje, zamiast wchodzić w dzień po kolei.
- **Change ID:** week-level-plan-controls
- **PRD refs:** FR-015, FR-016; §Kryteria sukcesu Primary
- **Prerequisites:** S-05 (done, M-01 — kasowanie twarde wraz z potwierdzeniem istnieje w widoku dnia i obowiązuje tu tak samo)
- **Parallel with:** S-07, S-09, S-12, S-13
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Najtańsza z pozycji ochronnych — oba prymitywy już stoją (`setAcceptance` w `day-plan-store.ts:300`, `deleteDayPlan` tamże `:367`, trasa `api/day-plan/accept.ts` umie też wycofać akceptację), brakuje wyłącznie powierzchni w tygodniu. Ryzyko nie leży w zapisie, tylko w celowaniu: w tygodniu nauczyciel widzi kafelki, nie pełne aktywności, więc **operacja musi jednoznacznie nazywać dzień, którego dotyczy**, a nie polegać na tym, że nauczyciel trafił we właściwy kafelek. Asymetria obu operacji jest świadoma i dyktuje ostrożność w układzie: cofnięcie akceptacji jest odwracalne (dzień można zaakceptować ponownie, pomyłka kosztuje jedno kliknięcie), usunięcie planu jest twarde i bez kosza. Sekwencjonowana po `S-12`, żeby powierzchnie akceptacji w dniu i w tygodniu powstawały pod już ustaloną regułą jawności, a nie dwoma niezależnymi odczytami tej samej intencji — ale graf tego nie wymusza i przy zmianie priorytetu może iść pierwsza.
- **Status:** ready

### S-07: Podgląd aktywności w siatce miesiąca

- **Outcome:** Nauczyciel widzi aktywności zaplanowane na dany dzień bez opuszczania siatki miesiąca, a kafelek mieści pełny podtytuł dnia — nieucięty.
- **Change ID:** month-day-preview
- **Kamień:** przeniesiony z `M-01` 2026-08-30 (kamień zamknięto świadomie bez niego, żeby nie dopisywać FR wstecz do gotowego kodu). W `M-02` **ma już własne FR** — FR-010 i FR-011 — więc powód przeniesienia wygasł. ID i Change ID zachowane celowo.
- **PRD refs:** FR-010, FR-011, US-03; §Warunki jakościowe zmiany (zachowanie pod szybkim ruchem wskaźnika, widoczność miesiąca naraz, osiągalność bez myszy)
- **Prerequisites:** S-08 (done, M-01 — podtytuł dnia jest już w kafelku i jest tym, co FR-011 przestaje ucinać)
- **Parallel with:** S-09, S-11, S-12, S-13
- **Blockers:** —
- **Unknowns:** — (wzorzec interakcji rozstrzygnięty 2026-08-30, warunki wydajnościowe przeszły w PRD z pytań w warunki brzegowe)
- **Decyzje zastane, nie do przegłosowania w slice'ie:** podgląd na `:hover` **oraz** `:focus-visible`, kliknięcie kafelka nadal otwiera dzień (podgląd jest akceleratorem, nie jedyną drogą do informacji); podgląd wyłącznie do odczytu; dane dociągane na żądanie, bez wstępnego pobierania całego miesiąca (PRD §Non-Goals).
- **Risk:** Jedyna pozycja z decyzjami zamkniętymi przed startem `M-02` i najkrótsza droga do wydania — sekwencjonowana jako czwarta **wyłącznie** dlatego, że cel `quality` stawia trzy pozycje ochronne przed pozycją wygody. Zależności `M-02` nie ma żadnych, więc jest pierwszym kandydatem do wzięcia równolegle albo do przesunięcia w przód, jeśli potrzebny jest szybki dowód postępu. Trzy warunki brzegowe przestały być tematami do zbadania i stały się wymaganiami: opóźnienie przed pobraniem i anulowanie porzuconego żądania (przeciągnięcie kursora przez rząd 20–22 kafelków nie może wywołać żądania za żądaniem), pamięć podręczna już obejrzanych dni, oraz **twarde ograniczenie**: pełny miesiąc pozostaje widoczny bez przewijania na tej samej szerokości ekranu co dziś — przy konflikcie ustępuje podtytuł, nie widok miesiąca. Zakres zawężony stanem kodu: kliknięcie kafelka już prowadzi do `/plan?date=`, a to, co dziś wygląda jak dymek, to natywny atrybut `title` (`MonthGrid.astro:126`) — slice go zastępuje. Powiększony kafelek i panel podglądu konkurują o tę samą siatkę siedmiu kolumn, dlatego FR-010 i FR-011 wchodzą razem, a nie osobno.
- **Status:** ready

### S-13: Wydruk tygodnia

- **Outcome:** Nauczyciel może wydrukować tydzień w postaci czytelnej na papierze i oddać go bez przepisywania czegokolwiek do innego narzędzia; wydruk obejmuje wszystkie dni robocze, a dni niezaakceptowane są na nim widocznie oznaczone jako szkic roboczy.
- **Change ID:** week-print
- **PRD refs:** FR-019, FR-020, US-02; §Kryteria sukcesu Secondary
- **Prerequisites:** S-02 (done, M-01 — stan zaakceptowania istnieje i jest tym, co FR-020 oznacza na papierze)
- **Parallel with:** S-07, S-09, S-11, S-12
- **Blockers:** —
- **Unknowns:**
  - Układ wydruku — dzień na stronie czy tydzień na stronie? Zależy od tego, komu i w jakiej formie nauczyciel oddaje plan, a tego nie ustalono. Owner: Janusz. Block: nie — PRD przypisuje to rozstrzygnięcie wprost do tego slice'a (§Open Questions #1), a FR-019 został w rundzie Sokratejskiej **rozluźniony** do zobowiązania o czytelności, nie o konkretnym układzie.
- **Risk:** Ostatnia z pozycji `ready` i to jest świadome następstwo wyboru `decisions` jako głównego ryzyka: to jedyna pozycja `M-02` z żywym pytaniem otwartym, więc dostaje najwięcej czasu na rozstrzygnięcie, zanim ktokolwiek zacznie ją planować. Startuje od pustej powierzchni — w `src/` nie ma dziś ani jednej reguły `@media print` ani utility `print:`. Napięcie zapisane w PRD i nierozwiązane w nim: kryterium Secondary mówi „nadaje się do oddania bez obróbki", a FR-020 każe drukować także dni nieskończone — oznaczony szkic i tak zostanie oddany. Kontrargument rozważono i odrzucono; slice dziedziczy to napięcie jawnie, zamiast je odkrywać. Niesie jedyną oś bólu, której dziś nie ma wcale — dwie pozostałe („trudny do poprawienia", „trudny do odczytania") mają przynajmniej obejście.
- **Status:** ready

### S-10: Rozszerzenie zastępowania na dni zaakceptowane

- **Outcome:** Nauczyciel może jawnie rozszerzyć regenerację tygodnia na dni zaakceptowane, zamiast najpierw cofać akceptacje po kolei.
- **Change ID:** accepted-day-replacement
- **PRD refs:** FR-013 (**jedyny nice-to-have paczki**); §Business Logic Changes reguła 1
- **Prerequisites:** S-09 (operacja zastępowania i jej potwierdzenie muszą istnieć, zanim da się je rozszerzyć), S-12 (reguła „jawność proporcjonalna do skutku" musi być ustalona, zanim zadziała jej najostrzejszy wariant)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Czy rozszerzenie jest osobnym wyborem w tym samym potwierdzeniu, czy drugim krokiem — kształt należy do `/10x-plan`. Owner: `/10x-plan`. Block: nie.
- **Risk:** Jedyna pozycja, którą graf naprawdę wiąże, i jedyna, bez której kamień się domyka — PRD stwierdza to wprost, a `shape-notes.md` §Forward nazywa ją zaworem bezpieczeństwa: jeśli `M-02` się rozciągnie, to jest pozycja do odpuszczenia. Sekwencjonowana ostatnia nie z powodu kosztu, tylko charakteru: **kasuje hurtowo jedyny stan, który człowiek świadomie oznaczył jako skończony, w systemie, który nie ma cofania nigdzie** (`S-02` usunął undo świadomie, `S-05` kasuje twardo, a PRD §Non-Goals potwierdza: paczka dokłada potwierdzeń, nie historii). Potwierdzenie jest jedyną barierą i to jest świadomie przyjęte ryzyko, nie przeoczenie. Dlatego `S-12` stoi w jej prerekwizytach, a nie tylko obok w kolejności.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                 | Suggested issue title                                              | Ready for `/10x-plan` | Notes                                                                 |
| ---------- | ------------------------- | ------------------------------------------------------------------ | --------------------- | ---------------------------------------------------------------------- |
| S-09       | week-regeneration-replace | Regeneracja tygodnia z zastępowaniem dni niezaakceptowanych        | yes                   | Gwiazda przewodnia — `/10x-plan week-regeneration-replace`             |
| S-12       | edit-unaccepts-day        | Edycja dnia zaakceptowanego zdejmuje akceptację (+ układ przycisków)| yes                   | Niesie warunek układu z §Constraints; odwraca decyzję z roadmapy M-01  |
| S-11       | week-level-plan-controls  | Cofnięcie akceptacji i usunięcie dnia z poziomu tygodnia           | yes                   | Prymitywy istnieją; może iść równolegle do S-09 i S-12                 |
| S-07       | month-day-preview         | Podgląd aktywności dnia i pełny podtytuł w siatce miesiąca         | yes                   | Decyzje zamknięte od 2026-08-30; najkrótsza droga do wydania           |
| S-13       | week-print                | Wydruk tygodnia z oznaczonymi szkicami roboczymi                   | yes                   | Rozstrzygnij układ wydruku wewnątrz slice'a (Open Roadmap Questions #1) |
| S-10       | accepted-day-replacement  | Rozszerzenie zastępowania tygodnia na dni zaakceptowane            | no                    | Czeka na S-09 + S-12; nice-to-have, kamień domyka się bez niej          |

## Open Roadmap Questions

1. **Układ wydruku — dzień na stronie czy tydzień na stronie?** W rundzie Sokratejskiej uznano to za wybór dokonany przedwcześnie: zależy od tego, komu i w jakiej formie nauczyciel oddaje plan, a tego nie ustalono. Owner: Janusz. Block: nie — gates: `S-13` (rozstrzygnięcie należy do slice'a, nie do roadmapy).
2. **Odwrócenie decyzji z roadmapy o blokadzie edycji.** Roadmapa `M-01` (2026-08-30) zapisała: „blokada «tydzień zaakceptowany» dotyczy edycji przypadkowej; operacje jawne pozostają dostępne". FR-017 zastępuje to regułą „potwierdzenie zamiast zakazu". Owner: Janusz. Block: nie — gates: `S-12`. **Ta regeneracja domyka połowę pytania:** poprzedni zapis zniknął wraz z sekcją §Kandydaci, a `S-12` niesie teraz nową regułę wprost. Nośnikiem decyzji pozostają `shape-notes.md` i `prd-v2.md`.
3. **Dług PRD za `S-04`, `S-05` i `S-08` pozostaje otwarty.** Trzy zarchiwizowane slice'y `M-01` zostają z pustą rubryką „PRD refs". Decyzja z 2026-09-19: PRD v2 obejmuje wyłącznie `M-02` i **nie** spłaca tego długu wstecz — dopisywanie FR do wydanego kodu jest dokładnie tym, czego unikano przy zamykaniu `M-01`. `S-07` wyjątkiem nie jest: dostał własne FR (FR-010, FR-011), bo jest budowany, nie wydany. Owner: Janusz. Block: nie — pytanie przechodzi do kamienia po `M-02`. Źródło: `prd-v2.md` §Open Questions #3.
4. **Reset hasła** — czy produkt wymaga mechanizmu odzyskiwania hasła przez e-mail? Przeniesione z v1, wciąż otwarte. Owner: decyzja produktowa. Block: nie dla `M-02` — roadmap-wide.
5. **Limit regeneracji** — czy istnieje limit liczby wywołań AI dla jednego użytkownika (koszt API)? Przeniesione z v1 i **podniesione przez tę paczkę**: regeneracja tygodnia z zastępowaniem mnoży wywołania przez pięć na jedno kliknięcie, a FR-012 czyni tę operację łatwiejszą do powtórzenia niż była. Owner: decyzja techniczno-biznesowa. Block: nie — gates: `S-09`, `S-10`.
6. **Brak bramki czasowej — przyjęte ryzyko, nie luka.** `delivery_weeks` jest `null`, nie liczbą: tryb „slice po slice, ile zajmie" wybrano po przedstawieniu kosztu (sześć pozycji, realnie więcej niż trzy tygodnie pracy po godzinach). Konsekwencja: **nic w tym projekcie nie powie, że `M-02` trwa za długo** — nie ma daty, względem której opóźnienie by się mierzyło. Obroną jest dyscyplina slice'ów (każdy slice to osobny PR i osobne wydanie), nie budżet. Owner: Janusz. Block: nie — roadmap-wide.
7. **Repo niosło obietnicę spłaty długu PRD w v2.** Dwa pliki w `context/foundation/` obiecywały spłatę wbrew decyzji z #3 — poprawione 2026-09-19. Pozycja zostaje jako **ślad kontrolny: przy każdej regeneracji roadmapy sprawdź, czy obietnica nie wróciła.** Ta regeneracja (2026-09-19) sprawdzona — §Milestone „Czego ten kamień nie robi" i #3 powyżej niosą odroczenie, nie obietnicę. Owner: Janusz. Block: nie — roadmap-wide.

## Parked

- **Rozszerzenie zastępowania na dni zaakceptowane** — Why parked: **nie jest parkowane dziś** — stoi jako `S-10` ze statusem `proposed`. Wpis istnieje jako wskazanie, którą pozycję odpuścić pierwszą, jeśli `M-02` się rozciągnie (`prd-v2.md` §Scope of Change: „Kamień domyka się bez niego").
- **Cofanie operacji (undo) i kosz** — Why parked: PRD v2 §Non-Goals — paczka dokłada potwierdzeń, nie historii; kasowanie pozostaje twarde zgodnie z decyzją `S-05`.
- **Edycja treści z poziomu podglądu w siatce miesiąca** — Why parked: PRD v2 §Non-Goals — podgląd jest wyłącznie do odczytu, edycja zostaje w widoku dnia.
- **Wstępne pobieranie danych całego miesiąca** — Why parked: PRD v2 §Non-Goals — podgląd dociąga dzień na żądanie; pobieranie z wyprzedzeniem to możliwa późniejsza optymalizacja.
- **Zmiana wytycznych generowania i doboru treści** — Why parked: PRD v2 §Non-Goals — wymaga odwrócenia §Non-Goals z PRD v1 i osobnej sesji `/10x-shape` z researchem dziedzinowym, nie `/10x-research`.
- **Zmiany w modelu dostępu (role, współdzielenie planów)** — Why parked: PRD v2 §Non-Goals i §Access Control Changes — jedna rola, model płaski, dane prywatne per konto.
- **Rodzaje aktywności (plastyczne / muzyczne / ruchowe)** — Why parked: PRD v1 §Non-Goals; odwrócenie wymaga osobnego kamienia, nie dopisania FR.
- **Profile grup przedszkolnych** — Why parked: PRD v1 §Non-Goals — plan jest własnością nauczyciela, nie grupy.
- **Dane o dzieciach (imiona, potrzeby, alergie)** — Why parked: PRD v1 §Non-Goals — poza zakresem.
- **Generowanie materiałów dodatkowych (karty pracy, grafiki, audio)** — Why parked: PRD v1 §Non-Goals — proponujemy tylko tytuł i opis aktywności.
- **Monetyzacja** — Why parked: własny kamień milowy, nie funkcja; sekwencjonowana po pozycjach będących kandydatami na „za subskrypcją". Wymaga powrotu do `infrastructure.md`.

## Milestone History

(Append-only. Przenoszone verbatim do roadmapy każdego kolejnego kamienia.)

- **M-01: Użyteczny plan miesiąca** (`usable-month-plan`) — closed 2026-08-30. Nauczyciel prowadzi pełny cykl planowania miesiąca w jednym miejscu: generuje dzień i tydzień, edytuje, akceptuje, usuwa i odróżnia dni po podtytule.
  - **Zamknięty z niepełnym zakresem.** `S-07` (`month-day-preview`, podgląd aktywności w siatce miesiąca) został 2026-08-30 jawnie wypisany z kamienia i przeniesiony do `M-02`. Kamień zamknął się więc **bez odczytu aktywności z siatki**, mimo że ten człon stoi wprost w jego intencie.
  - **Dlaczego mimo to zamknięty:** `S-07` był `ready`, ale bez własnego FR (PRD v1 wyczerpał się na `S-03` — Open Roadmap Questions #3). Zbudowanie go przed PRD v2 oznaczałoby dopisywanie wymagania wstecz do gotowego kodu; trzymanie kamienia otwartego oznaczałoby blokowanie go zależnością papierową. Wybrano trzecią drogę: skrócić zakres świadomie i wejść w `M-02` z czystym kontem.
  - **Dług przeniesiony dalej:** `S-04`, `S-05` i `S-08` są zarchiwizowane z pustą rubryką „PRD refs". **Poprawka 2026-09-19:** PRD v2 tego długu **nie** spłaca — patrz Open Roadmap Questions #3. Wcześniejszy zapis („PRD v2 spłaca to wstecz") był obietnicą wycofaną decyzją użytkownika.

## Done

- **F-01: (foundation) istnieje minimalny schemat przechowywania planów (dzień → hasło, propozycje, stan zaakceptowania) z politykami RLS, które udostępniają wiersze wyłącznie właścicielowi konta.** — Archived 2026-08-22 → `context/archive/2026-07-18-plan-persistence-baseline/`. Lesson: —.
- **S-01: Nauczyciel loguje się, wybiera dzień w kalendarzu, wpisuje hasło i otrzymuje wygenerowaną propozycję aktywności (z widocznym postępem operacji, po polsku, z treścią bezpieczną dla dzieci 3–6 lat); może ponownie wygenerować propozycję dla tego dnia.** — Archived 2026-08-22 → `context/archive/2026-08-22-first-day-generation/`. Lesson: —.
- **S-02: Nauczyciel może edytować treść wygenerowanej propozycji, jawnie ją zaakceptować, a zatwierdzony plan dnia zostaje zapisany i jest prywatny dla jego konta.** — Archived 2026-08-23 → `context/archive/2026-08-23-edit-accept-day-plan/`. Lesson: —.
- **S-03: Nauczyciel może wybrać tydzień i wygenerować propozycję dla każdego dnia roboczego, a regeneracja jednego dnia nie wpływa na pozostałe (pełna US-01).** — Archived 2026-08-26 → `context/archive/2026-08-23-week-generation/`. Lesson: —.
- **S-06: Nauczyciel może wylogować się z aplikacji z dowolnego ekranu, na którym pracuje, a nie tylko ze strony startowej dla niezalogowanych (FR-003).** — Delivered 2026-08-26 wewnątrz `S-04` (`month-home`, faza 1: `src/components/AppHeader.astro`); bez własnego change-id i bez własnego archiwum. Lesson: —.
- **S-04: Zalogowany nauczyciel po wejściu do aplikacji ląduje w widoku miesiąca i z niego wchodzi w tydzień oraz w pojedynczy dzień — bez osobnego pulpitu jako przystanku.** — Archived 2026-08-26 → `context/archive/2026-08-26-month-home/`. Lesson: —.
- **S-08: Nauczyciel odróżnia od siebie dni jednego hasła bez wchodzenia w każdy z nich — kafelek w siatce miesiąca i nagłówek widoku dnia pokazują podtytuł dnia („Dinozaury — co jadły dinozaury"), a nie pięć razy to samo hasło.** — Archived 2026-08-27 → `context/archive/2026-08-27-visible-day-theme/`. Lesson: „Kryterium weryfikacji musi móc nie przejść".
- **S-09: Nauczyciel może wygenerować tydzień na nowo pod nowym hasłem i dostać komplet nowych dni w miejsce dotychczasowych dni niezaakceptowanych — po potwierdzeniu, które uczciwie podaje, ile dni zostanie zastąpionych i ile z nich jest zaakceptowanych.** — Archived 2026-09-20 → `context/archive/2026-09-19-week-regeneration-replace/`. Lesson: —.
- **S-12: Nauczyciel może poprawić treść dnia, który wcześniej zaakceptował — dostaje potwierdzenie, a po zgodzie dzień traci stan zaakceptowania, zamiast wyglądać na zatwierdzony z treścią zmienioną po akceptacji.** — Archived 2026-09-21 → `context/archive/2026-09-20-edit-unaccepts-day/`. Lesson: —.
- **S-05: Nauczyciel może usunąć zapisany plan wybranego dnia z poziomu widoku tego dnia; wiersz `day_plans` i jego aktywności są usuwane trwale (kasowanie twarde), a dzień wraca do stanu **nieodróżnialnego od dnia nigdy nieplanowanego** — na wszystkich powierzchniach, na których jest pokazywany, i dla generowania tygodnia, które obejmuje go ponownie zamiast pominąć.** — Archived 2026-08-29 → `context/archive/2026-08-27-delete-day-plan/`. Lesson: „Kryterium »poza X nietknięte« musi być odporne na przerównanie".
