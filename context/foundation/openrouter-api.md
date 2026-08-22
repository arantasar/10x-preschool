---
title: OpenRouter API — referencja wykonawcza dla S-01
project: 10xPreschool
version: 1
status: reference
created: 2026-08-22
updated: 2026-08-22
source: Context7 → /websites/openrouter_ai (snapshot 2026-08-22)
scope: first-day-generation (S-01)
---

# OpenRouter API — referencja wykonawcza dla S-01

> Dokumentacja pobrana przez Context7 z oficjalnych docs OpenRoutera (stan **2026-08-22**)
> i przycięta do tego, czego potrzebuje `first-day-generation` (S-01).
> Decyzja o dostawcy: `context/foundation/roadmap.md` § S-01 Decyzje.
> Wybór modelu: `context/changes/first-day-generation/llm-model-research.md`.
>
> **Zakres:** jedno wywołanie chat completions z wyjściem strukturalnym (JSON), po polsku,
> z promptem systemowym jako jedynym guardrailem. Bez streamingu w pierwszej iteracji.

## 1. Podstawy — endpoint, auth, nagłówki

Jeden endpoint, API zgodne z OpenAI Chat Completions:

```
POST https://openrouter.ai/api/v1/chat/completions
```

| Nagłówek                | Wymagany | Uwagi                                                            |
| ----------------------- | -------- | ---------------------------------------------------------------- |
| `Authorization`         | tak      | `Bearer <OPENROUTER_API_KEY>`                                    |
| `Content-Type`          | tak      | `application/json`                                               |
| `HTTP-Referer`          | nie      | URL aplikacji — atrybucja w rankingach openrouter.ai             |
| `X-OpenRouter-Title`    | nie      | nazwa aplikacji w rankingach (historyczna nazwa: `X-Title`)      |

Minimalne wywołanie (`fetch` — działa natywnie w workerd, bez SDK):

```ts
const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://10xpreschool.example",
    "X-OpenRouter-Title": "10xPreschool",
  },
  body: JSON.stringify({
    model: "google/gemini-3.7-flash",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: keyword },
    ],
  }),
});
```

**SDK vs. `fetch`:** istnieje oficjalny `@openrouter/sdk` (TypeScript, camelCase: `responseFormat`,
`allowFallbacks`). Dla S-01 rekomendacja to czysty `fetch` — jedno wywołanie, zero zależności,
zero ryzyka niekompatybilności z runtime Cloudflare Workers. Wszystkie przykłady niżej są w
wersji HTTP (snake_case, tak jak w body żądania).

## 2. Wyjście strukturalne (`response_format`) — rdzeń S-01

OpenRouter ma dwa tryby: **JSON mode** (`{"type": "json_object"}` — gwarantuje poprawny JSON,
nic więcej) i **strict schema mode** (`json_schema` — wymusza konkretny kształt). S-01 używa
drugiego.

```json
{
  "model": "google/gemini-3.7-flash",
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "Andrzejki" }
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "propozycja_dnia",
      "strict": true,
      "schema": {
        "type": "object",
        "properties": {
          "aktywnosci": {
            "type": "array",
            "description": "2-3 propozycje aktywności dla grupy przedszkolnej 3-6 lat",
            "items": {
              "type": "object",
              "properties": {
                "tytul": {
                  "type": "string",
                  "description": "Krótki tytuł aktywności po polsku"
                },
                "opis": {
                  "type": "string",
                  "description": "Opis przebiegu aktywności po polsku, 2-4 zdania"
                }
              },
              "required": ["tytul", "opis"],
              "additionalProperties": false
            }
          }
        },
        "required": ["aktywnosci"],
        "additionalProperties": false
      }
    }
  }
}
```

Odpowiedź nadal wraca jako **string** w `choices[0].message.content` — trzeba ją sparsować
(`JSON.parse`) i **zwalidować zodem** zgodnie z konwencją projektu. Schemat JSON to instrukcja
dla modelu, nie gwarancja typu w TypeScript.

### Zasady, które warto znać zanim się to napisze

- **Wsparcie jest per endpoint, nie per model.** Ten sam model bywa serwowany przez wielu
  dostawców i tylko część z nich obsługuje structured outputs.
- **`provider.require_parameters: true` jest praktycznie obowiązkowe** przy `json_schema` —
  wycina dostawców, którzy nie obsługują wszystkich parametrów żądania, zamiast po cichu je
  zignorować.
- **`strict: true`** wymusza schemat u dostawców z natywnym wsparciem trybu strict; u pozostałych
  schemat bywa tłumaczony na format własny albo traktowany jako silna sugestia. Tryb strict może
  też ograniczać część konstrukcji JSON Schema, zależnie od endpointu.
