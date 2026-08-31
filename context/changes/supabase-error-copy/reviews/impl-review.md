<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Polskie komunikaty błędów logowania i rejestracji

- **Plan**: `context/changes/supabase-error-copy/plan.md`
- **Scope**: Phase 1–3 of 3 (pełny plan)
- **Date**: 2026-08-31
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

## Zweryfikowane dowody

- Wszystkie 15 kluczy mapy obecne; 13 z nich istnieje w `ErrorCode`
  (`node_modules/@supabase/auth-js/dist/module/lib/error-codes.d.ts`), dwa syntetyczne
  (`config_missing`, `connection_failed`) **nie kolidują** z żadną wartością unii.
- `git diff -w --name-only master..HEAD -- src/` → dokładnie 6 plików, zgodnie z planem.
  Poza `src/` tylko trzy pliki dokumentacyjne wskazane w Fazie 3 (+ artefakty folderu zmiany).
- Producenci `?error=`: wyłącznie 4 miejsca w dwóch trasach, wszystkie emitują kod.
  Konsumenci: wyłącznie 2 strony `.astro`. `middleware.ts` i `signout.ts` nietknięte,
  `confirm-email.astro` nie czyta parametru.
- Wszystkie bramki automatyczne 1.1–3.5 przebiegnięte ponownie na `4192bcd`: zielone
  (1.4 słusznie odwrócone przez Fazę 2; 2.4 w brzmieniu zaadaptowanym — patrz F1).
