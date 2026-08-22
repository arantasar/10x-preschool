---
date: 2026-08-22T13:42:34+02:00
researcher: Janusz Guzowski
git_commit: 4d1a2fbea54a9ba1c016e493621194dac1a9f1a6
branch: master
repository: 10x-preschool
topic: "Czy mamy wszystko, żeby rozpocząć pracę nad S-01 (first-day-generation)?"
tags: [research, codebase, s-01, first-day-generation, openrouter, readiness]
status: complete
last_updated: 2026-08-22
last_updated_by: Janusz Guzowski
---

# Research: gotowość do startu S-01 (`first-day-generation`)

**Data**: 2026-08-22 13:42 +02:00
**Researcher**: Janusz Guzowski
**Git commit**: `4d1a2fb` (nie wypchnięty — `master` ahead 1)
**Branch**: master
**Repozytorium**: 10x-preschool

## Research Question

Czy mamy wszystko, żeby rozpocząć pracę nad S-01 z `context/foundation/roadmap.md`,
przy uwzględnieniu `context/changes/first-day-generation/llm-model-research.md`?

## Summary

**Do `/10x-plan` — tak, materiał jest kompletny.** Dostawca rozstrzygnięty, API opisane
w referencji wykonawczej, baseline kodu potwierdzony w repo, fałszywe ograniczenie platformy
wycofane. Nie ma niewiadomej, która blokowałaby napisanie planu.

**Do pisania kodu — nie, brakuje trzech rzeczy**, i żadna z nich nie jest zadaniem programistycznym:

1. **Klucz OpenRoutera nie istnieje w projekcie.** [.dev.vars](.dev.vars) i [.env](.env) mają
   wyłącznie `SUPABASE_URL` / `SUPABASE_KEY`. Bez konta z kredytami nie da się ani wykonać testu
   porównawczego z researchu, ani uruchomić pierwszej trasy. To akcja na koncie, nie w repo.
2. **Prompt systemowy nie istnieje.** Roadmapa uczyniła go **jedynym** guardrailem bezpieczeństwa
   (§ S-01 Decyzje), a w całym repo i `context/` nie ma jego treści — w
   [openrouter-api.md](context/foundation/openrouter-api.md) występuje jako placeholder
   `SYSTEM_PROMPT`. To jest artefakt najwyższej wagi w całym S-01 i nikt go nie posiada.
3. **Model nie jest wybrany, ale to nie jest blokada startu.** Research kończy się otwartą
   decyzją i testem 3 modeli × 5 haseł. Ten test **wymaga promptu**, więc nie jest krokiem *przed*
   pracą — jest jej pierwszą fazą. ID modelu idzie do zmiennej środowiskowej, więc implementacja
   może ruszyć z `google/gemini-3.7-flash` jako domyślnym i przełączyć się po teście bez deployu.

Poza tym: **jedna decyzja projektowa do podjęcia w planie** (czy S-01 zostaje efemeryczny, skoro
F-01 jest już wdrożone — patrz § Decyzja krytyczna), **pięć drobnych luk w repo** (m.in. `zod`
nie jest zadeklarowaną zależnością) i **cztery miejsca rozjazdu dokumentacji z rzeczywistością**.

---

## Detailed Findings

### 1. Co jest faktycznie gotowe (weryfikacja w kodzie, nie w dokumentach)

