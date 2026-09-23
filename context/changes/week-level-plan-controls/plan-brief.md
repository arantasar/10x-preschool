# Operacje dnia z poziomu tygodnia (S-11) — Plan Brief

> Full plan: `context/changes/week-level-plan-controls/plan.md`

## What & Why

Nauczyciel cofa akceptację dnia (FR-015) i usuwa zapisany plan dnia (FR-016) bez wychodzenia z widoku tygodnia — tam, gdzie faktycznie pracuje, zamiast wchodzić w dni po kolei. Warunek z rundy Sokratejskiej: operacja musi **jednoznacznie nazywać dzień**, a nie polegać na tym, że nauczyciel trafił we właściwą kartę.

## Starting Point

Oba prymitywy istnieją i działają: `POST /api/day-plan/accept` (także `accepted: false`, z `expected_generation`) i `DELETE /api/day-plan?date=`. Widok tygodnia nie ma dziś żadnej operacji na pojedynczym dniu poza „Ponów ten dzień"; karta pokazuje już pełne aktywności, więc przesłanka PRD o „kafelkach bez treści" jest częściowo nieaktualna. Główna trudność to maszyna stanów wyspy tygodnia (niezapisane partie `held`), nie zapis.

## Desired End State

Każda karta dnia z planem ma w stopce przełącznik „Akceptuj dzień" / „Cofnij akceptację" (bez dialogu, z komunikatem z datą po fakcie) i odsunięte, wyciszone „Usuń plan dnia" (z dialogiem nazywającym dzień i jego akceptację). Kasowanie czyści kartę bez przeładowania. Nieudana operacja zostawia komunikat w karcie i odczytuje ten dzień z serwera. Serwer, schemat i widok dnia bez zmian.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego (1 zdanie) | Źródło |
| --- | --- | --- | --- |
| Nazywanie dnia przy cofnięciu akceptacji | Bez dialogu; nazwa dostępna z datą + komunikat `role="status"` z datą po operacji | Operacja odwracalna nie pyta (reguła jawności proporcjonalnej), a dialog nie traci wagi przy kasowaniu | Plan |
| Zakres przełącznika | W obie strony — także akceptacja pojedynczego dnia | Przesłanka FR-015 („pomyłka kosztuje jedno kliknięcie") jest prawdziwa tylko z powrotem pod tym samym przyciskiem; świadomy dopisek ponad literę FR | Plan |
| Treść dialogu kasowania | Data + zdanie „Ten dzień jest zaakceptowany." tylko przy dniu zaakceptowanym | Guardrail #2: potwierdzenie uczciwe co do stanu dnia | Plan |
| Widok dnia | Bez zmian | Tam data jest w nagłówku strony; rozszerzenie diffu bez potrzeby | Plan |
| Warunek `expected_generation` przy kasowaniu | Brak — dziedziczone z S-05 | „Ten dzień ma być pusty" jest prawdziwe niezależnie od partii | S-05 (archiwum) |
| Kontrolki przy niezapisanych propozycjach | Wyłączone całkiem, gdy `heldCount > 0` lub trwa operacja tygodnia | Zbiór celów zapisu nie może się zmienić pod trzymanymi partiami | Plan |
| Układ | Stopka karty; kasowanie odsunięte, obrys zamiast wypełnienia | To samo rozliczenie „Warunku układu" co w widoku dnia po S-12 | Plan |
| Błędy | Komunikat w karcie + odczyt tego dnia; 409 bez „Odśwież stronę" | Ekran zgodny z bazą przed decyzją o ponowieniu (wzorzec `reconcile()`) | Plan |
| Dialog | `window.confirm` | Spójnie z każdą operacją w projekcie i z istniejącymi testami e2e | Kod |
| Testy | Unit na tekstach + 3× e2e + ryzyko #9 w `test-plan.md` | Dialog i cel kliknięcia nie mają innego domu niż przeglądarka | Plan |

## Scope

**In scope:**
- Czysty moduł `src/lib/week-day-controls.ts` (zdania, nazwy dostępne) z testami vitest
- Przełącznik akceptacji i kasowanie w `WeekDayCard` / `WeekPlanBoard`, blokady, błąd w karcie, odczyt dnia
- Trzy testy e2e, pomocnik `uniqueWeekStart()`, ryzyko #9 w mapie ryzyk

**Out of scope:**
- Trasy API, `src/lib/services/`, schemat, RLS
- `DayPlanEditor.tsx` (widok dnia)
- Edycja treści w karcie tygodnia; undo kasowania; nowe komponenty shadcn; siatka miesiąca

## Architecture / Approach

`WeekPlanBoard` jest właścicielem obu operacji (żądania, blokady `weekInFlight`, stosowanie odpowiedzi), tak jak dziś generowania i „Akceptuj tydzień"; `WeekDayCard` renderuje stopkę i woła callbacki. Operacje dnia serializują się z każdą operacją tygodniową przez tę samą blokadę. Wszystkie zdania nazywające dzień powstają w czystym module, więc są sprawdzalne bez renderowania.

## Phases at a Glance

| Faza | Co dostarcza | Główne ryzyko |
| --- | --- | --- |
| 1. Treści i nazwy operacji | Moduł zdań i nazw dostępnych z datą + testy jednostkowe | Asercja nieobecności zdania o akceptacji, która nie potrafi zawieść |
| 2. Operacje dnia w wyspie tygodnia | Przełącznik, kasowanie, błędy, blokady, stopka | Kolejność blokada→dialog; `204` bez ciała; reset `skipped` → `done` |
| 3. Testy e2e i mapa ryzyk | 3 testy Playwright przejechane na czerwono + ryzyko #9 | Pułapka build→e2e na reużywanym serwerze dev |

**Prerequisites:** gałąź `feat/week-level-plan-controls` (istnieje); lokalna Supabase dla e2e; S-05 i S-12 zamknięte (są).
**Estimated effort:** ~2 sesje w 3 fazach.

## Open Risks & Assumptions

- Stan akceptacji w dialogu kasowania pochodzi z kopii wyspy i bywa nieaktualny (druga karta przeglądarki); kasowanie go nie sprawdza — przyjęte za S-05.
- Akceptacja pojedynczego dnia wychodzi poza literę FR-015/016 — odnotowane jako świadomy dopisek; przegląd implementacyjny nie powinien czytać go jako dryfu.
- Zestaw e2e rośnie z 9 do 12 testów, więc wyścig build→e2e z `next-actions.md` trafia częściej — obejście należy do Kroku 9, nie do tej pozycji.

## Success Criteria (Summary)

- Nauczyciel cofa akceptację i usuwa dzień z tygodnia, a każda z tych operacji nazywa dzień, którego dotyczy.
- Pomyłka przy cofnięciu akceptacji kosztuje jedno kliknięcie w tym samym miejscu; kasowanie zawsze pyta i mówi, czy kasuje pracę zaakceptowaną.
- Testy e2e padają, gdy operacja trafia w inny dzień albo ignoruje odmowę w dialogu.
