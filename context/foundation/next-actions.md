# Next Actions — ustalenia z 2026-08-30, stan na 2026-08-31

> Runbook kolejności prac i komend 10x. Dokument roboczy, edytowany w miejscu:
> odhaczaj kroki i dopisuj nowe zgłoszenia. Decyzje produktowe mieszkają w
> `roadmap.md` (S-07 §Decyzje, §Kandydaci do następnego kamienia) — tutaj jest
> **kolejność i to, co uruchomić**, nie druga kopia tamtych decyzji.

## Stan (2026-08-31)

- **Krok 1 (`pl-landing-copy`) zamknięty 2026-08-30**, PR #19 zmergowany do `master` —
  czyli wydany na produkcję. Archiwum: `context/archive/2026-08-30-pl-landing-copy/`.
- **Otwarty folder zmiany: `supabase-error-copy`** (Krok 1a) na gałęzi
  `fix/supabase-error-copy`, status `implemented` (trzy fazy wdrożone 2026-08-31,
  czeka na `/10x-impl-review` i `/10x-archive`). Wszedł 2026-08-31 przed Krokiem 2 — jest to
  ogon po Kroku 1, którego bramka wejścia („najbliższa zmiana dotykająca
  `src/pages/api/auth/*`") została spełniona przez samego siebie.
- **Krok 2 czeka**, aż `supabase-error-copy` się zarchiwizuje — jeden folder zmiany w locie.
- **`M-01` zamknięty 2026-08-30** z ośmioma pozycjami `done` z dziewięciu. `S-07` jawnie
  wypisany z zakresu i przeniesiony do `M-02` — powód i koszt zapisane w `roadmap.md`
  §Milestone History.
- `S-07` jest `ready`, decyzje zamknięte, czeka na FR z PRD v2. Żaden kamień nie jest teraz
  otwarty (`milestone_status: done`).
- `test-plan.md` §3: faza 1 `complete`, fazy 2–4 `not started` — `pl-landing-copy` niczego
  tu nie ruszył (zmiana copy, bez infrastruktury testowej).
- PRD v1 wyczerpał się na `S-03`; `S-04`, `S-05`, `S-08` zarchiwizowane z pustą rubryką
  „PRD refs" (Open Roadmap Questions #3, wciąż otwarte).

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

## Kolejność — krok po kroku

Jeden folder zmiany w locie naraz. Między handoffami `/clear`.
Numeracja kroków jest stała — kroki domknięte zostają na liście, nie są usuwane.

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

### Krok 1a — `supabase-error-copy` (ogon po Kroku 1) — WDROŻONE 2026-08-31

```
git checkout -b fix/supabase-error-copy   # ✅ zrobione 2026-08-31
/10x-new supabase-error-copy              # ✅ zrobione 2026-08-31
/10x-plan supabase-error-copy             # ✅ zrobione 2026-08-31
/10x-plan-review                          # pominięte — zmiana jest mała
/10x-implement supabase-error-copy        # ✅ zrobione 2026-08-31 (3 fazy)
/10x-impl-review                          # ← następna komenda
/10x-archive supabase-error-copy
```

Numer `1a`, nie `10` — numeracja kroków jest stała, a ta pozycja nie jest nowym punktem
planu, tylko domknięciem ogona po Kroku 1. **`/10x-research` pomijalny**: powierzchnia to
pięć plików, a kluczowy fakt zewnętrzny (kształt `AuthError`) czyta się wprost
z zainstalowanych typów.

**Cztery decyzje zamknięte 2026-08-31, przed planowaniem** — pełne uzasadnienia w
`context/changes/supabase-error-copy/change.md`:

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

### Krok 2 — faza 2 test-planu (bramka bezpieczeństwa treści)

```
/10x-test-plan            # orkiestrator sam wybierze następny handoff i poda komendę
/10x-test-plan --status   # sam podgląd stanu, nic nie robi
```

Orkiestrator prowadzi przez `/10x-new` → `/10x-research` → `/10x-plan` → `/10x-implement`
i zatrzymuje się na każdym STOP-poincie. Po `/clear` wywołaj `/10x-test-plan` bez argumentów,
żeby wznowić. Pokrywa Ryzyko #1 (najwyższe w mapie) i jest niezależna od reszty tej listy.

### Krok 3 — PRD v2 i otwarcie `M-02` (zgłoszenia #3, #4, #5, #6, #9 + `S-07`)

```
/10x-shape           # UWAGA: wybierz "Restart from scratch" — patrz niżej
/10x-prd             # v2 z nowymi FR + bump prd_version; domyka Open Roadmap Questions #3
/10x-roadmap         # milestone_status: done → skill otworzy M-02 i zdekomponuje go
```

**`/10x-shape` zapyta, czy wznowić poprzednią sesję — odpowiedz „Restart from scratch".**
Istniejący `shape-notes.md` pochodzi z lipcowej sesji greenfieldowej i ma we frontmatterze
`context_type: greenfield`. Skill pomija auto-detekcję trybu, gdy plik już niesie
`context_type:` — „Resume" zablokowałoby sesję w trybie greenfield. „Restart" archiwizuje
stary plik do `context/foundation/archive/shape-notes-<data>.md` (nic nie ginie), po czym
detekcja poleci na czysto: repo trafia w Tier 1 (historia gita) i Tier 2
(`package-lock.json`), więc skill zaproponuje brownfield i poprosi o potwierdzenie.

**PRD v2 musi objąć również `S-07`** — to jedyny sposób, żeby wszedł do `M-02` z własnym FR.
Oraz spłacić wstecz brakujące FR dla `S-04`, `S-05` i `S-08`.

Wejście merytoryczne: `roadmap.md` §Kandydaci do następnego kamienia (M-02) — **skonsumuj tę
sekcję w `/10x-shape`, zanim `/10x-roadmap` zregeneruje plik i ją usunie** (Pułapka 1).

### Krok 4 — `S-07` + powiększony kafelek (zgłoszenia #2 i #1), pierwszy slice `M-02`

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

### Krok 5 — reszta paczki `M-02` (zgłoszenia #3, #4, #5, #6, #9)

Każdy slice standardowym łańcuchem, kolejność ustali `/10x-roadmap`.
Zacznij od **regeneracji tygodnia z zastępowaniem** — reszta paczki się o nią opiera.

### Krok 6 — faza 3 test-planu (ochrona zapisu i własności)

```
/10x-test-plan
```

**Dopiero po** slice'ie regeneracji tygodnia — patrz Pułapka 2.

### Krok 7 — rodzaje aktywności (zgłoszenie #8)

```
/10x-shape           # osobna sesja; wymaga researchu DZIEDZINOWEGO, nie kodowego
/10x-prd
/10x-roadmap
```

### Krok 8 — monetyzacja (zgłoszenie #10)

Własny kamień milowy, po #8 i #9 — to one są kandydatami na „za subskrypcją".
Wymaga powrotu do `infrastructure.md`.

### Krok 9 — faza 4 test-planu (bramki CI + e2e)

```
/10x-test-plan
```

Na końcu, gdy ścieżki krytyczne są już stabilne.


## Otwarte ogony po Kroku 1

Pierwszy ogon jest **wdrożony jako Krok 1a** (czeka na przegląd i archiwizację); reszta nie blokuje Kroku 2. Wszystko ma
wskazane wejście — żaden ogon nie wisi „kiedyś".

| Co                                                                | Właściciel / bramka wejścia                                                                                        |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| ~~**Angielskie komunikaty błędów z Supabase** na ekranach auth~~ | ✅ **Wdrożone 2026-08-31 jako Krok 1a** (`supabase-error-copy`, 3 fazy). `?error=` niesie kod, tłumaczenie w `src/lib/auth-error-messages.ts`; zamknęło przy okazji lukę phishingową w tym parametrze. Plan: `context/changes/supabase-error-copy/plan.md`. Pierwotny opis: `context/archive/2026-08-30-pl-landing-copy/follow-ups/supabase-error-copy.md` |
| **Pozycja 1.11 planu nieodhaczona** — układ na szerokości mobilnej i desktopowej | Weryfikacja wzrokowa strony `/`. Naturalnie domyka się w Kroku 4 (`S-07` i tak przebudowuje siatkę), ale strona jest już na produkcji — warto rzucić okiem wcześniej |
| **F6 → `/10x-lesson`**: bramka oparta na ręcznej liście wzorców musi być wyprowadzona z kodu albo mieć test na własną kompletność | Nie zapisane w `lessons.md`. Rodzina ta sama co §„Kryterium weryfikacji musi móc nie przejść" i §„Kryterium »poza X nietknięte« musi być odporne na przerównanie". Uruchom `/10x-lesson` — reguła wróci przy każdej bramce grepowej, w tym w fazie 2 test-planu |
| **F4, F5 — `PENDING`, świadomie bez decyzji**                     | F4: niespójna odmiana po `MIN_PASSWORD_LENGTH` (skutek nieosiągalny, stała = 6, Supabase wymusza 6). F5: produkcyjna gałąź `confirm-email` zweryfikowana tylko przez odczyt kodu (`isAutoConfirmed = import.meta.env.DEV`). Oba w `context/archive/2026-08-30-pl-landing-copy/reviews/impl-review.md` |

**Lekcja procesowa z Kroku 1 — potwierdzona po raz drugi w Kroku 1a:** runbook obiecywał
„copy w jednym komponencie", a wyszło dziewięć plików i dwie fazy. Ogon „angielskie
komunikaty Supabase" wyglądał na dwie trasy API, a objął też dwie strony `.astro` i wyciągnął
lukę bezpieczeństwa, o której nikt nie wiedział. Powierzchnia w tym pliku jest oszacowaniem,
nie zakresem — zakres ustala `/10x-plan` po przeczytaniu kodu. Nie traktuj wpisu
„Powierzchnia:" ani bramki w §Otwarte ogony jako sufitu.

Dwa trafienia z rzędu to już wzorzec, nie zbieg okoliczności — **kandydat na `/10x-lesson`**
obok F6 (patrz wiersz wyżej), gdyby powtórzył się po raz trzeci.

## Pułapki — cztery rzeczy, o które łatwo się potknąć

1. **Sekcja §Kandydaci do M-02 w `roadmap.md` jest tymczasowa.** Nie należy do schematu
   roadmapy, a `/10x-roadmap` przy otwieraniu `M-02` odtwarza plik z sekcji wymaganych i tę
   usunie. Decyzje o regeneracji tygodnia muszą przejść do `shape-notes.md` w kroku 3,
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
| Co dokładnie zmienił `pl-landing-copy` i dlaczego     | `context/archive/2026-08-30-pl-landing-copy/plan.md`                      |
| Findingi i decyzje z przeglądu `pl-landing-copy`      | `context/archive/2026-08-30-pl-landing-copy/reviews/impl-review.md`       |
| Odroczone tłumaczenie błędów Supabase — pierwotny opis | `context/archive/2026-08-30-pl-landing-copy/follow-ups/supabase-error-copy.md` |
| Decyzje o mapowaniu błędów auth i o kontrakcie `?error=` | `context/changes/supabase-error-copy/change.md` §Notes |
| Kolejność prac i komendy                              | ten plik                                                                  |
