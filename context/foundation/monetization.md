---
project: 10xPreschool
researched_at: 2026-09-29
decided_at: 2026-09-29
status: decyzje podjęte — wejście do /10x-shape dla M-03
feeds: next-actions.md Krok 8 i §Kolejka po M-02, roadmap.md §Parked „Monetyzacja", Open Roadmap Questions #5
proposed_by_user: Basic 14,99 zł / Pro 49,99 zł (miesięcznie)
decision: Free + Basic 19,99 zł/mies. (159 zł/rok, założycielska 14,99 zł / 119 zł) teraz; Pro 39,99 zł/mies. (299 zł/rok) później, zaczynając od materiałów; B2C; JDG
---

# Monetyzacja 10xPreschool — research, rekomendacja i decyzje

> Ceny konkurencji sprawdzone w sieci 2026-09-29; źródła na końcu. Kwoty w USD przeliczone
> orientacyjnie po ~3,7 zł/USD. Część prawno-podatkowa to sygnały do sprawdzenia z księgowym, nie
> porada. Decyzje poniżej są wejściem do `/10x-shape` kamienia `M-03`; wymagania powstaną tam.

## Decyzje (2026-09-29)

Podjęte przez Janusza po lekturze tego raportu. Sekcje niżej zostają jako uzasadnienie; tam, gdzie
się z tą listą rozjeżdżają, **wiąże ta lista**.

