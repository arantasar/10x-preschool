# Polecenie dla modelu przy aktywności — Plan Brief

> Full plan: `context/changes/follow-up-questions/plan.md`
> Frame brief: `context/changes/follow-up-questions/frame.md`
> Research: `context/changes/follow-up-questions/research.md`

## What & Why

Między regeneracją całego dnia (FR-007) a ręczną edycją (FR-008) nie ma sposobu,
żeby poprawić jedną aktywność. Z ramy: *„nie ma drogi do poprawienia jednej
aktywności pomiędzy regeneracją całego dnia a ręczną edycją"* — to problem (b),
który ten plan rozwiązuje. Problem (a), czyli generator, który systematycznie nie
dostarcza tekstów piosenek, zostaje osobną pozycją do `/10x-shape`.

## Starting Point

Edytor dnia ma już szkic aktywności z Zapisz/Anuluj, confirm przy dniu
zaakceptowanym i baner „Akceptuj ponownie". Generator ma dwa punkty wejścia na
wspólnym, prywatnym transporcie OpenRouter, a `week/day.ts` pokazuje wzorzec
route'u, który zwraca propozycję bez zapisu. Bramka bezpieczeństwa jest zawieszona
od 2026-09-19 i nie umie ocenić pojedynczej aktywności.

## Desired End State

Przy każdej aktywności jest „Zapytaj model". Nauczyciel wpisuje polecenie
(„dopisz słowa piosenki", „zamień na zabawę ruchową"), a szkic tej aktywności
wypełnia się poprawionym tytułem i opisem z adnotacją „sprawdź przed zapisem".
Można dopisać kolejne polecenie do niezapisanego wyniku. Zapis i Anuluj działają
jak dziś.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Zakres | Tylko (b): narzędzie dopasowania | (a) to kontrakt generowania, zaparkowany do `/10x-shape` | Frame |
| Zapis | Propozycja → szkic → istniejący PATCH | Podgląd przed nieodwracalnym nadpisaniem, confirm i baner akceptacji za darmo | Plan |
| Pola | Tytuł i opis | „Zamień na zabawę ruchową" musi móc zmienić tytuł; nauczyciel i tak widzi szkic | Plan |
| Limit | Model mieści się w 4000 znaków; nadmiar → czytelny komunikat | Bez migracji; dłuższe teksty to sprawa (a) | Plan |
| Bezpieczeństwo | Tylko prompt; bramka rozszerzona o tryb `activity`, **bez przebiegu przed merge'em** | Decyzja właściciela: koszt; świadomie wbrew lessons.md §3 | Plan |
| Prawa autorskie | Wyłącznie tekst własny, także przy nazwanym utworze | Bez ryzyka prawnego i halucynowanych „oryginałów" | Plan |
| Injection | Polecenie jednoliniowe (`singleLineText`); tytuł/opis w odgrodzonym bloku danych | Opis mógł być ręcznie edytowany i może fałszować linie | Research |
| Transport | Trzeci punkt wejścia w `activity-generator.ts` | Wzorzec modułu, bez refaktoru | Research |

## Scope

**In scope:** prompt + schemat + `refineActivity`; `POST /api/day-plan/refine`
(bez zapisu); pole polecenia i „Zapytaj model" w edytorze dnia; tryb `activity`
w bramce (zawieszony); wpisy w roadmapie (slice + problem (a)) i ślad w
`gate-suspension.ts`.

**Out of scope:** zmiana `day-plan.pl.md`; migracje i podniesienie limitu;
sędzia w runtime; przebieg bramki; limity wywołań; tydzień/miesiąc/podgląd;
streaming, historia poleceń, undo; test e2e.

## Architecture / Approach

`ActivityEditor` (szkic) → `POST /api/day-plan/refine {title, description,
instruction}` → `refineActivity` (prompt `refine-activity.pl.md`, schemat jednej
pary, zod) → `200 {title, description}` → szkic → „Zapisz" → istniejący
`PATCH /api/day-plan/activity/[id]`. Nowa ścieżka niczego nie zapisuje, więc
zapis, akceptacja, trigger i baner zostają bez zmian. W wyspie jest osobna funkcja
`refine` obok `mutate` (odpowiedź nie jest planem, po błędzie bez `reconcile`)
i nowe `busy: "refining"`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Kontrakt i generator | `refineActivity` z promptem, schematem, zod i testami | Kopia sekcji Odbiorca rozjedzie się z `day-plan.pl.md` (test dryfu) |
| 2. Route | `POST /api/day-plan/refine`, bez zapisu, z testami | Komunikat o długości zgubiony w ogólnym `invalid` |
| 3. Edytor dnia | „Zapytaj model", pole polecenia, iteracja na szkicu | Wynik trafia do niewłaściwego szkicu / blokady `busy` |
| 4. Bramka i zapis decyzji | Tryb `activity` w bramce (zawieszony), roadmapa, ślad ryzyka | Tryb nigdy nie zostanie uruchomiony |

**Prerequisites:** gałąź `feat/follow-up-questions` przed pierwszym commitem; klucz OpenRouter w `.dev.vars` do testów ręcznych.
**Estimated effort:** ~2–3 sesje, 4 fazy.

## Open Risks & Assumptions

- **Merge bez oceny bramki.** Prompt, który z założenia wykonuje polecenia
  nauczyciela, trafia na produkcję (merge = release) oceniony tylko ręcznie
  (Manual Testing Step 5). Łamie lessons.md §3 — decyzja właściciela, zapisana
  w `gate-suspension.ts` i roadmapie.
- Ciche przekierowanie przy poleceniach spoza zakresu może zwracać aktywność bez
  zmian; komunikat „bez zmian" łagodzi, ale nie wyjaśnia dlaczego.
- Brak limitu wywołań: polecenie jest najtańszym wejściem do LLM w aplikacji
  (Open Roadmap Questions #5).
- Jeśli (a) nie zostanie podjęte, nauczyciel nadal będzie codziennie prosił
  o teksty — polecenie łagodzi objaw, nie usuwa przyczyny.

## Success Criteria (Summary)

- Nauczyciel poprawia jedną aktywność poleceniem i zapisuje wynik bez regeneracji dnia i bez przepisywania ręcznie.
- Nic nie zostaje zapisane bez kliknięcia „Zapisz"; akceptacja zachowuje się jak przy ręcznej edycji.
- Teksty utworów są własne, po polsku, bez odmów; za długi wynik daje zrozumiały komunikat.
