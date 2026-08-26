# S-04 `month-home` — plan implementacji

## Overview

Zalogowany nauczyciel po wejściu do aplikacji ma lądować w widoku miesiąca, a nie na pulpicie ze
starterowego szablonu. Ten slice **nie buduje siatki** — ta powstała jako p6 wewnątrz S-03
([month.astro](src/pages/plan/month.astro), [MonthGrid.astro](src/components/plan/MonthGrid.astro)).
Praca polega na przeniesieniu punktu wejścia i wygaszeniu `/dashboard`.

Rdzeniem nie jest przekierowanie, tylko **jedna kontrolka**. `/dashboard` trzyma dziś jedyny osiągalny
w zalogowanej aplikacji przycisk wylogowania. Drugi jest w [Topbar.astro](src/components/Topbar.astro),
ale Topbar renderuje się wyłącznie wewnątrz `Welcome.astro` — na stronie dla **nie**zalogowanych.
W momencie, w którym `/` zaczyna przekierowywać zalogowanego na `/plan/month`, `Welcome.astro` staje
się dla niego nieosiągalne. Skasowanie pulpitu przed przeniesieniem tej kontrolki zamyka nauczyciela
w sesji bez wyjścia. Dlatego powłoka powstaje **przed** kasowaniem, a nie razem z nim.

## Current State Analysis

Zweryfikowane w kodzie na commicie `4c591f2`:

