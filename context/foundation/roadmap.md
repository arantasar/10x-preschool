---
project: 10xPreschool
version: 1
status: draft
created: 2026-06-27
updated: 2026-06-27
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

| ID   | Change ID                 | Outcome (user can …)                                               | Prerequisites | PRD refs                                              | Status   |
| ---- | ------------------------- | ------------------------------------------------------------------ | ------------- | ----------------------------------------------------- | -------- |
| F-01 | plan-persistence-baseline | (foundation) tabela planów z RLS izoluje dane per konto            | —             | Access Control, NFR prywatności                       | ready    |
| S-01 | first-day-generation      | zalogować się, wybrać dzień, wpisać hasło i wygenerować propozycję | —             | FR-001, FR-002, FR-004, FR-005, FR-006, FR-007, US-01 | ready    |
| S-02 | edit-accept-day-plan      | edytować, zaakceptować i zapisać propozycję dla dnia               | S-01, F-01    | FR-008, FR-009, US-01                                 | proposed |
| S-03 | week-generation           | wygenerować propozycje dla całego tygodnia roboczego (US-01)       | S-01, F-01    | FR-004, US-01                                         | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                       | Chain           | Note                                                                                             |
| ------ | --------------------------- | --------------- | ------------------------------------------------------------------------------------------------ |
| A      | Rdzeń generowania           | `S-01` → `S-03` | Gwiazda przewodnia najpierw; `S-03` rozszerza generowanie z dnia na tydzień i dołącza do `F-01`. |
| B      | Zapis i zatwierdzanie planu | `F-01` → `S-02` | `F-01` może iść równolegle do `S-01`; `S-02` dołącza do Stream A przy `S-01`.                    |

## Baseline

What's already in place in the codebase as of `2026-06-27` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6 SSR + React 19 islands, Tailwind 4, shadcn/ui (`src/layouts/Layout.astro`, `src/components/ui/button.tsx`, komponenty auth).
- **Backend / API:** partial — trasy API Astro istnieją tylko dla auth (`src/pages/api/auth/{signin,signup,signout}.ts`); brak tras domenowych / generowania.
- **Data:** absent — biblioteki Supabase zainstalowane, ale brak `supabase/migrations`, brak schematu i tabel.
- **Auth:** present — klient SSR Supabase (`src/lib/supabase.ts`), middleware z `PROTECTED_ROUTES` (`src/middleware.ts`), endpointy + strony signin/signup/signout.
- **Deploy / infra:** present — `wrangler.jsonc`, adapter `@astrojs/cloudflare`, `.github/workflows/ci.yml`. Akcje przed-deployowe wciąż otwarte wg `infrastructure.md` (Workers Paid, flagi kompatybilności, streaming dla tras LLM).
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
- **Status:** ready

## Slices

### S-01: Generowanie propozycji dla jednego dnia (gwiazda przewodnia)

- **Outcome:** Nauczyciel loguje się, wybiera dzień w kalendarzu, wpisuje hasło i otrzymuje wygenerowaną propozycję aktywności (z widocznym postępem operacji, po polsku, z treścią bezpieczną dla dzieci 3–6 lat); może ponownie wygenerować propozycję dla tego dnia.
- **Change ID:** first-day-generation
- **PRD refs:** FR-001, FR-002, FR-004, FR-005, FR-006, FR-007, US-01
- **Prerequisites:** —
- **Parallel with:** F-01
- **Blockers:** —
- **Unknowns:**
  - Jak wymusić guardrail bezpieczeństwa treści (żadna propozycja nieodpowiednia dla 3–6 lat) — przez prompt, post-filtr czy oba? — Owner: user. Block: no.
  - Czy długie wywołanie LLM (10–30 s) wymaga streamingu, by zmieścić się w limicie CPU Cloudflare Workers (patrz `infrastructure.md` Ryzyko 3) — Owner: TBD. Block: no.
