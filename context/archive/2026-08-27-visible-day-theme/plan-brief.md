# Widoczny podtytuł dnia — plan brief

> Pełny plan: `context/changes/visible-day-theme/plan.md`
> Pozycja w roadmapie: `S-08` w `context/foundation/roadmap.md`

## What & Why

Generowanie tygodnia (S-03) tnie jedno hasło na pięć rozłącznych ujęć i zapisuje każde w wierszu planu jako `day_plans.theme`. Ten podtytuł widać dziś **wyłącznie** na tablicy tygodnia — siatka miesiąca i widok dnia go nie czytają, więc nauczyciel patrzący na miesiąc widzi pięć razy „Dinozaury" i nie ma jak odróżnić tych dni bez wchodzenia w każdy z nich. Ten slice pokazuje treść, która już istnieje, na dwóch powierzchniach, które jej nie pokazują.

## Starting Point

Kolumna `theme` istnieje od migracji `20260823232953` — nullowalna, z CHECK-iem 1–200 znaków, z granty­mi kolumnowymi dla `authenticated`. `readMonthSummary` w `src/lib/services/day-plan-store.ts` czyta trzy kolumny (`plan_date, prompt, accepted_at`) i mapuje je na `DayPlanSummary`; kafelek w `MonthGrid.astro` renderuje z tego jedną, uciętą linię z hasłem. `src/pages/plan.astro` czyta po stronie serwera pełny plan, ale nagłówek pokazuje tylko „Plan dnia" i datę. `WeekDayCard.tsx:60` renderuje temat poprawnie i jest wzorcem, do którego dwie nowe powierzchnie muszą się dostosować.

## Desired End State

Kafelek dnia w siatce miesiąca pokazuje dwie linie: hasło przygaszone u góry, temat wyróżniony pod nim. Pięć dni jednego hasła ma pięć różnych drugich linii; najechanie myszą i czytnik ekranu podają pełny, nieucięty tekst. Dzień bez tematu — wygenerowany pojedynczo z `/plan?date=` — wygląda dokładnie tak jak dziś. Wejście w dzień pokazuje ten sam temat pod datą w nagłówku, więc trzy ekrany mówią o tym samym dniu jedno i to samo.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Układ kafelka | Dwie linie, kafelek rośnie (`min-h-14` → `min-h-16`) | Hasło zostaje kotwicą tygodnia, temat różnicuje dni; nic nie ginie z powierzchni | Plan |
| Dzień bez tematu | Ciche zejście do dzisiejszego renderowania | `null` to ważny stan trwały, nie brak danych — placeholder oznaczałby normalne planowanie jako niekompletne | Roadmap + Plan |
| Miejsce w widoku dnia | Nagłówek SSR w `plan.astro` | Temat jest z poziomu tej strony niezmienny (`coalesce` w zapisie), więc tekst SSR nie może się zdezaktualizować i nie musi wchodzić do wyspy | Plan |
| Ucięty tekst | Pełna treść w `title` **i** w `aria-label` | Obie linie tną się przy ~12–16 znakach; `title` sam jest niedostępny dla dotyku i zawodny dla czytnika ekranu | Plan |
| Tablica tygodnia | Nietknięta, skopiowany jej wzorzec | Już jest poprawna i to ona definiuje zachowanie; zero powierzchni regresji na ekranie, na którym odbywa się generowanie | Roadmap (ryzyko 2) + Plan |
| Wspólny komponent tematu | Nie wyciągamy | Trzy wywołania mają różne rozmiary, tony i zachowania dla `null` — wspólna jednostka byłaby większą maszynerią niż trzy warunki | Plan |

## Scope

**W zakresie:**

- `theme` w `DayPlanSummary` (`src/types.ts`) i w `select` w `readMonthSummary` (`src/lib/services/day-plan-store.ts`)
- Dwuliniowy kafelek, `title` i `aria-label` w `src/components/plan/MonthGrid.astro`
- Warunkowa linia podtytułu w nagłówku `src/pages/plan.astro`

