# Design foundation („Ogród”) — Plan Brief

> Full plan: `context/changes/design-foundation/plan.md`
> Research: `context/changes/design-foundation/research.md`

## What & Why

Pierwsza z dwóch zmian Kroku 10: nowy wygląd „Ogród” z Claude Design na publicznej stronie
(tokeny, fonty, landing, auth) plus jedna nowość z makiety — hasło wpisane na landingu czeka na
nauczyciela po rejestracji i wypełnia formularz tygodnia. Design idzie przed `M-03`, bo każdy ekran
`M-03` byłby inaczej budowany dwa razy.

## Starting Point

Aplikacja jest ciemna (`bg-cosmic`, fiolet, stockowe zmienne shadcn), bez fontów. Planer ma ~370
klas literalnych, ale korzysta też z `Button` i `rounded-*` zależnych od tokenów. Pakiet `design/`
w korzeniu repo dziś wywala `npm run lint` (575 błędów). Landing obiecuje „nic nie trafia do planu
bez akceptacji”, co przy zapisie roboczym jest nieprawdą.

## Desired End State

`/` i ekrany auth wyglądają jak makiety przy 390/768/1440 px; planer wygląda dokładnie jak dziś.
Gość wpisuje hasło na landingu → zakłada konto / loguje się → ląduje na `/plan/week` z wpisanym
hasłem. Lint, build, unit i cały e2e zielone.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Stan produkcji między dwiema zmianami | `/plan*` bez zmian | merge = wydanie; pół-jasny planer z białym tekstem wymagałby łat do wyrzucenia | Plan |
| Wpięcie tokenów | Nowe klucze `@theme` + shadcn na „Ogród” + `.theme-legacy` na wrapperach planera | dziedziczenie przez shadcn tam, gdzie chcemy, izolacja jawna z właścicielem usunięcia | Plan |
| Miejsce pakietu | `context/foundation/design/`, wykluczony z ESLint/tsconfig | przeżyje archiwizację; służy `design-planner` i `M-03` | Plan |
| N1 — przeniesienie hasła | ciasteczko 7 dni (≤ 200 znaków), signin → `/plan/week`, strona tygodnia zużywa | działa przez potwierdzenie e-maila, bez JS i bez zmian w Supabase | Research + Plan |
| Testy | vitest helpera + jeden e2e przepływu + cały e2e jako strażnik | jedyne nowe zachowanie ma bramkę; etykiety auth pilnowane | Plan |
| Kategorie / 1 aktywność na dzień | nie; karty pokazują 3 aktywności bez tagów | kontrakt 3/dzień, kategorie w `M-04` | Research (N2, N3) |
| Cykl „Zapisz w planie”, „Przywróć” | nie; copy landingu przeredagowane | obecny model roboczy/zaakceptowany zostaje | Research (N9, N10) |
| Etykiety auth | bez zmian („Adres e-mail”, „Hasło”) | wiąże je `auth.setup.ts` | Research |

## Scope

**In scope:** przeniesienie pakietu i naprawa lintu; fonty self-hosted; tokeny i warianty `Button`;
`.theme-legacy` na trzech stronach planera; nowy landing (nagłówek, hero z polem tematu, karty,
„Jak to działa”, ilustracja miesiąca, pas CTA, stopka bez linków); signin/signup/confirm-email
w układzie split; przepływ N1; wpis w `next-actions.md` dla `design-planner`.

**Out of scope:** wszystko w `/plan*` (w tym `AppHeader`, N4–N8, N11); kategorie; demo LLM dla
gościa; reset hasła, „Nie wylogowuj mnie”, `/konto`; ekrany `M-03`; dark mode; PDF; zmiana tras;
snapshoty pikselowe.

## Architecture / Approach

Pakiet to specyfikacja, nie kod: wartości z `tokens.css` → `@theme` Tailwind 4 i `:root` shadcn;
komponenty odtworzone w Tailwindzie z `cn()` (Astro dla statyki, istniejące wyspy React dla
formularzy). `.theme-legacy` nadpisuje zmienne shadcn, `--radius` i font wewnątrz wrapperów planera —
działa, bo `@theme inline` rozwiązuje `var()` w miejscu użycia. N1: `?haslo=` → ciasteczko na
stronach auth → `signin.ts` wybiera cel → `week.astro` czyta, kasuje, podaje `initialPrompt`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Pakiet i fundament motywu | zielony lint, fonty, tokeny, izolowany planer | przeciek stylów globalnych (font, `h1`, focus) do planera |
| 2. Landing | `/` według makiet 01/05, uczciwe copy, pole tematu | obietnice funkcji, których nie ma (ilustracja, karty) |
| 3. Ekrany auth | signin/signup/confirm-email według 02/06 | zmiana nazw dostępnych łamie setup e2e |
| 4. N1 + przekazanie | hasło z landingu w tygodniu po logowaniu; kolejka `design-planner` | rozmiar ciasteczka, kolejność odczyt/kasowanie |

**Prerequisites:** gałąź `feat/design-foundation` (jest); lokalna Supabase i `.dev.vars` do e2e.
**Estimated effort:** ~3–4 sesje, 4 fazy.

## Open Risks & Assumptions

- Między merge'ami landing jest jasny, a aplikacja ciemna — świadomie, na kilka dni.
- Link potwierdzający otwarty w innej przeglądarce (webview poczty) gubi hasło; wtedy po prostu pusty formularz.
- `.theme-legacy` to dług z nazwanym właścicielem (`design-planner`), zapisany w `next-actions.md`.

## Success Criteria (Summary)

- Nowy gość widzi landing i auth w stylu „Ogród” na telefonie i desktopie.
- Hasło wpisane na landingu czeka w formularzu tygodnia po pierwszym logowaniu.
- Nic w planerze się nie zmieniło, a wszystkie istniejące testy przechodzą bez edycji.
