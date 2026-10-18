# Basic do 31.01.2027 dla kont sprzed startu płatności (S-30) — Plan Brief

> Full plan: `context/changes/trial-until-launch/plan.md`

## What & Why

Konto założone przed startem płatności ma mieć pełny dostęp do 31.01.2027, a nie miesiąc od
rejestracji. Wtedy wszystkie konta sprzed płatności dostają jedno uprzedzenie (`S-24`) i podejmują
decyzję „płacę albo plan darmowy” tego samego dnia, 1.02.2027. Przy 30 dniach konto z listopada
miałoby w dniu startu `S-27` wygasły dostęp i trafiłoby na plan darmowy bez uprzedzenia.

## Starting Point

`S-23` (wdrożony 2026-10-18) zakłada każdemu nowemu kontu wiersz `account_entitlements` z datą
„dzień rejestracji w Warszawie + 1 miesiąc”, wyzwalaczem `security invoker`. Właściciel i
testerki mają wiersze `owner` z 2099-12-31. Karta w `/ustawienia` pokazuje datę z wiersza.

## Desired End State

Rejestracja do 31.12.2026 daje dostęp do 31.01.2027, a od 1.01.2027 miesiąc od rejestracji.
Konta okresu próbnego założone od wdrożenia `S-23` mają już 31.01.2027. Wiersze `owner` są
nietknięte, a kod aplikacji się nie zmienia: karta sama pokazuje „do 31 stycznia 2027”.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Reguła daty | `greatest(rejestracja + 1 miesiąc, 2027-01-31)` | Jedna formuła obsługuje oba okresy i od 1.01.2027 przestaje działać sama — nie trzeba drugiej migracji przy starcie płatności. |
| Źródło daty | Stała w funkcji | Najprostsze, całość w jednym miejscu i w teście; tabela konfiguracji dokładałaby granty i nowy sposób na zablokowanie rejestracji. |
| Konta założone od `S-23` | Wyrównane w tej samej migracji | Wszyscy sprzed startu mają tę samą datę bez ręcznej pracy; `update` wybiera po `source` i dacie, nigdy po osobie. |
| Opóźnienie płatności | Nowa migracja (stała + wiersze) | Funkcja w repo i na produkcji zostaje ta sama; zmiana ma test. |

## Scope

**In scope:**
- Nowa migracja: funkcja z `greatest` i wyrównanie wierszy `trial`
- Przepisane przypadki dat w pgTAP i test przez GoTrue
- CLAUDE.md (reguła i procedura przesunięcia terminu), poprawka w roadmapie `S-30`

**Out of scope:**
- Tekst w produkcie (cena założycielska, „okres próbny”) — `S-22`/`S-25`
- Uprzedzenie o 1.02.2027 — `S-24`; plan darmowy — `S-27`; horyzont planowania — `S-31`
- Wiersze `owner`, `fair_use_overrides`, `claim_generation`

## Architecture / Approach

`create or replace function public.start_trial_entitlement()` z nową formułą. Wyzwalacz, granty i
RLS zostają. W tej samej migracji jest `update ... where source = 'trial' and access_until < '2027-01-31'`.
Testy dat są pisane tak, żeby na starej funkcji były czerwone. Wyrównanie jest sprawdzane przez
`migration up` na lokalnej bazie z prawdziwymi wierszami `trial`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Reguła w bazie | Migracja, pgTAP, test przez GoTrue | Błąd w funkcji blokuje każdą rejestrację; za szeroki `update` dotyka wierszy `owner` |
| 2. Dokumenty i wdrożenie | CLAUDE.md, roadmapa, `db push`, próbna rejestracja | Merge bez `db push` — nowe konta dostają datę za miesiąc, dopóki migracja nie wejdzie |

**Prerequisites:** `S-23` na produkcji (jest).
**Estimated effort:** jedna krótka sesja, dwie fazy.

## Open Risks & Assumptions

- Termin zakłada płatności na produkcji przed 1.02.2027 (termin roadmapy 2027-01-20). Opóźnienie oznacza nową migrację.
- Jeśli `S-27` nie wejdzie 1.02.2027, wygaśnięcie dostępu niczego nie zmienia — data jest wtedy tylko napisem na karcie.

## Success Criteria (Summary)

- Nowe konto widzi w ustawieniach „Pełny dostęp — do 31 stycznia 2027”.
- Konta okresu próbnego założone od 2026-10-18 mają tę samą datę; Wasza trójka nadal 2099-12-31.
- Rejestracja na produkcji działa po wdrożeniu.
