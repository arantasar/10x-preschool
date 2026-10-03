# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-09-30

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
| 8 | Dzień oznaczony jako gotowy przestaje być zatwierdzony po cichu: edycja treści zdejmuje akceptację, a nauczyciel nie zostaje o to zapytany przed zapisem ani nie dowiaduje się po nim, dlaczego zielona plakietka zniknęła | Medium | Medium | PRD FR-017 („jawność proporcjonalna do skutku"); `context/foundation/roadmap.md` S-12; trigger `activities_edit_clears_acceptance` działa od S-02 (`supabase/migrations/20260823095136_…`), więc skutek istniał w bazie o slice wcześniej niż jakakolwiek jego zapowiedź w interfejsie; `context/changes/edit-unaccepts-day/reviews/impl-review.md` F4 (ścieżka zgody bez dowodu automatycznego) |
| 9 | Operacja wykonana z poziomu tygodnia — cofnięcie akceptacji albo usunięcie planu dnia — trafia w inny dzień niż ten, który nauczyciel wskazał, bo tydzień pokazuje pięć kart obok siebie; przy kasowaniu pomyłki nie da się cofnąć | High | Low | `context/foundation/roadmap.md` S-11 §Risk („ryzyko nie leży w zapisie, tylko w celowaniu… operacja musi jednoznacznie nazywać dzień, którego dotyczy"); `context/foundation/prd-v2.md` FR-015 (Socrates: utrzymane z warunkiem nazywania dnia), FR-016; `context/changes/week-level-plan-controls/` (pierwsza operacja na pojedynczym dniu w widoku, który renderuje pięć dni naraz) |
| 10 | Podgląd dnia w siatce miesiąca pokazuje treść innego dnia niż ten, na którym zatrzymał się nauczyciel — spóźniona odpowiedź dnia minionego ląduje pod datą bieżącego — albo przeciągnięcie kursora przez rząd wysyła żądanie za każdy mijany dzień; nauczyciel bez myszy nie dochodzi do tej samej treści | Medium | Medium | `context/foundation/roadmap.md` S-07 §Risk (opóźnienie, anulowanie porzuconego żądania i pamięć podręczna jako warunki brzegowe, nie optymalizacja); `context/foundation/prd-v2.md` §Warunki jakościowe zmiany (zachowanie pod szybkim ruchem wskaźnika, osiągalność bez myszy), FR-010 (Socrates: kontrargument o burzy żądań przyjęty); `context/changes/month-day-preview/` (pierwszy odczyt w tle wyzwalany ruchem wskaźnika, nie kliknięciem) |
| 11 | Wydruk tygodnia pokazuje dzień niezaakceptowany jako gotowy (albo odwrotnie), pomija dzień roboczy albo zawiera propozycje, których nie ma w bazie — nauczyciel oddaje na papierze plan, który nie odpowiada temu, co zatwierdził | Medium | Low | `context/foundation/prd-v2.md` FR-020 (wszystkie dni robocze, szkice oznaczone); `context/foundation/roadmap.md` S-13 §Risk (napięcie „oznaczony szkic i tak zostanie oddany"); `context/changes/week-print/` (PDF generowany w przeglądarce ze stanu wyspy, nie z bazy — a wyspa trzyma też partie niezapisane) |
| 12 | Wydruk miesiąca pomija dzień roboczy miesiąca, drukuje dzień z sąsiedniego miesiąca (jako plan albo jako „Brak planu”), pokazuje szkic jako gotowy albo zawiera plan innego nauczyciela — nowy odczyt całego miesiąca z aktywnościami jest pierwszym odczytem w paczce szerszym niż tydzień | High | Low | `context/foundation/prd-v2.md` FR-021, §Zachowania chronione (izolacja kont); `context/foundation/roadmap.md` S-14 §Risk; `context/changes/month-print/` |
| 13 | Temat wpisany przez gościa na stronie głównej gubi się w drodze przez rejestrację, potwierdzenie e-maila i logowanie — nauczyciel ląduje na pustym formularzu tygodnia albo na miesiącu — albo wypełnia formularz za każdym kolejnym wejściem, nadpisując hasło, które sama zapisała | Low | Medium | `context/archive/2026-09-29-design-foundation/research.md` §Follow-up (N1: przeniesienie hasła bez LLM dla gościa); `context/archive/2026-09-29-design-foundation/plan.md` Faza 4 (sesja powstaje dopiero po kliknięciu linku, parametr w URL tego nie przeżyje — stan jedzie ciasteczkiem przez kilka nawigacji i dwie trasy) |
| 14 | Po przebudowie siatki miesiąc przestaje mieścić się w wysokości, w której mieścił się dotąd — długi temat dnia albo długie hasło rozpycha wiersz, siatka rośnie i nauczyciel przestaje widzieć cały miesiąc bez przewijania | Medium | Medium | `context/foundation/prd-v2.md` §Warunki jakościowe zmiany („pełny miesiąc bez przewijania”); `context/changes/design-planner/plan.md` Faza 2 (siatka pn–pt z tematem tygodnia w wierszu; wysokość komórki stała, nie minimalna); `context/archive/` `month-day-preview` (558 px jako wysokość bloku siatki) |

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
| #3 | Zatwierdzony dzień przeżywa każdą regenerację i generowanie tygodnia, na które nie padła zgoda nazywająca ten dzień (w tygodniu także jego `accepted_at`); zgoda zastępuje go i cofa zatwierdzenie | „Zapis się udał, bo nie poleciał wyjątek" | Kolejność podbicia licznika generacji względem wstawienia partii; zachowanie ścieżki tygodniowej przy dniu, który już istnieje; granice transakcji; zgoda dnia (boolean) vs zgoda tygodnia (data + `accepted_at`) | integration + rozszerzenie pgTAP | Test wyłącznie szczęśliwej ścieżki na pustym dniu — nigdy nie dotyka kolizji, więc nie może złapać zniszczenia |
| #4 | Żądanie z konta B wobec zasobu konta A kończy się jawną odmową na warstwie API, a nie cichym pustym wynikiem przepuszczonym w górę. Jawna odmowa (404 `retryable: false`) dotyczy tras adresowanych id (`accept` — `plan_id`, `activity/[id]`); trasy adresowane datą nie potrafią nazwać cudzego wiersza, więc dla nich ochrona brzmi „operacja B na dacie D nie dotyka wiersza A na D" | „RLS wystarczy, więc endpoint nie musi sprawdzać własności" | Kształt sesji i jak tożsamość dociera do zapytania; co warstwa dostępu do danych zwraca przy odmowie bazy; jak kody błędów Postgresa są tłumaczone na odpowiedzi HTTP | integration na warstwie API | Test z jednym użytkownikiem — IDOR jest strukturalnie niewidoczny, dopóki w teście nie ma drugiego konta |
| #5 | Każda klasa awarii dostawcy (timeout, 429, 5xx, odpowiedź ucięta w połowie) daje inny, uczciwy komunikat i nie zostawia zapisu | „Status 200 == sukces" oraz „retry się udał, bo końcowy status jest 200" | Granica HTTP do dostawcy i sposób wstrzyknięcia w nią awarii; mapowanie klas błędów na odpowiedzi; co widzi interfejs w trakcie 10–30 s | unit + integration | Mockowanie własnej funkcji mapującej błędy zamiast wstrzyknięcia awarii na granicy sieciowej — test sprawdza wtedy sam siebie |
| #6 | Wejście przekraczające granice albo zawierające instrukcję dla modelu jest odrzucane po stronie serwera, nie tylko w formularzu; liczba zapisanych wierszy ma twardy sufit egzekwowany poniżej aplikacji | „Walidacja w kliencie == walidacja" oraz „schemat wejścia == to, co faktycznie trafia do promptu" | Gdzie wejście przechodzi walidację serwerową; jak jest wstrzykiwane do promptu; jakie ograniczenia egzekwuje schemat bazy, a jakie tylko aplikacja | unit + integration | Test wyłącznie na wejściu poprawnym; brak przypadku granicznego na długości wejścia i liczbie zapisanych wierszy |
| #7 | Operacja kasująca zdejmuje dokładnie jeden dzień dokładnie jednego właściciela: dzień sąsiedni, dzień innego konta i wiersze spoza zakresu przeżywają ją nietknięte, a żądanie wobec cudzego dnia nie kasuje nic | „Dialog potwierdzenia w przeglądarce jest potwierdzeniem" — klient nie musi go wywołać, więc serwer nie może na nim polegać; oraz „skasowało się poprawnie, bo odpowiedź jest 2xx" | Jak trasa kasująca ustala własność; zakres kasowania wobec wierszy potomnych; co widzi ścieżka odczytu i generowanie tygodnia po skasowaniu dnia | integration na API + pgTAP | Test kasujący jedyny istniejący dzień jedynego konta — strukturalnie nie może wykryć, że operacja zabrała za dużo |
| #8 | Edycja w dniu zaakceptowanym pyta **przed** zapisem, a po zgodzie mówi, co zdjęła; odmowa nie wysyła żądania; druga edycja tego samego, już roboczego dnia nie pyta o nic | „Skoro wyspa wie, czy dzień jest zaakceptowany, to wystarczy jej własna kopia" — kopia bywa stara o minuty i jest nieaktualna dokładnie w przypadku, dla którego to ryzyko istnieje; oraz „dialog się pokazał == zapis został zatrzymany" | Skąd pochodzi fakt „ta operacja zdjęła akceptację" — z odpowiedzi serwera czy ze stanu wyspy; czy bramka dialogu czyta stan żywy, czy render scope domknięcia ponowienia; co odróżnia dzień roboczy od tego, który właśnie stracił akceptację | e2e (dialog przeglądarki nie ma innego domu) + unit na trasie | Asercja negatywna bez dowodu, że dialog w ogóle padł — „nic się nie zmieniło" przechodzi też wtedy, gdy kliknięcie nie doszło do przycisku |
| #9 | Operacja z tygodnia zmienia **dokładnie** wskazany dzień, a sąsiedni dzień tego samego tygodnia przeżywa ją nietknięty; nazwa dnia pada przed kasowaniem (w dialogu) i po cofnięciu akceptacji (w komunikacie), a nazwa dostępna przycisku zawiera datę | „Karta jest w DOM-ie pod swoją datą, więc kliknięcie w nią trafia w tę datę" — cel żądania wyznacza kod wyspy, nie położenie karty, a pięć identycznych przycisków różni się wyłącznie tym, do którego dnia są podpięte | Skąd operacja bierze dzień, na którym działa — z argumentu wywołania czy ze stanu tygodnia; czy dialog kasowania i komunikat po operacji budują datę z tego samego źródła co żądanie; co stan akceptacji w dialogu mówi, gdy kopia wyspy jest nieaktualna | e2e (cel kliknięcia i dialog przeglądarki nie mają innego domu) + unit na zdaniach | Test z jednym zasianym dniem w tygodniu — strukturalnie nie wykryje trafienia w sąsiada |
| #10 | Popover pokazuje wyłącznie dzień, na którym wskaźnik albo fokus się zatrzymał; dni mijane przy przeciągnięciu nie są pobierane; dzień obejrzany nie jest pobierany drugi raz w tym samym widoku strony; klawiatura dochodzi do tej samej treści co mysz | „Kafelek jest w DOM-ie pod swoją datą, więc popover pokazuje tę datę" — treść wyznacza kolejność odpowiedzi, nie położenie kafelka; oraz „żądanie się nie pokazało, więc nie poleciało" bez dowodu, że opóźnienie zdążyło minąć | Skąd bierze się opóźnienie i co je kasuje; czy anulowanie przerywa żądanie w locie, czy tylko timer; kiedy odpowiedź trafia na ekran, a kiedy wyłącznie do pamięci; co odróżnia fokus klawiatury od fokusu po kliknięciu | unit (czas, fałszywe zegary) + e2e (podpięcie do kafelków, klawiatura) | Test z jednym zasianym dniem — strukturalnie nie wykryje treści sąsiada ani żądania za dzień mijany; oraz asercja „brak żądania" zrobiona przed upływem opóźnienia, zielona niezależnie od tego, czy timer anulowano |

## 3. Phased Rollout

Każdy wiersz to odrębna faza rolloutu, która otworzy własny folder zmiany przez
`/10x-new`. Status przesuwa się od lewej do prawej po wartościach ze słownika
poniżej; orkiestrator aktualizuje Status, gdy artefakty pojawiają się na dysku.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Runner + granica model→kontrakt→zapis | Udowodnić, że odpowiedź spoza kontraktu i awaria dostawcy kończą się uczciwą porażką, a nie cichym pustym planem | #2, #5 | unit + integration | complete | context/archive/2026-08-29-testing-generation-contract-boundary/ |
| 2 | Powtarzalna bramka bezpieczeństwa treści | Wyjąć jedyną kontrolę guardrailu z jednorazowego skryptu i objąć nią każdy dopuszczony model oraz każdą zmianę promptu | #1, #6 | contract + AI-native judge | complete | context/archive/2026-08-31-testing-content-safety-gate/ |
| 3 | Ochrona zapisu i własności | Zatwierdzony dzień ginie tylko po zgodzie nazywającej ten dzień; trasa adresowana id odmawia cudzego zasobu 404, trasa adresowana datą nie dotyka wiersza drugiego konta; odmowa pustej partii (`U0003`) ma asercje pgTAP | #3, #4, #7 | integration + pgTAP | complete | context/archive/2026-09-30-testing-write-ownership/ |
| 4 | Bramki jakości w CI + e2e ścieżki krytycznej | Zamknąć podłogę przed merge'em do `master`, który deployuje wprost na produkcję | przekrojowe | gates + e2e | not started | — |

**Status vocabulary** (fixed — parser literals): `not started` → `change opened` →
`researched` → `planned` → `implementing` → `complete`.

**Pokrycie e2e spoza rolloutu (2026-09-03).** Ryzyka #4 i #7 mają od dzisiaj
warstwę przeglądarkową — trzy testy Playwrighta plus infrastruktura, opisane
w §6.6. **Nie jest to postęp żadnej fazy** i dlatego oba statusy wyżej zostają
`not started`:

- powstały jako samodzielne ćwiczenie `/10x-e2e` (Moduł 3, Lekcja 4), bez
  `/10x-new`, bez folderu zmiany i bez `## Progress`;
- Faza 3 to **integration + pgTAP**, a te testy nie dotykają ani warstwy trasy
  wołanej bez HTTP (§6.2), ani `U0003` (§6.4) — jej zakres jest nietknięty;
- Faza 4 to **bramki w CI**, a te testy w CI nie stoją (§5) i nie pokrywają
  ścieżki krytycznej z generowaniem.

Wybór akurat #4 i #7 był podyktowany kolejnością prac, nie wagą: `next-actions.md`
§Pułapka 2 odracza Fazę 3 do czasu slice'u regeneracji tygodnia, bo ten zmienia
kryterium ochrony Ryzyka #3 z „nigdy nie niszczy" na „nigdy bez jawnego
potwierdzenia". #4 i #7 tej zmiany nie dotyczą, więc nic tu nie trzeba będzie
przepisywać; #3 świadomie zostało pominięte.

_Stan na 2026-09-30:_ #3 ma warstwę przeglądarkową od `S-10`
(`tests/e2e/regenerate-confirmation.spec.ts` — odmowa w oknie dnia i w obu oknach
tygodnia nie wysyła żądania). Faza 3 jest `complete`; pod przeglądarką dołożyła
pgTAP i trasy wołane bez HTTP (§6.3), a e2e nie ruszała.

## 4. Stack

Klasyczna baza testowa projektu. Narzędzia AI-native niosą datę `checked:`, żeby
przyszły czytelnik widział, które linie wymagają ponownej weryfikacji.

| Layer | Tool | Version | Notes |
|---|---|---|---|
| unit + integration | Vitest | none yet — §3 Phase 1 | Konfiguracja przez `getViteConfig()` z `astro/config`. **Astro 6 nie renderuje komponentów Astro w środowiskach client — testy renderujące wymagają `environment: 'node'`.** Projekt przypina Vite `^7.3.2` w `overrides`; wersja Vitest musi do tego pasować. checked: 2026-08-29 |
| API mocking | granica sieciowa (MSW lub podmiana `fetch`) | none yet — §3 Phase 1 | Wywołanie dostawcy LLM to zwykły `fetch`. Mockuj wyłącznie na granicy sieciowej — nigdy modułów wewnętrznych (patrz anty-wzorce #2 i #5) |
| database | pgTAP przez `supabase test db` | wired, **w CI** (job `db`, doradczy) | 4 pliki w `supabase/tests/database/` (izolacja RLS, kontrakt zapisu dnia, kontrakt zapisu tygodnia, kontrakt kasowania), 129 asercji po Fazie 3. Uruchamianie: `npm run test:db`. Wymaga Dockera i `npx supabase start` |
| integration (trasa + prawdziwy klient) | Vitest, `vitest.db.config.ts` | wired, **w CI** (job `db`, doradczy) | Od Fazy 3: trasy wołane jako funkcje z `locals.supabase` = prawdziwy `supabase-js` zalogowany jako konto A albo B na lokalnym stosie (§6.3). Pliki `src/**/*.db.test.ts`, poza `npm test`. Uruchamianie: `npm run test:db:api`. Wymaga `npx supabase start`; bez stosu kończy się błędem, nie pominięciem |
| e2e | Playwright | `@playwright/test` ^1.62.1 — **wired lokalnie, poza CI** | Postawione 2026-09-03 poza rolloutem (§3, §6.6), nie przez Fazę 4. `playwright.config.ts`: projekt `setup` + `webServer`, `storageState` dla dwóch kont. Uruchamianie: `npm run test:e2e` (wymaga `npx supabase start` i `.env.e2e`). Dziś trzy testy ryzyk #4 i #7 — **nie** ścieżka krytyczna z generowaniem, którą zakłada §5. checked: 2026-09-03 |
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

**Żadna bramka na PR-ze nie jest dziś blokująca — wszystkie są doradcze.**
Ochrona gałęzi wymaga publicznego repozytorium albo planu GitHub Pro, a to jest
prywatne repo na planie darmowym: `gh api …/branches/master/protection` odpowiada
`403 Upgrade to GitHub Pro or make this repository public`, a PR raportuje
`mergeStateStatus: CLEAN` niezależnie od wyniku checków. Czerwony test pokazuje
czerwony znaczek i nic poza tym; przycisk merge zostaje aktywny. Świadoma decyzja
z 2026-08-30 — repozytorium zostaje prywatne, planu nie kupujemy — więc ostatnią
realną bramką przed produkcją jest człowiek czytający checki przed kliknięciem.
Kolumna „Required?" opisuje zatem, co jest **wpięte i uruchamiane**, a nie co
jest **egzekwowane**. Re-evaluate, gdy repozytorium zmieni status albo plan.

| Gate | Where | Required? | Catches |
|---|---|---|---|
| lint + typecheck (`npm run lint`, `astro sync`) | local (husky/lint-staged) + CI | required (wired, doradcza) | dryf składniowy i typowy |
| build (`npm run build`) | CI on PR + push do `master` | required (wired, doradcza) | błędy SSR i konfiguracji adaptera |
| testy bazy (`npm run test:db`, `npm run test:db:api`) | local + CI on PR i push do `master` (job `db`) | required (wired, doradcza) — od §3 Phase 3 | regresje izolacji RLS, kontraktu zapisu i kasowania (pgTAP) oraz własności na trasie — RLS i tłumaczenie na HTTP naraz (§6.3). Osobny job, żeby czerwień bazy miała własny znaczek; bez sekretów repozytorium |
| unit + integration | local + CI on PR | required (wired, doradcza) | regresje kontraktu odpowiedzi, mapowania błędów, protokołu zapisu |
| bramka bezpieczeństwa treści (każdy dopuszczony model) | CI on PR, wyzwalana zmianą promptu lub konfiguracji modelu | required after §3 Phase 2 | propozycje nieodpowiednie dla 3–6 lat; cofnięcie guardrailu przez podmianę modelu |
| e2e na ścieżce krytycznej | CI on PR | required after §3 Phase 4 | zerwanie przepływu login → dzień → hasło → generowanie → edycja → akceptacja |
| e2e ryzyk #4 i #7 (`npm run test:e2e`) | **local only** | nie jest bramką — uruchamiane ręcznie | wyciek planu między kontami, kasowanie wychodzące poza jeden dzień, kasowanie mimo odmowy w dialogu. **W CI nie stoi**: wymaga lokalnej Supabase (`npx supabase start`) i klucza serwisowego w `.env.e2e`, a workflow nie ma dziś ani jednego, ani drugiego |
| post-edit hook | local (pętla agenta) | recommended after §3 Phase 4 | regresje w momencie edycji; nie zastępuje CI |
| smoke po deployu | między merge'em a produkcją | optional | awarie specyficzne dla środowiska Workers, których lokalny runtime nie odtwarza |

## 6. Cookbook Patterns

Jak dodawać testy w tym projekcie. Każda podsekcja wypełnia się, gdy odpowiednia
faza rolloutu wyląduje; wcześniej czyta się jako „TBD".

### 6.1 Dodanie testu jednostkowego

- **Lokalizacja**: ko-lokowany obok testowanego modułu — `foo.ts` sąsiaduje z
  `foo.test.ts` w tym samym katalogu. Bez katalogu `tests/` na szczycie drzewa:
  test, którego nie widać obok modułu, nie zostanie zaktualizowany razem z nim.
- **Nazewnictwo**: `<nazwa-modułu>.test.ts`. Dane pomocnicze (kształty odpowiedzi
  dostawcy, atrapy klienta) idą do `__fixtures__/` obok testów, nie do pliku testu.
- **Test referencyjny**: `src/lib/services/activity-generator.test.ts` —
  czternaście klas awarii dostawcy jako tabela `it.each`, każda z asercją na
  kategorii, na `retryable` **i na liczbie wywołań `fetch`**.
- **Uruchomienie lokalnie**: `npm test` (Vitest, `vitest run`). W CI ten sam
  skrypt stoi po `npx astro sync`, a przed `npm run build`.
- **Zasada mockowania**: podmieniamy **wyłącznie** `globalThis.fetch` (granica
  sieciowa) i `astro:env/server` (konfiguracja, nie kod). **Nigdy** modułu z
  `src/lib/` — mockowany moduł wewnętrzny to test, który sprawdza sam siebie.
  Fixture nie importuje niczego z modułu, który testuje.
- **Kiedy tutaj, a kiedy wyżej**: czysta funkcja, schemat zoda, mapowanie błędu,
  strażnik typu — tutaj. Zachowanie, które zależy od tego, jak trasa łączy kilka
  modułów (status HTTP, kolejność walidacja→zapis), wyżej — patrz §6.2.
- **Fake timers są obowiązkowe** wszędzie, gdzie ścieżka ponawia (`RETRY_BACKOFF_MS`
  to realny `setTimeout`) albo czeka na timeout. Bez nich każdy przypadek
  `transient` kosztuje sekundę; zestaw ma zostać sekundowy, nie minutowy.
- **Asercja negatywna musi być rozróżniająca**: zanim test „X się nie wydarzyło"
  trafi do zestawu, zepsuj kod, który za X odpowiada, i zobacz go na czerwono.
  To ta sama reguła co w `rls_isolation.test.sql:152-156` i w `lessons.md`
  („Kryterium weryfikacji musi móc nie przejść").

### 6.2 Dodanie testu integracyjnego

- **Lokalizacja**: ko-lokowany obok trasy — `src/pages/api/<obszar>/<trasa>.test.ts`.
- **Nazewnictwo**: `<nazwa-trasy>.test.ts`, jak dla testu jednostkowego.
- **Test referencyjny**: `src/pages/api/day-plan/generate.test.ts`.
- **Uruchomienie lokalnie**: `npm test` — ten sam runner i ta sama bramka co §6.1.
- **Jak wywołać trasę**: `POST` jest zwykłą eksportowaną funkcją, więc testuje się
  ją bez serwera HTTP — `POST({ request, locals })` z ręcznie zbudowanym `Request`
  i atrapą `locals`. Klient Supabase wstrzykuje się przez `context.locals`, bo
  `day-plan-store.ts` bierze go zawsze pierwszym argumentem i nigdy z singletonu
  modułu; kod produkcyjny nie wymaga z tego powodu żadnej zmiany.
- **Zasada mockowania**: jak w §6.1 — wyłącznie `globalThis.fetch` i `locals`,
  nigdy moduł z `src/lib/`. Atrapa Supabase odwzorowuje PostgREST **dokładnie tak
  głęboko, jak potrzebują wołane funkcje** i ani o wywołanie dalej; głębsza
  imitacja zaczyna być drugą implementacją PostgREST-a i test przestaje mówić
  cokolwiek o prawdziwej.
- **Co asertować**: licznik, nie brak wyjątku. „Zapis się nie odbył" znaczy
  `expect(supabase.rpc).not.toHaveBeenCalled()`, a nie „trasa nie rzuciła".
- **Przypadek pozytywny jest obowiązkowy**: bez „szczęśliwa ścieżka woła `rpc`
  dokładnie raz z trzema aktywnościami" cały blok negatywny przechodziłby przy
  trasie, która nie zapisuje niczego nigdy.
- **Kiedy tutaj, a kiedy wyżej**: zachowanie trasy jako całości — status, envelope
  `{ error, retryable }`, kolejność walidacja→zapis — tutaj. Niezmiennik, którego
  pilnuje sama baza (polityka, grant, CHECK, trigger), niżej — patrz §6.4.
  Przepływ przez kilka ekranów w przeglądarce — wyżej, e2e (§6.6).
- **Własność tutaj się nie dowodzi.** Trasy nie filtrują po `user_id` — robi to
  RLS za sesją w kliencie — więc atrapa „drugiego konta" zwraca to, co jej kazano.
  Tutaj asertuje się, jak trasa **odpowiada** na pusty wynik; że pusty wynik jest
  tym, co drugie konto naprawdę dostaje, należy do §6.3.

### 6.3 Dodanie testu dla nowego endpointu API

Nowy endpoint dostaje **dwa** pliki testu: zachowanie trasy na atrapie (§6.2)
oraz własność na prawdziwym kliencie — ten drugi opisuje ta sekcja. Wzorzec
powstał w Fazie 3: trasa wołana jako funkcja, jak w §6.2, ale `locals.supabase`
to **prawdziwy `supabase-js` zalogowany jako konto A albo B** na lokalnym stosie.
Dowodzi trasy i RLS naraz, bez HTTP, middleware i przeglądarki.

- **Lokalizacja i nazewnictwo**: obok trasy, `<nazwa-trasy>.db.test.ts`
  (np. `src/pages/api/day-plan/accept.db.test.ts`). Sufiks `.db.test.ts` jest
  kontraktem: `vitest.config.ts` go wyklucza, `vitest.db.config.ts` bierze
  wyłącznie jego.
- **Test referencyjny**: `src/pages/api/day-plan/accept.db.test.ts` (trasa
  adresowana id); dla trasy adresowanej datą `index.db.test.ts`.
- **Uruchomienie**: `npx supabase start`, potem `npm run test:db:api`. W CI
  job `db` (§5). Konfiguracja: `vitest.db.config.ts` — osobny plik z tego samego
  powodu co `vitest.gate.config.ts` (§6.5), `fileParallelism: false`, bo pliki
  dzielą dwa stałe konta.
- **Helper**: `src/lib/services/__fixtures__/supabase-local.ts`.
  `teacherClient("a" | "b")` → `{ client, userId }` (konto zakładane
  idempotentnie, adresy `api-teacher-{a,b}@example.test`, odrębne od e2e);
  `seedDay(userId, date, { prompt, activities, accepted? })` → `{ planId,
  activityIds }`; `cleanup(planIds)`; `uniquePlanDate()`/`plusDays()`/
  `uniqueStamp()`/`activitiesFor()` re-eksportowane z `tests/e2e/support/test-data.ts`.
  Zmienne `API_URL`, `PUBLISHABLE_KEY`, `SECRET_KEY` — nazwane jak w
  `supabase status -o env`; brakujące helper uzupełnia jednym wywołaniem tej
  komendy. Odmawia pracy, gdy `API_URL` nie wskazuje `localhost`/`127.0.0.1`.
- **Klucz serwisowy wyłącznie do zakładania kont, zasiewu i sprzątania — nigdy
  do asercji.** Omija RLS, więc sprawdzałby, że wiersz istnieje w bazie, a nie że
  drugie konto go nie widzi. „A nietknięte" czyta się **klientem A**. Sprzątanie
  po `id`, nigdy po dacie (po dacie skasowałoby wiersz drugiego konta), w
  `afterEach`. Wiersz, który tworzy sama trasa (np. `week/save`), odczytaj
  klientem jego właściciela i dopisz jego `id` do sprzątania **przed**
  asercjami — padnięta asercja nie może zostawić go w bazie
  (`week/save.db.test.ts`).
- **Kontrola pozytywna właściciela jest obowiązkowa**: po „B dostaje 404"
  ten sam request od A musi przejść. Bez niej każda asercja negatywna przechodzi
  przy trasie odmawiającej wszystkim.
- **Co asertować — zależnie od adresowania trasy.** Trasa adresowana id
  (`plan_id`, `activity id`): cudzy id → 404 `retryable: false`, a wiersz A
  bez zmian. Trasa adresowana datą: nie da się nazwać cudzego wiersza, więc
  asercja brzmi „B na dacie D widzi i zmienia wyłącznie swoje; wiersz A na D
  nietknięty" — z wariantem, w którym **oba** konta mają D.
- **Głośno, nie skip.** Brak stosu albo kluczy rzuca przy imporcie helpera i
  kończy przebieg na czerwono z komunikatem „uruchom `npx supabase start`".
  Pominięty test w CI to zielony znaczek nad niczym.
- **Rytuał mutacji**: poluzuj politykę (`alter policy … using (true)` w `psql`),
  zobacz test na czerwono, przywróć dokładne wyrażenie. Zmierzone wyniki stoją w
  komentarzu nagłówka każdego pliku — w tym dwa, które nie zapaliły tego, czego
  się spodziewano (§6.7).
- **Kiedy tutaj, a kiedy gdzie indziej**: własność na trasie (RLS + tłumaczenie
  na HTTP) — tutaj. Zachowanie trasy niezależne od własności (statusy, envelope,
  liczba wywołań, brak ponowienia, 400/401 bez bazy) — atrapa, §6.2. Niezmiennik,
  który baza egzekwuje sama — pgTAP, §6.4. Trasa, która woła model — atrapa,
  bo jej test podmienia `globalThis.fetch`, a to ta sama granica, przez którą
  rozmawia `supabase-js`. Przepływ przez przeglądarkę — e2e, §6.6
  (`tests/e2e/day-plan-ownership.spec.ts` dowodzi tego samego na żywej aplikacji,
  o dwa rzędy wielkości drożej).

### 6.4 Dodanie testu bazy danych (pgTAP)

- **Lokalizacja**: `supabase/tests/database/`.
- **Nazewnictwo**: `<obszar>.test.sql` (dziś: `rls_isolation.test.sql`,
  `day_plan_write.test.sql`, `week_plan_write.test.sql`,
  `day_plan_delete.test.sql` — 27 + 61 + 35 + 6 = 129 asercji po Fazie 3).
- **Test referencyjny**: `supabase/tests/database/rls_isolation.test.sql`.
- **Uruchomienie lokalnie**: `npm run test:db` (wymaga `npx supabase start`).
- **Kiedy tutaj, a kiedy wyżej**: niezmiennik, który baza egzekwuje sama
  (polityka, grant, CHECK, trigger), testuj tutaj. Zachowanie, które zależy od
  tłumaczenia błędu bazy na odpowiedź HTTP, testuj na warstwie API — patrz §6.3.
- **Dług `U0003` zamknięty w Fazie 3 (2026-09-30).** Odmowa pustej partii była
  rzucana w czterech gałęziach i nie miała żadnej asercji. Teraz:
  `day_plan_write.test.sql` — `'[]'`, `null` i nie-tablica jako `authenticated`
  na dniu już zaplanowanym, „licznik nie drgnął, stara partia nietknięta", oraz
  kolejność: `U0003`, nie `U0002` (z `p_require_absent`) i nie `U0001` (na dniu
  zatwierdzonym); `week_plan_write.test.sql` — pusty zestaw dni (trzy kształty),
  brakująca i zła `plan_date`, pusta partia dnia **po** dniu zapisanym wcześniej
  w tej samej tablicy (ten dzień wycofany). Każda gałąź zobaczona na czerwono
  przez usunięcie jej bloku; kolejność — przez przeniesienie bloku za
  `for update`.
- **Cudze asercje w tym katalogu, świadomie**: `activities_ordinal_bounds`
  (partia 21 pozycji wywraca cały zapis, nie ucina się do 20) oraz
  `day_plans_prompt_length` (hasło 2001 znaków) dostały asercje w **Fazie 2**, bo
  ryzyko #6 żąda dowodu sufitu **poniżej aplikacji** — obie przejechały rytuał
  mutacji przed commitem. Przekroczenie granicy kończy się na tych dwóch
  ograniczeniach; `U0003` został u swojego właściciela, Fazy 3.
- **Rytuał mutacji bez `db reset`**: psucie funkcji robi się przez
  `create or replace` z tekstem z `pg_get_functiondef`, a przywraca dokładnie
  tym samym tekstem — lokalne dane deweloperskie zostają. Plik testu da się
  uruchomić poza `supabase test db` przez `psql`, jeśli w jego transakcji
  najpierw padnie `create extension if not exists pgtap`.

### 6.5 Dodanie przypadku do bramki bezpieczeństwa treści

- **Lokalizacja bramki**: `src/lib/services/content-safety.gate.test.ts` — macierz
  żywych wywołań (każdy dopuszczony model × każde hasło z fixture'u × każdy
  tryb produkcyjny: `day-weekday` z `generate.ts`, `day-themed` z
  `week/day.ts`, `week` z `week/outline.ts` i `activity` z `refine.ts`, ten
  ostatni na przypadkach `REFINE_GATE_CASES` zamiast haseł). Baseline `day` bez
  kontekstu odpadł 2026-10-01, bo żadna trasa go nie wysyła. Kalibracja
  sędziego mieszka w tym samym pliku, przed macierzą (do 2026-10-03 osobno).
  To warstwa bramki (`*.gate.test.ts`), poza `npm test`, uruchamiana przez
  `npm run test:gate` (wymaga `OPENROUTER_API_KEY`), bez żadnej flagi:
  mechanizm zawieszenia z 2026-09-19 usunięto 2026-10-03. Kalibracja to
  pierwsze testy pliku macierzy, a macierz nie rusza, gdy któraś oblała. Sama
  kalibracja: `npm run test:gate -- -t calibration`.
- **Sędzia i koszt** (od 2026-10-03): dwustopniowy. Haiku 4.5 ocenia każde
  wyjście, które przeszło warstwę deterministyczną. Tylko jego werdykt
  „niebezpieczne” idzie do Sonneta 5.5, którego werdykt jest ostateczny.
  Rubryka jest cache'owana (`cache_control`). Raport podaje osobno koszt
  generowania i sędziego. Pełna macierz to około 0,40 USD
  (`content-safety-gate-resume/gate-runs.md`).
- **Bramka w CI**: job `content-safety-gate` w `ci.yml` uruchamia
  `npm run test:gate` na PR-ze, który zmienia którąkolwiek ścieżkę z filtru:
  prompty i schematy (`src/lib/services/prompts/*.{pl.md,schema.json}`),
  `allowed-models.ts`, `src/lib/services/content-safety*` (sędzia, rubryka
  przez prompty, raport, pliki bramki), fixture'y
  `src/lib/services/__fixtures__/content-safety.ts`, `src/lib/services/gate-*`
  (polityka ponowień, zakres trybów), generator wywołań i jego kategorie błędów
  (`activity-generator.ts`, `generation-error.ts`), liczby sprawdzane przez
  sędziego (`src/lib/day-plan-limits.ts`) i `vitest.gate.config.ts`. To samo
  wyrażenie stoi w `gate-scope.ts` jako `FULL_MATRIX`, a `gate-scope.test.ts`
  pada, gdy obie kopie się rozjadą. Raport trafia do step summary joba. Job jest doradczy (brak branch protection), bez crona.
  Zakres trybów zależy od zmienionych plików (`src/lib/services/gate-scope.ts`):
  - `day-plan` → `day-weekday`, `day-themed`;
  - `week-outline` → `week`, `day-themed`;
  - `refine-activity` → `activity`;
  - każdy inny plik z filtru → pełna macierz.

  Każdy dopuszczony model jest objęty zawsze, a raport mówi wprost, czy
  przebieg był pełną macierzą. Lokalnie, bez `GATE_CHANGED_FILES`, idzie
  pełna macierz.
- **Dziennik przebiegów**: każdy przebieg na żywo w ramach zmiany, także
  czerwony, dostaje wpis w `context/changes/<change-id>/gate-runs.md`: data,
  sędzia, macierz, koszt generowania z raportu, findingi z cytatami, a przy
  poprawce promptu plik i jednozdaniowy opis zmiany. Wzór:
  `content-safety-gate-resume/gate-runs.md`.
- **Zbiór haseł kontrolnych**: `src/lib/services/__fixtures__/content-safety.ts`,
  eksporty `DANGEROUS_KEYWORDS` (wzięte wprost z sekcji przekierowania w
  `day-plan.pl.md`/`week-outline.pl.md`) i `CONTROL_KEYWORDS` (pięć haseł
  odziedziczonych z `scripts/compare-models.sh`, w tym „Andrzejki"). Dopisanie
  nowego hasła to dopisanie stringa do jednej z tych list — jawnie oznaczonych
  w komentarzu jako **próba, nie dowód**.
- **Dopisanie modelu do zakresu bramki**: dopisz identyfikator do
  `ALLOWED_MODELS` w `src/lib/services/allowed-models.ts` — bramka iteruje tę
  listę bez zmian w sobie. Kolejność wymagana przed merge'em: (1) commit do
  `allowed-models.ts`, (2) zielony przebieg `npm run test:gate` obejmujący nowy
  model, (3) deploy. Podmiana `OPENROUTER_MODEL` w panelu Cloudflare na model
  spoza tej listy jest od Fazy 1 błędem konfiguracji, nie cichym wejściem w
  produkcję bez przebiegu bramki.
- **Rubryka oceny**: `src/lib/services/prompts/content-safety-rubric.pl.md` —
  jeden plik, ładowany `?raw` przez `content-safety-judge.ts`, dokładnie jak
  prompty produkcyjne. Zmiana kryterium oceny to edycja tego pliku; automatycznie
  wchodzi w zakres filtru ścieżek CI (`content-safety-gate` w `ci.yml` obserwuje
  `src/lib/services/content-safety*`).
- **Fixture'y kalibracyjne sędziego**: `src/lib/services/__fixtures__/content-safety.ts`,
  eksport `CONTENT_SAFETY_FIXTURES` — siedem znanych wyjść o znanych werdyktach
  (w tym prawdziwe wyjście DeepSeeka z „Laniem wosku", kontrola negatywna na
  polskiej fleksji i od 2026-10-01 dwa tygodnie `kind: "week"`, bez których
  kalibracja była ślepa na tryb `week`). Dopisanie nowego przypadku kalibracyjnego to dopisanie
  wpisu tutaj; kalibracja w `content-safety.gate.test.ts` go automatycznie obejmuje.
- **Dlaczego warstwa jest osobna od `npm test`**: zmierzone w Fazie 3 —
  `test.projects` zdefiniowany inline w `vitest.config.ts` nie dziedziczy
  pluginów Astro z `getViteConfig`, więc plik bramki wywraca się na
  `Error: Cannot find package 'astro:env/server'`. Osobny plik konfiguracyjny
  (`vitest.gate.config.ts`), wołający `getViteConfig` po swojemu, działa.
  `vitest.config.ts` dostał też `exclude: [...configDefaults.exclude,
  "src/**/*.gate.test.ts"]`, bo bez niego plik bramki wpadał do domyślnego
  zestawu i uruchamiał się w CI bez klucza.
- **Współbieżność między plikami bramki**: `vitest.gate.config.ts` ustawia
  `fileParallelism: false` — zmierzone w Fazie 4: Vitest domyślnie uruchamia
  pliki testowe równolegle, więc kalibracja sędziego i macierz żywych wywołań
  ściągały jednocześnie ten sam limit rezerwacji kredytu OpenRouter
  (`402 in_flight_budget_exhausted`), mimo dodatniego salda konta. Współbieżność
  *wewnątrz* macierzy (`GATE_CONCURRENCY` w `content-safety.gate.test.ts`)
  została osobno dobrana konserwatywnie z tego samego powodu — patrz §6.7.

### 6.6 Dodanie testu e2e (Playwright)

- **Lokalizacja**: `tests/e2e/<obszar>.spec.ts` — **jeden test na plik**. To
  jedyny katalog testów poza `src/`; ko-lokacja z §6.1 tu nie działa, bo test
  e2e nie należy do żadnego modułu, tylko do przepływu przez kilka z nich.
- **Reguły**: `tests/e2e/E2E-RULES.md` — blok reguł, pięć antywzorców i granice
  „co prawdziwe, co omijane". Czytaj przed pisaniem, także (zwłaszcza) generując.
- **Test referencyjny**: `tests/e2e/seed.spec.ts`. Jest jednocześnie **wzorcem
  dla generowania**: to, co pokazuje, agent odtworzy. Gdyby wjechał tam
  `waitForTimeout`, odziedziczyłby go każdy następny test.
- **Uruchomienie lokalnie**: `npm run test:e2e` (`npm run test:e2e:ui` do
  debugowania). Wymaga `npx supabase start` i `.env.e2e` (wzorzec:
  `.env.e2e.example`). Serwer dev podnosi się sam przez `webServer`.
- **Kiedy tutaj, a kiedy niżej**: dopiero gdy ryzyko przecina kilka granic naraz
  (sesja → routing → API → RLS) albo istnieje **wyłącznie** w przeglądarce.
  `window.confirm` z ryzyka #7 to drugi przypadek — na poziomie §6.2 i §6.4 ten
  dialog po prostu nie istnieje. Wszystko, co udowodni funkcja czysta albo trasa
  wołana bez HTTP, należy do §6.1/§6.2; e2e jest tu najdroższą warstwą i ma
  zostać mała.
- **Tożsamość**: `storageState` z projektu `setup`, nigdy logowanie przez
  formularz w teście. Dwa konta (`TEACHER_A`, `TEACHER_B`), bo ryzyko #4 jest
  strukturalnie niewidoczne przy jednym — test z jednym użytkownikiem nie ma
  czym pokazać wycieku.
- **Dane**: zasiewane prosto do bazy kluczem serwisowym (`seedDayPlan`), nigdy
  przez klikanie „Generuj". Wywołanie LLM nie należy do żadnego z tych ryzyk, a
  kosztuje pieniądze i 10–30 s niedeterminizmu; idzie z serwera, więc
  `page.route()` i tak by go nie przechwycił. **Klucz serwisowy omija RLS, więc
  nie wolno przez niego asertować** — czytałby dokładnie ten mechanizm, którego
  test pilnuje.
- **Unikalność i sprzątanie**: `uniquePlanDate()` + `uniqueStamp()` i `afterEach`
  kasujący po `id`. Baza wymusza `unique (user_id, plan_date)`, a konta są stałe,
  więc bez tego drugi przebieg pod rząd pada. Sprzątanie po dacie, a nie po `id`,
  skasowałoby wiersz drugiego konta — czyli ten, o który chodzi w ryzyku #4.
- **Hydracja jest obowiązkowa przed pierwszym kliknięciem**: `waitForIslands(page)`
  z `tests/e2e/support/hydration.ts`. Powód i jedyne dopuszczone odstępstwo od
  zakazu selektorów CSS — patrz §6.7.
- **Asercja negatywna musi być rozróżniająca**, tak samo jak w §6.1: zepsuj
  zachowanie, które ryzyko opisuje, i zobacz test na czerwono, zanim go
  zacommitujesz. Trzy psucia użyte przy tych testach są wypisane w §6.7 — każde
  jest tanie i odwracalne, więc nie ma powodu ich nie powtórzyć.

### 6.7 Notatki z faz rolloutu

(Wypełniane po każdej fazie — 2–3 linie o tym, czego faza nauczyła.)

**Faza 1 — runner + granica model→kontrakt→zapis (2026-08-30).** Adapter
Cloudflare wywraca Vitest **na starcie, nie na teście**: `@cloudflare/vite-plugin`
waliduje wstrzyknięty przez Vitest `resolve.external` w `configResolved` i
przerywa cały przebieg. Jedyna działająca ścieżka to `getViteConfig(cfg, {
configFile: "./astro.config.test.mjs" })`, gdzie plik testowy **importuje**
prawdziwą konfigurację i zeruje adapter — kopiowanie rozjechałoby schemat `env`,
który jest tym, co daje testom `astro:env/server`.

Przesłanka fazy była w połowie nieaktualna. Serwerowa ścieżka generowania
**nie miała** dziury „cichego pustego planu" — zod wypada bezwarunkowo przed
zapisem — więc testy na niej są regresją na zachowaniu, które działa. Ryzyko #2
mieszkało piętro wyżej i niżej naraz: w strażnikach wysp (`[].every()` to `true`)
i w pisarzu bazy (`jsonb_array_elements('[]')` wstawia zero wierszy i nie rzuca).
Ryzyko #5 wypadło gorzej, niż zakładano: `!choice` dzieliło gałąź z
`finish_reason: "error"`, więc niepoprawne body dostawcy kupowało **płatne
ponowienie** i pokazywało 503 „przeciążona". Wniosek na przyszłe fazy: research
per fazę bywa ważniejszy od przesłanki, z którą fazę otwarto.

**Faza 2 — powtarzalna bramka bezpieczeństwa treści (2026-08-31, w toku).**
Przesłanka, z którą fazę otwarto, była w jednej trzeciej odwrotna do zapisanej:
nie było czego „wyjmować" ze `scripts/compare-models.sh` — kontrola nie
istniała nigdy, w żadnej formie. Zbiór dopuszczonych modeli, rubryka i sędzia
musiały powstać od zera, zanim „każdy dopuszczony model" cokolwiek znaczyło.

Ostatnia faza (żywa macierz + CI) znalazła dwie realne usterki produkcyjne,
niezwiązane z treścią, które sama bramka odsłoniła dopiero pod obciążeniem:
(1) `google/gemini-3.7-flash` był na liście dopuszczonych modeli, ale
`buildRequestBody` bezwarunkowo wysyłał `reasoning: { enabled: false }`, a ten
model twardo odrzuca to polem — każde wywołanie produkcyjne kończyłoby się
`400`, nigdy niebezpieczną treścią. `scripts/compare-models.sh` miał na to
obejście od dawna (ponów bez flagi); produkcja go nie miała. (2) sędzia LLM nie
miał `max_tokens` — pojedyncze wywołanie nigdy tego nie ujawniało, ale pod
współbieżnością macierzy OpenRouter odpowiadał `402
"in_flight_budget_exhausted"`, bo rezerwacja kredytu na wywołanie w locie była
nieograniczona. Do tego Vitest domyślnie uruchamia pliki testowe równolegle,
więc plik kalibracyjny sędziego i plik macierzy ściągały ten sam limit
rezerwacji jednocześnie, niewidocznie dla żadnego z osobna — naprawione przez
`fileParallelism: false` w `vitest.gate.config.ts`. Wniosek: bramka, która woła
prawdziwego dostawcę współbieżnie, testuje też mechanikę rozliczeń dostawcy, nie
tylko treść — i pierwszy przebieg pod obciążeniem jest jedynym miejscem, gdzie
to widać.

**Otwarte na koniec fazy**: pełny przebieg macierzy (`npm run test:gate`) nie
został jeszcze potwierdzony zielony na koncie z pełnym saldem — konto użyte do
rozwoju wyczerpało się w trakcie debugowania współbieżności (od $5 do $0.60).
Kod, lint, typy, build i domyślny zestaw testów są zweryfikowane; zielony
przebieg pełnej macierzy, kontrola negatywna (`negative-control.md`) i sekret
`OPENROUTER_API_KEY` w CI zostają jako otwarte kroki przed zamknięciem fazy.

**Dwa kolejne przebiegi po doładowaniu (2026-09-02)**, po naprawie trzech
usterek wyżej, znalazły dwie **nowe** realne usterki — dopiero pod prawdziwym
obciążeniem, dokładnie jak wcześniejsze trzy:

(1) **Fałszywe trafienie na cytowanym słowie-znaczniku.** Luna × „wojna" ×
`day-weekday` przekierowała hasło na zajęcia uczące dzieci mówić „przepraszam"
i dzielić się — samo słowo w cudzysłowie, jako treść pedagogiczna, nie jako
odmowa modelu. `REFUSAL_MARKERS`/`ENGLISH_MARKERS` dopasowywały słowo bez
względu na to, czy jest cytowane czy wypowiedziane przez model. Naprawione
funkcją `stripQuoted()` w `content-safety-judge.ts`, która usuwa fragmenty w
cudzysłowie przed dopasowaniem znaczników — zweryfikowane bezpłatnie
(jednostkowo w `content-safety-judge.test.ts`) plus jednym żywym powtórzeniem
dokładnie tego przypadku.

(2) **Brak retry na `402` sędziego.** `categorizeStatus` mapuje 402 na
kategorię `config` (słusznie — dla prawdziwego braku środków retry marnowałby
czas nauczyciela), więc istniejący retry-tylko-`transient` w `judgeSafely`
nigdy nie ponawiał kolizji rezerwacji w locie, która jest z natury przejściowa
w kontekście współbieżnej macierzy. Wydzielone do `gate-retry.ts`
(`retryGateCall`) z jawnym wyjątkiem na status 402 (i tylko 402 — 401/403/404
zostają nieponawiane); zweryfikowane bezpłatnie pięcioma testami jednostkowymi
z mockowanym `fetch`, nie żywym wywołaniem.

Drugi z tych dwóch przebiegów **sam się nie domknął zielono** — kaskada `402`
objęła tym razem też wywołania generujące (nie tylko sędziego), na wielu
kombinacjach naraz. Sprawdzone bezpośrednio przez `GET
https://openrouter.ai/api/v1/credits`: konto miało `$10` doładowania i `$8.73`
łącznego zużycia, czyli ~$1,28 zostało. Sufit rezerwacji w locie skaluje się z
saldem (`test-plan.md` już to odnotowywało wcześniej) — przy tak niskim saldzie
nawet `GATE_CONCURRENCY = 3` zderza się regularnie. To ograniczenie salda, nie
kod: **pełny zielony przebieg czeka na kolejne doładowanie**, zaakceptowane
świadomie zamiast dalszego, ślepego ponawiania na resztce środków.

**Domknięcie po trzecim doładowaniu (2026-09-02, saldo ~$6,27).** Zamiast od
razu wracać do `GATE_CONCURRENCY = 3`, przebieg zamówiony jako **w pełni
sekwencyjny** (`GATE_CONCURRENCY` tymczasowo `1`, timeout testu tymczasowo
podwojony do 20 min) — zero współbieżnych wywołań własnych, więc zero ryzyka
kolizji rezerwacji ze swojej strony, kosztem czasu zamiast pieniędzy (~726 s,
~12 min zamiast ~4–4.5 min przy współbieżności 3). Wynik: 2 pliki, 6/6 testów,
zero naruszeń, zero `402`. Oba tymczasowe ustawienia przywrócone do wartości z
Fazy 4 (`3` / 10 min) natychmiast po zielonym wyniku — wolniejszy tryb był
środkiem ostrożności dla konkretnego niskiego salda tej sesji, nie trwałą
zmianą strojenia dla konta CI. Faza 2 jest funkcjonalnie zamknięta: pozostają
`negative-control.md` (4.12) i sekret `OPENROUTER_API_KEY` w CI (4.13) jako
kroki poza samym kodem.

**Kontrola negatywna (4.12) i decyzja o 4.17 (2026-09-02).** Wycięcie sekcji
„Hasło nieodpowiednie dla wieku" i przebieg na dwóch pojedynczych hasłach
(„wojna", „szkielet i śmierć") **nie wyprodukowało czerwieni treściowej** —
oba dopuszczone modele trzymały się bezpiecznych tematów mimo braku
jawnej instrukcji przekierowania. Pełny raport i interpretacja:
`negative-control.md`. Wniosek zapisany tam jako otwarty follow-up, nie jako
blokada: kalibracja sędziego z Fazy 3 (prawdziwe wyjście w kształcie odmowy)
już dowodzi, że mechanizm wykrywa to, do czego został zbudowany — tego
konkretnego rytuału na złożonej całości po prostu nie udało się wywołać na
czerwono w granicach rozsądnego kosztu. Pozycja 4.17 (trzy kolejne zielone
przebiegi) **świadomie pominięta** z tego samego powodu — koszt ~3× pełnego
przebiegu przy koncie, które właściciel projektu określił jako ostatnie
możliwe doładowanie na ten moment.

**Poza rolloutem — pierwsza warstwa e2e (2026-09-03).** Nie faza; samodzielny
przebieg `/10x-e2e` na ryzykach #4 i #7 (kontekst i granice: §3, wzorzec: §6.6).
Cztery rzeczy, których nie dało się przewidzieć z dokumentów:

(1) **Wyścig z hydracją wysp jest niewidoczny przy jednym teście naraz.**
`plan.astro` renderuje `DayPlanEditor` serwerowo (`client:load`), więc „Usuń plan
dnia" jest w DOM-ie — widoczny i włączony — zanim wyspa dostanie handlery.
Playwright uznaje taki przycisk za gotowy, klika i **nie dzieje się nic**: plan
nietknięty, zero błędu na ekranie. Test przechodził w izolacji i padał w pełnym
przebiegu, powtarzalnie, dopiero od czwartego pliku w zestawie. Naprawione
`waitForIslands()` na `astro-island[ssr]` — atrybucie, który runtime Astro
zdejmuje dokładnie po hydracji (zweryfikowane w `astro-island.prebuilt.js`
w zainstalowanym pakiecie, nie z pamięci). To jedyny selektor CSS w zestawie,
świadomie: `astro-island` to kontrakt frameworka, a hydracja z definicji nie
zmienia niczego w drzewie dostępności, więc nie ma czym jej zastąpić. Zamknięty
w jednym helperze, żeby nie stał się cichym pozwoleniem na `page.locator(".cls")`.

(2) **Asercja wizualna potrafi przegrać wyścig z nawigacją — i przez to
przepuścić usuniętą ochronę.** W teście odmowy kasowania celowe psucie
(`window.confirm` wołane, wynik ignorowany) **nie** zapaliło asercji „plan nadal
widoczny po przeładowaniu": `page.reload()` wyprzedził kasowanie po stronie
serwera. Złapał to dopiero nasłuch `page.on("request")` na `DELETE`. Wniosek na
przyszłe testy operacji destrukcyjnych: asertuj **brak żądania**, nie tylko to,
co widać na ekranie — ekran bywa o jedno okrążenie do tyłu.

(3) **`astro dev` nasłuchuje wyłącznie na `[::1]`.** `webServer` wycelowany w
`127.0.0.1:4321` kończy się timeoutem 120 s przy w pełni działającym serwerze.
`baseURL` musi być `localhost`.

(4) **`day_plans_accepted_after_created` wywraca zasiew zaakceptowanego planu.**
`created_at` bierze `now()` bazy, `accepted_at` przychodzi z zegara klienta —
przy zasiewie te dwa zegary rozjeżdżają się o ułamek sekundy w złą stronę.
Zasiew ustawia więc oba znaczniki z jednego odczytu.

Wszystkie trzy asercje niosące ryzyko zostały zobaczone na czerwono przez
psucie tego, czego pilnują: wyłączony RLS (#4 — zrzut pokazał konto B oglądające
hasło, propozycje i przyciski „Akceptuj"/„Usuń" konta A, czyli wyciek obejmujący
też zapis), zakres kasowania rozszerzony na `.gte` (#7 — zniknął dzień sąsiedni)
i zignorowany wynik `window.confirm` (#7). Każde cofnięte przed commitem.

**Faza 3 — ochrona zapisu i własności (2026-09-30).** Przesłanka była trafna co
do luk, ale opisywała stan sprzed miesiąca w trzech miejscach: zgoda tygodnia
to od przeglądu `S-10` data **i** `accepted_at`, nie sama data; `U0003` był
niezapięty w czterech gałęziach, nie w jednej; a „tani wzorzec na atrapie dwóch
kont" z §6.3 nie mógł niczego dowieść — trasy nie filtrują po `user_id`, więc
atrapa zwraca to, co jej kazano. Stąd warstwa z prawdziwym klientem.

Rytuał mutacji zmierzył trzy rzeczy, których nie dało się przewidzieć z kodu:

(1) **`DELETE … .maybeSingle()` nie wycofuje zmiany.** Przy poluzowanych
politykach select + delete kasowanie po dacie trafia w wiersze obu kont;
PostgREST (CLI 2.98.2) odpowiada 406 `PGRST116` i oba wiersze **zostają
skasowane**. Trasa odpowiada wtedy 404 „Ten dzień nie ma planu do usunięcia."
Jedyną linią jest RLS — ogon z właścicielem w `next-actions.md`.

(2) **Otwarta sama polityka update `activities` nie zapala testu edycji** —
słusznie: odczyt przed zapisem idzie przez politykę select i odmawia pierwszy.
Otwarte select + update dają za to **500 „Skontaktuj się z administratorem"**
zamiast 404 (`with check` odrzuca zapis kodem `42501` → `config`) — dokładnie
ta regresja 404→500, której atrapa nie ma czym pokazać.

(3) **Psucie sąsiada zapala tylko asercję stanu, nie partii.** Mutacja
„zeruj `accepted_at` sąsiadom" łapie asercja na haśle/liczniku/zatwierdzeniu;
asercja na tytułach partii pilnuje innej linii (skasowane propozycje sąsiada).
Komentarze w plikach mówią, co które psucie faktycznie zapaliło — nie to, co
miało zapalić.

Job `db` w CI: **2 min 22 s** przy pierwszym zielonym przebiegu (PR #39,
2026-09-30), z czego większość to pobranie obrazów — cache Dockera nie ma, więc
tyle kosztuje każdy przebieg. Stos startuje z `-x` dziesięciu kontenerów
(zostają Postgres, GoTrue, PostgREST, Kong); brak `supabase/seed.sql` kończy się
ostrzeżeniem, nie błędem. Trzy niespodzianki przy wpinaniu:

- **CI testował inny Postgres niż produkcja.** CLI wybiera obraz z
  `supabase/.temp/postgres-version`, który pisze `supabase link` i który jest
  gitignorowany. Bez niego CLI 2.98.2 bierze swój domyślny `17.6.1.106` — i na
  nim **serwer padł** przy wywołaniu anon w `day_plan_write.test.sql`, które
  lokalnie (`17.6.1.127`, wersja produkcji) przechodzi. Job przypina wersję
  produkcji przed `supabase start`; przy aktualizacji projektu trzeba ją podbić.
- **`public.ecr.aws` limituje pobrania** (`toomanyrequests: Data limit exceeded`)
  na współdzielonym IP runnera. To nie jest błąd kodu — ponowienie joba
  przechodzi. Powtórzyło się jeszcze tego samego dnia (run 36768531052), więc
  cache obrazów jest ogonem z właścicielem w `next-actions.md`.
- `supabase status -o env` wypisuje `KEY="value"`, a `$GITHUB_ENV` zachowałby
  cudzysłowy w wartości — krok eksportu je zdejmuje.

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
  _Rozpatrzone 2026-09 przy `S-07` (`month-day-preview`): stan podglądu dnia jest
  widoczny w drzewie dostępności (`role="tooltip"` + `aria-describedby`) i asertowalny
  bez snapshotu — ryzyko #10 — więc wykluczenie zostaje._
  _Rozpatrzone 2026-09 przy `S-13` (`week-print`): wydruk tygodnia nie wprowadza
  snapshotów ani rasteryzacji PDF. Treść wydruku (etykieta szkicu, „Brak planu na ten
  dzień", kolejność dni) jest asertowana na czystym modelu w `src/lib/week-pdf/` —
  tekst osadzony własnym fontem jest w PDF-ie zakodowany identyfikatorami glifów i nie
  da się go grepować — a struktura pliku (liczba i orientacja stron, nazwa) w e2e pod
  ryzykiem #11. Wygląd kartki ocenia człowiek na papierze._
- **Jakość kreatywna propozycji** — czy „Dinozaury" dały *dobrą* aktywność, ocenia
  człowiek; PRD mierzy to metryką akceptacji ≥ 75%, nie bramką CI. To **nie
  obejmuje** bezpieczeństwa treści, które jest ryzykiem #1 i ma własną fazę.
  (Źródło: PRD §Success Criteria + wywiad Q5.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-09-30 (Faza 3: §2 #3/#4, §3, §4, §5)
- Stack versions last verified: 2026-08-29 (wiersz e2e w §4: 2026-09-03; wiersze database i
  integration (trasa + prawdziwy klient): 2026-09-30, Supabase CLI 2.98.2)
- AI-native tool references last verified: 2026-08-29

Refresh (`/10x-test-plan --refresh`), gdy:

- z roadmapy lub archiwum wyłoni się nowe ryzyko z pierwszej trójki,
- data `checked:` rekomendowanego narzędzia jest starsza niż trzy miesiące,
- zmieni się stack projektu (nowy framework, nowy runner testów),
- §7 przestanie odpowiadać temu, w co zespół faktycznie wierzy.
