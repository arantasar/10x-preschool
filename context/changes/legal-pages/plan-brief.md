# Regulamin i polityka prywatności (S-20) — Plan Brief

> Full plan: `context/changes/legal-pages/plan.md`
> Szkice i decyzje: `context/changes/legal-pages/drafts/README.md`

## What & Why

Temio świadczy usługi drogą elektroniczną bez regulaminu i przetwarza dane bez polityki prywatności —
to obowiązek prawny i warunek wstępny zapisu na cenę (S-22) oraz płatności. Brak budżetu na prawnika,
więc publikujemy pierwszą wersję napisaną samodzielnie, opisującą wyłącznie dzisiejszą darmową usługę.

## Starting Point

Treść obu dokumentów jest gotowa w `drafts/`. Nie ma stron, rejestracja nie zbiera akceptacji,
planner nie mówi, że propozycje pisze AI, FAQ o usuwaniu konta jest nieaktualne, a Supabase trzyma
historię logowań z IP bezterminowo.

## Desired End State

`/regulamin` i `/polityka-prywatnosci` są publiczne i podlinkowane (stopka, formularz kontaktowy,
rejestracja, Ustawienia). Nowe konto wymaga akceptacji, zapisanej z wersją i datą. Produkt zgadza
się z tekstem. Obecne konta dostały e-mail; regulamin wiąże je po 14 dniach.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Treść | Markdown w `src/content/legal/` + `LegalLayout` | Jedno źródło prawdy z czytelnym diffem; zgodne z README designu. |
| Akceptacja | Wymagany checkbox, `terms_version` + data w `user_metadata` | Ślad, kto zaakceptował którą wersję — przyda się przy zmianach i płatnościach. |
| Wejście w życie | Nowe konta od publikacji, obecne po 14 dniach od e-maila | Wydanie nie czeka, obecne konta mają czas na decyzję. |
| E-mail do obecnych kont | Ręcznie z `kontakt@temio.pl`, BCC | Przy tej skali 10 minut, bez kodu i ryzyka masowej wysyłki. |
| Historia logowań | Przełącznik Supabase + usunięcie wierszy przed merge'em | Polityka obiecuje ≤ 7 dni od pierwszej minuty. |
| Przegląd prawnika | Przy płatnościach (S-25/S-26) | Wtedy regulamin i tak jest przepisywany, a ryzyko finansowe realne. |

## Scope

**In scope:** dwie strony, linki, checkbox akceptacji z zapisem wersji, oznaczenie AI w plannerze,
poprawka FAQ, łącza w Ustawieniach, czynności produkcyjne i e-mail do obecnych kont.

**Out of scope:** cennik, zapis na cenę, płatności, ponowna akceptacja w aplikacji, archiwum wersji
na stronie, maszynowe oznaczanie treści AI, panel cookies.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Strony prawne | `/regulamin`, `/polityka-prywatnosci`, stopka, notka formularza | Tabele i spis treści na wąskim ekranie |
| 2. Akceptacja przy rejestracji | Checkbox, walidacja w trasie, metadane | Regres w przenoszeniu hasła z landingu |
| 3. Spójność produktu z tekstem | Oznaczenie AI, FAQ, Ustawienia | Tekst obiecuje coś, czego produkt nie robi |
| 4. Wydanie | Audit logi, daty, roadmapa, e-mail | Merge przed wyłączeniem audit logów |

**Prerequisites:** szkice z `drafts/` (gotowe), `CONTACT_TO` na `kontakt@temio.pl` (zrobione).
**Estimated effort:** ~2 sesje; Faza 4 to ~30 minut pracy w panelach + e-mail.

## Open Risks & Assumptions

- Tekst bez prawnika — ryzyko klauzul niedozwolonych przyjęte świadomie do czasu płatności.
- AI Act art. 50 ust. 2 (oznaczanie maszynowe) nierozstrzygnięty; okres przejściowy do 2 grudnia 2026.
- `user_metadata` jest edytowalne przez użytkownika — ślad akceptacji, nie dowód.

## Success Criteria (Summary)

- Odwiedzający bez konta czyta oba dokumenty ze stopki, na telefonie i desktopie.
- Bez akceptacji nie da się założyć konta.
- Każde zdanie o działaniu Temio w obu dokumentach jest prawdziwe w dniu publikacji.
