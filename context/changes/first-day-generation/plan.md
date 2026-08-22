# S-01 `first-day-generation` — plan implementacji

## Overview

Nauczyciel loguje się, wybiera dzień, wpisuje hasło i po 10–30 sekundach z widocznym postępem
dostaje trzy propozycje aktywności po polsku, bezpieczne dla dzieci 3–6 lat; może wygenerować
ponownie. Nic nie trafia do bazy — S-01 ma dowieść **jakości generowania**, a nie persystencji.

Slice jest gwiazdą przewodnią roadmapy: cała reszta ma sens tylko wtedy, gdy ten przepływ się
obroni. Niesie też jedyną nienegocjowalną inwestycję PRD — guardrail wieku — a decyzja roadmapowa
uczyniła prompt systemowy **jedyną** warstwą, która go egzekwuje. Dlatego prompt jest tu artefaktem
pierwszej klasy z własnym plikiem, własnym kryterium odbioru i własną fazą weryfikacji, a nie
stringiem wklejonym w serwis.

## Current State Analysis

Zweryfikowane w kodzie (nie tylko w dokumentach) na commicie `4d1a2fb`:

- **Auth działa i wystarcza.** `src/lib/supabase.ts` + `src/middleware.ts` rozwiązują użytkownika
  i wpinają go w `context.locals.user`. Do S-01 zostaje dodanie trasy do `PROTECTED_ROUTES`.
- **Kontrakt wyjścia już istnieje.** `src/types.ts:67-75` definiuje `ActivityDraft`
  (`title` + `description`, celowo bez `user_id` i `generation`) — dokładnie kształt, który
  produkuje S-01, niezależnie od tego, czy go zapisze.
- **Granice bazy są twardsze niż szkic zoda z referencji.** Migracja
  `20260720162247_bound_plan_and_activity_input.sql` egzekwuje `prompt` 1–2000, `title` 1–200,
  `description` 1–4000 i limit 20 wierszy na partię przez `unique (plan_id, generation, ordinal)`.
  Szkic w `openrouter-api.md` § 11 ma tylko `.min(1)`.
- **`src/lib/services/` nie istnieje** — F-01 świadomie go nie utworzyło. S-01 zakłada ten katalog.
- **`zod` nie jest zadeklarowaną zależnością** i nie ma w repo ani jednego użycia.
  `import { z } from "zod"` zadziała dziś przypadkiem, przez hoisting `zod@4.4.3` z zależności
  tranzytywnych Astro, i przestanie działać przy dowolnym bumpie, który go przestawi.
  `src/pages/api/auth/signin.ts:6-7` czyta `form.get("email") as string` bez walidacji — S-01
  ustanawia wzorzec walidacji dla całego projektu.
- **Middleware zwraca 302, nie 401.** `src/middleware.ts:20-21` odpowiada `context.redirect(...)`.
  Dla trasy API wołanej `fetch`-em z wyspy React to strona logowania w HTML-u jako „odpowiedź
  generowania".
- **Brak sekretu poza Supabase.** `.env.example` ma dwie linie; `OPENROUTER_API_KEY` będzie pierwszy.
- **Interfejs jest dziś po angielsku** (`dashboard.astro`, `SignInForm.tsx:22-27`) mimo NFR
  „cały interfejs po polsku". Polski występuje tylko w `config-status.ts:16`.

Zweryfikowane empirycznie na potrzeby tego planu (próbny build, artefakty usunięte):

- **`import x from "./plik.md?raw"` działa pod adapterem Cloudflare** — Vite 7.3.3 wkleja treść
  jako literał w czasie builda (potwierdzone w `dist/server/chunks/`, z polskimi znakami
  diakrytycznymi). W runtime nie ma odczytu z dysku, więc workerd tego nie dotyka.
- **`resolveJsonModule: true`** (z `astro/tsconfigs/base.json`) — import `.json` działa bez konfiguracji.

## Desired End State