- **Mutacje potwierdzające, że testy potrafią nie przejść** (`lessons.md` §„Kryterium
  weryfikacji musi móc nie przejść"): usunięcie wpisu z mapy → 1 test czerwony;
  `authErrorMessage` zwracające fallback bezwarunkowo → 15 testów czerwonych;
  podmiana jednego komunikatu na angielski → strażnik angielszczyzny czerwony.
  Wszystkie trzy przywrócone, drzewo czyste.

## Findings

### F1 — Kryterium 2.4 nie może przejść przy implementacji, którą ta sama faza nakazuje

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: `context/changes/supabase-error-copy/plan.md` (Faza 2, kryterium 2.4)
- **Detail**: Plan zapisuje bramkę jako „`grep -n "error.message" src/pages/api/auth/`
  returns nothing", a jednocześnie w tej samej fazie **nakazuje** `console.error(… error.message)`
  i import z `auth-error-messages` (kropka w regeksie pasuje do myślnika w `error-messages`).
  Bramka zwraca dziś 5 trafień i zwracałaby je przy każdej poprawnej implementacji.
  To siostra reguły z `lessons.md` — tam kryterium nie mogło **zawieść**, tu nie może
  **przejść**; w obu wypadkach nie mierzy tego, co obiecuje. Rodzina dokładnie ta sama, co
  otwarty ogon **F6** w `next-actions.md` („bramka oparta na ręcznej liście wzorców… reguła
  wróci przy każdej bramce grepowej") — i właśnie wróciła. Zastąpione w implementacji przez
  `grep -rnF 'encodeURIComponent(error.message' src/pages/api/auth/`, zweryfikowane jako
  puste teraz i **niepuste** na `HEAD~1`; odstępstwo odnotowane w commicie `c85128c` i w `change.md`.
- **Fix**: Poprawić brzmienie 2.4 w `plan.md` na formę faktycznie zweryfikowaną
  (`grep -rnF 'encodeURIComponent(error.message' src/pages/api/auth/`), żeby archiwum nie
  utrwaliło bramki, której nikt nigdy nie zobaczy na zielono.
  - Strength: Plan trafia do archiwum jako źródło prawdy dla przyszłych zmian; zapis
    zgodny z tym, co naprawdę zabezpiecza inwariant.
  - Tradeoff: Edycja odhaczonego kryterium po fakcie — wymaga wzmianki, że to korekta.
  - Confidence: HIGH — obie formy uruchomione, jedna zawodzi zawsze, druga rozróżnia `HEAD~1` od `HEAD`.
  - Blind spot: Nie sprawdzono, czy `/10x-archive` nie ma własnej kontroli spójności Progress↔treść fazy.
- **Decision**: FIXED — kryterium 2.4 poprawione w `plan.md` (blok Success Criteria + wiersz Progress), 2026-08-31

### F2 — Gałęzie `connection_failed` i `config_missing` nie mają żadnej weryfikacji

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: `src/pages/api/auth/signin.ts:16,29`, `src/pages/api/auth/signup.ts:14,22`
- **Detail**: Pozycje ręczne 2.11 i 2.12 są otwarte, a plan świadomie zrezygnował z testów
  integracyjnych („Integration Tests: Deliberately none"), bo trasy budują klienta inline.
  W efekcie **wybór** kodu w trasie nie jest pokryty niczym: sprawdzone są tylko rendery
  `?error=config_missing` i `?error=connection_failed`, czyli druga połowa ścieżki.
  `connection_failed` jest jedyną gałęzią, w której `error.code` jest `undefined`, i odpala się
  dokładnie wtedy, gdy Supabase jest nieosiągalna — czyli w momencie, w którym najtrudniej
  cokolwiek zdiagnozować. To ta sama rodzina co `lessons.md` §„Odroczone sprzątanie danych
  musi mieć właściciela": praca odłożona bez nazwanego właściciela znika z pola widzenia.
- **Fix A ⭐ Recommended**: Wykonać 2.11 i 2.12 ręcznie przed PR — usunąć zmienne z `.dev.vars`
  (2.11), potem wskazać `SUPABASE_URL` na nieroutowalny host (2.12) i potwierdzić oba komunikaty
  plus oryginał w konsoli serwera.
  - Strength: Domyka jedyne dwa nieprzejechane rozgałęzienia produkcyjne; koszt to kilka minut.
  - Tradeoff: Wymaga edycji lokalnego `.dev.vars` i przywrócenia go — nie da się zautomatyzować w CI.
  - Confidence: HIGH — reszta matrycy kodów przeszła tą samą metodą (`invalid_credentials`,
    `user_already_exists`, `validation_failed`, `weak_password` zaobserwowane na żywo).
  - Blind spot: Nie wiadomo, czy Cloudflare workerd zwraca ten sam kształt `AuthError` przy
    braku sieci co lokalny dev — ręczny przebieg to właśnie sprawdzi.
- **Fix B**: Przyjąć jako świadomy dług i zapisać w `next-actions.md` §Otwarte ogony z nazwanym
  właścicielem i bramką wejścia (np. „najbliższa zmiana dotykająca tras auth").
  - Strength: Nie blokuje PR; zgodne z regułą „dług z właścicielem" zamiast cichego pominięcia.
  - Tradeoff: Zostawia niesprawdzoną ścieżkę na produkcji — a jest to ścieżka awaryjna.
  - Confidence: MEDIUM — zależy, jak pilny jest merge.
  - Blind spot: Ogony w tym pliku mają już cztery pozycje; piąta zwiększa ryzyko, że lista przestanie być czytana.
- **Decision**: FIXED via Fix A — 2.11 i 2.12 wykonane 2026-08-31, oba zielone, wiersze Progress odhaczone.
  - 2.11: `?error=config_missing` na obu trasach.
  - 2.12: host na `.invalid` → log `auth.signin.failed { code: undefined, status: 0, message: 'internal error; reference = …' }` → `?error=connection_failed`. Potwierdza kontrakt SDK, na którym plan oparł dwuwiadomościowy fallback.
  - **Odkrycie uboczne**: instrukcja 2.11 w planie była niekompletna — repo ma zarówno `.dev.vars`, jak i `.env`, a `.env` sam podtrzymuje `createClient`. Wyczyszczenie tylko `.dev.vars` nie odtwarza sytuacji (pierwsza próba zwróciła `invalid_credentials`). Instrukcja poprawiona w `plan.md`. Oba pliki przywrócone bit w bit (`diff` czysty).

### F3 — Pusty `error.code` przechodzi przez `??` i daje ekran bez żadnego komunikatu

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (reliability)
- **Location**: `src/pages/api/auth/signin.ts:29`, `src/pages/api/auth/signup.ts:22`
- **Detail**: `error.code ?? CONNECTION_FAILED` reaguje wyłącznie na `undefined`. `AuthError.code`
  jest typowane jako `ErrorCode | (string & {}) | undefined`, więc pusty string jest typowo
  dopuszczalny; wtedy trasa przekierowuje na `?error=`, strona czyta `""`, warunek
  `errorCode ? … : null` daje `null`, a `ServerError` nic nie renderuje. Nauczyciel wysyła
  formularz i **nie widzi nic** — najgorszy z możliwych wyników tej zmiany, gorszy niż
  angielski tekst, bo nie sygnalizuje nawet, że coś poszło nie tak. Prawdopodobieństwo niskie,
  koszt naprawy jednoliniowy, tryb awarii cichy.
- **Fix**: Potraktować pusty kod tak samo jak brakujący — `const code = error.code ?? "";`
  i dalej `encodeURIComponent(code || CONNECTION_FAILED)`. Lewa strona `||` jest wtedy typu
  `string`, więc `prefer-nullish-coalescing` nie zadziała.
- **Decision**: FIXED — `const code = error.code ?? "";` + `encodeURIComponent(code || CONNECTION_FAILED)` w obu trasach, 2026-08-31.
  Lint/test/build zielone; regresja na żywo potwierdzona (`invalid_credentials`, `user_already_exists` bez zmian).

### F4 — Kryterium 2.6 liczy wystąpienia tekstu, nie wywołania funkcji

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: `context/changes/supabase-error-copy/plan.md` (Faza 2, kryterium 2.6)
- **Detail**: `grep -c "authErrorMessage" == 2` przechodzi dziś tylko dlatego, że komentarz
  w obu plikach `.astro` celowo nie nazywa funkcji („the lookup is contractually non-empty").
  Dopisanie zdania z nazwą funkcji do komentarza zapala bramkę na czerwono bez żadnej zmiany
  zachowania — a usunięcie importu przy zostawieniu dwóch wzmianek w komentarzach zapala ją
  na zielono przy zepsutym kodzie. Bramka mierzy tekst, nie kontrakt.
- **Fix**: Przeformułować na sprawdzenie wywołania, np.
  `grep -c 'authErrorMessage(errorCode)' src/pages/auth/{signin,signup}.astro` == 1 dla każdego pliku.
- **Decision**: FIXED — kryterium 2.6 przeformułowane w `plan.md` na `grep -c 'authErrorMessage(errorCode)'` == 1 na plik (blok Success Criteria + wiersz Progress), 2026-08-31.

### F5 — Trasy auth to jedyne miejsce w `src/pages/`, które woła `console.error` bezpośrednio

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/pages/api/auth/signin.ts:24-25`, `src/pages/api/auth/signup.ts:19-20`
- **Detail**: Projekt ma ustalony wzorzec: helper `logError(message, fields)` z komentarzem
  `eslint-disable-next-line no-console` **w środku** (`src/lib/services/day-plan-http.ts:119`,
  `src/lib/services/activity-generator.ts:134`). Nowe trasy wołają `console.error` wprost i
  powielają wyłączenie reguły w dwóch plikach. Nazewnictwo zdarzeń jest natomiast zgodne —
  `auth.signin.failed` / `auth.signup.failed` wpisują się w konwencję `.failed`, o którą prosi
  komentarz w `day-plan-http.ts` („a reader grepping for `.failed` should find both"; teraz
  znajduje cztery). Import helpera z `day-plan-http.ts` byłby błędem (inna domena), więc
  jedyną „czystą" alternatywą jest wyciągnięcie trzeciej kopii helpera dla dwóch wywołań.
- **Fix**: Zostawić bez zmian — dwa call-site'y nie uzasadniają trzeciego helpera; ewentualną
  konsolidację podjąć dopiero, gdy pojawi się trzeci obszar logujący.
- **Decision**: SKIPPED — świadoma decyzja: dwa call-site'y nie uzasadniają trzeciej kopii helpera. Konwencja nazw `.failed` jest zachowana, więc grep po `.failed` znajduje wszystkie cztery miejsca.

### F6 — `email_address_invalid` bez zaobserwowanej ścieżki

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `src/lib/auth-error-messages.ts:74`
- **Detail**: Przy rejestracji źle sformatowanego adresu (`nie-adres`) lokalna Supabase zwróciła
  `validation_failed` (400, „Unable to validate email address: invalid format"), nie
  `email_address_invalid`. Wpis pochodzi wprost z tabeli pokrycia w planie i nic nie kosztuje —
  ale twierdzenie „15 kodów osiągalnych z tych dwóch wywołań" jest o jeden słabsze, niż brzmi.
  Zachowanie może zależeć od konfiguracji instancji (walidator adresów, blocklista), więc to
  „niezaobserwowane", nie „nieosiągalne".
- **Fix**: Zostawić wpis; przy okazji weryfikacji z F2 sprawdzić, czy produkcyjna instancja
  emituje ten kod — jeśli nie, odnotować w komentarzu przy wpisie, że pochodzi z tabeli planu.
- **Decision**: FIXED — komentarz przy wpisie `email_address_invalid` w `src/lib/auth-error-messages.ts` odnotowuje, że klucz pochodzi z tabeli planu i nie ma potwierdzonej ścieżki na działającej instancji, 2026-08-31.

## Triage — 2026-08-31

| Wynik | Findings |
|---|---|
| Fixed | F1, F2 (Fix A), F3, F4, F6 (5) |
| Skipped | F5 (1) |

**Zmiany w kodzie produkcyjnym z triage'u**: jedna — F3 (`src/pages/api/auth/{signin,signup}.ts`,
pusty `error.code` traktowany jak brakujący) plus komentarz z F6 w mapie. Reszta to korekty
kryteriów w `plan.md` i domknięcie dwóch pozycji weryfikacji ręcznej.

**Stan bramek po triage'u**: `npm run lint`, `npm test` (100 testów), `npm run build` — zielone.
Regresja na żywo po zmianie F3: `invalid_credentials` i `user_already_exists` bez zmian.

**Pozostałe otwarte pozycje weryfikacji ręcznej**: 1.5, 1.6, 2.7–2.10, 3.6, 3.7 — 1.5 i 2.7–2.10
mają dowód w §Zweryfikowane dowody i w podsumowaniu implementacji, ale ich odhaczenie należy do
człowieka; 1.6, 3.6 i 3.7 to oceny redakcyjne.
