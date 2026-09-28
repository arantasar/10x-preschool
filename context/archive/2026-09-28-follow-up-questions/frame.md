# Frame Brief: Polecenie dla modelu przy aktywności

> Krok ramowania przed /10x-plan. Dokument oddziela to, o co *faktycznie*
> chodzi, od tego, co założono na starcie.

## Reported Observation

W widoku dnia nauczyciel patrzy na wygenerowaną aktywność (np. „zaśpiewajcie
piosenkę") i nie ma w niej wszystkiego, czego potrzebuje, żeby ją przeprowadzić —
przykład z [change.md](change.md): słów piosenki. Nie ma dziś drogi, żeby to
dostać od aplikacji, poza ręcznym dopisaniem albo regeneracją całego dnia.

## Initial Framing (preserved)

- **User's stated cause or approach**: brakuje treści w konkretnej aktywności,
  a model, który ją napisał, może ją uzupełnić na prośbę, bo zna jej szczegóły.
- **User's proposed direction**: pole polecenia przy każdej aktywności; model
  dostaje aktywność + polecenie nauczyciela i sam edytuje/dopisuje pole (np. słowa
  piosenki do opisu).
- **Pre-dispatch narrowing**: dwie obserwacje, obie **równie ważne** — (a) brak
  treści potrzebnej do przeprowadzenia zajęć (piosenka, wierszyk, opowiadanie),
  (b) aktywność wymaga dopasowania, a regeneracja całego dnia to przesada.
  Źródło: **realne użycie aplikacji**. Przypadek piosenki: **zależy** — czasem
  konkretna znana piosenka, czasem dowolna na temat.

## Dimension Map

1. **Kontrakt generowania** — prompt dnia każe pisać opis w 2–4 zdaniach i
   jednocześnie obiecuje, że da się z nim przeprowadzić zajęcia „bez dopytywania".
   Przy aktywności opartej na tekście obie rzeczy naraz nie są możliwe.
2. **Ziarnistość poprawek** — między „regeneruj cały dzień" (FR-007) a „edytuj
   ręcznie" (FR-008) nie ma nic. ← initial framing
3. **Znana piosenka vs dowolna** — przy nazwanej istniejącej piosence model
   musiałby odtworzyć prawdziwy tekst (wierność, prawa autorskie).
4. **Zakres produktu** — non-goal „tylko tytuł i opis" i zaparkowana „zmiana
   wytycznych generowania". Pokryte przez [research.md](research.md) §Historical
   Context; nie badane ponownie.

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| 1: brak treści rodzi się w kontrakcie generowania | [day-plan.pl.md:33](../../../src/lib/services/prompts/day-plan.pl.md#L33) „od 2 do 4 zdań" vs [:36](../../../src/lib/services/prompts/day-plan.pl.md#L36) „bez dopytywania"; prompt nigdzie nie prosi o tekst piosenki/wierszyka. Próbka 222 aktywności (84 zapisane odpowiedzi modeli w `archive/2026-08-2{2,3}-*/model-outputs/` + 15 wierszy lokalnej bazy): 15 wymaga tekstu, **12 bez tekstu, 2 z fragmentem, 1 z pełnym**. Mediana opisu 363 znaki (limit 4000). Uzasadnienia „2–4 zdań" brak w całym `context/` — wymóg pojawia się bez powodu ([openrouter-api.md:96](../../foundation/openrouter-api.md#L96), [first-day-generation/plan.md:52](../../archive/2026-08-22-first-day-generation/plan.md#L52)). Tydzień idzie przez ten sam prompt ([week/day.ts:74](../../../src/pages/api/day-plan/week/day.ts#L74)). | STRONG |
| 2: brak drogi do poprawki jednej aktywności | [DayPlanEditor.tsx:701-706](../../../src/components/plan/DayPlanEditor.tsx#L701-L706) — przy aktywności tylko „Edytuj"; regeneracja wyłącznie całego dnia (`api/day-plan/generate.ts`). W `context/` ani w commitach brak wcześniejszej dyskusji o regeneracji pojedynczej aktywności. | STRONG |
| 3: przypadek znanej piosenki dominuje | 1 z 15 nazywa konkretny utwór („Moja mama" na melodię „Panie Janie", bez słów); 14 to „piosenka o X", „wierszyk o mamie" — model pisałby tekst własny. Rubryka nie mówi nic o tekstach utworów ani prawach autorskich ([content-safety-rubric.pl.md:53-54](../../../src/lib/services/prompts/content-safety-rubric.pl.md#L53-L54) — tylko marki i postacie). | WEAK (rzadki, ale realny) |

## Narrowing Signals

- **Częstotliwość: „prawie każdego dnia".** Brak treści nie jest wyjątkiem, który
  nauczyciel łata raz na jakiś czas — to stała właściwość wygenerowanego planu,
  zgodna z próbką (12/15).
- **Pozycja: „od razu w aktywności".** Nauczyciel chce tekstu w opisie od początku;
  dopytywanie jest dodatkowym krokiem, nie pożądanym przepływem.
- **Kontrprzykład odwrotny:** jedyny pełny tekst pochodzi z DeepSeeka — modelu,
  który regularnie łamie limit 2–4 zdań ([model-comparison.md:114-116](../../archive/2026-08-22-first-day-generation/model-comparison.md#L114-L116)).
  Treść pojawia się dokładnie wtedy, gdy model wychodzi poza kontrakt.

## Cross-System Convention

Brak wcześniejszych wystąpień w `context/` i historii commitów — nikt nie zgłaszał
za krótkich opisów (jedyna skarga dotyczyła za długich). Konwencja projektu dla
zmian w jakości generowania: [roadmap.md:245](../../foundation/roadmap.md#L245)
i [prd-v2.md:374-375](../../foundation/prd-v2.md#L374-L375) parkują „zmianę
wytycznych generowania" do osobnej sesji `/10x-shape`. Pole polecenia omija tę
konwencję — przenosi naprawę kontraktu na nauczyciela, jedno wywołanie na raz.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: dwa różne problemy sklejone w jeden
> mechanizm — (a) generator systematycznie nie dostarcza tekstu, od którego zależy
> aktywność, bo kontrakt promptu tego nie wymaga i limituje opis do 2–4 zdań;
> (b) nie ma drogi do poprawienia jednej aktywności pomiędzy regeneracją całego
> dnia a ręczną edycją.

Framing był trafny dla (b): pole polecenia przy aktywności odpowiada dokładnie
temu brakowi. Dla (a) jest łatką — nauczyciel codziennie prosiłby o coś, co chce
mieć od razu, a każdy plan (dzień, tydzień, wydruk) nadal wychodziłby bez tekstu.
Naprawa (a) leży w kontrakcie generowania, czyli w obszarze, który roadmapa jawnie
zaparkowała do `/10x-shape`; (b) mieści się w obecnym kamieniu jako nowa zdolność
edytora.

## Confidence

- **HIGH** — silne dowody w kodzie i próbce, zgodność z konwencją projektu,
  dwa rozstrzygające sygnały od właściciela (częstotliwość, pozycja).

Otwarte, ale nie podważające ramy: udział znanych utworów (1/15) jest mały w
próbce, a „zależy" w realnym użyciu — decyzja o tekstach istniejących piosenek
(wierność, prawa autorskie) zostaje produktowa, dla obu ścieżek.

## What Changes for /10x-plan

Plan tej zmiany powinien dotyczyć (b) — polecenia dla jednej aktywności jako
narzędzia *dopasowania* — i nie być mierzony tym, czy dostarcza słowa piosenek.
(a) to osobna pozycja: zmiana kontraktu `day-plan.pl.md` (tekst w opisie,
limit długości), wymagająca odparkowania „zmiany wytycznych generowania" przez
`/10x-shape` i — zgodnie z [lessons.md](../../foundation/lessons.md) §3 —
przebiegu bramki bezpieczeństwa dla każdego dozwolonego modelu. Kolejność obu
pozycji jest decyzją właściciela, nie tego dokumentu.

## References

- Source files: `src/lib/services/prompts/day-plan.pl.md:33,36,39-40`,
  `src/lib/services/prompts/day-plan.schema.json` (`opis`),
  `src/components/plan/DayPlanEditor.tsx:701-706`,
  `src/pages/api/day-plan/week/day.ts:74`,
  `src/lib/services/prompts/content-safety-rubric.pl.md:53-54`
- Próbka: `context/archive/2026-08-22-first-day-generation/model-outputs/`,
  `context/archive/2026-08-23-week-generation/model-outputs/`
  (m.in. `openai_gpt-5.6-luna__trudne__d1.json:13`,
  `deepseek_deepseek-v4-flash__trudne.json:8`,
  `deepseek_deepseek-v4-flash__trudne__d5.json:8`)
- Related research: `context/changes/follow-up-questions/research.md`
- Investigation tasks: próbka wygenerowanych aktywności (wymiar 1),
  wcześniejsze wystąpienia + przypadek znanej piosenki (wymiary 1, 3)
