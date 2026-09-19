---
project: "10xPreschool"
context_type: brownfield
product_type: web-app          # bez zmian — istniejąca aplikacja webowa
target_scale:
  users: small                 # bez zmian
  qps: low
  data_volume: small
timeline_budget:
  delivery_weeks: null         # świadomie bez bramki czasowej — patrz ## Timeline acknowledgment
  hard_deadline: null
  after_hours_only: true
created: 2026-09-19
updated: 2026-09-19
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  frs_drafted: 10
  gray_areas_resolved:
    - topic: "rdzeń bólu M-02"
      decision: "brak jednego rdzenia — trzy osie równorzędnie (poprawialność, czytelność, wyjście poza aplikację); paczka dojrzewania przepływu po M-01"
    - topic: "charakter zmiany"
      decision: "jedna paczka dojrzewania UX; regeneracja tygodnia jako rozszerzenie istniejącego generowania — SPRZECZNE z roadmap.md §Kandydaci pkt 1 („nowa zdolność\"), rozstrzygnięcie odłożone do fazy 4"
    - topic: "co nie może się zepsuć"
      decision: "cztery niezmienniki: izolacja kont (RLS), zaakceptowany dzień nie ginie po cichu, protokół licznika generacji przy zapisie partii, bezpieczeństwo treści propozycji"
    - topic: "model dostępu"
      decision: "bez zmian — jedna rola, model płaski, RLS per konto zachowane"
  quality_check_status: warned
---

## Current System Overview

