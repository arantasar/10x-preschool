---
project: 10xPreschool
version: 3
status: draft
created: 2026-10-01
updated: 2026-10-03
prd_version: 3
main_goal: quality
top_blocker: external
milestone_id: ready-to-sell
milestone_seq: 3
milestone_status: active
---

# Roadmap: 10xPreschool

> Derived from `context/foundation/prd-v3.md` (v3) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded. Poprzednia wersja (`M-02`): `context/foundation/archive/2026-10-01-roadmap.md`.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-03: Gotowi do sprzedaży** — Status: active (otwarty 2026-10-01)

- **Intent:** Nauczycielka posługuje się kontem i usługą bez pomocy właściciela — odzyskuje i zmienia hasło, usuwa konto, czyta regulamin, politykę prywatności i FAQ, pisze przez formularz — generowanie ma limit, który zatrzymuje wyłącznie nadużycie, bramka bezpieczeństwa treści znów pracuje, a produkt **mierzy, czy ktoś zapłaci** (zapis na cenę założycielską). Płatności wchodzą tylko wtedy, gdy pomiar przejdzie bramę.
- **Source materials:** `context/foundation/prd-v3.md` (v3), poprzedzone `shape-notes.md` (2026-10-01, runda Sokratejska przy każdym z 17 FR) i `monetization.md` (§Decyzje 2026-09-29).
- **Done when:** jedna z dwóch dróg, rozstrzygana bramą kroku 7 (§Open Roadmap Questions #1):
  - **brama nie przeszła** (< 10 zapisów kont aktywnych w 4 tygodnie od uruchomienia zapisu) — wszystkie pozycje `F-02`, `S-16`…`S-22` są `done`; `S-23`…`S-27` przechodzą do §Parked z wynikiem zapisu jako uzasadnieniem, a decyzja o płatnościach wraca do właściciela;
  - **brama przeszła** — dodatkowo `S-23`…`S-27` są `done`, z płatnościami wydanymi kompletem (Guardrail 3).
- **Scope anchors:** FR-022…FR-038; US-04, US-05; Guardraile 1–3 z PRD v3 §Success Criteria; cztery niezmienniki `M-02`.
- **Czego ten kamień nie robi:** nie spłaca długu PRD za `S-04`, `S-05` i `S-08` (Open Roadmap Questions #10 — ślad kontrolny: obietnica spłaty nie może tu wrócić); nie zmienia wytycznych generowania ani promptu (to `M-04`); nie buduje Pro.

## Vision recap

10xPreschool zamienia krótkie hasło nauczyciela przedszkolnego w gotowy plan aktywności dla dzieci
3–6 lat — na dzień, tydzień i miesiąc. Po `M-01` i `M-02` planowanie działa w całości, ale
**produktu nie da się sprzedać, a części braków nie da się bronić nawet bez sprzedaży**: nie ma
resetu hasła, kanału kontaktu, regulaminu ani limitów, a jedyny automatyczny strażnik treści dla
dzieci — bramka bezpieczeństwa — jest wstrzymany od 2026-09-19. `M-03` domyka te braki i dopiero
na nich stawia **fake door** — stronę cennika z przyciskiem, który zapisuje chęć zakupu zamiast
pobierać płatność — jako jedyny pomiar tego, czy ktokolwiek zapłaci.

## North star

**S-22: Odwiedzający albo zalogowana nauczycielka zapisuje się na cenę założycielską i dostaje uczciwe potwierdzenie, że płatności jeszcze nie działają** — bo to ta pozycja rozstrzyga, czy krok 7 (płatności) w ogóle wchodzi do kamienia: chęć płacenia jest niezweryfikowana (PRD §Open Questions #1), a zapis jest jedynym miejscem, w którym produkt ją mierzy.

> **Gwiazda przewodnia** to najmniejsza pozycja dowożąca wartość od końca do końca, której
> udane wdrożenie dowodzi, że cały kamień ma sens — dlatego planuje się ją tak wcześnie, jak
> pozwalają zależności. **Tutaj zależności są z wyboru, nie z grafu:** PRD i `shape-notes.md`
> §Forward ustawiają cały rdzeń (konto, strony, kontakt, limit, bramka) przed zapisem, bo rdzeń
> jest wart zrobienia niezależnie od wyniku zapisu. `S-22` stoi więc ostatni w rdzeniu, ale jest
> pierwszą pozycją, po której kamień wie, którą z dwóch dróg §Milestone idzie.

## At a glance

Numeracja kontynuuje poprzednie kamienie — `F-01` i `S-01`…`S-15` są `done` (§Done), więc pierwszy
nowy fundament to `F-02`, a pierwszy nowy slice `S-16`. Pozycje `S-23`…`S-27` to **krok 7
(warunkowy)**: wszystkie są `blocked` do wyniku bramy.

| ID   | Change ID                  | Outcome (user can …)                                                                                     | Prerequisites                                    | PRD refs                       | Status   |
| ---- | -------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------ | -------- |
| F-02 | content-safety-gate-resume | (foundation) bramka bezpieczeństwa treści znów pracuje na każdym dopuszczonym modelu i w każdym trybie   | —                                                | Guardrail 2, Success Primary #5 | done     |
| S-16 | password-reset             | wrócić do konta przez e-mail po zapomnieniu hasła i zastać swoje plany                                   | —                                                | FR-022, US-04                  | ready    |
| S-17 | password-change            | zmienić hasło po zalogowaniu, wylogowując pozostałe sesje konta                                          | —                                                | FR-023                         | ready    |
| S-18 | account-deletion           | usunąć swoje konto razem ze wszystkimi planami                                                           | —                                                | FR-024                         | ready    |
| S-19 | help-and-contact           | przeczytać FAQ i napisać do właściciela przez formularz, z kontem lub bez                                | —                                                | FR-025, FR-026                 | ready    |
| S-20 | legal-pages                | przeczytać regulamin i politykę prywatności bez konta                                                     | treść od księgowego/prawnika                     | FR-025                         | blocked  |
| S-21 | fair-use-limit             | generować jak dziś, a przy nadużyciu dostać komunikat z terminem powrotu i kontaktem                     | S-19                                             | FR-027, FR-038                 | blocked  |
| S-22 | founder-price-signup       | zobaczyć cennik Darmowy/Basic i zapisać się na cenę założycielską z uczciwym potwierdzeniem              | F-02, S-16, S-17, S-18, S-19, S-20, S-21         | FR-028, FR-029, US-05          | blocked  |
| S-23 | trial-entitlement          | jako nowe konto dostać pierwszy miesiąc pełnego Basic bez karty i widzieć stan swojego planu             | S-22, wynik bramy kroku 7                        | FR-030                         | blocked  |
| S-24 | existing-accounts-gift     | jako konto sprzed płatności dowiedzieć się o nowych zasadach i dostać prezent, zanim limit mnie dotknie  | S-23                                             | FR-036                         | blocked  |
| S-25 | basic-subscription         | wykupić Basic jako subskrypcję kartą, zarządzać nią i ją anulować                                        | F-02, S-18, S-22, S-23, Krok 9, konto operatora  | FR-032, FR-034, FR-035, FR-024 | blocked  |
| S-26 | one-time-access            | wykupić Basic jednorazowo (miesiąc albo rok szkolny) BLIK-iem albo przelewem                             | F-02, S-23, Krok 9, konto operatora              | FR-033                         | blocked  |
| S-27 | free-tier-limit            | na planie darmowym zaplanować pięć dni roboczych w miesiącu, a po wygaśnięciu planu zachować swoje plany | S-21, S-24, S-25                                 | FR-031, FR-037                 | blocked  |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                              | Chain                                                        | Note                                                                                                                                       |
| ------ | ---------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| A      | Bezpieczeństwo treści              | `F-02`                                                       | Pierwszy przy celu `quality` — dług `S-15` i warunek sprzedaży. Dołącza do strumienia D w `S-22`, `S-25`, `S-26`.                           |
| B      | Konto                              | `S-16` / `S-17` / `S-18` (równolegle)                        | Trzy niezależne pozycje bez prerekwizytów; `S-18` wraca w strumieniu D jako prerekwizyt `S-25` (usunięcie konta kończy subskrypcję).       |
| C      | Informacja, kontakt i limit        | `S-19` → `S-21`; `S-20` równolegle                           | `S-19` stawia ochronę przed automatami, z której korzysta `S-22`; `S-20` czeka na zewnętrzną treść prawną — główne ryzyko kamienia.        |
| D      | Walidacja sprzedaży i płatności    | `S-22` → `S-23` → `S-24` / `S-25` / `S-26` → `S-27`           | Zbiera strumienie A–C w `S-22`. Od `S-23` warunkowe — rusza wyłącznie po bramie kroku 7; płatności wychodzą kompletem (Guardrail 3).      |

## Baseline

What's already in place in the codebase as of `2026-10-01` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6 SSR + React 19 (wyspy), Tailwind 4, shadcn/ui; design z `design-foundation` i `design-planner` na produkcji. Wspólna stopka `src/components/layout/SiteFooter.astro` istnieje; stron publicznych poza `/` i `/auth/*` nie ma.
- **Backend / API:** present — `src/pages/api/day-plan/*`, warstwa serwisowa w `src/lib/services/`. **Cztery trasy wołają model:** `generate.ts`, `week/outline.ts`, `week/day.ts`, `refine.ts`. Licznika zużycia brak.
- **Data:** present — 13 migracji w `supabase/migrations/`, `day_plans` + `activities` z RLS per operacja i rola, pisarze partii dnia i tygodnia. Brak danych stanu planu konta, licznika i listy zapisów.
- **Auth:** partial — klient SSR Supabase, middleware z `PROTECTED_ROUTES = ["/plan"]`, signin/signup/signout. **Brak** resetu hasła, zmiany hasła i usuwania konta; aplikacja nie ma klucza serwisowego.
- **Deploy / infra:** present — Cloudflare Workers Builds deployuje `master` (merge = wydanie); `ci.yml`: joby `ci`, `db` (doradczy), `content-safety-gate` (doradczy, na PR-ach z dopasowaną ścieżką uruchamia `npm run test:gate`). E2E poza CI (Krok 9 `next-actions.md`).
- **Observability:** absent — świadomie nieawansowana: żadne FR v3 jej nie implikuje.
- **Poza sześcioma warstwami:** brak wysyłki e-maili z aplikacji (e-maile auth wysyła Supabase), brak ochrony formularzy przed automatami, brak integracji płatności. Bramka bezpieczeństwa treści pracuje od 2026-10-03 (`F-02`): `npm run test:gate` ocenia bez flag, sędzia dwustopniowy (Haiku 4.5, a jego alarmy rozstrzyga Sonnet 5.5), około 0,40 USD za pełną macierz, przebiegi w `context/changes/content-safety-gate-resume/gate-runs.md`.

## Foundations

### F-02: Odwieszenie bramki bezpieczeństwa treści

- **Outcome:** (foundation) bramka bezpieczeństwa treści przechodzi na żywo dla każdego dopuszczonego modelu i każdego trybu generowania (dzień, tydzień, poprawka aktywności), a zmiana promptu albo modelu znów nie wchodzi na produkcję bez jej przebiegu.
- **Change ID:** content-safety-gate-resume
- **PRD refs:** §Success Criteria Primary #5; Guardrail 2; §Scope of Change [preserved] „Bezpieczeństwo treści propozycji"; §Constraints „Odwieszenie bramki"
- **Unlocks:** S-22 (warunek wstępny zapisu wg `shape-notes.md` §Forward), S-25 i S-26 (warunek sprzedaży — `monetization.md` §6 #1); ścieżka weryfikacji dla trybu `activity` (`refine-activity.pl.md` z `S-15` wszedł oceniony tylko ręcznie)
- **Prerequisites:** —
- **Parallel with:** S-16, S-17, S-18, S-19, S-20, S-21
- **Blockers:** —
- **Unknowns:**
  - Koszt przebiegu — czy pełna macierz (każdy model × słowo kluczowe × tryb) jest do utrzymania, czy węższa macierz z ogona po Kroku 2 wystarcza do Guardrail 2? Owner: Janusz. Block: nie — rozstrzyga `/10x-plan`, ale węższa macierz nie może pominąć żadnego modelu ani trybu. **Rozstrzygnięte 2026-10-03:** macierz bez nieprodukcyjnego `day` (4 tryby = 4 trasy), około 0,40 USD za pełną macierz (generowanie 0,15 + sędzia 0,25), a na PR-ze zmieniającym jeden prompt tylko tryby tego promptu (`gate-runs.md`).
- **Risk:** Pierwszy, bo cel `quality` nie odkłada pozycji ochronnej za wygodne, a dług `S-15` rośnie z każdym dniem na produkcji. Pułapka nazwana w Guardrail 2: przebieg zielony na części macierzy wygląda jak odwieszenie, a nim nie jest — kryterium musi umieć nie przejść (`lessons.md` §4). Pierwszy przebieg może być czerwony na `activity`; wtedy fundament niesie poprawkę promptu, nie tylko przestawienie flagi.
- **Status:** done

## Slices

### S-16: Reset zapomnianego hasła

- **Outcome:** Nauczycielka, która nie pamięta hasła, prosi o reset ze strony logowania, ustawia nowe hasło przez link z wiadomości e-mail, loguje się i zastaje wszystkie swoje plany; strona resetu mówi, gdzie szukać wiadomości i co zrobić, gdy nie przyjdzie.
- **Change ID:** password-reset
- **PRD refs:** FR-022, US-04
- **Prerequisites:** —
- **Parallel with:** F-02, S-17, S-18, S-19, S-20, S-21
- **Blockers:** —
- **Unknowns:**
  - Doręczalność — czy wysyłka e-maili auth przez domyślny kanał Supabase wystarcza (limity, filtry skrzynek szkolnych), czy potrzebny jest własny nadawca? Owner: `/10x-plan`. Block: nie.
  - Ścieżka zapasowa z FR-022 to formularz kontaktowy (FR-026), który powstaje w `S-19`. Jeśli `S-16` wyjdzie pierwszy, strona resetu wskazuje tymczasowo inny kanał i zostaje przepięta w `S-19`. Owner: `/10x-plan`. Block: nie.
- **Risk:** Pierwszy w rdzeniu, bo to jedyny ból obecnych nauczycielek z własną historyjką i warunek sprzedaży (`monetization.md` §6 #2). Nowa powierzchnia publiczna przyjmująca adres e-mail — odpowiedź nie może zdradzać, czy konto istnieje. Błędy Supabase idą przez `?error=` jako kod, nie zdanie (konwencja `supabase-error-copy`).
- **Status:** ready

### S-17: Zmiana hasła po zalogowaniu

- **Outcome:** Zalogowana nauczycielka zmienia hasło, a pozostałe urządzenia z otwartą sesją tego konta (np. komputer w przedszkolu) tracą dostęp.
- **Change ID:** password-change
- **PRD refs:** FR-023
- **Prerequisites:** —
- **Parallel with:** F-02, S-16, S-18, S-19, S-20, S-21
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Mała pozycja z jednym ostrzem, które przepisało FR w rundzie Sokratejskiej: zmiana bez wylogowania innych sesji nie pomaga po podejrzeniu włamania — kryterium akceptacji musi sprawdzać drugą sesję, nie tylko tę, w której zmieniono hasło. Otwiera pierwszy ekran ustawień konta, z którego korzysta też `S-18`.
- **Status:** ready

### S-18: Usunięcie konta wraz z planami

- **Outcome:** Nauczycielka usuwa swoje konto po potwierdzeniu, które mówi wprost, że zniknie konto i wszystkie plany; po usunięciu nie da się zalogować, a jej plany nie istnieją.
- **Change ID:** account-deletion
- **PRD refs:** FR-024; §Access Control Changes „Usunięcie konta przez użytkownika"
- **Prerequisites:** —
- **Parallel with:** F-02, S-16, S-17, S-19, S-20, S-21
- **Blockers:** —
- **Unknowns:**
  - Usunięcie użytkownika auth wymaga uprawnień, których aplikacja dziś nie ma (brak klucza serwisowego) — gdzie przebiega ta jedna operacja uprzywilejowana i jak jest odgrodzona? Owner: `/10x-plan`. Block: nie.
- **Risk:** Operacja nieodwracalna — potwierdzenie przez `useConfirmDialog` z `tone: "danger"`, przyciski nazwane skutkiem. Pierwsza ścieżka z uprawnieniami ponad RLS w całym produkcie, więc izolacja kont musi być udowodniona testem na dwóch kontach, nie założona. Warunek z FR-024 o aktywnej subskrypcji **nie** należy do tej pozycji — dokłada go `S-25`.
- **Status:** ready

### S-19: FAQ i formularz kontaktowy

- **Outcome:** Odwiedzający, z kontem lub bez, czyta FAQ (czym jest usługa, jak działa) i — gdy nie znajdzie odpowiedzi — wysyła wiadomość do właściciela przez formularz; wiadomość automatu do właściciela nie dociera, prawdziwa nie ginie.
- **Change ID:** help-and-contact
- **PRD refs:** FR-025 (część: FAQ), FR-026; §Constraints „Warunki jakościowe zmiany" (wiadomości automatów); §Access Control Changes „Nowa powierzchnia publiczna"
- **Prerequisites:** —
- **Parallel with:** F-02, S-16, S-17, S-18, S-20
- **Blockers:** —
- **Unknowns:**
  - Dokąd trafia wiadomość — e-mail do właściciela, zapis w bazie, czy oba (żeby „prawdziwa nie ginie" przeżyła awarię wysyłki)? Owner: `/10x-plan`. Block: nie.
  - Czy formularz może zbierać e-maile osób bez konta przed publikacją polityki prywatności (`S-20`)? Owner: Janusz + doradca. Block: nie dla planowania — może blokować wydanie (Open Roadmap Questions #11).
- **Risk:** FAQ i formularz idą razem, bo FAQ bez kanału „nie znalazłeś odpowiedzi?" jest ślepą uliczką, a formularz bez FAQ ściąga pytania, na które odpowiedź jest stała. Pozycja wprowadza ochronę przed automatami, którą później dziedziczy zapis na cenę (`S-22`) — wymaganie jakościowe dotyczy obu powierzchni, więc kształt ochrony musi dać się użyć drugi raz, nie być przyklejony do jednego formularza. FAQ nie czeka na prawnika; dlatego oddzielone od `S-20`.
- **Status:** ready

### S-20: Regulamin i polityka prywatności

- **Outcome:** Odwiedzający bez konta czyta regulamin i politykę prywatności, a polityka obejmuje przechowywanie e-maili osób, które nie mają konta (formularz kontaktowy, zapis na cenę).
- **Change ID:** legal-pages
- **PRD refs:** FR-025 (część: regulamin, polityka prywatności); §Constraints „Dane osób bez konta"
- **Prerequisites:** treść regulaminu i polityki prywatności od księgowego/prawnika
- **Parallel with:** F-02, S-16, S-17, S-18, S-19, S-21
- **Blockers:** Treść prawna — zależność zewnętrzna (PRD §Constraints „Zależności zewnętrzne"; Open Roadmap Questions #6).
- **Unknowns:**
  - Treść regulaminu i polityki — Owner: Janusz + doradca. Block: tak.
- **Risk:** Najmniejsza technicznie i jedyna pozycja rdzenia trzymana przez kogoś spoza projektu — dlatego to główne ryzyko kamienia (`top_blocker: external`): stoi w prerekwizytach gwiazdy przewodniej. Regulamin zostanie przepisany przy płatnościach (`S-25`, `S-26`); ta wersja opisuje usługę darmową i nie może obiecywać tego, czego jeszcze nie ma.
- **Status:** blocked

### S-21: Limit fair use

- **Outcome:** Nauczycielka generuje, edytuje, zatwierdza, usuwa i drukuje plany jak dziś; dopiero nadużycie zatrzymuje generowanie komunikatem, który mówi, kiedy generowanie znów będzie możliwe, i wskazuje kontakt na wypadek pomyłki.
- **Change ID:** fair-use-limit
- **PRD refs:** FR-027, FR-038; §Business Logic Changes „Nowa reguła" (pula dni w miesiącu kalendarzowym); Guardrail 1; §Constraints „Migracja danych"
- **Prerequisites:** S-19 (komunikat wskazuje formularz kontaktowy)
- **Parallel with:** F-02, S-16, S-17, S-18, S-20
- **Blockers:** —
- **Unknowns:**
  - Próg fair use — `monetization.md` §4.3 szacuje ~150 dni-generacji, bez danych z produkcji. Owner: Janusz, na danych z produkcji. Block: tak (Open Roadmap Questions #3).
  - Jednostka poprawki aktywności (`refine.ts`) w puli fair use — PRD wiąże ją do limitu dopiero po wygaśnięciu planu (FR-037). Owner: Janusz. Block: nie dla tej pozycji (Open Roadmap Questions #4 blokuje `S-27`).
- **Risk:** Największy zasięg awarii w kamieniu, wskazany przez użytkownika: licznik jest wspólny dla czterech tras wołających model, więc jego błąd zatrzymuje generowanie wszędzie naraz — a Guardrail 1 mówi, że błąd licznika **nie może** zatrzymać generowania. Tydzień to pięć niezależnych wywołań `week/day.ts` z klienta, więc zliczanie musi być atomowe w bazie, inaczej równoległe wywołania przejdą przez limit razem. Obecne konta: licznik startuje od zera w miesiącu wejścia, nic nie liczy się wstecz. Nowe dane per konto — izolacja kont i świadome uprawnienia zapisu (przypomnienie z `M-02`).
- **Status:** blocked

### S-22: Cennik i zapis na cenę założycielską (gwiazda przewodnia)

- **Outcome:** Odwiedzający albo zalogowana nauczycielka widzi cennik planów Darmowy i Basic z cenami, klika „Zarezerwuj cenę założycielską", podaje e-mail i dostaje potwierdzenie: płatności jeszcze nie działają, jest zapisana, dostanie wiadomość; zapisy kont aktywnych są policzalne osobno od anonimowych.
- **Change ID:** founder-price-signup
- **PRD refs:** FR-028, FR-029, US-05; §Success Criteria Primary #6 i „Rozszerzenie warunkowe"; §Access Control Changes „Fake door"; §Constraints „Warunki jakościowe zmiany"
- **Prerequisites:** F-02, S-16, S-17, S-18, S-19, S-20, S-21 (kolejność z decyzji `shape-notes.md` §Forward, nie z danych — rdzeń przed zapisem)
- **Parallel with:** —
- **Blockers:** — (przechodnio: treść prawna przez `S-20`)
- **Unknowns:**
  - Definicja „konta aktywnego" — jeden wygenerowany dzień, tydzień, aktywność w ostatnim miesiącu? Owner: Janusz. Block: tak (Open Roadmap Questions #2) — zapis musi wiedzieć, co liczy.
  - Kiedy rusza okno 4 tygodni — `shape-notes.md` §Forward wiąże je z oknem planowania pod koniec miesiąca (`monetization.md` §4.4). Owner: Janusz. Block: nie.
- **Risk:** Gwiazda przewodnia stoi ostatnia w rdzeniu z wyboru, nie z grafu — ryzyko polega na tym, że zablokowany prawnikiem `S-20` przesuwa pomiar o tyle samo, ile trwa zależność zewnętrzna. Zapis anonimowy jest dostępny, ale do progu się nie wlicza (FR-029, runda Sokratejska: „zapis jest tani, zapłata droga"). Żadna płatność nie jest symulowana. Cennik nie pokazuje Pro (FR-028). Zapis to zgoda na kontakt e-mailowy — polityka prywatności musi go obejmować (`S-20`).
- **Status:** blocked

### S-23: Okres próbny i stan planu konta (krok 7)

- **Outcome:** Nowe konto dostaje pierwszy miesiąc od rejestracji z pełnym zakresem Basic, bez podawania karty, a nauczycielka widzi stan swojego planu i datę, do której trwa — tylko do odczytu.
- **Change ID:** trial-entitlement
- **PRD refs:** FR-030; §Business Logic Changes „Druga reguła" („plan + dostęp do daty"); §Access Control Changes „Stan planu konta — kto go zmienia"
- **Prerequisites:** S-22, wynik bramy kroku 7
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Wynik bramy kroku 7 (≥ 10 zapisów kont aktywnych w 4 tygodnie). Owner: Janusz. Block: tak (Open Roadmap Questions #1).
- **Risk:** Wprowadza jedyny model uprawnienia, na którym stoją `S-24`…`S-27` — błąd tutaj powiela się w każdej płatności. Stan planu zapisuje wyłącznie system albo właściciel ręcznie poza aplikacją; użytkownik nie ma żadnej ścieżki podniesienia planu inaczej niż płacąc. Ryzyko zakładania kont na nowo co miesiąc przyjęte świadomie (FR-030; Open Roadmap Questions #7). Sama pozycja nie pobiera pieniędzy i niczego nie odbiera, więc może wejść na produkcję samodzielnie.
- **Status:** blocked

### S-24: Prezent dla kont sprzed płatności (krok 7)

- **Outcome:** Konto założone przed wejściem płatności dostaje cenę założycielską i okres Basic gratis, a nauczycielka dowiaduje się o nowych zasadach i prezencie, zanim limit planu darmowego ją dotknie.
- **Change ID:** existing-accounts-gift
- **PRD refs:** FR-036; §User & Persona „Grupa szczególna"
- **Prerequisites:** S-23
- **Parallel with:** S-25, S-26
- **Blockers:** —
- **Unknowns:**
  - Długość okresu Basic gratis — `monetization.md` §4.4: „np. 3 miesiące". Owner: Janusz. Block: tak (Open Roadmap Questions #5).
  - Wynik bramy kroku 7. Owner: Janusz. Block: tak.
- **Risk:** Sednem jest kolejność, nie prezent: uprzedzenie musi wyprzedzić `S-27`, inaczej obecne nauczycielki poznają nowe zasady przy pierwszym limicie — dokładnie to, co runda Sokratejska uznała za zmianę zasad bez zgody. Kryterium Secondary („żadne aktywne konto nie odchodzi z powodu zmian kamienia") mierzy się właśnie tutaj.
- **Status:** blocked

### S-25: Subskrypcja Basic kartą (krok 7)

- **Outcome:** Nauczycielka wykupuje Basic jako subskrypcję kartą — roczną (domyślnie) albo miesięczną, po cenie założycielskiej, jeśli jej przysługuje — zarządza nią (anuluje, zmienia metodę płatności), a po anulowaniu dostęp trwa do końca opłaconego okresu; usunięcie konta z aktywną subskrypcją ją kończy.
- **Change ID:** basic-subscription
- **PRD refs:** FR-032, FR-034, FR-035, FR-024 (warunek subskrypcji); Guardrail 3
- **Prerequisites:** F-02, S-18, S-22 (lista zapisanych → cena), S-23, Krok 9 `next-actions.md` (e2e w CI), konto operatora płatności
- **Parallel with:** S-24, S-26
- **Blockers:** Konto operatora płatności i formalności (JDG, księgowy, faktury) — Krok 11 `next-actions.md`; PRD §Constraints „Zależności zewnętrzne".
- **Unknowns:**
  - Wynik bramy kroku 7. Owner: Janusz. Block: tak.
  - Zwrot — Guardrail 3 wymienia go wśród warunków bezpiecznej płatności, a FR go nie nazywa; `monetization.md` §4.4 proponuje gwarancję 14 dni. Owner: Janusz. Block: tak (Open Roadmap Questions #12).
- **Risk:** Guardrail 3 — „płatności kompletem albo wcale": zakup, zarządzanie, anulowanie, wygaśnięcie i zwrot wychodzą jednym wydaniem, bo połowa integracji dotyczy cudzych pieniędzy. Dostęp przyznaje wyłącznie potwierdzenie od operatora — ryzyka do mapy testów z Kroku 9: potwierdzenie przyznające dostęp cudzemu kontu, dostęp, który nie wygasa. Regulamin z `S-20` do przepisania przed wydaniem.
- **Status:** blocked

### S-26: Dostęp jednorazowy BLIK-iem albo przelewem (krok 7)

- **Outcome:** Nauczycielka bez karty wykupuje Basic jednorazowo — na miesiąc albo na rok szkolny — BLIK-iem albo przelewem, bez automatycznego odnowienia; zakup przy aktywnym dostępie wydłuża datę, nie dubluje jej.
- **Change ID:** one-time-access
- **PRD refs:** FR-033; §Business Logic Changes „Druga reguła"
- **Prerequisites:** F-02, S-23, Krok 9 `next-actions.md` (e2e w CI), konto operatora płatności
- **Parallel with:** S-24, S-25
- **Blockers:** Konto operatora płatności z BLIK-iem i przelewem online — Krok 11 `next-actions.md`.
- **Unknowns:**
  - Wynik bramy kroku 7. Owner: Janusz. Block: tak.
  - Czy cena założycielska (FR-035) obejmuje też dostęp jednorazowy, czy tylko subskrypcję? Owner: Janusz. Block: nie — rozstrzyga `/10x-plan` z właścicielem.
- **Risk:** Drugie źródło płatności przesuwające tę samą datę — runda Sokratejska przyjęła je pod warunkiem jednego modelu uprawnienia (FR-033). Ryzykiem jest rozjazd: dwa źródła liczące datę każde po swojemu. Bez odnowienia nie ma czego zarządzać, więc Guardrail 3 sprowadza się tu do zwrotu i wygaśnięcia.
- **Status:** blocked

### S-27: Plan darmowy i zachowanie planów po wygaśnięciu (krok 7)

- **Outcome:** Nauczycielka na planie darmowym planuje pięć dni roboczych w miesiącu kalendarzowym (komunikowane jako „tydzień"); próba zaplanowania kolejnego pokazuje cennik zamiast generowania; po wygaśnięciu planu zachowuje odczyt, ręczną edycję i druk tygodnia wszystkich zaplanowanych dni.
- **Change ID:** free-tier-limit
- **PRD refs:** FR-031, FR-037; §Business Logic Changes „Pula … po bramie płatności"
- **Prerequisites:** S-21 (pula dni i licznik), S-24 (obecne konta uprzedzone przed limitem), S-25 (cennik prowadzi do zakupu, który działa)
- **Parallel with:** S-26
- **Blockers:** —
- **Unknowns:**
  - Jednostka liczenia poprawki poleceniem (FR-037 vs Non-Goals bez osobnego limitu poprawek). Owner: Janusz. Block: tak (Open Roadmap Questions #4).
  - Wynik bramy kroku 7. Owner: Janusz. Block: tak.
- **Risk:** Ostatnia, bo jako jedyna **odbiera** coś użytkownikowi — przed nią musi istnieć uprzedzenie (`S-24`) i działający zakup (`S-25`), inaczej cennik w miejscu generowania jest ścianą bez drzwi. Reguła „to, co zaplanowane, nigdy nie jest odbierane" wiąże: tydzień przecinający dwa miesiące liczy dni do ich miesięcy (FR-031), a zatwierdzanie, usuwanie i druk tygodnia nie podlegają limitowi.
- **Status:** blocked

## Backlog Handoff

| Roadmap ID | Change ID                  | Suggested issue title                                              | Ready for `/10x-plan` | Notes                                                                    |
| ---------- | -------------------------- | ------------------------------------------------------------------ | --------------------- | ------------------------------------------------------------------------ |
| F-02       | content-safety-gate-resume | Odwieszenie bramki bezpieczeństwa treści na pełnej macierzy        | yes                   | Odblokowuje gwiazdę przewodnią `S-22`; pierwszy tryb do przebiegu: `activity` |
| S-16       | password-reset             | Reset zapomnianego hasła przez e-mail                              | yes                   | `/10x-plan password-reset`                                               |
| S-17       | password-change            | Zmiana hasła z wylogowaniem pozostałych sesji                      | yes                   | Otwiera ekran ustawień konta                                             |
| S-18       | account-deletion           | Usunięcie konta wraz z planami                                     | yes                   | Pierwsza operacja ponad RLS — test izolacji na dwóch kontach             |
| S-19       | help-and-contact           | FAQ i formularz kontaktowy chroniony przed automatami              | yes                   | Ochrona przed automatami do ponownego użycia w `S-22`                    |
| S-20       | legal-pages                | Regulamin i polityka prywatności                                   | no                    | Czeka na treść od księgowego/prawnika                                    |
| S-21       | fair-use-limit             | Limit fair use z komunikatem o terminie powrotu                    | no                    | Czeka na próg z danych produkcji (Open Roadmap Questions #3)            |
| S-22       | founder-price-signup       | Cennik i zapis na cenę założycielską (fake door)                   | no                    | Gwiazda przewodnia; czeka na definicję konta aktywnego i rdzeń           |
| S-23       | trial-entitlement          | Okres próbny i stan planu konta                                    | no                    | Krok 7 — po bramie                                                       |
| S-24       | existing-accounts-gift     | Prezent i uprzedzenie dla kont sprzed płatności                    | no                    | Krok 7 — po bramie; długość okresu gratis                                |
| S-25       | basic-subscription         | Subskrypcja Basic kartą z zarządzaniem i zwrotem                   | no                    | Krok 7 — po bramie, Kroku 9 i Kroku 11                                   |
| S-26       | one-time-access            | Dostęp jednorazowy BLIK-iem albo przelewem                         | no                    | Krok 7 — po bramie, Kroku 9 i Kroku 11                                   |
| S-27       | free-tier-limit            | Plan darmowy: pięć dni w miesiącu i plany po wygaśnięciu           | no                    | Krok 7 — ostatni; jednostka poprawki                                     |

## Open Roadmap Questions

1. **Wynik bramy kroku 7** — ≥ 10 zapisów kont aktywnych na cenę założycielską w ciągu 4 tygodni od uruchomienia zapisu (`S-22`). Gdy nie pada, kamień zamyka się na `S-22`, a `S-23`…`S-27` idą do §Parked. Owner: Janusz. Block: `S-23`, `S-24`, `S-25`, `S-26`, `S-27`. _(Źródło: PRD §Success Criteria „Rozszerzenie warunkowe"; PRD §Open Questions #1 — brak walidacji z Kroku 11, przyjęte ryzyko.)_
2. **Definicja „konta aktywnego" dla bramy płatności** (FR-029) — jeden wygenerowany dzień, tydzień, aktywność w ostatnim miesiącu? Owner: Janusz. Block: `S-22`.
3. **Próg fair use** — ~150 dni-generacji to szacunek bez danych z produkcji; Guardrail 1 wymaga, żeby typowy miesiąc nigdy go nie dotknął. Owner: Janusz, na danych z produkcji. Block: `S-21`.
4. **Jednostka liczenia poprawki poleceniem** (FR-037 vs Non-Goals bez osobnego limitu poprawek) — dzień z puli, ułamek dnia, coś innego? Owner: Janusz. Block: `S-27`.
5. **Długość okresu Basic gratis dla obecnych kont** (FR-036; `monetization.md` §4.4: „np. 3 miesiące"). Owner: Janusz. Block: `S-24`.
6. **Treść regulaminu i polityki prywatności** — zależność zewnętrzna; polityka musi objąć e-maile osób bez konta. Owner: Janusz + doradca. Block: `S-20` (przechodnio `S-22`).
7. **Ryzyko zakładania kont na nowo (FR-030) przy wzroście skali** — przyjęte przy małej skali, do ponownej oceny, gdy skala przestanie być mała. Owner: Janusz. Block: nie — roadmap-wide.
8. **Zamykane przez ten kamień:** dawne Open Roadmap Questions #4 (reset hasła → `S-16`) i #5 (limit regeneracji → `S-21`). Owner: —. Block: nie.
9. **Brak bramki czasowej** (`delivery_weeks: null`) — świadoma decyzja z 2026-10-01; nic nie powie, że `M-03` trwa za długo. Obroną jest dyscyplina slice'ów (każdy osobnym wydaniem) i Guardrail 3. Owner: Janusz. Block: nie — roadmap-wide.
10. **Dług PRD za `S-04`, `S-05` i `S-08` pozostaje otwarty — ślad kontrolny.** Decyzja z 2026-09-19: żaden kolejny PRD nie spłaca go wstecz. Przy każdej regeneracji roadmapy sprawdź, czy obietnica spłaty nie wróciła. Ta regeneracja (2026-10-01) sprawdzona — §Milestone niesie odroczenie, nie obietnicę. Owner: Janusz. Block: nie — roadmap-wide.
11. **Zbieranie e-maili przed polityką prywatności** — `S-19` (formularz) jest `ready`, a `S-20` czeka na prawnika. Czy formularz może wejść na produkcję przed publikacją polityki, czy jego wydanie czeka na `S-20`? Owner: Janusz + doradca. Block: wydanie `S-19` (nie planowanie).
12. **Zwrot pieniędzy** — Guardrail 3 wymienia zwrot wśród warunków bezpiecznej płatności, ale żadne FR go nie nazywa; `monetization.md` §4.4 proponuje gwarancję 14 dni bez pytań. Owner: Janusz. Block: `S-25`, `S-26`.
13. **Generator nie dostarcza tekstów, od których zależy aktywność** (piosenki, wierszyki) — przechodzi do `M-04` jako pierwsza funkcja Pro (`monetization.md` §Decyzje #6). Owner: Janusz. Block: nie.

## Parked

- **Pro i jego funkcje** (materiały, dokumentacja, kilka grup, eksport DOCX) — Why parked: PRD v3 §Non-Goals; kamień `M-04`. Cennik nie pokazuje Pro (FR-028).
- **Placówka, faktura na przedszkole, role operatora i dyrektora** — Why parked: PRD v3 §Non-Goals; decyzja B2C (`monetization.md` §Decyzje #4).
- **Różnicowanie funkcji planu darmowego** (osobny limit poprawek, druk miesiąca tylko w Basic, stopka na darmowym wydruku) — Why parked: PRD v3 §Non-Goals; plan darmowy różni się od Basic wyłącznie pulą dni.
- **Panel operatora w aplikacji** — Why parked: PRD v3 §Non-Goals; stan planu, prezenty i wyjątki właściciel ustawia ręcznie poza aplikacją.
- **Upgrade'y, proracja i wiele planów płatnych** — Why parked: PRD v3 §Non-Goals; jeden plan płatny w modelu „plan + dostęp do daty".
- **E-mail „zaplanuj następny miesiąc" ok. 20.–25.** — Why parked: `monetization.md` §7 Faza 2, bez FR w PRD v3; wraca przy starcie sprzedaży, jeśli brama przejdzie.
- **Zmiana wytycznych generowania i doboru treści** (rodzaje aktywności, kalendarz świąt, materiały) — Why parked: PRD v3 §Business Logic „Reguła rdzeniowa bez zmian"; kamień `M-04` z researchem dziedzinowym.
- **Cofanie operacji (undo) i kosz** — Why parked: PRD v2 §Non-Goals; kasowanie pozostaje twarde zgodnie z decyzją `S-05`.
- **Profile grup przedszkolnych, dane o dzieciach** — Why parked: PRD v1 §Non-Goals; plan jest własnością nauczyciela, nie grupy.
- **Observability** — Why parked: żadne FR v3 jej nie implikuje (§Baseline); do ponownej oceny przy płatnościach, jeśli plan `S-25` wskaże potrzebę śledzenia błędów potwierdzeń płatności.

## Milestone History

(Append-only. Przenoszone verbatim do roadmapy każdego kolejnego kamienia.)

- **M-01: Użyteczny plan miesiąca** (`usable-month-plan`) — closed 2026-08-30. Nauczyciel prowadzi pełny cykl planowania miesiąca w jednym miejscu: generuje dzień i tydzień, edytuje, akceptuje, usuwa i odróżnia dni po podtytule.
  - **Zamknięty z niepełnym zakresem.** `S-07` (`month-day-preview`, podgląd aktywności w siatce miesiąca) został 2026-08-30 jawnie wypisany z kamienia i przeniesiony do `M-02`. Kamień zamknął się więc **bez odczytu aktywności z siatki**, mimo że ten człon stoi wprost w jego intencie.
  - **Dlaczego mimo to zamknięty:** `S-07` był `ready`, ale bez własnego FR (PRD v1 wyczerpał się na `S-03` — Open Roadmap Questions #3). Zbudowanie go przed PRD v2 oznaczałoby dopisywanie wymagania wstecz do gotowego kodu; trzymanie kamienia otwartego oznaczałoby blokowanie go zależnością papierową. Wybrano trzecią drogę: skrócić zakres świadomie i wejść w `M-02` z czystym kontem.
  - **Dług przeniesiony dalej:** `S-04`, `S-05` i `S-08` są zarchiwizowane z pustą rubryką „PRD refs". **Poprawka 2026-09-19:** PRD v2 tego długu **nie** spłaca — patrz Open Roadmap Questions #3. Wcześniejszy zapis („PRD v2 spłaca to wstecz") był obietnicą wycofaną decyzją użytkownika.
- **M-02: Plan, którym da się zarządzać** (`manageable-month-plan`) — closed 2026-09-29. Nauczyciel poprawia, odczytuje i wynosi plan poza aplikację: regeneruje tydzień z zastępowaniem (także dni zaakceptowanych, po jawnej zgodzie), edytuje dzień zaakceptowany kosztem akceptacji, cofa akceptację i usuwa dzień z widoku tygodnia, podgląda aktywności w siatce miesiąca, drukuje tydzień i miesiąc oraz poprawia pojedynczą aktywność poleceniem dla modelu.
  - **Zamknięty w pełnym zakresie**, łącznie z `S-10` (FR-013, jedyny nice-to-have) i z `S-15` dopisanym w trakcie bez FR w PRD v2.
  - **Dług przeniesiony dalej:** bramka bezpieczeństwa treści zawieszona od 2026-09-19 (`src/lib/services/gate-suspension.ts`); `refine-activity.pl.md` z `S-15` wszedł na produkcję oceniony tylko ręcznie. Dług PRD za `S-04`, `S-05`, `S-08` bez zmian (Open Roadmap Questions #3). Faza 3 `test-plan.md` wciąż `not started`.

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
- **S-11: Nauczyciel może cofnąć akceptację dnia i usunąć zapisany plan dnia, nie wychodząc z widoku tygodnia — czyli z widoku, w którym faktycznie pracuje, zamiast wchodzić w dzień po kolei.** — Archived 2026-09-23 → `context/archive/2026-09-23-week-level-plan-controls/`. Lesson: —.
- **S-07: Nauczyciel widzi aktywności zaplanowane na dany dzień bez opuszczania siatki miesiąca, a kafelek mieści pełny podtytuł dnia — nieucięty.** — Archived 2026-09-27 → `context/archive/2026-09-23-month-day-preview/`. Lesson: —.
- **S-13: Nauczyciel może wydrukować tydzień w postaci czytelnej na papierze i oddać go bez przepisywania czegokolwiek do innego narzędzia; wydruk obejmuje wszystkie dni robocze, a dni niezaakceptowane są na nim widocznie oznaczone jako szkic roboczy.** — Archived 2026-09-27 → `context/archive/2026-09-27-week-print/`. Lesson: —.
- **S-14: Nauczyciel może pobrać z widoku miesiąca plik PDF z planem całego miesiąca, czytelny na papierze; wydruk obejmuje wszystkie dni robocze miesiąca, a dni niezaakceptowane i dni bez planu są oznaczone tak samo jak w wydruku tygodnia.** — Archived 2026-09-27 → `context/archive/2026-09-27-month-print/`. Lesson: —.
- **S-15: Nauczyciel może przy jednej aktywności w widoku dnia wpisać polecenie dla modelu („dopisz słowa piosenki", „zamień na zabawę ruchową"); poprawiony tytuł i opis trafiają do szkicu tej aktywności i zapisują się dopiero przyciskiem „Zapisz".** — Archived 2026-09-28 → `context/archive/2026-09-28-follow-up-questions/`. Lesson: —.
- **S-10: Nauczyciel może jawnie rozszerzyć regenerację tygodnia na dni zaakceptowane, zamiast najpierw cofać akceptacje po kolei.** — Archived 2026-09-29 → `context/archive/2026-09-28-accepted-day-replacement/`. Lesson: —.
- **F-02: (foundation) bramka bezpieczeństwa treści przechodzi na żywo dla każdego dopuszczonego modelu i każdego trybu generowania (dzień, tydzień, poprawka aktywności), a zmiana promptu albo modelu znów nie wchodzi na produkcję bez jej przebiegu.** — Archived 2026-10-03 → `context/archive/2026-10-01-content-safety-gate-resume/`. Lesson: —.
