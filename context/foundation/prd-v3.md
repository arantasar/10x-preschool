---
project: "10xPreschool"
version: 3
status: draft
created: 2026-10-01
context_type: brownfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  delivery_weeks: null       # świadomie bez bramki czasowej — patrz ## Open Questions #9
  hard_deadline: null
  after_hours_only: true
---

<!-- Kamień M-03 „Gotowi do sprzedaży”. Źródło: context/foundation/shape-notes.md (2026-10-01),
     wejście sesji: monetization.md (decyzje 2026-09-29), next-actions.md Krok 12. -->

## Current System Overview

**Cel systemu:** 10xPreschool zamienia krótkie hasło wpisane przez nauczyciela przedszkolnego
w konkretny plan aktywności dla dzieci 3–6 lat — na dzień, tydzień i miesiąc — generowany przez LLM.

**Architektura:** aplikacja SSR renderowana na serwerze, z wyspami interaktywnymi tam, gdzie
potrzebny jest stan; warstwa serwisowa oddzielona od tras API; baza relacyjna z politykami dostępu
egzekwowanymi po stronie bazy. Wdrożenie na platformie edge — merge do gałęzi głównej jest wydaniem
na produkcję, bez kroku zatwierdzenia.

**Stack:** Astro 6 (SSR) + React 19 (wyspy), Tailwind 4, shadcn/ui, Supabase (auth e-mail + hasło
z sesją w ciasteczkach, Postgres z RLS per operacja i rola), OpenRouter jako dostawca LLM,
Cloudflare Workers. Testy: jednostkowe i trasy na atrapie, pgTAP i trasy na prawdziwym kliencie
(doradczy job `db` w CI), e2e Playwright (poza CI), bramka bezpieczeństwa treści na żywych
wywołaniach modelu — **zawieszona od 2026-09-19 z powodu kosztu**.

**Użytkownicy dziś:** jedna rola — nauczyciel/ka przedszkolny/a. Model płaski, skala mała, dane
każdego konta prywatne i odseparowane przez RLS. Wszystko jest darmowe i bez limitów.

**Co system robi dzisiaj (po `M-01` i `M-02`):** generowanie dnia i tygodnia z jednego hasła
(tydzień = szkic pięciu rozłącznych tematów + pięć dni); regeneracja tygodnia z zastępowaniem,
także dni zatwierdzonych po jawnej zgodzie; edycja, zatwierdzanie, cofanie zatwierdzenia i usuwanie
dnia (także z widoku tygodnia); podgląd aktywności w siatce miesiąca; poprawka pojedynczej
aktywności poleceniem dla modelu (`S-15`); druk tygodnia (dzień na stronę albo tydzień na stronie)
i miesiąca (siatka albo tygodniami). Źródło: `monetization.md` §1.

## Problem Statement & Motivation

**Produktu nie da się dziś sprzedać, a części braków nie da się bronić nawet bez sprzedaży.**
Ból ma dwa równorzędne źródła (ustalenie użytkownika 2026-10-01):

1. **Właściciel.** Produkt nie zarabia. Bramka bezpieczeństwa treści — jedyny automatyczny strażnik
   guardraila „żadna propozycja nieodpowiednia dla dzieci 3–6 lat” — jest wstrzymana od 2026-09-19,
   bo jej przebiegi kosztują. Nie ma planów, cennika, płatności ani limitów; nie ma też warunków,
   bez których sprzedaż jest nieodpowiedzialna (`monetization.md` §6).
2. **Obecne nauczycielki.** Braki bolą już dziś, niezależnie od sprzedaży: nie ma resetu hasła
   (utrata hasła = utrata dostępu do planów), nie ma kanału kontaktu, nie ma regulaminu ani
   informacji, czym jest usługa.

**Dlaczego teraz:** decyzje monetyzacyjne zapadły 2026-09-29 (`monetization.md` §Decyzje: Free +
Basic 19,99 zł teraz, Pro później, B2C, JDG). `M-02` jest zamknięty, design (Krok 10) i faza 3
testów (Krok 6) są na produkcji — kolejka po `M-02` stawia ten kamień jako następny.