Zalogowany nauczyciel wchodzi na `/plan`, wybiera datę, wpisuje hasło (np. „Andrzejki"), klika
„Generuj". Przez cały czas operacji widzi zmieniające się etapy i upływający czas. Po zakończeniu
widzi trzy propozycje — tytuł plus opis w 2–4 zdaniach, po polsku, adekwatne dla grupy 3–6 lat —
i przycisk „Generuj ponownie". Gdy generowanie zawiedzie, dostaje komunikat po polsku, który mówi
mu, czy ponowna próba ma sens.

Weryfikacja: przepływ przechodzi ręcznie na pięciu hasłach z kryterium odbioru (§ Faza 5),
a wynik porównania trzech modeli jest zapisany w `model-comparison.md`.

### Key Discoveries

- `src/types.ts:67-75` — `ActivityDraft` to gotowy kształt wyjścia; serwis mapuje na niego wprost.
- `supabase/migrations/20260720162247_bound_plan_and_activity_input.sql:19-46` — granice, do których
  musi się dostroić kontrakt LLM, żeby S-02 nie odkrył rozjazdu na `CHECK`.
- `src/lib/config-status.ts:11-21` — istniejący wzorzec „czego brakuje w konfiguracji"; OpenRouter
  wchodzi tą samą drogą, więc build w CI nie zyskuje nowej zależności operacyjnej.
- `src/lib/supabase.ts:8-10` — wzorzec „brak konfiguracji → `null`, nie wyjątek".
- `openrouter-api.md` § 8 — awaria częściowa wraca **wewnątrz** odpowiedzi 200
  (`finish_reason: "error"`); sam status HTTP nie jest dowodem sukcesu.
- `openrouter-api.md` § 2 — pola `description` w JSON Schema realnie sterują modelem, więc guardrail
  wieku i języka warto zapisać w schemacie, nie tylko w prompcie.

## What We're NOT Doing

- **Żadnego zapisu do bazy.** Ani `day_plans`, ani `activities`. Regeneracja (FR-007) to ponowny
  POST bez stanu. Konsekwencja świadomie przyjęta: propozycja nie przeżywa odświeżenia strony —
  do S-02 to demo, nie narzędzie.
- **Żadnego triggera `BEFORE INSERT` ani protokołu regeneracji.** To zobowiązanie należy do S-02
  jako pierwszego zapisu do `activities` (roadmap § S-02) i S-01 go nie dziedziczy, bo nic nie pisze.
- **Bez streamingu.** Postęp pokazujemy etapami i licznikiem czasu. Streaming jest niekompatybilny
  z „sparsuj cały JSON i zwaliduj zodem przed pokazaniem", a roadmapa zdjęła go z listy wymogów.
- **Bez post-filtra treści.** Guardrail żyje wyłącznie w prompcie i w opisach schematu — decyzja
  roadmapowa, ryzyko przyjęte świadomie.
- **Bez widoku tygodnia** (S-03) oraz **bez edycji i akceptacji** (S-02).
- **Bez retrofitu polskiego w istniejącym UI auth i dashboard.** Nowy UI S-01 jest po polsku; NFR
  „cały interfejs po polsku" pozostaje naruszony poza `/plan` — patrz § Open Risks w briefie.
- **Bez limitu regeneracji.** Otwarte Pytanie Roadmapowe nr 2 zostaje otwarte; logujemy `usage.cost`,
  żeby decyzja miała dane.
- **Bez `react-day-picker` i biblioteki dat.** Natywny `<input type="date">`.
- **Bez testów automatycznych logiki generowania.** Projekt ma tylko `test:db` (pgTAP); testy to
  Moduł 3. Weryfikacja S-01 jest ręczna i tak jest zapisana w kryteriach.

## Implementation Approach

Kontrakt najpierw, potem serwis, potem trasa, potem UI, na końcu bramka jakości.

Prompt systemowy i JSON Schema są **osobnymi plikami**, nie stałymi w module TypeScript.
Powód jest konkretny, nie estetyczny: prompt to jedyna warstwa bezpieczeństwa w tym slice, więc ma
mieć czytelną historię zmian w gicie i być edytowalny bez czytania kodu — a dokładnie te same pliki
czyta skrypt porównawczy z Fazy 5, więc test modeli i produkcja dzielą jedno źródło prawdy.
Gdyby prompt był stringiem w `.ts`, skrypt musiałby go duplikować i test przestałby dowodzić
czegokolwiek o produkcji.

Serwis jest czystą funkcją nad `fetch` — bez SDK, zgodnie z resztą projektu pod workerd.
Trasa jest cienka: uwierzytelnienie, walidacja wejścia, mapowanie kategorii błędu na odpowiedź.

## Critical Implementation Details

**Trasa API musi sama sprawdzić sesję.** `src/middleware.ts:20-21` odpowiada na brak sesji
`context.redirect("/auth/signin")`. Dla strony to poprawne, ale dla `POST /api/day-plan/generate`
wołanego `fetch`-em oznacza 302 i HTML strony logowania tam, gdzie wyspa React spodziewa się JSON-a
— czyli błąd parsowania zamiast czytelnego „zaloguj się ponownie". Trasa sprawdza
`context.locals.user` u siebie i zwraca 401 z JSON-em; do `PROTECTED_ROUTES` trafia **strona**
`/plan`, nie trasa API.

**Status 200 nie jest dowodem sukcesu.** OpenRouter zwraca awarię częściową wewnątrz poprawnej
odpowiedzi 200: `choices[0].finish_reason === "error"` plus `choices[0].error`, obok fragmentu
treści. Sprawdzenie obu musi wyprzedzić `JSON.parse` — inaczej „udana" generacja daje nauczycielowi
pusty ekran bez śladu w logu. To ten sam kształt cichej awarii, dla którego w F-01 istnieje licznik
generacji.

**Automatyczny retry podwaja najgorszy czas oczekiwania.** Jedna ponowna próba dla klasy przejściowej
przesuwa najgorszy przypadek z ~30 s do ~60 s. Wskaźnik postępu musi o tym wiedzieć i zasygnalizować
ponowną próbę osobnym etapem — licznik, który po 30 sekundach dalej rośnie bez zmiany komunikatu,
czyta się jak zawieszenie, czyli dokładnie to, czemu NFR „ciągły, widoczny postęp" ma zapobiegać.

---

## Faza 1: Konfiguracja i kontrakt generowania

### Overview

Powstaje wszystko, co opisuje *co* model ma zwrócić i skąd bierzemy klucz — bez ani jednego
wywołania sieciowego. Po tej fazie nic nowego nie działa dla użytkownika; działa natomiast
`npm run build` z nowymi zmiennymi i komunikat o brakującej konfiguracji.

### Changes Required

#### 1. Zależność `zod`

**File**: `package.json`

**Intent**: Uczynić `zod` jawną zależnością. Dziś import zadziała przypadkiem przez hoisting
z zależności tranzytywnych Astro i cicho zniknie przy bumpie — a S-01 opiera na nim walidację
odpowiedzi modelu.

**Contract**: `zod` w `dependencies`, wersja `^4` (**nie v3** — API `z.string().max()` jest zgodne,
ale komunikaty i `.parse` różnią się między majorami; instalowana wersja to `4.4.3`).

#### 2. Deklaracja sekretów

**File**: `astro.config.mjs`

**Intent**: Dodać `OPENROUTER_API_KEY` i `OPENROUTER_MODEL` do `env.schema` tym samym wzorcem, co
`SUPABASE_*`, czyli jako **opcjonalne**. Gdyby były wymagane, build w CI zacząłby wymagać nowego
sekretu repozytorium, a brak klucza objawiałby się wyjątkiem zamiast komunikatem.

**Contract**: oba pola `envField.string({ context: "server", access: "secret", optional: true })`.

#### 3. Wzorzec konfiguracji

**File**: `.env.example`

**Intent**: Udokumentować oba nowe wpisy dla kolejnej osoby uruchamiającej projekt; dziś plik ma
dwie linie i nie wspomina o OpenRouterze.

**Contract**: `OPENROUTER_API_KEY=###` oraz `OPENROUTER_MODEL=google/gemini-3.7-flash`.
Wartość `OPENROUTER_MODEL` jest domyślną na czas implementacji — rozstrzyga ją Faza 5.

#### 4. Sygnalizacja braku konfiguracji

**File**: `src/lib/config-status.ts`

**Intent**: Dopisać OpenRouter do istniejącej listy, żeby brak klucza dawał ten sam komunikat co
brak Supabase, a nie wyjątek w trasie.

**Contract**: nowy wpis `ConfigStatus` o `name: "OpenRouter"`, `configured: Boolean(OPENROUTER_API_KEY)`,
`message` po polsku w tonie istniejącego wpisu (linia 16).

#### 5. Prompt systemowy

**File**: `src/lib/services/prompts/day-plan.pl.md`

**Intent**: Zapisać jedyny guardrail bezpieczeństwa treści jako osobny, czytelny artefakt prozą.
To najważniejszy plik w całym slice.

**Contract**: plik markdown wczytywany przez `?raw` (zweryfikowane: Vite wkleja treść w czasie
builda, także z polskimi znakami). Treść musi unieść naraz sześć wymagań, a każde z nich jest
sprawdzane w Fazie 5:

- rola: asystent nauczyciela przedszkolnego,
- odbiorca: **dzieci 3–6 lat** — bezpieczeństwo i adekwatność rozwojowa,
- język **polski** w tytułach i opisach,
- **dokładnie trzy** propozycje,
- opis w 2–4 zdaniach, konkretny i wykonalny w sali przedszkolnej (materiały codzienne, bez
  przygotowań spoza zasięgu nauczyciela),
- zachowanie przy haśle nieodpowiednim dla wieku: zamiast odmowy — przekierowanie tematu na
  bezpieczny, adekwatny wariant (nauczyciel ma dostać plan, nie komunikat o odmowie).

#### 6. Schemat wyjścia dla modelu

**File**: `src/lib/services/prompts/day-plan.schema.json`

**Intent**: Wymusić kształt odpowiedzi i **powtórzyć guardrail w opisach pól** — dokumentacja
OpenRoutera wskazuje `description` jako realny nośnik instrukcji, więc wiek i język zapisujemy
w dwóch miejscach, nie w jednym.

**Contract**: JSON Schema dla `response_format.json_schema.schema`, `additionalProperties: false`
na każdym poziomie, komplet `required`, tablica `aktywnosci` z `minItems: 3` **i** `maxItems: 3`
(decyzja: sztywno trzy). Pola `tytul` i `opis` z opisami niosącymi wiek 3–6 lat, język polski
i limity długości. Plik jest importowany bezpośrednio (`resolveJsonModule` jest włączone) i czytany
przez skrypt z Fazy 5 — jedno źródło prawdy.

#### 7. Kontrakt walidacji i typy

**File**: `src/lib/services/day-plan-contract.ts`

**Intent**: Zwalidować to, co faktycznie wróciło, i domknąć górne granice, których szkic
w `openrouter-api.md` § 11 nie ma. Schemat JSON to instrukcja dla modelu, nie gwarancja typu
w TypeScript.

**Contract**: schemat zoda odpowiadający plikowi `.json`, z granicami dostrojonymi do bazy —
`tytul` 1–200, `opis` 1–4000, tablica dokładnie 3 elementy — oraz funkcja mapująca wynik na
`ActivityDraft[]` z `@/types` (`tytul` → `title`, `opis` → `description`). Tu też mieszka schemat
wejścia trasy: `plan_date` (data ISO) i `prompt` 1–2000 znaków.

> Granice nie są kosmetyką: model, który zwróci 300-znakowy tytuł, przeszedłby walidację S-01
> i wywrócił się dopiero na `CHECK` w S-02 — w innym slice, na innym commicie, z innym kontekstem
> debugowania. To reguła z `lessons.md` zastosowana o poziom wyżej, na kontrakcie zamiast na migracji.

### Success Criteria

#### Automated Verification

- `zod` jest zależnością najwyższego poziomu: `npm ls zod --depth=0`
- Lint przechodzi: `npm run lint`
- Build przechodzi z nowym `env.schema`: `npm run build`
- Build przechodzi również **bez** ustawionego `OPENROUTER_API_KEY` (pola są opcjonalne)

#### Manual Verification

- Przy pustym `OPENROUTER_API_KEY` aplikacja pokazuje komunikat z `config-status`, a nie wyjątek
- Prompt systemowy czyta się samodzielnie, bez zaglądania w kod, i zawiera wszystkie sześć wymagań

**Implementation Note**: Po tej fazie zatrzymaj się i potwierdź treść promptu z człowiekiem, zanim
zbudujesz na nim serwis. To jedyny guardrail w slice — jego akceptacja nie jest formalnością.

---

## Faza 2: Serwis generowania

### Overview

Powstaje jedna funkcja, która woła OpenRouter i zwraca zwalidowane propozycje albo typowany błąd.
Bez trasy i bez UI — po tej fazie da się ją zawołać, ale nic jej jeszcze nie woła.

### Changes Required

#### 1. Serwis generowania

**File**: `src/lib/services/activity-generator.ts`

**Intent**: Zamknąć całą rozmowę z OpenRouterem w jednym miejscu: żądanie, wykrycie awarii,
ponowna próba, walidacja odpowiedzi i pomiar kosztu. Trasa ma z tego dostać albo gotowe
`ActivityDraft[]`, albo błąd, który da się zamienić na komunikat.

**Contract**: funkcja przyjmująca hasło nauczyciela i zwracająca propozycje wraz z `cost`
i `modelUsed` (`data.model` mówi, który model **faktycznie** odpowiedział — istotne przy routingu).
Żądanie zgodnie z `openrouter-api.md`:

- `POST https://openrouter.ai/api/v1/chat/completions`, nagłówki `Authorization`, `Content-Type`,
  `X-OpenRouter-Title`
- `model` z `OPENROUTER_MODEL` z fallbackiem na `google/gemini-3.7-flash`
- `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }`
  ze schematem z Fazy 1
- `provider: { require_parameters: true, data_collection: "deny" }` — pierwsze wycina dostawców
  bez wsparcia `json_schema` zamiast pozwolić im po cichu zignorować parametr, drugie realizuje NFR
  prywatności
- `reasoning: { enabled: false }` — tokeny reasoning są rozliczane jak output i dokładają latencji,
  a zadanie jest krótkie i kreatywne
- własny timeout przez `AbortSignal.timeout(...)`, żeby zawieszony dostawca nie trzymał połączenia
  nauczyciela w nieskończoność

#### 2. Taksonomia błędów

**File**: `src/lib/services/activity-generator.ts`

**Intent**: Sprowadzić dziewięć kodów OpenRoutera i awarie lokalne do trzech kategorii, bo tylko
tyle rozróżnień zmienia to, co nauczyciel ma zrobić.

**Contract**: typowany błąd z polem kategorii:

| Kategoria   | Źródło                                             | Czy retry pomoże |
| ----------- | -------------------------------------------------- | ---------------- |
| `transient` | 429, 500, 502, timeout, awaria częściowa            | tak              |
| `config`    | 401, 402, 403, 404                                  | nie              |
| `invalid`   | 400, błąd `JSON.parse`, błąd walidacji zoda         | tak (regeneracja) |

Rozpoznanie po `error.metadata.error_type` (kategoria znormalizowana przez OpenRoutera dla
wszystkich dostawców), nie po `provider_code`, który jest surowym kodem upstreamu.
`invalid` jest oznaczony jako wart ponowienia, bo model przy kolejnym losowaniu potrafi zmieścić
się w granicach, których poprzednio nie dotrzymał.

#### 3. Wykrycie awarii częściowej i ponowna próba

**File**: `src/lib/services/activity-generator.ts`

**Intent**: Sprawdzić `choices[0]` zanim cokolwiek sparsujemy, oraz raz ponowić próbę dla klasy
przejściowej.

**Contract**: brak `choices[0]`, `finish_reason === "error"` lub obecność `choices[0].error`
traktowane jako awaria **przed** `JSON.parse`. Jedna ponowna próba z backoffem wyłącznie dla
kategorii `transient`; `config` i `invalid` wracają natychmiast. Log przy każdym zakończeniu:
`usage.cost` i `data.model` (zasila Otwarte Pytanie Roadmapowe nr 2 o limit regeneracji).

### Success Criteria

#### Automated Verification

- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`

#### Manual Verification

- Wywołanie z prawidłowym kluczem zwraca trzy propozycje po polsku, zgodne ze schematem
- Wywołanie z celowo błędnym kluczem daje kategorię `config` i **nie** wykonuje ponownej próby
- `usage.cost` i `data.model` pojawiają się w logu

---

## Faza 3: Trasa API

### Overview

Serwis dostaje wejście HTTP: uwierzytelnienie, walidację hasła i daty, oraz mapowanie kategorii
błędu na odpowiedź, którą wyspa React potrafi zinterpretować.

### Changes Required

#### 1. Trasa generowania

**File**: `src/pages/api/day-plan/generate.ts`

**Intent**: Wystawić generowanie pod POST-em, z uwierzytelnieniem po stronie samej trasy.

**Contract**: `export const prerender = false` (wymóg projektu dla tras API) i `export const POST`.
Kolejność: sprawdzenie `context.locals.user` → walidacja ciała zodem → wywołanie serwisu.
Brak użytkownika kończy się **401 z JSON-em**, nie przekierowaniem — patrz § Critical Implementation
Details. Wejście przyjmowane jako JSON (nie `formData`), bo wywołanie idzie z wyspy React.

#### 2. Walidacja wejścia

**File**: `src/pages/api/day-plan/generate.ts`

**Intent**: Pierwsze użycie zoda w projekcie; ustanawia wzorzec dla kolejnych tras, bo trasy auth
go nie mają.

**Contract**: schemat wejścia z Fazy 1 — `plan_date` jako data ISO, `prompt` 1–2000 znaków.
Niepowodzenie walidacji → 400 z komunikatem po polsku, bez echa surowego błędu zoda do klienta.

#### 3. Mapowanie błędów na odpowiedź

**File**: `src/pages/api/day-plan/generate.ts`

**Intent**: Przekazać wyspie nie tylko treść komunikatu, ale i informację, czy pokazać przycisk
ponowienia — inaczej brak kredytów (402) i chwilowy rate limit wyglądałyby dla nauczyciela
identycznie.

**Contract**: ciało błędu z komunikatem po polsku i flagą `retryable` wyprowadzoną z kategorii
(`transient` i `invalid` → `true`, `config` → `false`). Szczegóły techniczne zostają w logu
serwera; klient nie dostaje treści błędu dostawcy.

### Success Criteria

#### Automated Verification

- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- `curl` bez ciasteczka sesji zwraca **401 i `Content-Type: application/json`** (nie 302, nie HTML)
- `curl` z hasłem dłuższym niż 2000 znaków zwraca 400

#### Manual Verification

- `curl` z ważną sesją zwraca trzy propozycje po polsku
- Odpowiedź błędu niesie `retryable` zgodne z kategorią awarii

---

## Faza 4: Interfejs `/plan`

### Overview

Pierwsza faza widoczna dla nauczyciela — domyka przepływ end-to-end z roadmapy.

### Changes Required

#### 1. Strona planowania

**File**: `src/pages/plan.astro`

**Intent**: Chroniona strona po polsku, hostująca wyspę React. Zgodnie z konwencją projektu Astro
odpowiada za układ i treść statyczną, React tylko za interakcję.

**Contract**: strona pod `/plan`, cały tekst po polsku, osadza wyspę z dyrektywą klienta.

#### 2. Ochrona trasy

**File**: `src/middleware.ts`

**Intent**: Dopisać stronę do listy chronionych; niezalogowany nauczyciel ma trafić na logowanie.

**Contract**: `PROTECTED_ROUTES` rozszerzone o `/plan`. **Tylko strona** — trasa API broni się sama
(Faza 3), bo przekierowanie zamiast 401 jest tam błędem, nie ochroną.

#### 3. Formularz i wynik generowania

**File**: `src/components/plan/GenerateDayPlanForm.tsx`

**Intent**: Jedyny element wymagający stanu: data, hasło, faza operacji, wynik, błąd.

**Contract**: `<input type="date">` (bez nowych zależności — S-01 potrzebuje jednego dnia, nie
kalendarza), pole hasła z licznikiem do 2000 znaków zgodnym z walidacją trasy, render trzech
propozycji jako tytuł + opis, przycisk „Generuj ponownie" realizujący FR-007 przez ponowny POST
(bez stanu, bo slice jest efemeryczny). Blokada podwójnego wysłania w trakcie operacji.

#### 4. Wskaźnik postępu

**File**: `src/components/plan/GenerationProgress.tsx`

**Intent**: Spełnić NFR „ciągły, widoczny postęp przez cały czas trwania operacji" bez streamingu.

**Contract**: sekwencja etapów po polsku plus upływający licznik czasu. Ponowna próba dla klasy
przejściowej dostaje **własny, jawny etap** — inaczej licznik rosnący po 30 sekundach bez zmiany
komunikatu czyta się jak zawieszenie. Etapy są orientacyjne (nie odzwierciedlają stanu po stronie
modelu) i nie mogą sugerować znajomości pozostałego czasu — pasek dobiegający do 100% i stojący
byłby gorszy niż spinner, bo przy rozrzucie 10–30 s zdarzałby się regularnie.

#### 5. Komunikaty błędów

**File**: `src/components/plan/GenerateDayPlanForm.tsx`

**Intent**: Zamienić trzy kategorie na trzy komunikaty odpowiadające na pytanie „czy mam klikać
jeszcze raz".

**Contract**: `transient` → „spróbuj ponownie za chwilę" z przyciskiem; `config` → komunikat
o niedostępności usługi **bez** przycisku ponowienia; `invalid` → „coś poszło nie tak"
z przyciskiem. Widoczność przycisku sterowana flagą `retryable` z trasy, nie zgadywana w kliencie.

#### 6. Wejście z dashboardu

**File**: `src/pages/dashboard.astro`

**Intent**: Dać nauczycielowi drogę do nowej funkcji po zalogowaniu.

**Contract**: link do `/plan`. Pozostałe teksty dashboardu zostają po angielsku — retrofit języka
jest świadomie poza zakresem S-01 (§ What We're NOT Doing).

### Success Criteria

#### Automated Verification

- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Wejście na `/plan` bez sesji przekierowuje na `/auth/signin`

#### Manual Verification

- Pełny przepływ działa: logowanie → `/plan` → data + hasło → trzy propozycje po polsku
- Wskaźnik postępu zmienia się przez całą operację; przy ponownej próbie widać osobny etap
- „Generuj ponownie" daje nowy zestaw propozycji dla tego samego hasła
- Brak klucza OpenRoutera daje komunikat bez przycisku ponowienia
- Cały tekst na `/plan` jest po polsku
- Podwójne kliknięcie „Generuj" nie wysyła dwóch żądań

**Implementation Note**: Po tej fazie zatrzymaj się i potwierdź z człowiekiem, że przepływ działa
end-to-end, zanim ruszy bramka jakości.

---

## Faza 5: Bramka jakości — odbiór promptu i wybór modelu

### Overview

Faza, dla której istnieje cały slice: rozstrzyga, czy LLM jest wystarczająco dobry dla tej niszy,
i zamienia domyślny model na wybrany świadomie. Bez niej S-01 dostarcza mechanikę, ale nie dowód.

### Changes Required

#### 1. Skrypt porównawczy

**File**: `scripts/compare-models.sh`

**Intent**: Puścić trzy modele przez pięć haseł przy **identycznym** prompcie i schemacie, żeby
porównanie mówiło o modelach, a nie o różnicach w konfiguracji.

**Contract**: skrypt powłoki (`curl` + `jq`) czytający `day-plan.pl.md` i `day-plan.schema.json`
wprost z `src/lib/services/prompts/` — te same pliki, których używa trasa, więc test nie może
rozjechać się z produkcją. Pętla po `google/gemini-3.7-flash`, `openai/gpt-5.6-luna`,
`deepseek/deepseek-v4-flash` × pięć haseł: neutralne, kulturowe („Andrzejki"), sezonowe,
trudne („Dzień Matki"), abstrakcyjne. Wyjścia zapisywane do plików wraz z `usage.cost` i `data.model`.
Skrypt jest jednorazowy i **świadomie poza CI** — projekt nie ma runnera TS, a testy to Moduł 3.

#### 2. Ocena i decyzja

**File**: `context/changes/first-day-generation/model-comparison.md`

**Intent**: Zapisać wynik i uzasadnienie wyboru tam, gdzie znajdzie je S-02 i S-03 — inaczej wybór
modelu stanie się plemienną wiedzą.

**Contract**: tabela 3 modele × 5 haseł z oceną ręczną według kryterium z PRD: **zero treści
nieodpowiednich dla 3–6 lat** (warunek dyskwalifikujący) oraz **≥ 75% propozycji akceptowalnych
bez edycji**. Do tego zaobserwowany koszt i czas odpowiedzi. Dokument kończy się wskazaniem modelu
z uzasadnieniem.

> Zapisz w dokumencie wprost, że „≥ 75% akceptowanych" jest tu **oceną ręczną na 15 propozycjach**,
> a nie metryką produktu: S-01 jest efemeryczny, więc nie ma mechanizmu mierzenia akceptacji —
> ta wejdzie dopiero z FR-009 w S-02. Bez tego zdania kolejny czytelnik uzna, że coś mierzymy.

#### 3. Zamrożenie wyboru

**File**: `.env.example`, `.dev.vars`

**Intent**: Przestawić `OPENROUTER_MODEL` na model wybrany dowodem, a nie rekomendacją z researchu.

**Contract**: `OPENROUTER_MODEL` ustawiony na zwycięzcę. Zmiana nie wymaga deployu ani modyfikacji
kodu — to była cała racja bytu tej zmiennej.

#### 4. Iteracja promptu, jeśli nie przechodzi

**File**: `src/lib/services/prompts/day-plan.pl.md`

**Intent**: Domknąć pętlę odbioru. Jeśli **żaden** model nie spełnia kryterium, problemem jest
prompt, nie model — bo to on niesie guardrail.

**Contract**: przy naruszeniu kryterium wieku lub akceptacji poniżej progu prompt jest poprawiany
i porównanie powtarzane. Fazy nie zamyka „przeszło u jednego modelu", tylko udokumentowany wynik
spełniający oba warunki. Jeśli po iteracjach kryterium wieku nadal pada, decyzja roadmapowa
„bez post-filtra w MVP" wraca na stół — to jawny warunek jej rewizji, nie porażka fazy.

### Success Criteria

#### Automated Verification

- Skrypt wykonuje 15 wywołań i zapisuje 15 wyjść bez błędu powłoki
- Każde zapisane wyjście parsuje się jako JSON zgodny ze schematem: `jq` po `aktywnosci | length == 3`

#### Manual Verification

- `model-comparison.md` zawiera ocenę wszystkich 15 propozycji
- Zero treści nieodpowiednich dla dzieci 3–6 lat u wybranego modelu
- Co najmniej 75% propozycji wybranego modelu akceptowalnych bez edycji
- Propozycje dla hasła „Andrzejki" są osadzone w polskich realiach przedszkolnych (test kompetencji
  kulturowej, dla którego wybrano kryterium PLCC w researchu modelu)
- `OPENROUTER_MODEL` wskazuje wybrany model, a `/plan` działa z nim na 2–3 hasłach przez realny
  interfejs (potwierdzenie pełnej ścieżki: walidacja granic, render, postęp, polski)

---

## Testing Strategy

Projekt nie ma runnera testów jednostkowych — `package.json` ma wyłącznie `test:db` (pgTAP),
a CI robi lint i build. Testy automatyczne to Moduł 3, więc weryfikacja S-01 jest świadomie ręczna
i zapisana jako taka w kryteriach każdej fazy. To ograniczenie zakresu, nie przeoczenie.

### Weryfikacja automatyczna (dostępna dziś)

- `npm run lint` i `npm run build` po każdej fazie
- `curl` na trasę: 401 bez sesji, 400 przy haśle poza granicami, 200 z trzema propozycjami
- `jq` na wyjściach skryptu porównawczego: zgodność ze schematem, dokładnie trzy aktywności

### Ręczne kroki weryfikacji

1. Bez klucza OpenRoutera: aplikacja startuje, `/plan` pokazuje komunikat o konfiguracji, nie wyjątek
2. Bez sesji: `/plan` przekierowuje na logowanie; `POST /api/day-plan/generate` zwraca 401 JSON
3. Ścieżka szczęśliwa: hasło „Andrzejki" → trzy propozycje po polsku, adekwatne dla 3–6 lat
4. Postęp: komunikat i licznik zmieniają się przez całą operację
5. Regeneracja: kolejne kliknięcie daje inny zestaw dla tego samego hasła
6. Błąd niemożliwy do naprawienia (celowo błędny klucz): komunikat bez przycisku ponowienia
7. Granice: hasło 2001 znaków odrzucone po stronie trasy
8. Bramka jakości: pięć haseł z Fazy 5 ocenione i zapisane

## Performance Considerations

Oczekiwanie na OpenRoutera to **I/O, nie czas CPU** — nie kumuluje się w kierunku limitu CPU
Workers (roadmap § S-01 Decyzje, za dokumentacją Cloudflare). Wywołanie 10–30 s jest bezpieczne
i nie wymaga streamingu ani wynoszenia logiki poza Workera. Własny `AbortSignal.timeout(...)`
chroni przed zawieszonym dostawcą, a nie przed limitem platformy.

Koszt jest nieistotny w tej skali: ~33 wywołania na nauczyciela miesięcznie, od $0,004 do $0,18
zależnie od modelu. `usage.cost` logujemy nie po to, żeby optymalizować, tylko żeby decyzja
o limicie regeneracji (Otwarte Pytanie Roadmapowe nr 2) miała kiedyś dane.

Prompt caching jest świadomie pominięty — przy ~700 tokenach wejścia oszczędność jest w groszach.
Wraca jako temat przy S-03, gdzie tydzień to pięć razy to samo wejście systemowe.

## Migration Notes

Brak migracji bazy danych — S-01 nic nie zapisuje. Schemat z F-01 pozostaje nietknięty.

Jednorazowe działania operacyjne poza kodem, wymagane **przed** Fazą 2:

1. Konto OpenRouter z doładowanymi kredytami (błąd 402 „brak kredytów" jest nie do naprawienia
   ponowną próbą — to prerekwizyt, nie szczegół)
2. `OPENROUTER_API_KEY` w `.dev.vars` (gitignored — łatwe do przeoczenia, patrz CLAUDE.md)
3. Przed pierwszym deployem: `npx wrangler secret put OPENROUTER_API_KEY`

Sekret w CI **nie jest wymagany**, bo pola są opcjonalne w `env.schema` — build przechodzi bez nich.

## References

- Research gotowości: `context/changes/first-day-generation/research.md`
- Research modelu: `context/changes/first-day-generation/llm-model-research.md`
- Referencja API: `context/foundation/openrouter-api.md`
- Decyzje slice'u: `context/foundation/roadmap.md` § S-01
- Wzorzec planu F-01: `context/changes/plan-persistence-baseline/plan.md`
- Reguły projektu: `context/foundation/lessons.md`
- Kontrakt wyjścia: `src/types.ts:67-75`
- Granice bazy: `supabase/migrations/20260720162247_bound_plan_and_activity_input.sql:19-46`

## Progress

> Konwencja: `- [ ]` do zrobienia, `- [x]` zrobione. Dopisz ` — <commit sha>`, gdy krok wyląduje.
> Nie zmieniaj tytułów kroków. Patrz `references/progress-format.md`.

### Faza 1: Konfiguracja i kontrakt generowania

#### Automated

- [x] 1.1 `zod` jest zależnością najwyższego poziomu: `npm ls zod --depth=0` — e0ac1a0
- [x] 1.2 Lint przechodzi: `npm run lint` — e0ac1a0
- [x] 1.3 Build przechodzi z nowym `env.schema`: `npm run build` — e0ac1a0
- [x] 1.4 Build przechodzi również bez ustawionego `OPENROUTER_API_KEY` — e0ac1a0

#### Manual

- [x] 1.5 Przy pustym kluczu aplikacja pokazuje komunikat z `config-status`, nie wyjątek — e0ac1a0
- [x] 1.6 Prompt systemowy czyta się samodzielnie i zawiera wszystkie sześć wymagań — e0ac1a0

### Faza 2: Serwis generowania

#### Automated

- [x] 2.1 Lint przechodzi: `npm run lint` — 255a9a4
- [x] 2.2 Build przechodzi: `npm run build` — 255a9a4

#### Manual

- [x] 2.3 Wywołanie z prawidłowym kluczem zwraca trzy propozycje po polsku, zgodne ze schematem — 255a9a4
- [x] 2.4 Celowo błędny klucz daje kategorię `config` i nie wykonuje ponownej próby — 255a9a4
- [x] 2.5 `usage.cost` i `data.model` pojawiają się w logu — 255a9a4

### Faza 3: Trasa API

#### Automated

- [x] 3.1 Lint przechodzi: `npm run lint` — 07bbb73
- [x] 3.2 Build przechodzi: `npm run build` — 07bbb73
- [x] 3.3 `curl` bez sesji zwraca 401 i `Content-Type: application/json` — 07bbb73
- [x] 3.4 `curl` z hasłem dłuższym niż 2000 znaków zwraca 400 — 07bbb73

#### Manual

- [x] 3.5 `curl` z ważną sesją zwraca trzy propozycje po polsku — 07bbb73
- [x] 3.6 Odpowiedź błędu niesie `retryable` zgodne z kategorią awarii — 07bbb73

### Faza 4: Interfejs `/plan`

#### Automated

- [x] 4.1 Lint przechodzi: `npm run lint`
- [x] 4.2 Build przechodzi: `npm run build`
- [x] 4.3 Wejście na `/plan` bez sesji przekierowuje na `/auth/signin`

#### Manual

- [x] 4.4 Pełny przepływ: logowanie → `/plan` → data + hasło → trzy propozycje po polsku
- [x] 4.5 Wskaźnik postępu zmienia się przez całą operację; ponowna próba ma osobny etap
- [x] 4.6 „Generuj ponownie" daje nowy zestaw propozycji dla tego samego hasła
- [x] 4.7 Brak klucza OpenRoutera daje komunikat bez przycisku ponowienia
- [x] 4.8 Cały tekst na `/plan` jest po polsku
- [x] 4.9 Podwójne kliknięcie „Generuj" nie wysyła dwóch żądań

### Faza 5: Bramka jakości — odbiór promptu i wybór modelu

#### Automated

- [ ] 5.1 Skrypt wykonuje 15 wywołań i zapisuje 15 wyjść bez błędu powłoki
- [ ] 5.2 Każde wyjście parsuje się jako JSON ze schematu: `jq` po `aktywnosci | length == 3`

#### Manual

- [ ] 5.3 `model-comparison.md` zawiera ocenę wszystkich 15 propozycji
- [ ] 5.4 Zero treści nieodpowiednich dla dzieci 3–6 lat u wybranego modelu
- [ ] 5.5 Co najmniej 75% propozycji wybranego modelu akceptowalnych bez edycji
- [ ] 5.6 Propozycje dla „Andrzejek" osadzone w polskich realiach przedszkolnych
- [ ] 5.7 `OPENROUTER_MODEL` wskazuje wybrany model, a `/plan` działa z nim na 2–3 hasłach