**Cel systemu:** 10xPreschool zamienia krótkie hasło wpisane przez nauczyciela przedszkolnego
(np. „Dinozaury") w konkretne, gotowe do użycia propozycje aktywności dla dzieci 3–6 lat,
generowane przez LLM.

**Architektura:** aplikacja SSR renderowana w całości na serwerze, z wyspami interaktywnymi
tam, gdzie potrzebny jest stan; warstwa serwisowa oddzielona od tras API; baza relacyjna
z politykami dostępu egzekwowanymi po stronie bazy, nie aplikacji. Wdrożenie na platformie
edge — merge do gałęzi głównej jest wydaniem na produkcję, bez kroku zatwierdzenia.

**Stack:** Astro 6 (SSR) + React 19 (wyspy), Tailwind 4, shadcn/ui, Supabase (auth przez
`@supabase/ssr` z sesją w ciasteczkach + Postgres z RLS per operacja i rola), OpenRouter jako
dostawca LLM, Cloudflare Workers jako środowisko uruchomieniowe. Testy: warstwa jednostkowa,
bramka bezpieczeństwa treści na żywych wywołaniach LLM (`npm run test:gate`) oraz warstwa
przeglądarkowa Playwright (od 2026-09-05 na gałęzi głównej).

**Użytkownicy dziś:** jedna rola — nauczyciel przedszkolny. Model płaski, bez ról
administracyjnych. Skala mała: dane każdego konta są prywatne i odseparowane przez RLS.

**Co system robi dzisiaj (zamknięte w `M-01`):** logowanie i wylogowanie; wybór dnia lub
tygodnia; wpisanie hasła dla okresu; generowanie propozycji dla pojedynczego dnia i dla całego
tygodnia roboczego (szkic tygodnia rozkłada hasło na pięć rozłącznych tematów dziennych);
edycja propozycji; jawna akceptacja dnia; usunięcie zapisanego planu dnia (kasowanie twarde);
siatka miesiąca jako ekran główny, z podtytułem dnia odróżniającym dni jednego hasła.

## Problem Statement & Motivation

`M-01` dowiózł zdolności: nauczyciel potrafi zbudować plan miesiąca od zera. Czego nie dowiózł,
to **dojrzałości tego przepływu** — planem zbudowanym da się dziś posługiwać znacznie gorzej,
niż da się go zbudować. Ból nie ma jednego rdzenia; rozkłada się równomiernie na trzy osie,
i to jest ustalenie użytkownika (2026-09-19), nie uproszczenie:

1. **Plan jest trudny do poprawienia.** Zmiana motywu całego tygodnia oznacza dziś przejście
   pięciu dni po kolei. Cofnięcie akceptacji i usunięcie dnia są osiągalne tylko z widoku dnia,
   nie z tygodnia, w którym nauczyciel faktycznie pracuje.
2. **Plan jest trudny do odczytania.** Kafelek w siatce miesiąca pokazuje hasło i ucięty
   podtytuł; co jest zaplanowane na dany dzień, widać dopiero po wejściu w ten dzień.
3. **Plan nie wychodzi z aplikacji.** Zaakceptowany tydzień zostaje w przeglądarce — nie ma
   ścieżki do wydruku.

**Dlaczego teraz:** zgłoszenia powstały 2026-08-30, przy realnym użyciu aplikacji po zamknięciu
`M-01`, i zostały przetriagowane tego samego dnia. Nie zostały zrobione od razu, bo **PRD v1
wyczerpał się na `S-03`**: żadna z tych pozycji nie ma własnego FR, a dwie wymagają zmiany PRD,
nie dopisania do niego (Open Roadmap Questions #3). `M-01` zamknięto świadomie z niepełnym
zakresem — `S-07` wypisano z kamienia właśnie po to, żeby nie dopisywać wymagania wstecz do
gotowego kodu. PRD v2 jest więc warunkiem wejścia całej paczki, nie formalnością.

**Koszt obejścia dzisiaj:** nauczyciel, który chce zmienić motyw tygodnia, wykonuje pięć
osobnych operacji zamiast jednej; nauczyciel, który chce zobaczyć plan miesiąca, klika w każdy
dzień po kolei; nauczyciel, który chce oddać plan na papierze, nie ma czego oddać.

**Charakter zmiany (ustalenie użytkownika, 2026-09-19):** jedna paczka dojrzewania UX —
poprawki użyteczności na tym, co już działa, łącznie z regeneracją tygodnia traktowaną jako
rozszerzenie istniejącego generowania. ⚠️ **Napięcie do rozstrzygnięcia w fazie 4:**
`roadmap.md` §Kandydaci pkt 1 nazywa regenerację tygodnia z zastępowaniem *nową zdolnością*,
bo dzisiejsza blokada pomija każdy dzień z jakimkolwiek planem, także roboczym szkicem.
**Rozstrzygnięte 2026-09-19 w fazie 4 na korzyść roadmapy: `[new]`.** Powodów dwa —
operacji „zastąp istniejące dni" nie da się dziś wywołać żadną ścieżką, a osobny FR daje
miejsce gwarancji kolejności operacji przy awarii dostawcy. Rama „paczka dojrzewania UX"
zostaje jako opis kamienia; na poziomie FR ta jedna pozycja jest nową zdolnością.

## User & Persona

**Persona bez zmian:** nauczyciel/ka przedszkolny/a — jedyna rola w systemie, model płaski.
Ta paczka nie wprowadza nowej persony ani nie zmienia zakresu istniejącej.

**Co zmienia się w jego doświadczeniu:** dzisiejszy nauczyciel jest użytkownikiem, który plan
**buduje**. Po tej paczce jest użytkownikiem, który planem **zarządza** — poprawia go, ogląda
i wynosi poza aplikację. Wszystkie zmiany dotyczą nauczyciela, który ma już zbudowany plan;
dla konta pustego nie zmienia się nic.

**Nowi użytkownicy:** żadnych. Paczka nie otwiera systemu na nową grupę.

## Access Control Changes

**Bez zmian — obecny model zachowany.**

Dziś: jedna rola (nauczyciel), model płaski, rejestracja i logowanie e-mail + hasło, sesja
w ciasteczkach, dane każdego konta prywatne i odseparowane politykami RLS per operacja i rola.
Trasy pod prefiksem chronionym są niedostępne bez sesji.

Ta paczka nie dodaje ról, nie zmienia granic uprawnień i nie otwiera żadnej powierzchni na
użytkownika niezalogowanego. Wszystkie nowe operacje (regeneracja tygodnia, cofnięcie
akceptacji z poziomu tygodnia, usunięcie dnia z poziomu tygodnia, wydruk) działają na danych
właściciela sesji i dziedziczą istniejące polityki.

**Konsekwencja dla zakresu:** izolacja kont jest w tej paczce *niezmiennikiem do obrony*, nie
przedmiotem zmiany — każda nowa trasa zapisu musi ją egzekwować tak samo jak istniejące.
Zapisane wśród guardraili (faza 3) i w §Constraints & Compatibility (faza 5).

## Success Criteria

### Primary

Nauczyciel prowadzi pełną pętlę **zarządzania** zbudowanym planem, nie wychodząc z widoku,
w którym pracuje: poprawia zbudowany tydzień (regeneruje go z zastępowaniem istniejących dni
albo cofa akceptację i usuwa dzień — z poziomu widoku tygodnia), ogląda efekt w siatce
miesiąca bez wchodzenia w poszczególne dni, i drukuje zaakceptowany tydzień.

Jedno kryterium spinające trzy osie bólu z §Problem Statement — poprawialność, czytelność,
wyjście poza aplikację. Ustalenie użytkownika 2026-09-19.

### Secondary

Wydrukowany tydzień nadaje się do oddania bez obróbki — jest czytelny i kompletny na tyle,
że nauczyciel przekazuje go dalej, nie przepisując niczego do innego narzędzia. Ustalenie
użytkownika 2026-09-19.

### Guardrails

Cztery niezmienniki wskazane przez użytkownika 2026-09-19. Wiążą **każdy** slice paczki,
nie tylko ten, który ich dotyka bezpośrednio:

1. **Izolacja kont.** Plan jednego nauczyciela nigdy nie jest widoczny dla drugiego. Każda
   nowa trasa zapisu i odczytu egzekwuje polityki dostępu tak samo jak istniejące. Ryzyko #4
   w mapie testów; od 2026-09-05 pokryte testem przeglądarkowym na gałęzi głównej.
2. **Zaakceptowany dzień nie ginie po cichu.** Kryterium ochrony zmienia się w tej paczce
   z „nigdy nie niszczy" na „nigdy bez jawnego potwierdzenia, a po potwierdzeniu podmienia
   komplet" — ale cicha utrata zaakceptowanej pracy pozostaje niedopuszczalna w każdym
   wariancie. Potwierdzenie musi być uczciwe co do liczby i stanu dni, nie generyczne.
3. **Protokół licznika generacji przy zapisie partii aktywności.** Partia zapisana dla dnia
   zawsze odpowiada bieżącej generacji tego dnia, a zapis idzie jedną drogą, w jednej
   transakcji. Zobowiązanie zaciągnięte w `S-02`; regeneracja tygodnia je dziedziczy i jest
   pierwszą operacją, która rusza pięć dni naraz.
4. **Bezpieczeństwo treści propozycji.** Żadna propozycja nieodpowiednia dla dzieci 3–6 lat.
   Guardrail z PRD v1, od 2026-09-02 pilnowany bramką na żywych wywołaniach modelu. Żadna
   zmiana w ścieżce generowania ani w promptach nie może go obniżyć.

## Timeline acknowledgment

**Brak bramki czasowej — decyzja świadoma, podjęta 2026-09-19 po przedstawieniu kosztu.**

Koszt został postawiony wprost przed decyzją: sześć pozycji, w tym jedna, która nie jest
zmianą interfejsu (regeneracja tygodnia rusza pięć dni naraz, wymaga transakcji, kolejności
„nowy gotowy, zanim stary znika" i odczytu stanu akceptacji przed operacją), to realnie
więcej niż trzy tygodnie pracy po godzinach. Nazwana została też pułapka brownfieldowa:
system zostawiony w połowie przerobiony jest gorszy niż nietknięty.

Użytkownik wybrał **pełny zakres bez deklarowanego budżetu czasowego** — kamień idzie slice
po slice i zamyka się, gdy wszystkie pozycje są `done`.

**Co tę decyzję broni:** każdy slice jest osobnym folderem zmiany i osobnym PR-em, a merge do
gałęzi głównej jest wydaniem na produkcję. „Połowa przerobionego systemu" nigdy nie leży więc
na gałęzi głównej dłużej niż jeden slice — ryzyko jest ograniczone dyscypliną slice'ów, a nie
budżetem czasu. Warunek: kolejność slice'ów musi respektować zależności (regeneracja tygodnia
przed fazą 3 rolloutu testów; układ przycisków razem z blokadą edycji).

**Konsekwencja dla bramki jakości (faza 7):** `delivery_weeks` nie jest ≤ 3 ani nie jest
liczbą — ta sekcja jest jawnym zapisem, że koszt wypłynął i został przyjęty, a nie obejściem
bramki. Cross-check odnotuje to jako przyjęte ryzyko, nie jako lukę.

## Scope of Change

Zakres zatwierdzony 2026-09-19 — **wszystkie sześć pozycji wchodzi do `M-02`**, nic nie wypada
do `M-03`. Kategorie (`new` / `modified` / `preserved`) i pełne FR-y powstają w fazie 4.

1. `S-07` — podgląd aktywności w siatce miesiąca + powiększony kafelek (mieści cały podtytuł)
2. Regeneracja tygodnia z zastępowaniem istniejących dni, w tym zaakceptowanych
3. Cofnięcie akceptacji dnia z poziomu widoku tygodnia
4. Usunięcie dnia z poziomu widoku tygodnia
5. Blokada edycji przypadkowej dla zaakceptowanego dnia / tygodnia + układ przycisków
   w widoku dnia (cofnięcie akceptacji i usunięcie pod przyciskiem generowania)
6. Wydruk zaakceptowanego tygodnia (dzień na stronę)

## Functional Requirements

Numeracja kontynuuje v1 (FR-001…FR-009 skonsumowane przez `F-01`…`S-03`), żeby odwołania
w zarchiwizowanych slice'ach nie zaczęły wskazywać na co innego. Tag `Change:` per schemat
brownfieldowy: `new` — zdolność nieosiągalna dziś żadną ścieżką; `modified` — istniejące
zachowanie, które się zmienia; `preserved` — zachowanie, które musi przetrwać nietknięte.

### Czytelność siatki miesiąca

- FR-010: Nauczyciel może zobaczyć aktywności zaplanowane na dany dzień bez opuszczania siatki miesiąca. Priority: must-have. Change: new
  > Socrates: Kontrargument uznany za trafny: „dociąganie danych przy najechaniu to burza żądań —
  > 20–22 kafelki, przeciągnięcie kursora przez rząd wywołuje żądanie za żądaniem". Rozstrzygnięcie:
  > FR utrzymany, ale kontrargument przestaje być tematem do researchu i staje się **warunkiem
  > brzegowym** — patrz NFR o zachowaniu podglądu pod szybkim ruchem wskaźnika. Opóźnienie,
  > anulowanie porzuconego żądania i pamięć podręczna pobranych dni nie są opcjonalną optymalizacją.
- FR-011: Nauczyciel widzi w kafelku siatki miesiąca pełny podtytuł dnia, nieucięty. Priority: must-have. Change: modified
  > Socrates: Kontrargument uznany za trafny: „wyższy kafelek wymienia jeden problem czytelności
  > na drugi — miesiąc przestaje mieścić się na ekranie naraz, a to jest cały sens siatki miesiąca".
  > Rozstrzygnięcie: FR utrzymany z **twardym ograniczeniem** — pełny miesiąc pozostaje widoczny bez
  > przewijania na tej samej szerokości ekranu, na której mieści się dziś. Jeśli obie rzeczy nie
  > mieszczą się naraz, ustępuje podtytuł, nie widok miesiąca.

### Regeneracja tygodnia

Pozycja rozbita 2026-09-19 w rundzie Sokratejskiej na połowę bezpieczną i ryzykowną.

- FR-012: Nauczyciel może wygenerować tydzień na nowo, zastępując istniejące dni niezaakceptowane. Priority: must-have. Change: new
  > Socrates: Kontrargument uznany za trafny: „tańszy wariant robi to samo bez ryzyka — regeneruj
  > wyłącznie dni niezaakceptowane, a chcący zmienić wszystko niech najpierw cofnie akceptacje".
  > Rozstrzygnięcie: **pozycja rozbita na dwa FR-y.** Ten niesie połowę bezpieczną i jest must-have.
  > Dzisiejsza blokada pomija każdy dzień z *jakimkolwiek* planem, także roboczym szkicem — więc
  > nawet ta połowa jest nową zdolnością, nie zmianą komunikatu.
- FR-013: Nauczyciel może rozszerzyć zastępowanie na dni zaakceptowane. Priority: nice-to-have. Change: new
  > Socrates: Ten FR **jest** wynikiem kontrargumentu do FR-012. Zachowuje intencję z roadmapy
  > („nauczyciel nie ma wchodzić w pięć dni po kolei"), ale oddaje jej najcięższy wariant jako
  > nice-to-have: kasuje hurtowo jedyny stan, który człowiek świadomie oznaczył jako skończony,
  > w systemie, który nie ma cofania nigdzie (`S-02` usunął undo świadomie, `S-05` kasuje twardo).
  > Kamień domyka się bez niego.
- FR-014: Nauczyciel przed zastąpieniem widzi potwierdzenie podające, ile dni zostanie zastąpionych i ile z nich jest zaakceptowanych. Priority: must-have. Change: new
  > Socrates: Kontrargumentów rozważono trzy — cienka bariera dialogu, odruchowe „OK", koszt odczytu
  > stanu tylko po to, by zbudować zdanie. Żadnego nie uznano; FR stoi w obecnym brzmieniu. Uczciwa
  > treść potwierdzenia jest jawną decyzją z roadmapy (2026-08-30), nie domysłem.

### Zarządzanie planem z poziomu tygodnia

- FR-015: Nauczyciel może cofnąć akceptację dnia z poziomu widoku tygodnia. Priority: must-have. Change: new
  > Socrates: Kontrargument uznany za trafny: „cofanie akceptacji bez widoku treści to klikanie
  > w ciemno — w tygodniu nauczyciel widzi kafelki, nie pełne aktywności". Rozstrzygnięcie: FR
  > utrzymany — operacja jest odwracalna (dzień można zaakceptować ponownie), więc pomyłka kosztuje
  > jedno kliknięcie, nie utratę pracy — ale z warunkiem: **operacja musi jednoznacznie nazywać
  > dzień, którego dotyczy**, a nie polegać na tym, że nauczyciel trafił w właściwy kafelek.
- FR-016: Nauczyciel może usunąć zapisany plan dnia z poziomu widoku tygodnia. Priority: must-have. Change: new
  > Socrates: Kontrargumenty rozważone — skrócenie drogi do kasowania twardego, zbieżność intencji
  > z regeneracją tygodnia, kafelek pustoszejący bez śladu. Żadnego nie uznano; FR stoi w obecnym
  > brzmieniu. Potwierdzenie kasowania jest już częścią zachowania z `S-05` i obowiązuje tu tak samo.

### Ochrona zaakceptowanej pracy

- FR-017: Nauczyciel edytujący treść dnia zaakceptowanego dostaje potwierdzenie, a po zgodzie dzień traci stan zaakceptowania. Priority: must-have. Change: modified
  > Socrates: Kontrargument uznany za trafny i **FR przepisany**: „granica «edycja przypadkowa vs
  > operacja jawna» jest nie do obronienia — system broniłby poprawić literówkę, a pozwalał
  > skasować tydzień". Pierwotne brzmienie (blokada edycji w miejscu, operacje jawne dostępne —
  > decyzja z roadmapy 2026-08-30) zastąpione jedną spójną regułą: **jawność proporcjonalna do
  > skutku**. Nic nie jest zakazane; wszystko, co niszczy pracę oznaczoną jako gotowa, pyta.
  > Zamiast trzech kroków (cofnij akceptację → popraw → zaakceptuj ponownie) nauczyciel poprawia
  > i potwierdza. ⚠️ To **odwraca decyzję zapisaną w roadmapie** — patrz §Open Questions.
- ~~FR-018: układ przycisków w widoku dnia~~ — **wycofany z listy FR 2026-09-19.** Werdykt
  użytkownika: „przycisk ma być wyżej" to układ ekranu, nie zdolność — obie operacje są dziś
  dostępne, a FR sugerowałby weryfikację, której nie da się zasertować inaczej niż wzrokowo.
  Przeniesione do §Constraints & Compatibility jako wiążący warunek układu. **Numer FR-018 nie
  jest reużywany** — luka w numeracji jest celowa i trołowalna.

### Wydruk

- FR-019: Nauczyciel może wydrukować tydzień w postaci czytelnej na papierze. Priority: must-have. Change: new
  > Socrates: Kontrargument uznany za trafny: „układ «dzień na stronie» wybrano, zanim ktoś
  > zapytał, co dokładnie nauczyciel oddaje i komu". **FR rozluźniony** — zobowiązanie dotyczy
  > czytelności na papierze, nie konkretnego układu. Wybór dzień-na-stronie vs tydzień-na-stronie
  > ląduje w §Open Questions i należy do slice'a, bo zależy od odbiorcy wydruku, którego nie
  > ustaliliśmy.
- FR-020: Wydruk obejmuje wszystkie dni robocze tygodnia, a dni niezaakceptowane są na nim widocznie oznaczone jako szkic roboczy. Priority: must-have. Change: new
  > Socrates: Kontrargumenty rozważone — oznaczony szkic i tak zostanie oddany; napięcie
  > z kryterium Secondary („nadaje się do oddania bez obróbki"); pusta strona dla dnia bez planu.
  > Żadnego nie uznano; FR stoi w obecnym brzmieniu.

**Wycofane z listy FR w rundzie Sokratejskiej 2026-09-19 (dwie pozycje).**

1. „Nauczyciel zachowuje dotychczasowy
tydzień w całości, gdy generowanie zastępujące nie dojdzie do skutku" (dawne FR-014). Werdykt
użytkownika: to własność transakcji, nie zdolność użytkownika — jako FR zajęłoby numer, którego
żaden slice nie będzie śledził. Przeniesione do §Non-Functional Requirements; zobowiązanie nie
znika, zmienia miejsce.
2. Układ przycisków w widoku dnia (dawne FR-018) — patrz wyżej; przeniesione do
   §Constraints & Compatibility.

**Bilans rundy:** z jedenastu FR-ów przetrwało dziesięć. Jeden podzielony na bezpieczny
must-have i ryzykowny nice-to-have (FR-012/FR-013), dwa przepisane po przyjęciu kontrargumentu
(FR-017 — odwrócenie decyzji z roadmapy; FR-019 — rozluźnienie), dwa wycofane do innych sekcji,
trzy utrzymane z kontrargumentem zapisanym i odrzuconym (FR-014, FR-016, FR-020), dwa utrzymane
z dopisanym warunkiem brzegowym (FR-010, FR-011, FR-015).

## User Stories

### US-02: Nauczyciel poprawia zbudowany tydzień i oddaje go na papierze

- **Given** zalogowany nauczyciel z tygodniem, który ma pięć zaplanowanych dni, w tym trzy zaakceptowane
- **When** uznaje, że motyw tygodnia jest nietrafiony, i uruchamia generowanie tygodnia z nowym hasłem
- **Then** widzi potwierdzenie mówiące wprost, że zastąpi pięć dni, w tym trzy zaakceptowane; po potwierdzeniu dostaje komplet nowych dni, a gdy generowanie zawiedzie — poprzedni tydzień w niezmienionej postaci

**Co było inaczej przedtem:** generowanie tygodnia po cichu pomijało każdy dzień, który miał
jakikolwiek plan — także roboczy szkic. Nauczyciel nie dostawał ani nowych dni, ani informacji,
że czegoś nie zrobiono; żeby zmienić motyw tygodnia, musiał wejść w pięć dni po kolei.

#### Acceptance Criteria

- Potwierdzenie podaje liczbę dni do zastąpienia i liczbę zaakceptowanych wśród nich; odmowa zostawia tydzień nietknięty
- Po potwierdzeniu żaden dzień tygodnia nie zostaje w stanie mieszanym — albo komplet nowy, albo komplet poprzedni
- Nieudane generowanie nie zostawia dnia pustego ani w stanie pośrednim

### US-03: Nauczyciel odczytuje plan miesiąca bez wchodzenia w dni

- **Given** zalogowany nauczyciel w siatce miesiąca z zaplanowanymi dniami
- **When** zatrzymuje się na kafelku konkretnego dnia
- **Then** widzi aktywności zaplanowane na ten dzień w miejscu, bez opuszczania siatki; kliknięcie kafelka nadal otwiera pełny widok dnia

**Co było inaczej przedtem:** kafelek pokazywał hasło i ucięty podtytuł; jedyną drogą do treści
było wejście w dzień.

#### Acceptance Criteria

- Podgląd jest wyłącznie do odczytu — żadnej edycji w miejscu
- Podgląd jest osiągalny nie tylko wskaźnikiem myszy; nauczyciel bez myszy dochodzi do tej samej treści
- Kafelek mieści pełny podtytuł dnia, bez ucięcia

## Business Logic Changes

**Reguła rdzeniowa bez zmian.** Aplikacja nadal zamienia hasło nauczyciela w konkretne,
gotowe do użycia propozycje aktywności dla dzieci 3–6 lat, a szkic tygodnia nadal rozkłada
jedno hasło na pięć rozłącznych tematów dziennych. Żadne FR tej paczki nie dotyka doboru
treści ani promptu.

Zmieniają się **dwie reguły wokół rdzenia**:

1. **Kiedy generowanie tygodnia pomija dzień.**
   - Dziś: generowanie tygodnia pomija każdy dzień, który ma *jakikolwiek* plan — także
     roboczy szkic, którego nauczyciel nigdy nie zaakceptował. Pominięcie jest ciche.
   - Po zmianie: generowanie tygodnia **zastępuje** dni niezaakceptowane po jawnym
     potwierdzeniu podającym ich liczbę (FR-012, FR-014); dni zaakceptowane pozostają poza
     zasięgiem, dopóki nauczyciel nie rozszerzy operacji jawnie (FR-013, nice-to-have).
2. **Co znaczy „dzień zaakceptowany".**
   - Dziś: akceptacja jest etykietą stanu, ustawianą i zdejmowaną wyłącznie jawnie. Edycja
     treści nie rusza tej etykiety — zaakceptowany dzień może mieć treść zmienioną po akceptacji
     i nadal wyglądać na zatwierdzony.
   - Po zmianie: akceptacja staje się **stwierdzeniem o konkretnej treści**. Edycja treści dnia
     zaakceptowanego pyta o zgodę i po niej zdejmuje akceptację (FR-017). Reguła nadrzędna dla
     całej paczki: **jawność proporcjonalna do skutku** — nic nie jest zakazane, ale wszystko,
     co niszczy pracę oznaczoną jako gotowa, pyta.

## Non-Functional Requirements

Istniejące NFR z PRD v1 obowiązują dalej i nie są tu powtarzane (widoczny postęp operacji
generowania, prywatność treści planu, polski interfejs). Ta paczka dokłada cztery:

- **Nieukończone zastąpienie tygodnia nie zostawia śladu.** Gdy generowanie zastępujące nie
  dochodzi do skutku, nauczyciel zastaje tydzień w postaci sprzed operacji — nie częściowo
  podmieniony i nie pusty. _(Pierwotnie zapisane jako FR; przeniesione tutaj 2026-09-19
  werdyktem użytkownika: to własność transakcji, nie zdolność użytkownika.)_
- **Podgląd dnia zachowuje się pod szybkim ruchem wskaźnika.** Przeciągnięcie kursora przez
  rząd kafelków nie generuje żądania na każdy mijany dzień, a treść raz pobranego dnia nie
  jest pobierana po raz drugi w tej samej sesji oglądania.
- **Siatka miesiąca pozostaje widoczna naraz.** Pełny miesiąc mieści się bez przewijania na tej
  samej szerokości ekranu, na której mieści się dziś. Przy konflikcie ustępuje podtytuł dnia,
  nie widok miesiąca.
- **Podgląd jest osiągalny bez wskaźnika myszy.** Nauczyciel posługujący się wyłącznie
  klawiaturą dochodzi do tej samej treści co nauczyciel z myszą.

## Constraints & Compatibility

**Zachowanie wsteczne — adresy i powierzchnie.** Trzy istniejące ekrany planowania (dzień,
tydzień, miesiąc) zachowują dotychczasowe adresy i punkty wejścia. Kliknięcie kafelka w siatce
miesiąca nadal otwiera widok dnia — podgląd (FR-010) jest warstwą na tej ścieżce, nie jej
zamiennikiem.

**Cztery niezmienniki, które wiążą każdy slice** (pełne brzmienie: §Success Criteria → Guardrails):
izolacja kont, brak cichej utraty zaakceptowanej pracy, protokół licznika generacji przy zapisie
partii aktywności, bezpieczeństwo treści propozycji.

**Migracja danych.** Żadne FR nie wymaga wprost zmiany schematu. Gdyby któryś slice dodał
kolumnę do tabeli planów, musi świadomie rozstrzygnąć jej uprawnienia zapisu — grant UPDATE
jest w tym projekcie wystawiany per kolumna po nazwie, więc kolumna dodana bez tego kroku
kończy zapis błędem, który warstwa serwisowa raportuje jako błąd konfiguracji, nie jako brak
uprawnień. To pułapka, którą wcześniejsza migracja musiała rozbrajać jawnie.

**Semantyka zastanych danych.** FR-017 zmienia znaczenie stanu „zaakceptowany" dla wierszy,
które już są w bazie — zostały zaakceptowane pod regułą „etykieta stanu", a będą czytane pod
regułą „stwierdzenie o konkretnej treści". Zmiana nie wymaga przepisania danych, ale wymaga
świadomości, że część istniejących zaakceptowanych dni mogła być edytowana po akceptacji.

**Warunek układu (dawne FR-018).** Slice, który rusza operacje akceptacji w widoku dnia, ustawia
przy okazji cofnięcie akceptacji i usunięcie dnia w ich docelowym miejscu — przy przycisku
generowania. Warunek wiąże **ten** slice, żeby te same przyciski nie były przesuwane dwa razy;
nie jest osobną pozycją zakresu. Przy rozmieszczeniu obowiązuje ostrożność: usunięcie planu jest
nieodwracalne, a przycisk generowania bywa klikany wielokrotnie w jednej sesji.

**Kolejność względem rolloutu testów.** Faza 3 rolloutu (ochrona zapisu i własności) idzie **po**
slice'ie regeneracji tygodnia. Wcześniej zabetonowałaby w asercjach semantykę „nigdy nie
niszczy", którą FR-012 i FR-017 celowo zastępują semantyką „nigdy bez jawnego potwierdzenia".

## Non-Goals

- **Bez cofania operacji (undo).** Paczka dokłada potwierdzeń, nie historii. Kasowanie pozostaje
  twarde, bez kosza — zgodnie z decyzją `S-05`. Potwierdzenie jest jedyną barierą i to jest
  świadomie przyjęte ryzyko, nie przeoczenie.
- **Bez edycji treści z poziomu podglądu w siatce miesiąca.** Podgląd jest wyłącznie do odczytu;
  edycja pozostaje w widoku dnia.
- **Bez wstępnego pobierania danych całego miesiąca.** Podgląd dociąga dzień na żądanie;
  pobieranie z wyprzedzeniem (np. bieżącego tygodnia) to możliwa późniejsza optymalizacja,
  nie zakres tej paczki.
- **Bez zmiany promptu i doboru treści.** Żadne FR nie dotyka jakości generowania ani rodzajów
  aktywności — to osobna pozycja, wymagająca odwrócenia §Non-Goals z PRD v1.
- **Bez zmian w modelu dostępu.** Jedna rola, model płaski, RLS per konto — bez rośnięcia
  o role ani o współdzielenie planów między kontami.
- **Bez spłaty długu PRD za `S-04`, `S-05` i `S-08`.** Decyzja użytkownika 2026-09-19: PRD v2
  obejmuje wyłącznie `M-02`. Wsteczne dopisywanie FR do wydanego kodu było dokładnie tym,
  czego unikano, zamykając `M-01` skróconym zakresem. Konsekwencja jest realna — patrz
  §Open Questions.

## Open Questions

1. **Układ wydruku — dzień na stronie czy tydzień na stronie?** Wyjaśnione w rundzie
   Sokratejskiej jako wybór dokonany przedwcześnie: zależy od tego, komu i w jakiej formie
   nauczyciel oddaje plan, a tego nie ustaliliśmy. Właściciel: Janusz. Blokuje: nie —
   rozstrzygnięcie należy do slice'a wydruku (FR-019).
2. **Odwrócenie decyzji z roadmapy o blokadzie edycji.** Roadmapa (2026-08-30) zapisała:
   „blokada «tydzień zaakceptowany» dotyczy edycji przypadkowej; operacje jawne pozostają
   dostępne". FR-017 zastępuje to regułą „potwierdzenie zamiast zakazu", bo granica między
   edycją przypadkową a jawną okazała się nie do obronienia. Właściciel: Janusz. Blokuje: nie —
   ale zapis w `roadmap.md` §Kandydaci mu dziś przeczy i zniknie przy regeneracji roadmapy,
   więc to shape-notes są nośnikiem tej decyzji.
3. **Dług PRD za `S-04`, `S-05` i `S-08` pozostaje otwarty.** Open Roadmap Questions #3 nie
   zostaje domknięte przez PRD v2 — decyzja z 2026-09-19. Trzy zarchiwizowane slice'y zostają
   z pustą rubryką „PRD refs". Właściciel: Janusz. Blokuje: nie. **Wymaga poprawki w dwóch
   plikach**, które dziś obiecują spłatę w v2: `next-actions.md` Krok 3 i `roadmap.md`
   §Open Roadmap Questions #3.
3a. _Poprawione 2026-09-19:_ `next-actions.md` Krok 3 i `roadmap.md` §Open Roadmap Questions #3
   już nie obiecują spłaty w v2 — oba niosą teraz decyzję o odroczeniu.

4. **Reset hasła** — przeniesione z v1, wciąż otwarte. Właściciel: decyzja produktowa.
   Blokuje: nie dla `M-02`.
5. **Limit regeneracji** — przeniesione z v1 i **podniesione przez tę paczkę**: regeneracja
   tygodnia z zastępowaniem mnoży wywołania modelu przez pięć na jedno kliknięcie, a FR-012
   czyni tę operację łatwiejszą do powtórzenia niż była. Właściciel: decyzja
   techniczno-biznesowa. Blokuje: nie.

## Quality cross-check

Uruchomiony 2026-09-19 po fazie 6. Siedem elementów bramki brownfieldowej:

| Element | Stan |
| --- | --- |
| Access Control | obecny — §Access Control Changes, „bez zmian, obecny model zachowany" |
| Business Logic | obecny — dwie reguły delty, każda w postaci „dziś X, po zmianie Y"; reguła rdzeniowa jawnie nietknięta |
| Artefakty projektu | obecne |
| Koszt czasowy przyjęty | **obecny w innym kształcie — patrz luka 1** |
| Non-Goals | obecne — sześć pozycji, w tym dwie dopisane w trakcie sesji |
| Zachowanie chronione | obecne — §Constraints & Compatibility + cztery niezmienniki w Guardrails |
| Persona / zakres zmiany | obecne — persona bez zmian, delta doświadczenia nazwana |

**Status: `warned`.** Wszystkie siedem elementów jest obecnych, ale dwie rzeczy przechodzą
dalej jako świadomie przyjęte ryzyko, nie jako domknięcia. Nazywam je po imieniu, bo
ogólnikowe „PRD ma luki" unieważnia bramkę:

1. **Bramka czasowa nie istnieje.** `delivery_weeks` jest `null`, nie liczbą — użytkownik
   wybrał tryb „slice po slice, ile zajmie" po przedstawieniu kosztu (§Timeline acknowledgment).
   Konsekwencja: **nic w tym projekcie nie powie, że `M-02` trwa za długo.** Nie ma daty,
   względem której opóźnienie by się mierzyło. Obroną jest dyscyplina slice'ów — każdy jest
   osobnym wydaniem — a nie budżet.
2. **Dług PRD za `S-04`, `S-05` i `S-08` zostaje otwarty** (§Open Questions #3). Trzy
   zarchiwizowane slice'y zostają z pustą rubryką „PRD refs", a dwa pliki w `context/foundation/`
   obiecują dziś spłatę w v2 — wymagają poprawki, inaczej repo niesie obietnicę, która nie
   zostanie dotrzymana.

Obie luki trafiają do `## Open Questions` PRD v2 przez `/10x-prd`.

## Forward: technical-roadmap

Należy do downstreamu, nie do PRD — zapisane, żeby nie zginęło przy regeneracji roadmapy:

- **Kolejność slice'ów.** `S-07` (FR-010, FR-011) jest jedyną pozycją z zamkniętymi decyzjami
  i dobrym rozpędem na start. Regeneracja tygodnia (FR-012, FR-014) jest najcięższa i reszta
  paczki się o nią opiera. Układ przycisków wchodzi w slice akceptacji (FR-017), nie osobno.
- **Faza 3 rolloutu testów idzie po regeneracji tygodnia** — uzasadnienie w
  §Constraints & Compatibility.
- **Pytania do researchu kodowego przy `S-07`:** opóźnienie przed pobraniem, anulowanie
  porzuconego żądania, pamięć podręczna pobranych dni. Po rundzie Sokratejskiej nie są to
  tematy do zbadania, tylko warunki brzegowe do spełnienia (NFR).
- **`FR-013` jako zawór bezpieczeństwa.** Jedyny nice-to-have w paczce. Jeśli kamień się
  rozciągnie, to jest pozycja do odpuszczenia — bez niej `M-02` nadal domyka swój Primary.
