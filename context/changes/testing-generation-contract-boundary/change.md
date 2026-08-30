---
change_id: testing-generation-contract-boundary
title: Runner testów + granica model→kontrakt→zapis
status: impl_reviewed
created: 2026-08-29
updated: 2026-08-30
archived_at: null
---

## Notes

Faza 1 rolloutu z `context/foundation/test-plan.md` §3.

- Cel fazy: udowodnić, że odpowiedź spoza kontraktu i awaria dostawcy kończą się
  uczciwą porażką, a nie cichym pustym planem.
- Ryzyka pokrywane: #2, #5 (patrz §2 test-planu).
- Typy testów: unit + integration.
- Ta faza stawia też runner testów — jest fundamentem dla faz 2–4.

## Warunki przed merge'em do `master`

`master` deployuje wprost na produkcję (Cloudflare Workers Builds, poza repo),
więc merge jest releasem. Dwie rzeczy nie zostały sprawdzone i sprawdzić ich
stąd nie sposób:

- [ ] **Dni bez aktywności na produkcji.** Uruchom na produkcyjnym Supabase:
      `select id, plan_date from day_plans p where not exists (select 1 from activities a where a.plan_id = p.id and a.generation = p.current_generation)`.
      Musi zwrócić zero wierszy. Lokalnie to zapytanie zwraca `0`, ale wyłącznie
      dlatego, że po `supabase db reset` tabela jest pusta — kryterium nie mogło
      nie przejść. Znaczenie ma nie migracja (ta nie rusza istniejących wierszy),
      lecz zaostrzony `isDayPlanBody`: taki dzień przestaje być akceptowany, więc
      w `reconcile` daje cichy no-op, a w `mutate` — komunikat o niepowodzeniu
      zapisu, który się powiódł. Wynik zapisz tutaj.
- [x] **Krok `npm test` w logu CI.** Potwierdzone na PR #18, przebieg
      `33303229764`: `npm ci` → `npx astro sync` → `npm run lint` → **`npm test`**
      → `npm run build`, wszystkie zielone. Kolejność zgodna z planem.
- [ ] **Bramka jest doradcza, nie blokująca.** `gh api …/branches/master/protection`
      zwraca 403 („Upgrade to GitHub Pro or make this repository public"), a PR
      raportuje `mergeStateStatus: CLEAN` — czyli **czerwony test nie zatrzyma
      merge'a**, tylko pokaże czerwony znaczek. Ponieważ merge do `master`
      deployuje wprost na produkcję, jedyną realną bramką jest dziś dyscyplina
      człowieka. Do rozstrzygnięcia: upublicznić repo, wykupić Pro, albo przyjąć
      to jako świadome ograniczenie i zapisać w `test-plan.md` §5, że bramka
      `unit + integration` jest `required (wired, advisory)`.

## Roadmapa

`context/foundation/roadmap.md` nie niesie pozycji o `Change ID` równym
`testing-generation-contract-boundary` — to faza rolloutu z `test-plan.md` §3,
nie slice produktowy. Roadmapa została celowo nietknięta.
