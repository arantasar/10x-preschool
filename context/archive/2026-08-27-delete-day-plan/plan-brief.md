# Usunięcie planu dnia — plan brief

> Pełny plan: `context/changes/delete-day-plan/plan.md`
> Pozycja w roadmapie: `S-05` w `context/foundation/roadmap.md`

## What & Why

Nauczyciel może dziś wygenerować plan dnia, poprawić go i zaakceptować — ale nie może go cofnąć. Jedyne, co da się z zaplanowanym dniem zrobić, to zregenerować go na nowe propozycje; wiersz zostaje na zawsze, a dzień na zawsze wygląda jak zaplanowany. To domyka pętlę zapisu od drugiej strony: pomyłkowe hasło, dzień, który wypadł z planu, tydzień wygenerowany na złą datę — wszystko to jest dziś nieodwracalne.

Slice daje **trwałe** usunięcie planu wybranego dnia z poziomu widoku tego dnia. Dzień wraca do stanu nieodróżnialnego od dnia nigdy nieplanowanego.

## Starting Point

Cały mechanizm kasowania stoi w schemacie od F-01 i nikt go dotąd nie użył. `20260718211452_day_plans_and_activities.sql` zakłada politykę `authenticated users can delete their own day plans` oraz `activities_plan_id_user_id_fkey … on delete cascade`; `20260720162553` zdjął `authenticated` wyłącznie przywilej UPDATE, DELETE został nietknięty. Warstwa store (`src/lib/services/day-plan-store.ts`) ma cztery ścieżki odczytu i trzy zapisu — żadnej kasującej. Trasa `src/pages/api/day-plan/index.ts` obsługuje `GET ?date=`. Wyspa `DayPlanEditor` prowadzi generowanie, edycję i akceptację przez jedno `mutate()`, którego ścieżka sukcesu wymaga ciała z planem.

## Desired End State

Nauczyciel otwiera dzień z planem, klika „Usuń plan dnia", potwierdza dialog nazywający stratę — i ląduje na tym samym dniu, pustym: formularz hasła bez treści, komunikat „Ten dzień nie ma jeszcze planu", nagłówek bez podtytułu. Siatka miesiąca pokazuje kafelek jako „brak planu", tablica tygodnia jako dzień wolny. Wygenerowanie tygodnia obejmującego ten dzień generuje go ponownie, zamiast oznaczyć jako „pominięty".

## Key Decisions Made

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Kształt kasowania | **Twarde** — `DELETE` wiersza, kaskada zabiera aktywności | PRD nie wymaga retencji, produkt nie ma cofania nigdzie indziej (S-02 usunął undo świadomie), a skreślenie miękkie zostawiłoby rezydentne dane bez czytelnika — `lessons.md` #2 | Plan (odwraca Outcome S-05) |
| Zakres | Cały dzień: hasło, temat i propozycje | Jeden stan „pusty" w całym produkcie; wariant „propozycje znikają, hasło zostaje" stworzyłby trzeci stan, który kafelek pokazywałby jako zaplanowany, a generowanie tygodnia by pomijało | Plan |
| Miejsce akcji | Tylko widok dnia (`/plan?date=`) | Outcome S-05 dosłownie; nauczyciel widzi treść, którą kasuje, zanim kliknie — najtańsza ochrona przed pomyłką przy operacji bez cofania | Roadmap + Plan |
| Potwierdzenie | `window.confirm`, **bezwarunkowo** | Wzorzec z `generate()`, ale bez jego warunku na akceptację: regeneracja daje w zamian nową partię, kasowanie nie daje nic, a plan roboczy też kosztował 10–30 s i tokeny | Plan |
| Trasa | `DELETE /api/day-plan?date=` | Ten sam plik i parametr co istniejący `GET`; `unique (user_id, plan_date)` + RLS gwarantują co najwyżej jeden wiersz, więc `id` nie wnosi nic ponad datę | Plan |
| Wyścig | Bezwarunkowo, `404` gdy nie było czego kasować | „Ten dzień ma być pusty" jest prawdziwe niezależnie od tego, która partia w nim stoi — inaczej niż akceptacja, która **poświadcza** konkretne propozycje i dlatego bierze `expected_generation`. Idempotentne dla drugiej zakładki | Plan |
| Po skasowaniu | Zostaje na dniu — przez przeładowanie tego samego URL-a | Podtytuł dnia jest statycznym SSR poza zasięgiem wyspy (`plan.astro:55`); samo `setPlan(null)` zostawiłoby temat skasowanego dnia nad komunikatem „brak planu" | Plan |
| Weryfikacja | Nowa suita pgTAP + lint/check/build | Kaskada i przywilej DELETE pękają bezobjawowo — lint, `astro check` ani build ich nie dotykają. To jedyna bramka w repo, która potrafi tu nie przejść | Plan + `lessons.md` |

## Scope

**W zakresie:**

- `deleteDayPlan()` w `src/lib/services/day-plan-store.ts`
- Nowa suita `supabase/tests/database/day_plan_delete.test.sql` (6 asercji)
- `noContent()` w `src/lib/services/day-plan-http.ts`
- `export const DELETE` w `src/pages/api/day-plan/index.ts`
- Przycisk, dialog i gałąź `"deleting"` w `src/components/plan/DayPlanEditor.tsx`
- Korekta bloku `S-05` w `context/foundation/roadmap.md`

