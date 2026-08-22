<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: S-01 `first-day-generation` — plan implementacji

- **Plan**: context/changes/first-day-generation/plan.md
- **Scope**: Phases 1–5 of 5 (full plan)
- **Date**: 2026-08-22
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Success criteria re-run

| Check | Result |
|---|---|
| `npm ls zod --depth=0` | PASS — `zod@4.4.3` top-level |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| Build without `OPENROUTER_API_KEY` | PASS |
| `POST /api/day-plan/generate` bez sesji | PASS — 401 + `content-type: application/json` |
| `GET /plan` bez sesji | PASS — 302 → `/auth/signin` |
| Skrypt: 15 wyjść, `aktywnosci \| length == 3` | PASS — 15/15 |
| Sekrety w commitowanych artefaktach | PASS — brak `sk-or-`; `.dev.vars` nieśledzony |

Criterion 3.4 (`prompt` > 2000 znaków → 400) was **not re-verifiable in this pass**: the route checks
the session before validating the body, so without a session cookie it correctly answers 401. The
ordering is by design and documented in the route. The row was verified during Phase 3.

## Findings

### F1 — Plan wymaga `provider.require_parameters: true`; kod świadomie go nie wysyła

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/lib/services/activity-generator.ts:150-165 (vs. plan.md:276-278)
- **Detail**: Kontrakt Fazy 2 mówi wprost: `provider: { require_parameters: true, data_collection: "deny" }`,
  z uzasadnieniem „pierwsze wycina dostawców bez wsparcia `json_schema` zamiast pozwolić im po cichu
  zignorować parametr". Kod wysyła wyłącznie `data_collection: "deny"`, a `require_parameters`
  pomija — bo z nim każdy endpoint domyślnego modelu wypadał z routingu („No endpoints found that
  can handle the requested parameters"). Decyzja jest dobrze uzasadniona i zabezpieczona: dostawca
  ignorujący `response_format` zostaje złapany przez `dayPlanProposalSchema` i wraca jako `invalid`,
  czyli ponawialny. Problem nie leży w kodzie — leży w tym, że **plan nadal twierdzi coś
  przeciwnego**, a to on jest źródłem prawdy dla `/10x-archive` i dla S-03, który ten sam serwis
  odziedziczy.
- **Fix A ⭐ Recommended**: Dopisać addendum do sekcji Fazy 2 w planie, rejestrujące odstępstwo i jego powód.
  - Strength: Domyka rozjazd tam, gdzie następny czytelnik naprawdę zajrzy; kod już niesie pełne uzasadnienie, więc addendum to jedno zdanie plus wskaźnik.
  - Tradeoff: Plan przestaje być zamrożonym artefaktem — ale to i tak już nieprawda.
  - Confidence: HIGH — odstępstwo jest udokumentowane w kodzie i potwierdzone empirycznie w Fazie 2.
  - Blind spot: Nie sprawdzono, czy `require_parameters` działa dla `gemini-3.7-flash` — gdyby S-03 przełączył model, warto to przetestować ponownie.
- **Fix B**: Zostawić bez zmian — komentarz w kodzie jest wystarczającym zapisem.
  - Strength: Zero pracy; plan pozostaje historycznym zapisem intencji, nie stanu.
  - Tradeoff: Kolejny czytelnik planu (albo `/10x-plan` dla S-03) zobaczy nieaktualny kontrakt.
  - Confidence: MEDIUM — działa, dopóki ktoś czyta kod przed planem.
  - Blind spot: Brak.
- **Decision**: FIXED via Fix A — addendum dopisany do Fazy 2 planu (plan.md:315)

### F2 — `model-comparison.md` nie ma siatki 3 modele × 5 haseł, której wymaga plan

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/first-day-generation/model-comparison.md
- **Detail**: Kontrakt Fazy 5 mówi: „tabela 3 modele × 5 haseł z oceną ręczną". Dokument ma tabelę
  3 modele × *kryteria* oraz prozę analizującą 2 z 5 haseł („Andrzejki", „Dzień Matki"). Jak każdy
  z modeli wypadł na „neutralne", „sezonowe" i „abstrakcyjne" nie jest widoczne — dane istnieją
  w `summary.tsv` i w 15 plikach JSON, ale czytelnik dokumentu ich nie zobaczy. To osłabia dokładnie
  tę funkcję, dla której dokument powstał: żeby S-02 i S-03 nie musiały ufać plemiennej wiedzy.
- **Fix**: Dodać do `model-comparison.md` siatkę 3×5 z oceną per hasło (bezpieczeństwo / akceptowalność).
- **Decision**: FIXED — siatka 3×5 (bezpieczeństwo / akceptowalność / długość) dodana do `model-comparison.md` wraz z listą 3 propozycji policzonych jako wymagające edycji

### F3 — Guardrail wiekowy nie ma żadnej siatki bezpieczeństwa poza jednorazowym skryptem

- **Severity**: 👁 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/prompts/day-plan.pl.md · scripts/compare-models.sh
- **Detail**: Wynik DeepSeeka z Fazy 5 jest dowodem empirycznym, że model może przejść **każdą**
  automatyczną kontrolę w tym slice — schemat JSON, `dayPlanProposalSchema`, `jq aktywnosci | length == 3` —
  i mimo to zaproponować roztopiony wosk dzieciom 3–6 lat. Jedyną warstwą, która to łapie, jest
  prompt, a jedynym narzędziem, które go sprawdza, jest `compare-models.sh` — świadomie poza CI.
  Skutek: dowolna edycja `day-plan.pl.md` albo podmiana `OPENROUTER_MODEL` (celowo bezdeployowa!)
  może cofnąć bezpieczeństwo dzieci przy zerowym sygnale. To nie jest usterka tej implementacji —
  plan i roadmapa przyjęły to ryzyko świadomie — ale jest to najostrzejsza krawędź, jaką S-01 zostawia.
- **Fix**: Zapisać jako regułę w `context/foundation/lessons.md` (kandydat: „gdy prompt jest jedyną
  warstwą bezpieczeństwa, bramka jakości musi obejmować każdy model dopuszczony do konfiguracji,
  nie tylko wybrany") i/lub dopiąć uruchomienie `compare-models.sh` do listy kontrolnej zmiany promptu.
- **Decision**: ACCEPTED-AS-RULE — „Gdy prompt jest jedyną warstwą bezpieczeństwa, bramka musi objąć każdy dopuszczony model" (context/foundation/lessons.md); kod bez zmian

### F4 — `plan_date` jest walidowana, ale nigdy nie dociera do modelu

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/pages/api/day-plan/generate.ts:96-101
- **Detail**: Data jest walidowana i odrzucana — udokumentowane celowo („S-01 stores nothing, so the
  date only labels the request"), więc **nie jest to dryf**. Warto jednak odnotować konsekwencję
  produktową, której plan nie nazywa: model nie zna dnia, więc nauczyciel generujący na poniedziałek
  i na piątek z tym samym hasłem dostaje propozycje nieodróżnialne co do dnia. Dla S-01 to bez
  znaczenia (jeden dzień), ale S-03 generuje **pięć dni z jednego hasła** — i tam brak daty
  w promptcie stanie się różnicą między „tydzień zajęć" a „pięć razy to samo".
- **Fix**: Odnotować w briefie S-03 jako wejście do planowania; nie zmieniać niczego w S-01.
- **Decision**: FIXED — odnotowane jako Unknown przy S-03 w `context/foundation/roadmap.md`; S-01 bez zmian

## Co zweryfikowano bez zastrzeżeń

- **Architektura**: `src/lib/services/` utworzone zgodnie z konwencją CLAUDE.md; serwis to czysta
  funkcja nad `fetch`, bez SDK; trasa cienka (auth → walidacja → serwis → mapowanie błędu).
- **Granica auth**: trasa API broni się sama (401 JSON), strona `/plan` przez `PROTECTED_ROUTES` —
  dokładnie rozdział opisany w § Critical Implementation Details, z komentarzami w obu plikach.
- **Awaria częściowa**: `finish_reason === "error"` i `choices[0].error` sprawdzane **przed**
  `JSON.parse`, zgodnie z planem.
- **Granice**: `day-plan-limits.ts` jako jedno źródło dla serwisu, trasy i wyspy — licznik znaków
  w UI nie może obiecać czegoś, co trasa odrzuci.
- **Budżet ponowienia**: `TOTAL_BUDGET_MS` domyka najgorszy przypadek na ~60 s (45 + 1 + 14),
  a `RETRY_VISIBLE_AFTER_MS` wyprowadza etap ponowienia z tych samych liczb zamiast go zgadywać.
- **Podwójne wysłanie**: `useRef` obok `disabled` — łapie submit sprzed re-renderu.
- **Bezpieczeństwo artefaktów**: brak klucza w 33 zacommitowanych plikach; `.dev.vars` nieśledzony.
- **Zakres**: żadnego zapisu do bazy, żadnej migracji, brak streamingu, brak biblioteki dat —
  wszystkie granice z „What We're NOT Doing" utrzymane. Angielski `dashboard.astro` pozostaje
  świadomie nietknięty, zgodnie z planem.
