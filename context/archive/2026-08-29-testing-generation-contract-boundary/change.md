---
change_id: testing-generation-contract-boundary
title: Runner testów + granica model→kontrakt→zapis
status: archived
created: 2026-08-29
updated: 2026-08-30
archived_at: 2026-08-30T09:15:36Z
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
więc merge jest releasem. Trzy rzeczy wymagały sprawdzenia poza tym repozytorium.
**Wszystkie zamknięte 2026-08-30 — zmiana jest gotowa do merge'a.**

- [x] **Dni bez aktywności na produkcji.** Wykonane 2026-08-30 na produkcyjnym
      Supabase: *Success. No rows returned.* Zero dni z pustą bieżącą generacją,
      więc zaostrzony `isDayPlanBody` nie odrzuci żadnego istniejącego dnia.
      Zapytanie:
      `select id, plan_date from day_plans p where not exists (select 1 from activities a where a.plan_id = p.id and a.generation = p.current_generation)`.
      Uruchomione na produkcji, bo lokalnie nie mogło nie przejść: po
      `supabase db reset` tabela jest pusta, więc zwracało `0` niezależnie od
      faktów. Stawką była nie migracja (ta nie rusza istniejących wierszy), lecz
      zaostrzony `isDayPlanBody`: taki dzień przestałby być akceptowany, więc
      w `reconcile` dałby cichy no-op, a w `mutate` — komunikat o niepowodzeniu
      zapisu, który się powiódł.
- [x] **Krok `npm test` w logu CI.** Potwierdzone na PR #18, przebieg
      `33303229764`: `npm ci` → `npx astro sync` → `npm run lint` → **`npm test`**
      → `npm run build`, wszystkie zielone. Kolejność zgodna z planem.
- [x] **Bramka jest doradcza, nie blokująca.** `gh api …/branches/master/protection`
      zwraca 403 („Upgrade to GitHub Pro or make this repository public"), a PR
      raportuje `mergeStateStatus: CLEAN` — czyli **czerwony test nie zatrzyma
      merge'a**, tylko pokaże czerwony znaczek. Ponieważ merge do `master`
      deployuje wprost na produkcję, jedyną realną bramką jest dziś dyscyplina
      człowieka. **Rozstrzygnięte 2026-08-30**: repozytorium zostaje prywatne,
      planu nie kupujemy. Ograniczenie zapisane w `test-plan.md` §5 — trzy
      wpięte bramki mają teraz status `required (wired, doradcza)`, a nagłówek
      §5 mówi wprost, że kolumna „Required?" opisuje, co jest uruchamiane, nie
      co jest egzekwowane.

## Roadmapa

`context/foundation/roadmap.md` nie niesie pozycji o `Change ID` równym
`testing-generation-contract-boundary` — to faza rolloutu z `test-plan.md` §3,
nie slice produktowy. Roadmapa została celowo nietknięta.
