---
date: 2026-09-28T08:50:16+02:00
researcher: Janusz Guzowski
git_commit: cb00d9d216a1e4262b6b56de1af5bd8106ce9159
branch: master
repository: 10x-preschool (arantasar/10x-preschool, private)
topic: "Pole polecenia dla modelu przy każdej aktywności w widoku dnia — model edytuje/uzupełnia aktywność na prośbę nauczyciela"
tags: [research, codebase, day-view, day-plan-editor, activity-edit, openrouter, activity-generator, content-safety, prompt-injection, acceptance]
status: complete
last_updated: 2026-09-28
last_updated_by: Janusz Guzowski
---

# Research: Polecenie dla modelu przy aktywności w widoku dnia

**Date**: 2026-09-28T08:50:16+02:00
**Researcher**: Janusz Guzowski
**Git Commit**: `cb00d9d` (na `origin/master`)
**Branch**: `master` — slice wymaga własnej gałęzi przed pierwszym commitem (CLAUDE.md §Git)
**Repository**: `arantasar/10x-preschool` — repozytorium **prywatne**, więc odnośniki są ścieżkami względnymi (klikalne w IDE), nie permalinkami GitHuba

## Research Question

Z [change.md](change.md): *„W widoku dnia dla każdej aktywności powinno istnieć pole input na zadanie dodatkowego pytania albo zadania dla modelu LLM. Model dostawałby szczegóły wpisanej aktywności i mógł ją edytować lub dopisywać szczegóły, o które prosi użytkownik. Np. jeśli aktywność proponuje zaśpiewanie piosenki, to nauczyciel może wpisać »napisz mi słowa tej piosenki«, a aplikacja sama wyedytuje pole, dopisując słowa piosenki."*

Pytania, na które research odpowiada: gdzie w widoku dnia to się podpina, co z istniejącego potoku LLM da się użyć bez zmian, co naiwna implementacja by ominęła, i jakie dotychczasowe decyzje projektu ta zmiana dotyka.

## Summary

**Mechanicznie zmiana jest mała. Trudne w niej są decyzje, a nie kod.** Prawie wszystko, czego potrzebuje, już istnieje. Istnieje endpoint zapisu jednej aktywności. Istnieje stan „szkicu" w edytorze z przyciskami Zapisz/Anuluj, z potwierdzeniem i banerem o cofniętej akceptacji. Istnieje też maszyneria wywołań OpenRouter z budżetem czasu, retry i mapowaniem błędów na polskie komunikaty. Pięć ustaleń wyznacza kształt planu:

1. **Najlepiej pasującym szwem jest „model wypełnia szkic, nauczyciel zapisuje".** [DayPlanEditor.tsx](../../../src/components/plan/DayPlanEditor.tsx) ma już stan `draft: {id, title, description}` i zapis przez istniejący `PATCH /api/day-plan/activity/[id]`. Z tym zapisem przychodzi za darmo potwierdzenie przy dniu zaakceptowanym, `acceptance_cleared`, baner „Akceptuj ponownie" i sensowne „Anuluj". To wzorzec z `week/day.ts`: route LLM **zwraca** niezapisaną propozycję, a zapis idzie osobną ścieżką. Bezpośredni zapis przez route LLM jest możliwy, ale nadpisuje opis nieodwracalnie ([prd-v2.md:367-369](../../foundation/prd-v2.md#L367-L369): brak undo) i musiałby sam powtórzyć logikę akceptacji.

