# Polska wersja powierzchni dla niezalogowanego — Implementation Plan

## Overview

Cała powierzchnia, którą widzi niezalogowany nauczyciel — strona główna, pasek nad nią oraz
ekrany logowania, rejestracji i potwierdzenia e-maila — jest dziś po angielsku i mówi o innym
produkcie niż 10xPreschool. Ta zmiana zastępuje copy startera polską treścią opisującą
faktyczny produkt i naprawia `lang`/tytuł w powłoce HTML.

Zgłoszenie #7 z triage'u 2026-08-30. **Poprawka poza roadmapą** — bez FR i bez wiersza `S-NN`
(`roadmap.md` §Kandydaci → „Poza paczką M-02"; `next-actions.md` §Triage).

## Current State Analysis

Granica polski/angielski przebiega dziś dokładnie przez próg logowania. Zalogowana aplikacja
jest po polsku (`src/components/AppHeader.astro` — „Wyloguj się"; widoki `plan.astro`,
`plan/week.astro`, `plan/month.astro` z polskimi tytułami). Wszystko przed logowaniem jest
angielskie i pochodzi ze startera:

- **`src/components/Welcome.astro`** — to nie jest tekst do przetłumaczenia, tylko tekst
  **o innym produkcie**. Nagłówek: „10x Astro Starter". Podtytuł reklamuje „a production-ready
  starter with authentication, modern tooling, and a cosmic developer experience". Trzy kafelki
  opisują Supabase auth, stack („Astro 5, React 19, Tailwind 4") i ESLint/Prettier — treść
  skierowana do programisty oceniającego szablon, nie do nauczyciela przedszkolnego.
  Kafelek „Modern Stack" jest przy tym **nieprawdziwy**: projekt jest na Astro 6 (`CLAUDE.md`).
- **`src/components/Topbar.astro`** — „Not signed in", „Sign in", „Sign up". Renderuje się
  wyłącznie wewnątrz `Welcome.astro` (potwierdzone: `AppHeader.astro` tylko **wspomina** o nim
  w komentarzu, nie importuje). Jego gałąź `user ? …` jest **martwym kodem** na tej ścieżce —
  `index.astro` przekierowuje zalogowanego na `/plan/month`, zanim Topbar się wyrenderuje.
- **`src/layouts/Layout.astro`** — `<html lang="en">` dla **całej** aplikacji, w tym dla
  polskich ekranów zalogowanych. Domyślny `title` to `"10x Astro Starter"`, a
  `src/pages/index.astro` jako jedyna strona nie podaje własnego `title` — więc ten domyślny
  jest tytułem karty przeglądarki na stronie głównej.
- **`src/pages/auth/{signin,signup,confirm-email}.astro`** — angielskie `title`, nagłówki
  i linki przełączające („Don't have an account?", „Already have an account?").
- **`src/components/auth/{SignInForm,SignUpForm,PasswordToggle}.tsx`** — etykiety,
  placeholdery, komunikaty walidacji, `pendingText`, treść przycisku, `aria-label`.
  `FormField.tsx`, `SubmitButton.tsx` i `ServerError.tsx` **nie zawierają** własnych napisów —
  wszystko dostają propsami, więc nie wymagają zmian.
- **`src/pages/api/auth/{signin,signup}.ts`** — nasz własny angielski string
  `"Supabase is not configured"` trafia do `?error=` i jest renderowany przez `ServerError`.

### Key Discoveries:

- Copy hero i kafelków wymaga **zastąpienia, nie tłumaczenia** — tłumaczenie dałoby polską
  reklamę szablonu Astro (`src/components/Welcome.astro:39-47`).
- `lang="en"` w `src/layouts/Layout.astro:12` to defekt dostępności obejmujący całą polską
  aplikację. Żaden inny slice nie będzie miał powodu dotknąć tego pliku.
- `src/pages/index.astro:18` renderuje `<Layout>` bez `title` — jedyne takie miejsce w projekcie.
- **`src/components/auth/SignUpForm.tsx:59-61` nie zawiera napisu, tylko angielską logikę
  liczby mnogiej**: `{N} more character{N !== 1 ? "s" : ""} needed`. Polski ma trzy formy
  (1 znak / 2–4 znaki / 5+ znaków), więc przeniesienie tej konstrukcji 1:1 wyprodukuje
  „Jeszcze 1 znaków". Rozstrzygnięcie: **omijamy odmianę**, nie implementujemy jej — patrz
  Faza 2, zmiana 5.
- `src/layouts/Layout.astro` renderuje już polski `Banner` („Uwaga:", „Dokumentacja"),
  więc polska powłoka nie wprowadza nowej konwencji, tylko domyka istniejącą.
- `error.message` z Supabase (`src/pages/api/auth/signin.ts:16`) jest angielski i renderowany
  dosłownie — poza zakresem, patrz niżej.

## Desired End State

Niezalogowany nauczyciel przechodzi ścieżkę `/` → rejestracja → logowanie i **nie widzi
angielskiego tekstu napisanego przez nas**. Strona główna mówi o planowaniu zajęć
przedszkolnych, a nie o szablonie Astro. Powłoka HTML deklaruje `lang="pl"`, a tytuł karty
przeglądarki niesie nazwę produktu.

Weryfikacja: zakresowany grep na konkretne angielskie frazy w plikach objętych zmianą (patrz
Kryteria sukcesu — grep uruchamiany **najpierw na stanie sprzed zmiany**, żeby zobaczyć go na
czerwono) plus ręczne przejście lejka w przeglądarce.

## What We're NOT Doing

- **Nie mapujemy komunikatów błędów z Supabase.** `error.message` (np. „Invalid login
  credentials") wciąż dotrze do użytkownika po angielsku. Zapisujemy to jako jawny follow-up
  z właścicielem — Faza 2, zmiana 7. Powód: mapowanie cudzych komunikatów to logika w trasie
  API, nie wymiana copy, a lista komunikatów Supabase jest niestabilna i nieudokumentowana.
- **Nie wprowadzamy i18n ani drugiej wersji językowej.** Aplikacja jest jednojęzyczna po
  polsku; napisy zostają w miejscu użycia, jak dotychczas.
- **Nie dodajemy testów automatycznych na język.** To teren `test-plan.md`, którego faza 2
  jeszcze nie ruszyła (`next-actions.md` §Krok 2) — zmiana copy nie zaczyna infrastruktury
  testowej poza swoim rolloutem.
- **Nie ruszamy ekranów zalogowanych** (`plan.astro`, `plan/week.astro`, `plan/month.astro`,
  `AppHeader.astro`, komponenty w `src/components/plan/`) — są już po polsku.
- **Nie zmieniamy warstwy wizualnej** — klasy Tailwind, układ, orby, pole gwiazd, ikony SVG
  i struktura kafelków zostają. Zmieniają się wyłącznie treści tekstowe.
- **Nie usuwamy martwej gałęzi `user ? …` w `Topbar.astro`.** Kusi, ale to zmiana strukturalna
  pod szyldem zmiany copy; gałąź zostaje i zostaje przetłumaczona razem z resztą.
- **Nie obiecujemy funkcji z `M-02`** w kafelkach — podgląd aktywności w siatce miesiąca,
  wydruk tygodnia i regeneracja tygodnia z zastępowaniem jeszcze nie istnieją.

## Implementation Approach

Dwie fazy, każda kończąca się sprawdzalną całością. Faza 1 domyka stronę główną (nauczyciel,
który wejdzie na `/`, widzi polski produkt). Faza 2 domyka lejek za oboma przyciskami CTA.
Podział jest naturalny — faza 1 dotyka wyłącznie plików `.astro` powłoki i landingu, faza 2
schodzi do komponentów React i dwóch tras API.

Treści poniżej są **propozycją do doszlifowania przez implementującego**, nie dosłownym
dyktandem — z jednym wyjątkiem: kafelki nie mogą opisywać funkcji spoza zamkniętych slice'ów
`S-01`…`S-05`, `S-08`.

## Critical Implementation Details

**Pułapka grepa weryfikacyjnego.** Wzorzec sprawdzający „nie ma angielskiego" musi obejmować
wyłącznie **frazy widoczne dla użytkownika**, nigdy identyfikatory. W plikach fazy 2 słowo
`password` występuje w `type="password"`, `confirmPassword`, `showPassword`, `PasswordToggle`,
`MIN_PASSWORD_LENGTH` — wzorzec `Password` byłby czerwony na zawsze, więc bramka zostałaby
zignorowana. Lista wzorców jest dlatego listą pełnych fraz, a nie pojedynczych słów.

## Phase 1: Powłoka i strona główna

### Overview

Po tej fazie `/` jest w całości po polsku i mówi o 10xPreschool, a powłoka HTML deklaruje
polski język dla całej aplikacji.

### Changes Required:

#### 1. Powłoka HTML — język i domyślny tytuł

**File**: `src/layouts/Layout.astro`

**Intent**: Aplikacja jest polska, a powłoka deklaruje angielski — czytniki ekranu wybiorą złą
syntezę mowy, a wyszukiwarki złe indeksowanie. Domyślny tytuł reklamuje starter.

**Contract**: `<html lang="en">` → `<html lang="pl">` (linia 12). Wartość domyślna propsa
`title` z `"10x Astro Starter"` na nazwę produktu (`"10xPreschool"`). Sygnatura `Props` i
sposób przekazywania `title` przez pozostałe strony bez zmian.

#### 2. Strona główna — własny tytuł

**File**: `src/pages/index.astro`

**Intent**: Jedyna strona bez własnego `title`; po zmianie 1 dziedziczyłaby samą nazwę
produktu, co jest poprawne, ale ubogie jako tytuł karty i wynik wyszukiwania.

**Contract**: `<Layout>` → `<Layout title="…">` z tytułem łączącym nazwę produktu z tym, co
robi (wzór z pozostałych stron: `Plan miesiąca — …`). Logika przekierowania zalogowanego
użytkownika w części frontmatter zostaje nietknięta.

#### 3. Hero — nazwa produktu i problem nauczyciela

**File**: `src/components/Welcome.astro`

**Intent**: Zastąpić nagłówek i podtytuł startera treścią mówiącą, po co ten produkt istnieje,
językiem `prd.md` §Vision & Problem Statement i §Persona — żmudne planowanie 20–22 dni zajęć
raz w miesiącu, hasło zamieniane w gotowe propozycje aktywności.

**Contract**: Treść tekstowa `<h1>` (dziś „10x Astro Starter") i `<p>` pod nim. Wszystkie klasy
Tailwind, gradienty i struktura bez zmian. Propozycja:

- `<h1>`: `10xPreschool`
- `<p>`: `Wpisz hasło — na przykład „Dinozaury" — a dostaniesz gotowe propozycje aktywności na każdy dzień. Zaplanuj cały miesiąc zajęć w jednym miejscu, zamiast wymyślać 22 dni od zera.`

#### 4. Przyciski CTA

**File**: `src/components/Welcome.astro`

**Intent**: Oba przyciski hero są po angielsku.

**Contract**: Treść dwóch `<a>` — „Sign In" → „Zaloguj się", „Sign Up" → „Załóż konto".
Atrybuty `href` (`/auth/signin`, `/auth/signup`) i klasy bez zmian.

#### 5. Trzy kafelki — zdolności produktu zamiast reklamy startera

**File**: `src/components/Welcome.astro`

**Intent**: Kafelki opisują dziś Supabase auth, stack i narzędzia deweloperskie — treść dla
programisty oceniającego szablon. Zastąpić je trzema zdolnościami, które aplikacja **realnie
ma**, każda z pokryciem w zamkniętym slice.

**Contract**: Treść `<h3>` i `<p>` w każdym z trzech kafelków. Struktura `<div>`, klasy i
ikony SVG zostają — ikony są abstrakcyjne (kłódka, bryła, nawiasy kątowe), więc pasują lub nie
przeszkadzają; podmiana ikon jest opcjonalna i nie jest wymogiem tej fazy. Propozycja
(w nawiasie pokrycie, **nie** do umieszczenia w treści):

1. **Propozycje na dzień i na tydzień** — „Wpisz hasło dla wybranego dnia albo od razu dla
   całego tygodnia roboczego. Każdy dzień dostaje własne ujęcie tematu." (`S-01`, `S-03`)
2. **Ty decydujesz, co zostaje** — „Każdą propozycję możesz zmienić, zatwierdzić albo usunąć.
   Nic nie trafia do planu bez Twojej akceptacji." (`S-02`, `S-05`)
3. **Cały miesiąc na jednym ekranie** — „Siatka miesiąca pokazuje, które dni są już
   zaplanowane i czym się różnią." (`S-04`, `S-08`)

**Zakaz**: żaden kafelek nie opisuje podglądu aktywności w siatce, wydruku ani regeneracji
tygodnia z zastępowaniem — te funkcje należą do `M-02` i jeszcze nie istnieją.

#### 6. Pasek nad stroną główną

**File**: `src/components/Topbar.astro`

**Intent**: Ostatni angielski element strony głównej.

**Contract**: Treści tekstowe w obu gałęziach warunku: „Not signed in" → „Nie jesteś
zalogowany", „Sign in" → „Zaloguj się", „Sign up" → „Załóż konto", „Sign out" → „Wyloguj się"
(brzmienie zgodne z `AppHeader.astro`). Link „Plan miesiąca" jest już po polsku. Struktura
warunku `user ? … : …` zostaje bez zmian, mimo że gałąź dla zalogowanego jest na tej ścieżce
martwa — patrz §What We're NOT Doing.

### Success Criteria:

#### Automated Verification:

- Grep uruchomiony **przed** zmianą zwraca trafienia (dowód, że bramka potrafi nie przejść):
  `grep -nE "10x Astro Starter|Authentication Ready|Modern Stack|Developer Experience|Not signed in|Sign In|Sign Up|Sign in|Sign up|Sign out|lang=\"en\"" src/layouts/Layout.astro src/pages/index.astro src/components/Welcome.astro src/components/Topbar.astro`
- Ten sam grep po zmianie zwraca **zero trafień** (kod wyjścia 1)
- `src/layouts/Layout.astro` zawiera `lang="pl"`: `grep -q 'lang="pl"' src/layouts/Layout.astro`
- `src/pages/index.astro` przekazuje `title`: `grep -q '<Layout title=' src/pages/index.astro`
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Poza czterema plikami fazy nic się nie zmieniło:
  `git diff --name-only master..HEAD` wypisuje wyłącznie te cztery ścieżki plus pliki `context/`

#### Manual Verification:

- `/` w przeglądarce: hero, oba przyciski, wszystkie trzy kafelki i pasek są po polsku
- Tytuł karty przeglądarki na `/` nie zawiera „Astro Starter"
- Zalogowany użytkownik wchodzący na `/` nadal trafia na `/plan/month` (przekierowanie nietknięte)
- Układ strony nie rozjechał się po zmianie długości tekstów — sprawdzone na szerokości
  mobilnej i desktopowej (dłuższy polski podtytuł i dłuższe nagłówki kafelków)
- Żaden kafelek nie obiecuje funkcji, której aplikacja nie ma

**Implementation Note**: Po zaliczeniu weryfikacji automatycznej zatrzymaj się i poczekaj na
ręczne potwierdzenie, zanim przejdziesz do Fazy 2.

---

## Phase 2: Ekrany logowania i rejestracji

### Overview

Po tej fazie oba przyciski CTA ze strony głównej prowadzą w polskie ekrany, a jedyny angielski
tekst, jaki nauczyciel może zobaczyć, pochodzi z Supabase — i jest zapisany jako follow-up.

### Changes Required:

#### 1. Strona logowania

**File**: `src/pages/auth/signin.astro`

**Intent**: Tytuł, nagłówek i link do rejestracji po polsku.

**Contract**: `title="Sign in"` → polski tytuł; treść `<h1>`; zdanie „Don't have an account?"
z linkiem „Sign up". Props `serverError` przekazywany do `SignInForm` bez zmian.

#### 2. Strona rejestracji

**File**: `src/pages/auth/signup.astro`

**Intent**: To samo dla rejestracji.

**Contract**: `title="Sign up"` → polski tytuł; treść `<h1>`; zdanie „Already have an account?"
z linkiem „Sign in".

#### 3. Strona potwierdzenia e-maila

**File**: `src/pages/auth/confirm-email.astro`

**Intent**: Obie gałęzie obiektu `content` (dev z auto-potwierdzeniem i produkcyjna
z wysłanym mailem) są po angielsku.

**Contract**: Pola `heading`, `description`, `linkText` w obu gałęziach wyrażenia
warunkowego. Warunek `isAutoConfirmed` (`import.meta.env.DEV`) i pole `emoji` bez zmian.
`title={content.heading}` zacznie automatycznie nieść polski tytuł.

#### 4. Formularz logowania

**File**: `src/components/auth/SignInForm.tsx`

**Intent**: Etykiety, placeholdery, komunikaty walidacji i stany przycisku po polsku.

**Contract**: Wartości `label`, `placeholder`, komunikaty przypisywane do `next.email`
i `next.password` w walidacji, `pendingText` oraz treść dziecka `SubmitButton`. Klucze
w obiekcie `errors`, nazwy pól (`id`, `name`), `action`/`method` formularza i logika walidacji
bez zmian. Placeholder `you@example.com` zostaje — jest neutralny językowo.

#### 5. Formularz rejestracji — bez odmiany przez liczbę

**File**: `src/components/auth/SignUpForm.tsx`

**Intent**: To samo co w zmianie 4, **plus** podpowiedź o długości hasła, która nie jest
napisem, tylko angielską konstrukcją liczby mnogiej.

**Contract**: Wartości `label`, `placeholder`, komunikaty walidacji (w tym „Passwords do not
match"), `pendingText` i treść `SubmitButton`. Osobno linie 59–61: dzisiejsza konstrukcja
`{N} more character{N !== 1 ? "s" : ""} needed` **nie jest tłumaczona 1:1** — polski wymaga
trzech form („1 znak" / „2 znaki" / „5 znaków"), a przeniesienie warunku angielskiego da
„Jeszcze 1 znaków". Sformułuj podpowiedź tak, żeby liczba **nie stała przed odmienianym
rzeczownikiem**, np. `Brakuje jeszcze znaków: {N}`. Warunek pokazywania podpowiedzi i stała
`MIN_PASSWORD_LENGTH` zostają nietknięte; placeholder hasła ma odczytywać długość z tej
stałej lub ją powtarzać zgodnie z jej aktualną wartością, a nie z zaszytego „6".

#### 6. Przełącznik widoczności hasła

**File**: `src/components/auth/PasswordToggle.tsx`

**Intent**: `aria-label` jest po angielsku — czytnik ekranu na polskiej stronie odczyta
angielską frazę.

**Contract**: Obie wartości wyrażenia `visible ? "Hide password" : "Show password"` (linia 14).
Nazwa propsa `visible` i logika bez zmian.

#### 7. Nasz własny komunikat konfiguracyjny + follow-up

**Files**: `src/pages/api/auth/signin.ts`, `src/pages/api/auth/signup.ts`,
`context/changes/pl-landing-copy/follow-ups/supabase-error-copy.md`

**Intent**: `"Supabase is not configured"` to **nasz** string, renderowany użytkownikowi przez
`ServerError` — wymieniamy go. `error.message` prosto z Supabase zostaje angielski i zostaje
zapisany jako jawna, przypisana pozycja, żeby nie zniknął z pola widzenia (`lessons.md` —
„Odroczone sprzątanie danych musi mieć właściciela": odroczona praca bez właściciela i bez
wpisu przestaje istnieć).

**Contract**: Literał `"Supabase is not configured"` w obu trasach (linia 11 w każdej) →
polski komunikat. Przekazanie `error.message` (linia 16 w każdej) **bez zmian**. Plik
follow-upu nazywa problem, właściciela (Janusz) i bramkę wejścia; nie proponuje rozwiązania.

### Success Criteria:

#### Automated Verification:

- Grep uruchomiony **przed** zmianą zwraca trafienia (dowód, że bramka potrafi nie przejść) —
  wyłącznie pełne frazy widoczne dla użytkownika, żadnych identyfikatorów (patrz §Critical
  Implementation Details):
  ⚠️ Wzorzec poprawiony w trakcie implementacji: pierwotna lista pomijała
  `Password must be at least` z `SignUpForm.tsx` — zmaterializowane ryzyko z §Open Risks
  („lista fraz jest ręczna"). Bramka bez tej frazy przechodziła z angielskim tekstem w kodzie.
  `grep -nE "Sign in|Sign up|Don't have an account|Already have an account|Registration successful|Check your email|Go to sign in|Back to sign in|Your account has been created|We've sent a confirmation link|Email is required|Enter a valid email address|Password is required|Password must be at least|Please confirm your password|Passwords do not match|Your password|Re-enter your password|Confirm password|Min\. 6 characters|more character|Signing in|Creating account|Create account|Hide password|Show password|Supabase is not configured" src/pages/auth/*.astro src/components/auth/*.tsx src/pages/api/auth/signin.ts src/pages/api/auth/signup.ts`
- Ten sam grep po zmianie zwraca **zero trafień** (kod wyjścia 1)
- `error.message` z Supabase jest nadal przekazywany bez zmian w obu trasach:
  `grep -c "encodeURIComponent(error.message)" src/pages/api/auth/signin.ts src/pages/api/auth/signup.ts` zwraca `1` dla każdego pliku
- Plik follow-upu istnieje: `test -f context/changes/pl-landing-copy/follow-ups/supabase-error-copy.md`
- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Grep z Fazy 1 nadal zwraca zero trafień (faza 2 nie cofnęła fazy 1)

#### Manual Verification:

- Ścieżka rejestracji: `/` → „Załóż konto" → formularz → potwierdzenie e-maila — wyłącznie polski
- Ścieżka logowania: `/` → „Zaloguj się" → formularz — wyłącznie polski
- Walidacja po stronie klienta: puste pola, niepoprawny e-mail, za krótkie hasło, niezgodne
  hasła — wszystkie komunikaty po polsku
- Podpowiedź o długości hasła jest poprawna gramatycznie przy **1** brakującym znaku
  i przy **kilku** (to jest ten przypadek, który psuje dosłowne tłumaczenie)
- Przełącznik widoczności hasła: `aria-label` po polsku (sprawdzone w inspektorze albo czytnikiem)
- Logowanie z błędnym hasłem: komunikat z Supabase pojawia się po angielsku — **to jest
  oczekiwane** i pokryte follow-upem
- Poprawne logowanie nadal prowadzi do `/plan/month`

**Implementation Note**: Po zaliczeniu weryfikacji automatycznej zatrzymaj się i poczekaj na
ręczne potwierdzenie.

---

## Testing Strategy

Zmiana nie dodaje testów automatycznych — to teren `test-plan.md`, którego faza 2 jeszcze nie
ruszyła (`next-actions.md` §Krok 2). Bramką jest zakresowany grep opisany w kryteriach każdej
fazy, uruchamiany **najpierw na stanie sprzed zmiany**, żeby zobaczyć go na czerwono —
zgodnie z `lessons.md` §„Kryterium weryfikacji musi móc nie przejść".

### Manual Testing Steps:

1. `npm run dev`, wejść na `/` jako niezalogowany — przeczytać całą stronę
2. Zwęzić okno do szerokości telefonu — sprawdzić, czy dłuższe polskie teksty nie rozbijają
   siatki kafelków ani przycisków
3. Kliknąć „Załóż konto", przejść rejestrację do ekranu potwierdzenia
4. Wrócić na `/`, kliknąć „Zaloguj się", wywołać każdy błąd walidacji po kolei
5. Zalogować się poprawnie — potwierdzić przekierowanie na `/plan/month`
6. Wejść ponownie na `/` będąc zalogowanym — potwierdzić przekierowanie (Topbar w gałęzi
   `user` nie powinien się w ogóle pokazać)

## Migration Notes

Brak — zmiana nie dotyka bazy danych, schematu ani danych użytkowników.

⚠️ **Merge do `master` = deploy na produkcję** przez Cloudflare Workers Builds (`CLAUDE.md`
§CI). Traktuj PR jak wydanie, nie jak integrację.

## References

- Zgłoszenie i miejsce w kolejce: `context/foundation/next-actions.md` §Triage #7, §Krok 1
- Status poza roadmapą: `context/foundation/roadmap.md` §Kandydaci → „Poza paczką M-02"
- Źródło treści hero: `context/foundation/prd.md` §Vision & Problem Statement, §User & Persona
- Pokrycie kafelków: `context/foundation/roadmap.md` §Done (`S-01`…`S-05`, `S-08`)
- Reguły weryfikacji: `context/foundation/lessons.md` §„Kryterium weryfikacji musi móc nie
  przejść", §„Odroczone sprzątanie danych musi mieć właściciela"
- Wzór polskiego copy w zalogowanej aplikacji: `src/components/AppHeader.astro`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Powłoka i strona główna

#### Automated

- [x] 1.1 Grep fazy 1 uruchomiony przed zmianą zwraca trafienia (bramka widziana na czerwono) — c7481e9
- [x] 1.2 Grep fazy 1 po zmianie zwraca zero trafień — c7481e9
- [x] 1.3 `src/layouts/Layout.astro` zawiera `lang="pl"` — c7481e9
- [x] 1.4 `src/pages/index.astro` przekazuje własny `title` — c7481e9
- [x] 1.5 Lint przechodzi: `npm run lint` — c7481e9
- [x] 1.6 Build przechodzi: `npm run build` — c7481e9
- [x] 1.7 `git diff --name-only master..HEAD` wypisuje wyłącznie cztery pliki fazy plus `context/` — c7481e9

#### Manual

- [x] 1.8 Strona `/` w całości po polsku — hero, przyciski, trzy kafelki, pasek — c7481e9
- [x] 1.9 Tytuł karty przeglądarki na `/` nie zawiera „Astro Starter" — c7481e9
- [x] 1.10 Zalogowany na `/` nadal trafia na `/plan/month` — c7481e9
- [ ] 1.11 Układ nie rozjechał się na szerokości mobilnej i desktopowej
- [x] 1.12 Żaden kafelek nie obiecuje funkcji spoza `S-01`…`S-05`, `S-08` — c7481e9

### Phase 2: Ekrany logowania i rejestracji

#### Automated

- [x] 2.1 Grep fazy 2 uruchomiony przed zmianą zwraca trafienia (bramka widziana na czerwono)
- [x] 2.2 Grep fazy 2 po zmianie zwraca zero trafień
- [x] 2.3 `error.message` z Supabase nadal przekazywany bez zmian w obu trasach
- [x] 2.4 Plik `context/changes/pl-landing-copy/follow-ups/supabase-error-copy.md` istnieje
- [x] 2.5 Lint przechodzi: `npm run lint`
- [x] 2.6 Build przechodzi: `npm run build`
- [x] 2.7 Grep z fazy 1 nadal zwraca zero trafień

#### Manual

- [x] 2.8 Ścieżka rejestracji `/` → „Załóż konto" → potwierdzenie e-maila w całości po polsku
- [x] 2.9 Ścieżka logowania `/` → „Zaloguj się" → formularz w całości po polsku
- [x] 2.10 Wszystkie komunikaty walidacji po stronie klienta po polsku
- [x] 2.11 Podpowiedź o długości hasła poprawna gramatycznie przy 1 i przy kilku znakach
- [x] 2.12 `aria-label` przełącznika hasła po polsku
- [x] 2.13 Błąd z Supabase pojawia się po angielsku — oczekiwane, pokryte follow-upem
- [x] 2.14 Poprawne logowanie nadal prowadzi do `/plan/month`
