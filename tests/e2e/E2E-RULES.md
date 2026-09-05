# Reguły testów E2E

Czytaj przed napisaniem albo wygenerowaniem jakiegokolwiek testu w tym katalogu.
Wzorzec, na którym modelujesz każdy nowy test: [`seed.spec.ts`](seed.spec.ts).

## Blok reguł

- Lokatory: `getByRole`, `getByLabel`, `getByText` jako domyślne.
  `getByTestId` dopiero, gdy atrybuty dostępności są niejednoznaczne.
- Nigdy selektory CSS, XPath ani struktura DOM.
- Każdy test musi dać się uruchomić samodzielnie — żadnego stanu dzielonego
  między testami, żadnej kolejności.
- Nigdy `page.waitForTimeout()`. Czekaj na warunek: `toBeVisible()`,
  `waitForURL()`, `waitForResponse()`.
- Asertuj wynik biznesowy, nie szczegół implementacyjny.
- Unikalne dane testowe (`uniquePlanDate()`, `uniqueStamp()` z
  `support/test-data.ts`) — inaczej równoległy przebieg i drugi przebieg pod
  rząd zderzą się o `unique (user_id, plan_date)`.
- Sprzątaj po sobie w `afterEach`, po `id` zasianych planów.
- Uwierzytelnianie przez `storageState`, nigdy przez formularz logowania w
  pojedynczym teście. Jedyny wyjątek: `auth.setup.ts`.

## Reguły nadrzędne (uzasadnienie)

- **Nie generuj testów E2E z powietrza.** Wejściem jest ryzyko z
  `context/foundation/test-plan.md`. Ryzyko należy do E2E, gdy przecina kilka
  granic systemu (sesja, routing, API, baza) albo istnieje wyłącznie w
  wyrenderowanym UI. Jeśli dowiedzie go funkcja czysta albo test integracyjny —
  to tańsza warstwa i tam jest jego miejsce (`test-plan.md` §1 zasada 1).
- **Nazwa testu nazywa ryzyko**, z jego numerem: `ryzyko #4 — …`, nigdy
  `test 1`. Numer jest jedynym łącznikiem między tym katalogiem a mapą ryzyk.
- **Asercja musi paść, gdy ryzyko się zmaterializuje.** Pytanie kontrolne do
  każdej asercji: _czy ta asercja padnie, jeśli ryzyko naprawdę wystąpi?_ Jeśli
  nie — jest dekoracją. Sprawdza się to celowym psuciem kodu produkcyjnego,
  nie założeniem (`test-plan.md` §6.1: „Kryterium weryfikacji musi móc nie
  przejść").
- **E2E ≠ zero mockowania.** Granice wewnętrzne — sesja, routing, RLS — zostają
  **prawdziwe**, bo to w nich mieszka ryzyko integracyjne. Mockuj wyłącznie
  drogich, niedeterministycznych dostawców zewnętrznych.

## Co w tym projekcie zostaje prawdziwe, a co omijamy

| Granica                      | W teście    | Dlaczego                                                                      |
| ---------------------------- | ----------- | ----------------------------------------------------------------------------- |
| Sesja i ciasteczka           | prawdziwa   | ryzyko #4 mieszka dokładnie tu                                                |
| Routing i middleware         | prawdziwe   | ochrona `/plan` to część tego samego ryzyka                                   |
| API `/api/day-plan/*`        | prawdziwe   | `readDayPlan` filtruje tylko po dacie — własność stoi na RLS                  |
| RLS w Postgresie             | prawdziwe   | to **jedyna** warstwa izolacji kont                                           |
| Generowanie przez OpenRouter | **omijane** | nie należy do ryzyk #4 ani #7, a kosztuje pieniądze i 10–30 s niedeterminizmu |

Plan dnia zasiewamy więc prosto do bazy (`seedDayPlan` w
`support/supabase-admin.ts`), a nie klikając „Generuj". Wywołanie modelu idzie z
serwera, więc `page.route()` i tak by go nie przechwycił.

**Klucz serwisowy służy wyłącznie do zasiewu i sprzątania — nigdy do asercji.**
Omija RLS, czyli dokładnie ten mechanizm, którego te testy pilnują; asercja
czytająca tą drogą dowodziłaby istnienia wiersza, a nie tego, że drugie konto go
nie widzi.

## Pięć antywzorców do wyłapania w przeglądzie

Pełny opis: `.claude/skills/10x-e2e/references/e2e-anti-patterns.md`.

1. **Halucynowana asercja** — sprawdza coś, czego ryzyko nie dotyczy.
2. **Kruchy lokator** — CSS, XPath, struktura DOM.
3. **Stan dzielony** — test B zakłada, że test A coś zostawił.
4. **Czekanie na czas** — `waitForTimeout` zamiast na stan.
5. **Brak sprzątania** — drugi przebieg pod rząd pada.

Znaleziony antywzorzec zgłaszaj **po nazwie**, z oczekiwanym wzorcem — nie
„popraw ten test".

## Hydracja wysp — czekaj przed pierwszym kliknięciem

`plan.astro` renderuje `DayPlanEditor` serwerowo (`client:load`), więc przyciski
istnieją w DOM-ie **zanim** dojedzie JavaScript wyspy. Playwright uzna taki
przycisk za gotowy (widoczny, włączony), kliknie — i nie stanie się nic.

Przed **każdym pierwszym kliknięciem** na stronie wywołaj
`waitForIslands(page)` z [`support/hydration.ts`](support/hydration.ts). Testy
wyłącznie czytające (`seed.spec.ts`, `day-plan-ownership.spec.ts`) tego nie
potrzebują — treść jest w SSR.

To jedyne miejsce w zestawie, gdzie wolno użyć selektora CSS, i jest zamknięte w
tym helperze: `astro-island[ssr]` to kontrakt frameworka (Astro zdejmuje atrybut
`ssr` po hydracji), a nie struktura naszego widoku. Nie replikuj tego wzorca w
plikach testów.

## Dialogi przeglądarki

`window.confirm` jest w tej aplikacji jedyną ochroną przed nieodwracalnym
kasowaniem (ryzyko #7). Playwright **domyślnie odrzuca** każdy dialog, więc test
kasowania, który go nie obsłuży, przejdzie nie kasując niczego — zielony i
bezwartościowy. Rejestruj `page.on("dialog", …)` **przed** kliknięciem i
asertuj też ścieżkę odmowy (`dismiss` → plan nadal jest).