- **Opisy w schemacie (`description`) realnie sterują modelem** — docs wprost zalecają je jako
  best practice. To dodatkowe miejsce (obok promptu systemowego) na wymóg języka polskiego
  i wieku 3–6 lat.
- `additionalProperties: false` + kompletne `required` to warunek działania trybu strict u
  dostawców OpenAI-podobnych.

```ts
body: JSON.stringify({
  model: OPENROUTER_MODEL,
  messages,
  response_format: { type: "json_schema", json_schema: { name: "propozycja_dnia", strict: true, schema } },
  provider: { require_parameters: true },
});
```

## 3. Routing dostawców (`provider`) — prywatność i jakość

Obiekt `provider` w body żądania. Pola istotne dla nas:

| Pole                  | Typ                | Domyślnie | Do czego w S-01                                                                 |
| --------------------- | ------------------ | --------- | ------------------------------------------------------------------------------- |
| `require_parameters`  | boolean            | `false`   | **Ustawić `true`** — tylko dostawcy wspierający `json_schema`                    |
| `data_collection`     | `"allow"`\|`"deny"`| `"allow"` | **Ustawić `"deny"`** — NFR prywatności: treści niedostępne dla operatorów        |
| `zdr`                 | boolean            | —         | Twardsze: tylko endpointy Zero Data Retention (OR z ustawieniem konta)           |
| `quantizations`       | string[]           | —         | Filtr po kwantyzacji (`["fp8"]` itd.) — kwantyzacja obniża jakość bez sygnału    |
| `only`                | string[]           | —         | Whitelist dostawców (np. `["azure"]`)                                            |
| `ignore`              | string[]           | —         | Blacklist dostawców                                                              |
| `order`               | string[]           | —         | Kolejność prób (`["google-vertex", "azure"]`)                                    |
| `allow_fallbacks`     | boolean            | `true`    | `false` = tylko wskazany dostawca, bez zapasowych                                |
| `sort`                | string \| object   | —         | `"price"` / `"throughput"` / `"latency"`; obiekt: `{ by, partition }`            |
| `max_price`           | object             | —         | Górny limit ceny dla żądania                                                     |
| `preferred_max_latency`  | number \| object| —         | Preferowane maks. opóźnienie (sekundy lub percentyle p50/p75/p90/p99)            |
| `preferred_min_throughput` | number \| object | —      | Preferowana min. przepustowość (tok/s lub percentyle)                            |

⚠️ **Zawężanie routingu zmniejsza pulę fallbacków** — `only` / `allow_fallbacks: false` mogą
skończyć się błędem **404**, gdy żaden dopuszczony dostawca nie jest dostępny. To realny tryb
awarii do obsłużenia w S-01, nie hipoteza.

