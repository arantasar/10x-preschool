---
change_id: delete-day-plan
title: Delete day plan
status: implemented
created: 2026-08-27
updated: 2026-08-29
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

### Weryfikacja ręczna — metoda i stan (2026-08-29)

Cztery fazy zaimplementowane i scommitowane (`51abcf4`, `f25e4ca`, `b0caf1b`, `8a62cb2`).
Pozycje ręczne odhaczone niżej zostały **zaobserwowane**, nie wywnioskowane z kodu:

- **1.8 / 1.9** — sześć mutacji uruchomionych przeciwko `day_plan_delete.test.sql`, każda
  wewnątrz transakcji testu (DDL cofa się razem z `rollback`, lokalna baza nietknięta):
  odebranie przywileju DELETE → czerwona asercja 1; `delete policy using (false)` →
  asercja 2; FK bez `on delete cascade` (`deferrable initially deferred`, żeby skutek był
  widoczny w transakcji) → **tylko** asercja 3; trigger kasujący wszystkie aktywności
  nauczyciela → **tylko** asercja 4; `coalesce(v_exists, true)` → asercja 5 (przez U0002);
  otwarcie polityk SELECT **i** DELETE → asercja 6.
- **Zmierzony wniosek, wpisany do komentarza przy asercji 6:** samo rozluźnienie polityki
  DELETE do `using (true)` zostawia asercję 6 zieloną. `delete … where … returning` czyta
  kolumny, więc Postgres stosuje do niego również polityki SELECT — i to polityka SELECT
  ukrywa tu cudzy dzień.
- **2.7–2.11, 3.10–3.12, 3.16–3.17** — przebiegnięte przez `curl` na realnej sesji
  (jednorazowe konto testowe, usunięte po weryfikacji) przeciwko `npm run dev`.
  HTML dnia po skasowaniu różni się od dnia nigdy nieplanowanego **wyłącznie** datą
  i losowym `uid` wyspy.
- **Uwaga do scenariuszy `curl` z planu:** Astro odrzuca `DELETE` bez nagłówka `Origin`
  (wbudowana ochrona CSRF) statusem 403. Przeglądarka wysyła `Origin` przy każdym żądaniu
  innym niż GET/HEAD, więc wyspa jest bezpieczna, ale ręczne `curl` wymaga
  `-H "Origin: http://localhost:4321"`.

Sześć pozycji pozostaje **otwartych** i wymaga przeglądarki albo płatnej generacji:
`2.12`, `3.8`, `3.9`, `3.13`, `3.14`, `3.15`. Nie zostały odhaczone, bo nie zostały
zaobserwowane — dowód dla każdej istnieje tylko na poziomie kodu lub trasy:

- `2.12` — mechanizm (`p_require_absent` przepuszcza skasowany dzień) jest asertowany
  w `day_plan_delete.test.sql`; brakuje przebiegu przez realne generowanie tygodnia.
- `3.15` — trasa potwierdzona (`404` + „Ten dzień nie ma planu do usunięcia."); brakuje
  obserwacji, że wyspa pokazuje komunikat zamiast nawigować.
- `3.8`, `3.9`, `3.13`, `3.14` — zachowanie dialogu, stanu `disabled` i ścieżki offline
  w przeglądarce.