**Poza zakresem:**

- Nadanie tematu dniowi generowanemu pojedynczo (dotknęłoby ścieżki generowania i promptu)
- Iteracja jakościowa na promptcie szkicu tygodnia
- Jakakolwiek zmiana w `WeekDayCard.tsx`, `WeekPlanBoard.tsx`, `DayPlanEditor.tsx`
- Aktywności w odczycie miesiąca (`S-07`) i skreślenie miękkie (`S-05`)
- Migracje, RLS, granty

## Architecture / Approach

```
day_plans.theme  ──►  readMonthSummary (+1 kolumna, to samo zapytanie)
                          │
                          ▼
                    DayPlanSummary (+ theme: string | null)
                          │
                          ▼
                    MonthGrid.astro  →  kafelek: hasło / temat, title, aria-label

day_plans.theme  ──►  readDayPlan (bez zmian)  ──►  plan.astro <header> → linia podtytułu
```

Slice jest wyłącznie odczytowy: nie dokłada zapytania, nie dotyka zapisu, nie hydratuje niczego nowego. Ton `text-purple-200/90` w obu nowych miejscach jest cytatem z `WeekDayCard.tsx:60` i to jest jego jedyne uzasadnienie.

## Phases at a Glance

| Faza | Co dostarcza | Główne ryzyko |
| --- | --- | --- |
| 1. Podtytuł w siatce miesiąca | Temat dociera z bazy do kafelka: druga linia, tooltip, nazwa dostępna | Gęstość siatki — dwie ucięte linie po 10px w 7 kolumnach; wysokość kafelka rozstrzyga kontrola wizualna, nie arytmetyka |
| 2. Podtytuł w widoku dnia | Linia podtytułu w nagłówku SSR `/plan?date=` | Znikome — tekst statyczny na już odczytanym planie; ryzykiem byłoby wciągnięcie go do wyspy bez potrzeby |

**Prerequisites:** `S-03` (temat powstaje i jest zapisywany) i `S-04` (siatka miesiąca jest ekranem głównym) — oba `done`. Nic nie blokuje.
**Estimated effort:** jedna sesja; cztery pliki, ~30 linii delty, bez migracji.

## Open Risks & Assumptions

- **Wysokość kafelka to jedyna otwarta zmienna.** Arytmetyka mówi, że dwie linie mieszczą się nawet w dzisiejszym `min-h-14`, ale bez zapasu i przy `justify-between`. Plan ustawia `min-h-16` i oddaje wybór między 16 a 18 kontroli wizualnej w fazie 1.
- **Zakładamy, że tematy z modelu czytają się jako podtytuł.** Jeśli okażą się zbyt długie albo zbyt zbliżone do hasła, kafelek to obnaży — ale poprawa promptu jest jawnie poza zakresem i zostaje jako możliwa przyszła pozycja.
- **`S-05` i `S-07` dokładają do tej samej ścieżki odczytu miesiąca.** `S-08` idzie pierwszy celowo: ustala, co kafelek pokazuje w stanie spoczynku, zanim `S-07` zdecyduje, co pokazuje po interakcji. `S-05` może iść równolegle, ale oba dotkną `readMonthSummary`.
- **Brak runnera testów JS** — bramka automatyczna to `lint`, `astro check`, `build` i punktowe `grep`. Poprawność wizualna jest weryfikowana ręcznie, jak w każdym slice'ie tego projektu.

## Success Criteria (Summary)

- Nauczyciel patrzący na siatkę miesiąca odróżnia od siebie pięć dni jednego hasła bez wchodzenia w żaden z nich.
- Dzień bez tematu wygląda dokładnie tak jak przed zmianą — żadna powierzchnia nie traci linii tekstu, którą dziś ma.
- Miesiąc, tydzień i dzień pokazują dla tego samego dnia ten sam tekst tematu.
