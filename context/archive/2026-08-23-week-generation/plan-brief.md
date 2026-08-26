# S-03 `week-generation` — brief planu

> Pełny plan: `context/changes/week-generation/plan.md`

## What & Why

Nauczyciel wybiera tydzień, wpisuje **jedno** hasło i dostaje propozycje zajęć dla każdego dnia
roboczego — a regeneracja jednego dnia nie rusza pozostałych. To domyka US-01 w całości i przenosi
udowodniony przepływ dzienny na jednostkę pracy, którą nauczyciel faktycznie planuje. Trudność nie
leży w widoku tygodnia, tylko w rozdzieleniu jednego hasła na pięć **różnych** dni: pięć wywołań tego
samego hasła daje pięć wariantów tego samego pomysłu, nie tydzień zajęć.

## Starting Point

Cała mechanika dnia jest gotowa i nadaje się do ponownego użycia bez zmian strukturalnych: trasa
generowania, jedyny pisarz partii (`save_day_plan_generation`), trigger niezmiennika generacji,
edycja i akceptacja z S-02. `unique (user_id, plan_date)` sprawia, że pięć dni to pięć niezależnych
wierszy, więc izolacja regeneracji z AC US-01 wychodzi za darmo. Brakuje dwóch rzeczy: data nie trafia
do modelu (finding F4 z przeglądu S-01) i nie ma żadnego pojęcia tygodnia — ani w URL, ani w odczycie,
ani w UI.

## Desired End State

Nauczyciel wchodzi w miesiąc, klika tydzień, wpisuje „Dinozaury". Jedno tanie wywołanie układa łuk
tygodnia (temat na dzień), po czym pięć kart generuje się równolegle, każda z własnym wskaźnikiem.
Dzień, który padł, ma własny komunikat i własne **Ponów** — cztery pozostałe są już zapisane. Dzień,
który miał plan, jest pominięty i nietknięty. Jedno kliknięcie akceptuje gotowy tydzień. Wejście w
środę przez `/plan?date=` i regeneracja tego dnia zostawia cztery pozostałe dni i ich akceptacje
nienaruszone — a środa nadal zna swój temat.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Wsadowość generowania | Szkic tygodnia (1 wywołanie) + pięć wywołań dnia | Spójność tygodnia z wsadu, izolacja i postęp per dzień z S-01 | Plan |
| Orkiestracja | Wyspa odpala N żądań do istniejącej trasy dnia | Zero nowego kodu serwera; postęp i porażka izolowane per dzień | Plan |
| Różnicowanie dni | Temat ze szkicu + dzień tygodnia w promptcie | Zamyka Unknown #2 z roadmapy i finding F4 z S-01 | Plan |
| Trwałość tematu | Nowa kolumna `day_plans.theme` | Regeneracja dnia miesiąc później wciąż zna swoje miejsce w tygodniu | Plan |
| Równoległość | Pięć żądań naraz | Tydzień w czasie najwolniejszego dnia, nie w sumie pięciu | Plan |
| Dni z planem | Pomijane, nietknięte — reguła w schemacie (`U0002`) | Client-only guard był krytycznym findingiem F1 przeglądu S-02 | Plan |
| Porażka częściowa | Sukcesy zapisane, ponowienie punktowe i wyłącznie ręczne | Generator już ponawia raz w środku; drugie ponawianie przy 429 dokłada do pożaru | Plan |
| Limit kosztów | Brak — tylko widoczność | Roadmap OQ2 zostaje otwarte; brak danych, by wybrać próg | Plan |
| Bramka jakości | Pełny przebieg obu promptów przez trzy modele | `lessons.md` #3 — prompt jest jedyną warstwą bezpieczeństwa treści | Lessons |
| Ekran | Nowa strona `/plan/week` + siatka miesiąca `/plan/month` | `/plan` zostaje nietknięte razem z całym protokołem edycji z S-02 | Plan |

## Scope

**W zakresie:** szkic tygodnia jako drugi kontrakt modelu; kolumna `theme` i dwie nowe reguły w
istniejącym RPC; odczyt tygodnia i miesiąca; trasa szkicu; `theme` + `only_if_absent` w trasie dnia;
ekran tygodnia z postępem, ponowieniem i akceptacją całego tygodnia; siatka miesiąca jako punkt
wejścia; przebieg bramki jakości dla obu promptów.

