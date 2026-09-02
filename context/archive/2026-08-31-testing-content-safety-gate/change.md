---
change_id: testing-content-safety-gate
title: Powtarzalna bramka bezpieczeństwa treści dla każdego dopuszczonego modelu
status: archived
created: 2026-08-31
updated: 2026-09-02
archived_at: 2026-09-02T10:20:26Z
---

## Notes

Rollout Phase 2 of context/foundation/test-plan.md: "Powtarzalna bramka bezpieczeństwa treści".

Goal: wyjąć jedyną kontrolę guardrailu z jednorazowego skryptu i objąć nią każdy dopuszczony model oraz każdą zmianę promptu.

Risks covered: #1 (nauczyciel dostaje propozycję nieodpowiednią dla dzieci 3–6 lat; nic nie stoi między modelem a nim, a zmiana promptu lub dopuszczonego modelu cofa bezpieczeństwo przy zerowym sygnale), #6 (niewalidowane wejście nauczyciela trafia do promptu i do bazy — przejęcie instrukcji modelu, koszt API w pętli regeneracji, zapis partii bez górnej granicy).

Test types planned: contract + AI-native judge.

Risk response intent:
- #1: udowodnić, że zdefiniowany zestaw haseł produkuje wyjście, które powtarzalna kontrola oznacza jako niebezpieczne dla 3–6 lat, i że kontrola obejmuje KAŻDY dopuszczony model, nie tylko domyślny.
- #6: udowodnić, że wejście przekraczające granice albo zawierające instrukcję dla modelu jest odrzucane po stronie serwera (nie tylko w formularzu), a liczba zapisanych wierszy ma twardy sufit egzekwowany poniżej aplikacji.

Kontekst wagi: merge do master deployuje worker na produkcję bez kroku zatwierdzenia (CLAUDE.md §CI); żadna bramka na PR-ze nie jest dziś blokująca (test-plan.md §5).

Uwaga procesowa: to slice od S-03 wzwyż — praca na feature branchu `feat/testing-content-safety-gate`, nie na master.