| # | Pytanie | Decyzja |
| --- | --- | --- |
| 1 | Ceny | **19,99 / 39,99 zł z ceną założycielską** (Basic 14,99 zł/mies. albo 119 zł/rok dla pierwszych ~100 osób) |
| 2 | Start | **Free + Basic teraz, Pro później** |
| 3 | Darmowy plan | **Oba mechanizmy naraz** — decyzja delegowana, uzasadnienie niżej |
| 4 | Kto płaci | **B2C** — płaci nauczyciel. Faktura na przedszkole i plan „Placówka" wypadają z zakresu |
| 5 | Forma prawna | **JDG.** Limit działalności nierejestrowanej (§5) przestaje dotyczyć |
| 6 | Pierwsza funkcja Pro | **Materiały** — teksty piosenek, wierszyków i zagadek do aktywności (Open Roadmap Questions #9) |

**Ad 3 — dlaczego oba, a nie jeden.** Sam reverse trial odbiera wszystko po pierwszym miesiącu: kto
nie zapłaci od razu, odchodzi i nie wraca, a znika też stopka na wydruku, czyli jedyny darmowy kanał
wzrostu. Samo freemium z tygodniem w miesiącu sprawia, że nowa osoba nigdy nie zobaczy wydruku
miesiąca ani pełnego planu, więc nie wie, za co miałaby zapłacić. Razem: **pierwszy miesiąc od
rejestracji to pełny Basic bez karty, potem na stałe tydzień w miesiącu.** Koszt LLM darmowego
użytkownika to grosze (§5), więc stały darmowy plan nic nie kosztuje.

**Ad 5 — co zmienia JDG.** Przy czynnym VAT liczy się wariant B z §5: z 19,99 zł zostaje ~14,80 zł.
Do ustalenia z księgowym przed pierwszą sprzedażą: status VAT, zwolnienie z kasy fiskalnej dla usług
elektronicznych opłacanych przez bank lub instytucję płatniczą, faktury B2C na żądanie (poza KSeF?),
ewidencja sprzedaży ze Stripe.

**Ad 6 — próg startu Pro.** Raport zakładał „co najmniej dwie funkcje Pro". Z samymi materiałami Pro
ma: materiały, nielimitowane poprawki aktywności i nagłówek placówki na wydruku. Czy to wystarczy do
startu, czy czekamy na drugą funkcję (dokumentacja albo DOCX), rozstrzyga `/10x-shape` kamienia treści.

## TL;DR raportu (sprzed decyzji)

**Jaka cena?** Twoja propozycja jest w dobrym rzędzie wielkości, ale nierówna. **Basic 14,99 zł jest do
obrony**, choć zostawia pieniądze na stole — bezpośredni konkurent AI kosztuje 29 zł. **Pro 49,99 zł jest
powyżej całego polskiego rynku przedszkolnego** (ZabawAIka 29 zł, bliżej MAX 39 zł, ChatGPT Go 34,99 zł)
i dziś nie ma czym go wypełnić. Rekomendacja: **Basic 19,99 zł/mies. albo 159 zł za rok, z 14,99 zł jako
ceną założycielską dla pierwszych użytkowników; Pro 39,99 zł/mies. albo 299 zł za rok, ale dopiero wtedy,
gdy dostanie własne funkcje.**

**Co w Basic, co w Pro?** Wszystko, co aplikacja umie dziś, należy do Basic — to jest rdzeń, czyli
plan miesiąca od hasła do wydruku. Płot między Free a Basic stawiamy na **liczbie zaplanowanych dni**
(Free: jeden tydzień w miesiącu), a nie na funkcjach. Pro to warstwa, której jeszcze nie ma: **materiały**
(teksty piosenek i wierszyków), **dokumentacja** (cele z podstawy programowej, wpisy do dziennika), **wiele
grup**, eksport DOCX.

**Konkurencja?** Nikt w Polsce nie robi tego, co robimy: planu **miesiąca** z jednego hasła,
rozłożonego na spójne tygodnie i dni. Konkurenci AI generują pojedyncze scenariusze (ZabawAIka,
Przygotuj Lekcje), serwisy treści sprzedają gotowe plany redakcji (Bliżej Przedszkola, przedszkouczek),
a ChatGPT jest darmowy, ale bez struktury, kalendarza i wydruku. Za to konkurenci mają coś, czego nie
mamy my: materiały do zajęć, kalendarz świąt i „zgodność z podstawą" jako argument sprzedażowy.

**Najważniejsze poza cenami:**

1. **Nie sprzedawaj, dopóki bramka bezpieczeństwa treści jest zawieszona** (od 2026-09-19) i dopóki nie
   ma resetu hasła. Płacący klient plus treści dla trzylatków plus wyłączony strażnik to ryzyko
   reputacyjne, którego żadna cena nie pokryje.
2. **Planowanie jest skokowe** — raz w miesiącu, pod koniec miesiąca. Subskrypcja miesięczna będzie
   rezygnowana zaraz po zaplanowaniu, więc **plan roczny ma być domyślny**, a nie opcją na dole cennika.
3. **Koszt AI nie jest ograniczeniem.** Miesiąc planowania to ok. 0,15–0,75 zł kosztu LLM przy cenie
   ok. 20 zł. Limity służą do różnicowania planów i ochrony przed nadużyciem, nie do pokrycia kosztów.
4. **Najpierw walidacja, potem integracja płatności.** Chęć płacenia jest dziś nieznana. Strona cennika
   z listą oczekujących i ceną założycielską kosztuje dzień pracy i odpowiada na pytanie, czy w ogóle
   warto budować rozliczenia.

## 1. Punkt wyjścia — co dziś sprzedajemy

Po zamknięciu `M-02` (2026-09-29) nauczyciel:

- generuje dzień i tydzień z jednego hasła (tydzień = szkic pięciu rozłącznych tematów + pięć dni),
- regeneruje tydzień z zastępowaniem, także dni zaakceptowanych po jawnej zgodzie,
- edytuje, akceptuje, cofa akceptację i usuwa dzień (także z widoku tygodnia),
- ogląda aktywności w siatce miesiąca bez wchodzenia w dzień,
- poprawia pojedynczą aktywność poleceniem dla modelu (`S-15`),
- drukuje tydzień (dzień na stronę albo tydzień na stronie) i miesiąc (siatka albo tygodniami).

**Czego nie ma, a konkurencja ma** — to są naturalni kandydaci na płatne funkcje:

| Brak                                                 | Kto to ma                                              | Gdzie to dziś jest u nas                          |
| ---------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------- |
| Teksty piosenek, wierszyków, opowiadań do aktywności | Bliżej Przedszkola, sklepy z planami PDF               | Open Roadmap Questions #9 (12 z 15 aktywności bez tekstu) |
| Karty pracy, pomoce do druku                         | ZabawAIka (katalog), Bliżej, przedszkouczek, PDF-y     | PRD v1 §Non-Goals                                 |
| Cele z podstawy programowej, wpisy do dziennika      | ZabawAIka („uzasadnienie metodyczne"), e-dzienniki, PDF-y | brak                                           |
| Kalendarz świąt i dni tematycznych                   | ZabawAIka (486 wydarzeń), przedszkouczek               | obietnica z `idea.md` („aktualne wydarzenia"), niezrealizowana |
| Rodzaje aktywności (plastyczne, ruchowe, muzyczne)   | ZabawAIka                                              | roadmap §Parked                                   |
| Profil grupy (wiek, kilka grup)                      | ZabawAIka, Przygotuj Lekcje                            | roadmap §Parked                                   |
| Eksport edytowalny (DOCX)                            | Przygotuj Lekcje, Claso                                | brak                                              |

**Koszt jednego wywołania LLM** (pomiar z `context/archive/2026-08-22-first-day-generation/model-comparison.md`):
~$0,00058 dla `openai/gpt-5.6-luna` (domyślny), ~$0,00283 dla `google/gemini-3.7-flash`. Tydzień to
6 wywołań (`week/outline.ts` + 5× `week/day.ts`), pełny miesiąc z poprawkami to realnie ~50–100.
Prompty urosły od pomiaru (`MAX_TOKENS` = 4000, `S-15`), więc traktuj te liczby jako rząd wielkości.

## 2. Rynek i konkurencja

### 2.1 Wielkość rynku

- **~105 tys. etatów** w placówkach wychowania przedszkolnego w roku 2025/26 (GUS), 99% kobiet. MEN
  podaje **ponad 92 tys. nauczycieli** zatrudnionych w przedszkolach (kwiecień 2025).
- **Rynek się kurczy.** Dzieci w przedszkolach: 1,41 mln (2024/25) → 1,33 mln (2025/26) → prognoza
  1,03 mln w 2028/29. Etatów ubyło 12% w jednym roku (121,9 tys. → 107,4 tys. między 2023/24 a 2024/25).
  To nie jest powód, żeby nie wchodzić, ale jest powodem, żeby nie planować wzrostu na samej populacji.
- **Wynagrodzenia 2026:** minimalne zasadnicze ok. 5,3 tys. zł brutto (początkujący) do ok. 6,4 tys. zł
  (dyplomowany). 20 zł miesięcznie to ok. 0,3–0,4% pensji brutto.
- **Rynek AI dla przedszkoli jest wczesny.** Najbliższy konkurent (ZabawAIka) chwali się „ponad 100
  nauczycielkami". Nikt nie ma pozycji dominującej.

Rząd wielkości: **1% nauczycieli przedszkolnych na Basic = ~920 osób ≈ 18 tys. zł miesięcznie.**

### 2.2 Mapa konkurencji

**Bezpośrednia — AI dla przedszkola**

| Produkt | Co robi | Darmowo | Płatnie | Czego nie ma (vs 10xPreschool) |
| --- | --- | --- | --- | --- |
| **ZabawAIka.pl** | Generator pojedynczych scenariuszy zajęć dla żłobka i przedszkola (1–6 lat), zgodność ze standardami OWE 2026, biblioteka 500+ scenariuszy, kalendarz 486 wydarzeń, ręczny plan tygodnia (drag & drop), foldery, grupy | 3 generacje/mies., bez PDF, bez kopiowania, ograniczony wybór świąt | **PRO 29 zł/mies.**: bez limitu, PDF, wszystkie święta, kopiowanie biblioteki | Planu tygodnia/miesiąca **z jednego hasła**, akceptacji, wydruku miesiąca |
| **Przygotuj Lekcje** | AI do scenariuszy lekcji od przedszkola do liceum; cykle lekcji, profile klas | 2 lekcje + 1 cykl (jednorazowo) | **Pro 39 zł/mies. lub 349 zł/rok**: bez limitu, plan tygodnia, PDF i DOCX, 15 formatów ćwiczeń | Kształt szkolny (lekcja 45 min), nie plan dnia w przedszkolu |

**Pośrednia — gotowe treści redakcyjne** (najsilniejszy konkurent o ten sam budżet)

| Produkt | Płatnie | Uwagi |
| --- | --- | --- |
| **bliżej MAX** (Bliżej Przedszkola) | **39 zł/mies.** (7 dni próby z kartą; albo 3 miesiące z góry BLIK-iem) | Gotowe plany miesięczne i tygodniowe, piosenki, filmy, 10 pobrań/mies. Pojedyncze serwisy 13–27 zł |
| Miesięcznik „Bliżej Przedszkola" | 36 zł/mies. (Standard) lub 66 zł/mies. (Plus) | Papier + pobrania. Działa od lat — dowód, że nauczycielki płacą regularnie za inspiracje |
| **przedszkouczek.pl** | 22 zł/mies. (20 kredytów), 264 zł/rok cyklicznie, 348 zł/rok jednorazowo | Biblioteka scenariuszy 3–4 i 5–6 lat, płatności PayU |
| Sklepy z planami miesięcznymi w PDF | **24,99 zł** (plan z Bliżej), **39 zł** (zabawydydaktyczne.pl), **49,99 zł** (PRO Edukacja) — **jednorazowo za jeden miesiąc** | Najważniejsza kotwica cenowa: nauczycielki kupują z własnej kieszeni **statyczny** plan jednego miesiąca za 25–50 zł |

**Substytuty**

| Produkt | Cena | Uwagi |
| --- | --- | --- |
| **ChatGPT** | Free 0 zł · Go 34,99 zł · Plus 99,99 zł | Główny substytut „za darmo". Brak kalendarza, struktury miesiąca, akceptacji, wydruku i gwarancji bezpieczeństwa treści |
| E-dzienniki przedszkolne (Kidsview, Mobidziennik, Kidplace) | płaci placówka | Import rozkładów materiału wydawnictw (Nowa Era, MAC, WSiP…) do dziennika. Nauczycielka w przedszkolu realizującym program wydawniczy ma plan „za darmo" — to segment, który może nas nie potrzebować |
| Szkolne platformy AI (Sciobot, Claso, Chalkie, Educreator) | B2B, np. Sciobot 3 750 zł za 1 150 lekcji | Szkoła, nie przedszkole; sprzedaż do placówek |

**Wzorzec światowy — MagicSchool** (5 mln+ nauczycieli): Free z limitem generacji, **Plus $12,99/mies.
(~48 zł) albo $8,33/mies. przy płatności rocznej (~31 zł)**. Kluczowa lekcja: **płot stoi na liczbie
generacji, nie na funkcjach** — darmowy użytkownik widzi całe narzędzie i trafia na limit, zanim trafi
na paywall. Plan indywidualny jest mostem do licencji szkolnej.

### 2.3 Co z tego wynika

1. **Polskie narzędzia AI dla nauczycieli skupiają się w przedziale 29–39 zł/mies. i ~350 zł/rok.**
   Subskrypcje treści przedszkolnych: 13–39 zł/mies. Twoje 14,99 zł jest pod rynkiem, 49,99 zł nad nim.
2. **Najmocniejszy argument cenowy już istnieje na rynku:** gotowy plan jednego miesiąca w PDF kosztuje
   25–50 zł. „Plan miesiąca na Twój temat, taniej niż jeden gotowy plan w PDF" jest zdaniem, które
   nauczycielka rozumie od razu.
3. **Pozycjonowanie: planer miesiąca, nie generator scenariuszy.** ZabawAIka i Przygotuj Lekcje
   generują pojedyncze zajęcia; my zamieniamy hasło w spójny tydzień i miesiąc z akceptacją i wydrukiem.
   Tego nie ma nikt.
4. **Słabość, którą konkurencja wykorzysta:** nasz dzień to tytuł i 2–4 zdania opisu. Bliżej i PDF-y
   dają piosenkę, wierszyk i kartę pracy. ZabawAIka sprzedaje „żaden inspektor nie będzie miał
   zastrzeżeń". Pro musi celować dokładnie w tę lukę.

## 3. Ocena proponowanych cen

### Basic 14,99 zł — do obrony, ale lepiej 19,99 zł z 14,99 zł jako ceną założycielską

Za 14,99 zł:

- niski próg dla nieznanej marki; tańsze od ChatGPT Go i mniej więcej połowa ceny ZabawAIki;
- mniej niż jeden plan PDF — łatwe do uzasadnienia.

Przeciw:

- przy 19,99 zł nadal jesteś o 30% tańszy od bezpośredniego konkurenta;
- stała opłata Stripe (1 zł) zjada 8% przy 14,99 zł i 6,5% przy 19,99 zł;
- 19,99 zł → 39,99 zł to czysta drabinka ×2; 14,99 zł → 49,99 zł to skok ×3,3 (patrz niżej);
- cena, od której zaczynasz, jest najłatwiejsza do obniżenia i najtrudniejsza do podniesienia.

**Rekomendacja:** cena cennikowa 19,99 zł/mies., a 14,99 zł jako **cena założycielska** zablokowana
na zawsze dla pierwszych ~100 osób, dopóki subskrypcja trwa bez przerwy. Ten mechanizm stosuje bliżej
MAX i jest nagrodą za wczesne ryzyko, a nie rabatem, który trzeba potem odbierać.

### Pro 49,99 zł — za drogo i za wcześnie

- **Nad całym rynkiem przedszkolnym:** ZabawAIka PRO 29 zł, bliżej MAX 39 zł (z piosenkami, filmami
  i gotowymi planami), Przygotuj Lekcje 39 zł, ChatGPT Go 34,99 zł. Równo z MagicSchool Plus
  miesięcznie — globalnym produktem z 80 narzędziami.
- **Skok ×3,3 od Basic jest za duży na drabinkę z dwóch szczebli.** Przy dwóch planach nie działa efekt
  „środkowej opcji". Większość wybierze Basic, a Pro zostanie kotwicą, której nikt nie kupuje.
- **Dziś nie ma czego do niego włożyć.** Każda istniejąca funkcja należy do rdzenia. Pro bez
  własnych funkcji to Basic za 49,99 zł.

**Rekomendacja:** Pro za **39,99 zł/mies. albo 299 zł/rok**, a startuje dopiero wtedy, gdy ma co
najmniej dwie funkcje z sekcji 4.2 oznaczone jako Pro. Do tego czasu cennik pokazuje Pro jako
„wkrótce" i zbiera zapisy — to mierzy popyt na konkretne funkcje, zanim je zbudujesz.

## 4. Rekomendowany model

### 4.1 Struktura

| Plan | Dla kogo | Cena miesięczna | Cena roczna | Kiedy |
| --- | --- | --- | --- | --- |
| **Darmowy** | Każda nowa osoba; marketing | 0 zł | — | od razu |
| **Basic** | Nauczycielka, która planuje miesiąc jednej grupy | **19,99 zł** (założycielska 14,99 zł) | **159 zł** (założycielska 119 zł) | od razu |
| **Pro** | Nauczycielka, która chce materiałów i dokumentacji, albo prowadzi kilka grup | **39,99 zł** | **299 zł** | po dowiezieniu funkcji Pro |
| **Placówka** (hipoteza) | Dyrektor kupujący dla zespołu, z fakturą na przedszkole | do ustalenia, np. od ~25 zł/stanowisko | licencja roczna | po wprowadzeniu ról (dziś §Non-Goal) |

Ceny roczne to ~8 miesięcy płatnych za 12 — nauczyciele myślą rokiem szkolnym, a lipiec i sierpień to
czas, w którym planuje się mało.

### 4.2 Podział funkcji i limitów

Zasada: **Free różni się od Basic ilością, Basic od Pro zakresem.** Nic, co aplikacja umie dziś, nie
trafia za płot Pro.

| Funkcja | Darmowy | Basic | Pro |
| --- | --- | --- | --- |
| **Zaplanowane dni w miesiącu** (generowanie dnia, tygodnia, regeneracja) | **1 tydzień (5 dni)** | cały miesiąc (fair use) | cały miesiąc (fair use) |
| Pierwszy miesiąc po rejestracji | **pełny Basic, bez karty** | — | — |
| Poprawka aktywności poleceniem (`S-15`) | 5/mies. | 50/mies. | bez limitu (fair use) |
| Edycja, akceptacja, usuwanie, podgląd w siatce miesiąca | ✔ | ✔ | ✔ |
| Druk tygodnia | ✔ ze stopką „Przygotowano w 10xPreschool" | ✔ | ✔ + nagłówek z nazwą placówki i grupy |
| Druk miesiąca | ✗ | ✔ | ✔ |
| _Kalendarz świąt i dni tematycznych w podpowiedziach_ | podgląd | ✔ | ✔ |
| _Rodzaje aktywności (plastyczne, ruchowe, muzyczne)_ | ✗ | ✔ | ✔ |
| _Teksty piosenek, wierszyków, zagadek do aktywności_ (Open Roadmap Questions #9) | ✗ | ✗ | ✔ |
| _Cele z podstawy programowej + gotowe wpisy do dziennika_ | ✗ | ✗ | ✔ |
| _Kilka grup (np. 3–4-latki i 5–6-latki)_ | 1 | 1 | do 5 |
| _Eksport DOCX_ | ✗ | ✗ | ✔ |

_Kursywa_ = funkcja jeszcze niezbudowana.

Uzasadnienia:

- **Płot Free/Basic na „tygodniu w miesiącu".** Rdzeniowe zadanie to plan całego miesiąca; tydzień
  wystarczy, żeby poczuć wartość, i nie wystarczy, żeby to zadanie wykonać. Paywall pojawia się w
  momencie największej potrzeby: gdy nauczycielka siada do planowania drugiego tygodnia.
- **Pierwszy miesiąc pełny (reverse trial).** Planowanie odbywa się raz w miesiącu, więc 7-dniowy
  trial często nie trafi w moment planowania. Pełny pierwszy cykl — zaplanowany i wydrukowany miesiąc —
  pokazuje całą wartość. Bez karty, bo karta na starcie odcina większość nauczycielek.
- **Stopka na darmowym wydruku to kanał wzrostu**, nie kara: wydrukowany plan trafia do dyrektorki
  i innych nauczycielek. Nie psuje kryterium „nadaje się do oddania bez obróbki" (`prd-v2.md` §Success
  Criteria).
- **Kalendarz świąt i rodzaje aktywności w Basic, nie w Pro.** To poprawa rdzenia i spełnienie
  obietnicy z `idea.md` („tematy skorelowane z aktualnymi wydarzeniami"). Pro to rzeczy, które idą
  **poza** plan: materiały, dokumentacja, skala.
- **Po wygaśnięciu subskrypcji nic nie znika.** Zaplanowane dni zostają do odczytu, edycji i druku
  tygodnia; blokuje się tylko nowe generowanie ponad limit Free i druk miesiąca. Zakładnik z danych
  kończy się skargami i chargebackami, a to prostsze w implementacji.
- **Opcjonalna dźwignia Pro: mocniejszy model.** W porównaniu z S-01 `gemini-3.7-flash` miał 15/15
  propozycji akceptowalnych bez edycji, `gpt-5.6-luna` 14/15, przy 5× wyższym koszcie, który wciąż jest
  poniżej złotówki miesięcznie. Oba są już w `ALLOWED_MODELS`, więc technicznie to przełącznik. Słaby
  argument w komunikacji do nauczycielki, ale realna różnica jakości.

### 4.3 Jednostka limitu

Proponowana jednostka: **wygenerowany dzień w miesiącu kalendarzowym** (generowanie tygodnia = 5,
regeneracja dnia = 1). Nauczycielka rozumie „tydzień", system liczy dni. Poprawki aktywności (`S-15`)
liczone osobno, bo są tańsze i częstsze.

Limity fair use dla Basic i Pro (startowo: ~150 i ~500 dni-generacji miesięcznie, czyli ~6× i ~20× pełny
miesiąc) są niewidoczne dla normalnego użytkownika. Ich zadaniem jest zamknąć Open Roadmap Questions #5
(„limit regeneracji"), a nie sprzedawać. **Liczby do kalibracji** — zanim je ustawisz, zmierz, ile
generowań na miesiąc robią dziś realni użytkownicy.

Egzekwowanie musi być po stronie serwera, w każdej z czterech tras wołających LLM
(`generate.ts`, `week/outline.ts`, `week/day.ts`, `refine.ts`). Tydzień to pięć niezależnych wywołań
`week/day.ts` sterowanych z klienta, więc licznik musi być inkrementowany atomowo w bazie — inaczej
równoległe wywołania przejdą przez limit razem.

### 4.4 Rozliczenie

- **Rok szkolny jako domyślny wybór na cenniku**, miesiąc jako alternatywa. Planowanie raz w miesiącu
  oznacza, że subskrypcja miesięczna jest anulowana zaraz po zaplanowaniu; plan roczny zamienia ten
  wzorzec w przychód. Dodatkowo: jedna opłata Stripe zamiast dwunastu (3,39 zł zamiast 15,60 zł przy
  Basic).
- **Cena założycielska** (14,99 zł / 119 zł) dla pierwszych ~100 osób, zachowana, dopóki subskrypcja
  trwa bez przerwy. Obecni użytkownicy sprzed paywalla: cena założycielska plus np. 3 miesiące Basic
  gratis — nie zmieniaj zasad bez prezentu.
- **Gwarancja zwrotu w 14 dni bez pytań.** Prostsza w komunikacji i obsłudze niż konstrukcja prawa
  odstąpienia dla usług cyfrowych, a jednocześnie argument sprzedażowy (przedszkouczek ma „Gwarancję
  Satysfakcji").
- **Okno sprzedaży: ostatni tydzień miesiąca**, kiedy nauczycielki planują następny. Kampanie i
  przypomnienia e-mailowe ustawiaj na ok. 20.–28. dnia miesiąca, nie na początek.

### 4.5 Płatności

**Stripe** — jedna umowa na karty, BLIK i Przelewy24, subskrypcje, Checkout i Customer Portal.

| Metoda | Prowizja Stripe (PL) | Uwagi |
| --- | --- | --- |
| Karta z EOG | 1,5% + 1,00 zł | Główna metoda dla subskrypcji |
| BLIK | 1,6% + 1,00 zł | Najpopularniejsza metoda w PL; **cykliczny tylko, gdy bank klienta to wspiera** |
| Przelewy24 | 1,9% + 1,00 zł | Jednorazowo |

Wniosek: **dwa sposoby zakupu**, jak robią bliżej MAX i przedszkouczek:

1. **Subskrypcja odnawiana** (karta) — miesięczna lub roczna.
2. **Dostęp jednorazowy** (BLIK, P24, karta) — „miesiąc" albo „rok szkolny", bez automatycznego
   odnowienia. Dla nauczycielek, które nie podepną karty.

Modeluj uprawnienie jako **„plan + dostęp do daty"**, niezależnie od źródła płatności. Webhook
subskrypcji przesuwa datę przy każdej opłaconej fakturze, zakup jednorazowy ustawia ją raz. Jeden model
danych, dwa źródła — i dużo prostsze od pełnego cyklu życia subskrypcji z upgrade'ami i proracją,
których przy jednym planie płatnym na start i tak nie potrzebujesz.

**Faktury:** Stripe nie wystawia polskich faktur VAT i nie obsługuje KSeF (obowiązkowego dla faktur B2B
od 1 lutego 2026 dla dużych firm i od 1 kwietnia 2026 dla pozostałych). Przy JDG potrzebny program
księgowy (Fakturownia, inFakt, wFirma) i łącznik ze Stripe (np. Stripto, 19–79 zł/mies.).

**Merchant of Record** (Paddle, Lemon Squeezy) zdjąłby VAT i faktury, ale przy ~5% + $0,50 za
transakcję przy cenie 19,99 zł oddajesz ok. 14%. Przy rynku wyłącznie polskim Stripe + narzędzie do
faktur wygrywa.

## 5. Ekonomika jednostkowa

Założenia: typowy miesiąc ~70 wywołań LLM (`gpt-5.6-luna`) ≈ 0,15 zł; intensywny Pro ~300 wywołań ≈
0,65 zł. Wariant A — bez VAT (zwolnienie podmiotowe do 240 tys. zł/rok, także działalność
nierejestrowana). Wariant B — czynny podatnik VAT (23%).

| Plan | Cena brutto | Stripe | LLM | Zostaje (A, bez VAT) | Zostaje (B, VAT 23%) |
| --- | --- | --- | --- | --- | --- |
| Basic 14,99 zł/mies. | 14,99 zł | 1,22 zł (8,2%) | 0,15 zł | **13,62 zł** | **10,82 zł** |
| Basic 19,99 zł/mies. | 19,99 zł | 1,30 zł (6,5%) | 0,15 zł | **18,54 zł** | **14,80 zł** |
| Basic 159 zł/rok | 159 zł | 3,39 zł (2,1%) | 1,80 zł | **153,81 zł** (12,82 zł/mies.) | **124,08 zł** (10,34 zł/mies.) |
| Pro 39,99 zł/mies. | 39,99 zł | 1,60 zł (4,0%) | 0,65 zł | **37,74 zł** | **30,26 zł** |

**Koszty stałe** (szacunek): Cloudflare Workers Paid $5 (~18 zł), Supabase Pro $25 (~92 zł — przy
płacących klientach warto choćby dla backupów), domena, narzędzie do faktur (przy JDG). Razem ok.
**130–200 zł/mies.** → próg rentowności to **~10–15 osób na Basic**, nie licząc Twojego czasu
i księgowości.

**Bonus:** przychód z kilku subskrypcji pokrywa przebiegi bramki bezpieczeństwa treści, zawieszonej
dziś z powodu kosztu OpenRoutera (`src/lib/services/gate-suspension.ts`).

### Forma prawna — sygnał do sprawdzenia z księgowym

- **Działalność nierejestrowana 2026:** limit **10 813,50 zł przychodu należnego na kwartał** (225% ×
  4 806 zł). To ok. **180 subskrypcji po 19,99 zł** albo ok. 240 po 14,99 zł. Uwaga na plany roczne:
  przychód liczy się w kwartale sprzedaży, więc **~68 planów rocznych po 159 zł sprzedanych w jednym
  kwartale** (np. wrzesień) wyczerpuje limit.
- Jeśli prowadzisz już JDG (np. B2B jako programista), dopisanie PKD jest prostsze niż cokolwiek innego.
- **Faktura na przedszkole** (placówka płaci za nauczycielkę) to prawdopodobnie największa dźwignia
  konwersji, ale w praktyce wymaga JDG i KSeF.

## 6. Warunki wstępne — zanim weźmiesz pierwszą złotówkę

| # | Warunek | Dlaczego blokuje | Gdzie jest dziś |
| --- | --- | --- | --- |
| 1 | **Odwieszenie bramki bezpieczeństwa treści** | Sprzedajesz treści dla dzieci 3–6 lat; guardrail #4 z `prd-v2.md` nie może być pilnowany wyłącznie ręcznie, gdy ktoś za to płaci | zawieszona od 2026-09-19 (`next-actions.md` §Stan) |
| 2 | **Reset hasła** | Płacący użytkownik bez dostępu do konta = zgłoszenia do Ciebie, chargebacki (90 zł opłaty Stripe za spór) | Open Roadmap Questions #4 |
| 3 | **Regulamin i polityka prywatności** | Regulamin jest obowiązkowy przy świadczeniu usług drogą elektroniczną; płatności tylko go rozszerzają | `new-ideas.md` („Terms & Conditions") |
| 4 | **FAQ i formularz kontaktowy** | Klient płacący musi mieć kanał kontaktu | `new-ideas.md` |
| 5 | **Decyzja o formie prawnej i fakturach** | Determinuje VAT, faktury i to, czy możesz sprzedawać placówkom | sekcja 5 |

## 7. Plan wdrożenia

**Faza 0 — walidacja (1–2 tygodnie, zanim powstanie linijka kodu płatności)**

- 8–10 rozmów z nauczycielkami według zasad Mom Test (`/10x-mom-test`). Pytaj o przeszłe zachowania,
  nie o opinie: _„Ile w ostatnim roku wydałaś/wydałeś na materiały do zajęć i na co? Kto za to zapłacił — Ty
  czy przedszkole? Kiedy ostatnio kupiłaś/kupiłeś gotowy plan miesiąca?"_
- Strona cennika jako **fake door**: plany z cenami, przycisk „Zarezerwuj cenę założycielską" → zapis
  na listę. Zmierz, jaki % aktywnych użytkowników kliknie.
- Sprawdź dane z produkcji: ilu użytkowników zaplanowało więcej niż tydzień w miesiącu i ile generowań
  robią. To kalibruje limity z sekcji 4.3.

**Faza 1 — warunki wstępne** (sekcja 6).

**Faza 2 — Free + Basic**

- Stripe Checkout (karta, BLIK, P24) + Customer Portal; subskrypcja (karta) i dostęp jednorazowy (BLIK).
- Tabela uprawnień „plan + dostęp do daty" zasilana wyłącznie webhookiem; RLS: użytkownik czyta tylko
  własny wiersz, zapis tylko z roli serwisowej. Guardrail izolacji kont obowiązuje tak samo jak dla planów.
- Licznik dni-generacji po stronie serwera w czterech trasach LLM, inkrementowany atomowo.
- Reverse trial (pierwszy miesiąc pełny), cena założycielska, stopka na darmowym wydruku.
- Cennik, paywall w momencie planowania drugiego tygodnia, e-mail „zaplanuj następny miesiąc" ok. 20.–25.
- To zamyka Open Roadmap Questions #5 (limit regeneracji).

**Faza 3 — Pro** (po dowiezieniu co najmniej dwóch z nich)

1. Teksty piosenek, wierszyków i zagadek do aktywności (Open Roadmap Questions #9 — wymaga
   `/10x-shape` i przebiegu bramki dla każdego modelu).
2. Cele z podstawy programowej + gotowe wpisy do dziennika.
3. Kilka grup (wymaga profilu grupy — dziś §Parked).
4. Eksport DOCX.

Kolejność ustal po Fazie 0: zapisy „Pro — wkrótce" z informacją, na którą funkcję ktoś czeka, powiedzą,
co budować najpierw.

**Faza 4 — Placówka** (hipoteza): licencje zespołowe, faktura na przedszkole, wgląd dyrektora w plany.
Wymaga ról i współdzielenia — dziś wprost w `prd-v2.md` §Non-Goals.

## 8. Metryki

| Metryka | Po co | Punkt odniesienia |
| --- | --- | --- |
| Aktywacja: % nowych kont, które zaplanowały ≥ 1 tydzień | Czy darmowy plan pokazuje wartość | — |
| % aktywności akceptowanych | Kryterium sukcesu z `idea.md` (75%) i główny wskaźnik jakości, za którą ktoś płaci | 75% |
| Konwersja free → płatny | Czy płot stoi we właściwym miejscu | typowy freemium: 2–5% |
| Retencja płatna M2 i M3 | Czy planowanie skokowe zabija subskrypcje miesięczne | — |
| Udział planów rocznych w sprzedaży | Czy domyślny wybór działa | cel: > 50% |
| Rezygnacje w czerwcu i lipcu | Sezonowość roku szkolnego | — |

## 9. Ryzyka i niewiadome

1. **Chęć płacenia jest niezweryfikowana.** Wszystko powyżej opiera się na cenach konkurencji, nie na
   zachowaniu naszych użytkowników. Faza 0 istnieje właśnie po to.
2. **Kto płaci — nauczycielka czy przedszkole?** Magazyn „Bliżej Przedszkola" bywa kupowany przez
   placówki. Jeśli to przedszkole ma budżet, faktura na placówkę jest ważniejsza niż cena.
3. **Segment, który nie potrzebuje planera.** Przedszkola realizujące program wydawnictwa mają rozkłady
   materiału importowane do e-dziennika. Nasz rynek to prawdopodobnie nauczycielki z własnym programem,
   placówki niepubliczne i osoby, które chcą własnych tematów — do potwierdzenia w rozmowach.
4. **Jakość rdzenia vs cena.** Aktywność „zaśpiewajcie piosenkę" bez tekstu piosenki (12 z 15 w próbce)
   to argument, który przegrywa z gotowym planem PDF za 39 zł. Naprawa (Open Roadmap Questions #9) może
   być warta więcej niż jakakolwiek zmiana cennika.
5. **Kurczący się rynek.** Prognozowany spadek liczby dzieci o ~23% do 2028/29 przełoży się na liczbę nauczycieli.
   Naturalny kierunek rozszerzenia to żłobki (ZabawAIka już tam jest, standardy OWE 2026), ale nasza
   bramka bezpieczeństwa i wytyczne są dziś ustawione na 3–6 lat.
6. **Konkurent AI może zrobić plan miesiąca.** ZabawAIka ma już ręczny plan tygodnia; dołożenie
   generowania go z hasła to dla nich mały krok. Przewagą jest dziś kształt produktu, nie technologia —
   stąd waga szybkiej walidacji.

## 10. Decyzje

Rozstrzygnięte 2026-09-29 — patrz §Decyzje na początku pliku. Kolejność prac, która z nich wynika:
`next-actions.md` §Kolejka po `M-02`.

## Źródła (stan na 2026-09-29)

- ZabawAIka: <https://zabawaika.pl/>, <https://zabawaika.pl/calendar>, <https://zabawaika.pl/my-activities>
- Przygotuj Lekcje: <https://przygotujlekcje.pl/cennik>, <https://przygotujlekcje.pl/faq>
- bliżej MAX: <https://blizejprzedszkola.pl/abonament>; plan miesięczny PDF: <https://blizejprzedszkola.pl/wrzesien-miesieczny-plan-pracy-wychowawczo-dydaktycznej,3,14473.html>; cennik i harmonogram prenumeraty: <https://blizejprzedszkola.pl/upload/files/Cennik.pdf>, <https://blizejprzedszkola.pl/upload/files/harmonogram-wplat.pdf>
- przedszkouczek.pl: <https://przedszkouczek.pl/plany-i-ceny/>, <https://przedszkouczek.pl/jak-sie-zarejestrowac/>
- Plany PDF: <https://zabawydydaktyczne.pl/miesieczny-plan-pracy-czerwiec-2026-p-70.html>, <https://pro-edukacja.pl/sklep/miesieczny-zestaw-zajec-dla-oddzialow-przedszkolnych/>
- ChatGPT w PL: <https://promptowy.com/chatgpt-cena-cennik-plany/>, <https://www.aiobserwator.pl/chatgpt-darmowy-vs-plus-vs-go-vs-pro/>
- MagicSchool: <https://www.magicschool.ai/pricing>, <https://www.openaitoolshub.org/ai-product-research/magicschool-ai>
- E-dzienniki: <https://kidsview.pl/inteligentny-e-dziennik-kidsview/>, <https://www.mobidziennik.pl/dziennik-elektroniczny-dla-przedszkoli>, <https://kidplace.pl/dziennik-elektroniczny/>
- Szkolne AI: <https://edukacja3d.pl/sciobot/>, <https://www.claso.eu/>, <https://chalkie.ai/pl>
- GUS, Edukacja 2025/2026 (wyniki wstępne): <https://stat.gov.pl/files/gfx/portalinformacyjny/pl/defaultaktualnosci/5488/21/4/1/edukacja_w_roku_szkolnym_2025_2026_wyniki_wstepne.pdf>
- Liczba dzieci w przedszkolach i prognoza: <https://strefaedukacji.pl/zla-wiadomosc-dla-nauczycieli-zacznie-sie-w-przedszkolach-i-malych-miejscowosciach/ar/c5p2-28848025>
- Liczba nauczycieli przedszkoli (MEN): <https://naszaszkoladomowa.pl/nauczyciel-wychowania-przedszkolnego-wymagania-zarobki-praca/>
- Wynagrodzenia 2026: <https://radiospacja.pl/ilu-jest-nauczycieli-w-polsce-stan-na-rok-szkolny-20252026/>, <https://lexedu.pl/aktualnosci/limit-wynagrodzenia-w-szkolach-i-przedszkolach-w-roku-2026/>
- Stripe PL: <https://stripe.com/en-pl/pricing>, <https://stripe.com/en-pl/pricing/local-payment-methods>, <https://stripto.pl/stripe-blik>, <https://stripto.pl/platnosci-cykliczne-stripe-faktury>
- Działalność nierejestrowana 2026: <https://plumm.pl/wiedza/dzialalnosc-nierejestrowana>, <https://finansowa-wiedza.pl/dzialalnosc-nierejestrowana-i-kwartalny-limit-przychodu-w-2026-roku-jak-liczyc-sprzedaz-zwroty-i-platnosci-na-przelomie-kwartalow/>
- Koszt wywołania LLM: `context/archive/2026-08-22-first-day-generation/model-comparison.md`, `llm-model-research.md`
