# S-01 `first-day-generation` — Plan Brief

> Pełny plan: `context/changes/first-day-generation/plan.md`
> Research gotowości: `context/changes/first-day-generation/research.md`
> Research modelu: `context/changes/first-day-generation/llm-model-research.md`
> Referencja API: `context/foundation/openrouter-api.md`

## What & Why

Nauczyciel loguje się, wybiera dzień, wpisuje hasło (np. „Andrzejki") i dostaje trzy gotowe
propozycje aktywności po polsku, bezpieczne dla dzieci 3–6 lat. To gwiazda przewodnia roadmapy —
najmniejszy przepływ end-to-end, który rozstrzyga główną hipotezę produktu: **czy LLM jest
wystarczająco dobry dla tej niszy**. Reszta roadmapy ma sens tylko wtedy, gdy ten przepływ się obroni.

## Starting Point

Auth działa (Supabase SSR + middleware), F-01 wdrożyło schemat bazy z RLS, a `src/types.ts:67-75`
niesie już gotowy kontrakt wyjścia (`ActivityDraft` = `title` + `description`). Nie ma natomiast
żadnej trasy domenowej, katalogu `src/lib/services/`, ani jednego użycia `zod` w repo (mimo że
CLAUDE.md go nakazuje), ani sekretu poza Supabase. Prompt systemowy — jedyny guardrail
bezpieczeństwa treści w tym slice — nie istnieje nigdzie.

## Desired End State

Zalogowany nauczyciel wchodzi na `/plan`, wybiera datę, wpisuje hasło i przez 10–30 sekund widzi
zmieniające się etapy oraz upływający licznik czasu. Dostaje trzy propozycje (tytuł + opis w 2–4
zdaniach) i przycisk „Generuj ponownie". Przy awarii dostaje komunikat po polsku, który mówi mu,
czy ponowna próba ma sens. Wybór modelu jest udokumentowany dowodem z porównania, nie rekomendacją.

## Key Decisions Made

| Decyzja                          | Wybór                                             | Dlaczego                                                                                       | Źródło   |
| -------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------- |
| Persystencja                     | Efemeryczny — zero zapisu do bazy                 | S-01 dowodzi jakości LLM, nie zapisu; zapis wciągnąłby zobowiązanie triggera przypisane S-02     | Plan     |
| Dostawca LLM                     | OpenRouter, `fetch` bez SDK                       | Rozstrzygnięte w roadmapie; `fetch` jest natywny w workerd, zero ryzyka niekompatybilności       | Roadmap  |
| Model domyślny                   | `google/gemini-3.7-flash`, w zmiennej środowiskowej | Najmocniejsze dowody na polszczyznę (PLCC); zmienna pozwala przełączyć bez deployu              | Research |
| Wybór modelu                     | Rozstrzyga porównanie w Fazie 5, nie research      | Benchmarki mówią o polszczyźnie ogólnej, nie o tym, co zrobić z pięciolatkiem w sali            | Plan     |
| Prompt systemowy                 | Osobny plik `.md` (`?raw`) + JSON Schema `.json`   | Guardrail ma mieć czytelne diffy, a skrypt porównawczy dzieli z produkcją jedno źródło prawdy   | Plan     |
| Kryterium odbioru promptu        | 5 haseł: 0 wpadek wieku + ≥75% akceptowalnych      | Kryterium z PRD; bez momentu odbioru guardrail wróciłby jako incydent, nie jako zadanie          | Plan     |
| Liczba propozycji                | Sztywno 3                                          | Przewidywalny layout i stały mianownik przy ocenie akceptacji                                    | Plan     |
| Wskaźnik postępu                 | Etapy + upływający licznik czasu                   | NFR wymaga „ciągłego" postępu; przy 30 s nieruchomy spinner czyta się jak zawieszenie            | Plan     |
| Obsługa błędów                   | 3 kategorie + 1 auto-retry dla przejściowych       | Nauczyciel musi wiedzieć, czy klikać ponownie; 402 i 429 nie mogą wyglądać identycznie           | Plan     |
| Uwierzytelnienie trasy API       | Własne sprawdzenie → 401 JSON                      | Middleware zwraca 302 z HTML-em logowania — wyspa dostałaby stronę zamiast odpowiedzi            | Plan     |
| Granice walidacji                | Dostrojone do CHECK-ów z F-01                      | Inaczej 300-znakowy tytuł wywróciłby się dopiero w S-02, na innym commicie                       | Plan     |
| Wybór dnia                       | Natywny `<input type="date">`                      | Jeden dzień, jedno pole — bez `react-day-picker` i biblioteki dat                                | Research |
| Sekrety                          | `optional: true`, wzorzec Supabase                 | Build w CI nie zyskuje nowej zależności operacyjnej; brak klucza to komunikat, nie wyjątek       | Research |
| Streaming                        | Poza zakresem                                      | Decyzja UX, nie mitygacja limitu CPU; niekompatybilny z „zwaliduj całość przed pokazaniem"       | Roadmap  |
| Polonizacja istniejącego UI      | Poza S-01                                          | Nowy UI po polsku; retrofit auth/dashboard rozmyłby gwiazdę przewodnią — zapisany jako dług      | Plan     |

## Scope

**W zakresie:** trasa `POST /api/day-plan/generate`; serwis OpenRoutera z taksonomią błędów,
auto-retry i wykryciem awarii częściowej; prompt systemowy + JSON Schema + walidacja zodem;
strona `/plan` z wyborem dnia, hasłem, wskaźnikiem postępu i regeneracją; deklaracja sekretów;
porównanie trzech modeli na pięciu hasłach z zapisaną decyzją.

**Poza zakresem:** jakikolwiek zapis do bazy; trigger i protokół regeneracji (S-02); edycja
i akceptacja (S-02); widok tygodnia (S-03); streaming; post-filtr treści; limit regeneracji;
retrofit polskiego w auth i dashboard; testy automatyczne (Moduł 3).

## Architecture / Approach

```
/plan (Astro, chroniona)
  └─ GenerateDayPlanForm (wyspa React) ── POST ──▶ /api/day-plan/generate
       └─ GenerationProgress (etapy + czas)          │  auth → zod → serwis
                                                      ▼
                                          activity-generator.ts
                                          fetch ─▶ OpenRouter
                                          ├─ provider: require_parameters + data_collection: deny
                                          ├─ response_format: json_schema (strict)
                                          ├─ sprawdź finish_reason PRZED JSON.parse
                                          ├─ 1× retry (tylko transient)
                                          └─ zod → ActivityDraft[]  + log usage.cost/model
                                                      ▲
                          day-plan.pl.md (?raw) ──────┘
                          day-plan.schema.json ───────┴──▶ czytane też przez scripts/compare-models.sh
```

Kontrakt najpierw, potem serwis, trasa, UI, na końcu bramka jakości. Prompt i schemat jako osobne
pliki to decyzja architektoniczna, nie kosmetyczna: dzięki niej test modeli i produkcja nie mogą się
rozjechać.

## Phases at a Glance

| Faza                                 | Co dostarcza                                              | Główne ryzyko                                                             |
| ------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1. Konfiguracja i kontrakt           | `zod`, sekrety, prompt, JSON Schema, walidacja z granicami | Prompt jest jedynym guardrailem — słaby prompt psuje cały slice           |
| 2. Serwis generowania                | Funkcja nad `fetch` z obsługą awarii i retry               | Awaria częściowa przy 200 przeoczona → pusty ekran bez śladu w logu       |
| 3. Trasa API                         | `POST` z 401 JSON i walidacją wejścia                      | Poleganie na middleware dałoby 302 z HTML-em zamiast czytelnego błędu     |
| 4. Interfejs `/plan`                 | Pełny przepływ end-to-end dla nauczyciela                  | Wskaźnik postępu nieuwzględniający retry czyta się jak zawieszenie        |
| 5. Bramka jakości                    | Porównanie 3 modeli, wybór, odbiór promptu                 | Żaden model nie spełnia kryterium → rewizja decyzji „bez post-filtra"     |

**Prerequisites:** konto OpenRouter **z doładowanymi kredytami** (402 jest nie do naprawienia
ponowną próbą) i `OPENROUTER_API_KEY` w `.dev.vars` — wymagane przed Fazą 2, nie przed Fazą 1.
Sekret w CI niepotrzebny (pola opcjonalne).

**Estimated effort:** ~3–4 sesje. Fazy 1–3 to praca wykonawcza; Faza 4 to największy pojedynczy
kawałek UI; Faza 5 to ~15 wywołań za kilka centów plus ocena ręczna, potencjalnie z iteracjami promptu.

## Open Risks & Assumptions

- **Guardrail wieku nie ma drugiej warstwy.** Decyzja roadmapowa „bez post-filtra w MVP" oznacza,
  że wpadkę modelu łapie wyłącznie prompt. Faza 5 jest jedynym momentem, w którym to sprawdzamy —
  i jawnym warunkiem rewizji tej decyzji, jeśli kryterium padnie.
- **„≥ 75% akceptowanych" to ocena ręczna na 15 propozycjach, nie metryka produktu.** S-01 jest
  efemeryczny, więc nie ma czym mierzyć akceptacji; ta wejdzie z FR-009 w S-02.
- **Pięć haseł to mała próba** — nie wykryje rzadkiej wpadki wieku.
- **Cena Gemini 3.7 Flash jest promocyjna** ($0,375/$1,875 wobec listowych $1,50/$7,50). Nieistotne
  w skali MVP, ale kalkulacja nie powinna się na niej opierać.
- **NFR „cały interfejs po polsku" pozostaje naruszony** poza `/plan` — świadomy dług do osobnej zmiany.
- **Propozycja nie przeżywa odświeżenia strony** — konsekwencja efemeryczności, znika z S-02.
- **`roadmap.md` i `tech-stack.md` niosą nieaktualne tezy** (F-01 jako `ready`, „Data: absent",
  limit wall-time Workers). Poza zakresem S-01, ale agent czytający je jako źródło prawdy dostanie
  fałszywy obraz.

## Success Criteria (Summary)

- Nauczyciel przechodzi pełną ścieżkę — logowanie → dzień → hasło → trzy propozycje po polsku —
  z widocznym postępem przez cały czas operacji i możliwością regeneracji.
- Zero treści nieodpowiednich dla dzieci 3–6 lat na zestawie testowym; co najmniej 75% propozycji
  akceptowalnych bez edycji, z wynikiem zapisanym w `model-comparison.md`.
- Każda awaria kończy się komunikatem po polsku, który mówi nauczycielowi, czy ponowna próba ma sens
  — a nie pustym ekranem.
