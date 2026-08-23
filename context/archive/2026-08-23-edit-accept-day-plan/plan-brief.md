# S-02 `edit-accept-day-plan` — Plan Brief

> Full plan: `context/changes/edit-accept-day-plan/plan.md`
> Roadmap slice: `context/foundation/roadmap.md` § S-02

## What & Why

Nauczyciel może edytować treść wygenerowanej propozycji, jawnie ją zaakceptować, a zatwierdzony plan
dnia zostaje zapisany i jest prywatny dla jego konta (FR-008, FR-009). To domknięcie pętli „keep":
bez tego generowanie jest demem, nie narzędziem — propozycje znikają przy odświeżeniu strony.

## Starting Point

F-01 zbudowało schemat (`day_plans`, `activities`, RLS, wąskie granty kolumnowe) i dowiodło izolacji
kont — pgTAP 23/23. S-01 zbudowało generowanie, które **nie zapisuje nic**: wyspa React jest stanem
generacji, a UI wprost obiecuje nauczycielowi, że propozycje znikną po odświeżeniu. Żaden moduł poza
`src/lib/supabase.ts` nie dotyka dziś bazy. S-02 jest pierwszym pisarzem.

## Desired End State

`/plan?date=2026-09-14` renderuje po stronie serwera zapisany plan dnia albo pusty formularz.
Generowanie zapisuje plan i trzy propozycje jednym atomowym zapisem. Nauczyciel poprawia pojedynczą
propozycję (Zapisz / Anuluj) — plan wraca do stanu roboczego. Akceptuje. Odświeża — wszystko jest na
miejscu. Regeneruje za potwierdzeniem — stara partia znika, akceptacja się kasuje, licznik rośnie.

## Key Decisions Made

| Decyzja | Wybór | Dlaczego | Źródło |
| --- | --- | --- | --- |
| Moment zapisu | Przy generowaniu | Nauczyciel nie traci pracy przy odświeżeniu; `current_generation` dostaje realną partię do nadpisania | Plan |
| Niezmiennik generacji | Trigger `BEFORE INSERT` + funkcja przypisuje `generation` | Zły stan niereprezentowalny niezależnie od wołającego; żaden kod nie podaje tej liczby | Roadmap (zobowiązanie z F-01) |
| Atomowość regeneracji | Funkcja Postgresa (RPC), `security invoker` | PostgREST nie daje transakcji klientowi; RLS i granty działają dokładnie tak, jak dowodzi ich pgTAP | Plan |
| Retencja | Stara partia usuwana w tym samym zapisie | Daje regule #2 z `lessons.md` właściciela — sprzątanie ma commit i test, nie notatkę na później | Plan |
| Protokół edycji | Jawny Zapisz na jedną propozycję | Anuluj jest realną furtką; autozapis nie ma czego cofnąć | Plan |
| Edycja po akceptacji | Cofa do stanu roboczego (trigger) | `accepted_at` znaczy dokładnie jedno: „nauczyciel zatwierdził **ten** tekst" | Plan |
| Regeneracja zaakceptowanego | Kasuje akceptację, po potwierdzeniu | Ten klik jest nieodwracalny, bo stara partia jest usuwana | Plan |
| Otwarcie dnia | SSR na `/plan?date=…` | Zapisany plan w pierwszym renderze; URL identyfikuje dzień | Plan |
| Hasło przy regeneracji | Edytowalne, nadpisywane | `prompt` zawsze opisuje partię, która jest na ekranie | Plan |
| Awaria zapisu | Jedno ponowienie, potem czysty błąd | Pokrywa realny przypadek za grosze; nie wskrzesza stanu „propozycja bez wiersza" | Plan |
| Widok listy / kalendarza | Poza zakresem | FR-004 i widok wielodniowy należą do S-03 | Roadmap |
| Weryfikacja | pgTAP, bez runnera TS | Każda cicha awaria tego slice'u mieszka w bazie; strategia testowania to Moduł 3 | Plan |

## Scope

**W zakresie:** migracja z triggerami i funkcją zapisu · regeneracja typów · pakiet pgTAP dowodzący
niezmiennika, atomowości i retencji · serwis dostępu do danych · zapis w trasie generowania · trasy
edycji i akceptacji · SSR strony `/plan` · przepisanie wyspy na edytor.

