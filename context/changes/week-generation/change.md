---
change_id: week-generation
title: Week generation
status: implemented
created: 2026-08-23
updated: 2026-08-26
archived_at: null
---

## Notes

### 2026-08-23 — `.dev.vars` był uszkodzony i wskazywał hosted project

Linia `SUPABASE_URL` zawierała nazwę zmiennej dwa razy
(`SUPABASE_URL=SUPABASE_URL=https://tponbccoxczjyoqwliyx.supabase.co`), więc
`npm run dev` wstawiłby do klienta URL, który nie jest URL-em. Niezależnie od
tego wskazywała hosted project, gdzie nadal nie ma żadnej z siedmiu migracji —
każdy zapis w tym slice'ie by tam padł.

Przestawione na lokalny stack (`http://127.0.0.1:54321` + lokalny klucz anon).
Plik jest gitignorowany, więc nic z tego nie trafia do repo. Kopia oryginału
została w katalogu tymczasowym sesji.

Żeby wrócić na hosted: wpisz URL i klucz hosted **raz** w linii, i pamiętaj, że
hosted wymaga najpierw `npx supabase db push`.

### 2026-08-23 — `npx supabase db reset` skasował dane testowe z S-02

`change.md` S-02 zostawił dane (`2026-09-14`, `2026-11-05`, konta `p3-a@` i
`p3-b@test.local`) świadomie pod S-03. Kryterium 1.1 tego planu wymaga jednak
czystego `db reset`, który jest mocniejszym dowodem (migracje stosują się od
zera) niż `migration up` na zastanym stanie. Dane odtworzone na potrzeby
weryfikacji: konto `s03-a@test.local` / `haslo12345`, dzień `2026-09-14`.