**Chęć płacenia jest niezweryfikowana.** Walidacja (Krok 11: rozmowy, dane z produkcji) nie została
zrobiona przed tą sesją — decyzja użytkownika 2026-10-01. Dlatego kamień **sam niesie walidację**:
cennik z zapisem na cenę założycielską (fake door) idzie przed integracją płatności, a integracja
ma bramę wejścia w postaci wyniku zapisów. Gdy wynik jest słaby, kamień zamyka się bez płatności,
a decyzja wraca do właściciela.

**Rdzeń kamienia nie zależy od wyniku fake door.** Reset hasła, regulamin i polityka prywatności,
FAQ, kontakt, limity i odwieszona bramka są warte zrobienia także wtedy, gdy nikt nie zechce
płacić — to braki same w sobie. Idą przed fake door. (Ustalenie użytkownika 2026-10-01, odpowiedź
na pytanie „co, jeśli to zły problem”.)

**Koszt obejścia dzisiaj:** nauczycielka, która zapomni hasła, nie ma samodzielnej drogi powrotu;
nikt nie ma jak zgłosić problemu; każda zmiana promptu albo modelu wchodzi na produkcję oceniona
tylko ręcznie (`S-15` już tak wszedł).

**Charakter zmiany:** nowy moduł (stan planu konta, uprawnienia, limity, płatności) plus poprawki
rdzenia (reset hasła, strony informacyjne i prawne, kontakt, odwieszenie bramki).

## User & Persona

