# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-08-29

## 1. Strategy

Testy w tym projekcie podlegają trzem nienegocjowalnym zasadom:

1. **Koszt × sygnał.** Wygrywa najtańszy test, który daje realny sygnał dla danego
   ryzyka. Nie promuj do e2e dlatego, że e2e „wydaje się bezpieczniejsze". Nie
   nakładaj modelu oceniającego na deterministyczny warunek, który i tak łapie
   regresję.
2. **Obawy użytkownika są dowodem pierwszej kategorii.** Ryzyko zakotwiczone w
   „zespół boi się X, a awaria ujawni się gdzieś w obszarze Y" waży tyle samo, co
   linia PRD albo dane o churnie.
3. **Ryzyka to scenariusze, nie lokalizacje w kodzie.** Ten plan dokumentuje, *co
   może zawieść* i *dlaczego uważamy to za prawdopodobne* — na podstawie
   dokumentów, wywiadu i *sygnału* z kodu (churn, struktura, stan bazy testów).
   Plan NIE twierdzi, że wie, która linia jest właścicielem awarii. Tę wiedzę
   produkuje `/10x-research` w każdej fazie rolloutu. Jeśli plan i research nie
   zgadzają się co do tego, gdzie mieszka awaria, prawdą jest research.

Zakres skanu hot-spot użyty do ważenia prawdopodobieństwa: `src/`,
`supabase/migrations/`, `scripts/` (30 dni, 25 commitów).

Kontekst, który podnosi wagę każdej bramki: merge do `master` wypuszcza worker na
produkcję przez Cloudflare Workers Builds, bez kroku zatwierdzenia. `ci.yml` nie
deployuje i czytany osobno sugeruje coś przeciwnego. Bramka, która nie stoi przed
merge'em, nie stoi nigdzie.

## 2. Risk Map

Najważniejsze scenariusze awarii, uporządkowane wg ryzyka = impact × likelihood.
Ryzyka są scenariuszami awarii w kategoriach użytkownika i biznesu, nie nazwami
testów. Kolumna Źródło cytuje *dowód, który wyniósł ryzyko na wierzch* — nigdy
konkretnego pliku jako „miejsca, gdzie mieszka awaria" (to zadanie researchu,
patrz §1 zasada #3).

