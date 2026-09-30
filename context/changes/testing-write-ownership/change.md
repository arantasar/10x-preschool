---
change_id: testing-write-ownership
title: Test rollout phase 3 — protecting writes and ownership (integration + pgTAP)
status: implementing
created: 2026-09-30
updated: 2026-09-30
archived_at: null
---

## Notes

Open a change folder for rollout Phase 3 of context/foundation/test-plan.md: "Ochrona zapisu i własności". Risks covered: #3 (regeneracja dnia / generowanie tygodnia niszczy dzień zaakceptowany), #4 (plan jednego konta czytelny lub zapisywalny z innego — API sprawdza zalogowanie zamiast własności), #7 (bezpowrotna utrata planu dnia — kasowanie wychodzi poza jeden dzień jednego właściciela). Plus dług z §6.4: odmowa pustej partii (U0003) bez asercji pgTAP. Test types planned: integration + pgTAP.
Risk response intent:
- #3: dzień zaakceptowany ginie tylko po jawnej zgodzie na ten konkretny dzień (semantyka po S-09/S-10, zgoda per data) — nie „nigdy nie ginie”, jak mówi dzisiejszy §2 i cel fazy w §3; research ma to potwierdzić i zgłosić backport; test nie może być szczęśliwą ścieżką na pustym dniu.
- #4: żądanie z konta B wobec zasobu konta A kończy się jawną odmową na warstwie API, nie cichym pustym wynikiem; test musi mieć dwa konta.
- #7: kasowanie zdejmuje dokładnie jeden dzień jednego właściciela; dzień sąsiedni, dzień innego konta i wiersze spoza zakresu przeżywają; żądanie wobec cudzego dnia nie kasuje nic.
Context: e2e (Playwright) już pokrywa #4 i #7 w przeglądarce (§6.6) — faza dokłada tańszą warstwę trasy wołanej bez HTTP (wzorzec §6.3 „trasa jako funkcja + atrapa locals dwóch kont”, dziś TBD) i pgTAP; #3 e2e celowo nie dotyka. Brama §5 „testy bazy” ma trafić do CI w tej fazie.
After creating the folder, follow the downstream continuation rule.
