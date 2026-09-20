# Edycja dnia zaakceptowanego zdejmuje akceptację — Implementation Plan

## Overview

FR-017 ustala regułę **jawność proporcjonalna do skutku**: nic nie jest zakazane, ale wszystko, co niszczy pracę oznaczoną jako gotowa, pyta. Ta zmiana stosuje ją do edycji propozycji w dniu zaakceptowanym — nauczyciel dostaje potwierdzenie przed zapisem, a po zgodzie dzień traci akceptację i **dowiaduje się o tym**.

Jednocześnie, na mocy `prd-v2.md` §Constraints „Warunek układu", ta pozycja ustawia operację akceptacji w jej docelowym miejscu — przy przycisku generowania — żeby te same przyciski nie były przesuwane dwa razy.

## Current State Analysis

**Skutek FR-017 już istnieje w bazie i nie jest przedmiotem tej zmiany.** Trigger `activities_edit_clears_acceptance` wraz z funkcją `clear_plan_acceptance` (`supabase/migrations/20260823095136_day_plan_generation_write_contract.sql:107-135`) zeruje `accepted_at` przy każdej zmianie `title` albo `description` propozycji. Klauzula `when` jest celowa: zmiana kolejności propozycji nie jest zmianą treści i nie unieważnia akceptacji. Trasa `PATCH` zwraca cały plan właśnie dlatego, że edycja zdejmuje akceptację po stronie bazy i wyspa musi zobaczyć oba fakty naraz (`src/pages/api/day-plan/activity/[id].ts:53-56`). Komentarz nagłówkowy wyspy stwierdza to wprost (`src/components/plan/DayPlanEditor.tsx:18-19`).

**Rozbieżność z PRD, świadomie nienaprawiana tutaj.** `prd-v2.md` §Business Logic Changes reguła 2 opisuje stan „Dziś" jako: „akceptacja jest etykietą stanu… Edycja treści nie rusza tej etykiety — zaakceptowany dzień może mieć treść zmienioną po akceptacji i nadal wyglądać na zatwierdzony" (`context/foundation/prd-v2.md:332-334`). To przestało być prawdą 2026-08-23 wraz z S-02. Decyzja z sesji planowania: **plan odnotowuje poprawiony punkt wyjścia, PRD nie jest edytowany w tym PR** — `prd-v2.md` jest zamrożonym artefaktem M-02, a `CLAUDE.md` traktuje edycje `context/foundation/*` jako osobny tor.

**Następstwo dla §Constraints „Semantyka zastanych danych".** Ten akapit (`prd-v2.md:281-285`) ostrzega, że część istniejących dni zaakceptowanych mogła zostać edytowana po akceptacji. Ponieważ trigger działa od S-02, żadna ścieżka aplikacji nie mogła wyprodukować takiego wiersza: edycja treści, regeneracja dnia i generowanie tygodnia — wszystkie zerują `accepted_at`. Migracja danych nie jest potrzebna i nie jest w zakresie.

**Czego naprawdę brakuje — trzy rzeczy, wszystkie w warstwie prezentacji i trasy:**

1. **Nikt nie pyta.** `saveDraft` (`DayPlanEditor.tsx:240-259`) wysyła `PATCH` bez żadnego dialogu, niezależnie od stanu akceptacji.
2. **Nikt nie mówi.** Po zapisie `AcceptanceBanner` (`DayPlanEditor.tsx:505-519`) przeskakuje z „Plan zaakceptowany…" na „Plan roboczy — zmiany zapisują się od razu…" bez słowa o przyczynie. Zielona plakietka po prostu znika.
3. **Przyciski są nie na miejscu.** „Akceptuj plan" / „Cofnij akceptację" (`DayPlanEditor.tsx:461-474`) i „Usuń plan dnia" (`DayPlanEditor.tsx:489-499`) siedzą na dole wyspy; przycisk generowania jest w `<form>` wyżej (`DayPlanEditor.tsx:375-382`).

**Wzorzec potwierdzenia istnieje i ma dwie warstwy.** `generate()` pokazuje `window.confirm` wyłącznie na planie zaakceptowanym, a za dialogiem stoi odmowa schematu — `confirm_replace` → 409 (`DayPlanEditor.tsx:209-237`). `deletePlan()` ma dialog i **nic za nim** (`DayPlanEditor.tsx:279-304`). Ta zmiana idzie drogą `deletePlan` i robi to świadomie — patrz §Implementation Approach.

### Key Discoveries