**Poza zakresem:**

- Skreślenie miękkie, kolumna `deleted_at`, kosz, cofanie kasowania
- Kasowanie samych propozycji z zachowaniem hasła
- Kasowanie z tablicy tygodnia i z siatki miesiąca
- `expected_generation` na trasie kasującej
- Migracje, RLS, granty — wszystko potrzebne stoi od F-01
- Wpięcie `npm run test:db` do CI

## Architecture / Approach

```
DayPlanEditor  ──DELETE /api/day-plan?date=──►  deleteDayPlan()
   window.confirm                                     │
        │                                             ▼
        │                                   delete from day_plans
        │                                             │  on delete cascade
        │                                             ▼
        │                                        activities
        ▼
  204 ──► window.location.assign('/plan?date=…')  ──►  SSR renderuje pusty dzień
```

Slice nie dokłada migracji i nie dotyka ani jednej ścieżki odczytu. To jest cała różnica między twardym a miękkim kasowaniem: `readDayPlan`, `readWeekPlans`, `readMonthSummary` i `save_day_plan_generation` pytają o wiersze, które istnieją, więc skasowany wiersz jest dla nich dniem wolnym bez żadnej zmiany w kodzie. Skreślenie miękkie wymagałoby nauczenia skreślenia wszystkich czterech — a każde pominięte miejsce oznaczałoby dzień „usunięty", który wraca w siatce miesiąca albo jest cicho pomijany przez generowanie tygodnia.

## Phases at a Glance

| Faza | Co dostarcza | Główne ryzyko |
| --- | --- | --- |
| 1. Kasowanie w warstwie danych | `deleteDayPlan()` + suita pgTAP: przywilej DELETE, kaskada, „tylko ten dzień", `p_require_absent` po skasowaniu | Asercje pisane bez sprawdzenia mutacją byłyby komentarzem, nie bramką — `lessons.md` „kryterium musi móc nie przejść" |
| 2. Trasa `DELETE` | `DELETE /api/day-plan?date=` → `204` / `404` / koperta błędów | `204` bez ciała odbiega od koperty, którą wszystkie pozostałe trasy dzielą; musi być widoczne w `day-plan-http.ts`, nie odkryte w wyspie |
| 3. Przycisk w widoku dnia | Przycisk, dialog, powrót na pusty dzień | Ścieżka sukcesu bez ciała w `mutate()` — bez jawnej gałęzi udane kasowanie zameldowałoby się jako błąd nad skutkiem sukcesu |
| 4. Domknięcie roadmapy | S-05 opisuje to, co faktycznie stanęło | Znikome; ryzykiem jest pominięcie fazy i zostawienie roadmapy sprzecznej z kodem |

**Prerequisites:** `S-02` (jest co kasować) i `S-03` (`p_require_absent`, którego kasowanie musi zwolnić) — oba `done`. Nic nie blokuje. Wymagany Docker + `npx supabase start` dla fazy 1. Przed pierwszym commitem gałąź funkcyjna — repo stoi na `master`.
**Estimated effort:** jedna do dwóch sesji; pięć plików źródłowych, jeden nowy plik testowy, bez migracji.

## Open Risks & Assumptions

- **Nieodwracalność jest jedynym prawdziwym ryzykiem tego slice'u** — i zastępuje oba ostrza, które roadmapa przypisała skreśleniu miękkiemu. Między pomyłkowym kliknięciem a utratą hasła i trzech propozycji stoi wyłącznie `window.confirm`. Jeśli to okaże się za mało, wariantem odwrotu jest okno „Cofnij" w wyspie — ale to rekonstrukcja przez `save_day_plan_generation`, nie przywrócenie: nowy `id`, `current_generation = 1`, akceptacja nie wraca.
- **Odwracamy Outcome S-05 zapisany w roadmapie.** Decyzja jest świadoma i faza 4 ją utrwala, ale to zmiana w dokumencie, który powstał wcześniej i był uzgodniony.
- **`p_require_absent` po skasowaniu przepuszcza generację przez `coalesce(v_exists, false)`** — to lektura funkcji, nie obserwacja. Faza 1 zamienia to w asercję pgTAP właśnie dlatego, że pomyłka tutaj byłaby bezobjawowa: dzień cicho pomijany przez generowanie tygodnia.
- **`npm run test:db` nie stoi w CI.** Nowa suita chroni te własności tylko wtedy, gdy ktoś ją lokalnie uruchomi. Wpięcie do CI jest jawnie poza zakresem — i jest to dług, nie przeoczenie.
- **Brak synchronizacji między zakładkami.** Dzień skasowany w jednej zakładce zostaje na ekranie w drugiej, aż do jej odświeżenia. Tak działa cały produkt; ten slice tego nie pogarsza i nie naprawia.

## Success Criteria (Summary)

- Nauczyciel usuwa plan dnia z widoku tego dnia, po jednym potwierdzeniu, i widzi skutek natychmiast na tym samym dniu.
- Dzień skasowany i dzień nigdy nieplanowany są nieodróżnialne na wszystkich trzech ekranach — i dla generowania tygodnia, które obejmuje go ponownie zamiast pominąć.
- Kaskada i przywilej DELETE są udowodnione asercjami, które sprawdzono na czerwono, a nie założone na podstawie lektury migracji.
