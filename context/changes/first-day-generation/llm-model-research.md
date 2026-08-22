# Wybór modelu LLM dla S-01 — research

> Change: `first-day-generation` (S-01, gwiazda przewodnia)
> Data researchu: 2026-08-22 · Dostawca ustalony w roadmapie: **OpenRouter**
> Status: rekomendacja do decyzji — model **nie jest jeszcze wybrany**

## Kontekst decyzji

Roadmapa (§ S-01 Decyzje, 2026-08-22) przesądziła dostawcę — OpenRouter — i pozostawiła
otwarty wybór konkretnego modelu, wpisywanego na sztywno w pierwszej iteracji. Ten dokument
zbiera dane potrzebne do tego wyboru.

Kształt zadania jest wąski i to zmienia wagi kryteriów:

- ~700 tokenów wejścia (prompt systemowy z guardrailem + hasło nauczyciela)
- ~600 tokenów wyjścia (2–3 aktywności: tytuł + opis)
- wyjście strukturalne (JSON), język polski
- 22 dni/miesiąc + regeneracje ≈ **33 wywołania/miesiąc/nauczyciel**

## Co faktycznie decyduje

1. **Koszt tokenów jest praktycznie nieistotny.** Przy 33 wywołaniach miesięcznie najdroższy
   kandydat kosztuje $0,18/mies./nauczyciel, najtańszy $0,004. Różnica 45× w wartościach
   bezwzględnych to szum. Optymalizacja pod cenę na tym etapie to fałszywy trop — S-01 ma
   udowodnić jakość, nie unit economics.
2. **Kompetencja kulturowa w polskim jest rdzeniem.** Hasła typu „Andrzejki", „Dzień Babci",
   „Nadejście wiosny" są osadzone w polskich realiach przedszkolnych. Benchmark **PLCC**
   (kultura i tradycja, gramatyka, słownictwo) jest tu lepszym predyktorem niż jakikolwiek
   ranking ogólnej inteligencji modelu.
3. **Prompt jest jedynym guardrailem** (decyzja roadmapowa: brak post-filtra w MVP). Liczy się
   posłuszeństwo instrukcji systemowej, nie surowa moc modelu.
4. **Modele rozumujące płacą podwójnie** — tokeny reasoning są rozliczane jak output i dokładają
   sekundy latencji. Dla krótkiej pracy kreatywnej to głównie strata.

## Kandydaci

