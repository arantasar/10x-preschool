---
project: "10xPreschool"
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
created: 2026-05-24
updated: 2026-05-24
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  frs_drafted: 9
  gray_areas_resolved:
    - topic: "rodzaj bólu"
      decision: "paraliż decyzyjny + tarcie w przepływie pracy"
    - topic: "insight"
      decision: "LLM osiągnął wystarczającą jakość do kreatywnych propozycji zajęć"
    - topic: "zakres persony"
      decision: "konkretna rola w organizacji — nauczyciel w przedszkolu"
    - topic: "mechanizm logowania"
      decision: "e-mail + hasło; flat model (jedna rola)"
    - topic: "MVP flow"
      decision: "logowanie → wybór dnia/tygodnia → hasło per okres → generowanie → edycja/akceptacja"
    - topic: "timeline"
      decision: "3 tygodnie po godzinach; brak twardego deadline'u"
    - topic: "guardrail"
      decision: "propozycje muszą być odpowiednie dla dzieci (bezpieczna treść)"
  quality_check_status: accepted
---

## Vision & Problem Statement

Nauczyciele przedszkolni muszą raz w miesiącu samodzielnie zaplanować zajęcia na każdy dzień kolejnego miesiąca — wybrać tematykę, dobrać aktywności i zadbać o spójność całego planu z aktualnymi wydarzeniami (pory roku, święta, tematy bieżące). To zadanie jest żmudne, czasochłonne i wymaga dużej kreatywności; powoduje paraliż decyzyjny przy zapełnianiu kalendarza 20–22 dniami i stanowi regularne tarcie w pracy zawodowej nauczyciela.

Insight: LLM osiągnął jakość generowania treści wystarczającą, by proponować konkretne, gotowe do użycia propozycje aktywności dla dzieci przedszkolnych — niszowy rynek, który duże platformy EdTech pomijają.

## User & Persona

**Persona główna:** Nauczyciel/ka przedszkolny/a

- Rola: pracownik przedszkola odpowiedzialny za planowanie i prowadzenie zajęć z grupą dzieci (typowo 3–6 lat)
- Kontekst: raz w miesiącu musi przygotować pisemny plan miesięczny; tematy muszą być spójne z sobą nawzajem i z aktualnymi wydarzeniami
- Moment sięgnięcia po produkt: pod koniec miesiąca, podczas sesji planowania następnego miesiąca

## Access Control

Jeden typ użytkownika — nauczyciel przedszkolny.

- Rejestracja i logowanie przez e-mail + hasło.
- Flat model: wszyscy zarejestrowani użytkownicy mają identyczny zakres uprawnień; brak ról admin/member.
- Użytkownik niezalogowany nie ma dostępu do żadnej funkcji aplikacji (poza ekranem logowania/rejestracji).
- Dane kalendarza i wygenerowanych planów są prywatne dla danego konta.

## Success Criteria

### Primary
- Nauczyciel może zalogować się, wybrać dzień lub tydzień, wpisać hasło/wytyczne, wygenerować propozycje zajęć, edytować je i zaakceptować — cały przepływ działa bez błędów.

### Secondary
- Nauczyciel akceptuje bez edycji ≥ 75% wygenerowanych propozycji zajęć — miara jakości generowania.

### Guardrails
- Żadna propozycja zajęć nie zawiera treści nieodpowiedniej dla dzieci w wieku 3–6 lat. Naruszenie tego guardrail dyskredytuje aplikację niezależnie od stanu pozostałych funkcji.

## Functional Requirements

### Konto użytkownika
- FR-001: Nauczyciel może się zarejestrować używając adresu e-mail i hasła. Priority: must-have
  > Socrates: Kontr-argument rozważony: "rejestracja to bariera wejścia; lepiej prototyp bez konta." Utrzymano — persystencja i izolacja danych wymagają konta; bariera jest świadomym wyborem projektu.
- FR-002: Nauczyciel może zalogować się do swojego konta. Priority: must-have
  > Socrates: Kontr-argument rozważony: "reset hasła to ukryty koszt MVP — nauczyciel zablokowany bez wsparcia." Utrzymano; reset hasła trafia do Open Questions jako TODO przed produkcją.
- FR-003: Nauczyciel może wylogować się z aplikacji. Priority: nice-to-have
  > Socrates: Kontr-argument zaakceptowany: "to drobiazg — sesja wygasa automatycznie; wylogowanie można dodać w v2." Zdegradowano do nice-to-have.

### Kalendarz
- FR-004: Nauczyciel może wybrać konkretny dzień lub tydzień w widoku kalendarza. Priority: must-have
  > Socrates: Kontr-argument rozważony: "widok tygodniowy to dużo pracy UI; zacznijmy od samych dni." Utrzymano — granulacja dnia/tygodnia jest sercem przepływu; widok można uprościć w implementacji bez zmiany FR.
- FR-005: Nauczyciel może wpisać hasło lub krótkie wytyczne dla wybranego dnia lub tygodnia. Priority: must-have
  > Socrates: Kontr-argument rozważony: "hasło per dzień to za granularne; jedno hasło per miesiąc wystarczy." Utrzymano — hasło per okres jest celowe; pozwala nauczycielowi różnicować tematykę w ciągu miesiąca.

