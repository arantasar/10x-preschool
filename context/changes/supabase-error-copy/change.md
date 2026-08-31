---
change_id: supabase-error-copy
title: Polskie komunikaty błędów logowania i rejestracji
status: new
created: 2026-08-31
updated: 2026-08-31
archived_at: null
---

## Notes

Domknięcie follow-upu otwartego w `pl-landing-copy` (faza 2, 2026-08-30) — pełny opis
problemu: `context/archive/2026-08-30-pl-landing-copy/follow-ups/supabase-error-copy.md`.

**Problem:** `src/pages/api/auth/{signin,signup}.ts:16` przekazują `error.message` prosto
z Supabase do `?error=`, a `ServerError.tsx` renderuje go dosłownie. Nauczyciel, który poda
błędne hasło, widzi „Invalid login credentials" na ekranie, którego cała reszta jest po polsku.
`pl-landing-copy` przetłumaczył wyłącznie **nasz własny** string („Supabase nie jest
skonfigurowany") i świadomie zostawił ten wypadek.

**Trzy pytania z follow-upu — rozstrzygnięte 2026-08-31, przed planowaniem:**

1. **Mapować po `error.code`, nie po `error.message`.** Follow-up zakładał kompromis
   („`code` stabilniejszy, ale nie każdy błąd go niesie"). W zainstalowanej wersji
   (`@supabase/auth-js` 2.105.3) kompromisu nie ma: `AuthError.code` jest **typowaną unią
   `ErrorCode`** (86 wartości, `node_modules/@supabase/auth-js/dist/module/lib/error-codes.d.ts`),
   a `AuthApiError` — wszystko, co wraca z REST API — ma `status: number` obowiązkowo.
   Kodu nie ma wyłącznie przy błędach sprzed odpowiedzi (sieć, timeout), czyli dokładnie
   w przypadku fallbacku.
2. **Fallback: generyczny polski komunikat** dla kodu spoza mapy i dla błędu bez kodu.
   Nauczyciel nigdy nie widzi angielskiego. Oryginał ma iść do `console.error` po stronie
   serwera (logi Cloudflare), żeby nie tracić diagnostyki.
3. **Mapa mieszka w `src/lib/`** — od początku wołają ją dwie trasy (`CLAUDE.md`
   §Services/helpers). **Nie** `src/lib/services/`: to czysta funkcja `code → tekst`,
   nie dotyka Supabase ani bazy.

**Decyzja spoza follow-upu (user, 2026-08-31): w `?error=` jedzie kod, nie gotowy tekst.**
Tłumaczenie dzieje się przy renderze w `src/pages/auth/{signin,signup}.astro`.
Powód jest podwójny — poza czystszym kontraktem zamyka to dziurę, której follow-up nie
zauważył: dziś `?error=<dowolny tekst>` renderuje się na naszej stronie logowania jak nasz
własny komunikat. To nie XSS (React escapuje), ale gotowy nośnik pod phishing. Przy kodach
nieznany kod trafia w fallback, więc wstrzyknąć się nie da.

Zakres obejmuje więc też `signin.astro` i `signup.astro`, nie tylko dwie trasy API.

**Uwaga wydaniowa:** merge do `master` = deploy na produkcję (Cloudflare Workers Builds).
Gałąź: `fix/supabase-error-copy`.