- Trigger zerujący akceptację: `supabase/migrations/20260823095136_day_plan_generation_write_contract.sql:107-135`.
- Koperta odpowiedzi jest wspólna dla trzech tras i celowo nierozróżnialna: `DayPlanSuccessBody = DayPlanWithCurrentActivities` (`src/lib/services/day-plan-http.ts:8-23`). Rozszerzenie musi być **addytywne i opcjonalne**, inaczej łamie tę własność.
- `isDayPlanBody` (`src/lib/day-plan-guards.ts:44-68`) zawęża po polach obecnych, nie odrzuca nadmiarowych — dodatkowe pole w ciele przechodzi bez zmiany predykatu.
- Klucz obcy `activities` → `day_plans` jest **złożony**: `activities_plan_id_user_id_fkey` na `(plan_id, user_id)` (`src/db/database.types.ts:68-76`).
- Stub Supabase (`src/lib/services/__fixtures__/supabase.ts:114-128`) odwzorowuje tylko `select().eq().maybeSingle()`, `select().eq().order()`, `.in(…)` i `rpc()`. **Nie zna `update()`** — trasa `PATCH` nie ma dziś ani jednego testu jednostkowego.
- Wzorzec testu odmowy dialogu, z trzema asercjami wymuszonymi przez `lessons.md` („Kryterium weryfikacji musi móc nie przejść"): `tests/e2e/day-plan-delete-confirmation.spec.ts`.
- Zasiew dnia zaakceptowanego jest gotowy: `seedDayPlan({ …, accepted: true })` (`tests/e2e/support/supabase-admin.ts:95-124`).
- `setAcceptance` w wyspie używa `expected_generation` (`DayPlanEditor.tsx:261-277`); edycja propozycji takiego warunku nie ma i tego nie zmieniamy.

## Desired End State

Nauczyciel otwiera dzień zaakceptowany, klika „Edytuj" przy propozycji, poprawia tekst i klika „Zapisz". Dostaje pytanie nazywające skutek. Po „Anuluj" nie dzieje się **nic** — tekst zostaje w edytorze, akceptacja stoi, żadne żądanie nie wychodzi. Po „OK" zapis przechodzi, dzień wraca do roboczego, a w miejscu zielonej plakietki pojawia się zdanie mówiące **dlaczego** oraz droga powrotna („Akceptuj ponownie"). Druga edycja tego samego dnia nie pyta już o nic — nie ma czego odbierać.

Operacja akceptacji stoi przy przycisku generowania. „Usuń plan dnia" zostaje na dole, wyciszony, odsunięty.

Weryfikacja: `npm run lint`, `npm run build`, `npm test` zielone; `npm run test:e2e` zielony wraz z nowym testem odmowy; przejście ręczne opisane w §Testing Strategy.

## What We're NOT Doing

- **Żadnej migracji.** Trigger już robi to, co trzeba; nowa kolumna niosąca powód cofnięcia akceptacji została rozważona i odrzucona (wymaga osobnego nadania uprawnień per kolumna — pułapka z `prd-v2.md` §Constraints „Migracja danych" — i retencji, której FR-017 nie wymaga).
- **Żadnej odmowy po stronie serwera** analogicznej do `confirm_replace`. Decyzja świadoma — uzasadnienie w §Implementation Approach.
- **Żadnej zmiany w widoku tygodnia i miesiąca.** Dzień, który stracił akceptację przez edycję, jest tam nieodróżnialny od nigdy niezaakceptowanego. To domyka jedyny `Unknown` zapisany dla S-12 w `roadmap.md:141`. Powierzchnie akceptacji w tygodniu należą do S-11 (`week-level-plan-controls`).
- **Żadnej edycji `context/foundation/prd-v2.md`** — patrz §Current State Analysis.
- **Żadnego nowego testu pgTAP.** Trigger jest własnością S-02 i ten PR go nie dotyka; test tutaj byłby długiem pokryciowym spłaconym pod niewłaściwym slice'em.
- **Żadnego dialogu na „Edytuj".** Otwarcie edytora nadal nic nie kosztuje i nadal o nic nie pyta.
- **Żadnej zmiany kontraktu `expected_generation`** ani mechaniki akceptacji.

## Implementation Approach

Trzy decyzje niosą tę zmianę.

**Pytanie pada przy „Zapisz", nie przy „Edytuj".** Akceptacja ginie w momencie zapisu, więc tam należy pytanie. „Anuluj" zachowuje wtedy swoją dzisiejszą obietnicę — „Anuluj przywróci poprzedni tekst — nic nie zostanie zapisane" (`DayPlanEditor.tsx:624`) — bez żadnego wyjątku do dopisania. Dialog przy otwarciu edytora pytałby o skutek, który może nigdy nie nastąpić.

**Dialog jest jedyną barierą — świadomie.** `generate()` może sobie pozwolić na ramę „dialog to afordancja, nie strażnik", bo `save_day_plan_generation` odmawia za nim. Tutaj nic nie odmawia, i to jest w porządku: utrata akceptacji jest **odwracalna jednym kliknięciem** (`roadmap.md:154` — „pomyłka kosztuje jedno kliknięcie, nie utratę pracy"), w przeciwieństwie do regeneracji, która kasuje opłaconą partię bezpowrotnie. Asymetria jest zasadą, nie przeoczeniem.

**Ale odwracalność nie zwalnia z uczciwości** — i tu wchodzi trzecia decyzja. `accepted` w wyspie to jej kopia prawdy i bywa nieaktualna (inna karta, strona wyrenderowana przy nieczytelnym planie). Kopia mówiąca „niezaakceptowany", gdy serwer trzyma akceptację, dałaby dokładnie ciche cofnięcie, które ta zmiana ma zlikwidować. Dlatego **serwer raportuje, co faktycznie zdjął**: trasa `PATCH` czyta stan akceptacji przed zapisem i zwraca to jako addytywne pole. Najgorszy przypadek degraduje się wtedy do „nie zapytano, ale powiedziano prawdę" zamiast do „cofnięto po cichu" — drugi takt FR-017 stoi nawet wtedy, gdy pierwszy nie mógł.

## Critical Implementation Details

**Klucz obcy jest złożony.** Odczyt akceptacji przed zapisem musi sięgnąć `day_plans` przez `activities`, a ten FK to `activities_plan_id_user_id_fkey` na `(plan_id, user_id)`, nie pojedyncza kolumna. Gołe `day_plans(accepted_at)` w osadzonym `select` się nie rozwiąże — PostgREST wymaga jawnej podpowiedzi nazwą ograniczenia.

**Wyścig między odczytem a zapisem jest przyjęty, nie przeoczony.** Między odczytem `accepted_at` a `update` inna karta może zaakceptować albo cofnąć akceptację. Skutkiem jest wyłącznie nietrafny komunikat — nigdy nietrafny zapis, bo zerowanie robi trigger na faktycznym stanie wiersza. Okno jest węższe niż dzisiejsze (gdzie kopia wyspy bywa stara o całe minuty) i zamykanie go kosztowałoby transakcję, której ta ścieżka nie ma.

**Kolejność w `mutate` jest wiążąca.** `mutate` czyści `draft` po zastosowaniu odpowiedzi (`DayPlanEditor.tsx:163`). Nowy stan bannera musi być ustawiony z tej samej odpowiedzi i **wyczyszczony na starcie każdej kolejnej mutacji**, inaczej zdanie „plan wrócił do roboczego, bo zmieniłeś treść" przeżyje akceptację wykonaną zaraz po nim i będzie zaprzeczać zielonej plakietce tuż nad sobą.

---

## Phase 1: Serwer raportuje, co zdjął

### Overview

Trasa `PATCH` przestaje milczeć o tym, czy ta konkretna edycja cofnęła akceptację. Bez tego wyspa może to wnioskować wyłącznie ze swojej kopii `accepted`, a ta bywa nieaktualna.

### Changes Required:

#### 1. Warstwa dostępu do danych

**File**: `src/lib/services/day-plan-store.ts`

**Intent**: `updateActivityText` ma zwracać nie tylko `plan_id`, ale i stan akceptacji planu sprzed zapisu — żeby wywołujący mógł powiedzieć, czy ta edycja coś zdjęła. Odczyt poprzedza `update`, bo po nim informacja jest już nie do odtworzenia: `accepted_at` jest `null` zarówno po cofnięciu, jak i wtedy, gdy akceptacji nigdy nie było.

**Contract**: Typ zwracany rozszerza się ze `string` na obiekt niosący `planId` oraz stan akceptacji sprzed zapisu. Odczyt idzie przez `activities` z osadzonym `day_plans` i **jawną podpowiedzią nazwy FK** — `activities_plan_id_user_id_fkey` — bo klucz jest dwukolumnowy. Brak wiersza w tym odczycie oznacza `StoreError("not_found")` z dotychczasowym komunikatem: propozycja cudzego konta jest niewidoczna pod RLS, więc odmowa przychodzi teraz **przed** zapisem, a nie jako pusty wynik po nim. Komentarz funkcji zachowuje dotychczasowe stwierdzenie, że to trigger zeruje akceptację, i dopisuje, dlaczego odczyt musi być wcześniejszy.

#### 2. Koperta odpowiedzi

**File**: `src/lib/services/day-plan-http.ts`

**Intent**: Ciało sukcesu zyskuje opcjonalny znacznik „ta operacja cofnęła akceptację", ustawiany wyłącznie przez trasę edycji. Musi być opcjonalny i addytywny, bo komentarz tego modułu (`:8-12`) zobowiązuje wszystkie trzy trasy do bycia nierozróżnialnymi dla jednego handlera wyspy.

**Contract**: `DayPlanSuccessBody` rozszerza się o opcjonalne pole boolowskie (sugerowana nazwa: `acceptance_cleared`). Pozostałe trasy go nie ustawiają. Komentarz modułu odnotowuje, dlaczego to rozszerzenie nie łamie nierozróżnialności: handler wyspy narzuca `isDayPlanBody`, a ten nie odrzuca pól nadmiarowych.

#### 3. Trasa edycji

**File**: `src/pages/api/day-plan/activity/[id].ts`

**Intent**: Przekazać do odpowiedzi fakt, czy ta edycja zdjęła akceptację — prawda tylko wtedy, gdy plan był zaakceptowany przed zapisem.

**Contract**: `PATCH` odczytuje nowy kształt zwracany przez `updateActivityText`, buduje odpowiedź jak dotąd (`requireSaved(await readDayPlanById(…))`) i dokłada znacznik. Status, kody błędów i komunikaty bez zmian.

#### 4. Predykat wyspy

**File**: `src/lib/day-plan-guards.ts`

**Intent**: Wyspa musi odczytać znacznik w sposób zawężony, nie przez `as`.

**Contract**: Nowa, wąska funkcja pomocnicza czytająca opcjonalne pole z `unknown` (np. `readAcceptanceCleared(body): boolean`), zwracająca `false` dla wszystkiego, co nie jest jawnym `true`. `isDayPlanBody` **nie zmienia się** — znacznik jest opcjonalny i jego brak nie może unieważnić ciała.

#### 5. Testy jednostkowe trasy

**File**: `src/lib/services/__fixtures__/supabase.ts`

**Intent**: Stub nie zna dziś `update()`, więc trasy `PATCH` nie da się przetestować. Dołożyć dokładnie tyle PostgREST-a, ile ta ścieżka wywołuje — nie więcej; komentarz modułu (`:15-20`) ostrzega, że głębsza imitacja przestaje cokolwiek znaczyć.

**Contract**: Stub obsługuje `from("activities").update().eq().select().maybeSingle()` oraz osadzony odczyt akceptacji sprzed zapisu. Nowe opcje pozwalają wyrazić trzy stany: plan zaakceptowany przed edycją, plan roboczy przed edycją, propozycja niewidoczna. Istniejące pola opcji i ich zachowanie bez zmian — testy tras generowania muszą przejść nietknięte.

**File**: `src/pages/api/day-plan/activity/[id].test.ts` _(nowy)_

**Intent**: Przypiąć zachowanie, które wyspa dopiero zacznie konsumować, na poziomie deterministycznym.

**Contract**: Wzorzec z `src/pages/api/day-plan/week/day.test.ts` — `PATCH` importowany jako funkcja, podstawiane wyłącznie `context.locals`, żaden moduł z `src/lib/` nie jest mockowany. Przypadki: (a) edycja planu zaakceptowanego → 200 i znacznik `true`; (b) edycja planu roboczego → 200 i **brak** znacznika albo `false`; (c) propozycja niewidoczna → 404 i **żadnego wywołania `update`**; (d) ciało niezgodne ze schematem → 400 i żadnego odczytu. Przypadek (b) jest tym, który odróżnia bramkę od komentarza: bez niego test przeszedłby na implementacji ustawiającej znacznik bezwarunkowo.

### Success Criteria:

#### Automated Verification:

- Typy i build przechodzą: `npm run build`
- Lint przechodzi: `npm run lint`
- Pakiet testów przechodzi, wraz z nowym plikiem: `npm test`
- Nowy plik testowy faktycznie istnieje i jest uruchamiany: `npx vitest run src/pages/api/day-plan/activity/ --reporter=verbose` wypisuje cztery przypadki
- Znacznik nie wycieka do pozostałych tras: `grep -n "acceptance_cleared" src/pages/api/day-plan/generate.ts src/pages/api/day-plan/accept.ts src/pages/api/day-plan/index.ts` nie zwraca nic, a `grep -c "acceptance_cleared" src/pages/api/day-plan/activity/\[id\].ts` zwraca co najmniej 1
- Podpowiedź nazwy FK jest w kodzie, nie w domyśle: `grep -n "activities_plan_id_user_id_fkey" src/lib/services/day-plan-store.ts` zwraca trafienie

#### Manual Verification:

- Edycja propozycji w dniu zaakceptowanym przez `npm run dev` nadal zapisuje tekst i nadal zdejmuje akceptację — regresja na zachowaniu S-02 byłaby najgorszym wynikiem tej fazy
- Edycja propozycji w dniu roboczym zapisuje się bez żadnej zmiany zachowania

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji automatycznej zatrzymaj się i poczekaj na potwierdzenie weryfikacji ręcznej przed przejściem dalej.

---

## Phase 2: Potwierdzenie i banner

### Overview

Wyspa pyta przed zapisem, który zdejmie akceptację, i mówi o tym po fakcie. Oba takty FR-017 lądują w jednym pliku.

### Changes Required:

#### 1. Dialog przy zapisie

**File**: `src/components/plan/DayPlanEditor.tsx`

**Intent**: `saveDraft` pyta, zanim wyśle `PATCH`, ale **tylko** gdy plan jest w tej chwili zaakceptowany. Odmowa nie wysyła żądania, nie zamyka edytora i nie rusza tekstu. Bramka na `accepted` daje też za darmo właściwe zachowanie przy drugiej edycji: po pierwszym zapisie akceptacji już nie ma, więc nie ma o co pytać.

**Contract**: Dialog przez `window.confirm`, spójnie z `generate()` i `deletePlan()`. Treść po polsku, nazywająca skutek, a nie generyczne „czy na pewno" — wzorzec z `DayPlanEditor.tsx:221-223` i `:295-297`. Musi powiedzieć, że dzień wróci do roboczego i że akceptację można przywrócić. Bramka czyta `accepted`, czyli to samo pole, którego używa `generate()`.

**Uwaga o ścieżce ponowienia**: `saveDraft` przekazuje własny `retry`, który wywołuje `saveDraft(live)` ponownie (`:254-257`). Po nieudanym zapisie akceptacja wciąż stoi, więc „Spróbuj ponownie" zapyta drugi raz — i tak ma być: to ta sama operacja o tym samym skutku, a nie kontynuacja zgody już udzielonej.

#### 2. Trzeci stan bannera

**File**: `src/components/plan/DayPlanEditor.tsx`

**Intent**: Po zapisie, który cofnął akceptację, w miejscu zielonej plakietki staje zdanie nazywające przyczynę i droga powrotna. Stan jest lokalny dla wyspy i znika po przeładowaniu — nic nie jest zapisywane.

**Contract**: Nowy stan komponentu (np. `clearedByEdit: boolean`), ustawiany z odpowiedzi przez `readAcceptanceCleared` z Fazy 1 — nigdy z tego, czy dialog się pokazał, bo to jest właśnie ścieżka, którą nieaktualna kopia `accepted` omija. Zerowany na starcie każdej mutacji (patrz §Critical Implementation Details). `AcceptanceBanner` przyjmuje go jako prop i renderuje trzeci wariant: ostrzegawczy w tonie, nazywający przyczynę, z akcją „Akceptuj ponownie" wywołującą istniejące `setAcceptance(true)`. Wariant zaakceptowany i roboczy bez zmian. Kolor nie może być jedynym nośnikiem różnicy — dotychczasowy komentarz komponentu („said in words and in colour rather than only in colour", `:504`) obowiązuje dalej.

### Success Criteria:

#### Automated Verification:

- Build przechodzi: `npm run build`
- Lint, w tym reguły `jsx-a11y` i `react-hooks`, przechodzi: `npm run lint`
- Pakiet testów przechodzi bez regresji: `npm test`
- Dialog jest bramkowany, nie bezwarunkowy: `grep -n -B4 "window.confirm" src/components/plan/DayPlanEditor.tsx` pokazuje warunek na `accepted` w każdym z trzech wystąpień
- Banner nie zgaduje ze swojej kopii stanu: `grep -n "clearedByEdit" src/components/plan/DayPlanEditor.tsx` pokazuje przypisanie wyłącznie z wartości odczytanej z odpowiedzi, a nie z `accepted`

#### Manual Verification:

- Dzień zaakceptowany → „Edytuj" → zmiana tytułu → „Zapisz" → dialog nazywa skutek; **„Anuluj"**: tekst zostaje w edytorze, plakietka „Plan zaakceptowany" stoi, po przeładowaniu tekst jest stary
- To samo, ale **„OK"**: tekst się zapisuje, banner mówi, że dzień wrócił do roboczego i dlaczego; „Akceptuj ponownie" przywraca zieloną plakietkę
- Druga edycja tego samego dnia (już roboczego) nie pokazuje żadnego dialogu
- Dzień roboczy od początku: edycja bez dialogu i bez bannera przyczyny
- Po przeładowaniu strony zdanie o przyczynie znika, zostaje zwykły „Plan roboczy" — stan jest ulotny zgodnie z decyzją
- Banner przyczyny nie przeżywa kolejnej operacji: cofnij akceptację i zaakceptuj ponownie bez przeładowania — zdanie o przyczynie nie może zaprzeczać plakietce nad sobą

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji automatycznej zatrzymaj się i poczekaj na potwierdzenie weryfikacji ręcznej przed przejściem dalej.

---

## Phase 3: Warunek układu

### Overview

`prd-v2.md` §Constraints wiąże **tę** pozycję warunkiem, żeby operacje akceptacji i usunięcia trafiły w docelowe miejsce raz, a nie dwa razy. Decyzja z sesji planowania: przenosi się akceptacja, usunięcie zostaje wyciszone na dole.

### Changes Required:

#### 1. Przeniesienie operacji akceptacji

**File**: `src/components/plan/DayPlanEditor.tsx`

**Intent**: „Akceptuj plan" / „Cofnij akceptację" staje przy przycisku generowania. „Usuń plan dnia" zostaje tam, gdzie jest — outline, wyciszony, odsunięty — bo warunek układu każe zachować ostrożność, a przycisk generowania bywa klikany wielokrotnie w jednej sesji; posadzenie nieodwracalnego kasowania obok niego realizowałoby literę warunku przeciw jego treści.

**Contract**: Przycisk akceptacji opuszcza `<section>` z listą propozycji i ląduje w rzędzie sterującym przy przycisku generowania. Jego bramka widoczności pozostaje ta sama, co dziś, czyli `plan && hasActivities` — dzień bez propozycji nie ma czego akceptować, a `<form>` z hasłem renderuje się także na dniu pustym. Przycisk generowania jest `type="submit"` wewnątrz `<form>`; przycisk akceptacji musi zostać `type="button"`, żeby nie porwał `onSubmit`. Zachowane bez zmian: `disabled={isBusy || draft !== null}`, wariant kolorystyczny obu stanów, ikony `Check`/`Undo2`, etykiety. `AcceptanceBanner` zostaje przy liście propozycji — opisuje treść, nie jest przyciskiem.

**Kontrakt dostępności**: nowy rząd sterujący musi zachować sensowną kolejność tabulacji — hasło → generowanie → akceptacja — i nie może zamknąć przycisku akceptacji wewnątrz elementu, który zmienia jego rolę.

#### 2. Utrzymanie wyciszenia kasowania

**File**: `src/components/plan/DayPlanEditor.tsx`

**Intent**: Komentarz przy przycisku usuwania (`:478-488`) tłumaczy, dlaczego jest cichszy od akceptacji — „to nie jest akcja, w którą oko ma wpadać". Po przeniesieniu akceptacji wyżej ten argument staje się **mocniejszy**, nie słabszy, i komentarz musi to odnotować, żeby następny czytelnik nie potraktował osamotnionego przycisku jako pozostałości po niedokończonym przenoszeniu.

**Contract**: Styl, bramka `plan` i stan `disabled` bez zmian. Komentarz uzupełniony o powód, dla którego warunek układu został rozliczony rozdzielnie, z odesłaniem do `prd-v2.md` §Constraints „Warunek układu".

### Success Criteria:

#### Automated Verification:

- Build przechodzi: `npm run build`
- Lint, w tym `jsx-a11y`, przechodzi: `npm run lint`
- Pakiet testów przechodzi: `npm test`
- Akceptacja nie stała się przyciskiem wysyłającym formularz: `grep -n -A3 "Akceptuj plan" src/components/plan/DayPlanEditor.tsx` pokazuje `type="button"`
- Przycisk usuwania nie został przeniesiony przy okazji: `git diff -w master..HEAD -- src/components/plan/DayPlanEditor.tsx | grep -c '^[+-].*Usuń plan dnia'` zwraca `0` _(zakresowanie `master..HEAD` i `-w` są wymogiem `lessons.md` — bez zakresu kryterium przechodzi bezwarunkowo po commicie fazy, bez `-w` łapie samo przeformatowanie)_
- Istniejące testy e2e dotykające tych przycisków przechodzą: `npm run test:e2e`

#### Manual Verification:

- Na dniu z planem: hasło, przycisk generowania i przycisk akceptacji tworzą jeden czytelny blok; „Usuń plan dnia" jest wyraźnie odsunięty i wyciszony
- Na dniu pustym: przycisk akceptacji nie renderuje się wcale, a formularz generowania wygląda jak dotąd
- Tabulacja z pola hasła prowadzi do generowania, a potem do akceptacji — bez pułapek ogniskowania
- Podczas otwartej edycji propozycji oba przyciski są nieaktywne, tak jak przed przeniesieniem
- Widok mieści się i czyta poprawnie na szerokości telefonu
- Wciśnięcie Enter w polu hasła nadal uruchamia generowanie, a nie akceptację

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji automatycznej zatrzymaj się i poczekaj na potwierdzenie weryfikacji ręcznej przed przejściem dalej.

---

## Phase 4: Dowód odmowy w przeglądarce

### Overview

`window.confirm` nie ma innego domu niż przeglądarka, a ścieżka odmowy jest tą, której nie widzi żaden test jednostkowy. To jedyna faza tego planu prowadzona przez `/10x-e2e`.

### Changes Required:

#### 1. Test odmowy dialogu przy edycji

**File**: `tests/e2e/day-plan-edit-confirmation.spec.ts` _(nowy)_

**Intent**: Udowodnić, że odmowa w dialogu nie wysyła żądania, nie zmienia tekstu i nie zdejmuje akceptacji — oraz że dialog w ogóle się pokazał, bo bez tego cała asercja jest pusta.

**Contract**: Wzorzec i struktura z `tests/e2e/day-plan-delete-confirmation.spec.ts`. Zasiew: `seedDayPlan({ …, accepted: true })` z unikalną datą (`uniquePlanDate`) i znacznikiem (`uniqueStamp`), sprzątanie w `afterEach` przez `deleteSeededPlans`. `waitForIslands` przed pierwszym kliknięciem — bez tego kliknięcie trafia w przycisk wyrenderowany serwerowo, dialog się nie pokazuje i test przechodzi nie sprawdziwszy niczego. Lokatory przez role i etykiety (`getByRole`, `getByLabel`), nigdy CSS ani XPath; żadnego `waitForTimeout`.

**Cztery asercje, nie jedna** — wymóg `lessons.md` („Kryterium weryfikacji musi móc nie przejść") dla asercji negatywnej:

1. dialog faktycznie się pokazał,
2. żadne żądanie `PATCH` na `/api/day-plan/activity/` nie poleciało,
3. po przeładowaniu widoczny jest **stary** tytuł propozycji,
4. po przeładowaniu plakietka „Plan zaakceptowany" nadal stoi.

Asercja 4 jest tą, która odróżnia ten test od siostrzanego testu kasowania: bez niej implementacja wysyłająca `PATCH` mimo „Anuluj", ale przywracająca tekst, byłaby zielona.

**Świadomie poza zakresem tego pliku**: ścieżka zgody. Pokrywa ją weryfikacja ręczna Fazy 2 oraz przypadek (a) z testu jednostkowego Fazy 1. Dokładać ją tutaj znaczyłoby płacić za drugi przebieg przeglądarki za sygnał, który stoi już taniej — `test-plan.md` §1 zasada 1.

### Success Criteria:

#### Automated Verification:

- Nowy test przechodzi: `npx playwright test tests/e2e/day-plan-edit-confirmation.spec.ts`
- Cały zestaw e2e przechodzi, bez regresji na testach kasowania i własności: `npm run test:e2e`
- Test jest niezależny i powtarzalny: `npx playwright test tests/e2e/day-plan-edit-confirmation.spec.ts --repeat-each=2` przechodzi
- Test potrafi zawieść: uruchomiony na gałęzi z tymczasowo usuniętym `window.confirm` w `saveDraft` świeci na czerwono — **przebieg wymagany przed uznaniem fazy za zamkniętą**, wynik zapisany w Progress; zielona bramka, której nikt nie widział na czerwono, jest komentarzem, nie bramką
- Brak zakazanych konstrukcji: `grep -n "waitForTimeout\|page.locator(\|querySelector\|\\$x(" tests/e2e/day-plan-edit-confirmation.spec.ts` nie zwraca nic
- Lint przechodzi: `npm run lint`

#### Manual Verification:

- Uruchomienie zestawu dwa razy pod rząd nie zostawia zasianych dni w bazie
- Przebieg równoległy z pozostałymi testami e2e nie koliduje na `unique (user_id, plan_date)`

**Implementation Note**: Ta faza idzie przez `/10x-e2e` — przegląd wygenerowanego testu pod pięć anty-wzorców jest częścią fazy, nie dodatkiem do niej.

---

## Testing Strategy

### Unit Tests

- Trasa `PATCH`: cztery przypadki z Fazy 1. Kluczowy jest ten, który **może zawieść na złej implementacji** — edycja planu roboczego nie ustawia znacznika.
- Bez mockowania modułów z `src/lib/`: zod, `updateActivityText` i `readDayPlanById` wykonują się naprawdę, zgodnie z regułą z `week/day.test.ts:8-11`.

### Integration Tests

Brak nowych. Zapis, izolacja kont i zachowanie triggera są już pokryte przez pgTAP (`supabase/tests/database/day_plan_write.test.sql`) i testy własności e2e; ten PR nie rusza żadnej z tych ścieżek.

### E2E Tests

Jeden test, ścieżka odmowy, Faza 4. Uzasadnienie zawężenia w kontrakcie tej fazy.

### Manual Testing Steps

1. Zasiać albo wygenerować dzień, zaakceptować go.
2. „Edytuj" przy pierwszej propozycji → zmienić tytuł → „Zapisz" → w dialogu **Anuluj**. Sprawdzić: tekst w edytorze niezmieniony, plakietka akceptacji stoi. Przeładować — stary tytuł.
3. Powtórzyć, tym razem **OK**. Sprawdzić: nowy tytuł zapisany, banner nazywa przyczynę, „Akceptuj ponownie" działa.
4. Edytować drugą propozycję na dniu, który został roboczy — żadnego dialogu.
5. Przeładować po kroku 3 — zdanie o przyczynie znika, zostaje „Plan roboczy".
6. Otworzyć ten sam dzień w dwóch kartach. W karcie A cofnąć akceptację. W karcie B (wciąż uważającej dzień za zaakceptowany) zapisać edycję: dialog się pokaże, ale banner przyczyny **nie** — serwer raportuje, że nic nie zdjął. To jest przypadek, dla którego istnieje Faza 1.
7. Przypadek odwrotny: w karcie A zaakceptować dzień, w karcie B (uważającej go za roboczy) zapisać edycję. Dialogu nie będzie — kopia wyspy jest stara — ale banner **musi** powiedzieć, że akceptacja została zdjęta. To jest przypadek, dla którego Faza 1 ma dokładnie taki kształt, a nie prostszy.
8. Przejść kroki 2–4 na szerokości telefonu.

## Performance Considerations

Jeden dodatkowy odczyt na edycję propozycji, na ścieżce, która i tak wykonuje zapis i odczyt zwrotny. Edycja jest operacją ręczną o częstotliwości rzędu kilku na dzień — koszt jest nieistotny, a alternatywa (kolumna niosąca powód) kosztuje migrację.

## Migration Notes

Brak migracji. Brak przepisania danych — uzasadnienie w §Current State Analysis: trigger działa od S-02, więc `prd-v2.md` §Constraints „Semantyka zastanych danych" opisuje stan, którego ścieżki aplikacji nie mogły wyprodukować.

`prd-v2.md` §Business Logic Changes reguła 2 pozostaje niepoprawiona w tym PR świadomie. Warto zgłosić to jako osobną pozycję w `next-actions.md` przy zamykaniu slice'a.

## References

- Roadmapa, pozycja S-12: `context/foundation/roadmap.md:132-143`
- FR-017 wraz z notatką Sokratejską: `context/foundation/prd-v2.md:221-229`
- Warunek układu: `context/foundation/prd-v2.md:286-291`
- Semantyka zastanych danych: `context/foundation/prd-v2.md:281-285`
- Trigger zerujący akceptację: `supabase/migrations/20260823095136_day_plan_generation_write_contract.sql:107-135`
- Wzorzec testu odmowy dialogu: `tests/e2e/day-plan-delete-confirmation.spec.ts`
- Wzorzec testu trasy: `src/pages/api/day-plan/week/day.test.ts`
- Reguły wiążące kryteria sukcesu: `context/foundation/lessons.md` — „Kryterium weryfikacji musi móc nie przejść", „Bramka grepowa musi celować w konstrukcję i przejechać oba stany"
- Ryzyko #7 i zastrzeżenie o dialogu przeglądarki: `context/foundation/test-plan.md` §2

## Progress

> Konwencja: `- [ ]` oczekuje, `- [x]` zrobione. Dopisz ` — <commit sha>`, gdy krok wyląduje. Nie zmieniaj tytułów kroków. Patrz `references/progress-format.md`.

### Phase 1: Serwer raportuje, co zdjął

#### Automated

- [x] 1.1 Typy i build przechodzą: `npm run build`
- [x] 1.2 Lint przechodzi: `npm run lint`
- [x] 1.3 Pakiet testów przechodzi, wraz z nowym plikiem: `npm test`
- [x] 1.4 Nowy plik testowy istnieje i wypisuje cztery przypadki
- [x] 1.5 Znacznik nie wycieka do pozostałych tras (grep)
- [x] 1.6 Podpowiedź nazwy FK jest w kodzie (grep)

#### Manual

- [ ] 1.7 Edycja w dniu zaakceptowanym nadal zapisuje tekst i zdejmuje akceptację
- [ ] 1.8 Edycja w dniu roboczym bez zmiany zachowania

### Phase 2: Potwierdzenie i banner

#### Automated

- [ ] 2.1 Build przechodzi: `npm run build`
- [ ] 2.2 Lint przechodzi: `npm run lint`
- [ ] 2.3 Pakiet testów przechodzi bez regresji: `npm test`
- [ ] 2.4 Dialog jest bramkowany na `accepted`, nie bezwarunkowy (grep)
- [ ] 2.5 Banner ustawiany z odpowiedzi, nie z kopii stanu (grep)

#### Manual

- [ ] 2.6 „Anuluj" nie zapisuje, nie zamyka edytora i nie zdejmuje akceptacji
- [ ] 2.7 „OK" zapisuje, banner nazywa przyczynę, „Akceptuj ponownie" działa
- [ ] 2.8 Druga edycja tego samego dnia nie pyta
- [ ] 2.9 Dzień roboczy od początku: bez dialogu i bez bannera przyczyny
- [ ] 2.10 Po przeładowaniu zdanie o przyczynie znika
- [ ] 2.11 Banner przyczyny nie przeżywa kolejnej operacji akceptacji

### Phase 3: Warunek układu

#### Automated

- [ ] 3.1 Build przechodzi: `npm run build`
- [ ] 3.2 Lint przechodzi: `npm run lint`
- [ ] 3.3 Pakiet testów przechodzi: `npm test`
- [ ] 3.4 Przycisk akceptacji ma `type="button"` (grep)
- [ ] 3.5 Przycisk usuwania nie został przeniesiony: `git diff -w master..HEAD` zwraca `0`
- [ ] 3.6 Istniejące testy e2e przechodzą: `npm run test:e2e`

#### Manual

- [ ] 3.7 Hasło, generowanie i akceptacja tworzą jeden blok; usuwanie odsunięte
- [ ] 3.8 Na dniu pustym przycisk akceptacji się nie renderuje
- [ ] 3.9 Kolejność tabulacji: hasło → generowanie → akceptacja
- [ ] 3.10 Oba przyciski nieaktywne podczas otwartej edycji propozycji
- [ ] 3.11 Widok czyta się na szerokości telefonu
- [ ] 3.12 Enter w polu hasła uruchamia generowanie, nie akceptację

### Phase 4: Dowód odmowy w przeglądarce

#### Automated

- [ ] 4.1 Nowy test przechodzi
- [ ] 4.2 Cały zestaw e2e przechodzi bez regresji
- [ ] 4.3 Test przechodzi przy `--repeat-each=2`
- [ ] 4.4 Test zobaczony na czerwono przy usuniętym `window.confirm`
- [ ] 4.5 Brak zakazanych konstrukcji w pliku testu (grep)
- [ ] 4.6 Lint przechodzi: `npm run lint`

#### Manual

- [ ] 4.7 Dwa przebiegi pod rząd nie zostawiają zasianych dni
- [ ] 4.8 Przebieg równoległy nie koliduje na `unique (user_id, plan_date)`
