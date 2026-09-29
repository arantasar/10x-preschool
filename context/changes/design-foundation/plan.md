# Design foundation („Ogród”) — Implementation Plan

## Overview

Pierwsza z dwóch zmian Kroku 10 (`next-actions.md`): wprowadza język wizualny „Ogród” z pakietu
Claude Design na całą publiczną stronę aplikacji — tokeny, fonty, landing, ekrany auth — oraz jedną
nową funkcję z makiety (N1): hasło wpisane na landingu przeżywa rejestrację i potwierdzenie e-maila
i wypełnia „Hasło tygodnia” po pierwszym logowaniu. Ekrany planera (`/plan*`) zostają świadomie
ciemne do `design-planner`, przypięte jawnie, a nie przypadkiem.

## Current State Analysis

- Aplikacja jest ciemna („kosmiczna”): `bg-cosmic`, szkło `white/10`, fiolet, stockowe zmienne shadcn
  w `src/styles/global.css:6-111`, brak własnych fontów.
- Landing to `src/components/Welcome.astro` + `src/components/Topbar.astro` (starterowy pasek).
  Kafelek „Ty decydujesz” obiecuje „Nic nie trafia do planu bez Twojej akceptacji”
  (`Welcome.astro:84-86`) — to **nieprawda** przy obecnym zapisie roboczym (research §N9).
- Auth: `src/pages/auth/{signin,signup,confirm-email}.astro` + wyspy `src/components/auth/*`,
  wszystko na klasach literalnych (fiolet, `white/*`).
- Planer ma ~370 literalnych klas kolorów (`DayPlanEditor.tsx` 135, `WeekPlanBoard.tsx` 60,
  `WeekDayCard.tsx` 53 …), ale **korzysta też z tokenów pośrednio**: `Button` z shadcn w 4 plikach
  (`bg-primary` itd.) i `rounded-sm/md/lg/xl` 37 razy (liczone z `--radius`). Przestawienie zmiennych
  shadcn bez izolacji przemalowałoby przyciski i zaokrąglenia w ciemnym planerze.
- Pakiet `design/` leży w korzeniu repo, nieśledzony, i **dziś wywala `npm run lint`**:
  `npx eslint design` → 575 problemów (ESLint lintuje `.`, `tsconfig.json` ma `include: **/*`).
- Rejestracja na produkcji kończy się na `/auth/confirm-email`; sesja powstaje dopiero po kliknięciu
  linku i zalogowaniu. Parametr w URL tego nie przeżyje.
- `WeekPlanBoard` inicjuje pole z `firstPrompt(week)` (`WeekPlanBoard.tsx:105`); `PROMPT_MAX = 2000`
  (`src/lib/day-plan-limits.ts:28`).

## Desired End State

- `/`, `/auth/signin`, `/auth/signup`, `/auth/confirm-email` wyglądają jak makiety 01/05/02/06
  (w granicach decyzji z researchu), przy 390 / 768 / 1440 px, na fontach Young Serif + Nunito Sans.
- Ekrany `/plan`, `/plan/week`, `/plan/month` wyglądają **dokładnie jak dziś**.
- Gość wpisuje „Dinozaury” na landingu → rejestracja/logowanie → po zalogowaniu ląduje na
  `/plan/week` z „Hasło tygodnia” = „Dinozaury”. Bez hasła logowanie prowadzi na `/plan/month` jak dziś.
- `npm run lint`, `npm run build`, `npm test`, cały e2e — zielone.
- Pakiet designu jest w repo jako referencja pod `context/foundation/design/`.

### Key Discoveries:

- `global.css:75-111` `@theme inline` wiąże `rounded-*` i `bg-primary` z `var(--radius)` / `var(--primary)`
  w miejscu użycia — dlatego nadpisanie tych zmiennych w klasie wrappera (`.theme-legacy`) skutecznie
  przywraca stary wygląd wewnątrz wyspy.
- `tests/e2e/auth.setup.ts:22-34` wiąże etykiety „Adres e-mail”, „Hasło”, przycisk „Zaloguj się”
  i widoczny „Wyloguj się” (ten ostatni żyje w `AppHeader`, który w tej zmianie się nie zmienia).
