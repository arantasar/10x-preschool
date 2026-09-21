# Edycja dnia zaakceptowanego zdejmuje akceptację — Plan Brief

> Full plan: `context/changes/edit-unaccepts-day/plan.md`
> Roadmap: `context/foundation/roadmap.md` S-12 · PRD: `context/foundation/prd-v2.md` FR-017

## What & Why

Nauczyciel poprawiający treść dnia, który wcześniej zaakceptował, dostaje potwierdzenie, a po zgodzie dzień traci stan zaakceptowania — zamiast wyglądać na zatwierdzony z treścią zmienioną po akceptacji. To FR-017 i reguła nadrzędna całej paczki M-02: **jawność proporcjonalna do skutku** — nic nie jest zakazane, ale wszystko, co niszczy pracę oznaczoną jako gotowa, pyta.

## Starting Point

**Skutek już działa; brakuje pytania i informacji.** Trigger `activities_edit_clears_acceptance` zeruje `accepted_at` przy każdej zmianie tytułu lub opisu propozycji od S-02 (2026-08-23), a trasa `PATCH` zwraca cały plan właśnie po to, żeby wyspa zobaczyła oba fakty naraz. Czego nie ma: nikt nie pyta przed zapisem, i nikt nie mówi po nim — zielona plakietka po prostu znika, a banner przeskakuje na „Plan roboczy" bez słowa o przyczynie. Przyciski akceptacji i usunięcia siedzą na dole wyspy, nie przy przycisku generowania.

⚠️ **PRD v2 §Business Logic Changes reguła 2 opisuje stan „Dziś" niezgodnie z kodem** — twierdzi, że edycja nie rusza etykiety akceptacji. To nieprawda od S-02. Plan odnotowuje poprawiony punkt wyjścia; PRD nie jest edytowany w tym PR.

## Desired End State

Nauczyciel klika „Zapisz" na propozycji w dniu zaakceptowanym i dostaje pytanie nazywające skutek. Po „Anuluj" nie dzieje się nic — tekst zostaje, akceptacja stoi, żadne żądanie nie wychodzi. Po „OK" zapis przechodzi, a w miejscu zielonej plakietki staje zdanie mówiące **dlaczego** dzień wrócił do roboczego, z drogą powrotną „Akceptuj ponownie". Druga edycja tego samego dnia nie pyta już o nic. Operacja akceptacji stoi przy przycisku generowania; usunięcie zostaje wyciszone na dole.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Rozbieżność PRD | Odnotować w planie, nie edytować PRD | `prd-v2.md` to zamrożony artefakt M-02; `CLAUDE.md` trzyma edycje `context/foundation/*` w osobnym torze | Plan |
| Moment pytania | Przy „Zapisz", nie przy „Edytuj" | Akceptacja ginie przy zapisie; „Anuluj" zachowuje dzisiejszą obietnicę „nic nie zostanie zapisane" bez wyjątków | Plan |
| Bariera | Sam dialog — bez odmowy po stronie serwera | Utrata akceptacji jest odwracalna jednym kliknięciem, inaczej niż regeneracja kasująca opłaconą partię. Asymetria z `confirm_replace` jest zasadą, nie przeoczeniem | Plan |
| Powtarzalność | Pytamy tylko, dopóki plan jest zaakceptowany | Po pierwszym zapisie nie ma czego odbierać; ta sama bramka `accepted`, której używa `generate()` | Plan |
| Informacja po fakcie | Banner nazywa przyczynę, znika po przeładowaniu | Drugi takt FR-017; stan lokalny dla wyspy, więc bez migracji i bez pytania o retencję | Plan |
| Nieaktualna kopia stanu | **Trasa raportuje, co zdjęła** | Kopia wyspy bywa stara; bez tego stale-false dałoby ciche cofnięcie, czyli dokładnie to, co slice likwiduje. Najgorszy przypadek degraduje się do „nie zapytano, ale powiedziano prawdę" | Plan |
| Kafelek i nagłówek | Nieodróżnialny od nigdy niezaakceptowanego | Domyka jedyny `Unknown` S-12; powierzchnie akceptacji w tygodniu należą do S-11 | Roadmap + Plan |
| Warunek układu | Akceptacja przy generowaniu, usunięcie wyciszone niżej | Warunek każe zachować ostrożność; posadzenie nieodwracalnego kasowania obok wielokrotnie klikanego generowania realizowałoby literę przeciw treści | PRD + Plan |
| Warstwa testów | E2E na odmowę + testy jednostkowe trasy | `window.confirm` nie ma domu poza przeglądarką; nowe zachowanie trasy stoi taniej i deterministycznie | Plan |

## Scope

**W zakresie:** dialog potwierdzenia przy zapisie edycji na dniu zaakceptowanym; raportowanie przez trasę `PATCH`, czy edycja zdjęła akceptację; trzeci stan bannera nazywający przyczynę; przeniesienie przycisku akceptacji do rzędu przy generowaniu; test e2e ścieżki odmowy; testy jednostkowe trasy edycji (dziś ich nie ma).