| Obszar          | Stan roadmapy (2026-06-27) | Stan faktyczny (2026-08-22)                                                                   |
| --------------- | -------------------------- | --------------------------------------------------------------------------------------------- |
| Auth            | present                    | ✅ potwierdzone — [src/lib/supabase.ts](src/lib/supabase.ts), [src/middleware.ts:4-19](src/middleware.ts#L4-L19) |
| Frontend        | present                    | ✅ Astro 6 + React 19 + Tailwind 4; wyspy React sprawdzone na formularzach auth                |
| **Data**        | **absent**                 | ❌ **nieaktualne** — F-01 wdrożone: 4 migracje, 16 polityk RLS, suite pgTAP 23/23              |
| Backend / API   | partial (tylko auth)       | ✅ nadal prawda — brak tras domenowych                                                          |
| Deploy / infra  | present                    | ✅ `wrangler.jsonc` z `nodejs_compat` + `disable_nodejs_process_v2`, observability włączone     |
| Observability   | absent                     | ⚠️ brak biblioteki, ale `wrangler.jsonc` ma `"observability": { "enabled": true }` — na MVP wystarczy |

Do S-01 dochodzi jeszcze jedna rzecz, której roadmapa nie odnotowuje: **istnieje już typowany
kontrakt generowania**. [src/types.ts:67-75](src/types.ts#L67-L75) definiuje `ActivityDraft`
(`title` + `description`, bez `user_id` i `generation`) oraz `GenerateDayPlanCommand`
(`plan_date` + `prompt` + aktywności). To dokładnie kształt, który S-01 produkuje — niezależnie
od tego, czy go zapisze.

### 2. Twarde prerekwizyty przed pierwszą linią kodu

#### 2.1 Konto i klucz OpenRoutera

```
.dev.vars  → SUPABASE_URL, SUPABASE_KEY          (brak OPENROUTER_*)
.env       → SUPABASE_URL, SUPABASE_KEY          (brak OPENROUTER_*)
.env.example (2 linie) → SUPABASE_URL, SUPABASE_KEY
```

`OPENROUTER_API_KEY` to pierwszy sekret w projekcie poza Supabase. Checklist w
[openrouter-api.md § 10](context/foundation/openrouter-api.md) wymienia cztery miejsca:
`.env.example`, `.dev.vars`, `wrangler secret put`, sekrety CI. Do tego dochodzi deklaracja
w [astro.config.mjs:17-21](astro.config.mjs#L17-L21).

Kredyty też są prerekwizytem, nie szczegółem: błąd `402 — brak kredytów` jest w tabeli awarii
i „nie do naprawienia retry".

#### 2.2 Prompt systemowy — brakujący artefakt o najwyższej wadze

Roadmapa: *„Guardrail bezpieczeństwa treści — na poziomie promptu. Bez post-filtra w MVP.
(…) jakość promptu jest jedynym zabezpieczeniem guardrailu, który PRD nazywa nienegocjowalnym."*

PRD stawia przy tym twardy warunek: *„Żadna propozycja zajęć nie zawiera treści nieodpowiedniej
dla dzieci w wieku 3–6 lat. Naruszenie tego guardrail dyskredytuje aplikację niezależnie od stanu
pozostałych funkcji."*

W repo nie ma ani treści promptu, ani miejsca, w którym miałby żyć. `src/lib/services/` nie
istnieje (F-01 świadomie go nie utworzyło — patrz „Scope Discipline" w
[impl-review.md](context/changes/plan-persistence-baseline/reviews/impl-review.md)).

Prompt musi unieść trzy wymagania naraz: wiek 3–6 lat, język polski, format wyjścia.
[openrouter-api.md § 2](context/foundation/openrouter-api.md) dorzuca drugi nośnik tej samej
instrukcji — pola `description` w JSON Schema realnie sterują modelem — więc guardrail warto
zapisać w obu miejscach, nie tylko w prompcie.

#### 2.3 Test porównawczy — to pierwsza faza pracy, nie warunek wstępny

Research wymaga 3 modeli × 5 haseł (~15 wywołań, kilka centów) przed zamrożeniem wyboru.
Kryterium: ≥ 75% propozycji akceptowanych bez edycji + zero treści nieodpowiednich.

Dwie obserwacje, których research nie robi:

- **Test nie może wyprzedzić promptu** — porównuje się modele *przy tym samym prompcie*, więc
  kolejność jest wymuszona: prompt → skrypt → test → wybór modelu.
- **Nie ma gdzie go uruchomić.** [package.json](package.json) ma tylko `test:db` (pgTAP);
  brak runnera TS, [.github/workflows/ci.yml](.github/workflows/ci.yml) robi lint + build.
  Skrypt porównawczy jest jednorazowy — scratchpad albo `scripts/`, świadomie poza CI (testy to
  Moduł 3).
- **Kryterium „≥ 75% akceptowanych bez edycji" nie ma w S-01 mechanizmu pomiaru.** S-01 jest
  efemeryczny, „akceptacja" to FR-009 z S-02. W S-01 ta miara jest oceną ręczną na 5 hasłach,
  nie metryką produktu — warto to zapisać jawnie, żeby później nie udawać, że ją mierzymy.

### 3. Decyzja krytyczna: S-01 efemeryczny czy zapisujący?

Roadmapa zakłada efemeryczność: *„Parallel with: F-01 (gwiazda przewodnia wyświetla propozycje
efemerycznie, nie wymaga zapisu)"*. To założenie powstało, **gdy F-01 jeszcze nie istniało**.
Dziś schemat jest wdrożony, a [src/types.ts](src/types.ts) wprost zaprasza do zapisu.

Konsekwencje wyboru są asymetryczne:

- **Efemerycznie (zgodnie z roadmapą)** — trasa generowania nic nie zapisuje, regeneracja (FR-007)
  to ponowny POST bez stanu, wybrany dzień to zwykłe pole formularza. Zero długu, zero ryzyka
  RLS, S-02 dostaje czyste pole.
- **Z zapisem** — S-01 dziedziczy zobowiązanie, które roadmapa przypisała **S-02**
  (§ „Zobowiązania przeniesione z F-01"): protokół regeneracji w jednej transakcji plus trigger
  `BEFORE INSERT` pilnujący `new.generation = day_plans.current_generation`. Bez tego
  [selectCurrentGeneration](src/lib/day-plans.ts#L14) uczciwie zwróci pustą tablicę, a nauczyciel
  zobaczy pusty plan **bez błędu i bez wpisu w logu**. To nie jest hipoteza — to udokumentowany
  kształt awarii tego schematu.

**Rekomendacja: zostać przy efemeryczności** i zapisać to jako jawną pozycję „What we're NOT
doing" w planie. Zapis kosztuje migrację z triggerem i transakcję, a niczego nie dowodzi
w hipotezie, którą S-01 ma zweryfikować.

### 4. Luki wykonawcze w repozytorium (konkretne, sprawdzone)

#### 4.1 `zod` nie jest zadeklarowaną zależnością

CLAUDE.md nakazuje walidację wejścia zodem, szkic z
[openrouter-api.md § 11](context/foundation/openrouter-api.md) importuje `zod` — a
[package.json](package.json) go nie ma:

```
$ npm ls zod
├─┬ @astrojs/sitemap@3.7.2 → zod@4.4.3
├─┬ astro@6.3.1            → zod@4.4.3 deduped
└─┬ eslint-plugin-*        → zod@3.25.76 / 4.4.3
```

`import { z } from "zod"` **zadziała dziś przypadkiem** (hoisting `zod@4.4.3` z zależności
tranzytywnych Astro) i przestanie działać przy dowolnym bumpie, który go przestawi. Potrzeba
`npm i zod` — i świadomości, że to **zod v4**, nie v3.

Dodatkowo: w repo **nie ma ani jednego użycia zoda**. [src/pages/api/auth/signin.ts:5-7](src/pages/api/auth/signin.ts#L5-L7)
czyta `form.get("email") as string` bez walidacji. Konwencja z CLAUDE.md nie ma precedensu —
S-01 będzie pierwszy, więc ustanawia wzorzec dla reszty projektu.

#### 4.2 Trasa API w `PROTECTED_ROUTES` da przekierowanie, nie 401

[src/middleware.ts:18-21](src/middleware.ts#L18-L21) odpowiada na brak sesji `context.redirect("/auth/signin")`.
Dla strony to poprawne; dla trasy `POST /api/…` wołanej `fetch`-em z wyspy React to 302 z HTML-em
zamiast czytelnego 401 — front dostanie stronę logowania jako „odpowiedź generowania".
Checklist w openrouter-api.md mówi „trasa generowania dopisana do `PROTECTED_ROUTES`”; to jest
prawda dla **strony**, ale trasa API powinna dodatkowo (albo zamiast tego) sama sprawdzić
`context.locals.user` i zwrócić 401 JSON-em.

#### 4.3 `config-status.ts` nie wie o OpenRouterze

[src/lib/config-status.ts:11-21](src/lib/config-status.ts#L11-L21) to istniejący wzorzec
„czego brakuje w konfiguracji" — dziś zna tylko Supabase. Skoro `SUPABASE_*` są w schemacie
`optional: true`, ten sam wzorzec (`optional: true` + wpis w `configStatuses`) jest najprostszą
drogą dla `OPENROUTER_API_KEY`: build w CI nie wymaga wtedy nowego sekretu repozytorium,
a brak klucza objawia się komunikatem, nie wyjątkiem.

#### 4.4 Brak prymitywu wyboru dnia

FR-004 wymaga wyboru dnia w kalendarzu. [src/components/ui/](src/components/ui/) zawiera
**tylko** `button.tsx` i `LibBadge.astro`; w zależnościach nie ma `react-day-picker` ani
biblioteki dat. Do rozstrzygnięcia w planie: `npx shadcn add calendar` (ciągnie `react-day-picker`
+ `date-fns`) kontra natywny `<input type="date">`. Dla S-01 — jeden dzień, jedno pole — natywny
input jest wystarczający i nie dokłada dwóch zależności do „gwiazdy przewodniej".

#### 4.5 Interfejs jest dziś dwujęzyczny

NFR PRD: *„Cały interfejs użytkownika oraz wygenerowane propozycje zajęć są w języku polskim."*
Tymczasem [src/pages/dashboard.astro](src/pages/dashboard.astro) mówi „Welcome / Sign out /
This page is only for authenticated users", a [SignInForm.tsx:22-27](src/components/auth/SignInForm.tsx#L22-L27)
waliduje komunikatami „Email is required". Polski jest tylko w
[config-status.ts:16](src/lib/config-status.ts#L16). Nowy UI S-01 musi być po polsku; retrofit
auth to osobna decyzja zakresowa (rekomendacja: poza S-01, ale odnotować, bo NFR jest naruszony
w chwili, gdy nauczyciel zobaczy aplikację).

### 5. Spójność kontraktu LLM ze schematem bazy

Nawet przy efemerycznym S-01 wyjście modelu ma trafić kiedyś do tabel z F-01, a te mają twarde
granice ([20260720162247_bound_plan_and_activity_input.sql:19-46](supabase/migrations/20260720162247_bound_plan_and_activity_input.sql#L19-L46)):

| Pole                     | Granica w bazie      | Szkic zoda z openrouter-api.md |
| ------------------------ | -------------------- | ------------------------------- |
| `day_plans.prompt`       | 1–2000 znaków        | brak walidacji długości hasła   |
| `activities.title`       | 1–200 znaków         | `z.string().min(1)` — bez `max` |
| `activities.description` | 1–4000 znaków        | `z.string().min(1)` — bez `max` |
| liczba aktywności        | ≤ 20 (przez `ordinal`) | `.min(2).max(3)` ✅            |

Model, który wygeneruje 300-znakowy tytuł, przejdzie walidację S-01 i **wywróci się dopiero na
`CHECK` w S-02** — czyli w innym slice, na innym commicie, z innym kontekstem debugowania.
Domknięcie `.max(200)` / `.max(4000)` i limitu długości hasła kosztuje teraz jedną linijkę.
To dokładnie reguła z [lessons.md](context/foundation/lessons.md) („domknij górną granicę…"),
zastosowana o poziom wyżej — na kontrakcie, nie na migracji.

### 6. Rozjazd dokumentacji z rzeczywistością (4 miejsca)

1. **`roadmap.md` § At a glance — F-01 nadal `ready`.** Faktycznie: zaimplementowane, zrewidowane,
   `change.md` ma `status: impl_reviewed`, commity `2451d9c…75d0b7d`. Sekcja „Done" pusta.
2. **`roadmap.md` § Baseline — „Data: absent — brak `supabase/migrations`".** Nieaktualne od
   2026-07-18. Agent czytający roadmapę jako źródło prawdy (a CLAUDE.md go tam kieruje) dostanie
   fałszywy obraz bazy przy planowaniu S-01.
3. **`roadmap.md` § S-01 Decyzje — ostrzeżenie „⚠️ `infrastructure.md` (…) wciąż niesie starą tezę
   i wymaga korekty" jest już nieprawdziwe.** Korekta weszła tym samym commitem `4d1a2fb`:
   [infrastructure.md](context/foundation/infrastructure.md) ma `corrected_at: 2026-08-22`,
   Ryzyko 1 poprawione, Ryzyko 3 wycofane, rejestr ryzyk i „Getting Started" zaktualizowane.
4. **`tech-stack.md` wciąż niesie wycofaną tezę** — i to jest jedyny żywy jej nośnik:
   *„the PRD's 10–30-second generation window approaches Cloudflare's edge wall-time limit, so
   streaming the LLM response or offloading to a Supabase edge function is the recommended
   mitigation"* ([tech-stack.md:31-33](context/foundation/tech-stack.md#L31-L33)). Ten limit nie
   jest egzekwowany dla Workerów HTTP. Ostrzeżenie w roadmapie wskazywało na zły plik.

Drobiazg tej samej klasy: [README.md:114](README.md#L114) — *„No database tables or migrations
are required"*.

---

## Code References

- [src/middleware.ts:4](src/middleware.ts#L4) — `PROTECTED_ROUTES = ["/dashboard"]`, do rozszerzenia o trasę generowania
- [src/middleware.ts:18-21](src/middleware.ts#L18-L21) — brak sesji → `redirect`, nie 401 (istotne dla trasy API)
- [src/lib/supabase.ts:8-10](src/lib/supabase.ts#L8-L10) — wzorzec „brak konfiguracji → `null`, nie wyjątek"
- [src/lib/config-status.ts:11-21](src/lib/config-status.ts#L11-L21) — miejsce na wpis OpenRoutera
- [src/types.ts:67-75](src/types.ts#L67-L75) — `ActivityDraft`, `GenerateDayPlanCommand`: gotowy kontrakt wyjścia generowania
- [src/lib/day-plans.ts:14-17](src/lib/day-plans.ts#L14-L17) — `selectCurrentGeneration`, jedyny konstruktor `CurrentActivity`
- [src/pages/api/auth/signin.ts:5-7](src/pages/api/auth/signin.ts#L5-L7) — brak precedensu walidacji zodem
- [astro.config.mjs:17-21](astro.config.mjs#L17-L21) — `env.schema`, wzorzec dla `OPENROUTER_API_KEY` / `OPENROUTER_MODEL`
- [supabase/migrations/20260720162247_bound_plan_and_activity_input.sql:19-46](supabase/migrations/20260720162247_bound_plan_and_activity_input.sql#L19-L46) — granice, do których musi się dostroić wyjście LLM
- [wrangler.jsonc](wrangler.jsonc) — `observability: enabled` (logowanie `usage.cost` bez nowej zależności)
- [.github/workflows/ci.yml](.github/workflows/ci.yml) — lint + build; sekrety `SUPABASE_*`

## Architecture Insights

- **Konfiguracja opcjonalna, nie wymagana.** Cały projekt trzyma wzorzec: sekret jest
  `optional: true` w `env.schema`, kod degraduje się łagodnie (`createClient` → `null`), a brak
  konfiguracji komunikuje `config-status.ts`. OpenRouter powinien wejść tym samym wzorcem —
  inaczej build w CI (bez nowego sekretu) staje się nową zależnością operacyjną.
- **Niezmienniki są egzekwowane w bazie i w typach, nie w komentarzach.** F-01 ustanowiło ten
  standard: kompozytowy FK zamiast „pamiętaj o właścicielu", `unique (plan_id, generation, ordinal)`
  jako strukturalny limit 20 wierszy, brandowany `CurrentActivity` zamiast dokumentacji.
  Kontrakt LLM w S-01 powinien trzymać ten sam poziom — schemat zoda z pełnymi granicami, a nie
  `min(1)` plus nadzieja.
- **`fetch` bez SDK to świadomy wybór pod workerd**, spójny z resztą (brak Node API, brak
  polyfilli). [openrouter-api.md § 1](context/foundation/openrouter-api.md) uzasadnia to wprost.
- **200 ≠ sukces.** Awaria częściowa OpenRoutera wraca w `choices[0].finish_reason === "error"`
  przy statusie 200 — ten sam kształt „cichej porażki", dla którego istnieje licznik generacji
  w F-01. Warto to potraktować jako regułę projektu, nie jako ciekawostkę API.

## Historical Context (from prior changes)

- [context/changes/plan-persistence-baseline/plan.md](context/changes/plan-persistence-baseline/plan.md) —
  4-fazowy plan F-01; wzorzec, do którego plan S-01 powinien być porównywalny objętością kontraktów.
- [context/changes/plan-persistence-baseline/reviews/impl-review.md](context/changes/plan-persistence-baseline/reviews/impl-review.md) —
  F5 (niezmiennik generacji przeniesiony do S-02), F7 (`.prettierignore`), F8 (redundantny indeks),
  F9 (`force row level security` świadomie odpuszczone — każda przyszła funkcja `security definer`
  na tych tabelach omija 16 polityk).
- [context/foundation/lessons.md](context/foundation/lessons.md) — dwie reguły z F-01: górna
  granica wierszy potomnych przed pierwszą migracją; odroczone sprzątanie danych musi mieć
  właściciela. Obie dotykają S-01 pośrednio (patrz § 5).
- [context/foundation/infrastructure.md](context/foundation/infrastructure.md) — `corrected_at: 2026-08-22`;
  Ryzyko 3 wycofane. Rekomendacja Workers Paid ($5/mies.) pozostaje, ale jako zapas CPU na SSR
  i parsowanie JSON-a, nie jako warunek działania trasy LLM.

## Related Research

- [context/changes/first-day-generation/llm-model-research.md](context/changes/first-day-generation/llm-model-research.md) —
  trzej kandydaci, kryteria (PLCC > rankingi ogólne), odrzucenie Claude Sonnet 5, otwarta decyzja modelu.
- [context/foundation/openrouter-api.md](context/foundation/openrouter-api.md) — referencja
  wykonawcza API (Context7, snapshot 2026-08-22): `response_format`, `provider`, błędy, `usage`,
  streaming, checklist przedimplementacyjny.

## Open Questions

1. **Czy S-01 zapisuje cokolwiek do bazy?** Rekomendacja: nie. Wymaga jawnej decyzji w planie,
   bo F-01 jest już wdrożone i pokusa jest realna. Owner: decyzja projektowa. Blokuje: plan.
2. **Kto pisze prompt systemowy i według jakiego kryterium go akceptujemy?** Bez właściciela
   i kryterium „gotowy" ten artefakt rozpłynie się w implementacji. Owner: TBD. Blokuje: kod.
3. **Gdzie żyje skrypt testu porównawczego** i czy jego wyniki lądują w tym change folderze
   (np. `model-comparison.md`)? Owner: TBD. Blokuje: nie.
4. **Limit regeneracji** (Otwarte Pytanie Roadmapowe nr 2, gates: S-01) — pozostaje otwarte,
   ale `usage.cost` z każdej odpowiedzi daje dane do decyzji bez podejmowania jej teraz.
   Blokuje: nie.
5. **Retrofit języka polskiego w istniejącym UI auth** — w zakresie S-01 czy osobno? Blokuje: nie.

## Rekomendowana kolejność startu

1. Założyć konto OpenRouter, doładować kredyty, wpisać `OPENROUTER_API_KEY` do `.dev.vars`.
2. `/10x-plan first-day-generation` — z decyzją „efemerycznie" i z fazą 0 = prompt + test modeli.
3. Napisać prompt systemowy (wiek 3–6 lat + polski + format) i JSON Schema z opisami niosącymi
   ten sam guardrail.
4. Jednorazowy skrypt: 3 modele × 5 haseł (neutralne, „Andrzejki", sezonowe, „Dzień Matki",
   abstrakcyjne). Wynik → wybór modelu → `OPENROUTER_MODEL`.
5. Dopiero potem trasa API, walidacja zodem (`npm i zod`), wyspa React ze wskaźnikiem postępu.

Poza kolejnością, jednorazowo: `npm i zod`, aktualizacja `roadmap.md` (F-01 → done, Baseline,
zdjęcie nieaktualnego ⚠️) i korekta `tech-stack.md:31-33`.