- `src/pages/api/auth/signin.ts:36-39` — jedyne miejsce decydujące o celu po logowaniu.
- `tests/e2e/day-plan-ownership.spec.ts:58` — wzorzec własnego kontekstu przeglądarki
  (`browser.newContext`); `TEACHER_A` + `e2eEnv.password` w `tests/e2e/support/`.
- `vitest.config.ts` — testy współlokowane `src/**/*.test.ts`, środowisko `node`.
- Reguła z `pl-landing-copy`: landing nie obiecuje funkcji, których nie ma.

## What We're NOT Doing

- Żadnych zmian wyglądu `/plan*`: `AppHeader` (awatar, nawigacja — N12, N8), siatka (N4–N7),
  tydzień, dzień, podgląd, „Zatwierdź wszystkie” (N11) → `design-planner`.
- Kategorie, czas trwania, miejsce na kartach (N2 → `M-04`); `CategoryTag` i `--cat-*` nie wchodzą
  do kodu.
- Generowanie dla anonimowego / demo z LLM na landingu.
- „Nie pamiętasz hasła?”, „Nie wylogowuj mnie”, strona `/konto`, linki w stopce do nieistniejących
  stron, „Zobacz przykładowy plan” (N13–N16).
- Ekrany `M-03` (cennik, paywall, FAQ, regulamin, kontakt, reset hasła).
- Dark mode (design go nie ma); PDF (własny silnik, nie dziedziczy CSS).
- Zmiana adresów tras (trasy z README pakietu nie są przyjmowane).
- Snapshoty pikselowe.

## Implementation Approach

Pakiet designu to **specyfikacja, nie kod do skopiowania**: wartości z `tokens.css` trafiają do
motywu Tailwind 4 i zmiennych shadcn, a wygląd komponentów jest odtwarzany w Tailwindzie z `cn()` —
Astro dla statyki (nagłówek, stopka, logo, plamy, układ auth), React tylko tam, gdzie już jest wyspa
(formularze auth). Izolacja planera przez jedną klasę `.theme-legacy` na trzech wrapperach, z jawnym
właścicielem usunięcia (`design-planner`). N1 to ciasteczko serwerowe — bez JS po stronie klienta
i bez zmian w Supabase.

## Critical Implementation Details

- **Izolacja planera jest kompletna tylko, jeśli nic „Ogrodowego” nie siedzi na selektorach
  globalnych.** Bazowe style z `tokens.css` (`h1, h2 { font-family: display }`, `:focus-visible`
  z Morelą, `font-size: 17px` na `body`) **nie** idą do `@layer base` globalnie tam, gdzie planer
  by je odziedziczył. `body` dostaje tło/kolor/font „Ogród”, a `.theme-legacy` przywraca: stare
  zmienne shadcn (`:root` sprzed zmiany), `--radius: 0.625rem`, font Tailwind `sans`, `font-size: 1rem`,
  `line-height` domyślny. Nagłówki serifowe i focus Morelowy — przez klasy/utility na nowych ekranach
  albo selektor `:where(:not(.theme-legacy *))`, nie gołe `h1`.
- **Rozmiar ciasteczka.** `PROMPT_MAX` to 2000 znaków, a polskie znaki po `encodeURIComponent`
  zajmują do 6 bajtów — 2000 znaków może przekroczyć limit 4 KB ciasteczka. Hasło z landingu ma
  własny limit `PENDING_TOPIC_MAX = 200` (pole `maxlength=200`); dłuższe/puste/same białe znaki →
  helper zwraca `null` i ciasteczko nie powstaje.
- **Kolejność w `week.astro`:** odczyt i `Astro.cookies.delete` muszą się wydarzyć we frontmatterze,
  przed renderem (nagłówki odpowiedzi). Ciasteczko kasowane przy pierwszym wyświetleniu tygodnia —
  odświeżenie strony już go nie wypełnia (świadomie: jednorazowe).