Konsekwencja z researchu modelu (§ „Routing OpenRoutera"): jeśli kiedykolwiek wejdzie routing
`:floor` / `sort: "price"`, wybór dostawcy trzeba domknąć świadomie (`data_collection: "deny"`,
`quantizations`, `ignore`, `max_price`), żeby nie ominąć NFR prywatności i nie trafić na
endpoint kwantyzowany.

Zalecany zestaw dla S-01:

```json
"provider": {
  "require_parameters": true,
  "data_collection": "deny"
}
```

## 4. Model — konfiguracja, nie kod

Research (§ Konsekwencje wykonawcze) rozstrzygnął: ID modelu idzie do zmiennej środowiskowej.

```ts
// astro.config.mjs → env.schema
OPENROUTER_API_KEY: envField.string({ context: "server", access: "secret" }),
OPENROUTER_MODEL: envField.string({ context: "server", access: "secret", optional: true }),
```

Kandydaci (z `llm-model-research.md`): `google/gemini-3.7-flash` (rekomendacja główna),
`openai/gpt-5.6-luna` (najniższy błąd structured output: 0,52%), `deepseek/deepseek-v4-flash`
(podłoga kosztowa).

### Fallback między modelami (`models`)

Zamiast pojedynczego `model` można podać tablicę `models` — OpenRouter próbuje po kolei:

```json
{
  "models": ["google/gemini-3.7-flash", "openai/gpt-5.6-luna"],
  "messages": [...]
}
```

Poza zakresem pierwszej iteracji S-01 (jeden model wpisany na sztywno), ale to najtańsza
odpowiedź, gdyby główny model zaczął zwracać 502/429.

## 5. Parametry generowania

Standardowe, zgodne z OpenAI: `temperature`, `max_tokens`, `seed`, `top_p` (0.0–1.0, dom. 1.0),
`top_k` (dom. 0), `frequency_penalty` i `presence_penalty` (−2.0 … 2.0, dom. 0.0).

**Modele rozumujące** — obiekt `reasoning`:

```json
"reasoning": {
  "effort": "high",       // "max" | "xhigh" | "high" | "medium" | "low" | "minimal" | "none"
  "max_tokens": 2000,     // alternatywa dla effort (styl Anthropic) — nie oba naraz
  "exclude": false,       // true = rozumuj, ale nie zwracaj tokenów reasoning
  "enabled": true         // domyślnie wywnioskowane z effort / max_tokens
}
```

Dla S-01 (krótka praca kreatywna, ~600 tokenów wyjścia) research jest jednoznaczny: reasoning
to podwójny koszt i dodatkowe sekundy latencji. Jeśli wybrany model ma reasoning domyślnie
włączone — `"reasoning": { "enabled": false }`. Uwaga: `exclude: true` **nie oszczędza** kosztu
ani czasu, tylko ukrywa tokeny w odpowiedzi.

## 6. Prompt caching — prompt systemowy jest stały

Prompt systemowy z guardrailem (wiek 3–6 lat, język polski, format) jest identyczny między
wywołaniami — to podręcznikowy przypadek cache'u prefiksu. Research wyliczył to jako atut
GPT-5.6 Luna (cache read $0,02/M przy 83% trafień).

Cache jawny (`cache_control`) — dla dostawców w stylu Anthropic:

```json
{
  "messages": [
    {
      "role": "system",
      "content": [
        { "type": "text", "text": "Jesteś asystentem nauczyciela przedszkolnego..." },
        { "type": "text", "text": "<DUŻY STAŁY BLOK INSTRUKCJI>", "cache_control": { "type": "ephemeral" } }
      ]
    },
    { "role": "user", "content": [{ "type": "text", "text": "Andrzejki" }] }
  ]
}
```

Zasada: **wszystko dynamiczne musi być za blokiem cache'owanym**, inaczej unieważnia prefiks.
U nas naturalnie — hasło nauczyciela jest w wiadomości `user`.

OpenRouter obsługuje też `prompt_cache_breakpoint` (marker na bloku treści) + `prompt_cache_options`
(tryb `explicit`, TTL) i sam tłumaczy to na format `cache_control` u dostawców, którzy tego wymagają.
Cache jawny dla OpenAI: GPT-5.6 i nowsze, min. 30 min TTL, zapis 1,25× ceny wejścia, odczyt po
stawce cache read. Aktywność cache'u widać w `usage.prompt_tokens_details`:
`cached_tokens` (odczyt) i `cache_write_tokens` (zapis).

⚠️ Dla S-01 to **optymalizacja, nie wymóg** — przy ~700 tokenach wejścia i 33 wywołaniach/mies.
oszczędność jest w groszach. Wpisane tu, żeby nie szukać tego drugi raz przy S-03 (tydzień = 5×
to samo wejście systemowe).

## 7. Rozliczenie użycia (`usage`)

Kształt obiektu `usage` w odpowiedzi:

```json
"usage": {
  "prompt_tokens": 194,
  "completion_tokens": 2,
  "total_tokens": 196,
  "cost": 0.95,
  "cost_details": { "upstream_inference_cost": 19 },
  "prompt_tokens_details": { "cached_tokens": 0, "cache_write_tokens": 100, "audio_tokens": 0 },
  "completion_tokens_details": { "reasoning_tokens": 0 }
}
```

Koszt i liczniki tokenów przychodzą **w tej samej odpowiedzi** — bez osobnego wywołania API.
To bezpośrednio zasila Otwarte Pytanie Roadmapowe nr 2 („limit regeneracji / koszt API"):
`usage.cost` można logować przy każdej generacji, zanim ktokolwiek zdecyduje o limicie.

Pole `model` w odpowiedzi mówi, **który model faktycznie odpowiedział** — istotne przy tablicy
`models` lub routerach; warto logować obok kosztu.

## 8. Błędy — realne tryby awarii

Kształt błędu:

```json
{
  "error": {
    "code": 429,
    "message": "Rate limit exceeded",
    "metadata": { "error_type": "rate_limit_exceeded", "provider_code": "rate_limited" }
  }
}
```

`error.metadata.error_type` to **znormalizowana** kategoria (jedna dla wszystkich dostawców) —
to na niej opieramy logikę retry, nie na `provider_code` (surowy kod upstreamu, wystawiany dla
statusów innych niż 500).

| Kod | Znaczenie                                  | Reakcja w S-01                                                    |
| --- | ------------------------------------------ | ----------------------------------------------------------------- |
| 400 | błędne parametry żądania                   | bug u nas — log + błąd 500, nie pokazywać nauczycielowi szczegółów |
| 401 | brak / zły klucz                           | misconfiguracja sekretu — log krytyczny                           |
| 402 | brak kredytów                              | komunikat operacyjny; nie do naprawienia retry                    |
| 403 | brak uprawnień klucza                      | misconfiguracja                                                    |
| 404 | brak zasobu **lub żadnego dopuszczonego dostawcy** | efekt zawężonego routingu (`only`, `allow_fallbacks: false`) |
| 413 | payload za duży                            | nie dotyczy przy ~700 tokenach                                    |
| 429 | rate limit                                 | retry z backoffem, komunikat „spróbuj ponownie za chwilę"         |
| 500 | błąd OpenRoutera                           | retry raz, potem komunikat                                        |
| 502 | błąd dostawcy upstream                     | retry / fallback modelu                                            |

**Awaria częściowa** — błąd może przyjść *wewnątrz* poprawnej odpowiedzi 200, obok fragmentu treści:

```json
{
  "choices": [{
    "message": { "role": "assistant", "content": "partial output..." },
    "finish_reason": "error",
    "error": { "code": 502, "message": "Provider disconnected mid-stream", "metadata": { "error_type": "provider_unavailable" } }
  }]
}
```

Konsekwencja: **sam status HTTP 200 nie wystarcza**. Trzeba sprawdzić `choices[0].finish_reason`
i obecność `choices[0].error` przed próbą `JSON.parse` treści. To dokładnie ten kształt awarii,
przy którym „udana" generacja daje nauczycielowi pusty ekran bez śladu w logach.

## 9. Streaming — świadomie odłożony

Roadmapa (§ S-01 Decyzje) rozstrzygnęła: streaming to **decyzja UX**, nie mitygacja limitu CPU
Workers. MVP = wywołanie bez streamingu + wskaźnik postępu. Sekcja jest tu na wypadek, gdyby
10–30 s czekania okazało się nie do przyjęcia.

`stream: true` → Server-Sent Events. Format:

```
: OPENROUTER PROCESSING                                        ← heartbeat, ignorować
data: {"choices":[{"delta":{"content":"Here","role":"assistant"}}]}
data: {"choices":[{"delta":{"content":""}}],"usage":{...}}      ← ostatni chunk niesie usage
data: [DONE]
```

Trzy rzeczy, które łatwo przeoczyć w parserze:

1. Linie zaczynające się od `:` to komentarze SSE (keep-alive przeciw timeoutom) — parser musi je
   pominąć, ale mogą sterować wskaźnikiem ładowania w UI.
2. Bufor musi trzymać niekompletną ostatnią linię między chunkami (`lines.pop()`).
3. Błąd może przyjść **w środku strumienia** jako `parsed.error` + `finish_reason: "error"` — po
   tym, jak część treści już poszła do klienta.

Uwaga architektoniczna: streaming jest niekompatybilny z „sparsuj cały JSON i zwaliduj zodem
przed pokazaniem". Przy `json_schema` streaming daje strumień niekompletnego JSON-a — trzeba
albo parsera częściowego, albo streamingu tylko jako sygnału postępu (progress bar), nie treści.
**Przy wyjściu strukturalnym drugie podejście jest jedynym rozsądnym w S-01.**

## 10. Integracja z tym projektem

### Sekret

`OPENROUTER_API_KEY` to pierwszy sekret poza Supabase. Trzeba go dodać w **trzech** miejscach:

```bash
# 1. .env.example  (wzorzec, commitowany)
OPENROUTER_API_KEY=###
OPENROUTER_MODEL=google/gemini-3.7-flash

# 2. .dev.vars  (lokalny dev na workerd — gitignored, łatwe do przeoczenia; patrz CLAUDE.md)
OPENROUTER_API_KEY=sk-or-v1-...

# 3. produkcja
npx wrangler secret put OPENROUTER_API_KEY
```

Plus deklaracja w `astro.config.mjs` → `env.schema` (wzorzec jak `SUPABASE_URL` / `SUPABASE_KEY`),
plus **sekret repozytorium w GitHub Actions**, jeśli build ma przechodzić z tą zmienną
(`.github/workflows/ci.yml` już wymaga `SUPABASE_URL` / `SUPABASE_KEY`).

Import po stronie serwera: `import { OPENROUTER_API_KEY } from "astro:env/server"`.

### Miejsce w kodzie

Zgodnie z CLAUDE.md: logika generowania jest wołana z trasy API i dotyka więcej niż jednego
miejsca → **`src/lib/services/`** (np. `src/lib/services/activity-generator.ts`).
Trasa: `src/pages/api/…` z `export const prerender = false`, walidacja wejścia zodem,
trasa dodana do `PROTECTED_ROUTES` w `src/middleware.ts`.

### Runtime Cloudflare

- `fetch` jest natywny w workerd — bez polyfilli, bez Node API.
- Czekanie na odpowiedź OpenRoutera to **I/O, nie czas CPU** — nie liczy się do limitu CPU
  Workers (roadmap § S-01 Decyzje, cytat z docs Cloudflare). 10–30 s wywołania jest bezpieczne.
- Warto mimo to ustawić własny timeout po stronie klienta (`AbortSignal.timeout(...)`), żeby
  zawieszony dostawca nie trzymał połączenia nauczyciela w nieskończoność.

## 11. Szkic wywołania dla S-01

```ts
import { OPENROUTER_API_KEY, OPENROUTER_MODEL } from "astro:env/server";
import { z } from "zod";

const proposalSchema = z.object({
  aktywnosci: z
    .array(z.object({ tytul: z.string().min(1), opis: z.string().min(1) }))
    .min(2)
    .max(3),
});

export async function generateDayProposal(keyword: string) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(45_000),
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "X-OpenRouter-Title": "10xPreschool",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL ?? "google/gemini-3.7-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: keyword },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "propozycja_dnia", strict: true, schema: PROPOSAL_JSON_SCHEMA },
      },
      provider: { require_parameters: true, data_collection: "deny" },
      temperature: 0.8,
      max_tokens: 1200,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    // body.error.metadata.error_type → znormalizowana kategoria błędu
    throw new OpenRouterError(response.status, body);
  }

  const data = await response.json();

  // 200 nie znaczy sukces — awaria częściowa wraca w choices[0]
  const choice = data.choices?.[0];
  if (!choice || choice.finish_reason === "error" || choice.error) {
    throw new OpenRouterError(choice?.error?.code ?? 502, choice?.error ?? null);
  }

  // model zwraca JSON jako string — parse + walidacja zodem są obowiązkowe
  return {
    proposal: proposalSchema.parse(JSON.parse(choice.message.content)),
    cost: data.usage?.cost,
    modelUsed: data.model,
  };
}
```

## 12. Checklist przed implementacją S-01

- [ ] `OPENROUTER_API_KEY` w `.env.example`, `.dev.vars`, `wrangler secret put`, sekretach CI
- [ ] `OPENROUTER_MODEL` jako zmienna środowiskowa (research § Konsekwencje wykonawcze)
- [ ] `env.schema` w `astro.config.mjs` rozszerzone o oba pola
- [ ] `provider.require_parameters: true` przy `json_schema`
- [ ] `provider.data_collection: "deny"` (NFR prywatności)
- [ ] `reasoning.enabled: false`, jeśli wybrany model rozumuje domyślnie
- [ ] Obsługa awarii częściowej: `finish_reason === "error"` przy statusie 200
- [ ] `JSON.parse` + walidacja zodem — schemat JSON to instrukcja, nie gwarancja typu
- [ ] Logowanie `usage.cost` i `data.model` (zasila Otwarte Pytanie Roadmapowe nr 2)
- [ ] Trasa generowania dopisana do `PROTECTED_ROUTES`
- [ ] Test porównawczy 3 modeli na 5 hasłach **przed** zamrożeniem wyboru
      (research § Otwarta decyzja)

## Źródła (Context7 → openrouter.ai/docs, 2026-08-22)

- `/docs/api_reference/overview` — endpoint, nagłówki, tryby structured outputs
- `/docs/api_reference/parameters` — top_p, top_k, frequency/presence penalty
- `/docs/api_reference/errors-and-debugging` — kształt błędu, `error_type`, awaria częściowa
- `/docs/api_reference/streaming` — SSE, komentarze `: OPENROUTER PROCESSING`
- `/docs/guides/features/structured-outputs` — `json_schema`, `strict`, wsparcie per endpoint
- `/docs/provider-routing`, `/docs/guides/routing/provider-selection` — pola obiektu `provider`
- `/docs/guides/routing/model-fallbacks` — tablica `models`
- `/docs/guides/best-practices/prompt-caching` — `cache_control`, breakpointy, TTL, rozliczenie
- `/docs/guides/best-practices/reasoning-tokens` — obiekt `reasoning`
- `/docs/cookbook/administration/usage-accounting` — kształt obiektu `usage`
- `/docs/app-attribution` — nagłówki atrybucji