### Generowanie zajęć
- FR-006: Nauczyciel może wygenerować propozycje zajęć dla wybranego okresu (dnia lub tygodnia) na podstawie wpisanego hasła. Priority: must-have
  > Socrates: Kontr-argument rozważony: "brak feedbacku podczas długiego call AI to błąd UX." Utrzymano FR; widoczny postęp podczas generowania trafia do NFR.
- FR-007: Nauczyciel może ponownie wygenerować propozycje zajęć dla danego dnia. Priority: must-have
  > Socrates: Kontr-argument rozważony: "regeneracja bez limitu to ryzyko kosztów API." Utrzymano — limit nie jest wymaganiem MVP; ryzyko kosztów trafia do Open Questions.

### Zarządzanie planem
- FR-008: Nauczyciel może edytować treść wygenerowanej propozycji zajęć. Priority: must-have
  > Socrates: Kontr-argument rozważony: "może wystarczy akceptuj lub regeneruj?" Utrzymano — edycja drobnych poprawek jest szybsza niż wielokrotna regeneracja.
- FR-009: Nauczyciel może zaakceptować propozycję zajęć dla danego dnia. Priority: must-have
  > Socrates: Kontr-argument rozważony: "brak edycji = akceptacja; oddzielny przycisk Akceptuj to zbędny krok." Utrzymano — jawny stan "zaakceptowany" pozwala odróżnić plan roboczy od zatwierdzonego.

## User Stories

### US-01: Nauczyciel generuje plan zajęć na tydzień

- **Given** zalogowany nauczyciel w widoku kalendarza
- **When** wybiera tydzień, wpisuje hasło (np. "Dinozaury") i uruchamia generowanie
- **Then** widzi propozycje konkretnych aktywności dla każdego dnia wybranego tygodnia

#### Acceptance Criteria
- Każdy dzień roboczy wybranego tygodnia otrzymuje co najmniej jedną propozycję aktywności
- Propozycja zawiera nazwę zajęć i krótki opis aktywności
- Nauczyciel może edytować lub ponownie wygenerować propozycję dla wybranego dnia bez wpływu na pozostałe dni

## Business Logic

Na podstawie hasła od nauczyciela aplikacja proponuje konkretne, gotowe do użycia aktywności dla dzieci w wieku 3–6 lat, które pasują do tego hasła i są odpowiednie dla grupy przedszkolnej.

Wejście: hasło lub krótkie wytyczne wpisane przez nauczyciela dla wybranego dnia lub tygodnia (np. "Dinozaury", "Nadejście wiosny", "Dzień Matki"). Wyjście: jedna lub więcej konkretnych propozycji aktywności z tytułem i opisem. Reguła dotyczy trafności (propozycja pasuje do hasła), stosowności (treść odpowiednia dla dzieci 3–6 lat) oraz kompletności (każdy wybrany dzień otrzymuje propozycję). Logika doboru i kreatywna decyzja, jaka aktywność pasuje do hasła, leży po stronie aplikacji — to właśnie zwalnia nauczyciela z twórczego wysiłku.

## Non-Functional Requirements

- Nauczyciel widzi ciągły, widoczny postęp przez cały czas trwania operacji generowania — niezależnie od tego, jak długo trwa (może to być 10–30 sekund).
- Treści planu zajęć konkretnego nauczyciela nie są dostępne dla innych użytkowników ani dla operatorów systemu po zakończeniu sesji generowania.
- Cały interfejs użytkownika oraz wygenerowane propozycje zajęć są w języku polskim.

## Non-Goals

- **Brak profili grup przedszkolnych** — aplikacja nie przechowuje informacji o konkretnych grupach ani ich składzie; plan jest własnością nauczyciela, nie grupy.
- **Brak danych o dzieciach** — żadnych informacji o indywidualnych dzieciach: imiona, potrzeby, alergie, wiek konkretnych dzieci są poza zakresem MVP.
- **Brak generowania materiałów dodatkowych** — aplikacja proponuje tylko tytuł i opis aktywności; karty pracy, grafiki, audio, nagrania są poza MVP.
- **Brak filtrowania po typach zajęć** — nauczyciel nie kategoryzuje propozycji (plastyczne / muzyczne / ruchowe); AI decyduje o formie aktywności na podstawie hasła.

## Open Questions

1. **Reset hasła** — czy MVP wymaga mechanizmu odzyskiwania hasła przez e-mail? Właściciel: decyzja produktowa. Blokuje: nie (MVP może startować bez, ale nie nadaje się do produkcji bez rozwiązania).
2. **Limit regeneracji** — czy istnieje limit liczby wywołań AI dla jednego użytkownika (koszt API)? Właściciel: decyzja techniczno-biznesowa. Blokuje: nie dla MVP.

## Quality cross-check

Uruchomiony po fazie 6. Wszystkie elementy obecne — status: accepted. Brak wpisów do Open Questions z cross-checku.






