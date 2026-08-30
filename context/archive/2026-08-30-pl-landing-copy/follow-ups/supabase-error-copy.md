# Follow-up: angielskie komunikaty błędów z Supabase na ekranach auth

- **Właściciel:** Janusz
- **Otwarty:** 2026-08-30 (w trakcie `pl-landing-copy`, faza 2)
- **Bramka wejścia:** najbliższa zmiana dotykająca tras `src/pages/api/auth/*` — albo
  wcześniej, jeśli pojawi się zgłoszenie od użytkownika

## Problem

`src/pages/api/auth/signin.ts:16` i `src/pages/api/auth/signup.ts:16` przekazują
`error.message` **prosto z Supabase** do parametru `?error=`, a `ServerError.tsx` renderuje go
dosłownie. Komunikaty Supabase są po angielsku, więc nauczyciel, który poda błędne hasło,
zobaczy „Invalid login credentials" na ekranie, którego cała reszta jest po polsku.

Zmiana `pl-landing-copy` przetłumaczyła **nasz własny** string (`"Supabase is not
configured"` → `"Supabase nie jest skonfigurowany"`) i świadomie zostawiła ten wypadek —
patrz `plan.md` §What We're NOT Doing.

## Dlaczego nie zostało zrobione od razu

Mapowanie cudzych komunikatów to logika w trasie API, nie wymiana copy — a zmiana szła na
gałęzi `chore/` z zakresem „wymiana napisów". Do tego lista komunikatów Supabase jest
niestabilna i nieudokumentowana, więc każde mapowanie musi mieć fallback, a nic w projekcie
tego dziś nie testuje (`test-plan.md` §3 faza 2 jeszcze nie ruszyła).

## Co trzeba rozstrzygnąć, gdy pozycja wejdzie

1. Mapować po `error.message` (kruche — string może się zmienić po stronie Supabase) czy po
   `error.code` / `error.status` (stabilniejsze, ale nie każdy błąd je niesie).
2. Jaki jest fallback dla komunikatu spoza mapy — generyczny polski tekst czy przepuszczenie
   oryginału. Generyczny ukrywa informację diagnostyczną; przepuszczenie zostawia angielski.
3. Czy mapa mieszka w trasie, czy w `src/lib/` — zgodnie z `CLAUDE.md` §Services/helpers
   przenosi się do `src/lib/`, gdy ta sama logika jest wołana z więcej niż jednej trasy;
   tutaj od początku są dwie trasy (`signin`, `signup`).

## Znane komunikaty do pokrycia

Do zebrania z realnych przebiegów — na dziś potwierdzony jest jeden:

- `Invalid login credentials` — błędny e-mail lub hasło przy logowaniu