**Poza zakresem:** edycja propozycji w widoku tygodnia (zostaje na `/plan?date=`), generowanie
weekendu, limit kosztów, wsadowy zapis wielu dni jedną transakcją, streaming, undo.

## Architecture / Approach

```
haslo + 5 dat  ──▶  POST /api/day-plan/week/outline  ──▶  5 tematow (nic nie zapisuje)
                                                              │
                    wyspa: Promise.allSettled                 ▼
      ┌──────────┬──────────┬──────────┬──────────┬──────────┐
      ▼          ▼          ▼          ▼          ▼
  POST /api/day-plan/generate  (haslo + temat + dzien tygodnia, only_if_absent)
      │          │          │          │          │
      └──────────┴────── save_day_plan_generation ┴──────────┘   ← jedyny pisarz partii
                          (theme, coalesce; U0002 gdy dzien zajety)
```

Regeneracja jednego dnia idzie tą samą trasą z `/plan?date=`, bez tematu — upsert zachowuje ten, który
już jest. Akceptacja tygodnia to pięć równoległych wywołań istniejącej trasy akceptacji, każde ze
swoim `expected_generation`.

## Phases at a Glance

| Faza | Co dostarcza | Główne ryzyko |
| --- | --- | --- |
| 1. Schemat | Kolumna `theme`, `p_require_absent`, grant kolumnowy, pgTAP | Brak `grant update (theme)` = 42501 po opłaconym wywołaniu modelu |
| 2. Kontrakt szkicu | Prompt + schemat + zod + `generateWeekOutline`; temat w promptcie dnia | Zmiana promptu dnia może cofnąć bezpieczeństwo treści |
| 3. Bramka jakości | Przebieg obu promptów przez trzy modele + `model-comparison.md` | Któryś dopuszczony model zawodzi → decyzja o zawężeniu listy |
| 4. Dane i trasy | Odczyt tygodnia/miesiąca, trasa szkicu, `theme` + `only_if_absent` | Kontrakt drutu musi być bezpieczny dla starszego klienta |
| 5. Ekran tygodnia | `/plan/week`, pięć kart, ponowienie, akceptacja tygodnia | Blokada współbieżności per dzień, nie globalna |
| 6. Siatka miesiąca | `/plan/month` jako punkt wejścia | Granice miesiąca i roku |

**Prerequisites:** lokalny stack Supabase (`.dev.vars` wskazuje na lokalny — notka z S-02),
`OPENROUTER_API_KEY` z budżetem na przebieg bramki (3 modele × 5 haseł × 2 prompty), feature branch —
S-03 jest pierwszym slice'em objętym regułą z `CLAUDE.md`.

**Estimated effort:** ~4–6 sesji na sześć faz; Faza 5 jest największa, Faza 3 jest najdłuższa w czasie
zegarowym z powodu realnych wywołań modeli.

## Open Risks & Assumptions

- **Temat dnia, który padł, nie przeżywa odświeżenia** — wiersz powstaje dopiero przy udanym zapisie.
  Ponowienie po przeładowaniu idzie z samego hasła; wyspa mówi to wprost zamiast po cichu wypaść z łuku.
- **Pięć równoległych wywołań łatwiej wpada w 429** niż jedno. Mitygacja jest w istniejącym generatorze
  (jedno ponowienie z backoffem); wyspa świadomie nie dokłada drugiego. Jeśli 429 okaże się częste,
  wracają okno współbieżności 2–3 albo sekwencyjność.
- **Koszt tygodnia to sześć wywołań** i nic go nie ogranicza. Roadmap OQ2 zostaje otwarte świadomie —
  ten slice dokłada dane (`cost` w logu), na których można będzie oprzeć próg.
- **Siatka miesiąca jest najsłabiej związana z outcome S-03** (roadmapa mówi o tygodniu). Wchodzi na
  wyraźną decyzję; jeśli slice się rozjedzie, to pierwszy kandydat do wycięcia jako osobna zmiana.
- **Hosted project nadal nie ma żadnej migracji** — warunek wdrożenia, nie implementacji.

## Success Criteria (Summary)

- Nauczyciel generuje z jednego hasła pięć dni roboczych, wyraźnie różniących się między sobą
- Regeneracja jednego dnia nie zmienia pozostałych ani ich akceptacji (AC US-01)
- Jedna porażka nie kosztuje pozostałych czterech dni; ponowienie jest punktowe
- Żadna propozycja z bramki jakości nie zawiera treści nieodpowiedniej dla dzieci 3–6 lat
