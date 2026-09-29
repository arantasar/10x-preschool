# Follow-upy z przeglądu implementacji `design-foundation`

Źródło: `context/changes/design-foundation/reviews/impl-review.md` (2026-09-29). Poprawki F1–F7 i F10
weszły w kod tej zmiany; tu zostają dwie pozycje, które nie są zmianą kodu w tym PR.

## F8 — produkcyjny wariant ciasteczka `pending_topic` nieprzetestowany

- **Właściciel:** Janusz, jednorazowo **po merge'u** tej zmiany na `master` (= wydanie).
- **Co zrobić:** na produkcji nowe konto → hasło na landingu → rejestracja → link z e-maila →
  logowanie → `/plan/week` z wpisanym tematem. Sprawdza `Secure` + `httpOnly` + `sameSite=lax`
  na prawdziwej drodze przez e-mail, której e2e (dev, `secure: false`) nie przechodzi.
- **Znane ograniczenie, nie błąd:** link potwierdzający otwarty w webview aplikacji pocztowej
  ma inne ciasteczka — wtedy formularz tygodnia jest pusty (odnotowane w `plan-brief.md`).

## F9 — bramka e2e niestabilna na zimnej pamięci Vite

- **Właściciel:** faza 4 test-planu (Krok 9 w `context/foundation/next-actions.md`, „bramki CI + e2e").
- **Objaw:** pierwszy pełny przebieg po zmianie zależności pada (1–14 testów): Vite odkrywa
  zależność w trakcie, re-optymalizuje i przeładowuje → „Invalid hook call” / „chunk does not
  exist”. Dwa serwery dev na jednym repo nadpisują sobie `node_modules/.vite`. Drugi przebieg
  zawsze 21/21; produkcji to nie dotyczy.
- **Drugi mechanizm (ustalony w przeglądzie):** `npm run build` albo drugi `astro dev` uruchomiony
  obok działającego serwera kasuje mu pliki z `node_modules/.vite/deps*` — log serwera pokazuje
  „The file does not exist at …/.vite/deps_ssr/zod.js” i `pdf-lib.js`, a e2e dostaje 500 z API i
  „Nie udało się wczytać” w 14 testach naraz. Dopóki poprawki nie ma: nie odpalaj `build` w
  trakcie e2e i nie trzymaj dwóch serwerów dev na jednym repo.
- **Proponowana poprawka:** `vite.optimizeDeps.include` w `astro.config.mjs` dla `react`,
  `react-dom`, `lucide-react`, `zod`, `pdf-lib`, `@pdf-lib/fontkit`, `@supabase/ssr` — i
  sprawdzenie na świeżym `node_modules/.vite`, że pierwszy przebieg jest zielony.