- **Hasło z landingu wygrywa z `firstPrompt(week)`** — nauczyciel właśnie je wpisał. Tylko
  wypełnienie pola; żadnego automatycznego generowania.

## Phase 1: Pakiet i fundament motywu

### Overview

Naprawia lint, przenosi pakiet w trwałe miejsce, wprowadza fonty i tokeny, izoluje planer.
Po tej fazie produkcja wygląda prawie tak samo jak dziś (zmienia się tylko tło/font `body` na
stronach, które jeszcze nie są przerobione — landing i auth mają własne ciemne wrappery, więc
praktycznie nic).

### Changes Required:

#### 1. Pakiet designu

**File**: `design/` → `context/foundation/design/`

**Intent**: Trwała referencja dla `design-planner` i slice'ów `M-03`; przeżyje archiwizację tej zmiany.

**Contract**: Struktura bez zmian wewnątrz (`design/README.md`, `design/screens/`, `design/reference/`,
`src/styles/tokens.css`, `src/components/**`), bez `.DS_Store`. Śledzony w git.

#### 2. Wykluczenia narzędzi

**File**: `eslint.config.js` (plik konfiguracji ESLint), `tsconfig.json`

**Intent**: Komponenty `.astro` z pakietu to referencja, nie kod aplikacji — nie mogą być lintowane
ani typowane.

**Contract**: `context/foundation/design/**` w `ignores` ESLint i w `exclude` tsconfig.

#### 3. Fonty

**File**: `package.json`, `src/layouts/Layout.astro`

**Intent**: Self-hosting (wariant A z README pakietu) — bez zewnętrznych domen na Workers.

**Contract**: zależności `@fontsource/young-serif`, `@fontsource-variable/nunito-sans`; importy
`latin-ext` + `latin` Young Serif i `wght` Nunito Sans w `Layout.astro`. `viewport` dostaje
`initial-scale=1`.

#### 4. Tokeny „Ogród” i izolacja planera

**File**: `src/styles/global.css`

**Intent**: Wartości z `tokens.css` jako klasy Tailwind pod nowymi nazwami; zmienne shadcn
przestawione na „Ogród”; `.theme-legacy` przywraca stary zestaw wewnątrz planera.

**Contract**:
- `@theme` — kolory palety pod nazwami z pakietu (np. `owies`/`bg`, `mleko`/`surface`, `las`,
  `mech`, `szalwia`, `szalwia-soft`, `morela`, `morela-soft`, `maslo-soft`, `divider`, `border-soft`,
  `empty`…; implementer wybiera jeden spójny schemat i trzyma się go), `--font-display`, `--font-body`,
  promienie `card` (28 px), `panel` (40 px), `input` (16 px), cienie `card`/`panel`/`input`.
  Tokeny `--cat-*` **nie** wchodzą (N2).
- `:root` shadcn: `--background` = Owies, `--foreground`/`--primary` = Las, `--primary-foreground` =
  Owies, `--card`/`--popover` = Mleko, `--accent` = Morela z `--accent-foreground` = Las, `--ring` =
  Morela, `--border`/`--input` = #B9C7B1, `--muted-foreground` = #3E5347, `--radius` dopasowany
  do pakietu.
- `.theme-legacy { … }` — dokładna kopia dzisiejszych wartości `:root` shadcn + `--radius: 0.625rem`
  + reset fontu/rozmiaru (patrz Critical Implementation Details). Komentarz nad blokiem: usuwa go
  `design-planner`.
- `body`: tło Owies, tekst Las, `font-body`. Utility pomocnicze z pakietu (`eyebrow`) jako `@utility`.

#### 5. Przypięcie planera

**File**: `src/pages/plan.astro`, `src/pages/plan/week.astro`, `src/pages/plan/month.astro`

**Intent**: Ekrany planera nie zmieniają wyglądu do `design-planner`.

**Contract**: wrapper `bg-cosmic min-h-screen p-4` dostaje klasę `theme-legacy`. Nic więcej się
w tych plikach nie zmienia w tej fazie.

#### 6. Warianty przycisku

**File**: `src/components/ui/button.tsx`

