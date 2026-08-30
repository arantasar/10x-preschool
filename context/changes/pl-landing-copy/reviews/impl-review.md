<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Polska wersja powierzchni dla niezalogowanego

- **Plan**: `context/changes/pl-landing-copy/plan.md`
- **Scope**: Phase 1 i 2 z 2 (pełny plan)
- **Date**: 2026-08-30
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 3 observations
- **Uwaga metodologiczna**: to samoprzegląd — plan, implementację i przegląd wykonał ten sam
  agent, więc czułość na własne decyzje jest niższa niż przy przeglądzie niezależnym.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## Findings

### F1 — „Nie jesteś zalogowany" zwraca się do odbiorcy w rodzaju męskim

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/components/Topbar.astro:25`
- **Detail**: Angielskie „Not signed in" jest bezrodzajowe; moje tłumaczenie nie jest.
  `prd.md` §User & Persona definiuje odbiorcę jako „Nauczyciel/ka przedszkolny/a" — jawnie
  w obu rodzajach — a realna populacja nauczycieli przedszkolnych jest w przeważającej
  części kobietami. Napis stoi w pasku nad stroną główną, czyli widzi go **każdy**
  odwiedzający przed zalogowaniem. Reszta copy, którą napisałem, jest bezrodzajowa
  (tryb rozkazujący: „Wpisz", „Zaplanuj", „Załóż konto"), więc to jedyne takie miejsce —
  wada wprowadzona przez tę zmianę, nie odziedziczona.
- **Fix**: Zamienić na formę bezosobową „Nie zalogowano".
  - Strength: Standardowa polska forma w interfejsach, bezrodzajowa, ta sama długość;
    spójna z bezrodzajowym „Wyloguj się" w `src/components/AppHeader.astro`.
  - Tradeoff: Brzmi nieco bardziej urzędowo niż zwrot w drugiej osobie.
  - Confidence: HIGH — jedno wystąpienie, jedna linia, brak zależności.
  - Blind spot: Brak istotnych.
- **Decision**: FIXED

### F2 — Niepoprawny cudzysłów zamykający w nagłówkowym akapicie strony głównej

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/components/Welcome.astro:39`
- **Detail**: Napisałem `„Dinozaury"` — cudzysłów otwierający jest poprawny (U+201E `„`),
  zamykający to zwykły ASCII (U+0022 `"`) zamiast polskiego U+201D `”`. Potwierdzone
  hexdumpem. To najbardziej eksponowane zdanie w całej aplikacji. Kodebaza jest w tej
  sprawie niespójna — `src/lib/services/prompts/` zawiera oba warianty, w tym poprawny
  `„Andrzejki”` — więc poprawka jednocześnie wybiera właściwą stronę tej niespójności.
- **Fix**: Zamienić znak zamykający na `”`.
  - Strength: Jeden znak; zgodny z regułą polskiej typografii i z istniejącym poprawnym
    wariantem w promptach.
  - Tradeoff: Brak.
  - Confidence: HIGH — zweryfikowane hexdumpem, nie na oko.
  - Blind spot: Nie sprawdzałem, czy pozostałe (niepoprawne) wystąpienia w promptach warto
    ujednolicić — to poza zakresem tej zmiany.
- **Decision**: FIXED

### F3 — Podmiana ikon wprost zaprzecza §What We're NOT Doing w tym samym planie

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: `src/components/Welcome.astro:69-131`
- **Detail**: Plan mówi wprost: „Nie zmieniamy warstwy wizualnej — klasy Tailwind, układ,
  orby, pole gwiazd, **ikony SVG** i struktura kafelków zostają". Contract zmiany 5 mówi
  jednocześnie, że podmiana jest opcjonalna — czyli plan przeczy sam sobie, a implementacja
  poszła za łagodniejszym zdaniem. Decyzja została zakomunikowana i uzasadniona w trakcie
  (kłódka nad tekstem o generowaniu wprowadza w błąd), ale **plan nadal twierdzi coś
  przeciwnego niż kod**. Dla `/10x-archive` i dla każdego, kto sięgnie po plan jako źródło
  prawdy, to rozjazd.
- **Fix A ⭐ Recommended**: Dopisać do planu addendum prostujące §What We're NOT Doing.
  - Strength: Zachowuje pracę, która jest merytorycznie lepsza od stanu wyjściowego, i
    usuwa sprzeczność wewnątrz planu przed archiwizacją.
  - Tradeoff: Plan staje się dokumentem korygowanym po fakcie.
  - Confidence: HIGH — addendum jest wzorcem używanym w tym repo (`week-generation`
    §Addendum 2026-08-26).
  - Blind spot: Nie wiadomo, czy nowe ikony przejdą przegląd wizualny — patrz pozycja 1.11,
    wciąż nieodhaczona.
