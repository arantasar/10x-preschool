# Wydruk miesiąca (PDF) — Plan Brief

> Full plan: `context/changes/month-print/plan.md`

## What & Why

`S-14` / FR-021: nauczyciel pobiera z `/plan/month` PDF z planem całego miesiąca, czytelny na papierze. Wydruk obejmuje każdy dzień roboczy miesiąca, a szkice i dni bez planu są oznaczone tym samym językiem co wydruk tygodnia (FR-020). Slice rozstrzyga PRD §Open Questions #8 (układ wydruku miesiąca).

## Starting Point

`S-13` dał silnik PDF w przeglądarce (`src/lib/week-pdf/`: model → układ → renderer pdf-lib z osadzonym Noto Sans) i przyciski w widoku tygodnia — ale nazwany i sparametryzowany pod tydzień. Widok miesiąca czyta dziś tylko podsumowania dni, bez aktywności; nie ma trasy HTTP czytającej wiele dni naraz, choć `readWeekPlans(dates)` przyjmuje dowolną listę dat.

## Desired End State

Na `/plan/month` dwa przyciski: **„siatka miesiąca"** (jedna kartka A4 poziomo — data, hasło, temat, bez aktywności; szkic = „SZKIC ROBOCZY" + przerywana ramka; legenda na dole) i **„tygodniami"** (układ „tydzień na stronie" z `S-13` dla każdego tygodnia, pełne opisy). Drukowane są wyłącznie dni robocze tego miesiąca; dni sąsiednich miesięcy to puste pola bez etykiety. Wydruk tygodnia działa identycznie jak przed slice'em.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Układ (Open Q #8) | Siatka + tygodniami, dwa przyciski | Pokrywa „przegląd na ścianę" i „pełna treść do oddania"; „tygodniami" to niemal czysty reuse `S-13`. |
| Odczyt treści | Nowy `GET /api/day-plan/month?month=` po kliknięciu, na `readWeekPlans` | Ładowanie strony bez zmian (Non-Goal o prefetchu), dane świeże, izolacja przez ten sam lejek i RLS. |
| Brzegi miesiąca | Tylko dni tego miesiąca; sąsiednie = puste pole bez etykiety | Dosłownie „każdy dzień roboczy miesiąca"; ten sam dzień nie drukuje się w dwóch miesiącach. |
| Przepełnienie komórki siatki | Dobór rozmiaru 10→7 pt, na progu ucięcie z „…" | Siatka zawsze na jednej kartce; pełna treść jest w „tygodniami". |
| Oznaczenie w komórce | „SZKIC ROBOCZY" + przerywana ramka + legenda; zaakceptowany bez etykiety | Ten sam język co tydzień (tekst + obrys, cz-b), mieści się w małej komórce. |
| Uogólnienie silnika | Najpierw faza refaktoru: `week-pdf/` → `plan-pdf/`, dokument z wierszy tygodni, wspólny komponent pobierania | Jeden silnik zamiast kopii (roadmap §Risk), z bramką regresji tygodnia przed nowym kodem. |
| Przyciski | Pod nawigacją miesiąca, ukryte przy `readFailed`, aktywne dla pustego miesiąca | Spójne z regułą tygodnia (każdy dzień, także bez planu). |

## Scope

**In scope:** uogólnienie silnika i komponentu pobierania; `workingDaysOfMonth`; trasa GET miesiąca + strażnik; model miesiąca i układ siatki; renderer i wyspa przycisków; ryzyko #12 + spec e2e; domknięcie S-14 i Open Q #8.

**Out of scope:** „dzień na stronę" dla miesiąca; PDF na serwerze; prefetch treści miesiąca; dni sąsiednich miesięcy i weekendy; zmiana nazwy `readWeekPlans`; `@media print`; keep-with-next tytułu (F9 z `S-13`); przycinanie fontów.

## Architecture / Approach

Wspólny model: `PrintDocument` = tytuł + wiersze tygodni po 5 slotów (`PrintDay | null`). Tydzień = jeden pełny wiersz; miesiąc = 4–6 wierszy z pustymi slotami na brzegach. Układy: `day-per-page` (spłaszczone dni), `week-per-page` (każdy wiersz osobno, własny rozmiar czcionki), nowy `month-grid` (jedna kartka). Renderer bez nowych typów elementów. Dane miesiąca: klik → `fetch` trasy → `isMonthPlansBody` → `buildPrintMonth` → dynamicznie ładowany `renderPlanPdf` → `<a download>`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Uogólnienie silnika | `plan-pdf/`, `PrintDocument`, `PdfDownloadControls`; tydzień bez zmian | Cicha regresja wydruku tygodnia — bramka na niezmienionych asercjach + e2e |
| 2. Odczyt miesiąca | `workingDaysOfMonth`, `GET /api/day-plan/month`, strażnik | Pierwszy odczyt szerszy niż tydzień — izolacja, zakres dat |
| 3. Model i siatka | `buildPrintMonth`, `grid-layout.ts`, testy fałszywą miarą | `null` vs `empty`; ucięcie wychodzące poza komórkę |
| 4. Renderer i przyciski | Wyspa na `/plan/month`, test renderowania | Tekst w PDF widzi tylko człowiek — obejrzenie pliku = warunek merge'a |
| 5. E2E i domknięcie | Ryzyko #12, `month-print.spec.ts`, roadmap/PRD | Kolizje danych równoległych speców w tym samym miesiącu |

**Prerequisites:** `S-13` done (jest). Gałąź feature przed pierwszym commitem (jesteśmy na `master`).
**Estimated effort:** ~3–4 sesje w 5 fazach; Faza 3 nadaje się do `/10x-tdd`.

## Open Risks & Assumptions

- Lekcja `S-13`: błędy renderowania tekstu są niewidoczne dla testów — Manual 4.7 jest bramką merge'a, nie formalnością.
- Rozmiar czcionki siatki przy typowym miesiącu nie jest znany przed pierwszym wydrukiem; próg 7 pt i lista kandydatów mogą wymagać korekty po wydruku na papierze.
- Założenie: dni robocze = pon–pt bez kalendarza świąt (święto drukuje się jako „Brak planu").
- Czcionka w „tygodniami" może różnić się między tygodniami (dobór per tydzień) — świadomy wybór na rzecz czytelności.

## Success Criteria (Summary)

- Nauczyciel pobiera z widoku miesiąca siatkę na jednej kartce i pełny plan tygodniami; oba czytelne na papierze, także cz-b.
- Każdy dzień roboczy miesiąca jest na wydruku; szkic i brak planu są jawnie oznaczone; nic spoza miesiąca ani z cudzego konta.
- Wydruk tygodnia działa dokładnie jak przed slice'em.
