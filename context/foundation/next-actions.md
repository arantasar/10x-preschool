# Next Actions — ustalenia z 2026-08-30

> Runbook kolejności prac i komend 10x. Dokument roboczy, edytowany w miejscu:
> odhaczaj kroki i dopisuj nowe zgłoszenia. Decyzje produktowe mieszkają w
> `roadmap.md` (S-07 §Decyzje, §Kandydaci do następnego kamienia) — tutaj jest
> **kolejność i to, co uruchomić**, nie druga kopia tamtych decyzji.

## Stan wyjściowy (2026-08-30)

- `context/changes/` — puste. Ostatnia zmiana (`testing-generation-contract-boundary`) zarchiwizowana, `master` czysty.
- **`M-01` zamknięty 2026-08-30** z ośmioma pozycjami `done` z dziewięciu. `S-07` jawnie wypisany z zakresu i przeniesiony do `M-02` — powód i koszt zapisane w `roadmap.md` §Milestone History.
- `S-07` jest `ready`, decyzje zamknięte, czeka na FR z PRD v2. Żaden kamień nie jest teraz otwarty (`milestone_status: done`).
- `test-plan.md` §3: faza 1 `complete`, fazy 2–4 `not started`.
- PRD v1 wyczerpał się na `S-03`; `S-04`, `S-05`, `S-08` zarchiwizowane z pustą rubryką „PRD refs" (Open Roadmap Questions #3, wciąż otwarte).

## Triage dziesięciu zgłoszeń

| #   | Zgłoszenie                                           | Gdzie trafia                              |
| --- | ---------------------------------------------------- | ----------------------------------------- |
| 1   | Kafelek mieści cały podtytuł                         | wchłonięte przez `S-07`                   |
| 2   | Podgląd aktywności na hoverze                        | `S-07` — pierwszy slice `M-02`            |
| 3   | Akceptacja blokuje edycję                            | paczka `M-02` (zawężone)                  |
| 4   | Przyciski cofnięcia/usunięcia wyżej                  | paczka `M-02` (razem z #3)                |
| 5   | Tydzień zablokowany, gdy wszystkie dni zaakceptowane | paczka `M-02` (zawężone)                  |
| 6   | Cofnięcie akceptacji i usunięcie z widoku tygodnia   | paczka `M-02`                             |
| 7   | Polska strona główna                                 | poprawka `pl-landing-copy`, poza roadmapą |
| 8   | Rodzaje aktywności                                   | odwrócenie PRD §Non-Goals — osobno        |
| 9   | Wydruk zaakceptowanego tygodnia                      | paczka `M-02`                             |
| 10  | Monetyzacja                                          | własny kamień milowy, na końcu            |

Do paczki `M-02` doszła pozycja, której nie było na liście: **regeneracja tygodnia z
zastępowaniem istniejących dni** — wyszła z doprecyzowania #2 i jest najcięższa z całej paczki.

## Kolejność — krok po kroku

Jeden folder zmiany w locie naraz. Między handoffami `/clear`.

### Krok 1 — `pl-landing-copy` (zgłoszenie #7)

```
git checkout -b chore/pl-landing-copy
/10x-new pl-landing-copy
/10x-plan            # /10x-research pomijalny — zmiana copy w jednym komponencie
/10x-implement pl-landing-copy phase 1
/10x-impl-review
/10x-archive pl-landing-copy
```

Powierzchnia: `src/pages/index.astro` → `src/components/Welcome.astro` (copy ze startera).

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

| Co                                                    | Gdzie                                            |
| ----------------------------------------------------- | ------------------------------------------------ |
| Decyzje o wzorcu interakcji podglądu, dane na żądanie | `roadmap.md` → `S-07` §Decyzje                   |
| Decyzje o regeneracji tygodnia i jej konsekwencjach   | `roadmap.md` → §Kandydaci do następnego kamienia |
| Dlaczego `M-01` zamknął się bez odczytu z siatki      | `roadmap.md` → §Milestone History                |
| Dług PRD dla `S-04`…`S-08`                            | `roadmap.md` → §Open Roadmap Questions #3        |
| Stan rolloutu testów                                  | `test-plan.md` §3 (`/10x-test-plan --status`)    |
| Kolejność prac i komendy                              | ten plik                                         |