**Intent**: Pigułkowe przyciski „Ogród” (`primary` Las, `accent` Morela z ciemnym tekstem,
`inverse` Owies na ciemnym pasie, `secondary` z obrysem) bez zmiany dotychczasowych wariantów.

**Contract**: istniejące `variant`/`size` i klasa bazowa `cva` **bez zmian** (planer ich używa);
dochodzą nowe klucze wariantów/rozmiarów (np. `variant: "accent" | "inverse"`, `size: "pill" | "pillLg"`).
Wysokość celu ≥ 44 px dla nowych rozmiarów.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi (dziś czerwony przez pakiet): `npm run lint`
- Build przechodzi: `npm run build`
- Testy jednostkowe przechodzą: `npm test`
- Pakiet przeniesiony i nic nie zostało w korzeniu: `test ! -e design && test -f context/foundation/design/design/README.md`
- Planer przypięty na wszystkich trzech ekranach: `grep -lE 'class="[^"]*\btheme-legacy\b' src/pages/plan.astro src/pages/plan/week.astro src/pages/plan/month.astro | wc -l` zwraca `3` (sprawdzić, że na stanie sprzed fazy zwraca `0`)
- Istniejące warianty przycisku nietknięte: `git diff master..HEAD -- src/components/ui/button.tsx | grep -E '^-\s+(default|destructive|outline|secondary|ghost|link|sm|lg|icon):'` nic nie zwraca
- Cały e2e zielony: `npm run test:e2e`

#### Manual Verification:

- `/plan?date=…`, `/plan/week`, `/plan/month` — porównanie z produkcją: przyciski, zaokrąglenia, font, focus bez zmian
- W DevTools widać załadowane Young Serif i Nunito Sans (zakładka Network, pliki z własnej domeny)

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na ręczne potwierdzenie, że planer się nie zmienił.

---

## Phase 2: Landing

### Overview

Nowa strona `/` według makiet 01 i 05, z uczciwym copy i polem tematu (bez przenoszenia go dalej —
to robi faza 4; formularz już wysyła parametr).

### Changes Required:

#### 1. Wspólne elementy marketingowe

**File**: `src/components/brand/Logo.astro`, `src/components/brand/Blob.astro`,
`src/components/layout/MarketingHeader.astro`, `src/components/layout/SiteFooter.astro`
(nowe; implementer może dobrać nazwy katalogów zgodnie z `src/components/`)

**Intent**: Statyczne elementy z pakietu przepisane na Tailwind (Astro, bez wysp).

**Contract**:
- `Logo` — liść (`--radius-logo`) + „10xPreschool” w Young Serif; link do `/`.
- `Blob` — dekoracyjny, `aria-hidden`, `pointer-events-none`, tylko w tle.
- `MarketingHeader` — logo + „Zaloguj się” (link `/auth/signin`) + „Załóż konto” (przycisk-link
  `/auth/signup`). ≤ 640 px zostaje tylko „Zaloguj się”. Bez menu ☰ (nie ma linków do schowania).
- `SiteFooter` — logo + „Plan zajęć przedszkolnych”; **bez linków** (N15).

#### 2. Strona główna

**File**: `src/components/Welcome.astro` (przepisany), `src/components/Topbar.astro` (usunięty)

**Intent**: Hero, pole tematu, przykładowe karty, „Jak to działa”, ilustracja miesiąca, ciemny pas
CTA, stopka — bez obietnic funkcji, których nie ma.

**Contract**:
- Nadtytuł „Dla nauczycieli przedszkolnych · dzieci 3–6 lat”; H1 „Jedno hasło. Cały miesiąc
  *zajęć.*” (kursywa w Mchu); lead z makiety.
- **Formularz tematu**: `<form method="GET" action="/auth/signup">`, pole z etykietą „Temat”
  (`name="haslo"`, `maxlength="200"`, niewymagane), przycisk „Wygeneruj propozycje”. Pod polem
  zamiast „Nic nie trafia do planu bez Twojej akceptacji” — informacja, że najpierw zakłada się
  darmowe konto, a hasło poczeka (np. „Najpierw załóż darmowe konto — hasło na Ciebie poczeka.”).
  ≤ 640 px pole i przycisk jeden pod drugim, przycisk na pełną szerokość.
