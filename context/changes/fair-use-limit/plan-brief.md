# Limit fair use (S-21) — Plan Brief

> Full plan: `context/changes/fair-use-limit/plan.md`

## What & Why

Każde wywołanie modelu zostaje policzone na koncie w miesiącu kalendarzowym; nadużycie (ponad 150
dni-generacji albo 300 poprawek aktywności) zatrzymuje generowanie komunikatem z dniem powrotu
i linkiem do kontaktu (FR-027). Typowy miesiąc nigdy tego nie widzi, a awaria licznika nigdy nie
zatrzymuje generowania (Guardrail 1). To też pierwszy pomiar zużycia — dziś danych nie ma, bo
regeneracja nadpisuje `day_plans`.

## Starting Point

Cztery trasy wołają model (`generate.ts`, `week/day.ts`, `week/outline.ts`, `refine.ts`) i żadna
nie zostawia policzalnego śladu. Tydzień to szkic plus pięć równoległych wywołań z przeglądarki.
Wyspy pokazują błąd jako tekst z kopertą `{ error, retryable }`.

## Desired End State

Nowa księga `generation_ledger` zapisuje każde wywołanie; funkcja `claim_generation` atomowo
sprawdza i rezerwuje. Ponad limit: 429, „Generowanie znów będzie możliwe od 1 listopada.” i link
„Napisz do nas”. Limity zmienia się w konfiguracji bez deployu; polityka prywatności 1.1 opisuje
księgę i jej 13-miesięczną retencję.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Próg dni | 150/mies., w konfiguracji | Decyzja z PRD 2026-10-17, nie z pomiaru. |
| Sufit poprawek | 300/mies., osobna rodzina | Poprawka nie zużywa dni (FR-037), a jest ~3× tańsza od dnia. |
| Szkic tygodnia | Zapisany, 0 dni, odmowa przy 0 pozostałych | Tydzień = 5 dni jak w cenniku; nauczycielka zatrzymana przy pierwszym kliknięciu. |
| Nieudane generowanie | Rezerwacja, potem zwrot | Nauczycielka nie płaci za błędy modelu ani zapisu. |
| Granica zwrotów | 30 zwrotów/mies., nadwyżka się liczy | Zwrot jest wywoływalny skryptem tokenem nauczycielki — bez granicy sufit by znikał. |
| Miesiąc | Czas generowania, Europe/Warsaw | Fair use ogranicza koszt w czasie; `plan_date` zapisany pod `S-27`. |
| Model bezpieczeństwa | Księga insert-only + `update(status)` + wyzwalacz, `security invoker` | Definer nie zamyka żadnej drogi, a złamałby niezmiennik „jedyny definer”. |
| Awaria licznika | Fail-open w jednym serwisie, z logiem | Guardrail 1. |
| Komunikat | Zdanie z datą + pole `limit.resets_on`, link w wyspie | Klikalny kontakt (FR-027) bez zmiany koperty dla starych klientów. |
| Testy | Unit + `*.db.test.ts` (równoległość) + pgTAP | Największe ryzyko żyje w bazie. |
| Retencja | 13 miesięcy, pg_cron | Rok szkolny do kalibracji; retencja jako kod. |

## Scope

**In scope:** księga, funkcja, wyzwalacz, retencja; serwis `fair-use.ts` i konfiguracja `FAIR_USE_*`
(z trybem `observe`); 429 w czterech trasach; link w edytorze dnia i na tablicy tygodnia; polityka
prywatności 1.1; CLAUDE.md; roadmapa.

**Out of scope:** pula zależna od planu (`S-23`, `S-27`), liczenie po `plan_date`, widoczny licznik,
limit zakładania kont, panel admina, E2E.

## Architecture / Approach

Trasa → (walidacja, prechecki) → `claimGeneration` → [odmowa → 429] → model → `finishGeneration`
(`succeeded`/`failed`) → dotychczasowa odpowiedź. `claim_generation` pod `pg_advisory_xact_lock`
na koncie liczy wiersze miesiąca (nie-`failed` + nadwyżka `failed` ponad pulę zwrotów) i wstawia
rezerwację. Każdy błąd księgi w serwisie = „dozwolone, bez rezerwacji” + log.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Księga w bazie | Tabela, funkcja, wyzwalacz, cron, typy, pgTAP | Zapytanie liczące / pula zwrotów źle zliczone na granicy miesiąca |
| 2. Serwis i konfiguracja | `fair-use.ts`, `FAIR_USE_*`, 429, `isLimitBody` | Zła wartość env wywraca trasę — dlatego `string` + parsowanie |
| 3. Cztery trasy | Rezerwacja i zwrot w każdej trasie, test równoległości | Konflikt w `generate.ts` zużywający dzień; brak fail-open w jednej trasie |
| 4. Wyspy | Link „Napisz do nas” przy limicie | Częściowy tydzień (3 gotowe, 2 limit) czytelny na kartach |
| 5. Dokumenty i prawo | Polityka 1.1, CLAUDE.md, roadmapa | Odsyłacze w polityce po przenumerowaniu |

**Prerequisites:** lokalny stos Supabase (Docker); po scaleniu `npx supabase db push` na hostowanym projekcie.
**Estimated effort:** ~3 sesje w 5 fazach.

## Open Risks & Assumptions

- Skrypt z tokenem nauczycielki może przestawić 30 własnych rezerwacji na `failed` miesięcznie — sufit to 180, nie 150. Przyjęte.
- Bezpośrednie RPC z zawyżonym limitem tylko dopisuje wiersz; nie woła modelu. Przyjęte i opisane w migracji.
- Bez `db push` przy scaleniu limit milczy (fail-open) — log `fair_use.claim_failed` jest sygnałem.
- 150/300 to decyzje, nie pomiar; księga daje dane do kalibracji.

## Success Criteria (Summary)

- Typowy miesiąc planowania nie dotyka limitu; awaria księgi nie zatrzymuje generowania.
- Ponad limit nauczycielka widzi, od kiedy znów może generować, i ma klikalny kontakt.
- Pięć równoległych dni tygodnia nie przechodzi razem przez limit.
