# S-04 `month-home` — Plan Brief

> Full plan: `context/changes/month-home/plan.md`

## What & Why

Zalogowany nauczyciel ma lądować w widoku miesiąca — realnej jednostce jego pracy — a nie na
starterowym pulpicie, który jest tylko przystankiem z trzema linkami. Siatka miesiąca już istnieje
(powstała jako p6 wewnątrz S-03); brakuje wyłącznie przeniesienia punktu wejścia i wygaszenia
`/dashboard`.

## Starting Point

`POST /api/auth/signin` przekierowuje na `/`, a `/` renderuje angielską stronę marketingową startera.
`/dashboard` to też szablon, z trzema dopisanymi linkami do planowania — i z **jedynym osiągalnym
w zalogowanej aplikacji** przyciskiem wylogowania. Drugi taki przycisk jest w `Topbar.astro`, ale
Topbar renderuje się wyłącznie na stronie dla niezalogowanych. Trzy linki w interfejsie, wpis
w `PROTECTED_ROUTES`, wiersz w README i zdanie w `CLAUDE.md` wskazują na `/dashboard`.

## Desired End State

Nauczyciel loguje się i ląduje bezpośrednio na `/plan/month`. Wejście na samą domenę w otwartej sesji
też prowadzi tam bez przystanku. Na miesiącu, tygodniu i dniu stoi u góry ten sam pasek: nazwa
aplikacji prowadząca do miesiąca, jego e-mail i „Wyloguj się". `/dashboard` nie istnieje. Niezalogowany
widzi na `/` dokładnie to, co dziś.

## Key Decisions Made

| Decision                      | Choice                                                        | Why (1 sentence)                                                                                              |
| ----------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Mechanizm punktu wejścia      | Przekierowanie w `index.astro` + zmiana celu w `signin.ts`     | Jeden skok na ścieżce najczęstszej, decyzja w stronie, która ją podejmuje — middleware zostaje przy jednym pytaniu „czy trasa wymaga sesji". |
| Los `/dashboard`              | Kasowanie w całości                                            | Trasa istniejąca tylko po to, żeby przekierować, musiałaby zostać w `PROTECTED_ROUTES`, inaczej wycieka zalogowany cel niezalogowanym.        |
| Kontrolka wylogowania         | Przenosi się do powłoki S-04; S-06 zamknięte jako dostarczone  | Nie ma momentu w rolloucie, w którym nauczyciel nie może wyjść z sesji — cena to jawny wpis w roadmapie zamiast osobnego slice'u.             |
| Zakres powłoki                | Jeden `AppHeader.astro`, nagłówki stron zostają                 | Powtarza się tylko wiersz z e-mailem; trzy strony mają różne `max-w` i różny sens nagłówka, więc pełny layout sięgałby głębiej niż trzeba.    |
| Back-linki                    | Dzień → jego miesiąc; miesiąc traci back-link                   | Każdy ekran dostaje jeden przewidywalny krok w górę niezależnie od tego, skąd się na niego weszło; ekran główny nie ma żadnego.               |
| `Welcome.astro`               | Poza zakresem                                                  | Strona marketingowa to osobny problem bez własnego slice'u — poprawiamy w niej wyłącznie link do kasowanej trasy.                             |

## Scope

**In scope:**

- Nowy `src/components/AppHeader.astro` z e-mailem i wylogowaniem, na trzech stronach planowania
- Przekierowanie zalogowanego z `/` na `/plan/month`; `signin.ts` celuje tam wprost
- Usunięcie `dashboard.astro`, wpisu w `PROTECTED_ROUTES` i wszystkich linków do trasy
- Retargetowanie back-linku dnia, usunięcie back-linku miesiąca, naprawa linku w `Topbar.astro`
- Aktualizacja `README.md` i `CLAUDE.md`, które nazywają kasowany plik
- Zapis w roadmapie, że FR-003 (S-06) dostarczyła powłoka z S-04

**Out of scope:**