- **Fix B**: Cofnąć ikony do stanu z `master`.
  - Strength: Rygorystyczna dyscyplina zakresu; diff wraca do czystej wymiany tekstu.
  - Tradeoff: Przywraca kłódkę nad „Propozycje na dzień i na tydzień" — obrazek zaprzeczający
    treści kafelka, czyli dokładnie ta wada, którą zmiana miała usunąć.
  - Confidence: MEDIUM — cofnięcie jest trywialne, ale przywraca znany defekt.
  - Blind spot: Brak istotnych.
- **Decision**: FIXED via Fix A (addendum w planie)

### F4 — Reguła „bez odmiany po zmiennej" zastosowana niekonsekwentnie

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `src/components/auth/SignUpForm.tsx:34`, `:83`
- **Detail**: Plan (Faza 2, zmiana 5) nakazuje formułować tekst tak, żeby liczba **nie stała
  przed odmienianym rzeczownikiem**. Podpowiedź spełnia to („Brakuje jeszcze znaków: {N}"),
  ale dwa inne miejsca nie: `` `Hasło musi mieć co najmniej ${MIN_PASSWORD_LENGTH} znaków` ``
  oraz `` placeholder={`Min. ${MIN_PASSWORD_LENGTH} znaków`} ``. Przy `MIN_PASSWORD_LENGTH`
  równym 2, 3 lub 4 wyszłoby „co najmniej 2 znaków" zamiast „2 znaki".
  **Dlaczego to obserwacja, a nie ostrzeżenie**: stała wynosi 6, a Supabase wymusza minimum 6
  po swojej stronie, więc wartości łamiące odmianę są w praktyce nieosiągalne. Rozbieżność
  jest realna, jej skutek — nie.
- **Fix**: Zostawić jak jest albo przeformułować na wariant bez rzeczownika po liczbie
  (np. „Minimalna długość hasła — znaków: {N}"), jeśli zależy na jednolitej regule.
- **Decision**: PENDING

### F5 — Produkcyjna gałąź `confirm-email` nigdy nie została wyrenderowana

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `src/pages/auth/confirm-email.astro:14-19`
- **Detail**: `isAutoConfirmed = import.meta.env.DEV`, więc lokalnie renderuje się wyłącznie
  gałąź `✅ Konto założone`. Gałąź `📧 Sprawdź skrzynkę` — ta, która faktycznie trafia na
  produkcję — została zweryfikowana **tylko przez odczyt kodu**, mimo że pozycja 2.8
  („ścieżka rejestracji w całości po polsku") jest odhaczona. Sama treść jest poprawna
  gramatycznie, więc ryzyko wady jest niskie; ryzyko dotyczy rzetelności odhaczenia.
- **Fix**: Odnotować w raporcie, że 2.8 pokrywa gałąź DEV, albo zweryfikować drugą gałąź
  produkcyjnym buildem przed merge'em.
- **Decision**: PENDING

### F6 — Blok fazy w planie zmieniony w trakcie implementacji

- **Severity**: 📋 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `context/changes/pl-landing-copy/plan.md` (Faza 2, Kryteria sukcesu)
- **Detail**: `/10x-implement` traktuje bloki faz jako tylko-do-odczytu i pozwala mutować
  wyłącznie `## Progress`. Wzorzec bramki 2.1/2.2 został jednak poprawiony w trakcie
  implementacji, bo pomijał `Password must be at least` — bramka przechodziła na zielono
  z angielskim tekstem w kodzie. Odstępstwo jest merytorycznie uzasadnione (kryterium, które
  nie potrafi złapać tego, co deklaruje, jest komentarzem, nie bramką) i zostało
  udokumentowane w treści planu oraz w komunikacie commita `1543aed`.
  **To jest kandydat na `/10x-lesson`**: wada należy do tej samej rodziny co dwa istniejące
  wpisy w `lessons.md` o kryteriach weryfikacji, a mechanizm — ręczna lista fraz w grepie,
  cicho niekompletna — powtórzy się przy każdej następnej bramce tego kształtu.
- **Fix**: Zapisać regułę przez `/10x-lesson` („bramka oparta na ręcznej liście wzorców musi
  być wyprowadzona z kodu albo mieć test na własną kompletność").
- **Decision**: PENDING
