---
change_id: delete-day-plan
title: Delete day plan
status: archived
created: 2026-08-27
updated: 2026-08-29
archived_at: 2026-08-29T08:12:59Z
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

Pozostałe sześć pozycji domkniętych w drugim podejściu:

- **2.12** — decyzja „pominąć czy generować" zapada w taniej przedkontroli
  `generate.ts`, przed wywołaniem modelu. Ten **sam** request `only_if_absent: true`
  na ten sam dzień: przed skasowaniem `409 „Ten dzień ma już plan — nie został
  nadpisany."`, po skasowaniu `200` z nowym planem i `current_generation: 1`
  (pokrywa też scenariusz 8 z Testing Strategy). Kosztowało jedną generację jednego
  dnia — podmiana `OPENROUTER_API_KEY` przez zmienną środowiskową nie działa,
  `.dev.vars` wygrywa.
- **3.8, 3.9, 3.13, 3.14, 3.15** — przeprowadzone w bezgłowym Chrome sterowanym
  DevTools Protocol (bez dokładania zależności do projektu). Dialog obsługiwany
  natywnie przez `Page.handleJavaScriptDialog`, offline przez
  `Network.emulateNetworkConditions`, zawieszona generacja przez `Fetch.requestPaused`.

  Pierwsze podejście podmieniało `window.confirm`/`window.fetch` skryptem
  wstrzykiwanym przez `Page.addScriptToEvaluateOnNewDocument` i **dało fałszywy
  wynik**: w jednym dokumencie Vite przeładował stronę, stub zniknął, kasowanie
  poszło naprawdę i 3.14 „nie przeszło". Metoda natywna jest odporna na to
  przeładowanie i testuje prawdziwą ścieżkę, a nie atrapę.

  Wyniki: przycisk aktywny na planie roboczym, anulowanie dialogu nie wysyła
  `DELETE` i zostawia wiersz w bazie; plan zaakceptowany dostaje **identyczny**
  tekst dialogu co roboczy; przycisk `disabled` przy otwartej edycji propozycji
  i w trakcie generowania; offline → „Brak połączenia z serwerem." z przyciskiem
  ponowienia, **bez** nawigacji, trzy propozycje zostają na ekranie; dzień
  skasowany w drugiej zakładce → „Ten dzień nie ma planu do usunięcia." bez
  nawigacji.

Wszystkie 47 pozycji Progress odhaczone. Konta testowe usunięte, lokalna baza
w stanie zastanym.