- **Przykładowe karty** (Pn/Wt/Śr): nazwa dnia, temat dnia, **3 tytuły aktywności**; bez tagów
  kategorii, bez czasu trwania i miejsca (N2, N3).
- **„Jak to działa”** — 3 kroki z makiety; krok 2 „Ty decydujesz” przeredagowany bez „nic nie trafia
  do planu bez akceptacji” (np. „Każdą propozycję możesz zmienić, zatwierdzić albo usunąć. Ty
  decydujesz, co zatwierdzasz.”).
- **Ilustracja miesiąca** — statyczna (Astro, `aria-hidden` albo z tekstowym opisem), pn–pt, stany
  zatwierdzone (zielone) / do przejrzenia (przerywana ramka) / puste; **bez etykiet tematu tygodnia**
  i bez przycisku „Zobacz przykładowy plan”. Copy sekcji opisuje tylko to, co siatka umie dziś.
  (Etykiety tematu tygodnia dopisuje `design-planner` razem z N4.)
- **Ciemny pas CTA** „Zacznij od jednego hasła.” + „Załóż konto” (`inverse`) + „Mam już konto —
  zaloguj się”.
- `src/pages/index.astro` bez zmian logiki (przekierowanie zalogowanego zostaje).

### Success Criteria:

#### Automated Verification:

- Lint, build, testy: `npm run lint && npm run build && npm test`
- Topbar usunięty i nikt go nie importuje: `test ! -e src/components/Topbar.astro && ! grep -rn 'Topbar' src`
- Fałszywa obietnica zniknęła z landingu: `! grep -rn 'Nic nie trafia do planu' src` (dziś zwraca trafienie w `Welcome.astro`)
- Brak kosmicznych klas na landingu: `! grep -nE 'bg-cosmic|purple-|blue-100' src/components/Welcome.astro`
- Formularz tematu wysyła GET na rejestrację: `grep -nE '<form[^>]*method="GET"[^>]*action="/auth/signup"|<form[^>]*action="/auth/signup"[^>]*method="GET"' src/components/Welcome.astro`
- Cały e2e zielony: `npm run test:e2e`

#### Manual Verification:

- `/` przy 390, 768, 1440 px zgodne z `01-strona-glowna.png` i `05-strona-glowna-mobile.png` (poza świadomymi odstępstwami: brak tagów, 3 aktywności na karcie, brak „Zobacz przykładowy plan”, brak tematów tygodni w ilustracji)
- Wpisanie „Dinozaury” i wysłanie prowadzi na `/auth/signup?haslo=Dinozaury`
- Nawigacja klawiaturą: widoczny focus Morelowy, cele ≥ 44 px
- Zalogowany użytkownik wchodzący na `/` nadal ląduje na `/plan/month`
- Domyka pozycję 1.11 z `next-actions.md` §Otwarte ogony po Kroku 1

**Implementation Note**: Zatrzymaj się na ręczne potwierdzenie wyglądu.

---

## Phase 3: Ekrany auth

### Overview

Logowanie, rejestracja i potwierdzenie e-maila według makiet 02 i 06 — bez zmiany nazw dostępnych.

### Changes Required:

#### 1. Układ auth

**File**: `src/components/layout/AuthSplit.astro` (nowy)

**Intent**: Dwukolumnowy układ: formularz na Owsie + ciemny panel Las z plamą (≥ 900 px); poniżej
900 px panel znika.

**Contract**: sloty na formularz i treść panelu. Logowanie: panel z przykładową kartą dnia (jak na
landingu — bez tagów). Rejestracja: panel z 3 krokami „Jak to działa” (to samo copy co landing).
Logo na górze prowadzi do `/`.

#### 2. Strony

**File**: `src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`, `src/pages/auth/confirm-email.astro`

**Intent**: Nowy układ; logika `?error=` bez zmian.