- **Risk:** To slice o najwyższej wadze — niesie rdzeń hipotezy produktu i jedyną nienegocjowalną inwestycję (bezpieczeństwo + trafność generowania). Auth jest już w baseline, więc zostaje tylko dodać trasy generowania do `PROTECTED_ROUTES`. Sekwencjonowane pierwsze, bo cała reszta roadmapy ma sens tylko, jeśli jakość generowania się broni. Główne zagrożenie: niska trafność/akceptacja propozycji lub treść nieodpowiednia dla wieku — oba widoczne dopiero na realnym wyjściu LLM.
- **Status:** ready

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
- **Status:** proposed

### S-03: Generowanie dla całego tygodnia roboczego

- **Outcome:** Nauczyciel może wybrać tydzień i wygenerować propozycję dla każdego dnia roboczego, a regeneracja jednego dnia nie wpływa na pozostałe (pełna US-01).
- **Change ID:** week-generation
- **PRD refs:** FR-004, US-01
- **Prerequisites:** S-01, F-01
- **Parallel with:** S-02
- **Blockers:** —
- **Unknowns:**
  - Czy tydzień to N niezależnych wywołań LLM (per dzień) czy jedno wywołanie wsadowe — wpływa na koszt, postęp i izolację regeneracji — Owner: TBD. Block: no.
- **Risk:** Rozszerza udowodniony przepływ dzienny na skalę tygodnia — realna jednostka pracy nauczyciela. Sekwencjonowane po S-01 (ten sam mechanizm generowania) i F-01 (zapis wielu dni). Zagrożenie: koszt API i czas operacji rosną liniowo z dniami; przy granulacji per-dzień postęp i regeneracja zostają izolowane zgodnie z AC US-01.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                 | Suggested issue title                              | Ready for `/10x-plan` | Notes                                                 |
| ---------- | ------------------------- | -------------------------------------------------- | --------------------- | ----------------------------------------------------- |
| F-01       | plan-persistence-baseline | Minimalny schemat planów + RLS izolacji per konto  | yes                   | Może iść równolegle do S-01                           |
| S-01       | first-day-generation      | Generowanie propozycji aktywności dla jednego dnia | yes                   | Gwiazda przewodnia — `/10x-plan first-day-generation` |
| S-02       | edit-accept-day-plan      | Edycja, akceptacja i zapis planu dnia              | no                    | Czeka na S-01 + F-01                                  |
| S-03       | week-generation           | Generowanie planu dla całego tygodnia roboczego    | no                    | Czeka na S-01 + F-01                                  |

## Open Roadmap Questions

1. **Reset hasła** — czy MVP wymaga mechanizmu odzyskiwania hasła przez e-mail? Owner: decyzja produktowa. Block: nie (MVP może startować bez, ale nie nadaje się do produkcji bez rozwiązania) — roadmap-wide.
2. **Limit regeneracji** — czy istnieje limit liczby wywołań AI dla jednego użytkownika (koszt API)? Owner: decyzja techniczno-biznesowa. Block: nie dla MVP — gates: S-01, S-03.

## Parked

- **Wylogowanie (FR-003)** — Why parked: nice-to-have w PRD; sesja wygasa automatycznie, wylogowanie można dodać w v2.
- **Profile grup przedszkolnych** — Why parked: PRD §Non-Goals — plan jest własnością nauczyciela, nie grupy.
- **Dane o dzieciach (imiona, potrzeby, alergie)** — Why parked: PRD §Non-Goals — poza zakresem MVP.
- **Generowanie materiałów dodatkowych (karty pracy, grafiki, audio)** — Why parked: PRD §Non-Goals — MVP proponuje tylko tytuł i opis aktywności.
- **Filtrowanie po typach zajęć (plastyczne/muzyczne/ruchowe)** — Why parked: PRD §Non-Goals — AI decyduje o formie aktywności na podstawie hasła.

## Done

(Empty on first generation — `/10x-archive` appends here when a matching change is archived.)
