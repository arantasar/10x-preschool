---
change_id: testing-generation-contract-boundary
title: Runner testów + granica model→kontrakt→zapis
status: implemented
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
