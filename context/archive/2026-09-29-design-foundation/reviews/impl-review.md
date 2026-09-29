<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Design foundation („Ogród”)

- **Plan**: context/changes/design-foundation/plan.md
- **Scope**: Fazy 1–4 z 4 (+ ekran 14 po planie, `64fc8f6`)
- **Date**: 2026-09-29
- **Verdict**: NEEDS ATTENTION → po triażu wszystkie findingi rozstrzygnięte (8 naprawionych, 2 jako follow-up)
- **Findings**: 0 critical, 4 warnings, 6 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

Kryteria automatyczne planu powtórzone na `HEAD` (przed poprawkami i po nich): lint, build, 468 testów
jednostkowych, bramki 1.4–4.5 — PASS; pełny e2e 21/21 (dopiero na rozgrzanym serwerze, patrz F9).
Wiersze Manual (13) odhaczone po jawnym potwierdzeniu Janusza 2026-09-29.

Przegląd dryfu: brak MISSING, dwa łagodne DRIFT (`outlinePill` zamiast `secondary` — klucz zajęty;
`confirm-email` wg makiety 14 — notatka w `change.md`), dwa EXTRA (`src/lib/utils.ts`, komentarz w
`AppHeader.astro`). XSS, open redirect, rozmiar ciasteczka, atrybuty ciasteczka, kasowanie w
frontmatterze, konfiguracja tailwind-merge, wyciek `.theme-legacy` — sprawdzone, czyste.

## Findings

### F1 — Focus Morela za słaby na jasnym tle

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (a11y)
- **Location**: src/styles/global.css:229, src/components/ui/button.tsx (pill*), src/components/auth/FormField.tsx:6, src/components/auth/PasswordToggle.tsx:13, src/components/Welcome.astro (pasek tematu)
- **Detail**: #ee9b6a ma 1,92:1 na Owsie i 2,17:1 na Mleku; WCAG 1.4.11 wymaga ≥ 3:1 dla wskaźnika fokusu. Źródłem jest pakiet designu (README §6).
- **Fix A ⭐ Recommended**: pierścień Las + Morela.
- **Fix B**: świadome odstępstwo projektowe.
- **Decision**: FIXED via Fix A — z odwróconą kolejnością: obrys Las 3 px (10,6:1 na Owsie) i Morela 2 px w odstępie. Wersja „Las wewnątrz, Morela na zewnątrz” znikała na ciemnych pigułkach i na pasie CTA; tu na ciemnym tle niesie ją halo Morela (5,5:1). Zweryfikowane zrzutami (pole, przycisk primary, pas CTA).

### F2 — Obramowanie pól prawie niewidoczne

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (a11y)
- **Location**: src/components/auth/FormField.tsx:52
- **Detail**: `border-obrys` #b9c7b1 = 1,74:1 na Mleku.
- **Fix A ⭐ Recommended**: `border-obrys-przerywany` #6f8a69 (3,74:1).
- **Fix B**: świadome odstępstwo.
- **Decision**: FIXED via Fix A

### F3 — `?haslo=` wstawia dowolny tekst do naszego pudełka statusu

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (content injection)
- **Location**: src/pages/auth/signup.astro
- **Detail**: Link `/auth/signup?haslo=<200 znaków>` renderował tekst w zielonym pudełku nad polem „Hasło” — ta sama klasa co zakazane w `CLAUDE.md` dla `?error=`.
- **Fix A ⭐ Recommended**: stałe zdanie bez echa, słowo „temat”.
- **Fix B**: echo + „temat” + udokumentowane ryzyko.
- **Decision**: FIXED via Fix A — „Temat wpisany na stronie głównej poczeka na Ciebie po zalogowaniu.” Pozostaje (świadomie): spreparowany link może nadal wypełnić pole „Hasło tygodnia” przy następnym wejściu na tydzień — nic nie jest generowane ani zapisywane bez kliknięcia nauczyciela.

### F4 — Nowy test e2e bez ryzyka w test-plan.md

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/e2e/landing-topic-carry.spec.ts:19,23
- **Detail**: `E2E-RULES.md` wymaga ryzyka z `test-plan.md` i nazwy „ryzyko #N — …”.
- **Fix**: ryzyko #13 w mapie ryzyk, zmiana nazw.
- **Decision**: FIXED — wiersz 13 w `test-plan.md` §2 (bez wiersza w Risk Response Guidance, jak #11 i #12), describe/test „Ryzyko #13 — …”.

### F5 — Tydzień kasuje temat, gdy nie udał się odczyt

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (reliability)
- **Location**: src/pages/plan/week.astro
- **Detail**: Przy `readFailed` formularz się nie renderuje, a ciasteczko było kasowane.
- **Fix**: kasować i podawać `initialPrompt` tylko przy `!readFailed`.
- **Decision**: FIXED

### F6 — Nieścisły komentarz i niepełna lista twMerge

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/styles/global.css (reguła fokusu), src/lib/utils.ts
- **Detail**: `:where(...):focus-visible` ma specyficzność (0,1,0), nie zerową; utils.ts bez `container: ["content"]`.
- **Fix**: poprawić komentarz, dodać klucz.
- **Decision**: FIXED

### F7 — Konspekt nagłówków landingu i nadmiarowy role="status"

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (a11y)
- **Location**: src/components/Welcome.astro (sekcja „Przykładowe dni”)
- **Detail**: h1 → h3 bez h2; `role="status"` na treści obecnej od załadowania nic nie ogłasza.
- **Fix**: ukryty wizualnie `<h2>`; `role="status"` zostaje (jest w makiecie, nieszkodliwy).
- **Decision**: FIXED

### F8 — Produkcyjny wariant ciasteczka nieprzetestowany

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/pending-topic.ts:28
- **Detail**: e2e na dev (`secure: false`); droga przez e-mail i `Secure` poprawne z czytania kodu, nie z testu.
- **Fix**: jednorazowy przebieg ręczny na produkcji po merge'u.
- **Decision**: FOLLOW-UP — `follow-ups/review-fixes.md` §F8 (właściciel: Janusz, po merge'u).

### F9 — Bramka e2e niestabilna na zimnej pamięci Vite

- **Severity**: OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: playwright.config.ts (webServer), astro.config.mjs
- **Detail**: Pierwszy przebieg po zmianie zależności pada (3–15 testów). Dwa mechanizmy: re-optymalizacja zależności w trakcie przebiegu oraz `npm run build` / drugi serwer dev kasujący pliki z `node_modules/.vite` działającemu serwerowi (log: „…/deps_ssr/zod.js does not exist”). Drugi przebieg 21/21.
- **Fix**: `vite.optimizeDeps.include` w `astro.config.mjs`; nie odpalać `build` w trakcie e2e.
- **Decision**: FOLLOW-UP — `follow-ups/review-fixes.md` §F9; wpisane do Kroku 9 w `next-actions.md`.

### F10 — Zmiany spoza planu udokumentowane tylko w commitach

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/lib/utils.ts, src/components/AppHeader.astro:3-5
- **Detail**: Uzasadnione, ale bez śladu poza commitami (poza ekranem 14).
- **Fix**: linia w Notes `change.md`.
- **Decision**: FIXED — notatka o `utils.ts`, komentarzu `AppHeader`, `outlinePill` i odstępstwach F1/F2 od makiet.