- `Welcome.astro` — angielski szablon startera zostaje
- `MonthGrid.astro` i `readMonthSummary` — podgląd aktywności to S-07
- Pełny layout-wrapper (tło, szerokości, `py-10` zostają zduplikowane)
- Potwierdzenie wylogowania, migracje, warstwa testów

## Architecture / Approach

Cztery fazy w kolejności wymuszonej przez jedną kontrolkę:

```
faza 1  AppHeader.astro → miesiąc, tydzień, dzień     (wylogowanie w 4 miejscach)
faza 2  / → /plan/month dla zalogowanego; signin też   (punkt wejścia przeniesiony)
faza 3  dashboard.astro skasowany, linki i docs        (wylogowanie w 3 miejscach)
faza 4  roadmap: S-06 zamknięte, niewiadoma S-04 też   (decyzja zapisana)
```

Faza 1 **musi** poprzedzać fazę 3. Odwrotnie — albo obie w jednym commicie z kasowaniem na przodzie —
powstaje zakres, w którym `/` przenosi zalogowanego na miesiąc, `Welcome.astro` z Topbarem jest dla
niego nieosiągalny, a pulpitu już nie ma: sesji nie da się zakończyć z interfejsu.

## Phases at a Glance

| Phase                          | What it delivers                                       | Key risk                                                                       |
| ------------------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| 1. Powłoka zalogowanej aplikacji | Pasek z e-mailem i wylogowaniem na trzech stronach   | Usunięcie „Zalogowano jako" zostawia nieużywane `user` → lint                   |
| 2. Przeniesienie punktu wejścia  | Logowanie i `/` prowadzą na `/plan/month`            | Pętla przekierowań, jeśli warunek nie czyta `Astro.locals.user`                 |
| 3. Wygaszenie pulpitu            | `/dashboard` znika wraz ze wszystkimi odwołaniami    | Przeoczone odwołanie zostaje jako 404 — bramka `grep` je łapie                  |
| 4. Zapis decyzji o S-06          | Roadmapa mówi to samo we wszystkich czterech miejscach | Niespójny status S-06 między tabelą a blokiem                                   |

**Prerequisites:** S-03 zarchiwizowane (jest); gałąź funkcjonalna przed pierwszym commitem —
`CLAUDE.md` § Git, a `git branch --show-current` na starcie wskazywał `master`.
**Estimated effort:** ~1 sesja; fazy 1–3 to kilkanaście plików dotkniętych płytko, faza 4 to papier.

## Open Risks & Assumptions

- **PRD nie pokrywa tego slice'u.** Pojęcie „ekranu głównego" nie ma własnego FR w PRD v1 — to Open
  Roadmap Question #3, otwarta dla S-04, S-05 i S-07. Slice da się zaplanować z opisu, ale trafi do
  archiwum z rubryką „PRD refs" wskazującą FR-004/US-01 pośrednio.
- **`Welcome.astro` zostaje po angielsku.** PRD wymaga całego interfejsu po polsku; pierwsza strona,
  jaką widzi nowy nauczyciel, tego wymogu nie spełnia. Odłożone świadomie, bez własnego slice'u
  w roadmapie — kandydat do dopisania.
- **S-06 traci osobny wpis w `## Done`.** Roadmapa ostrzegała, że przy tej decyzji FR-003 nigdy nie
  dostanie własnej pozycji; faza 4 istnieje wyłącznie po to, żeby ostrzeżenie nie stało się faktem.
- **Zakładki na `/dashboard` przestaną działać.** Przyjęte przy jednym użytkowniku.
- **Hosted project wciąż bez siedmiu migracji** (pozycja wdrożeniowa z S-03) — nie blokuje tego
  slice'u, blokuje wdrożenie.

## Success Criteria (Summary)

- Nauczyciel po zalogowaniu widzi miesiąc, nie pulpit — i wraca do niego z tygodnia i z dnia bez
  wpisywania URL-a z ręki
- Na każdym ekranie zalogowanej aplikacji, łącznie z ekranem błędu odczytu, da się wyjść z sesji
- Nic w kodzie ani w dokumentacji nie nazywa już `/dashboard`
