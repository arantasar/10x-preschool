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