**Poza zakresem:** undo · widok listy i kalendarza · usuwanie planu · runner testów TS/React ·
zmiany promptu lub modelu · limit regeneracji · tłumaczenie `dashboard.astro`.

## Architecture / Approach

Baza jest jedynym źródłem prawdy o planie, a niezmienniki mieszkają w schemacie, nie w TypeScripcie —
kontynuacja linii F-01, gdzie własność wymusza złożony klucz obcy, a nie kod aplikacji.

```
przeglądarka → /plan (SSR: readDayPlan) → props wyspy
wyspa → POST /api/day-plan/generate → OpenRouter → save_day_plan_generation() [1 transakcja]
                                                    ├ upsert planu (+blokada wiersza, bump, accepted_at = null)
                                                    ├ delete starych generacji
                                                    └ insert partii  ──trigger──> generation == current_generation?
wyspa → PATCH /api/day-plan/activity/[id] → update ──trigger──> accepted_at = null
wyspa → POST  /api/day-plan/accept        → update accepted_at
```

## Phases at a Glance

| Faza | Co dostarcza | Główne ryzyko |
| --- | --- | --- |
| 1. Kontrakt zapisu w schemacie | Triggery, funkcja zapisu, typy, dowód pgTAP | Jedyna faza, w której niezmiennik da się zmienić tanio — asercje muszą być sprawdzone mutacją, inaczej powtórzymy jałowe testy F-01 |
| 2. Dostęp do danych + zapis w generowaniu | `day-plan-store.ts`, trasa zapisuje, klient w `locals` | Pierwszy moduł dotykający Supabase — ustanawia wzorzec dla całego projektu |
| 3. Trasy edycji i akceptacji | `PATCH` aktywności, `POST` akceptacji | Niskie; koperta błędów i walidacja idą wzorcem S-01 |
| 4. Ekran planu dnia | SSR `/plan?date=…`, wyspa jako edytor | Największy pojedynczy kawałek i jedyny bez siatki regresyjnej |

**Prerequisites:** S-01 i F-01 zarchiwizowane (spełnione) · lokalny Supabase (`npx supabase start`) ·
**trzy migracje F-01 (`20260720162247`, `20260720162553`, `20260720163134`) wypchnięte na hosted
project** — dziś są tylko lokalne.

**Estimated effort:** ~3–4 sesje, cztery fazy z ręczną bramką po każdej z trzech pierwszych.

## Open Risks & Assumptions

- **Maszyna stanów wyspy nie ma testów.** Roboczy / edycja / zaakceptowany to najczęściej dotykany
  kod tej zmiany i jedyny bez siatki regresyjnej. Świadoma decyzja; S-03 będzie na nim budować.
- **Trigger cofający akceptację pisze do innej tabeli.** Elegancko domyka regułę, ale efekt uboczny
  w triggerze jest mniej oczywisty niż jawne wywołanie w serwisie. Mitygacja: komentarz w migracji
  plus asercja pgTAP w obie strony (zmiana treści kasuje, zmiana `ordinal` nie).
- **Nic nie broni akceptacji planu bez aktywności.** Przycisk nie pojawia się w UI, ale trasa go nie
  blokuje. Przyjęte świadomie — bez wiersza do wyświetlenia stan i tak nie jest szkodliwy.
- **Zaległe migracje F-01.** Dopóki nie są na hosted project, granty kolumnowe są tam szersze, niż
  zakłada ten plan. Blokuje wdrożenie, nie pracę lokalną.
- **`smallint` na `current_generation`** daje 32767 regeneracji na dzień. Nie jest to limit, o który
  trzeba się martwić, ale nie jest też nieskończonością.

## Success Criteria (Summary)

- Nauczyciel generuje, poprawia i akceptuje plan dnia, a po odświeżeniu strony wszystko jest na miejscu.
- Regeneracja wymienia propozycje w całości: nigdy nie widać wymieszanych partii ani pustego planu.
- Plan jednego nauczyciela pozostaje niewidoczny dla innego konta — dowiedzione w pgTAP, także dla
  nowej funkcji zapisu.
