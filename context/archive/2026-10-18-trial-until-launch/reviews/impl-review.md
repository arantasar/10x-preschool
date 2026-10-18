<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Basic do 31.01.2027 (S-30)

- **Plan**: context/changes/trial-until-launch/plan.md
- **Scope**: Phases 1–2 of 2
- **Date**: 2026-10-18
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Automated: `npm run test:db` (9 plików, 265 testów) PASS; `npm run test:db:api` 12/12 PASS; `src/` poza testem nietknięty; grepy 2.1/2.2 OK; lint i build zielone; lokalna baza: funkcja z `greatest`, `prosecdef = false`, 0 wierszy `trial` przed 2027-01-31. Manual 1.8 i 2.4–2.6 — oczekują (po merge'u).

## Findings

### F1 — Procedura przesunięcia terminu gubi rejestracje ze stycznia

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: CLAUDE.md:82, supabase/migrations/20261018160000_trial_until_launch.sql:26-29
- **Detail**: Procedura kazała przesuwać wiersze `trial` „still carrying the old date” (`= 2027-01-31`). Przy opóźnieniu ogłoszonym po 1.01.2027 konta ze stycznia mają „dzień + 1 miesiąc” (np. 2027-02-15) i zostałyby pominięte. Właściwy warunek: `source = 'trial' and access_until < <nowa stała>`.
- **Fix**: Zmienić brzmienie w CLAUDE.md i komentarzu migracji na „every trial row dated before the new constant”.
- **Decision**: FIXED

### F2 — Nieaktualny punkt roadmapy kłóci się z nową regułą

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/roadmap.md:337
- **Detail**: Punkt „…jeden `update` w SQL Editorze” stał dalej jako żywy, wbrew CLAUDE.md i rozstrzygniętemu Unknown, z warunkiem zbyt wąskim jak w F1.
- **Fix**: Przekreślić punkt i odesłać do CLAUDE.md „Plan state”.
- **Decision**: FIXED

### F3 — Migration Notes każą zrobić ręczne wyrównanie, które jest zbędne

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/trial-until-launch/plan.md (Migration Notes)
- **Detail**: `update` migracji wykonuje się w chwili `db push`, więc konta założone między merge'em a pushem są wyrównane automatycznie; ręczny krok w SQL Editorze jest zbędny.
- **Fix**: Zamienić zdanie na „wyrówna je sama migracja w chwili `db push`”.
- **Decision**: FIXED
