# Next Actions — ustalenia z 2026-08-30, stan na 2026-09-30

> Runbook kolejności prac i komend 10x. Dokument roboczy, edytowany w miejscu:
> odhaczaj kroki i dopisuj nowe zgłoszenia. Decyzje produktowe mieszkają w
> `roadmap.md` — tutaj jest **kolejność i to, co uruchomić**, nie druga kopia tamtych decyzji.

## Stan (2026-09-30)

- **`M-02` zamknięty 2026-09-29 w pełnym zakresie** — osiem pozycji `done` (`S-07`, `S-09`…`S-15`),
  łącznie z nice-to-have `S-10` (`accepted-day-replacement`, PR #35) i dopisanym w trakcie
  `S-15` (`follow-up-questions`). Wszystko jest na produkcji. Wpis: `roadmap.md` §Milestone History.
- **Kroki 1–5 zamknięte.** **Kolejność dalszych prac przestawiona 2026-09-29** — patrz
  §Kolejka po `M-02`. **Krok 10 (design z Claude Design) zamknięty 2026-09-30** — obie zmiany
  (`design-foundation` PR #37, `design-planner` PR #38) są na produkcji, przejście po produkcji
  zrobione, obie zarchiwizowane. **Krok 6 (faza 3 test-planu) zamknięty 2026-09-30** —
  PR #39 (`testing-write-ownership`) na produkcji, zarchiwizowany. **Następny jest Krok 12.**
- **Monetyzacja ma decyzje** (2026-09-29): Free + Basic 19,99 zł teraz, Pro 39,99 zł później
  zaczynając od materiałów, B2C, JDG. Pełny zapis: `monetization.md` §Decyzje.
- Żadna zmiana nie jest w locie (`context/changes/` pusty). Żaden kamień nie jest otwarty
  (`milestone_status: done`).
- `test-plan.md` §3: fazy 1–3 `complete`, faza 4 `not started`. Testy bazy (pgTAP i trasa +
  prawdziwy klient) stoją w CI jako doradczy job `db`. Warstwa e2e (Playwright, ryzyka #3, #4
  i #7) stoi na `master` poza rolloutem i poza CI.
- **Bramka bezpieczeństwa treści zawieszona od 2026-09-19** (koszt OpenRouter,
  `src/lib/services/gate-suspension.ts`). `refine-activity.pl.md` z `S-15` wszedł na produkcję
  oceniony tylko ręcznie — po odwieszeniu pierwszy do uruchomienia jest tryb `activity`.
- Otwarte pytania roadmapy bez właściciela w kolejce: #4 reset hasła, #5 limit regeneracji,
  #9 generator bez tekstów piosenek i wierszyków; #3 (dług PRD za `S-04`, `S-05`, `S-08`)
  zostaje otwarte z wyboru.

## Triage dziesięciu zgłoszeń

| #   | Zgłoszenie                                           | Gdzie trafia                                        |
| --- | ---------------------------------------------------- | --------------------------------------------------- |
| 1   | Kafelek mieści cały podtytuł                         | wchłonięte przez `S-07`                             |
| 2   | Podgląd aktywności na hoverze                        | `S-07` — pierwszy slice `M-02`                      |
| 3   | Akceptacja blokuje edycję                            | paczka `M-02` (zawężone)                            |
| 4   | Przyciski cofnięcia/usunięcia wyżej                  | paczka `M-02` (razem z #3)                          |
| 5   | Tydzień zablokowany, gdy wszystkie dni zaakceptowane | paczka `M-02` (zawężone)                            |
| 6   | Cofnięcie akceptacji i usunięcie z widoku tygodnia   | paczka `M-02`                                       |
| 7   | Polska strona główna                                 | ✅ **wdrożone 2026-08-30** (`pl-landing-copy`)      |
| 8   | Rodzaje aktywności                                   | odwrócenie PRD §Non-Goals — osobno                  |
| 9   | Wydruk zaakceptowanego tygodnia                      | paczka `M-02`                                       |
| 10  | Monetyzacja                                          | własny kamień milowy, na końcu                      |

Do paczki `M-02` doszła pozycja, której nie było na liście: **regeneracja tygodnia z
zastępowaniem istniejących dni** — wyszła z doprecyzowania #2 i jest najcięższa z całej paczki.

## Kolejka po `M-02` (ustalona 2026-09-29)

Wejście: `monetization.md` (research i decyzje) oraz `new-ideas.md` (lista zgłoszeń Janusza).
Numeracja kroków jest stała, więc nowe kroki dostają numery od 10, a **o kolejności decyduje ta
tabela, nie numer**.

| Kolejność | Krok | Co | Rodzaj |
| --- | --- | --- | --- |
| 1 | ✅ **Krok 10** | Design z Claude Design na istniejących ekranach — zamknięty 2026-09-30 | zmiana (bez PRD) |
| równolegle | **Krok 11** | Walidacja i sprawy formalne (rozmowy, dane z produkcji, JDG, Stripe, księgowa) | poza kodem |
| 2 | ✅ Krok 6 | Faza 3 test-planu (ochrona zapisu i własności) — zaimplementowana 2026-09-30, PR #39 | test-plan |
| 3 | **Krok 12** | PRD v3 i roadmapa kamienia `M-03` „Gotowi do sprzedaży" | shape → prd → roadmap |
| 4 | **Krok 13** | Slice'y `M-03` bez pieniędzy: reset hasła, strony prawne i FAQ, kontakt, limity | slice'y |
| 5 | Krok 9 | Faza 4 test-planu: e2e w CI **przed** pierwszym slice'em płatności | test-plan |
| 6 | **Krok 14** | Slice'y `M-03` z pieniędzmi: Stripe, cennik i paywall; odwieszenie bramki; start sprzedaży | slice'y + wydanie |
| 7 | **Krok 15** | Kamień `M-04` „Lepsza treść": kalendarz świąt, rodzaje aktywności, materiały → start Pro | shape → prd → roadmap |

Dlaczego tak:

- **Design pierwszy.** Każda powierzchnia `M-03` to nowy ekran: cennik, paywall, FAQ, regulamin,
  kontakt, reset hasła. Zbudowane na starym wyglądzie trzeba by przerabiać drugi raz.
- **Krok 9 przesunięty przed płatności.** Merge do `master` to wydanie, a błąd w webhooku albo
  w uprawnieniach kosztuje pieniądze klientów, nie tylko wygląd. Płatności nie wchodzą bez e2e w CI.
- **Krok 7 (rodzaje aktywności) wchłonięty przez Krok 15.** Rodzaje aktywności, kalendarz świąt
  i materiały zmieniają wytyczne generowania. Każda taka zmiana wymaga przebiegu bramki dla każdego
  modelu (`lessons.md` §3), więc robimy je jedną sesją `/10x-shape` z researchem dziedzinowym,
  a nie trzema.
- **Limity przed płatnościami.** Licznik, darmowy tydzień i reverse trial działają bez Stripe'a
  (każdy dostaje plan wynikający z reguły). Slice płatności tylko przestawia datę dostępu, więc jest
  mniejszy, a limity można obejrzeć na produkcji, zanim ktoś zapłaci.

## Kolejność — krok po kroku

Jeden folder zmiany w locie naraz. Między handoffami `/clear`.
Numeracja kroków jest stała — kroki domknięte zostają na liście, nie są usuwane.
Kolejność kroków od 6 wzwyż: §Kolejka po `M-02`.

### ✅ Krok 1 — `pl-landing-copy` (zgłoszenie #7) — ZROBIONE 2026-08-30

Łańcuch przeszedł zgodnie z planem (`/10x-research` pominięty, jak zakładano):
`/10x-new` → `/10x-plan` → `/10x-implement` (2 fazy) → `/10x-impl-review` → `/10x-archive`.
Gałąź `chore/pl-landing-copy`, PR #19, merge do `master` = deploy na produkcję.

**Zakres wyszedł szerszy niż „copy w jednym komponencie" z runbooka.** Powierzchnia
okazała się całym lejkiem niezalogowanego, nie samym landingiem:

- faza 1 — `src/components/Welcome.astro` (copy **zastąpione**, nie przetłumaczone: starter
  reklamował szablon Astro, nie produkt), `src/components/Topbar.astro`,
  `src/layouts/Layout.astro` (`lang="en"` → `lang="pl"` dla całej aplikacji, domyślny
  `title`), `src/pages/index.astro` (własny `title`);
- faza 2 — `src/pages/auth/{signin,signup,confirm-email}.astro`,
  `src/components/auth/{SignInForm,SignUpForm,PasswordToggle}.tsx`,
  `src/pages/api/auth/{signin,signup}.ts` (nasz własny string „Supabase is not configured").

Przegląd: `NEEDS ATTENTION`, 0 critical / 3 warnings / 3 observations. F1–F3 poprawione
w `0246bf5`. **Ogony poniżej — patrz §Otwarte ogony po Kroku 1.**

### ✅ Krok 1a — `supabase-error-copy` (ogon po Kroku 1) — ZROBIONE 2026-08-31

```
git checkout -b fix/supabase-error-copy   # ✅ zrobione 2026-08-31
/10x-new supabase-error-copy              # ✅ zrobione 2026-08-31
/10x-plan supabase-error-copy             # ✅ zrobione 2026-08-31
/10x-plan-review                          # pominięte — zmiana jest mała
/10x-implement supabase-error-copy        # ✅ zrobione 2026-08-31 (3 fazy)
/10x-impl-review                          # ✅ zrobione 2026-08-31 (6 findingów, 5 naprawionych)
/10x-archive supabase-error-copy          # ✅ zrobione 2026-08-31 (73b0d85)
gh pr merge 20 --merge                    # ✅ zrobione 2026-08-31 (bed1c12) = deploy na produkcję
```

Numer `1a`, nie `10` — numeracja kroków jest stała, a ta pozycja nie jest nowym punktem
planu, tylko domknięciem ogona po Kroku 1. **`/10x-research` pomijalny**: powierzchnia to
pięć plików, a kluczowy fakt zewnętrzny (kształt `AuthError`) czyta się wprost
z zainstalowanych typów.

**Cztery decyzje zamknięte 2026-08-31, przed planowaniem** — pełne uzasadnienia w
`context/archive/2026-08-31-supabase-error-copy/change.md`:

1. **Mapujemy po `error.code`, nie po `error.message`.** Follow-up zakładał kompromis; w
   `@supabase/auth-js` 2.105.3 kompromisu nie ma — `code` jest typowaną unią `ErrorCode`,
   a `AuthApiError` zawsze niesie `status`.
2. **Fallback: generyczny polski komunikat** + oryginał do `console.error` (logi Cloudflare).
3. **Mapa w `src/lib/`** — dwie trasy ją wołają (`CLAUDE.md` §Services/helpers). Nie
   `src/lib/services/`: czysta funkcja `code → tekst`, bez dotykania Supabase i bazy.
4. **W `?error=` jedzie kod, nie gotowy tekst** (decyzja spoza follow-upu). Tłumaczenie przy
   renderze. Zamyka przy okazji dziurę, której follow-up nie zauważył: dziś
   `?error=<dowolny tekst>` renderuje się na stronie logowania jak nasz własny komunikat —
   nie XSS, bo React escapuje, ale gotowy nośnik pod phishing.

Zakres obejmuje więc `src/pages/auth/{signin,signup}.astro` obok dwóch tras API — czyli
znów wyszedł szerszy niż bramka w §Otwarte ogony sugerowała. Patrz lekcja procesowa niżej.

### ✅ Krok 2 — faza 2 test-planu (bramka bezpieczeństwa treści) — ZROBIONE 2026-09-02

Łańcuch orkiestratora przeszedł przez `/10x-new` → `/10x-research` → `/10x-plan` →
`/10x-implement` (4 fazy planu) → `/10x-impl-review` → `/10x-archive`. Gałąź
`feat/testing-content-safety-gate`, PR #21 (`92342d3`), merge do `master` = deploy na
produkcję. Archiwum: `context/archive/2026-08-31-testing-content-safety-gate/`.

Pokryło Ryzyko #1 (najwyższe w mapie) i #6. Dwa punkty planu zamknięte świadomie, nie w pełni:
**4.12** (kontrola negatywna — próba wykonana, cel nie w pełni osiągnięty, koszt zatrzymał po
dwóch próbach) i **4.17** (trzy dodatkowe zielone przebiegi — pominięte, koszt ~3× pełnego
przebiegu uznany za nieuzasadniony). Oba zapisane jako zaakceptowane ryzyko w
`test-plan.md` §6.7, nie jako dług.

**Do sprzątnięcia**: gałąź `feat/testing-content-safety-gate` nadal istnieje zdalnie i
lokalnie po merge'u (ten sam wzorzec co `fix/supabase-error-copy` po Kroku 1a).

### ✅ Krok 3 — PRD v2 i otwarcie `M-02` (zgłoszenia #3, #4, #5, #6, #9 + `S-07`) — ZROBIONE 2026-09-19

```
/10x-shape           # UWAGA: wybierz "Restart from scratch" — patrz niżej
/10x-prd             # v2 z nowymi FR; na kolizji wybierz "Save as prd-v2.md"
                     # domyka Open Roadmap Questions #3
/10x-roadmap context/foundation/prd-v2.md    # ŚCIEŻKA JAWNIE; na kolizji "Archive
                                             # and replace"; potem ręczne odtworzenie
                                             # warstwy kamieni — patrz niżej
```

**`/10x-shape` zapyta, czy wznowić poprzednią sesję — odpowiedz „Restart from scratch".**
Istniejący `shape-notes.md` pochodzi z lipcowej sesji greenfieldowej i ma we frontmatterze
`context_type: greenfield`. Skill pomija auto-detekcję trybu, gdy plik już niesie
`context_type:` — „Resume" zablokowałoby sesję w trybie greenfield. „Restart" archiwizuje
stary plik do `context/foundation/archive/shape-notes-<data>.md` (nic nie ginie), po czym
detekcja poleci na czysto: repo trafia w Tier 1 (historia gita) i Tier 2
(`package-lock.json`), więc skill zaproponuje brownfield i poprosi o potwierdzenie.

**`/10x-prd` zapyta, co zrobić z istniejącym `prd.md` — odpowiedz „Save as prd-v2.md".**
Skill pisze całe pliki, nie edytuje chirurgicznie; zapis wersjonowany zostawia v1 nietknięte
i podbija `version:` w nowym pliku na `2`. Nowy plik to `context/foundation/prd-v2.md` —
zapamiętaj tę ścieżkę, bo potrzebuje jej następna komenda.

**`/10x-roadmap` musi dostać ścieżkę do PRD v2 jawnie.** Bez argumentu czyta
`context/foundation/prd.md`, czyli v1, i zregeneruje roadmapę ze starego PRD, nie mówiąc
o tym ani słowa. Na kolizji z istniejącą roadmapą wybierz **„Archive and replace"** —
dotychczasowy plik trafia do `context/foundation/archive/<data>-roadmap.md` i to z niego
odtwarzasz to, co niżej.

**`/10x-roadmap` nic nie wie o kamieniach milowych — po regeneracji trzeba je wpisać ręcznie.**
Sprawdzone w skillu 2026-09-19: nie ma w nim ani `milestone_id`, ani `milestone_status`, ani
sekcji `## Milestone` / `## Milestone History`. Emituje 8 kluczy frontmatteru i 10–11 sekcji,
a o `## Done` mówi wprost „Empty on first generation. Do NOT pre-populate". Warstwa kamieni
w `roadmap.md` została adoptowana wstecznie **ręcznie** (wpis z 2026-08-26 w §Milestone) i
regeneracja ją zdejmie. Zdanie „skill otworzy `M-02` i zdekomponuje go", które stało w tym
bloku do 2026-09-19, było nieprawdą — stąd ta poprawka. Do odtworzenia z archiwum zaraz po
zapisie nowej roadmapy:

- klucze `milestone_id`, `milestone_seq: 2`, `milestone_status: active` we frontmatterze;
- sekcja `## Milestone` — intent `M-02` i jego „Done when";
- `## Milestone History` **verbatim** — plik sam mówi „Append-only. Przenoszone verbatim do
  roadmapy każdego kolejnego kamienia";
- osiem wpisów w `## Done` (F-01, S-01…S-06, S-08) wraz ze statusami `done` w §At a glance;
  bez tego nowa roadmapa wygląda, jakby `M-01` nigdy się nie wydarzył.

To edycja `context/foundation/*`, więc idzie wprost na `master` — ale **zrób ją w tej samej
sesji co regeneracja**. Odłożona na później znaczy roadmapę bez historii `M-01` w repo.

**PRD v2 musi objąć również `S-07`** — to jedyny sposób, żeby wszedł do `M-02` z własnym FR.
Dostał go: FR-010 i FR-011 w `shape-notes.md`.

**Nie spłaca natomiast długu za `S-04`, `S-05` i `S-08` — decyzja użytkownika z 2026-09-19**
podjęta w fazie 4 `/10x-shape`. PRD v2 obejmuje wyłącznie `M-02`; wsteczne dopisywanie FR do
wydanego kodu było dokładnie tym, czego unikano, zamykając `M-01` skróconym zakresem.
**Open Roadmap Questions #3 zostaje otwarte** i przechodzi do następnego kamienia — trzy
zarchiwizowane slice'y zostają z pustą rubryką „PRD refs". Uzasadnienie i konsekwencja:
`shape-notes.md` §Open Questions #3 oraz §Quality cross-check (luka 2).

Wejście merytoryczne: `roadmap.md` §Kandydaci do następnego kamienia (M-02) — **skonsumuj tę
sekcję w `/10x-shape`, zanim `/10x-roadmap` zregeneruje plik i ją usunie** (Pułapka 1).

### ✅ Krok 4 — `S-07` + powiększony kafelek (zgłoszenia #2 i #1) — ZROBIONE 2026-09-27

```
git checkout -b feat/month-day-preview
/10x-new month-day-preview
/10x-research        # kluczowe pytanie: dociąganie aktywności na hover — opóźnienie,
                     # anulowanie żądania przy zejściu z kafelka, cache pobranych dni
/10x-plan
/10x-plan-review
/10x-implement month-day-preview phase <N>
/10x-impl-review
/10x-archive month-day-preview
```

Decyzje zamknięte 2026-08-30 — nic tu nie zostało do rozstrzygnięcia poza tym, co należy do
`/10x-research`. To najlepiej opisany slice na całej liście, więc dobry rozpęd po kroku 3.

### ✅ Krok 5 — reszta paczki `M-02` (zgłoszenia #3, #4, #5, #6, #9) — ZROBIONE 2026-09-29

Każdy slice standardowym łańcuchem, kolejność ustali `/10x-roadmap`.
Zacznij od **regeneracji tygodnia z zastępowaniem** — reszta paczki się o nią opiera.

### ✅ Krok 6 — faza 3 test-planu (ochrona zapisu i własności) — ZROBIONE 2026-09-30

`testing-write-ownership`, PR #39. Ryzyka #3, #4 i #7 są przypięte w trzech warstwach:
pgTAP (98 → 129 asercji, w tym cztery gałęzie `U0003` — dług z §6.4 zamknięty), atrapa w
`npm test` (409 przed płatnym modelem, brak ponowienia, nowe testy `index` i `accept`) oraz
nowa warstwa §6.3 — trasy wołane z prawdziwym klientem zalogowanym jako konto A albo B
(`npm run test:db:api`). Obie warstwy bazy stoją w CI jako doradczy job `db`. Pomiar przy
rytuale mutacji wyciągnął dwa ogony — patrz §Otwarte ogony po Kroku 6.

**Dopiero po** slice'ie regeneracji tygodnia — patrz Pułapka 2. Spełnione: `S-09` i `S-10`
są wydane, więc Ryzyko #3 ma już docelową semantykę — „dzień zaakceptowany ginie tylko po
jawnej zgodzie na ten konkretny dzień” (zgoda per data i `accepted_at` w `S-10`).

_Zakres na wejściu do fazy (stan sprzed 2026-09-30, zostawiony dla historii — wszystkie trzy
punkty niżej są zamknięte):_

**Zakres zmniejszył się, ale nie zniknął.** Ryzyka #4 i #7 mają od 2026-09-03 warstwę
przeglądarkową, a od 2026-09-05 (PR #22) stoi ona na `master`, więc faza wchodzi w nie
z dowodem, że izolacja kont i zakres kasowania działają na żywej aplikacji. Nie
zwalnia jej to z niczego, co ma w opisie:

- **`U0003`** (odmowa pustej partii) nadal bez żadnej asercji — `test-plan.md` §6.4
  nazywa fazę 3 właścicielem tego długu i podaje wymagany kształt;
- **Ryzyko #3** (zaakceptowany dzień vs regeneracja i generowanie tygodnia) e2e
  **nie dotyka** — celowo, patrz Pułapka 2;
- **tani wzorzec z §6.3** („trasa jako funkcja + atrapa `locals` dwóch kont") wciąż
  jest TBD; e2e podnosi całą aplikację i nie nadaje się do przemiatania endpointów.

### Krok 7 — rodzaje aktywności (zgłoszenie #8) — wchłonięty przez Krok 15

Robiony razem z kalendarzem świąt i materiałami w kamieniu `M-04` — patrz §Kolejka po `M-02`.

### Krok 8 — monetyzacja (zgłoszenie #10) — rozpisana na Kroki 11–14

Research i decyzje: `monetization.md`. Pierwotny zapis „po #8 i #9" nie obowiązuje: rodzaje
aktywności trafiły do Basic, a jedyną funkcją za płotem Pro na start są materiały, więc `M-03`
(Free + Basic) nie czeka na `M-04`. Powrót do `infrastructure.md` dotyczy kosztów stałych
(Supabase Pro dla backupów) — do rozstrzygnięcia w Kroku 12.

### Krok 9 — faza 4 test-planu (bramki CI + e2e)

```
/10x-test-plan
```

Na końcu, gdy ścieżki krytyczne są już stabilne.

**Runner i konwencje są już postawione** (2026-09-03, poza rolloutem): konfiguracja,
`storageState` dla dwóch kont, zasiew danych, reguły i test wzorcowy —
`test-plan.md` §6.6. Fazie zostaje to, co jest jej właściwą treścią i czego dziś
nie ma:

- **wpięcie e2e do CI** — dziś `npm run test:e2e` chodzi wyłącznie lokalnie, bo
  wymaga `npx supabase start` i klucza serwisowego w `.env.e2e`; workflow nie ma ani
  jednego, ani drugiego (patrz §Otwarte ogony po warstwie e2e);
- **ścieżka krytyczna z generowaniem** (login → dzień → hasło → generowanie → edycja
  → akceptacja) — istniejące testy jej nie pokrywają i celowo omijają wywołanie LLM;
  w CI trzeba będzie zdecydować, czym je zastąpić, bo `page.route()` nie przechwyci
  wywołania idącego z serwera;
- **pozostałe bramki** przed merge'em do `master`, który deployuje wprost na produkcję;
- **stabilny pierwszy przebieg e2e** — dziś pierwszy pełny przebieg po zmianie zależności pada
  (Vite re-optymalizuje zależności w trakcie i przeładowuje stronę), drugi przechodzi. W CI
  każdy przebieg jest pierwszy. Poprawka i dowody: `context/archive/2026-09-29-design-foundation/follow-ups/review-fixes.md` F9.

**Przesunięty przed Krok 14 (2026-09-29).** Warunek wejścia pierwszego slice'a płatności.
Rozszerz przy okazji mapę ryzyk o płatności: webhook przyznający dostęp cudzemu kontu, limit
omijany równoległymi wywołaniami `week/day.ts`, dostęp, który nie wygasa.

### ✅ Krok 10 — design z Claude Design (zgłoszenie „design z Claude Design") — ZROBIONE 2026-09-30

```
# 0. ✅ Projekt w Claude Design gotowy (2026-09-29) — pakiet w context/foundation/design/
git checkout -b feat/design-foundation
/10x-new design-foundation
# 1. ✅ Eksport w repo: context/foundation/design/ (przeżyje archiwizację zmiany)
/10x-research        # mapa ekranów i komponentów do przemalowania, patrz niżej
/10x-plan
/10x-plan-review
/10x-implement design-foundation phase <N>
/10x-impl-review
/10x-archive design-foundation
# Drugi przebieg tym samym łańcuchem: feat/design-planner (ekrany planowania)
# 2. ✅ design-planner zaimplementowany 2026-09-30 (7 faz), przegląd, PR #38 (cf044dd),
#    przejście po produkcji i /10x-archive (18a58c8) — zrobione 2026-09-30
```

**Stan końcowy po `design-planner` (2026-09-30).** Cała aplikacja jest w „Ogrodzie”: `.theme-legacy`
i `bg-cosmic` usunięte, trzy ekrany `/plan*` stoją na `PlannerLayout` z nowym paskiem aplikacji.
Siatka miesiąca to pn–pt z tematem tygodnia w wierszu, licznikami w legendzie, CTA dla pustego
tygodnia i listą tygodni poniżej 900 px (ryzyko #14 w `test-plan.md` pilnuje wysokości 558 px).
Dzień i tydzień mają układ dwukolumnowy i przełącznik zakresu. Stan planu nazywa się wszędzie —
także na wydrukach — „zatwierdzony / do przejrzenia”, a sześć potwierdzeń idzie przez własne okno
(`useConfirmDialog`); reguły w `CLAUDE.md` §Key conventions i `tests/e2e/E2E-RULES.md` §Okna potwierdzeń.

Świadomie **nie** zrobione, z właścicielem:

- **Podgląd dnia na dotyk** — nie było go i nadal nie ma (na telefonie kafelek od razu otwiera
  dzień). Bez właściciela w kolejce; wraca, jeśli zgłosi to nauczyciel.
- **Strona `/konto`** — awatar w pasku jest dekoracją, nie linkiem. Właściciel: `M-03`.
- Kategorie, czas trwania i miejsce aktywności (N2) — właściciel: `M-04`.

**Bez PRD.** Design nie zmienia żadnego FR: wszystko z `prd-v2.md` §Zachowania chronione obowiązuje
bez zmian, łącznie z adresami ekranów. To zmiana wyglądu, więc idzie standardowym łańcuchem
zmiany, nie przez `/10x-shape`.

**Dwie zmiany, nie jedna** — powierzchnia jest za duża na jeden PR, a merge to wydanie:

1. `design-foundation` — tokeny (kolory, typografia, promienie, odstępy) w motywie Tailwind 4 i
   zmiennych shadcn/ui („new-york"), fonty, `Layout.astro`, `Topbar`, strona główna (`Welcome`),
   ekrany auth. Po tej zmianie reszta aplikacji dziedziczy nowy wygląd przez tokeny, nawet
   nieprzerobiona.
2. `design-planner` — siatka miesiąca, tydzień, dzień, podgląd dnia, potwierdzenia.

**Zakres projektu w Claude Design — zaprojektuj od razu także ekrany `M-03`**, których jeszcze
nie ma w kodzie: cennik (rok szkolny jako domyślny, cena założycielska), okno paywalla przy drugim
tygodniu, FAQ, regulamin i polityka prywatności (układ długiego tekstu), formularz kontaktowy,
reset hasła, stan „pierwszy miesiąc pełny" i licznik darmowego tygodnia. Slice'y z Kroków 13–14
wezmą je gotowe, zamiast projektować w trakcie implementacji.

**Stan projektu (2026-09-29): wystarczający, dalszego projektowania nie planujemy.** Pakiet ma
ekrany 01–14: landing, logowanie, rejestracja, konto założone, nowe propozycje, plan miesiąca,
cennik, paywall, FAQ, regulamin, kontakt, reset hasła, nowe hasło. Makiet nie mają stany „pierwszy
miesiąc pełny" i licznik darmowego tygodnia, a treść paywalla i cennika rozjeżdża się z
`monetization.md` §Decyzje (`context/archive/2026-09-29-design-foundation/research.md` §6). Slice'y Kroków
13–14 składają je z istniejących komponentów pakietu, zamiast wracać do Claude Design.

**Na co uważać w `/10x-research` i `/10x-plan`:**

- **Testy e2e jadą po rolach i etykietach** (`CLAUDE.md` §E2E, `tests/e2e/E2E-RULES.md`). Zmiana
  wyglądu nie może zmienić nazw dostępnych przycisków i pól — inaczej czerwone testy będą wyglądały
  jak regresja zachowania. Jeśli projekt zmienia teksty przycisków, plan wymienia je wprost.
- **Wydruki PDF mają własny silnik** (`src/lib/week-pdf/`) i nie dziedziczą CSS aplikacji.
  Przeniesienie designu na wydruki to decyzja planu, nie domyślny zakres.
- **Copy zostaje polskie**, a klasy łączone przez `cn()` (`CLAUDE.md` §Key conventions).
- **Podgląd dnia i siatka mają warunki jakościowe z `prd-v2.md`**: pełny miesiąc bez przewijania
  na tej samej szerokości co dziś, podgląd osiągalny z klawiatury. Nowy wygląd ich nie łamie.
- **Weryfikacja wzrokowa jest tu naturalna** — pozycja 1.11 z §Otwarte ogony po Kroku 1
  (układ mobilny i desktopowy strony `/`) domyka się przy okazji.

**Co zostaje po obu zmianach (stan na 2026-09-30):**

- **Pakiet Claude Design** leży w `context/foundation/design/` (README, `tokens.css`, komponenty
  `.astro` jako specyfikacja, PNG i HTML ekranów). Wykluczony z ESLint i tsconfig — to referencja,
  nie kod. Tokeny są w `src/styles/global.css` (`@theme`); `--cat-*` czekają na `M-04`.
- Wszystko, co `design-foundation` zostawił dla `design-planner` — dług `.theme-legacy`, `AppHeader`
  (N12, N8), siatka N4–N7, N11 „Zatwierdź wszystkie”, etykiety tematu tygodnia w ilustracji
  landingu — jest zrobione; patrz „Stan końcowy po `design-planner`” wyżej.
- **N1:** hasło z landingu jedzie ciasteczkiem `pending_topic` (`src/lib/pending-topic.ts`) do
  `/plan/week`; `initialPrompt` w `WeekPlanBoard` i etykieta „Hasło tygodnia” są związane testem
  `landing-topic-carry.spec.ts`.

### Krok 11 — walidacja i sprawy formalne (poza kodem, równolegle z Krokiem 10)

Nie otwiera folderu zmiany, więc nie łamie reguły „jeden folder w locie".

- **Rozmowy:** 8–10 osób, `/10x-mom-test` na `monetization.md` jako wejściu. Pytania
  o przeszłe wydatki, nie o opinie — `monetization.md` §7 Faza 0.
- **Dane z produkcji:** ile generowań na miesiąc robią realni użytkownicy i ilu planuje więcej niż
  tydzień. Kalibruje limity fair use z `monetization.md` §4.3, zanim wejdą do PRD v3.
- **Formalności:** JDG (PKD dla sprzedaży oprogramowania w modelu subskrypcji), konto Stripe
  z włączonym BLIK i Przelewy24, narzędzie do faktur ze łącznikiem do Stripe'a. **Konsultacja
  z księgowym** — lista pytań w `monetization.md` §Decyzje, ad 5.

Wynik rozmów i danych zapisz przed Krokiem 12 — to wejście do `/10x-shape`, obok `monetization.md`.

### Krok 12 — PRD v3 i otwarcie `M-03` „Gotowi do sprzedaży"

```
/10x-shape           # "Restart from scratch" — jak w Kroku 3; wejście: monetization.md,
                     # new-ideas.md, wynik Kroku 11
/10x-prd             # na kolizji "Save as prd-v3.md"
/10x-roadmap context/foundation/prd-v3.md    # ŚCIEŻKA JAWNIE; "Archive and replace";
                                             # potem ręczne odtworzenie warstwy kamieni
```

**Wszystkie trzy pułapki z Kroku 3 obowiązują bez zmian** — reset sesji shape, zapis
wersjonowany PRD, jawna ścieżka dla roadmapy i ręczne odtworzenie `milestone_*`,
`## Milestone`, `## Milestone History` i `## Done` z archiwum (Pułapka 5). `M-02` trafia do
§Milestone History jako zamknięty 2026-09-29.

**Zakres `M-03` do przejścia w shape** (propozycja; kolejność ustala `/10x-roadmap`):

| Kandydat | Skąd | Uwagi |
| --- | --- | --- |
| Reset hasła | Open Roadmap Questions #4 | warunek sprzedaży (`monetization.md` §6) |
| Regulamin, polityka prywatności, FAQ | `new-ideas.md` | statyczne strony Astro; treść regulaminu z księgowym/prawnikiem |
| Formularz kontaktowy chroniony przed spamem | `new-ideas.md` | skille `turnstile-spin` (Turnstile) i `cloudflare-email-service` (wysyłka) |
| Limity: licznik dni-generacji, fair use, darmowy tydzień, reverse trial | `monetization.md` §4.2–4.3 | zamyka Open Roadmap Questions #5; atomowy licznik w czterech trasach LLM |
| Płatności: Stripe Checkout, webhook, Customer Portal | `monetization.md` §4.5 | uprawnienie = „plan + dostęp do daty"; subskrypcja kartą + dostęp jednorazowy BLIK-iem |
| Cennik, paywall, cena założycielska, stopka na darmowym wydruku | `monetization.md` §4.1–4.4 | prezent dla kont sprzed paywalla |
| Odwieszenie bramki bezpieczeństwa treści | `next-actions.md` §Stan | warunek sprzedaży; rozważ przy okazji ogon po Kroku 2 (węższa macierz = tańszy przebieg) |

**Non-Goals do zapisania w PRD v3:** Pro i jego funkcje (to `M-04`), plan „Placówka" i faktura na
przedszkole (decyzja B2C), role i współdzielenie planów.

### Krok 13 — slice'y `M-03` bez pieniędzy

Każdy standardowym łańcuchem (`git checkout -b feat/<id>` → `/10x-new` → `/10x-research` →
`/10x-plan` → `/10x-plan-review` → `/10x-implement` → `/10x-impl-review` → `/10x-archive`).
Kolejność z roadmapy; naturalna to reset hasła → strony prawne i FAQ → kontakt → limity.

Każdy z nich może wejść na produkcję sam: nic tu nie pobiera pieniędzy, a limity działają dla
wszystkich według reguły z §4.2.

### Krok 14 — slice'y `M-03` z pieniędzmi i start sprzedaży

**Warunki wejścia:** Krok 9 zrobiony (e2e w CI), Krok 11 zamknięty (JDG, Stripe, księgowy),
bramka bezpieczeństwa odwieszona i przepuszczona na żywo.

Kolejność: płatności (Stripe w trybie testowym, webhook, uprawnienia) → cennik i paywall.
**Klucze produkcyjne Stripe'a dopiero po** przejściu całej ścieżki zakupu i rezygnacji w trybie
testowym na produkcji. Po starcie: metryki z `monetization.md` §8.

### Krok 15 — kamień `M-04` „Lepsza treść" i start Pro

```
/10x-shape           # osobna sesja; research DZIEDZINOWY (Pułapka 4)
/10x-prd             # "Save as prd-v4.md"
/10x-roadmap context/foundation/prd-v4.md
```

Zakres do shape: **kalendarz świąt i dni tematycznych** (Basic; `new-ideas.md`, np. Dzień Kropki —
spełnia obietnicę z `idea.md`), **rodzaje aktywności** (Basic; dawny Krok 7), **materiały: teksty
piosenek, wierszyków i zagadek** (Pro; Open Roadmap Questions #9). Każda zmiana wytycznych wymaga
przebiegu bramki dla każdego dozwolonego modelu. Shape rozstrzyga też próg startu Pro
(`monetization.md` §Decyzje, ad 6). Po `M-04`, w kolejności z danych o zapisach „Pro — wkrótce":
dokumentacja (podstawa programowa + wpisy do dziennika), kilka grup, eksport DOCX.


## Otwarte ogony po Kroku 1

Pierwszy ogon jest **wdrożony jako Krok 1a** (zarchiwizowany 2026-08-31); reszta nie blokuje Kroku 2. Wszystko ma
wskazane wejście — żaden ogon nie wisi „kiedyś".

| Co                                                                | Właściciel / bramka wejścia                                                                                        |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| ~~**Angielskie komunikaty błędów z Supabase** na ekranach auth~~ | ✅ **Wdrożone 2026-08-31 jako Krok 1a** (`supabase-error-copy`, 3 fazy). `?error=` niesie kod, tłumaczenie w `src/lib/auth-error-messages.ts`; zamknęło przy okazji lukę phishingową w tym parametrze. Plan: `context/archive/2026-08-31-supabase-error-copy/plan.md`. Pierwotny opis: `context/archive/2026-08-30-pl-landing-copy/follow-ups/supabase-error-copy.md` |
| ~~**Pozycja 1.11 planu nieodhaczona** — układ na szerokości mobilnej i desktopowej~~ | ✅ **Domknięta w Kroku 10** (`design-foundation`, 2026-09-29): landing przebudowany według makiet „Ogród” przy 390 / 768 / 1440 px; weryfikacja wzrokowa w pozycjach 2.7 i 2.11 planu tej zmiany |
| **F6 (zawężone)**: bramka oparta na **ręcznej liście wzorców** musi być wyprowadzona z kodu albo mieć test na własną kompletność | Połowa grepowa **domknięta 2026-08-31** — `lessons.md` §„Bramka grepowa musi celować w konstrukcję i przejechać oba stany" (powód: `supabase-error-copy`, findingi F1 i F4 z przeglądu implementacji). Otwarta zostaje wyłącznie połowa o ręcznych listach wzorców; świeży przykład to `ENGLISH_STOP_WORDS` w `src/lib/auth-error-messages.test.ts` — sześć słów utrzymywanych ręcznie, bez asercji na własną kompletność. Bramka wejścia: **faza 2 test-planu** (Krok 2), która będzie takich list produkować więcej — wtedy `/10x-lesson` na tę połowę |
| **F4, F5 — `PENDING`, świadomie bez decyzji**                     | F4: niespójna odmiana po `MIN_PASSWORD_LENGTH` (skutek nieosiągalny, stała = 6, Supabase wymusza 6). F5: produkcyjna gałąź `confirm-email` zweryfikowana tylko przez odczyt kodu (`isAutoConfirmed = import.meta.env.DEV`). Oba w `context/archive/2026-08-30-pl-landing-copy/reviews/impl-review.md` |

**Lekcja procesowa z Kroku 1 — potwierdzona po raz drugi w Kroku 1a:** runbook obiecywał
„copy w jednym komponencie", a wyszło dziewięć plików i dwie fazy. Ogon „angielskie
komunikaty Supabase" wyglądał na dwie trasy API, a objął też dwie strony `.astro` i wyciągnął
lukę bezpieczeństwa, o której nikt nie wiedział. Powierzchnia w tym pliku jest oszacowaniem,
nie zakresem — zakres ustala `/10x-plan` po przeczytaniu kodu. Nie traktuj wpisu
„Powierzchnia:" ani bramki w §Otwarte ogony jako sufitu.

Dwa trafienia z rzędu to już wzorzec, nie zbieg okoliczności — **kandydat na `/10x-lesson`**
obok F6 (patrz wiersz wyżej), gdyby powtórzył się po raz trzeci.

## Otwarte ogony po Kroku 2

Nie blokuje Kroku 3 ani żadnego dalszego kroku — do zrobienia w dowolnym momencie, najlepiej
przed kolejnym pełnym przebiegiem `npm run test:gate` na żywo.

| Co | Właściciel / bramka wejścia |
| --- | --- |
| **Ograniczenie liczby trybów w macierzy bramki bezpieczeństwa treści** — `GATE_MODES` w `content-safety.gate.test.ts` z czterech (`day`, `day-weekday`, `day-themed`, `week`) do dwóch: zostają `day-weekday` i `week`, odpadają `day` (nieprodukcyjny baseline — `activity-generator.ts:100-111` mówi wprost, że `/plan?date=` nigdy go nie wysyła) i `day-themed` (dzień w kontekście tygodnia, ze slotem „Temat dnia:”). Cel: 2x mniej realnych wywołań LLM na przebieg (z ~8 do ~4 na kombinację model×hasło), bez utraty jedynej konfiguracji odpowiadającej pojedynczemu dniu generowanemu w produkcji. **Świadomy koszt**: `day-themed` był jedyną konfiguracją bramki testującą slot „Temat dnia:”, który plan fazy 2 nazwał najbardziej wrażliwym na wstrzyknięcie (ryzyko #6) — to ubytek pokrycia, nie tylko oszczędność, i wart odnotowania przy zmianie | Brak formalnej bramki wejścia — zmiana lokalna w `content-safety.gate.test.ts` i `test-plan.md` §6.5 (opis macierzy). Rozważyć razem: `4.12`/`4.17` z Kroku 2 zakładają dziś macierz 4-trybową — commit message powinien to nazwać |

## Otwarte ogony po warstwie e2e (2026-09-03, odświeżone 2026-09-19)

Nie blokują żadnego kroku. Pierwszy wiersz jest domknięty — decyzja zapadła i została
wykonana; pozostałe trzy należą do Kroku 9.

| Co | Właściciel / bramka wejścia |
| --- | --- |
| ~~**Gałąź `test/e2e-ownership-delete` niezmergowana, bez PR-a** (commit `5ba1d12`)~~ | ✅ **Zamknięte 2026-09-05** — PR #22 zmergowany (`1282ea2`), czyli wydany na produkcję przez Workers Builds. Decyzja wypadła na „PR teraz", zgodnie z argumentem, że reguły i test wzorcowy leżąc na gałęzi nie działają jako lever jakości dla kolejnych testów. Na `master` stoją Playwright, skrypty `test:e2e` / `test:e2e:ui` i `tests/e2e/E2E-RULES.md`, więc `test-plan.md` §4 i §6.6 opisują stan, który na `master` widać |
| **e2e nie stoi w CI** — wymaga `npx supabase start` (Docker) i klucza serwisowego. `.env.e2e` jest gitignorowany, `.env.e2e.example` opisuje kształt | **Krok 9** (faza 4) — to jest dokładnie jej treść, nie ogon do zrobienia po drodze. Nie wpinaj tego doraźnie: sekret serwisowy w CI to decyzja o zakresie uprawnień, nie linijka w YAML-u |
| **Ścieżka krytyczna z generowaniem bez pokrycia** — istniejące testy celowo omijają LLM (zasiew prosto do bazy), a §5 zakłada bramkę na pełnym przepływie | **Krok 9.** Wymaga rozstrzygnięcia, czym zastąpić dostawcę: `page.route()` nie zadziała, bo wywołanie idzie z serwera — kandydaci to atrapa na poziomie `webServer` (osobny tryb env) albo dopuszczenie jednego prawdziwego wywołania na przebieg |
| **Ryzyko #5 (postęp przy 10–30 s) bez pokrycia przeglądarkowego** — jedyne pozostałe ryzyko, które jest w istotnej części widoczne wyłącznie w UI (`GenerationProgress`) | Naturalnie razem z poprzednim wierszem: oba potrzebują sterowalnego dostawcy, więc wstrzyknięcie opóźnienia i awarii to ta sama robota co atrapa generowania |

## Otwarte ogony po `edit-unaccepts-day` (S-12, 2026-09-21)

Nie blokują żadnego kroku. Oba wyszły z przeglądu implementacyjnego
(`context/changes/edit-unaccepts-day/reviews/impl-review.md`).

| Co | Właściciel / bramka wejścia |
| --- | --- |
| **`prd-v2.md` §Business Logic Changes reguła 2 opisuje nieprawdę** — mówi, że „edycja treści nie rusza tej etykiety [akceptacji]", co przestało być prawdą **2026-08-23** wraz z S-02: trigger `activities_edit_clears_acceptance` zeruje `accepted_at` przy każdej zmianie `title` albo `description`. `edit-unaccepts-day` świadomie tego nie poprawił (PRD v2 jest zamrożonym artefaktem M-02, a `CLAUDE.md` traktuje edycje `context/foundation/*` jako osobny tor) i zapisał to w §Migration Notes planu. Konsekwencja, jeśli zostanie: `S-10` ma `S-12` w prerekwizytach i będzie czytać ten akapit jako opis stanu wyjściowego | Brak formalnej bramki — edycja `context/foundation/*` idzie wprost na `master`. ✅ **Poprawione 2026-09-29** (po wydaniu `S-10`, więc z opóźnieniem): reguła 2 opisuje teraz trigger z `S-02`, reguła 1 opisuje stan po `S-10`, a akapit „Semantyka zastanych danych” ma dopisek, że obawa była bezpodstawna. Przy okazji sprawdzić §Constraints „Semantyka zastanych danych" (`prd-v2.md:281-285`), który ostrzega przed dniami zaakceptowanymi i edytowanymi po akceptacji — żadna ścieżka aplikacji nie mogła takiego wiersza wyprodukować od S-02 |
| **`npm run build` tuż przed `npm run test:e2e` wywraca reużywany serwer dev** — `playwright.config.ts` ma `reuseExistingServer: !process.env.CI`, a build regeneruje `node_modules/.vite`. Serwer, który już stoi, miesza wtedy dwie generacje zoptymalizowanych zależności (`chunk-*.js?v=ecd2270b` obok `react-dom_server.js?v=e0d79318`), React dostaje pusty dispatcher i SSR wyspy pada na `TypeError: Cannot read properties of null (reading 'useState')` w pierwszym `useState` `DayPlanEditor`. Strona dnia renderuje się bez planu, więc **padają testy, które akurat weszły w to okno — najczęściej ryzyko #4 (`seed.spec`, `day-plan-ownership`), których żadna świeża zmiana nie dotyka**. Wyizolowane: mój kod + 6 starych testów przechodzi, 9 testów przy `--workers=2` przechodzi, 9 przy 5 workerach pada. To wyścig, więc większy zestaw trafia w nie częściej — `edit-unaccepts-day` podniósł zestaw z 6 do 9 testów i dlatego zaczęło być widać. **Dotyczy wyłącznie serwera dev; produkcja jedzie z artefaktu buildu, bez optymalizacji zależności w runtime.** Pułapka jest w diagnozie, nie w produkcie: następna osoba zobaczy czerwone ryzyko #4 i wyciągnie wniosek o regresji, której nie ma | Brak bramki — e2e nie stoi w CI (to treść **Kroku 9**), więc nic tego dziś nie łapie. Kandydaci na obejście, do rozstrzygnięcia razem z wpinaniem e2e do CI: `reuseExistingServer: false` (koszt: pełny start serwera na każdy przebieg lokalnie), czyszczenie `node_modules/.vite` w skrypcie `test:e2e`, albo rozgrzanie serwera jednym żądaniem przed wpuszczeniem workerów. **Nie zmieniaj `fullyParallel` ani liczby workerów jako lekarstwa** — równoległość jest tu celowo testem niezależności testów (`playwright.config.ts:22-23`), a jej obniżenie schowałoby objaw i zabrało sygnał |
| **Wyścig odczyt–zapis w trasie edycji raportuje stan sprzed zapisu, nie skutek** — `acceptance_cleared` to dosłownie `wasAccepted`, a trigger jest warunkowy (`when old.title is distinct from new.title or …`), więc zapis bez zmiany treści zwraca `true`, choć nic nie zdjął. Wyspę ratuje dopiero złożony warunek w `AcceptanceBanner` (`!acceptedAt && clearedByEdit`), czyli obrona w głąb, nie kontrakt. Finding F2 przeglądu, świadomie pominięty przy triage'u | Brak bramki. Jeśli pole zacznie czytać ktokolwiek poza `DayPlanEditor` — np. powierzchnie akceptacji w tygodniu z `S-11` — **najpierw** policzyć je z faktu po zapisie: `wasAccepted && saved.plan.accepted_at === null`, i dołożyć piąty przypadek do `activity/[id].test.ts` (dziś `savedDay()` zawsze buduje `accepted_at: null`, więc wszystkie cztery dzielą jeden kształt po zapisie) |

## Otwarte ogony po Kroku 6 (`testing-write-ownership`, 2026-09-30)

Nie blokują żadnego kroku. Wyszły z researchu, z rytuału mutacji fazy 3 test-planu i z wpinania joba `db` w CI.

| Co | Właściciel / bramka wejścia |
| --- | --- |
| **Zgoda dnia (`confirm_replace`, boolean) nie jest związana z wersją zatwierdzenia, w przeciwieństwie do tygodnia** (`p_confirm_accepted` = data + `accepted_at`). Karta dnia otwarta, dzień zatwierdzony na nowo w drugiej karcie po zgodzie w pierwszej — zgoda z pierwszej karty zastąpi nową wersję. `S-10` zostawił to świadomie (`context/archive/2026-09-28-accepted-day-replacement/plan-brief.md:42`); faza 3 **celowo** nie przypięła tej asymetrii testem jako zamierzonej. Szczegóły: `context/archive/2026-09-30-testing-write-ownership/research.md` §Ryzyko #3 | **Przyszły slice ścieżki dnia** — kandydat do PRD v3 w **Kroku 12** (`/10x-shape` ma go zobaczyć na liście). Zmiana dotyka `save_day_plan_generation` (parametr zgody), `generate.ts` i `DayPlanEditor` |
| **`DELETE … .maybeSingle()` nie jest obroną w głąb za RLS.** Zmierzone 2026-09-30 z poluzowanymi politykami select + delete: kasowanie po dacie trafia w wiersze **obu** kont, PostgREST odpowiada 406 `PGRST116` — i **nic nie wycofuje**, oba wiersze znikają. Magazyn mapuje `PGRST116` na `not_found`, więc nauczyciel czyta „Ten dzień nie ma planu do usunięcia." po skasowaniu cudzego dnia. Dziś bezpieczne, bo RLS stoi i `index.db.test.ts` go pilnuje; jedyną linią jest jednak RLS. Pomiar: komentarz w `src/pages/api/day-plan/index.db.test.ts` | **Krok 9** (faza 4 test-planu) albo pierwsza zmiana dotykająca `deleteDayPlan`, cokolwiek wcześniej. Kandydaci: RPC kasujący `where user_id = auth.uid() and plan_date = …` z `get diagnostics` i `raise` przy ≠ 1 wierszu, albo kasowanie po `id` odczytanym wcześniej przez RLS. Nie filtr `user_id` w kodzie aplikacji — `day-plan-store.ts` zabrania go świadomie |
| **Job `db` pada na limicie pobrań `public.ecr.aws`** (`toomanyrequests: Data limit exceeded` w `supabase start`). Pierwszy raz przy wpinaniu, drugi na PR #39 (run 36768531052, 2026-09-30) — próg „jeśli zacznie się powtarzać” z `test-plan.md` §6.7 przekroczony. Job jest doradczy, więc czerwień nie blokuje, ale uczy ignorować znaczek | **Krok 9** (faza 4 test-planu — dotyka CI) albo trzeci taki przebieg, cokolwiek wcześniej. Kandydaci: cache obrazów Dockera w Actions, ponowienie `supabase start` z odstępem |
| **Przypięta wersja Postgresa w jobie `db` (`17.6.1.127`) podbija się ręcznie.** Krok w `.github/workflows/ci.yml` pisze `supabase/.temp/postgres-version` (wewnętrzny plik CLI), bo bez niego CI dostaje domyślny obraz CLI, na którym serwer padał. Po aktualizacji projektu na produkcji CI po cichu testuje starszy Postgres | **Ten, kto podbija Postgresa projektu w dashboardzie Supabase** — w tej samej zmianie podbija wartość w `ci.yml` (porównać z `supabase/.temp/postgres-version` po `npx supabase link`). Przegląd przy każdej aktualizacji `supabase` CLI w `package.json` |

## Pułapki — pięć rzeczy, o które łatwo się potknąć

1. **Sekcja §Kandydaci do M-02 w `roadmap.md` jest tymczasowa.** Nie należy do schematu
   roadmapy, a `/10x-roadmap` odtwarza plik z sekcji wymaganych i tę usunie. Decyzje o regeneracji tygodnia muszą przejść do `shape-notes.md` w kroku 3,
   **zanim** uruchomisz `/10x-roadmap`.
2. **Faza 3 test-planu idzie PO regeneracji tygodnia.** Faza 3 pokrywa Ryzyko #3
   („zaakceptowany dzień przeżywa regenerację"), a ten slice zmienia kryterium ochrony z
   „nigdy nie niszczy" na „nigdy bez jawnego potwierdzenia". Zrobiona wcześniej zabetonuje
   w asercjach semantykę, którą zaraz usuwasz.
3. **Zgłoszenia #1 i #4 nie mają własnych zmian.** #1 wchodzi w `S-07` (powiększony kafelek
   i panel podglądu konkurują o tę samą siatkę siedmiu kolumn), #4 wchodzi w slice akceptacji
   (inaczej przesuwasz te same przyciski dwa razy).
4. **Research dziedzinowy ≠ `/10x-research`.** Przy #8 pytanie „jakie są typowe aktywności
   przedszkolne" należy do `/10x-shape`; `/10x-research` czyta kodebazę, nie dziedzinę.
5. **`/10x-roadmap` nie jest świadomy kamieni milowych.** Regeneracja zdejmuje z `roadmap.md`
   frontmatterowe `milestone_*`, sekcje `## Milestone` i `## Milestone History` oraz
   wypełnione `## Done` — ta warstwa jest w tym projekcie ręczna, nie skillowa. Odtwórz ją
   z `context/foundation/archive/<data>-roadmap.md` w tej samej sesji; pełna lista w Kroku 3.

## Reguły obowiązujące w każdym kroku

- **Branch przed pierwszym commitem** — `git branch --show-current`; konwencja `<typ>/<change-id>`.
  Wyjątek: edycje `context/foundation/*` mogą iść wprost na `master`.
- **PR do `master` = release.** Merge deployuje na produkcję przez Cloudflare Workers Builds
  (poza `.github/`, nie widać tego w `ci.yml`). Traktuj merge jak wydanie, nie jak integrację.
- **Powtarzalna klasa błędu → `/10x-lesson`**, nie cicha poprawka.
- **Nowe zgłoszenie w trakcie** → dopisz do `roadmap.md` §Kandydaci albo tutaj; nie otwieraj
  drugiego folderu zmiany.

## Gdzie co jest zapisane

| Co                                                    | Gdzie                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------- |
| Decyzje o wzorcu interakcji podglądu, dane na żądanie | `roadmap.md` → `S-07` §Decyzje                                            |
| Decyzje o regeneracji tygodnia i jej konsekwencjach   | `roadmap.md` → §Kandydaci do następnego kamienia                          |
| Dlaczego `M-01` zamknął się bez odczytu z siatki      | `roadmap.md` → §Milestone History                                         |
| Dług PRD dla `S-04`…`S-08`                            | `roadmap.md` → §Open Roadmap Questions #3                                 |
| Stan rolloutu testów                                  | `test-plan.md` §3 (`/10x-test-plan --status`)                             |
| Jak dopisać test e2e (lokalizacja, tożsamość, dane)  | `test-plan.md` §6.6 + `tests/e2e/E2E-RULES.md`                            |
| Wzorzec, na którym modelują się generowane testy e2e | `tests/e2e/seed.spec.ts`                                                  |
| Czego nauczyła pierwsza warstwa e2e (hydracja, `[::1]`) | `test-plan.md` §6.7 („Poza rolloutem — pierwsza warstwa e2e")           |
| Co dokładnie zmienił `pl-landing-copy` i dlaczego     | `context/archive/2026-08-30-pl-landing-copy/plan.md`                      |
| Findingi i decyzje z przeglądu `pl-landing-copy`      | `context/archive/2026-08-30-pl-landing-copy/reviews/impl-review.md`       |
| Odroczone tłumaczenie błędów Supabase — pierwotny opis | `context/archive/2026-08-30-pl-landing-copy/follow-ups/supabase-error-copy.md` |
| Decyzje o mapowaniu błędów auth i o kontrakcie `?error=` | `context/archive/2026-08-31-supabase-error-copy/change.md` §Notes |
| Findingi i decyzje z przeglądu `supabase-error-copy` | `context/archive/2026-08-31-supabase-error-copy/reviews/impl-review.md` |
| Czego `/10x-roadmap` **nie** zrobi sam przy regeneracji | ten plik → Krok 3 + Pułapka 5                                          |
| Kolejność prac i komendy                              | ten plik                                                                  |
| Kolejność po `M-02` (design, `M-03`, `M-04`)          | ten plik → §Kolejka po `M-02`                                             |
| Research cen, konkurencja, decyzje o monetyzacji      | `monetization.md` (§Decyzje wiąże)                                        |
| Surowa lista zgłoszeń Janusza i gdzie trafiły         | `new-ideas.md`                                                            |