| # | Ryzyko (scenariusz awarii) | Impact | Likelihood | Źródło (dowód — nie anchor) |
|---|---|---|---|---|
| 1 | Nauczyciel dostaje propozycję nieodpowiednią dla dzieci 3–6 lat; nic nie stoi między modelem a nim, a zmiana promptu lub dopuszczonego modelu cofa bezpieczeństwo przy zerowym sygnale | High | High | PRD §Guardrails; wywiad Q1, Q2; `context/foundation/lessons.md` („prompt jako jedyna warstwa bezpieczeństwa"); `context/archive/2026-08-22-first-day-generation/` (decyzja: brak post-filtra w MVP); `CLAUDE.md` §CI (merge do `master` = produkcja) |
| 2 | Odpowiedź modelu spoza kontraktu kończy się cichym pustym lub niekompletnym planem zamiast uczciwą porażką — bez błędu, wyjątku i wpisu w logu | High | High | wywiad Q3, Q4; `context/archive/2026-08-23-edit-accept-day-plan/` (zobowiązanie o niezmienniku generacji przy zapisie); hot-spot dir `src/lib/services/` — 25 commitów/30d |
| 3 | Regeneracja jednego dnia albo generowanie całego tygodnia niszczy dzień, który nauczyciel już zaakceptował | High | Medium | PRD FR-007, FR-009, US-01 §Acceptance Criteria („bez wpływu na pozostałe dni"); `context/archive/2026-08-23-week-generation/`; `context/foundation/roadmap.md` S-05 §Risk; hot-spot dir `src/pages/api/` — 11 commitów/30d |
| 4 | Plan jednego konta staje się czytelny lub zapisywalny z innego konta, bo warstwa API sprawdza zalogowanie zamiast własności zasobu | High | Medium | PRD §Access Control + §NFR (prywatność treści); `context/archive/2026-07-18-plan-persistence-baseline/`; stan bazy testów: pgTAP pokrywa warstwę bazy, warstwa API jest bez testów |
| 5 | Awaria dostawcy LLM (timeout, 429, 5xx, ucięta odpowiedź) prezentuje się nauczycielowi jako sukces albo mylący błąd, a operacja trwająca 10–30 s zostawia go bez informacji o postępie | Medium | High | PRD §NFR (ciągły widoczny postęp), FR-006; `context/foundation/roadmap.md` S-01 §Decyzje (brak streamingu, wskaźnik postępu); hot-spot dir `src/lib/services/` — 25 commitów/30d |
| 6 | Niewalidowane wejście nauczyciela trafia do promptu i do bazy — przejęcie instrukcji modelu, koszt API w pętli regeneracji, zapis partii bez górnej granicy | Medium | Medium | PRD §Open Questions #2 (limit regeneracji, koszt API); `context/foundation/lessons.md` („domknij górną granicę wierszy potomnych przed pierwszą migracją"); hot-spot dir `supabase/migrations/` — 3 commity/30d |
| 7 | Nauczyciel bezpowrotnie traci zapisany plan dnia — hasło i wszystkie propozycje znikają trwale, a jedyne, co przed tym stoi, to dialog potwierdzenia w przeglądarce | High | Medium | `context/foundation/roadmap.md` S-05 §Risk („ryzyko, które faktycznie zajęło ich miejsce, to nieodwracalność… nie ma kosza, nie ma «Cofnij», nie ma odmowy po stronie schematu"); `context/archive/2026-08-27-delete-day-plan/`; PRD §Access Control (ścieżka kasująca jako zapis wrażliwy na własność) |

Ryzyka o wysokim impakcie i niskim prawdopodobieństwie — awaria samego
OpenRoutera, awaria regionu Cloudflare — nie mają tu wiersza. Należą do
obserwowalności i alertowania, nie do testu; projekt nie ma dziś warstwy
obserwowalności (`roadmap.md` §Baseline: absent), i to jest osobna decyzja, nie
luka w tym planie.

### Risk Response Guidance

| Ryzyko | Co dowodzi ochrony | Co zakwestionować | Kontekst, który `/10x-research` musi ugruntować | Najtańsza warstwa | Anty-wzorzec do uniknięcia |
|---|---|---|---|---|---|
| #1 | Zdefiniowany zestaw haseł produkuje wyjście, które powtarzalna kontrola oznacza jako niebezpieczne dla 3–6 lat — a kontrola obejmuje **każdy** dopuszczony model, nie tylko domyślny | „Poprawny JSON i wymagana liczba aktywności == treść bezpieczna". Wynik DeepSeeka przeszedł dokładnie te kontrole i zaproponował dzieciom roztopiony wosk | Gdzie wchodzi instrukcja systemowa; jak model jest wybierany i czy da się go podmienić bez deployu; co dziś sprawdza kontrola stojąca poza CI; jaki jest zbiór dopuszczonych modeli | contract + AI-native judge | Asercja przepisana z aktualnego wyjścia modelu (oracle problem) — test zielony na tym, co model akurat zwrócił, włącznie z tym, co zwrócił źle |
| #2 | Odpowiedź spoza kontraktu daje widoczny błąd i **żadnego** zapisu; nauczyciel nigdy nie ogląda pustego planu bez wyjaśnienia | „Pusta tablica == nauczyciel nie ma jeszcze planu" | Kontrakt odpowiedzi modelu; protokół zapisu partii i jego transakcyjność; niezmiennik generacji przy wstawianiu; co zwraca ścieżka odczytu po zapisie częściowym | integration | Mockowanie modułów wewnętrznych zamiast granicy sieciowej — test przestaje widzieć realny kształt odpowiedzi dostawcy |
| #3 | Zaakceptowany dzień przeżywa regenerację dnia sąsiedniego i generowanie całego tygodnia; rozróżnienie „roboczy vs zaakceptowany" nie gubi się po żadnej z tych operacji | „Zapis się udał, bo nie poleciał wyjątek" | Kolejność podbicia licznika generacji względem wstawienia partii; zachowanie ścieżki tygodniowej przy dniu, który już istnieje; granice transakcji | integration + rozszerzenie pgTAP | Test wyłącznie szczęśliwej ścieżki na pustym dniu — nigdy nie dotyka kolizji, więc nie może złapać zniszczenia |
| #4 | Żądanie z konta B wobec zasobu konta A kończy się jawną odmową na warstwie API, a nie cichym pustym wynikiem przepuszczonym w górę | „RLS wystarczy, więc endpoint nie musi sprawdzać własności" | Kształt sesji i jak tożsamość dociera do zapytania; co warstwa dostępu do danych zwraca przy odmowie bazy; jak kody błędów Postgresa są tłumaczone na odpowiedzi HTTP | integration na warstwie API | Test z jednym użytkownikiem — IDOR jest strukturalnie niewidoczny, dopóki w teście nie ma drugiego konta |
| #5 | Każda klasa awarii dostawcy (timeout, 429, 5xx, odpowiedź ucięta w połowie) daje inny, uczciwy komunikat i nie zostawia zapisu | „Status 200 == sukces" oraz „retry się udał, bo końcowy status jest 200" | Granica HTTP do dostawcy i sposób wstrzyknięcia w nią awarii; mapowanie klas błędów na odpowiedzi; co widzi interfejs w trakcie 10–30 s | unit + integration | Mockowanie własnej funkcji mapującej błędy zamiast wstrzyknięcia awarii na granicy sieciowej — test sprawdza wtedy sam siebie |
| #6 | Wejście przekraczające granice albo zawierające instrukcję dla modelu jest odrzucane po stronie serwera, nie tylko w formularzu; liczba zapisanych wierszy ma twardy sufit egzekwowany poniżej aplikacji | „Walidacja w kliencie == walidacja" oraz „schemat wejścia == to, co faktycznie trafia do promptu" | Gdzie wejście przechodzi walidację serwerową; jak jest wstrzykiwane do promptu; jakie ograniczenia egzekwuje schemat bazy, a jakie tylko aplikacja | unit + integration | Test wyłącznie na wejściu poprawnym; brak przypadku granicznego na długości wejścia i liczbie zapisanych wierszy |
| #7 | Operacja kasująca zdejmuje dokładnie jeden dzień dokładnie jednego właściciela: dzień sąsiedni, dzień innego konta i wiersze spoza zakresu przeżywają ją nietknięte, a żądanie wobec cudzego dnia nie kasuje nic | „Dialog potwierdzenia w przeglądarce jest potwierdzeniem" — klient nie musi go wywołać, więc serwer nie może na nim polegać; oraz „skasowało się poprawnie, bo odpowiedź jest 2xx" | Jak trasa kasująca ustala własność; zakres kasowania wobec wierszy potomnych; co widzi ścieżka odczytu i generowanie tygodnia po skasowaniu dnia | integration na API + pgTAP | Test kasujący jedyny istniejący dzień jedynego konta — strukturalnie nie może wykryć, że operacja zabrała za dużo |

## 3. Phased Rollout

Każdy wiersz to odrębna faza rolloutu, która otworzy własny folder zmiany przez
`/10x-new`. Status przesuwa się od lewej do prawej po wartościach ze słownika
poniżej; orkiestrator aktualizuje Status, gdy artefakty pojawiają się na dysku.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Runner + granica model→kontrakt→zapis | Udowodnić, że odpowiedź spoza kontraktu i awaria dostawcy kończą się uczciwą porażką, a nie cichym pustym planem | #2, #5 | unit + integration | change opened | context/changes/testing-generation-contract-boundary/ |
| 2 | Powtarzalna bramka bezpieczeństwa treści | Wyjąć jedyną kontrolę guardrailu z jednorazowego skryptu i objąć nią każdy dopuszczony model oraz każdą zmianę promptu | #1, #6 | contract + AI-native judge | not started | — |
| 3 | Ochrona zapisu i własności | Zaakceptowany dzień przeżywa regenerację i generowanie tygodnia; endpoint odmawia dostępu do cudzego zasobu | #3, #4, #7 | integration + pgTAP | not started | — |
| 4 | Bramki jakości w CI + e2e ścieżki krytycznej | Zamknąć podłogę przed merge'em do `master`, który deployuje wprost na produkcję | przekrojowe | gates + e2e | not started | — |

**Status vocabulary** (fixed — parser literals): `not started` → `change opened` →
`researched` → `planned` → `implementing` → `complete`.

## 4. Stack

Klasyczna baza testowa projektu. Narzędzia AI-native niosą datę `checked:`, żeby
przyszły czytelnik widział, które linie wymagają ponownej weryfikacji.

| Layer | Tool | Version | Notes |
|---|---|---|---|
| unit + integration | Vitest | none yet — §3 Phase 1 | Konfiguracja przez `getViteConfig()` z `astro/config`. **Astro 6 nie renderuje komponentów Astro w środowiskach client — testy renderujące wymagają `environment: 'node'`.** Projekt przypina Vite `^7.3.2` w `overrides`; wersja Vitest musi do tego pasować. checked: 2026-08-29 |
| API mocking | granica sieciowa (MSW lub podmiana `fetch`) | none yet — §3 Phase 1 | Wywołanie dostawcy LLM to zwykły `fetch`. Mockuj wyłącznie na granicy sieciowej — nigdy modułów wewnętrznych (patrz anty-wzorce #2 i #5) |
| database | pgTAP przez `supabase test db` | wired | **Jedyna działająca warstwa dziś**: 3 pliki w `supabase/tests/database/` (izolacja RLS, kontrakt zapisu, kontrakt kasowania). Uruchamianie: `npm run test:db`. Wymaga Dockera i `npx supabase start` |
| e2e | Playwright | none yet — §3 Phase 4 | Instalacja przez `npm init playwright@latest`. Jedna ścieżka krytyczna, nie zestaw regresyjny. checked: 2026-08-29 |
| accessibility | axe-core | none yet — nie zaplanowane | Poza zakresem tego rolloutu; §7 wyklucza testy wizualne UI, a a11y wymagałoby własnej fazy |
| (optional) AI-native | LLM-jako-sędzia oceniający stosowność treści dla 3–6 lat, uruchamiany przez tego samego dostawcę co produkt — checked: 2026-08-29 | n/a | **Kiedy NIE używać:** nigdy jako zamiennik deterministycznych asercji kształtu (schemat, liczba aktywności, język) — te są tańsze i pewniejsze; nigdy w pętli edycji ani na każdym commicie (koszt i niedeterminizm); nigdy jako jedyny sędzia bez zapisanej rubryki, bo wtedy bramka zmienia zdanie między przebiegami |

**Stack grounding tools (current session):**
- Docs: Context7 — sprawdzono konfigurację testów w Astro (`getViteConfig()`, wymóg `environment: 'node'` w Astro 6, ścieżka instalacji Playwright); checked: 2026-08-29
- Search: Exa.ai — **not available in current session** (serwer wymaga autoryzacji, której nie da się przeprowadzić w tej sesji). WebSearch/WebFetch dostępne, nieużyte — dokumentacja frameworka wystarczyła; checked: 2026-08-29
- Runtime/browser: Playwright MCP — **not available in current session**. Faza 4 użyje Playwrighta jako zwykłej zależności deweloperskiej, nie przez MCP; checked: 2026-08-29
- Provider/platform: GitHub / Cloudflare / Supabase MCP — **not available in current session** (Cloudflare i Supabase są obecne wyłącznie jako skille, nie serwery MCP). Bramki CI opierają się na `gh` CLI i `.github/workflows/ci.yml`; checked: 2026-08-29

## 5. Quality Gates

Pełny zestaw bramek, które muszą przejść, zanim zmiana dotrze na produkcję.
„Required after §3 Phase N" oznacza, że bramka jest egzekwowana, gdy ta faza
rolloutu wyląduje; wcześniej ma status planowany.

Bramki mają tu wagę większą niż zwykle: merge do `master` deployuje worker na
produkcję bez kroku zatwierdzenia, więc PR jest ostatnim miejscem, w którym
cokolwiek da się zatrzymać.

| Gate | Where | Required? | Catches |
|---|---|---|---|
| lint + typecheck (`npm run lint`, `astro sync`) | local (husky/lint-staged) + CI | required (wired) | dryf składniowy i typowy |
| build (`npm run build`) | CI on PR + push do `master` | required (wired) | błędy SSR i konfiguracji adaptera |
| testy bazy (`npm run test:db`) | local | required after §3 Phase 3 | regresje izolacji RLS i kontraktu zapisu; dziś uruchamiane ręcznie, faza 3 wprowadza je do CI |
| unit + integration | local + CI on PR | required after §3 Phase 1 | regresje kontraktu odpowiedzi, mapowania błędów, protokołu zapisu |
| bramka bezpieczeństwa treści (każdy dopuszczony model) | CI on PR, wyzwalana zmianą promptu lub konfiguracji modelu | required after §3 Phase 2 | propozycje nieodpowiednie dla 3–6 lat; cofnięcie guardrailu przez podmianę modelu |
| e2e na ścieżce krytycznej | CI on PR | required after §3 Phase 4 | zerwanie przepływu login → dzień → hasło → generowanie → edycja → akceptacja |
| post-edit hook | local (pętla agenta) | recommended after §3 Phase 4 | regresje w momencie edycji; nie zastępuje CI |
| smoke po deployu | między merge'em a produkcją | optional | awarie specyficzne dla środowiska Workers, których lokalny runtime nie odtwarza |

## 6. Cookbook Patterns

Jak dodawać testy w tym projekcie. Każda podsekcja wypełnia się, gdy odpowiednia
faza rolloutu wyląduje; wcześniej czyta się jako „TBD".

### 6.1 Dodanie testu jednostkowego

TBD — see §3 Phase 1 (wzorzec dla mapowania klas awarii dostawcy na uczciwy
komunikat i dla walidacji wejścia na granicy serwera).

### 6.2 Dodanie testu integracyjnego

TBD — see §3 Phase 1 (wzorzec dla granicy model → kontrakt → zapis: odpowiedź
spoza kontraktu kończy się błędem i zerowym zapisem; mockowanie wyłącznie na
granicy sieciowej).

### 6.3 Dodanie testu dla nowego endpointu API

TBD — see §3 Phase 3 (wzorzec dla odmowy dostępu do cudzego zasobu — test z
dwoma kontami, asercja na odpowiedzi API, nie tylko na wyniku zapytania).

### 6.4 Dodanie testu bazy danych (pgTAP)

- **Lokalizacja**: `supabase/tests/database/`.
- **Nazewnictwo**: `<obszar>.test.sql` (dziś: `rls_isolation.test.sql`,
  `day_plan_write.test.sql`, `day_plan_delete.test.sql`).
- **Test referencyjny**: `supabase/tests/database/rls_isolation.test.sql`.
- **Uruchomienie lokalnie**: `npm run test:db` (wymaga `npx supabase start`).
- **Kiedy tutaj, a kiedy wyżej**: niezmiennik, który baza egzekwuje sama
  (polityka, grant, CHECK, trigger), testuj tutaj. Zachowanie, które zależy od
  tłumaczenia błędu bazy na odpowiedź HTTP, testuj na warstwie API — patrz §6.3.

### 6.5 Dodanie przypadku do bramki bezpieczeństwa treści

TBD — see §3 Phase 2 (gdzie żyje zbiór haseł kontrolnych, jak dopisać nowy
model do zakresu bramki, jak zapisana jest rubryka oceny).

### 6.6 Notatki z faz rolloutu

(Wypełniane po każdej fazie — 2–3 linie o tym, czego faza nauczyła.)

## 7. What We Deliberately Don't Test

Wykluczenia uzgodnione podczas wywiadu (Faza 2, Q5). Przyszli kontrybutorzy
respektują je, dopóki nie zmieni się założenie leżące u podstaw.

- **Sam mechanizm auth Supabase** — rejestracja, logowanie i utrzymanie sesji to
  biblioteka, nie nasz kod. Testujemy **nasze użycie** — ochronę tras w middleware
  i to, czy tożsamość dociera do zapytania (ryzyko #4) — nie samą bibliotekę.
  Re-evaluate, jeśli projekt zacznie sam wystawiać lub odświeżać tokeny.
  (Źródło: wywiad Q5.)
- **Snapshoty i testy wizualne UI** — kafelki, siatka miesiąca i klasy Tailwind
  są kruche w utrzymaniu i dają słaby sygnał. Re-evaluate, jeśli regresja
  wizualna faktycznie dotrze do użytkownika albo jeśli podgląd dnia w siatce
  (roadmap S-07) wprowadzi stan, którego nie widać inaczej niż wizualnie.
  (Źródło: wywiad Q5.)
- **Jakość kreatywna propozycji** — czy „Dinozaury" dały *dobrą* aktywność, ocenia
  człowiek; PRD mierzy to metryką akceptacji ≥ 75%, nie bramką CI. To **nie
  obejmuje** bezpieczeństwa treści, które jest ryzykiem #1 i ma własną fazę.
  (Źródło: PRD §Success Criteria + wywiad Q5.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-08-29
- Stack versions last verified: 2026-08-29
- AI-native tool references last verified: 2026-08-29

Refresh (`/10x-test-plan --refresh`), gdy:

- z roadmapy lub archiwum wyłoni się nowe ryzyko z pierwszej trójki,
- data `checked:` rekomendowanego narzędzia jest starsza niż trzy miesiące,
- zmieni się stack projektu (nowy framework, nowy runner testów),
- §7 przestanie odpowiadać temu, w co zespół faktycznie wierzy.
