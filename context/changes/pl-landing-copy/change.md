---
change_id: pl-landing-copy
title: Polska wersja strony głównej dla niezalogowanych
status: implemented
created: 2026-08-30
updated: 2026-08-30
archived_at: null
---

## Notes

Możesz patrzec w @context/foundation/roadmap.md i @context/foundation/next-actions.md po szczegóły

Grunt z tych dwóch plików:

- Zgłoszenie #7 z triage'u 2026-08-30 (`next-actions.md` §Triage) — **poprawka poza roadmapą**:
  wchodzi bez FR i bez wiersza `S-NN` (`roadmap.md` §Kandydaci → „Poza paczką M-02").
- Krok 1 runbooka (`next-actions.md` §Kolejność): łańcuch to
  `/10x-new` → `/10x-plan` → `/10x-implement` → `/10x-impl-review` → `/10x-archive`.
  **`/10x-research` uznany za pomijalny** — copy w jednym komponencie.
- Powierzchnia wskazana w runbooku: `src/pages/index.astro` → `src/components/Welcome.astro`
  (copy odziedziczone ze startera Astro, po angielsku).
- Gałąź `chore/pl-landing-copy` utworzona przed pierwszym commitem, zgodnie z regułą
  z `CLAUDE.md` i `next-actions.md` §Reguły.
- Uwaga wydaniowa: merge do `master` = deploy na produkcję (Cloudflare Workers Builds).
