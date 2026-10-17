# Follow-ups from impl-review (fair-use-limit)

- **F3 — powiadomienie kont o zmianie Polityki prywatności 1.1.** Przed scaleniem zdecyduj, czy nowy pkt 2.7 („Limit generowania”) to zmiana „istotna” w rozumieniu pkt 11 Polityki. Jeśli tak: e-mail do istniejących kont przed wejściem w życie. Jeśli nie: wystarczy wersja 1.1 na stronie. Do tego `PRIVACY_PUBLISHED_ON` w `src/lib/legal.ts` ustaw na dzień scalenia.
- **F5 — bramka 5.3 jest ślepa na wiersze z S-21 w prerekwizytach** (S-22, S-23, S-27). Wynik tej zmiany jest prawdziwy. Jeśli ma stać się regułą: `/10x-lesson` („zakres bramki grep nie może odfiltrowywać części zakresu, którego pilnuje”).
- **Plan.md** opisuje starą kolejność argumentów `claim_generation` (fazy blokowe są tylko do odczytu). Obowiązuje sygnatura z migracji.
