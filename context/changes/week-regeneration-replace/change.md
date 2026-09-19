---
change_id: week-regeneration-replace
title: Week regeneration replace
status: implemented
created: 2026-09-19
updated: 2026-09-19
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

### Bramka bezpieczeństwa treści zawieszona (2026-09-19)

**Decyzja właściciela, podjęta w trakcie tego slice'u: bramka jest za droga, żeby ją stale zasilać.**

Kryterium `2.4` („Content-safety gate passes across every allowed model") **nie zostało spełnione
i zostaje uchylone decyzją** — nie zaliczone. Faza 2 edytuje `week-outline.pl.md`, czyli jedyną
warstwę bezpieczeństwa treści, jaka istnieje (nie ma sędziego w ścieżce zapisu), a `lessons.md` §3
wymaga w takiej sytuacji przebiegu bramki na **każdym** dopuszczonym modelu przed scaleniem.
Ten przebieg się nie odbył. Zmiana promptu wchodzi nieoceniona i trzeba to czytać dosłownie.

Co wiadomo, a czego nie:

- `openai/gpt-5.6-luna` (model domyślny) — w przebiegu z 17:05 **zero znalezisk**, czyli przeszedł.
- `google/gemini-3.7-flash` — **nieoceniony**: wszystkie 9 wywołań zwróciło `402`
  (6 × `Awaria wywołania`, 3 × `Awaria sędziego`). To wyczerpanie kredytów, nie werdykt o treści.

Co zostało zrobione zamiast:

- Bramka **zawieszona, nie usunięta** — jeden przełącznik w `src/lib/services/gate-suspension.ts`.
  Suity nadal się kompilują i uruchamiają w całości po `RUN_CONTENT_SAFETY_GATE=1 npm run test:gate`.
  Vitest raportuje je jako `skipped`, nigdy jako `passed`, a `npm run test:gate` wypisuje ostrzeżenie.
- `ci.yml` — job `content-safety-gate` **nie wydaje już ani grosza**, ale wykrywanie zmian zostało:
  PR ruszający prompt dostaje `::warning::` i wpis w podsumowaniu, że nic go nie oceniło.
- `JUDGE_MODEL` zszedł z `anthropic/claude-opus-5` ($5/$25 za Mtok, najdroższy próg w OpenRouterze
  i największa pozycja w rachunku) na `anthropic/claude-haiku-4.5` ($1/$5) — 5× taniej, dalej poza
  rodzinami OpenAI/Google/DeepSeek, więc argument o niezależności sędziego od modelu ocenianego
  zostaje w mocy. **Ten sędzia nie jest skalibrowany** — kalibracja to zawieszona suita.

Żeby cofnąć zawieszenie: `RUN_CONTENT_SAFETY_GATE=1` w środowisku (lokalnie i w `ci.yml`), plus
przywrócenie kroku `npm run test:gate` w jobie CI. Szczegóły w nagłówku `gate-suspension.ts`.