2. **Prompt jest jedyną warstwą bezpieczeństwa treści, a bramka, która go sprawdza, jest zawieszona.** `judgeContentSafety` nie występuje w żadnej ścieżce produkcyjnej, tylko w testach i w swoim module ([gate-suspension.ts:12-16](../../../src/lib/services/gate-suspension.ts#L12-L16): *„there is no runtime judge in the write path"*). `GATE_SUSPENDED` jest domyślnie `true` ([gate-suspension.ts:38](../../../src/lib/services/gate-suspension.ts#L38)). Nowy prompt to nowa konfiguracja produkcyjna. [lessons.md §3](../../foundation/lessons.md) wymaga, żeby bramka objęła ją dla każdego dopuszczonego modelu przed scaleniem. Dziś bramka tego nie potrafi. `GATE_MODES` zna tylko `day | day-weekday | day-themed | week` ([content-safety.gate.test.ts:30](../../../src/lib/services/content-safety.gate.test.ts#L30)), a deterministyczna warstwa sędziego odrzuci pojedynczą aktywność jako „Liczba propozycji" ([content-safety-judge.ts:152-156](../../../src/lib/services/content-safety-judge.ts#L152-L156)).

3. **Granica danych i instrukcji znika z założenia.** Dotąd nauczyciel podawał *temat* (hasło), a prompt traktował go jako treść podporządkowaną sekcji Odbiorca. Teraz nauczyciel podaje *polecenie*, a model ma go posłuchać. Jedyną obroną w kodzie jest `singleLineText` ([day-plan-contract.ts:138-166](../../../src/lib/services/day-plan-contract.ts#L138-L166)): odrzuca znaki sterujące w haśle i temacie. Do tego dochodzi wektor drugiego rzędu. Zapisane `title` i `description` przechodzą przez `updateActivityRequestSchema` ([day-plan-contract.ts:300-303](../../../src/lib/services/day-plan-contract.ts#L300-L303)), czyli goły `z.string().min(1).max()` bez `singleLineText`. Mogą więc nieść wielowierszowy tekst ze sfałszowanymi liniami, który teraz wróci do promptu.

4. **Limit 4000 znaków opisu jest twardym sufitem na trzech warstwach:** CHECK w bazie ([20260720162247…sql:32-36](../../../supabase/migrations/20260720162247_bound_plan_and_activity_input.sql#L32-L36)), zod ([day-plan-limits.ts:27](../../../src/lib/day-plan-limits.ts#L27)) i `maxLength` textarea. Wykonanie przykładu z change.md (opis plus pełne słowa piosenki) może go przekroczyć. Dodatkowo prompt dnia mówi „opis 2–4 zdania" ([day-plan.pl.md](../../../src/lib/services/prompts/day-plan.pl.md) §Co masz zwrócić). Nowy prompt nie może go więc dziedziczyć wprost.

5. **Funkcji nie ma w PRD ani w roadmapie i ociera się o non-goal.** [prd.md:117](../../foundation/prd.md#L117): *„Brak generowania materiałów dodatkowych — aplikacja proponuje tylko tytuł i opis aktywności"*. Słowa piosenki wpisane w opis formalnie pozostają „opisem", ale to nowa zdolność LLM spoza M-02. Pytanie o prawa autorskie (odtwarzanie tekstów istniejących piosenek) nie padło nigdzie w `context/`.

## Detailed Findings

### Widok dnia: [src/pages/plan.astro](../../../src/pages/plan.astro)

- Dzień jest adresowany przez `?date=`, normalizowane przez `resolvePlanDate` ([plan.astro:15](../../../src/pages/plan.astro#L15), [day-plan-dates.ts:49-58](../../../src/lib/day-plan-dates.ts#L49-L58)). Odczyt po stronie serwera to `readDayPlan` w try/catch ([plan.astro:41-49](../../../src/pages/plan.astro#L41-L49)).
- Jedna wyspa: `<DayPlanEditor client:load planDate initialPlan />` ([plan.astro:93](../../../src/pages/plan.astro#L93)). Nagłówek daty i temat dnia to statyczny SSR.
- Wejścia do widoku dnia: kafel miesiąca ([MonthGrid.tsx:80](../../../src/components/plan/MonthGrid.tsx#L80)) i „Otwórz dzień" na karcie tygodnia ([WeekDayCard.tsx:228](../../../src/components/plan/WeekDayCard.tsx#L228)). Nowe pole dotyczy wyłącznie widoku dnia. Tydzień i miesiąc zostają bez zmian.

### Edytor dnia: [DayPlanEditor.tsx](../../../src/components/plan/DayPlanEditor.tsx) (794 linie)

- **Stan** ([:47-60](../../../src/components/plan/DayPlanEditor.tsx#L47-L60)): `plan`, `prompt`, `promptError`, `busy`, `failure: {message, retryable, signInRequired}`, `draft: {id, title, description} | null` i `clearedByEdit`.
- **`type Busy = "idle" | "generating" | "saving" | "deleting"`** ([:32](../../../src/components/plan/DayPlanEditor.tsx#L32)) to jeden enum dla całego edytora. Do tego jedna blokada `inFlight` ([:89](../../../src/components/plan/DayPlanEditor.tsx#L89)). Wywołanie LLM dla aktywności potrzebuje nowej wartości `busy` (np. `"refining"`) albo własnego stanu. Inaczej zablokuje akceptację, generowanie i usuwanie, albo one zablokują je.
- **Tylko jeden szkic naraz.** „Edytuj" jest wyłączony, gdy otwarty jest inny szkic ([:569](../../../src/components/plan/DayPlanEditor.tsx#L569)). Pole polecenia „przy każdej aktywności" musi rozstrzygnąć kilka rzeczy: czy wynik modelu otwiera szkic tej aktywności, co się dzieje, gdy szkic innej aktywności jest już otwarty, i czy polecenie działa na tekście zapisanym, czy na niezapisanym szkicu.
- **Edytowalne pola** to tylko `title` (input, `maxLength=TITLE_MAX`, [:733-743](../../../src/components/plan/DayPlanEditor.tsx#L733-L743)) i `description` (textarea, 5 wierszy, `maxLength=DESCRIPTION_MAX`, [:749-759](../../../src/components/plan/DayPlanEditor.tsx#L749-L759)). W schemacie nie ma pól „materiały" ani „czas trwania".
- **Podgląd** renderuje opis z `whitespace-pre-line` ([:690-697](../../../src/components/plan/DayPlanEditor.tsx#L690-L697)), więc zwrotki piosenki wyświetlą się poprawnie. Textarea z 5 wierszami będzie za mała na szkic ze słowami piosenki. To kwestia UX, nie poprawności.
- **Zapis** `saveDraft` ([:291-335](../../../src/components/plan/DayPlanEditor.tsx#L291-L335)): przy dniu zaakceptowanym pokazuje `window.confirm` nazywający skutek ([:303-310](../../../src/components/plan/DayPlanEditor.tsx#L303-L310)), potem wysyła `PATCH /api/day-plan/activity/${id}` z `{title, description}`.
- **`mutate()` to jedyny punkt wyjścia do sieci** ([:136-226](../../../src/components/plan/DayPlanEditor.tsx#L136-L226)). Nie robi aktualizacji optymistycznych: stan zastępuje cała odpowiedź. Błąd pokazuje `body.error` i `body.retryable`, a po nim `reconcile()` pobiera dzień ponownie. Retry idzie przez domknięcie `lastAttempt` ([:93](../../../src/components/plan/DayPlanEditor.tsx#L93)).
- **Postęp generowania** to `GenerationProgress` z polskimi etapami i licznikiem sekund, bez streamingu ([:500](../../../src/components/plan/DayPlanEditor.tsx#L500), decyzja z [first-day-generation/plan.md:79](../../archive/2026-08-22-first-day-generation/plan.md#L79)). Jest pod generowanie całego dnia. Wywołanie dla jednej aktywności jest krótsze, ale nadal trwa sekundy, więc potrzebuje własnego wskaźnika.

### API zapisu aktywności: [activity/[id].ts](../../../src/pages/api/day-plan/activity/[id].ts)

- Kolejność kontroli w `PATCH`: 401, konfiguracja, `z.uuid()`, JSON, `updateActivityRequestSchema` (400 ze stałym komunikatem „Tytuł może mieć do 200 znaków, a opis do 4000", [:46-49](../../../src/pages/api/day-plan/activity/[id].ts#L46-L49)). Oba pola są wymagane.
- `updateActivityText` ([day-plan-store.ts:404-456](../../../src/lib/services/day-plan-store.ts#L404-L456)) najpierw odczytuje wiersz pod RLS (niewidoczny daje 404, bez zapisu), potem robi `update`. Zwraca `{plan, activities, acceptance_cleared}`.
- Przekroczenie CHECK (`23514`) daje kategorię `invalid` i **500 „Odśwież stronę…"** ([day-plan-store.ts:147-153](../../../src/lib/services/day-plan-store.ts#L147-L153)). Gdyby route LLM zapisywał bezpośrednio i nie pilnował 4000 znaków, nauczyciel zobaczyłby komunikat, który nic nie wyjaśnia.
- Testy ([activity/[id].test.ts](../../../src/pages/api/day-plan/activity/[id].test.ts)) pokrywają cztery przypadki na stubie Supabase: `acceptance_cleared` dla dnia zaakceptowanego, jego brak dla szkicu, 404 pod RLS i 400 dla złego body.

### Model danych

- `activities`: `id, plan_id, user_id, generation, ordinal, title, description, created_at`. Nie ma `updated_at`. CHECK: `title` 1–200, `description` 1–4000 ([20260720162247…sql:30-36](../../../supabase/migrations/20260720162247_bound_plan_and_activity_input.sql#L30-L36)).
- Granty kolumnowe: `authenticated` może zmieniać wyłącznie `ordinal, title, description` ([20260720162553…sql:41-44](../../../supabase/migrations/20260720162553_narrow_authenticated_update_columns.sql#L41-L44)). Osobna kolumna na słowa lub materiały wymagałaby migracji i jawnego grantu, jak przy `theme`.
- Trigger `activities_edit_clears_acceptance` (AFTER UPDATE, `when old.title is distinct from new.title or old.description is distinct from new.description`) ustawia `accepted_at = null` ([20260823095136…sql:129-134](../../../supabase/migrations/20260823095136_day_plan_generation_write_contract.sql#L129-L134)). **Każde przepisanie przez model zdejmuje akceptację**, niezależnie od tego, którą ścieżką zostanie zapisane.

### Potok LLM: [activity-generator.ts](../../../src/lib/services/activity-generator.ts)

- Transport: goły `fetch` do OpenRouter ([:27](../../../src/lib/services/activity-generator.ts#L27), [:211](../../../src/lib/services/activity-generator.ts#L211) `callOpenRouter`). Body buduje `buildRequestBody` ([:138](../../../src/lib/services/activity-generator.ts#L138)): `response_format: json_schema` strict, `provider.data_collection: "deny"`, warunkowo `reasoning:{enabled:false}` z jednorazowym fallbackiem, `TEMPERATURE = 0.8` ([:40](../../../src/lib/services/activity-generator.ts#L40)), `MAX_TOKENS = 4000` ([:55](../../../src/lib/services/activity-generator.ts#L55)).
- Budżet i retry: `runWithBudget` ([:442](../../../src/lib/services/activity-generator.ts#L442)) ponawia raz, tylko `transient`, w granicach budżetu. Budżety są w [day-plan-limits.ts:59-71](../../../src/lib/day-plan-limits.ts#L59-L71): dzień 45 s na próbę i 60 s łącznie, zarys tygodnia 20 s i 30 s. Jedna aktywność uzasadnia trzeci, krótszy zestaw.
- Model: `requireConfigured` ([:502](../../../src/lib/services/activity-generator.ts#L502)), potem `resolveModel` ([allowed-models.ts:52-62](../../../src/lib/services/allowed-models.ts#L52-L62)). `ALLOWED_MODELS = ["openai/gpt-5.6-luna", "google/gemini-3.7-flash"]` ([:24](../../../src/lib/services/allowed-models.ts#L24)). Model spoza listy to błąd `config`, bez cichego fallbacku.
- **Eksportowane są tylko `generateDayActivities` ([:517](../../../src/lib/services/activity-generator.ts#L517)) i `generateWeekOutline` ([:572](../../../src/lib/services/activity-generator.ts#L572)).** Każda z nich ma na sztywno własny prompt, schemat i kontrakt zod. `callOpenRouter`, `buildRequestBody` i `runWithBudget` są prywatne dla modułu. Nowy punkt wejścia (np. `refineActivity`) naturalnie ląduje **w tym samym module**, obok dwóch istniejących. Wyciąganie generycznego klienta to osobna, większa decyzja.
- Prompty ładuje Vite `?raw` / import JSON ([:16-25](../../../src/lib/services/activity-generator.ts#L16-L25)), bez odczytu z dysku na workerd.
- Wstrzyknięcie wejścia: surowa interpolacja linii `Hasło: …`, `Dzień tygodnia: …`, `Temat dnia: …` ([buildDayUserMessage, :337-346](../../../src/lib/services/activity-generator.ts#L337-L346)). Prompt nie ma delimiterów wokół tekstu użytkownika ani instrukcji „traktuj jako dane".
- Kontrakt odpowiedzi: `dayPlanProposalSchema` ([day-plan-contract.ts:31-40](../../../src/lib/services/day-plan-contract.ts#L31-L40)) wymaga dokładnie 3 elementów `{tytul ≤200, opis ≤4000}`, a `toActivityDrafts` mapuje je na `{title, description}`. Nowa ścieżka potrzebuje schematu JSON i zod dla **jednej** pary `{tytul, opis}` w tych samych limitach.

### Błędy i HTTP: [generation-error.ts](../../../src/lib/services/generation-error.ts), [day-plan-http.ts](../../../src/lib/services/day-plan-http.ts)

- Kategorie `transient`, `config` i `invalid` razem z mapą `retryable` ([generation-error.ts:18-28](../../../src/lib/services/generation-error.ts#L18-L28)).
- `generationFailure` mapuje `config` na 500, `transient` na 503 i `invalid` na 502, z body `{error, retryable}` i stałymi polskimi komunikatami ([day-plan-http.ts:191-237](../../../src/lib/services/day-plan-http.ts#L191-L237)). Nadpisać da się tylko komunikat `invalid`. Nowy route może go użyć bez zmian. Pisanie błędów ręcznie wpuściłoby angielski tekst do UI i zgubiło `retryable`.
- Route'y LLM same sprawdzają `locals.user`. Middleware chroni tylko strony `/plan` ([middleware.ts:8](../../../src/middleware.ts#L8)).
- **Nie ma limitów per użytkownik ani quot.** Koszt jest tylko logowany (`usage.cost`), a limit regeneracji to otwarte pytanie z etykietą „Blokuje: nie" ([prd.md:123](../../foundation/prd.md#L123), [roadmap.md:234](../../foundation/roadmap.md#L234)). Polecenie przy aktywności to najtańsze w wywołaniu wejście do LLM w aplikacji.

### Bezpieczeństwo treści: sędzia i bramka

- Sędzia ([content-safety-judge.ts](../../../src/lib/services/content-safety-judge.ts)) działa dwuetapowo. Najpierw deterministyczna warstwa: liczba elementów, puste elementy, markery odmowy i angielskiego. Potem `anthropic/claude-haiku-4.5` z temperaturą 0 i rubryką [content-safety-rubric.pl.md](../../../src/lib/services/prompts/content-safety-rubric.pl.md): dziewięć klas dyskwalifikujących, w tym marki i licencjonowane postaci, plus dopasowanie rozwojowe.
- `JudgeInput` zna tylko `kind: "day" | "week"`. Deterministyczna warstwa wymaga `ACTIVITY_COUNT` (3) albo `WEEK_DAYS` ([:152-156](../../../src/lib/services/content-safety-judge.ts#L152-L156)), więc pojedyncza przepisana aktywność nie przejdzie jej bez nowego `kind`.
- Bramka ([content-safety.gate.test.ts](../../../src/lib/services/content-safety.gate.test.ts)) najpierw kalibruje sędziego na fixture'ach. Potem jedzie po każdym dozwolonym modelu × `GATE_KEYWORDS` × `GATE_MODES`, przez prawdziwe funkcje produkcyjne z nadpisanym `{model}`. Jest doradcza: czerwony wynik nie blokuje merge'a ([content-safety-report.ts:4-9](../../../src/lib/services/content-safety-report.ts#L4-L9)).
- **Zawieszona od 2026-09-19 z powodu kosztu:** `RUN_CONTENT_SAFETY_GATE !== "1"` ustawia `describe.skip`, a CI przy zmianach w `prompts/**`, `allowed-models.ts` i `content-safety*` tylko wystawia ostrzeżenie ([ci.yml:34-72](../../../.github/workflows/ci.yml#L34-L72)). Nowy plik promptu zapali więc ostrzeżenie, ale żadnego testu nie uruchomi.
- Kalibracja sędziego Haiku jest odnotowana jako niewykonana ([content-safety-judge.ts:31-36](../../../src/lib/services/content-safety-judge.ts#L31-L36)).

### Prompt injection: co zmienia to polecenie

- **Wejście pierwszego rzędu.** Polecenie nauczyciela z definicji jest instrukcją. Nowy prompt musi ustawić je *poniżej* sekcji Odbiorca, tak jak hasło: [day-plan.pl.md](../../../src/lib/services/prompts/day-plan.pl.md) §Odbiorca, „bezpieczeństwo ważniejsze od wierności hasłu". Musi też przejąć zasadę „ciche przekierowanie, nie odmowa" (§Hasło nieodpowiednie dla wieku), bo odmowa i angielski to dokładnie to, co łapie deterministyczna warstwa sędziego. Polecenie jako pole tekstowe nadaje się do `singleLineText` (jedna linia, znaki sterujące odrzucane, komunikat nie wskazuje znaku). Polecenie wieloliniowe wymagałoby innej obrony.
- **Wejście drugiego rzędu.** Obecny `title` i `description` aktywności idą do promptu jako kontekst. Mogły zostać wcześniej ręcznie wyedytowane przez PATCH bez `singleLineText`, więc mogą zawierać cokolwiek do 4000 znaków, łącznie z nowymi liniami. Trzeba je zamknąć w wyraźnie odgraniczonym bloku danych.
- **Przykład z change.md.** „Napisz mi słowa tej piosenki" zaprasza model do odtworzenia tekstu istniejącej piosenki, bo aktywność często proponuje znaną piosenkę dziecięcą. To pytanie prawnoautorskie i zarazem bliskie klasie 9 rubryki (marki i licencjonowane postaci). W `context/` nikt go nigdy nie zadał. Prompt może np. wymagać własnego, oryginalnego tekstu, ale to decyzja produktowa, nie techniczna.

### Druk PDF: [src/lib/plan-pdf/](../../../src/lib/plan-pdf/)

- Opis drukuje się w całości, bez ucinania ([model.ts:149](../../../src/lib/plan-pdf/model.ts#L149), [layout.ts:231](../../../src/lib/plan-pdf/layout.ts#L231)). `\n` to twardy podział ([layout.ts:133-140](../../../src/lib/plan-pdf/layout.ts#L133-L140)), a puste linie się zwijają ([:100-107](../../../src/lib/plan-pdf/layout.ts#L100-L107)). Dłuższy tekst przelewa się na strony „(cd.)", a w układzie tygodnia czcionka schodzi z 11 do 7 pt ([:81](../../../src/lib/plan-pdf/layout.ts#L81)). Wydruk wytrzyma słowa piosenki. Kosztem będą dodatkowe strony albo mniejsza czcionka, a przy 4000-znakowych opisach dłuższy render ([render.ts:93-96](../../../src/lib/plan-pdf/render.ts#L93-L96)).
- Wydruk miesiąca w ogóle nie drukuje aktywności ([grid-layout.ts:28-33](../../../src/lib/plan-pdf/grid-layout.ts#L28-L33)).

## Code References

- `src/pages/plan.astro:93` — jedyna wyspa widoku dnia (`DayPlanEditor`)
- `src/components/plan/DayPlanEditor.tsx:32` — enum `Busy` wspólny dla wszystkich mutacji
- `src/components/plan/DayPlanEditor.tsx:40-44` — kształt `draft`, jeden szkic naraz
- `src/components/plan/DayPlanEditor.tsx:136-226` — `mutate()`, jedyny punkt wyjścia do sieci
- `src/components/plan/DayPlanEditor.tsx:291-335` — `saveDraft`: confirm przy zaakceptowanym dniu, potem PATCH
- `src/components/plan/DayPlanEditor.tsx:690-697` — podgląd opisu z `whitespace-pre-line`
- `src/pages/api/day-plan/activity/[id].ts:23-63` — PATCH aktywności
- `src/lib/services/day-plan-store.ts:404-456` — `updateActivityText`
- `src/lib/services/day-plan-contract.ts:31-40` — `dayPlanProposalSchema` (3 × `{tytul, opis}`)
- `src/lib/services/day-plan-contract.ts:138-166` — `singleLineText`, jedyna obrona przed injection
- `src/lib/services/day-plan-contract.ts:300-303` — `updateActivityRequestSchema` bez `singleLineText`
- `src/lib/services/activity-generator.ts:138,211,442,502` — prywatne `buildRequestBody`, `callOpenRouter`, `runWithBudget`, `requireConfigured`
- `src/lib/services/activity-generator.ts:337-346` — `buildDayUserMessage`, surowa interpolacja wejścia
- `src/lib/services/activity-generator.ts:517,572` — dwa eksportowane punkty wejścia
- `src/lib/services/allowed-models.ts:24,52-62` — lista modeli i `resolveModel`
- `src/lib/day-plan-limits.ts:26-28,59-71` — limity pól i budżety czasu
- `src/lib/services/day-plan-http.ts:191-237` — `generationFailure`
- `src/lib/services/gate-suspension.ts:12-16,38` — brak sędziego w runtime, bramka zawieszona
- `src/lib/services/content-safety-judge.ts:152-156` — deterministyczna warstwa wymaga 3 lub 7 elementów
- `src/lib/services/content-safety.gate.test.ts:30` — `GATE_MODES`
- `supabase/migrations/20260720162247_bound_plan_and_activity_input.sql:30-36` — CHECK długości `title` i `description`
- `supabase/migrations/20260720162553_narrow_authenticated_update_columns.sql:41-44` — grant kolumnowy UPDATE
- `supabase/migrations/20260823095136_day_plan_generation_write_contract.sql:129-134` — trigger zdejmujący akceptację
- `src/lib/services/__fixtures__/openrouter.ts`, `src/lib/services/__fixtures__/supabase.ts` — wzorzec testów: `vi.stubGlobal("fetch", …)` i stub PostgREST przez `context.locals`

## Architecture Insights

- **Jeden moduł LLM, wiele punktów wejścia.** Każda operacja LLM to eksportowana funkcja w `activity-generator.ts` z własnym promptem `*.pl.md`, schematem `*.schema.json` i kontraktem zod, dzieląca prywatny transport. Nowa operacja pasuje do tego wzorca bez refaktoru.
- **Propozycja a zapis.** Tydzień już rozdziela „model proponuje" (`week/day.ts` zwraca niezapisaną partię) od „zapisz" (`save_week_plan_generation`). Dzień generowany w całości zapisuje od razu. Dla przepisania jednej aktywności istniejący `draft` + PATCH to gotowa połowa „zapisz".
- **Limity żyją w trzech miejscach naraz** (CHECK, `day-plan-limits.ts`, `maxLength` w UI). Plik limitów sam deklaruje, że zmiany idą razem z migracją.
- **Koperta błędów jest jednolita** (`{error, retryable}`, klient nie zgaduje widoczności retry). Nowy route powinien przez nią przechodzić.
- **Polska treść w miejscu użycia**, w formie bezosobowej ([DayPlanEditor.tsx:647](../../../src/components/plan/DayPlanEditor.tsx#L647)). Potwierdzenia przez `window.confirm` z tekstem nazywającym skutek.

## Historical Context (from prior changes)

- [prd.md:82,87-88](../../foundation/prd.md#L82): FR-007 (regeneracja całego dnia) i FR-008 (ręczna edycja tytułu i opisu). Notatka sokratejska: *„edycja drobnych poprawek jest szybsza niż wielokrotna regeneracja"*. Ta zmiana to trzecia droga pomiędzy nimi.
- [prd.md:117](../../foundation/prd.md#L117), [roadmap.md:250](../../foundation/roadmap.md#L250): non-goal „brak generowania materiałów dodatkowych".
- [prd-v2.md:373-375](../../foundation/prd-v2.md#L373-L375), [roadmap.md:245](../../foundation/roadmap.md#L245): *„Bez zmiany wytycznych generowania i doboru treści"*. Odwrócenie non-goals wymaga osobnej sesji `/10x-shape` (precedens: typy aktywności, pozycja #8 w [next-actions.md](../../foundation/next-actions.md)).
- [foundation/archive/2026-09-19-roadmap.md:112](../../foundation/archive/2026-09-19-roadmap.md#L112), [first-day-generation/plan.md:81-82](../../archive/2026-08-22-first-day-generation/plan.md#L81-L82) i [testing-content-safety-gate/plan.md:162-163](../../archive/2026-08-31-testing-content-safety-gate/plan.md#L162-L163): **post-filtr runtime świadomie odrzucony**. *„Jeśli pojawi się treść nieodpowiednia — post-filtr wraca na stół."* Polecenie w wolnym tekście to pierwsze wejście, które z założenia prosi model o wykonanie instrukcji. To uzasadniony moment, żeby tę decyzję ponownie rozważyć, ale nie trzeba jej odwracać.
- [testing-content-safety-gate/plan.md:377-402](../../archive/2026-08-31-testing-content-safety-gate/plan.md#L377-L402): walidacja treściowa (a nie tylko długościowa) wejścia nauczyciela, komunikat bez wskazania znaku. Stąd `singleLineText`.
- [edit-accept-day-plan/plan.md:211-219](../../archive/2026-08-23-edit-accept-day-plan/plan.md#L211-L219) i [edit-unaccepts-day/plan.md:152-195](../../archive/2026-09-20-edit-unaccepts-day/plan.md#L152-L195): trigger zdejmujący akceptację oraz FR-017 „jawność proporcjonalna do skutku". Confirm przed edycją zaakceptowanego dnia, baner z „Akceptuj ponownie", flaga `clearedByEdit` pochodzi z odpowiedzi serwera, nie z klienta.
- [first-day-generation/plan.md:286-300,442-463](../../archive/2026-08-22-first-day-generation/plan.md#L286-L300): trzy kategorie błędów, etapy postępu zamiast paska, blokada podwójnego wysłania.
- [week-generation/follow-ups/review-fixes.md:7-26](../../archive/2026-08-23-week-generation/follow-ups/review-fixes.md#L7-L26): otwarta luka rubryki („Dzień Matki"), której wyzwalaczem jest *„iteracja któregokolwiek promptu"*. Nowy prompt ją wyzwala.
- [lessons.md](../../foundation/lessons.md) §3 (bramka dla każdego modelu przy każdej zmianie promptu) oraz §4 i §6 (kryteria i bramki grepowe muszą móc nie przejść). Dotyczą planu tej zmiany wprost.

## Related Research

- [archive/2026-08-31-testing-content-safety-gate/research.md](../../archive/2026-08-31-testing-content-safety-gate/research.md): bramka bezpieczeństwa, prompt injection i zbiór dozwolonych modeli (ryzyka #1 i #6).

## Open Questions

Decyzje dla `/10x-plan` (albo `/10x-frame`, jeśli któraś okaże się sporna):

1. **Propozycja czy zapis bezpośredni?** Rekomendacja z researchu: route LLM zwraca `{title, description}` bez zapisu, edytor otwiera je jako `draft`, a nauczyciel zapisuje przez istniejący PATCH. Dostajemy wtedy „Anuluj", confirm i baner akceptacji bez nowego kodu. Wadą jest dodatkowe kliknięcie.
2. **Co model może zmienić:** tylko opis, czy również tytuł? Przykład z change.md dopisuje do opisu, ale polecenie „zamień na zabawę ruchową" zmienia oba pola.
3. **Przekroczenie 4000 znaków:** odrzucić z czytelnym polskim komunikatem, kazać modelowi zmieścić się w limicie (schemat `maxLength` plus instrukcja w promptcie), czy podnieść limit (migracja CHECK i zmiana w `day-plan-limits.ts`)?
4. **Bezpieczeństwo:** czy ta ścieżka dostaje sędziego w runtime (jedno wywołanie Haiku po deterministycznej warstwie, z dodatkowym opóźnieniem i kosztem, sędzia nieskalibrowany), czy zostaje przy samym prompcie? W tym drugim przypadku [lessons.md](../../foundation/lessons.md) §3 wymaga nowego `GATE_MODE` i nowego `JudgeInput.kind` dla jednej aktywności oraz przebiegu bramki (dziś zawieszonej) przed scaleniem. Obie drogi mają koszt. Żadna nie jest darmowa.
5. **Prawa autorskie:** czy „słowa tej piosenki" oznacza tekst istniejącej piosenki, czy prompt wymaga tekstu oryginalnego? To decyzja właściciela produktu.
6. **Limit wywołań:** jedno pole przy każdej aktywności to najtańsza droga do wielokrotnych wywołań LLM. Otwarte pytanie z PRD („Blokuje: nie dla MVP") może tu przestać być nieblokujące.
7. **Miejsce w roadmapie:** nowe FR/slice w M-02 czy osobna ścieżka? Czy dopisywanie słów piosenki mieści się w non-goal z [prd.md:117](../../foundation/prd.md#L117)?
8. **UX pola:** jedno pole na aktywność zawsze widoczne czy rozwijane przyciskiem? Jak łączy się z jednym otwartym szkicem i wspólnym `busy`? Czy polecenie działa na niezapisanym szkicu (iteracja „popraw jeszcze raz")?
