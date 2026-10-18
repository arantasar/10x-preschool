# Indywidualne limity fair use (S-28) — Plan Brief

> Full plan: `context/changes/fair-use-overrides/plan.md`

## What & Why

Właściciel ma móc nadać wybranemu kontu własny miesięczny limit generowania — bez sufitu, wyższy
albo niższy — bez deployu i bez kasowania wierszy księgi. Na start bez sufitu: konto właściciela
i konto jednej testerki. To też pierwsze z kilku źródeł limitu, na którym `S-23` postawi stan planu.

## Starting Point

Limit z `S-21` jest jeden dla wszystkich: `claim_generation` dostaje go jako argumenty z `FAIR_USE_*`.
Funkcja jest `security invoker` (jedynym definerem jest `delete_own_account`). Repozytorium jest
publiczne. Konto testerki najpewniej zostało usunięte.

## Desired End State

Wpis w `fair_use_overrides` dla konta zmienia jego limit od następnego wywołania; `null` znaczy
„bez sufitu”, a po `valid_until` konto samo wraca do limitu domyślnego. Księga dalej zapisuje
każde wywołanie. Nauczycielka nic z tego nie widzi i nie może sobie niczego nadać.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Do czego przypięte | Do konta (`user_id`), kaskada z kontem | Spójne z RLS i usuwaniem konta; nie trzymamy danych osoby bez konta. |
| Konto testerki | Wpis po jej ponownej rejestracji | Nadpisanie po e-mailu „z góry” odrzucone (dane bez konta, ryzyko). |
| Preferencyjny dostęp | Własne liczby per rodzina; `null` = bez sufitu | Jedna tabela obsługuje i „unlimited”, i dowolny limit. |
| Obniżanie | Dozwolone — liczba zawsze wygrywa; CHECK ≥ 1 | Narzędzie na nadużycie bez blokowania konta. |
| Ważność | Opcjonalna `valid_until`, cron sprząta wygasłe | Zapomniany wpis nie trwa w nieskończoność. |
| Księga dla kont bez sufitu | Zapisuje każde wywołanie | Koszt najbardziej aktywnych kont pozostaje widoczny. |
| Widoczność | Nigdzie w aplikacji, tylko dashboard | Zasada „nigdy nie mów »bez limitu«”; licznik czeka na płatności. |
| Gdzie powstają wpisy | Wyłącznie w SQL Editorze | Repozytorium jest publiczne — żadnych adresów ani nazwisk w gicie. |

## Scope

**In scope:** tabela `fair_use_overrides` z RLS (tylko odczyt własnego wiersza) i cronem wygasania;
nowa wersja `claim_generation`; pgTAP; typy; Polityka prywatności 1.2; CLAUDE.md; roadmapa.

**Out of scope:** UI, panel admina, nadpisania po e-mailu, stan planu (`S-23`, `S-27`), zmiany
w zwrotach i trybie `observe`, zmiany w `fair-use.ts` i trasach.

## Architecture / Approach

`claim_generation` po blokadzie konta czyta obowiązujący wpis dla `auth.uid()`; jego kolumny
zastępują limity z argumentów, `null` = zawsze dozwolone dla tej rodziny. Kolejność źródeł:
nadpisanie konta → plan konta (`S-23`) → konfiguracja. Sygnatura bez zmian, więc aplikacja nic nie widzi.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Nadpisania w bazie | Tabela, RLS, cron, nowa `claim_generation`, pgTAP, typy | Nauczycielka nadaje sobie limit — RLS i brak grantów zapisu, dowiedzione w pgTAP |
| 2. Dokumenty i uruchomienie | Polityka 1.2, CLAUDE.md, roadmapa; wpisy w dashboardzie po `db push` | Adres albo nazwisko w publicznym repo — bramka grepowa na e-maile |

**Prerequisites:** lokalny stos Supabase; po scaleniu `npx supabase db push`.
**Estimated effort:** ~1 sesja w 2 fazach.

## Open Risks & Assumptions

- Testerka dostaje nadpisanie dopiero po rejestracji — do tego czasu ma zwykły limit.
- Liczba w dashboardzie wpisana z błędem może obniżyć komuś limit (CHECK chroni tylko przed 0).
- Nauczycielka może odczytać własny wpis przez API — świadomie, bo funkcja jest `security invoker`.

## Success Criteria (Summary)

- Konto właściciela generuje ponad limit domyślny i nigdy nie dostaje komunikatu, a księga zapisuje wywołania.
- Wpis liczbowy i data ważności działają bez deployu.
- Żadne konto nie może nadać sobie wpisu.