| #   | Model (OpenRouter ID)         | Cena in/out per 1M                       | Koszt/generację      | Polski (dowód)                                                                             | Structured output error |
| --- | ----------------------------- | ---------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------ | ----------------------- |
| 1   | `google/gemini-3.7-flash`     | $0,375 / $1,875 (promo −75%; lista $1,50/$7,50) | ~$0,0014 (lista: $0,0056) | PLCC: Gemini-3-Flash-Preview 91,67 śr. (#5); Gemini 3.1 Pro 97,0 (#1) — rodzina Google dominuje | 1,68% (AI Studio) / 2,67% (Vertex) |
| 2   | `openai/gpt-5.6-luna`         | $0,20 / $1,20 (cache read $0,02)         | ~$0,0009             | PLCC: GPT-5.4 high reasoning 92,17 (#3); GPT-5.2 wysoko u Jeleśniańskiego                   | **0,52%** — najniższy   |
| 3   | `deepseek/deepseek-v4-flash`  | $0,0658 / $0,1316 (promo −53%; lista $0,14/$0,28) | ~$0,00013       | CPTU-Bench #1 w „language understanding" (4,36); brak wyników w czołówce PLCC              | brak danych             |

Koszt/generację liczony przy 700 in / 600 out.

### 1. Gemini 3.7 Flash — rekomendacja główna

Najmocniejsze dostępne dowody na polszczyznę. PLCC mierzy dokładnie to, co decyduje o trafności
propozycji dla polskiego przedszkola, a modele Google zajmują tam czołówkę z wyraźnym odstępem.
Wariant Flash mieści się blisko szczytu (91,67 przy 97,0 dla Pro) — nie płacisz za Pro, by dostać
większość jakości. 93–123 tok/s przy 1,86 s latencji mieści się w NFR „10–30 sekund z widocznym
postępem".

**Ryzyko do świadomego przyjęcia:** cena $0,375/$1,875 to promocja „limited time". Cennik listowy
to $1,50/$7,50 — czterokrotnie drożej. Przy modelu wpisanym na sztywno wygaśnięcie promocji
podnosi koszt z $0,046 do $0,18 na nauczyciela miesięcznie. Nadal nieistotne w skali MVP, ale
kalkulacja nie powinna opierać się na cenie promocyjnej.

### 2. GPT-5.6 Luna — najlepszy stosunek niezawodności do ceny

Wybór, jeśli przewidywalność jest cenniejsza niż ostatnie punkty jakości polszczyzny:

- **0,52% błędów structured output** — trzy do pięciu razy mniej niż Gemini 3.7 Flash. Przy
  `response_format: json_schema` przekłada się to wprost na mniej pustych ekranów u nauczyciela.
- **Cena bez promocji** — $0,20/$1,20 to cennik regularny, więc nic nie wygaśnie pod
  hardcodowanym ID.
- **Cache read $0,02/M przy 83% trafień** — prompt systemowy z guardrailem wieku i języka jest
  stały między wywołaniami, więc przy każdej regeneracji jest praktycznie darmowy.
- **Endpoint Azure (EU)** — realna opcja przy NFR prywatności, jeśli dojdzie temat rezydencji danych.
- Najniższa latencja w zestawie (0,93 s p50, 110 tok/s przez Bedrock).

Rodzina OpenAI jest na PLCC tuż za Google (92,17 dla GPT-5.4), więc oddaje się niewiele.

### 3. DeepSeek V4 Flash — podłoga kosztowa i fallback

~10× tańszy od Gemini nawet po jego promocji. Sensowny jako model zapasowy w routingu OpenRoutera
i jako punkt odniesienia: jeśli DeepSeek generuje akceptowalne propozycje, hipoteza produktu broni
się na najtańszym możliwym poziomie. Ma najlepszy w zestawie wynik CPTU-Bench w rozumieniu
polskiego tekstu (idiomy, implikatury).

**Dwa zastrzeżenia:**

- Silny w _rozumieniu_ polskiego, ale bez dowodów na kompetencję _kulturową_ — rodzina DeepSeek
  nie wchodzi do czołówki PLCC, a to ten wymiar rozstrzyga o „Andrzejkach".
- Najtańsi dostawcy to Baidu Qianfan, StreamLake, SiliconFlow i Alibaba Cloud. Wejście nauczyciela
  to samo hasło tematyczne, więc wrażliwość danych jest niska, ale przy NFR o niedostępności treści
  dla operatorów warto to rozstrzygnąć świadomie, a nie przypadkiem przez routing `:floor`.

## Świadomie odrzucone

**Claude Sonnet 5** ($1/$5) — mimo że projekt żyje już w ekosystemie Anthropic. Rodzina Claude
wypada na PLCC zaskakująco słabo: Sonnet 4.6 osiąga 77,67 średniej (miejsce #41) przy 91,67 dla
Gemini Flash. Płaciłoby się więcej za gorszą polszczyznę kulturową. To jedyny wynik z całego
researchu wyraźnie zaskakujący względem rankingów ogólnych — i dokładnie ten rodzaj sygnału, dla
którego robi się benchmarki językowe.

## Konsekwencje wykonawcze

- **ID modelu w zmiennej środowiskowej, nie w kodzie.** Roadmapa mówi „model wpisany na sztywno" —
  słusznie, ale sztywny wybór należy do konfiguracji, nie do źródła. Koszt: jedna linijka obok
  `OPENROUTER_API_KEY` w `.env.example` / `.dev.vars`. Zysk: przełączenie modelu bez deployu, gdy
  pierwszy realny output pokaże, który kandydat lepiej trzyma guardrail wieku.
- **Routing OpenRoutera** — jeśli w grę wejdzie `:floor`, świadomie ustawić `provider.ignore` lub
  `max_price`, żeby wybór dostawcy nie omijał NFR prywatności ani nie trafił na endpoint
  kwantyzowany (obniżona jakość bez żadnego sygnału w logach).

## Otwarta decyzja — test porównawczy przed wyborem

Benchmarki mówią o polszczyźnie ogólnej, nie o tym, czy model rozumie, co da się zrobić
z pięciolatkiem w sali. Przed zamrożeniem wyboru: uruchomić wszystkie trzy modele na 5 hasłach —
jedno neutralne, jedno kulturowe („Andrzejki"), jedno sezonowe, jedno trudne („Dzień Matki"), jedno
abstrakcyjne. ~15 wywołań za kilka centów; jedyny dowód, który naprawdę rozstrzyga.

Kryterium oceny wynika z PRD: ≥ 75% propozycji akceptowanych bez edycji + zero treści
nieodpowiednich dla 3–6 lat.

## Źródła

- OpenRouter — strony modeli `google/gemini-3.7-flash`, `openai/gpt-5.6-luna`,
  `deepseek/deepseek-v4-flash` (ceny, latencja, throughput, structured output error rate,
  lista dostawców) — stan na 2026-08-22
- OpenRouter — Structured Outputs, Provider Routing, „Lowest-Cost LLM Inference" (2026-06-12)
- PLCC — Polish Linguistic and Cultural Competency (Dadas et al., arXiv:2503.00995), leaderboard
  via CodeSOTA
- CPTU-Bench — Complex Polish Text Understanding (SpeakLeash/Spichlerz)
- Open PL LLM Leaderboard, Polish MT-Bench (SpeakLeash)
- M. Jeleśniański, „LLM Ranking/Report 2026 on Content Generation in the Polish Language"
  (2026-03-09) — ocena jakościowa generowania treści po polsku przez 11 ewaluatorów
