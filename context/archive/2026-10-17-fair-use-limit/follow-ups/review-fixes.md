# Follow-ups from impl-review (fair-use-limit)

- **F3 — rozstrzygnięte 2026-10-17:** brak użytkowników produkcyjnych, więc bez e-maila o Polityce 1.1. `PRIVACY_PUBLISHED_ON` = 2026-10-17 jest prawdziwe, jeśli scalenie nastąpi dziś; przy późniejszym scaleniu trzeba ją zmienić.
- **F5 — bramka 5.3 jest ślepa na wiersze z S-21 w prerekwizytach** (S-22, S-23, S-27). Wynik tej zmiany jest prawdziwy. Jeśli ma stać się regułą: `/10x-lesson` („zakres bramki grep nie może odfiltrowywać części zakresu, którego pilnuje”).
- **Plan.md** opisuje starą kolejność argumentów `claim_generation` (fazy blokowe są tylko do odczytu). Obowiązuje sygnatura z migracji `20261017170000`.
- **Migracja `20261017150000` trafiła na hostowany projekt przed scaleniem** (ręczny `db push`, nie CI), więc poprawki F1/F4 wróciły z niej do osobnej migracji `20261017170000_claim_generation_outline_ceiling.sql`, która działa na obu formach funkcji (stara sygnatura: `drop if exists`; nowa: `create or replace`). `20261017150000` ma z powrotem treść z p1.
