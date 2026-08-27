# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Domknij górną granicę wierszy potomnych przed pierwszą migracją

- **Context**: Każda migracja tworząca relację rodzic→dzieci, w której liczba wierszy potomnych pochodzi z odpowiedzi modelu.
- **Problem**: Odpowiedź modelu bez górnego ograniczenia zapisuje tyle wierszy, ile wygeneruje. Ani CHECK, ani warstwa aplikacji tego nie zatrzymuje, a po wejściu na produkcję dodanie limitu wymaga migracji na żywych danych.
- **Rule**: Zanim migracja tworząca tabelę zasilaną przez LLM trafi na produkcję, ustal górną granicę liczby wierszy na rodzica i wyegzekwuj ją w schemacie albo świadomie odnotuj jej brak jako decyzję.
- **Applies to**: plan, plan-review, implement

## Odroczone sprzątanie danych musi mieć właściciela

- **Context**: Każdy schemat, w którym cofnięcie realizuje licznik wersji zamiast usuwania wierszy — stara wersja zostaje rezydentna w tej samej tabeli.
- **Problem**: Przeniesienie sprzątania do „slice'u, który to zaimplementuje" znika z pola widzenia — nie ma commita, testu ani pozycji w planie, która by o nim przypomniała.
- **Rule**: Jeśli plan odkłada usuwanie danych do późniejszego slice'u, zapisz to jako jawną pozycję z nazwanym właścicielem — i nigdy nie opisuj retencji jako własności schematu, dopóki nie egzekwuje jej kód.
- **Applies to**: plan, plan-review, implement

## Gdy prompt jest jedyną warstwą bezpieczeństwa, bramka musi objąć każdy dopuszczony model

- **Context**: Slice, w którym treść dla odbiorcy wrażliwego jest chroniona wyłącznie instrukcją w promptcie, a model da się podmienić zmienną środowiskową bez deployu (`src/lib/services/prompts/day-plan.pl.md`, `scripts/compare-models.sh`).
- **Problem**: Wynik DeepSeeka z Fazy 5 S-01 jest dowodem, że model przechodzi każdą automatyczną kontrolę w slice — JSON Schema, `dayPlanProposalSchema`, `jq aktywnosci | length == 3` — i mimo to proponuje roztopiony wosk dzieciom 3–6 lat. Jedyną warstwą, która to łapie, jest prompt, a jedynym narzędziem, które go sprawdza, jest jednorazowy skrypt poza CI. Edycja promptu albo podmiana `OPENROUTER_MODEL` może więc cofnąć bezpieczeństwo przy zerowym sygnale.
- **Rule**: Jeśli prompt jest jedyną warstwą bezpieczeństwa treści, bramka jakości musi obejmować każdy model dopuszczony do konfiguracji — nie tylko wybrany — a każda zmiana promptu lub domyślnego modelu wymaga ponownego przebiegu tej bramki przed scaleniem.
- **Applies to**: plan, plan-review, implement, impl-review

## Kryterium weryfikacji musi móc nie przejść

- **Context**: Kryteria sukcesu w `plan.md`, które sprawdzają **nieobecność** czegoś — że plik nie został dotknięty, że wzorzec nie występuje, że formatowanie się nie rozjechało.
- **Problem**: Kryterium sformułowane bez zakresu przechodzi bezwarunkowo w momencie, w którym rytuał je uruchamia. `git diff --name-only` bez zakresu porównuje drzewo robocze z HEAD, więc po commicie fazy zwraca pusto i każdy grep na nim jest zielony niezależnie od faktów (`visible-day-theme`, 1.5 i 2.4). `prettier --check` na `context/` przechodzi bezwarunkowo, bo `.prettierignore` wyklucza ten katalog w całości (`month-home`, F4). W obu wypadkach wniosek był prawdziwy przez przypadek, a bramka nie sprawdzała niczego — i w obu wypadkach zauważył to dopiero przegląd implementacyjny.
- **Rule**: Zanim kryterium „czegoś nie ma" trafi do planu, upewnij się, że **potrafi nie przejść**: uruchom je na stanie, w którym naruszenie istnieje, albo zapisz w treści kryterium zakres, który to gwarantuje (`git diff --name-only master..HEAD`, nie `git diff --name-only`). Kryterium, którego nikt nie widział na czerwono, jest komentarzem, nie bramką.
- **Applies to**: plan, plan-review, implement, impl-review