**Rola bez zmian:** nauczyciel/ka przedszkolny/a — jedyna rola, model płaski, B2C (płaci
nauczycielka, nie placówka — `monetization.md` §Decyzje #4).

**Co się zmienia:** konto dostaje **stan planu**. Ta sama osoba może być w okresie próbnym (pierwszy
miesiąc pełny), na planie darmowym, na Basic albo na cenie założycielskiej. Stan decyduje o ilości,
nie o dostępie do istniejących danych.

**Grupa szczególna:** obecni użytkownicy sprzed paywalla — mają zbudowane plany i trafią na nowe
zasady bez własnego wyboru; `monetization.md` §4.4 przewiduje dla nich prezent (cena założycielska
plus okres Basic gratis). Szczegóły: FR-035, FR-036.

**Nowi użytkownicy:** kamień ma ich przyciągać (cennik, stopka na darmowym wydruku jako kanał), ale
nie wprowadza nowej roli — placówka i dyrektor zostają poza zakresem.

## Success Criteria

### Primary

Nauczycielka może się samodzielnie posługiwać kontem i usługą bez pomocy właściciela, a produkt
mierzy, czy ktoś zapłaci — przepływ zatwierdzony przez użytkownika 2026-10-01:

1. Odwiedzający bez konta czyta cennik, regulamin, politykę prywatności i FAQ; może napisać przez
   formularz kontaktowy.
2. Nauczycielka, która zapomniała hasła, wraca do konta przez e-mail i zastaje swoje plany.
3. Zalogowana zmienia hasło albo usuwa konto razem z planami.
4. Generuje jak dziś; niewidoczny limit fair use zatrzymuje dopiero nadużycie, z jasnym komunikatem.
5. Zmiana promptu albo modelu znów przechodzi przez bramkę bezpieczeństwa treści.
6. Cennik → „Zarezerwuj cenę założycielską” → uczciwe potwierdzenie zapisu.

**Rozszerzenie warunkowe (krok 7):** gdy w ciągu 4 tygodni od uruchomienia zapisu jest **≥ 10
zapisów kont aktywnych** (kont, które faktycznie planowały w aplikacji — zapisy anonimowe się nie
wliczają; ustalenie z rundy Sokratejskiej przy FR-029), kamień obejmuje płatności — Free/Basic,
okres próbny, paywall przy drugim tygodniu, prezent dla obecnych kont. Gdy próg nie pada, kamień
zamyka się na kroku 6, a decyzja o płatnościach wraca do właściciela z danymi w ręku.

### Secondary

**Obecni użytkownicy zostają.** Po wejściu fair use i nowych stron żadne aktywne konto nie odchodzi
z powodu zmian kamienia — mierzone aktywnością miesięczną przed i po. (Ustalenie 2026-10-01.)

### Guardrails

Cztery niezmienniki z `M-02` przechodzą w całości: izolacja kont, zatwierdzony dzień nie ginie bez
jawnej zgody, protokół licznika generacji przy zapisie partii, bezpieczeństwo treści propozycji.
Ten kamień dokłada trzy (ustalenie użytkownika 2026-10-01):

1. **Limit nie blokuje normalnego użytku.** Typowy miesiąc planowania, z poprawkami, nigdy nie
   trafia na fair use, a błąd licznika nie może zatrzymać generowania.
2. **Odwieszona bramka obejmuje każdy dopuszczony model i każdy tryb** generowania (dzień,
   tydzień, poprawka aktywności) — reguła z `lessons.md`. Bramka, która przechodzi zielono na
   części, nie jest odwieszona.
3. **Płatności kompletem albo wcale.** Na produkcję nie trafia płatność bez tego, co ją czyni
   bezpieczną dla klienta (zarządzanie subskrypcją, zwrot, obsługa wygaśnięcia). Połowa integracji
   jest gorsza niż jej brak, bo dotyczy cudzych pieniędzy.

**Blast radius wskazany przez użytkownika:** licznik wspólny dla wszystkich trybów generowania
(błąd zatrzymuje generowanie naraz wszędzie) i odwieszenie bramki (zielony przebieg, który nie
pilnuje wszystkiego) — oba podniesione do guardraili 1 i 2.

## User Stories

Numeracja kontynuuje v2 (US-01…US-03).

### US-04: Nauczycielka wraca do konta po zapomnieniu hasła

- **Given** nauczycielka z kontem i zaplanowanym miesiącem, która nie pamięta hasła
- **When** prosi o reset ze strony logowania i postępuje według wiadomości e-mail
- **Then** ustawia nowe hasło, loguje się i zastaje wszystkie swoje plany

**Co było inaczej przedtem:** nie było żadnej samodzielnej drogi powrotu do konta.

#### Acceptance Criteria

- Strona resetu mówi, gdzie szukać wiadomości i co zrobić, gdy nie przyjdzie (FR-022)
- Plany konta po resecie są nietknięte

### US-05: Nauczycielka rezerwuje cenę założycielską

- **Given** odwiedzający albo zalogowana nauczycielka na stronie cennika
- **When** klika „Zarezerwuj cenę założycielską” i podaje e-mail
- **Then** widzi potwierdzenie: płatności jeszcze nie działają, jest zapisana, dostanie wiadomość

**Co było inaczej przedtem:** nie było ani cennika, ani sposobu wyrażenia chęci zapłaty.

#### Acceptance Criteria

- Żadna płatność nie jest symulowana; potwierdzenie mówi wprost, że płatności jeszcze nie działają
- Zapis jest zgodą na kontakt e-mailowy w sprawie ceny założycielskiej

## Scope of Change

Numeracja FR kontynuuje v2 (FR-010…FR-021 skonsumowane przez `M-02`; FR-018 celowo pusty).
Kategorie per schemat brownfieldowy: `[new]` — zdolność nieosiągalna dziś żadną ścieżką;
`[modified]` — istniejące zachowanie, które się zmienia; `[preserved]` — zachowanie, które musi
przetrwać nietknięte.

**„Warunkowe”** = must-have, który wchodzi wyłącznie po przejściu bramy: ≥ 10 zapisów kont
aktywnych na cenę założycielską w ciągu 4 tygodni od uruchomienia zapisu (§Success Criteria). Bez
bramy kamień domyka się bez nich.

### Konto

- [new] FR-022: Nauczyciel może odzyskać dostęp do konta po zapomnieniu hasła, przez e-mail. Priority: must-have
  > Socrates: Kontrargument uznany za trafny: „wiadomość ląduje w spamie — część nauczycielek (skrzynki
  > szkolne, filtry) nie dostanie linku, więc reset nie domyka problemu”. Rozstrzygnięcie: FR utrzymany
  > z **warunkiem** — strona resetu mówi, gdzie szukać wiadomości i co zrobić, gdy nie przyjdzie;
  > ścieżką zapasową jest formularz kontaktowy (FR-026).
- [new] FR-023: Zalogowany nauczyciel może zmienić hasło; zmiana wylogowuje wszystkie pozostałe sesje tego konta. Priority: must-have
  > Socrates: Kontrargument uznany za trafny i **FR przepisany**: „zmiana hasła po podejrzeniu włamania
  > nie pomaga, jeśli otwarte sesje — np. na komputerze w przedszkolu — działają dalej”. Pozostałe
  > urządzenia tracą dostęp po zmianie hasła.
- [new] FR-024: Nauczyciel może usunąć swoje konto wraz ze wszystkimi planami. Priority: must-have
  > Socrates: Kontrargument uznany za trafny: „po wejściu płatności usunięcie konta z aktywną subskrypcją
  > zostawia płatność, której nikt nie może anulować”. Rozstrzygnięcie: FR utrzymany z **warunkiem** —
  > usunięcie konta z aktywną subskrypcją ją kończy, a potwierdzenie mówi o tym wprost. Warunek wiąże
  > od wejścia płatności (FR-032…FR-034).

### Informacja i kontakt

- [new] FR-025: Odwiedzający bez konta może przeczytać regulamin, politykę prywatności i FAQ. Priority: must-have
  > Socrates: Kontrargumenty rozważone — treść prawna zależna od księgowego/prawnika, regulamin do
  > przepisania przy płatnościach, FAQ bez zadanych pytań. Żadnego nie uznano; FR stoi w obecnym
  > brzmieniu.
- [new] FR-026: Odwiedzający, z kontem lub bez, może wysłać wiadomość do właściciela przez formularz kontaktowy. Priority: must-have
  > Socrates: Kontrargument uznany za trafny: „otwarty formularz bez konta będzie zasypywany mimo
  > ochrony; każda wiadomość to czas właściciela na przesianie”. Rozstrzygnięcie: FR utrzymany, a
  > kontrargument staje się **NFR** (§Constraints & Compatibility → Warunki jakościowe zmiany) —
  > wiadomość automatu nie dociera do właściciela, prawdziwa nie ginie.

### Limity

- [modified] FR-027: Nauczyciel, który przekroczy limit fair use, dostaje zamiast wyniku generowania komunikat mówiący, kiedy generowanie znów będzie możliwe, i wskazujący kontakt na wypadek pomyłki. Priority: must-have
  > Socrates: Kontrargument uznany za trafny i **FR przepisany**: „przed płatnościami komunikat nie ma
  > czego zaproponować — nauczycielka nie wie, kiedy limit się odnowi ani co zrobić”. Komunikat podaje
  > termin powrotu i ścieżkę kontaktu.

### Walidacja sprzedaży

- [new] FR-028: Odwiedzający może zobaczyć cennik planów Darmowy i Basic z cenami. Priority: must-have
  > Socrates: Kontrargument uznany za trafny i **FR zawężony**: „Pro «wkrótce» bez daty i funkcji
  > obiecuje coś, czego kamień nie dowozi”. Cennik pokazuje tylko Darmowy i Basic; Pro pojawi się,
  > gdy będzie miał własne funkcje (`M-04`).
- [new] FR-029: Odwiedzający może zapisać się na cenę założycielską i dostaje potwierdzenie, że płatności jeszcze nie działają. Priority: must-have
  > Socrates: Kontrargument uznany za trafny: „zapis jest tani, zapłata droga — 10 zapisów nie dowodzi
  > 10 płacących”. Rozstrzygnięcie: FR utrzymany, ale **zmienia się brama płatności** — liczą się
  > wyłącznie zapisy kont, które faktycznie planowały w aplikacji. Zapis anonimowy zostaje dostępny,
  > ale do progu się nie wlicza. Definicja „konta aktywnego” — §Open Questions #2.

### Płatności (warunkowe)

- [new] FR-030: Nowe konto dostaje pierwszy miesiąc od rejestracji z pełnym zakresem Basic, bez podawania karty. Priority: must-have (warunkowe)
  > Socrates: Kontrargument uznany za trafny, **ryzyko przyjęte**: „bez karty nic nie powstrzymuje
  > nowego konta na nowy adres co miesiąc”. FR bez zmian — nadużycie kosztuje grosze LLM
  > (`monetization.md` §5), a wymaga nowej skrzynki co miesiąc i porzucenia zbudowanych planów.
  > Zapisane jako znane ograniczenie.
- [new] FR-031: Nauczyciel na planie darmowym może zaplanować pięć dni roboczych w miesiącu kalendarzowym (dzień liczy się do swojego miesiąca); próba zaplanowania kolejnego pokazuje cennik zamiast generowania. Priority: must-have (warunkowe)
  > Socrates: Kontrargument uznany za trafny i **FR przepisany**: „tydzień przecinający dwa miesiące —
  > do którego się liczy?”. Limit liczy dni, nie tygodnie (jednostka z `monetization.md` §4.3);
  > nauczycielce komunikujemy go jako „tydzień”.
- [new] FR-032: Nauczyciel może wykupić Basic jako subskrypcję kartą, roczną albo miesięczną; domyślnym wyborem przy zakupie jest roczna. Priority: must-have (warunkowe)
  > Socrates: Kontrargument uznany za trafny: „planowanie jest skokowe — subskrypcja miesięczna będzie
  > anulowana zaraz po zaplanowaniu”. Rozstrzygnięcie: FR utrzymany z **warunkiem** — roczna jest
  > domyślna, miesięczna jest alternatywą (`monetization.md` §4.4).
- [new] FR-033: Nauczyciel może wykupić Basic jako dostęp jednorazowy (miesiąc albo rok szkolny) BLIK-iem albo przelewem, bez automatycznego odnowienia. Priority: must-have (warunkowe)
  > Socrates: Kontrargument uznany za trafny: „subskrypcja i dostęp jednorazowy podwajają przypadki
  > brzegowe”. Rozstrzygnięcie: FR utrzymany z **warunkiem** — jeden model uprawnienia, „plan + dostęp
  > do daty” (`monetization.md` §4.5): oba źródła płatności przesuwają tę samą datę, a zakup przy
  > aktywnym dostępie ją wydłuża, nie dubluje.
- [new] FR-034: Nauczyciel z subskrypcją może nią zarządzać — anulować ją i zmienić metodę płatności; anulowanie zatrzymuje odnowienie, a dostęp trwa do końca opłaconego okresu. Priority: must-have (warunkowe)
  > Socrates: Kontrargument uznany za trafny i **FR doprecyzowany**: „nie wiadomo, czy anulowanie kończy
  > dostęp od razu — zła odpowiedź to reklamacja albo chargeback”. Dostęp trwa do daty, za którą
  > zapłacono — zgodnie z modelem „plan + dostęp do daty”, bez proracji.
- [new] FR-035: Cenę założycielską Basic dostaje każda osoba zapisana przez fake door (FR-029) oraz kolejni kupujący do łącznie ok. 100 osób; cena jest zachowana, dopóki subskrypcja trwa bez przerwy. Priority: must-have (warunkowe)
  > Socrates: Kontrargument uznany za trafny i **FR przepisany**: „ktoś zapisany przez fake door kupuje
  > jako 101. — a zapis obiecywał cenę”. Zapis gwarantuje cenę; limit ~100 dotyczy tylko osób spoza
  > listy zapisanych.
- [new] FR-036: Konto założone przed wejściem płatności dostaje cenę założycielską i okres Basic gratis, a o nowych zasadach i prezencie dowiaduje się, zanim limit planu darmowego go dotknie. Priority: must-have (warunkowe)
  > Socrates: Kontrargument uznany za trafny: „prezent bez wcześniejszej wiadomości to wciąż zmiana
  > zasad — obecni dowiadują się przy pierwszym limicie”. Rozstrzygnięcie: FR utrzymany z **warunkiem**
  > uprzedzenia przed wejściem limitów. Długość okresu gratis — §Open Questions #5.
- [preserved] FR-037: Po wygaśnięciu planu nauczyciel zachowuje odczyt, ręczną edycję i druk tygodnia wszystkich zaplanowanych dni; poprawka aktywności poleceniem dla modelu liczy się do limitu planu darmowego. Priority: must-have (warunkowe)
  > Socrates: Kontrargument uznany za trafny i **FR zawężony**: „edycja i poprawka poleceniem po
  > wygaśnięciu pozwalają budować plan bez generowania”. Edycja ręczna zostaje (to praca, nie koszt);
  > poprawka poleceniem, która woła model, podlega limitowi planu darmowego. Jednostka liczenia
  > poprawki — §Open Questions #4.

### Zachowania chronione

- [preserved] FR-038: Nauczyciel generuje, edytuje, zatwierdza, usuwa i drukuje plany tak jak dziś, w granicach limitu fair use. Priority: must-have
  > Socrates: Rozważony razem z FR-037 (obejście przez edycję); kontrargument dotyczył stanu po
  > wygaśnięciu planu, nie tego FR. Stoi w obecnym brzmieniu.
- [preserved] Izolacja kont — plan jednego nauczyciela nigdy nie jest widoczny dla drugiego; dotyczy także stanu planu konta i licznika zużycia.
- [preserved] Zatwierdzony dzień nie ginie bez jawnej zgody (niezmiennik `M-02`).
- [preserved] Protokół licznika generacji przy zapisie partii (niezmiennik `M-02`).
- [preserved] Bezpieczeństwo treści propozycji — żadna propozycja nieodpowiednia dla dzieci 3–6 lat nie trafia do nauczyciela; bramka wraca do pracy w tym kamieniu.
- [preserved] Rdzeniowa reguła doboru treści — żadne FR tego kamienia nie dotyka doboru treści ani promptu.

**Bilans rundy Sokratejskiej (2026-10-01):** 17 FR-ów, każdy z kontrargumentem. Przepisane albo
zawężone: FR-023, FR-027, FR-028, FR-031, FR-035, FR-037 (6). Utrzymane z warunkiem: FR-022, FR-024,
FR-032, FR-033, FR-034, FR-036 (6). Utrzymane z kontrargumentem przeniesionym do NFR: FR-026.
Ryzyko przyjęte: FR-030. Bez uznanego kontrargumentu: FR-025, FR-038. Zmiana poza FR: brama
płatności liczy wyłącznie zapisy kont aktywnych (FR-029).

## Constraints & Compatibility

**Zachowanie wsteczne.** Istniejące ekrany planowania zachowują adresy i punkty wejścia; logowanie
i rejestracja działają jak dziś. Ekrany planowania pozostają za logowaniem (FR-038).

**Cztery niezmienniki `M-02` wiążą każdy slice** (izolacja kont, zatwierdzony dzień nie ginie bez
zgody, protokół licznika generacji przy zapisie partii, bezpieczeństwo treści) — plus Guardraile 1–3
tego kamienia.

**Migracja danych.** Obecne konta przy wejściu fair use: **nic się nie zmienia** — licznik startuje
od zera w miesiącu wejścia, nie liczy się wstecz, żaden plan nie jest dotykany. (Ustalenie
2026-10-01.) Stan planu i licznik to nowe dane per konto; podlegają izolacji kont, a stan planu
zapisuje wyłącznie system albo właściciel produktu (§Access Control Changes). Przypomnienie
z `M-02`: dodanie nowego pola do zapisywanych planów wymaga świadomego rozstrzygnięcia jego
uprawnień zapisu.

**Dane osób bez konta.** Formularz kontaktowy i zapis anonimowy przechowują e-maile osób, które nie
mają konta — polityka prywatności musi to obejmować (§Access Control Changes).

**Zależności zewnętrzne** (ustalenie 2026-10-01):

- **Treść regulaminu i polityki prywatności** — od księgowego/prawnika; blokuje FR-025.
- **Konto operatora płatności z BLIK-iem i przelewem online** — przed krokiem 7 (FR-032, FR-033).

**Odwieszenie bramki bezpieczeństwa treści** obejmuje każdy dopuszczony model i każdy tryb
generowania (Guardrail 2; reguła z `lessons.md`). Bramka zawieszona z powodu kosztu wraca do pracy
w tym kamieniu.

**Ramy (ustalenie 2026-10-01):** produkt pozostaje aplikacją webową; skala mała, bez zmian;
brak twardego terminu; praca po godzinach. Ograniczenia istniejącego systemu obowiązują dalej:
każde scalenie zmian jest od razu wydaniem na produkcję, bez kroku zatwierdzenia, a automatyczne
kontrole jakości są doradcze — nie mogą zatrzymać wydania.

**Sokrates przy skali ×100:** reguła zużycia zmienia się w jednym miejscu — **fair use staje się
kosztem**. Przy tysiącach kont nadużycie przez zakładanie nowych kont co miesiąc (ryzyko przyjęte
w FR-030) przestaje kosztować grosze. Przy wzroście skali to ryzyko trzeba odwołać — §Open
Questions #7.

### Warunki jakościowe zmiany

Istniejące wymagania jakościowe z PRD v1 i v2 obowiązują dalej i nie są tu powtarzane. Ten kamień
dokłada jedno. _(Schemat brownfieldowy nie ma osobnej sekcji na wymagania pozafunkcjonalne — jako
warunki brzegowe tej zmiany mieszkają tutaj, jak w v2.)_

- **Wiadomości automatów nie docierają do właściciela, a prawdziwe nie giną.** Dotyczy obu
  powierzchni, które przyjmują dane od osób bez konta: formularza kontaktowego i zapisu na cenę
  założycielską. _(Z rundy Sokratejskiej przy FR-026.)_

Guardraile 1–3 (§Success Criteria) są zewnętrznie obserwowalne i wiążą tak samo jak wymagania
jakościowe — w tym odporność puli na równoczesne wywołania (Guardrail 1) i zakres bramki
(Guardrail 2).

## Business Logic Changes

**Reguła rdzeniowa bez zmian.** Aplikacja nadal zamienia hasło nauczyciela w konkretne, gotowe do
użycia propozycje aktywności dla dzieci 3–6 lat, a szkic tygodnia nadal rozkłada jedno hasło na
pięć rozłącznych tematów dziennych. Żadne FR tego kamienia nie dotyka doboru treści ani promptu.

**Nowa reguła (dziś nie istnieje):** **każde generowanie zużywa dni z puli konta w miesiącu
kalendarzowym, a wielkość puli zależy od stanu planu konta; to, co już zaplanowane, nigdy nie jest
odbierane.** (Ustalenie użytkownika 2026-10-01.)

- **Wejście:** stan planu konta i liczba dni wygenerowanych w bieżącym miesiącu kalendarzowym.
  Jednostką jest dzień — wygenerowanie tygodnia zużywa pięć, regeneracja dnia jeden
  (`monetization.md` §4.3); dzień liczy się do swojego miesiąca (FR-031).
- **Wyjście:** generowanie dochodzi do skutku albo nauczycielka dostaje komunikat, kiedy będzie
  znów możliwe (FR-027) — a po wejściu płatności, na planie darmowym, cennik (FR-031).
- **Pula przed płatnościami:** wszyscy mają niewidoczny limit fair use, który zatrzymuje wyłącznie
  nadużycie. **Po bramie płatności:** okres próbny i Basic — fair use; Darmowy — pięć dni roboczych
  w miesiącu.
- **Czego reguła nie robi:** nie odbiera ani nie ukrywa zaplanowanych dni, nie blokuje ręcznej
  edycji, zatwierdzania, usuwania ani druku tygodnia (FR-037, FR-038).

**Druga reguła (warunkowa, krok 7):** uprawnienie konta to **„plan + dostęp do daty”** — każde
źródło płatności przesuwa tę samą datę; po niej konto wraca do planu darmowego (FR-033, FR-034).

## Access Control Changes

**Dziś:** jedna rola (nauczyciel/ka), model płaski, rejestracja i logowanie e-mail + hasło, dane
każdego konta prywatne i odseparowane od pozostałych kont. Ekrany planowania są niedostępne bez
zalogowania. Nie ma resetu ani zmiany hasła, nie ma usunięcia konta.

**Role: bez zmian.** Nie powstaje rola operatora ani administratora. (Ustalenie 2026-10-01.)

**Zmiany w koncie** (ustalenie użytkownika 2026-10-01):

- **Reset zapomnianego hasła** — samodzielny powrót do konta przez e-mail. Warunek sprzedaży
  (`monetization.md` §6 #2) i ból obecnych użytkowników.
- **Zmiana hasła po zalogowaniu.**
- **Usunięcie konta przez użytkownika** — konto i jego plany znikają na żądanie właściciela konta.

**Stan planu konta — kto go zmienia:** system (okres próbny, płatność) oraz właściciel produktu
ręcznie, poza aplikacją (prezenty dla obecnych użytkowników, wyjątki, reklamacje). Użytkownik stan
swojego planu **tylko czyta**; nie ma ścieżki, którą sam by go podniósł inaczej niż płacąc.
Odczyt stanu planu podlega tej samej izolacji kont co plany — nikt nie widzi stanu cudzego konta.

**Nowa powierzchnia publiczna (bez logowania):** regulamin, polityka prywatności, FAQ, cennik,
formularz kontaktowy i zapis na cenę założycielską (fake door). Dwie z nich przyjmują dane od osób
bez konta — formularz kontaktowy i zapis — więc obie muszą być chronione przed spamem, a polityka
prywatności musi obejmować przechowywanie e-maili osób, które nie mają konta.

**Fake door — co widzi osoba po kliknięciu:** uczciwe potwierdzenie — płatności jeszcze nie
działają, osoba jest zapisana na cenę założycielską i dostanie wiadomość e-mail. Zapis jest zgodą
na ten kontakt. Żadna płatność nie jest symulowana.

**Bez zmian:** ekrany planowania pozostają niedostępne bez zalogowania; izolacja kont obowiązuje
każdą nową ścieżkę zapisu i odczytu tak samo jak istniejące.

## Non-Goals

Wybrane przez użytkownika 2026-10-01:

- **Pro i jego funkcje** — materiały, dokumentacja, kilka grup, eksport DOCX. To kamień `M-04`;
  cennik nie pokazuje Pro (FR-028).
- **Placówka, faktura na przedszkole, role** — decyzja B2C (`monetization.md` §Decyzje #4); bez
  roli operatora i dyrektora.
- **Różnicowanie funkcji planu darmowego** — bez osobnego limitu poprawek (5/50), bez druku miesiąca
  tylko w Basic, bez stopki na darmowym wydruku. Plan darmowy różni się od Basic wyłącznie pulą dni.
  (Napięcie z FR-037 — §Open Questions #4.)
- **Panel operatora w aplikacji** — stan planu, prezenty i wyjątki właściciel ustawia ręcznie poza
  aplikacją.
- **Upgrade'y, proracja i wiele planów płatnych** — jeden plan płatny w modelu „plan + dostęp do
  daty”, bez proracji (FR-034).

## Open Questions

1. **Brak wyniku walidacji (Krok 11).** Chęć płacenia i rzeczywista intensywność użycia są
   niezweryfikowane — decyzja użytkownika 2026-10-01, żeby iść bez nich. Kamień niesie walidację
   sam (fake door z bramą); limity stoją na szacunkach z `monetization.md`. _(Przyjęte ryzyko
   z quality cross-check.)_ Właściciel: Janusz. Blokuje: nie.
2. **Definicja „konta aktywnego” dla bramy płatności** (FR-029) — co znaczy „faktycznie planowało”:
   jeden wygenerowany dzień, tydzień, aktywność w ostatnim miesiącu? Właściciel: Janusz. Blokuje:
   slice fake door (musi wiedzieć, co liczy).
3. **Próg fair use** — liczby z `monetization.md` §4.3 (~150 dni-generacji) są szacunkiem bez danych
   z produkcji. Guardrail 1 wymaga, żeby typowy miesiąc nigdy go nie dotknął. Właściciel: Janusz,
   na danych z produkcji przed slice'em limitu. Blokuje: slice limitu.
4. **Jednostka liczenia poprawki poleceniem** (FR-037) — poprawka liczy się do limitu planu
   darmowego, a jednocześnie Non-Goals wykluczają osobny limit poprawek. Czy poprawka zużywa dzień
   z puli, ułamek dnia, czy coś innego? Właściciel: Janusz. Blokuje: krok 7.
5. **Długość okresu Basic gratis dla obecnych kont** (FR-036) — `monetization.md` §4.4 mówi „np. 3
   miesiące”. Właściciel: Janusz. Blokuje: krok 7.
6. **Treść regulaminu i polityki prywatności** — zależność zewnętrzna (księgowy/prawnik). Polityka
   musi objąć e-maile osób bez konta (formularz, zapis anonimowy). Właściciel: Janusz + doradca.
   Blokuje: FR-025.
7. **Ryzyko zakładania kont na nowo (FR-030) przy wzroście skali** — przyjęte przy małej skali;
   do ponownej oceny, gdy skala przestanie być mała (Sokrates ×100). Właściciel: Janusz. Blokuje: nie.
8. **Zamykane przez ten kamień:** Open Roadmap Questions #4 (reset hasła — FR-022) i #5 (limit
   regeneracji — FR-027, nowa reguła zużycia).
9. **Brak bramki czasowej** (`delivery_weeks: null`) — decyzja świadoma, podjęta 2026-10-01 po
   przedstawieniu kosztu: rdzeń (kroki 1–6) to wyraźnie więcej niż trzy tygodnie pracy po
   godzinach, a płatności (krok 7) to zmiana osobnej wielkości. Nic nie powie, że `M-03` trwa za
   długo; nazwana pułapka to system zostawiony w połowie przerobiony, a w wypadku płatności —
   integracja wpięta w połowie. Obroną jest dyscyplina slice'ów (każdy osobnym wydaniem) i zasada
   „płatności kompletem albo wcale” (Guardrail 3). _(Przyjęte ryzyko z quality cross-check.)_
   Właściciel: Janusz. Blokuje: nie.