- **Punkt wejścia to szablon startera.** [signin.ts:19](src/pages/api/auth/signin.ts#L19) przekierowuje
  na `/`, a [index.astro](src/pages/index.astro) renderuje [Welcome.astro](src/components/Welcome.astro)
  — angielską stronę marketingową „10x Astro Starter". [dashboard.astro](src/pages/dashboard.astro)
  też jest szablonem (angielskie nagłówki, `Welcome, {user?.email}`) z trzema dopisanymi linkami do
  `/plan/month`, `/plan/week` i `/plan`.
- **Wylogowanie jest osiągalne z dokładnie jednego miejsca w zalogowanej aplikacji** —
  [dashboard.astro:37-44](src/pages/dashboard.astro#L37-L44). Endpoint
  [POST /api/auth/signout](src/pages/api/auth/signout.ts) działa i przekierowuje na `/`; to nie
  endpoint jest problemem, tylko umiejscowienie kontrolki.
- **Trzy linki celują w `/dashboard`:** [plan.astro:37](src/pages/plan.astro#L37) i
  [plan/month.astro:46](src/pages/plan/month.astro#L46) („← Wróć do pulpitu") oraz
  [Topbar.astro:13](src/components/Topbar.astro#L13). Do tego wpis w
  [middleware.ts:8](src/middleware.ts#L8) (`PROTECTED_ROUTES`), wiersz w tabeli tras w `README.md:147`
  i zdanie „Protected page example: `src/pages/dashboard.astro`" w `CLAUDE.md:45`.
- **`/plan/week` już umie wracać do miesiąca** — [week.astro:42](src/pages/plan/week.astro#L42)
  linkuje `/plan/month?month=${month}`. To wzorzec, który powtarza faza 3 dla dnia.
- **Każda strona planowania ma własny, ręcznie napisany nagłówek**: back-link, `<h1>` z gradientem,
  akapit opisu, „Zalogowano jako {email}" i — na miesiącu i tygodniu — nawigację w przód/tył.
  Powtarza się tylko wiersz z e-mailem; reszta jest różna z sensem.
- **Kontenery są różne z rozmysłem:** `max-w-2xl` (dzień), `max-w-3xl` (tydzień), `max-w-4xl`
  (miesiąc). Pełny layout-wrapper wymagałby propa na szerokość i sięgnąłby głębiej w działający kod
  S-01…S-03, niż ten slice potrzebuje.
- **`resolveMonth`** ([day-plan-dates.ts:118](src/lib/day-plan-dates.ts#L118)) przyjmuje `null`
  i wraca bieżącym miesiącem, więc `/plan/month` bez parametru jest poprawnym celem przekierowania.
- **Weryfikacja to lint, check i build — nic więcej.** `package.json` ma `lint`, `build`, `test:db`;
  brak runnera testów TS/React i brak e2e. `test:db` to pgTAP dla schematu, którego ten slice nie
  rusza. Wszystko, co użytkownik zobaczy, sprawdza się ręcznie.
- **Middleware chroni prefiksami** — `PROTECTED_ROUTES.some((route) => pathname.startsWith(route))`.
  `/plan` pokrywa `/plan`, `/plan/week` i `/plan/month` jednym wpisem; `/` nie jest i nie może być
  chroniona, bo jest stroną dla niezalogowanych.

## Desired End State

Nauczyciel wpisuje e-mail i hasło na `/auth/signin` i ląduje bezpośrednio na `/plan/month` — widzi
bieżący miesiąc, dni z planem oznaczone kolorem, przycisk „Zaplanuj tydzień" przy każdym wierszu.
Wchodzi w tydzień, z tygodnia w dzień, z dnia wraca do miesiąca. Na każdym z tych trzech ekranów
u góry stoi ten sam pasek: nazwa aplikacji prowadząca do miesiąca, jego e-mail i „Wyloguj się".

Kiedy następnym razem otworzy samą domenę, `/` rozpozna sesję i przeniesie go na `/plan/month` bez
przystanku. `/dashboard` nie istnieje. Nauczyciel niezalogowany widzi na `/` tę samą stronę
powitalną, co dziś.

Weryfikacja: `npm run lint`, `npx astro check` i `npm run build` przechodzą; `grep -rn "/dashboard" src/`
nie zwraca nic; ręczny przebieg logowanie → miesiąc → tydzień → dzień → miesiąc → wylogowanie działa
bez wpisywania URL-a z ręki.

### Key Discoveries:

- Siatka miesiąca jest gotowa i nietknięta przez ten slice —
  [MonthGrid.astro](src/components/plan/MonthGrid.astro) linkuje dni do `/plan?date=` i wiersze do
  `/plan/week?from=`. Punkt wejścia to jedyne, czego brakuje.
- Kolejność faz jest wymuszona, nie estetyczna: `/dashboard` jest jedynym wyjściem z sesji do czasu,
  aż powstanie powłoka ([dashboard.astro:37](src/pages/dashboard.astro#L37)).
- `Topbar.astro` jest szablonem startera po angielsku („Sign in", „Sign out") obsługującym stronę
  marketingową. Ponowne użycie go jako powłoki zalogowanej aplikacji wciągnęłoby angielską kopię do
  interfejsu, który PRD wymaga w całości po polsku — dlatego powstaje osobny komponent.
- `week.astro` już ma docelowy kształt back-linku; dzień i miesiąc do niego dorównują.

## What We're NOT Doing

- **Nie ruszamy `Welcome.astro`.** Strona dla niezalogowanych zostaje angielskim szablonem startera;
  poprawiamy w niej wyłącznie link do kasowanego `/dashboard`. To znaczy, że wymóg PRD „cały
  interfejs … w języku polskim" pozostaje naruszony na pierwszej stronie, jaką widzi nowy
  nauczyciel — świadomie odłożone, odnotowane w § Open Risks planu-briefu.
- **Nie ruszamy `MonthGrid.astro` ani `readMonthSummary`.** Żadnego podglądu aktywności w kafelku,
  żadnych nowych kolumn w odczycie — to S-07 (`month-day-preview`), który ma własną otwartą
  niewiadomą o wzorzec interakcji.
- **Nie budujemy pełnego layoutu-powłoki.** Tło, szerokość kontenera i `py-10` zostają zduplikowane
  w trzech stronach. Wyciągamy tylko pasek, który faktycznie się powtarza.
- **Nie dodajemy potwierdzenia wylogowania.** Formularz posta i przekierowuje, tak jak dziś.
- **Nie zostawiamy `/dashboard` jako przekierowania.** Trasa znika w całości.
- **Nie ruszamy schematu bazy ani migracji.** Kolejka siedmiu migracji na hosted project pozostaje
  otwarta jako pozycja wdrożeniowa S-03 — ten slice jej nie dotyka i nie domyka.

## Implementation Approach

Cztery fazy w kolejności, która ani przez chwilę nie zostawia nauczyciela bez wyjścia z sesji:
najpierw powstaje powłoka z wylogowaniem (faza 1), potem przenosi się punkt wejścia (faza 2),
dopiero wtedy znika pulpit (faza 3), a na końcu zapisujemy, co ta decyzja zrobiła z S-06 (faza 4).

Po fazie 1 przycisk wylogowania jest w **czterech** miejscach (trzy strony planowania + pulpit) —
nadmiarowo, ale bezpiecznie. Faza 3 usuwa czwarte.

## Critical Implementation Details

**Timing & lifecycle.** Faza 1 musi być scalona przed fazą 3. Odwrotna kolejność — albo scalenie obu
w jeden commit, w którym kasowanie idzie pierwsze — daje zakres, w którym `/` przekierowuje
zalogowanego na `/plan/month`, `Welcome.astro` z Topbarem jest dla niego nieosiągalny, a pulpitu już
nie ma: sesji nie da się zakończyć z interfejsu.

**State sequencing.** Przekierowanie z `/` dotyczy wyłącznie zalogowanego. `POST /api/auth/signout`
przekierowuje na `/` i to zostaje bez zmian — w chwili tego przekierowania ciasteczko sesji jest już
skasowane, więc `index.astro` zobaczy `user === null` i wyrenderuje `Welcome.astro`. Warunek
w `index.astro` musi czytać `Astro.locals.user` (ustawiane przez middleware dla **każdego** żądania,
[middleware.ts:17-26](src/middleware.ts#L17-L26)), a nie budować drugiego klienta Supabase.

## Phase 1: Powłoka zalogowanej aplikacji

### Overview

Powstaje jeden komponent paska, który niesie wylogowanie, i trafia na trzy strony planowania.
Nic nie jest jeszcze kasowane — po tej fazie wylogowanie jest osiągalne z większej liczby miejsc niż
przed nią, nigdy z mniejszej.

### Changes Required:

#### 1. Pasek zalogowanej aplikacji

**File**: `src/components/plan/AppHeader.astro` (nowy)

**Intent**: Jedyne miejsce w zalogowanej aplikacji, które niesie tożsamość sesji i wyjście z niej.
Powstaje jako osobny komponent, a nie rozszerzenie `Topbar.astro`, bo Topbar jest angielskim
szablonem startera obsługującym stronę marketingową i jego los jest niezwiązany z losem powłoki.

**Contract**: Komponent Astro bez propsów; czyta `Astro.locals.user` samodzielnie, tym samym wzorcem
co [Topbar.astro:2](src/components/Topbar.astro#L2). Renderuje w jednym wierszu: link do
`/plan/month` z nazwą aplikacji, `user.email` oraz `<form method="POST" action="/api/auth/signout">`
z przyciskiem „Wyloguj się". Cała kopia po polsku. Stylistyka dorównuje do istniejącego paska
(`rounded-xl border border-white/10 bg-white/5`), ale klasy są własne — nie importujemy Topbara.
Bez `useState` i bez handlerów, więc Astro, nie React (reguła z `CLAUDE.md`).

#### 2. Montaż powłoki na stronach planowania

**File**: `src/pages/plan/month.astro`, `src/pages/plan/week.astro`, `src/pages/plan.astro`

**Intent**: Pasek staje u góry `<main>`, nad istniejącym `<header>`. Wiersz „Zalogowano jako {email}"
w każdej z trzech stron staje się duplikatem tego, co niesie pasek, i znika.

**Contract**: Import `AppHeader` i wstawienie go jako pierwszego dziecka `<main>`; usunięcie linii
`{user?.email && <p …>Zalogowano jako {user.email}</p>}` z
[month.astro:60](src/pages/plan/month.astro#L60), [week.astro:57](src/pages/plan/week.astro#L57)
i [plan.astro:50](src/pages/plan.astro#L50). Jeśli po usunięciu `user` nie jest już używany
w danym pliku, znika też z destrukturyzacji `Astro.locals` — inaczej lint zgłosi nieużywaną zmienną.
Pasek renderuje się **poza** blokiem `readFailed`, więc wylogowanie działa również na ekranie błędu
odczytu.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Typy i szablony Astro przechodzą: `npx astro check`
- Build produkcyjny przechodzi: `npm run build`
- Żadna strona planowania nie renderuje już „Zalogowano jako": `grep -rn "Zalogowano jako" src/pages/` zwraca pusto

#### Manual Verification:

- Na `/plan/month`, `/plan/week` i `/plan` widoczny jest pasek z e-mailem i przyciskiem „Wyloguj się"
- Kliknięcie „Wyloguj się" na każdej z trzech stron kończy sesję i ląduje na stronie powitalnej
- Kliknięcie nazwy aplikacji w pasku prowadzi na `/plan/month`
- Pasek jest widoczny także wtedy, gdy strona pokazuje komunikat „Nie udało się wczytać…"
- Pulpit `/dashboard` nadal działa i nadal ma swój przycisk wylogowania

**Implementation Note**: Po zakończeniu tej fazy i przejściu weryfikacji automatycznej zatrzymaj się
i poczekaj na potwierdzenie, że testy ręczne wypadły pomyślnie, zanim przejdziesz do fazy 2.

---

## Phase 2: Przeniesienie punktu wejścia

### Overview

Zalogowany nauczyciel trafia na `/plan/month` — zarówno zaraz po zalogowaniu, jak i po wejściu na
samą domenę. Niezalogowany widzi na `/` to, co dziś.

### Changes Required:

#### 1. Przekierowanie ze strony głównej

**File**: `src/pages/index.astro`

**Intent**: `/` przestaje być przystankiem dla zalogowanego. Decyzja stoi w stronie, która ją
podejmuje, a nie w middleware — middleware odpowiada dziś na jedno pytanie („czy ta trasa wymaga
sesji") i dołożenie mu kształtu tras rozmyłoby tę rolę.

**Contract**: We frontmatterze: jeśli `Astro.locals.user` jest niepuste, `return Astro.redirect("/plan/month")`.
W przeciwnym razie strona renderuje `<Welcome />` bez zmian.

#### 2. Cel przekierowania po zalogowaniu

**File**: `src/pages/api/auth/signin.ts`

**Intent**: Ścieżka najczęstsza — logowanie — ma być jednym skokiem, a nie dwoma. Bez tej zmiany
działałaby i tak (przez przekierowanie z `/`), ale kosztem dodatkowego przeładowania.

**Contract**: [signin.ts:19](src/pages/api/auth/signin.ts#L19) — `context.redirect("/")` → `context.redirect("/plan/month")`.
Ścieżka błędna (`error`) zostaje bez zmian. `signout.ts` zostaje bez zmian: przekierowanie na `/`
jest po skasowaniu sesji poprawne.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Typy i szablony Astro przechodzą: `npx astro check`
- Build produkcyjny przechodzi: `npm run build`

#### Manual Verification:

- Zalogowanie się na `/auth/signin` ląduje bezpośrednio na `/plan/month` z bieżącym miesiącem
- Wejście na `/` w zalogowanej sesji przenosi na `/plan/month`
- Wejście na `/` bez sesji pokazuje stronę powitalną — bez pętli przekierowań
- Wylogowanie ląduje na stronie powitalnej, a nie w pętli z powrotem do miesiąca
- Błędne hasło nadal wraca na `/auth/signin` z komunikatem

**Implementation Note**: Po zakończeniu tej fazy i przejściu weryfikacji automatycznej zatrzymaj się
i poczekaj na potwierdzenie, że testy ręczne wypadły pomyślnie, zanim przejdziesz do fazy 3.

---

## Phase 3: Wygaszenie pulpitu

### Overview

`/dashboard` znika razem ze wszystkim, co go nazywa — linkami w interfejsie, wpisem w
`PROTECTED_ROUTES` i dwoma miejscami w dokumentacji. Dzień dostaje back-link do swojego miesiąca,
miesiąc traci back-link, bo jest teraz ekranem głównym.

### Changes Required:

#### 1. Kasowanie trasy

**File**: `src/pages/dashboard.astro` (usunięcie), `src/middleware.ts`

**Intent**: Strona nie ma już czego trzymać — jej trzy linki nawigacyjne zastąpiła siatka miesiąca,
a przycisk wylogowania przejęła powłoka z fazy 1.

**Contract**: Usunięcie pliku `src/pages/dashboard.astro`; usunięcie `"/dashboard"` z
`PROTECTED_ROUTES` w [middleware.ts:8](src/middleware.ts#L8), zostawiając `["/plan"]`. Komentarz nad
tablicą (o tym, dlaczego `POST /api/day-plan/generate` celowo zostaje poza nią) obowiązuje dalej i
zostaje bez zmian.

#### 2. Retargetowanie back-linków

**File**: `src/pages/plan.astro`, `src/pages/plan/month.astro`

**Intent**: Każdy ekran ma dokładnie jeden krok w górę, a ekran główny nie ma żadnego.

**Contract**: [plan.astro:37](src/pages/plan.astro#L37) — „← Wróć do pulpitu" → „← Wróć do miesiąca",
cel `/plan/month?month=${planDate.slice(0, 7)}`, tym samym kształtem co
[week.astro:42](src/pages/plan/week.astro#L42). [month.astro:46](src/pages/plan/month.astro#L46) —
cały `<a>` znika; `mt-4` na `<h1>` poniżej trzeba wtedy przejrzeć, bo odstęp liczył na obecność
linku nad sobą.

Świadoma konsekwencja: dzień otwarty z tablicy tygodnia wraca teraz do miesiąca, pomijając tydzień.
Jeden klik więcej dla powrotu do tygodnia; przyjęte, żeby każdy ekran miał jeden przewidywalny krok
w górę niezależnie od tego, skąd się na niego weszło.

#### 3. Wiszący link na stronie powitalnej

**File**: `src/components/Topbar.astro`

**Intent**: Kasowanie trasy zostawia [Topbar.astro:13](src/components/Topbar.astro#L13) celujący
w 404. To sprzątanie wymuszone przez usunięcie pliku, nie rozszerzenie zakresu.

**Contract**: Link „Dashboard" w gałęzi zalogowanego użytkownika → `/plan/month` z etykietą
„Plan miesiąca". Reszta komponentu — w tym angielska kopia w gałęzi niezalogowanego — zostaje bez
zmian; `Welcome.astro` jest jawnie poza zakresem tego slice'u.

#### 4. Dokumentacja, która nazywa skasowany plik

**File**: `README.md`, `CLAUDE.md`

**Intent**: Oba pliki wskazują dziś na `src/pages/dashboard.astro`. Nieaktualna instrukcja w
`CLAUDE.md` wprowadza w błąd następny przebieg agenta, a nie tylko czytelnika.

**Contract**: `README.md:147` — usunięcie wiersza `/dashboard` z tabeli tras; jeśli po usunięciu
tabela nie ma już przykładu trasy chronionej, zdanie pod nią o `PROTECTED_ROUTES` wskazuje `/plan`.
`CLAUDE.md:45` — „Protected page example: `src/pages/dashboard.astro`" → wskazanie na
`src/pages/plan/month.astro` jako ekran główny zalogowanej aplikacji.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Typy i szablony Astro przechodzą: `npx astro check`
- Build produkcyjny przechodzi: `npm run build`
- Żadne odwołanie do trasy nie zostało: `grep -rn "/dashboard" src/ README.md CLAUDE.md` zwraca pusto
- Plik nie istnieje: `test ! -f src/pages/dashboard.astro`

#### Manual Verification:

- Wejście na `/dashboard` w zalogowanej sesji daje 404, nie pustą stronę ani błąd serwera
- Z dnia „← Wróć do miesiąca" prowadzi na miesiąc tego dnia — także dla dnia z sąsiedniego miesiąca
- Miesiąc nie ma back-linku, a odstęp nad nagłówkiem wygląda poprawnie
- Pełna pętla bez wpisywania URL-a: logowanie → miesiąc → tydzień → dzień → miesiąc → wylogowanie
- Pasek Topbara na stronie powitalnej (w sesji otwartej w drugiej karcie) prowadzi na `/plan/month`

**Implementation Note**: Po zakończeniu tej fazy i przejściu weryfikacji automatycznej zatrzymaj się
i poczekaj na potwierdzenie, że testy ręczne wypadły pomyślnie, zanim przejdziesz do fazy 4.

---

## Phase 4: Zapis decyzji o S-06

### Overview

Faza 1 dostarczyła FR-003 — wylogowanie osiągalne z każdego ekranu zalogowanej aplikacji — czyli
całe wyjście S-06. Bez zapisu ta decyzja znika: `lessons.md` #2 nazywa dokładnie ten kształt awarii
(„odroczenie bez własnego pliku, pozycji i właściciela znika z pola widzenia"), a tutaj chodzi o
odwrotność — dostarczenie bez własnej pozycji.

### Changes Required:

#### 1. Odnotowanie w roadmapie

**File**: `context/foundation/roadmap.md`

**Intent**: S-06 ma przestać wyglądać na pracę do zrobienia, a FR-003 ma zostać jawnie przypisane
do slice'u, który je dostarczył.

**Contract**: W bloku `### S-06: Wylogowanie z aplikacji` — `- **Status:**` na `done` z notką
i datą wskazującą, że wyjście dostarczyła powłoka z S-04 (`src/components/plan/AppHeader.astro`),
oraz odpowiadający wiersz w tabeli `## At a glance` (Status → `done`). Wpis w `## Done` nazywa S-06
i wskazuje S-04 jako miejsce dostarczenia. Wiersz S-06 w `## Backlog Handoff` odnotowuje to samo.
Frontmatter `updated:` na dzisiaj. Blok `### S-04` zostaje na `in-progress` — do `done` przesunie go
`/10x-archive`.

#### 2. Zamknięcie niewiadomej S-04

**File**: `context/foundation/roadmap.md`

**Intent**: `### S-04` niesie otwarte pytanie „czy `/dashboard` znika, czy zostaje jako trwałe
przekierowanie". Plan je rozstrzygnął.

**Contract**: Pozycja w `- **Unknowns:**` bloku S-04 przekreślona i uzupełniona o rozstrzygnięcie
(trasa znika w całości; kontrolka wylogowania przeniesiona do powłoki), tym samym wzorcem `~~…~~`,
którym zamknięto niewiadome S-03.

### Success Criteria:

#### Automated Verification:

- Żadna pozycja S-06 nie została pominięta: `grep -n "S-06" context/foundation/roadmap.md` pokazuje spójny status we wszystkich wystąpieniach
- Prettier nie zgłasza zmian: `npx prettier --check context/foundation/roadmap.md`

#### Manual Verification:

- Tabela `## At a glance`, blok `### S-06`, `## Backlog Handoff` i `## Done` mówią to samo o S-06
- Niewiadoma S-04 jest przekreślona wraz z rozstrzygnięciem, nie usunięta

---

## Testing Strategy

Projekt nie ma runnera testów TS/React ani e2e — `package.json` niesie `lint`, `build` i `test:db`
(pgTAP, dla schematu, którego ten slice nie rusza). Ciężar weryfikacji leży więc na `astro check`,
buildzie i przebiegu ręcznym. To nie jest luka do zapełnienia w tym slice'ie: warstwa testów jest
przedmiotem osobnej pracy (`/10x-test-plan`), a dokładanie tu pierwszego runnera rozdęłoby zakres.

### Automatyczne:

- `npm run lint`, `npx astro check`, `npm run build` po każdej fazie
- Bramki `grep` na martwe odwołania do `/dashboard` i na usunięty duplikat „Zalogowano jako"

### Przebieg ręczny (po fazie 3, w całości):

1. Wyloguj się, wejdź na `/` — strona powitalna, bez przekierowania
2. Zaloguj się — lądowanie bezpośrednio na `/plan/month` z bieżącym miesiącem
3. Wejdź na `/` w tej samej sesji — przeniesienie na `/plan/month`
4. Kliknij „Zaplanuj tydzień" w dowolnym wierszu → tydzień; „← Wróć do miesiąca" → miesiąc
5. Kliknij kafelek dnia z sąsiedniego miesiąca → dzień; „← Wróć do miesiąca" → miesiąc **tego** dnia
6. Wejdź na `/dashboard` z ręki — 404
7. Kliknij „Wyloguj się" z dnia, potem powtórz z tygodnia i z miesiąca — za każdym razem koniec sesji
8. Wywołaj ekran błędu odczytu (np. przy zatrzymanym lokalnym Supabase) i sprawdź, że pasek
   z wylogowaniem nadal jest na miejscu

## Performance Considerations

Przekierowanie z `/` dokłada jeden skok HTTP na wejściu na samą domenę w zalogowanej sesji.
`Astro.locals.user` jest już rozstrzygnięte przez middleware dla każdego żądania
([middleware.ts:19-26](src/middleware.ts#L19-L26)), więc warunek w `index.astro` nie dokłada żadnego
zapytania do Supabase. Ścieżka logowania staje się o jeden skok krótsza niż byłaby bez zmiany
w `signin.ts`.

## Migration Notes

Brak migracji bazy. Kolejka siedmiu migracji na hosted project pozostaje otwarta jako pozycja
wdrożeniowa przeniesiona z S-03
(`context/archive/2026-08-23-week-generation/follow-ups/review-fixes.md`, poz. 2) — ten slice jej nie
dotyka i nie domyka.

Zmiana jest odwracalna commitem: `dashboard.astro` wraca z historii, a dwie linijki przekierowań
wracają do `/`. Zakładki nauczyciela wskazujące `/dashboard` przestaną działać — koszt przyjęty
świadomie przy jednym użytkowniku.

Zgodnie z `CLAUDE.md` § Git ten slice zaczyna się na gałęzi funkcjonalnej; `git branch --show-current`
na starcie planowania wskazywał `master`.

## References

- Roadmapa: `context/foundation/roadmap.md` § S-04, § S-06, § Baseline
- Siatka miesiąca (p6 S-03): `context/archive/2026-08-23-week-generation/plan.md`
- Wzorzec back-linku: [src/pages/plan/week.astro:42](src/pages/plan/week.astro#L42)
- Reguła Astro vs React: `CLAUDE.md` § Key conventions

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Powłoka zalogowanej aplikacji

#### Automated

- [x] 1.1 Lint przechodzi: `npm run lint` — 4f672cb
- [x] 1.2 Typy i szablony Astro przechodzą: `npx astro check` — 4f672cb
- [x] 1.3 Build produkcyjny przechodzi: `npm run build` — 4f672cb
- [x] 1.4 Żadna strona planowania nie renderuje już „Zalogowano jako" — 4f672cb

#### Manual

- [ ] 1.5 Pasek z e-mailem i wylogowaniem widoczny na miesiącu, tygodniu i dniu
- [ ] 1.6 Wylogowanie działa z każdej z trzech stron
- [ ] 1.7 Nazwa aplikacji w pasku prowadzi na `/plan/month`
- [ ] 1.8 Pasek widoczny także na ekranie błędu odczytu
- [ ] 1.9 `/dashboard` nadal działa i nadal ma swój przycisk wylogowania

### Phase 2: Przeniesienie punktu wejścia

#### Automated

- [x] 2.1 Lint przechodzi: `npm run lint` — 59a98ef
- [x] 2.2 Typy i szablony Astro przechodzą: `npx astro check` — 59a98ef
- [x] 2.3 Build produkcyjny przechodzi: `npm run build` — 59a98ef

#### Manual

- [ ] 2.4 Zalogowanie ląduje bezpośrednio na `/plan/month`
- [ ] 2.5 Wejście na `/` w sesji przenosi na `/plan/month`
- [ ] 2.6 Wejście na `/` bez sesji pokazuje stronę powitalną, bez pętli
- [ ] 2.7 Wylogowanie ląduje na stronie powitalnej, bez pętli
- [ ] 2.8 Błędne hasło nadal wraca na `/auth/signin` z komunikatem

### Phase 3: Wygaszenie pulpitu

#### Automated

- [x] 3.1 Lint przechodzi: `npm run lint` — f2a20d3
- [x] 3.2 Typy i szablony Astro przechodzą: `npx astro check` — f2a20d3
- [x] 3.3 Build produkcyjny przechodzi: `npm run build` — f2a20d3
- [x] 3.4 `grep -rn "/dashboard" src/ README.md CLAUDE.md` zwraca pusto — f2a20d3
- [x] 3.5 `test ! -f src/pages/dashboard.astro` — f2a20d3

#### Manual

- [ ] 3.6 `/dashboard` daje 404
- [ ] 3.7 Back-link dnia prowadzi na miesiąc tego dnia, także dla dnia z sąsiedniego miesiąca
- [ ] 3.8 Miesiąc bez back-linku, odstęp nad nagłówkiem poprawny
- [ ] 3.9 Pełna pętla nawigacji bez wpisywania URL-a z ręki
- [ ] 3.10 Link w Topbarze na stronie powitalnej prowadzi na `/plan/month`

### Phase 4: Zapis decyzji o S-06

#### Automated

- [x] 4.1 Wszystkie wystąpienia S-06 w roadmapie mają spójny status — 47c7d3f
- [x] 4.2 Prettier nie zgłasza zmian w `roadmap.md` — 47c7d3f

#### Manual

- [ ] 4.3 `## At a glance`, `### S-06`, `## Backlog Handoff` i `## Done` mówią to samo o S-06
- [ ] 4.4 Niewiadoma S-04 przekreślona wraz z rozstrzygnięciem
