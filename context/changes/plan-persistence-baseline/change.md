---
change_id: plan-persistence-baseline
title: Minimalny schemat przechowywania planów z izolacją RLS per konto
status: implementing
created: 2026-07-18
updated: 2026-07-19
archived_at: null
---

## Notes

Source: `context/foundation/roadmap.md` → **F-01** (status: ready, prerequisites: —).

- **Outcome:** minimalny schemat przechowywania planów (dzień → hasło, propozycje, stan zaakceptowania) z politykami RLS udostępniającymi wiersze wyłącznie właścicielowi konta.
- **PRD refs:** Access Control, NFR prywatności
- **Unlocks:** S-02 (`edit-accept-day-plan`), S-03 (`week-generation`)
- **Parallel with:** S-01 (`first-day-generation`) — gwiazda przewodnia wyświetla propozycje efemerycznie, nie wymaga zapisu.
- **Risk:** źle ustawione RLS wycieka plany między kontami; polityki per-operacja / per-rola są częścią kontraktu foundacji, nie dodatkiem.
- **Baseline:** `supabase/migrations/` nie istnieje — to pierwsza migracja w projekcie. Zakres to minimalny enabler dla S-02/S-03, nie „cała baza danych".
