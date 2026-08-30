# Next Actions — ustalenia z 2026-08-30

> Runbook kolejności prac i komend 10x. Dokument roboczy, edytowany w miejscu:
> odhaczaj kroki i dopisuj nowe zgłoszenia. Decyzje produktowe mieszkają w
> `roadmap.md` (S-07 §Decyzje, §Kandydaci do następnego kamienia) — tutaj jest
> **kolejność i to, co uruchomić**, nie druga kopia tamtych decyzji.

## Stan wyjściowy (2026-08-30)

- `context/changes/` — puste. Ostatnia zmiana (`testing-generation-contract-boundary`) zarchiwizowana, `master` czysty.
- `M-01` otwarty; wszystko `done` poza `S-07`, który **2026-08-30 przeszedł z `blocked` na `ready`**.
- `test-plan.md` §3: faza 1 `complete`, fazy 2–4 `not started`.
- PRD v1 wyczerpał się na `S-03` — `S-04`…`S-08` nie mają własnych FR (Open Roadmap Questions #3).

## Triage dziesięciu zgłoszeń

| # | Zgłoszenie                                              | Gdzie trafia                          |
| - | ------------------------------------------------------- | ------------------------------------- |
| 1 | Kafelek mieści cały podtytuł                            | wchłonięte przez `S-07`               |
| 2 | Podgląd aktywności na hoverze                           | `S-07` (odblokowany)                  |
| 3 | Akceptacja blokuje edycję                               | paczka `M-02` (zawężone)              |
| 4 | Przyciski cofnięcia/usunięcia wyżej                     | paczka `M-02` (razem z #3)            |
| 5 | Tydzień zablokowany, gdy wszystkie dni zaakceptowane    | paczka `M-02` (zawężone)              |
| 6 | Cofnięcie akceptacji i usunięcie z widoku tygodnia      | paczka `M-02`                         |
| 7 | Polska strona główna                                    | poprawka `pl-landing-copy`, poza roadmapą |
| 8 | Rodzaje aktywności                                      | odwrócenie PRD §Non-Goals — osobno    |
| 9 | Wydruk zaakceptowanego tygodnia                         | paczka `M-02`                         |
| 10| Monetyzacja                                             | własny kamień milowy, na końcu        |

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

### Krok 3 — `S-07` + powiększony kafelek (zgłoszenia #2 i #1)

```
git checkout -b feat/month-day-preview
/10x-new month-day-preview
/10x-research        # kluczowe pytanie: dociąganie aktywności na hover — opóźnienie,
                     # anulowanie żądania przy zejściu z kafelka, cache pobranych dni
/10x-plan
/10x-plan-review
/10x-implement month-day-preview phase <N>
/10x-impl-review
```

**Nie archiwizuj jeszcze** — patrz Pułapka 1.

### Krok 4 — PRD v2 i otwarcie `M-02` (zgłoszenia #3, #4, #5, #6, #9)

```
/10x-shape           # brownfield, wykryje po cwd; wejście: roadmap.md §Kandydaci do M-02
/10x-prd             # v2 z nowymi FR + bump prd_version; domyka Open Roadmap Questions #3
/10x-roadmap         # zamknięcie M-01, otwarcie M-02, dekompozycja na slice'y
```

Potem każdy slice `M-02` standardowym łańcuchem: `/10x-new` → `/10x-research` → `/10x-plan`
→ `/10x-plan-review` → `/10x-implement` → `/10x-impl-review` → `/10x-archive`.
Zacznij od regeneracji tygodnia z zastępowaniem — reszta paczki się o nią opiera.

### Krok 5 — faza 3 test-planu (ochrona zapisu i własności)

```
/10x-test-plan
```

**Dopiero po** slice'ie regeneracji tygodnia — patrz Pułapka 2.

### Krok 6 — rodzaje aktywności (zgłoszenie #8)

```
/10x-shape           # osobna sesja; wymaga researchu DZIEDZINOWEGO, nie kodowego
/10x-prd
/10x-roadmap
```

### Krok 7 — monetyzacja (zgłoszenie #10)

Własny kamień milowy, po #8 i #9 — to one są kandydatami na „za subskrypcją".
Wymaga powrotu do `infrastructure.md`.

### Krok 8 — faza 4 test-planu (bramki CI + e2e)

```
/10x-test-plan
```

Na końcu, gdy ścieżki krytyczne są już stabilne.

## Pułapki — cztery rzeczy, o które łatwo się potknąć

1. **`S-07` nie może trafić do archiwum z pustą rubryką `PRD refs`.** Można go planować i
   implementować przed PRD v2, ale archiwizacja czeka na krok 4 (albo przestaw kolejność).
   To ten sam dług, co Open Roadmap Questions #3, obejmujący `S-04`…`S-08`.
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

| Co                                                       | Gdzie                                             |
| -------------------------------------------------------- | ------------------------------------------------- |
| Decyzje o wzorcu interakcji podglądu, dane na żądanie    | `roadmap.md` → `S-07` §Decyzje                    |
| Decyzje o regeneracji tygodnia i jej konsekwencjach      | `roadmap.md` → §Kandydaci do następnego kamienia  |
| Dług PRD dla `S-04`…`S-08`                               | `roadmap.md` → §Open Roadmap Questions #3         |
| Stan rolloutu testów                                     | `test-plan.md` §3 (`/10x-test-plan --status`)     |
| Kolejność prac i komendy                                 | ten plik                                          |