**Poza zakresem:** jakakolwiek migracja; odmowa po stronie serwera w stylu `confirm_replace`; zmiany w widoku tygodnia i miesiąca; edycja `prd-v2.md`; nowe testy pgTAP na trigger S-02; dialog przy otwarciu edytora; zmiany w mechanice `expected_generation`.

## Architecture / Approach

```
„Zapisz"  ─(plan zaakceptowany?)─► window.confirm ─(Anuluj)─► nic się nie dzieje
                    │                      │
                    │ (roboczy)            │ (OK)
                    ▼                      ▼
              PATCH /api/day-plan/activity/:id
                    │
                    ├─ odczyt accepted_at PRZED zapisem  ◄── nowość Fazy 1
                    ├─ update (trigger zeruje accepted_at)
                    └─ odpowiedź: plan + acceptance_cleared?
                                        │
                                        ▼
                            banner nazywa przyczynę
                       (nawet gdy dialogu nie było — stale copy)
```

Cała zmiana mieści się w czterech plikach produkcyjnych: `day-plan-store.ts`, `day-plan-http.ts`, `activity/[id].ts`, `DayPlanEditor.tsx`, plus predykat w `day-plan-guards.ts`. Odczyt akceptacji przed zapisem idzie przez osadzone `select` na `activities` — z jawną podpowiedzią nazwy klucza obcego, bo `activities_plan_id_user_id_fkey` jest dwukolumnowy.

## Phases at a Glance

| Faza | Co dostarcza | Główne ryzyko |
| --- | --- | --- |
| 1. Serwer raportuje, co zdjął | Trasa `PATCH` mówi, czy ta edycja cofnęła akceptację; pierwsze testy jednostkowe tej trasy | Regresja na zachowaniu S-02 — edycja musi dalej zapisywać i dalej zdejmować akceptację |
| 2. Potwierdzenie i banner | Dialog przy „Zapisz" i trzeci stan bannera | Banner przeżywający kolejną operację i zaprzeczający plakietce nad sobą |
| 3. Warunek układu | Akceptacja przy generowaniu; usunięcie wyciszone niżej | Przycisk akceptacji wewnątrz `<form>` porywający `onSubmit`; utrata dzisiejszej ostrożności wokół kasowania |
| 4. Dowód odmowy w przeglądarce | Test e2e: odmowa nie wysyła żądania i nie zdejmuje akceptacji | Asercja negatywna, która nie potrafi zawieść — stąd cztery asercje i wymagany przebieg na czerwono |

**Prerequisites:** S-02 (done) — edycja i akceptacja dnia istnieją i są tym, co ta pozycja zmienia. Lokalna Supabase i konta testowe dla e2e. Gałąź funkcyjna przed pierwszym commitem (`CLAUDE.md` §Git — `master` to wydanie).

**Estimated effort:** ~2–3 sesje. Faza 1 jest najgęstsza (rozszerzenie stuba to jej ukryty koszt), Faza 3 najkrótsza, ale najbardziej zależna od oceny wzrokowej.

## Open Risks & Assumptions

- **Wyścig między odczytem akceptacji a zapisem jest przyjęty.** Skutkiem jest co najwyżej nietrafny komunikat, nigdy nietrafny zapis — zerowanie robi trigger na faktycznym stanie wiersza. Okno jest węższe niż dzisiejsze.
- **Zdanie o przyczynie nie przeżywa przeładowania.** Nauczyciel, który odświeży stronę przed przeczytaniem, nie pozna powodu. Alternatywa kosztuje kolumnę, uprawnienie per nazwę pola i pytanie o retencję.
- **Poleganie na samym `window.confirm` jest świadomie sprzeczne z zastrzeżeniem z `test-plan.md` Ryzyko #7.** Uzasadnienie: odwracalność operacji. Warto, żeby przegląd implementacyjny zakwestionował to wprost.
- **Rozszerzenie `DayPlanSuccessBody` dotyka koperty wspólnej dla trzech tras.** Pole jest opcjonalne i ustawiane tylko przez jedną trasę; bramka grepowa w Fazie 1 pilnuje, żeby nie wyciekło.
- **Rozdzielne rozliczenie warunku układu** (przenosimy akceptację, zostawiamy usunięcie) może zostać odczytane jako niedokończone. Plan zapisuje powód w kodzie, w komentarzu przy przycisku usuwania.

## Success Criteria (Summary)

- Nauczyciel nigdy nie traci akceptacji po cichu: albo został zapytany, albo został poinformowany — a w zwykłym przypadku jedno i drugie.
- „Anuluj" w dialogu nie zmienia **niczego**: ani tekstu, ani akceptacji, ani stanu na serwerze — udowodnione testem, który widziano na czerwono.
- Operacje dnia stoją w docelowym układzie, więc żadna późniejsza pozycja M-02 nie przesuwa tych przycisków drugi raz.