**Contract**: H1 logowania „Witaj ponownie” (makieta), rejestracji „Załóż konto”; linki „Nie masz
konta? Załóż konto” / „Masz już konto? Zaloguj się”. `confirm-email` jako pojedyncza karta
(AuthCard z pakietu) w nowym stylu, treść bez zmian. **Bez** „Nie pamiętasz hasła?” i „Nie
wylogowuj mnie”.

#### 3. Wyspy formularzy

**File**: `src/components/auth/FormField.tsx`, `SubmitButton.tsx`, `PasswordToggle.tsx`,
`ServerError.tsx`, `SignInForm.tsx`, `SignUpForm.tsx`

**Intent**: Jasne pola (Mleko, ramka #B9C7B1, promień 16 px, cień `input`), przycisk pigułkowy
Las na całą szerokość, błędy czytelne na jasnym tle.

**Contract**: **etykiety bez zmian** — „Adres e-mail”, „Hasło”, „Powtórz hasło”; przyciski
„Zaloguj się” / „Załóż konto”; `aria-label` „Pokaż hasło”/„Ukryj hasło”. Podpowiedź pod hasłem przy
rejestracji zgodna z faktem: „Co najmniej 6 znaków” (`MIN_PASSWORD_LENGTH`). `SubmitButton`
korzysta z nowego wariantu `Button`, nie z klas literalnych.

### Success Criteria:

#### Automated Verification:

- Lint, build, testy: `npm run lint && npm run build && npm test`
- Brak kosmicznych klas w auth: `! grep -rnE 'bg-cosmic|purple-|blue-100|white/' src/pages/auth src/components/auth`
- Etykiety wiązane przez e2e zostały: `grep -c 'label="Adres e-mail"' src/components/auth/SignInForm.tsx` = 1 i `grep -c 'label="Hasło"' src/components/auth/SignInForm.tsx` = 1
- Cały e2e zielony (setup loguje się przez nowy ekran): `npm run test:e2e`

#### Manual Verification:

- `/auth/signin`, `/auth/signup`, `/auth/confirm-email` przy 390 / 768 / 1440 px zgodne z `02-logowanie.png` i `06-rejestracja.png`; panel znika poniżej 900 px
- Błąd walidacji klienta i błąd serwera (`?error=invalid_credentials`) czytelne, kontrast OK
- Pokaż/ukryj hasło działa, focus widoczny

**Implementation Note**: Zatrzymaj się na ręczne potwierdzenie wyglądu.

---

## Phase 4: Hasło z landingu (N1) i przekazanie do `design-planner`

### Overview

Hasło z landingu jedzie ciasteczkiem przez rejestrację, potwierdzenie e-maila i logowanie, a po
zalogowaniu wypełnia pole tygodnia. Na koniec `next-actions.md` dostaje listę, co bierze
`design-planner`.

### Changes Required:

#### 1. Helper

**File**: `src/lib/pending-topic.ts` (+ `src/lib/pending-topic.test.ts`)

**Intent**: Jedno miejsce z nazwą ciasteczka, limitem i normalizacją, używane przez strony auth,
API logowania i stronę tygodnia.

**Contract**: `PENDING_TOPIC_COOKIE` (np. `"pending_topic"`), `PENDING_TOPIC_MAX = 200`,
`normalizePendingTopic(raw: string | null | undefined): string | null` — trim, zwija białe znaki,
`null` dla pustego i dłuższego niż limit; opcje ciasteczka (`path: "/"`, `httpOnly`, `sameSite: "lax"`,
`secure` poza dev, `maxAge` 7 dni) jako stała.

#### 2. Zapis

**File**: `src/pages/auth/signup.astro`, `src/pages/auth/signin.astro`

**Intent**: Wejście z `?haslo=` zapisuje ciasteczko; strona rejestracji pokazuje krótko, że hasło
czeka (np. „Twoje hasło „Dinozaury” poczeka na Ciebie po zalogowaniu.”).

**Contract**: `Astro.cookies.set(PENDING_TOPIC_COOKIE, …)` tylko gdy `normalizePendingTopic` ≠ `null`.
Linki między signin a signup nie muszą nieść parametru (ciasteczko już jest).

#### 3. Cel po logowaniu

**File**: `src/pages/api/auth/signin.ts`

**Intent**: Nauczyciel z czekającym hasłem trafia prosto do tygodnia.

**Contract**: po udanym logowaniu: ciasteczko obecne i poprawne → `redirect("/plan/week")`,
w przeciwnym razie `redirect("/plan/month")` jak dziś. Ciasteczka tu nie kasujemy.

#### 4. Odczyt

**File**: `src/pages/plan/week.astro`, `src/components/plan/WeekPlanBoard.tsx`

**Intent**: Pierwsze wyświetlenie tygodnia wypełnia pole i zużywa ciasteczko.

**Contract**: `week.astro` czyta i kasuje ciasteczko we frontmatterze, przekazuje
`initialPrompt?: string` do `WeekPlanBoard`; stan pola = `initialPrompt ?? firstPrompt(week)`.
Żadnej innej zmiany w wyspie.

#### 5. E2E

**File**: `tests/e2e/landing-topic-carry.spec.ts` (nowy)

**Intent**: Jedyne nowe zachowanie ma bramkę przeglądarkową.

**Contract**: własny kontekst **bez** `storageState` (`test.use({ storageState: { cookies: [], origins: [] } })`
albo `browser.newContext()`); `/` → `getByLabel("Temat")` wypełnione unikalnym hasłem (sufiks
znacznika czasu) → „Wygeneruj propozycje” → `waitForURL` na `/auth/signup` → przejście do
`/auth/signin` → logowanie `TEACHER_A` → `waitForURL(/\/plan\/week/)` →
`expect(getByLabel("Hasło tygodnia")).toHaveValue(hasło)`. Drugie wejście na `/plan/week` →
pole nie ma już tego hasła. Zasady z `tests/e2e/E2E-RULES.md` (role/etykiety, `waitForIslands`,
bez `waitForTimeout`). Nie generuje i nie zapisuje planów — nic do sprzątania.

#### 6. Przekazanie

**File**: `context/foundation/next-actions.md` (Krok 10)

**Intent**: `design-planner` wie, co dziedziczy.

**Contract**: w Kroku 10: pakiet leży w `context/foundation/design/`; lista dla `design-planner`:
usunąć `.theme-legacy` z `global.css` i trzech stron, `AppHeader` (N12, N8 — nawigacja,
awatar, widoczny „Wyloguj się”), siatka N4–N7, N11, dopisać etykiety tematu tygodnia w ilustracji
landingu po N4; pozycja 1.11 domknięta.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe helpera (puste, białe znaki, 200 vs 201 znaków, polskie znaki) przechodzą: `npm test`
- Lint i build: `npm run lint && npm run build`
- Nowy e2e przechodzi, a na stanie bez zmiany w `signin.ts` pada (sprawdzić raz, cofając tymczasowo przekierowanie): `npx playwright test landing-topic-carry`
- Cały e2e zielony: `npm run test:e2e`
- `.theme-legacy` ma właściciela w kolejce: `grep -n 'theme-legacy' context/foundation/next-actions.md`

#### Manual Verification:

- Lokalnie (auto-potwierdzanie): landing → rejestracja nowego konta → logowanie → `/plan/week` z wypełnionym hasłem
- Logowanie bez hasła z landingu nadal prowadzi na `/plan/month`
- Hasło z ukośnikiem, cudzysłowem i emoji nie psuje strony (wyświetla się dosłownie)

**Implementation Note**: Zatrzymaj się na ręczne potwierdzenie przepływu przed przeglądem implementacyjnym.

---

## Testing Strategy

### Unit Tests:

- `normalizePendingTopic`: `null`/`undefined`/`""`/`"   "` → `null`; trim i zwijanie spacji;
  dokładnie 200 znaków → wartość, 201 → `null`; polskie znaki zachowane.

### Integration Tests:

- `landing-topic-carry.spec.ts` (faza 4) i cały dotychczasowy e2e jako strażnik etykiet auth
  i niezmienionego planera.

### Manual Testing Steps:

1. Planer (trzy ekrany) porównany z produkcją po fazie 1 — nic się nie zmienia.
2. `/` i ekrany auth przy 390 / 768 / 1440 px vs PNG z `context/foundation/design/design/screens/`.
3. Klawiatura: Tab po landingu i formularzach, focus Morelowy widoczny.
4. Pełny przepływ N1 z nowym kontem lokalnie.

## Performance Considerations

Fonty self-hostowane: tylko potrzebne podzbiory (`latin`, `latin-ext`, jedna oś `wght`). Landing
statyczny (Astro), jedyne wyspy na publicznych stronach to formularze auth — jak dziś.

## Migration Notes

Brak migracji danych. Wycofanie = revert PR; ciasteczko `pending_topic` wygasa samo po 7 dniach.

## References

- Research: `context/changes/design-foundation/research.md` (decyzje N1–N17 w §Follow-up)
- Pakiet: `context/foundation/design/` (po fazie 1)
- Kolejka: `context/foundation/next-actions.md` Krok 10
- Wzorzec kontekstu e2e: `tests/e2e/day-plan-ownership.spec.ts:58`
- Reguła copy: `context/archive/2026-08-30-pl-landing-copy/plan.md:104-105`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Pakiet i fundament motywu

#### Automated

- [x] 1.1 Lint przechodzi (dziś czerwony przez pakiet) — 226a913
- [x] 1.2 Build przechodzi — 226a913
- [x] 1.3 Testy jednostkowe przechodzą — 226a913
- [x] 1.4 Pakiet przeniesiony i nic nie zostało w korzeniu — 226a913
- [x] 1.5 Planer przypięty na wszystkich trzech ekranach — 226a913
- [x] 1.6 Istniejące warianty przycisku nietknięte — 226a913
- [x] 1.7 Cały e2e zielony — 226a913

#### Manual

- [ ] 1.8 Planer (trzy ekrany) bez zmian wyglądu względem produkcji
- [ ] 1.9 Fonty ładowane z własnej domeny

### Phase 2: Landing

#### Automated

- [x] 2.1 Lint, build, testy
- [x] 2.2 Topbar usunięty i nikt go nie importuje
- [x] 2.3 Fałszywa obietnica zniknęła z landingu
- [x] 2.4 Brak kosmicznych klas na landingu
- [x] 2.5 Formularz tematu wysyła GET na rejestrację
- [x] 2.6 Cały e2e zielony

#### Manual

- [ ] 2.7 `/` przy 390, 768, 1440 px zgodne z makietami (poza świadomymi odstępstwami)
- [ ] 2.8 Wysłanie hasła prowadzi na `/auth/signup?haslo=…`
- [ ] 2.9 Nawigacja klawiaturą, focus i cele ≥ 44 px
- [ ] 2.10 Zalogowany na `/` nadal ląduje na `/plan/month`
- [ ] 2.11 Pozycja 1.11 z `next-actions.md` domknięta

### Phase 3: Ekrany auth

#### Automated

- [ ] 3.1 Lint, build, testy
- [ ] 3.2 Brak kosmicznych klas w auth
- [ ] 3.3 Etykiety wiązane przez e2e zostały
- [ ] 3.4 Cały e2e zielony

#### Manual

- [ ] 3.5 Ekrany auth przy 390 / 768 / 1440 px zgodne z makietami
- [ ] 3.6 Błędy klienta i serwera czytelne
- [ ] 3.7 Pokaż/ukryj hasło i focus

### Phase 4: Hasło z landingu (N1) i przekazanie do `design-planner`

#### Automated

- [ ] 4.1 Testy jednostkowe helpera przechodzą
- [ ] 4.2 Lint i build
- [ ] 4.3 Nowy e2e przechodzi i pada bez przekierowania
- [ ] 4.4 Cały e2e zielony
- [ ] 4.5 `.theme-legacy` ma właściciela w kolejce

#### Manual

- [ ] 4.6 Pełny przepływ z nowym kontem lokalnie
- [ ] 4.7 Logowanie bez hasła prowadzi na `/plan/month`
- [ ] 4.8 Hasło ze znakami specjalnymi wyświetla się dosłownie
