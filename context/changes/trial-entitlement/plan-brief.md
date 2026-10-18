# Okres próbny i stan planu konta (S-23) — Plan Brief

> Full plan: `context/changes/trial-entitlement/plan.md`

## What & Why

Każde nowe konto dostaje pierwszy miesiąc od rejestracji z pełnym zakresem, bez karty (FR-030), a
nauczycielka widzi — tylko do odczytu — do kiedy ten dostęp trwa. Slice wprowadza jedyny model
uprawnienia „plan + dostęp do daty”, na którym staną `S-24`…`S-27`; błąd tutaj powieliłby się w
każdej płatności.

## Starting Point

Konto nie ma dziś stanu planu; limit to nadpisanie (S-28) albo `FAIR_USE_*`. `claim_generation` ma
zarezerwowane miejsce na plan konta. Regulamin mówi, że Temio jest bezpłatne, a konta sprzed
płatności mają się o nowych zasadach dowiedzieć dopiero w `S-24`.

## Desired End State

Konto założone po wdrożeniu ma wiersz `account_entitlements` (`basic`, `access_until` = dzień
rejestracji + 1 miesiąc, włącznie, Warszawa), założony wyzwalaczem przy rejestracji. W `/ustawienia`
widzi „Pełny dostęp — do 17 listopada 2026” i „Wszystkie funkcje Temio są dziś bezpłatne.”, dopóki
data trwa. Konta sprzed wdrożenia nie widzą zmiany; testerki dostają datę 31.01.2027 ręcznie.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Model okresu próbnego | Wiersz per konto zakładany przy rejestracji | Jedna zapisana data, którą `S-25`/`S-26` tylko przesuwają; testerka to jeden `UPDATE`/`INSERT`. |
| Uprawnienia wyzwalacza | `security invoker` + granty dla `supabase_auth_admin` | Zachowuje „jedyny definer to `delete_own_account`”; zalecenie Supabase. |
| Konta sprzed slice'u | Bez wiersza i bez karty do `S-24` | Nikt nie poznaje nowych zasad przed uprzedzeniem; „brak wiersza” ≠ plan darmowy. |
| Treść karty | „Pełny dostęp — do …” + „wszystko dziś bezpłatne” | Prawdziwe wobec Regulaminu i FAQ; `S-22`/`S-25` zmienią słowa, gdy płatności powstaną. |
| Po dacie | Karta znika | Nie ogłaszamy końca czegoś, co dziś niczego nie zmienia. |
| Długość | Ten sam dzień następnego miesiąca, włącznie | Ta sama konwencja co `valid_until`; czytelna data. |
| Błąd wyzwalacza | Rejestracja nie dochodzi do skutku | Niezmiennik „każde nowe konto ma wiersz” dla płatności. |
| Limit | `claim_generation` bez zmian | Dziś każdy stan = ten sam fair use; wpięcie w `S-27`. |

## Scope

**In scope:** tabela + RLS + wyzwalacz, pgTAP i test przez GoTrue, typy, karta w `/ustawienia`,
polityka prywatności 1.3, sekcja CLAUDE.md, `db push`, wiersze testerek.

**Out of scope:** zmiany limitu, backfill i prezent (`S-24`), słowa „Basic”/„okres próbny”/ceny,
zmiany Regulaminu i FAQ, panel właściciela, cron wygasania, komunikat o końcu dostępu.

## Architecture / Approach

`auth.users` insert (GoTrue jako `supabase_auth_admin`) → wyzwalacz `start_trial_entitlement`
(invoker) → `public.account_entitlements`. Strona `/ustawienia` czyta własny wiersz klientem
nauczycielki (RLS select), czysta funkcja `accessCard` decyduje o widoczności; błąd odczytu = brak
karty + log.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Uprawnienie w bazie | Tabela, wyzwalacz, pgTAP pod rolą `supabase_auth_admin`, test przez GoTrue | Brak grantu blokuje każdą rejestrację |
| 2. Karta w ustawieniach | Odczyt + wiersz „Pełny dostęp — do …” | Słowa obiecujące nieistniejące płatności |
| 3. Dokumenty i uruchomienie | Polityka 1.3, CLAUDE.md, `db push`, testerki | Merge bez pushu → konta bez wiersza |

**Prerequisites:** S-21 i S-28 na produkcji (są); lokalny stack Supabase (Docker).
**Estimated effort:** ~2 sesje, 3 fazy.

## Open Risks & Assumptions

- Wyzwalacz na `auth.users` to udokumentowany wzorzec Supabase; próbna rejestracja na produkcji
  zaraz po `db push` to jedyny dowód hostowanych uprawnień.
- Konta założone między merge'em a pushem trzeba uzupełnić ręcznie.
- „Brak wiersza = konto sprzed płatności” trwa do `S-24` — każdy czytelnik tabeli musi to wiedzieć
  (CLAUDE.md).

## Success Criteria (Summary)

- Nowa nauczycielka po rejestracji widzi w ustawieniach datę pełnego dostępu za miesiąc.
- Nauczycielka nie może nadać sobie dostępu ani zobaczyć cudzego; rejestracja działa jak dotąd.
- Obecne konta nie widzą żadnej zmiany.
