<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Limit fair use (S-21)

- **Plan**: context/changes/fair-use-limit/plan.md
- **Scope**: Phases 1–5 of 5
- **Date**: 2026-10-17
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | WARNING |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

Automated gates re-run at review time: `npm test` 843 passed, `npm run test:db:api` 11 passed, `npm run test:db` PASS, lint and build exit 0.

## Findings

### F1 — Szkic tygodnia nie ma własnego sufitu

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261017150000_generation_ledger.sql (zapytanie liczące)
- **Detail**: Wiersze `outline` nie liczyły się do żadnego sufitu; skrypt z tokenem nauczycielki mógł wołać `week/outline` bez końca, dopóki zostawał choć jeden dzień.
- **Fix A ⭐ Recommended**: Liczyć `outline` do sufitu `refine` (rodzina „light”).
- **Fix B**: Osobny parametr `p_outline_limit`.
- **Decision**: FIXED via Fix A — migracja edytowana w miejscu (nie była jeszcze na hostowanym projekcie): `outline` liczy się do `refine`, szkic wymaga miejsca w obu sufitach; nowa asercja pgTAP (38).

### F2 — Wyczerpany limit w środku tygodnia zużywa dni, których nie da się zapisać

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Architecture
- **Location**: src/components/plan/WeekPlanBoard.tsx (writeWeek), src/components/plan/WeekDayCard.tsx
- **Detail**: Tydzień zapisuje się tylko w komplecie; dni wygenerowane przed odmową limitu są tylko w pamięci przeglądarki, a limit już je policzył.
- **Fix A ⭐ Recommended**: Zdanie na karcie z odmową limitu.
- **Fix B**: Pozwolić zapisać częściowy tydzień przy odmowie limitu (łamie Guardrail #3).
- **Decision**: FIXED via Fix A — karta z `contactSuggested` mówi, że wygenerowane dni nie zostały zapisane, bo tydzień zapisuje się tylko w całości. Dni nadal liczą się do limitu (świadomie).

### F3 — Nowe przetwarzanie danych wejdzie w życie bez powiadomienia kont

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: src/content/legal/polityka-prywatnosci.md (pkt 2.7, 11), plan.md 5.5
- **Detail**: Polityka (pkt 11) obiecuje e-mail o istotnych zmianach; księga zaczyna się w chwili scalenia, a plan nie ma pozycji o powiadomieniu istniejących kont.
- **Fix**: Decyzja właściciela przed scaleniem — zapisana w follow-ups/review-fixes.md.
- **Decision**: ACCEPTED — właściciel 2026-10-17: brak użytkowników produkcyjnych, więc e-mail o zmianie Polityki nie jest potrzebny. Wersja 1.1 na stronie wystarcza.

### F4 — Rzutowanie `null as unknown as string` dla `p_plan_date`

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/fair-use.ts
- **Detail**: Wygenerowany typ wymagał `string`.
- **Fix**: `default null`. Postgres wymaga domyślnych argumentów na końcu listy, więc `p_plan_date` przeniesiono za `p_refund_allowance`.
- **Decision**: FIXED — nowa sygnatura `claim_generation(p_kind, p_day_limit, p_refine_limit, p_refund_allowance, p_plan_date default null, p_enforce default true)`, typy zregenerowane, rzutowanie usunięte.

### F5 — Bramka 5.3 nie widzi wierszy, które wymieniają S-21 jako prerekwizyt

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: plan.md, kryterium 5.3
- **Detail**: `grep -v 'S-21'` odfiltrowuje też wiersze S-22, S-23, S-27. Wynik tej zmiany jest prawdziwy.
- **Fix**: Bez zmian w kodzie.
- **Decision**: ACCEPTED (zapisane w follow-ups/review-fixes.md; ewentualna lekcja do decyzji właściciela)
