---
date: 2026-09-29T20:40:00+02:00
researcher: Claude (Opus 5.5) z Januszem Guzowskim
git_commit: 7a30f1ac98f1a96fc94abbb3cfc3b75bd630ca79
branch: feat/design-foundation
repository: arantasar/10x-preschool
topic: "Design „Ogród” z design/ — mapa ekranów na aplikację i nowości, których aplikacja jeszcze nie ma"
tags: [research, design, tokens, tailwind, landing, auth, month-grid, week, e2e, m-03]
status: complete
last_updated: 2026-09-29
last_updated_by: Claude (Opus 5.5)
last_updated_note: "Decyzje Janusza w sprawie nowości N1–N7, N9–N10"
---

# Research: Design „Ogród” — mapa na aplikację i nowości z makiet

**Date**: 2026-09-29T20:40:00+02:00
**Researcher**: Claude (Opus 5.5) z Januszem Guzowskim
**Git Commit**: 7a30f1ac98f1a96fc94abbb3cfc3b75bd630ca79
**Branch**: feat/design-foundation
**Repository**: arantasar/10x-preschool

## Research Question

Szczegóły designu są w katalogu `design/`. W widokach może pojawić się kilka nowości i
funkcjonalności, których nie mamy jeszcze w aplikacji. Zidentyfikować je, żeby przegadać, które
warto wrzucić.

## Summary

Pakiet `design/` (README, `src/styles/tokens.css`, 23 komponenty Astro, 15 ekranów PNG + HTML
referencyjny) to **pełny redesign w kierunku „Ogród”**: jasne tło „Owies”, ciemnozielony „Las”,
akcent „Morela”, fonty Young Serif + Nunito Sans. Dzisiejsza aplikacja jest ciemna („kosmiczna”:
`bg-cosmic`, szkło, fiolet), bez własnych fontów, na stockowych zmiennych shadcn.

Trzy wnioski przesądzające o planie:

1. **Makiety zakładają inny model danych niż aplikacja.** Karta propozycji to **jedna aktywność na
   dzień** z **kategorią** (Ruch/Plastyka/Mowa/Odkrywanie/Muzyka), **czasem trwania** i **miejscem**.
   Kontrakt to **dokładnie 3 aktywności na dzień** z polami wyłącznie `title` i `description`
   (`src/lib/day-plan-limits.ts:39`, `day-plan.schema.json:5-25`). Kategorie są wprost w Non-Goals
   (`prd-v2.md:387-389`, roadmapa §Parked „Rodzaje aktywności”), a w kolejce siedzą w Kroku 15 (`M-04`).
2. **Makiety zakładają inny cykl życia propozycji.** „Nic nie trafia do planu bez Twojej
   akceptacji”: propozycja → Zatwierdź → „Zapisz w planie (X)” zapisuje tylko zatwierdzone, usunięta
   ma „Przywróć”. W aplikacji generowanie dnia **zapisuje od razu jako roboczy**
   (`generate.ts:122-141`), zapis tygodnia zapisuje wszystkie dni jako robocze (`week/save.ts`),
   akceptacja to osobny krok na całym dniu, a usunięcie jest nieodwracalne (`index.ts:75-96`).
3. **Komponenty z pakietu nie pasują do stosu 1:1.** To Astro z CSS scoped i hakami `data-action`,
   a interaktywne ekrany (dzień, tydzień, siatka) są wyspami React (`DayPlanEditor.tsx`,
   `WeekPlanBoard.tsx`, `MonthGrid.tsx`), w których komponentów `.astro` użyć nie można. Tokeny trzeba
   przenieść do motywu Tailwind 4 (`@theme` w `src/styles/global.css`) i zmiennych shadcn, a wygląd
   komponentów odtworzyć w Tailwindzie (Astro dla statyki, React dla wysp).

Poza tym makiety zawierają **nowości** (lista w §Nowości do rozmowy). Część jest tania i mieści się
w „zmianie wyglądu” (licznik stanów w legendzie, temat tygodnia w wierszu siatki, CTA pustego
tygodnia). Część zmienia zachowanie i wymaga decyzji (demo na landingu, cykl życia propozycji,
scalony ekran „Nowe propozycje”, kategorie). Ekrany `M-03` (cennik, paywall, FAQ, regulamin,
kontakt, reset hasła) są gotowe do wzięcia przez Kroki 13–14. Paywall i cennik rozjeżdżają się
jednak z `monetization.md` §Decyzje.

## Detailed Findings

### 1. Pakiet designu

- `design/design/README.md` — instrukcja wdrożenia, paleta, kategorie, tabela ekran → komponenty,
  stany propozycji, responsywność (390/768/1440), dostępność (focus 3 px Morela, ≥44 px celu).
- `design/src/styles/tokens.css` — CSS custom properties: kolory, `--cat-*` (5 kategorii + default),
  typografia (clamp), promienie (pigułki, 24–40 px karty), cienie, odstępy, `--page-gutter`,
  `--app-gutter`, `--content-max: 1200px`. Bazowe style `body`, `h1/h2`, `:focus-visible`.
- Komponenty (1136 linii): `ui/` (Button, Icon, Logo, CategoryTag, StatusBadge, ScopeToggle,
  TopicForm, Blob, TextField, Notice, FaqItem), `plan/` (ProposalCard, RemovedProposal, MonthGrid),
  `billing/` (PricingCard, BillingToggle, PaywallDialog), `layout/` (MarketingHeader, SiteFooter,
  AppHeader, AuthSplit, AuthCard, LegalLayout).
- Trasy w README są „propozycją” (`/logowanie`, `/generuj`, `/plan`, `/konto`…). **Nie przyjmujemy
  ich**: `prd-v2.md:262,275-277` chroni adresy trzech ekranów planowania, a e2e jedzie po
  `/auth/signin`, `/plan?date=`, `/plan/week?from=`, `/plan/month?month=`.
- **Dark mode nie istnieje w designie.** Dzisiejsze `.dark` w `global.css` nigdy nie jest włączane.

### 2. Ekrany: makieta ↔ aplikacja

| Makieta | Dziś | Rozjazd |
| --- | --- | --- |
| 01/05 Strona główna | `src/pages/index.astro` + `Welcome.astro` + `Topbar.astro` — statyczny marketing, 2 CTA, 3 kafelki | pole tematu + „Wygeneruj propozycje” dla anonimowego, na mobile z akcjami Zatwierdź/Zmień/usuń; sekcja „Jak to działa”, podgląd miesiąca, „Zobacz przykładowy plan”, ciemny pas CTA, stopka z linkami |
| 02 Logowanie | `auth/signin.astro` + `SignInForm.tsx` | układ split z ciemnym panelem; **„Nie wylogowuj mnie”**, **„Nie pamiętasz hasła?”**; etykieta „E-mail” zamiast „Adres e-mail”; nagłówek „Witaj ponownie” |
| 06 Rejestracja | `auth/signup.astro` + `SignUpForm.tsx` | funkcjonalnie zgodne („Powtórz hasło” już jest). Podpowiedź wymagań — realnie „co najmniej 6 znaków” (`SignUpForm.tsx:8`) |
| 03 Nowe propozycje `/generuj` | `/plan` (dzień, `DayPlanEditor.tsx`) i `/plan/week` (`WeekPlanBoard.tsx`) — dwa ekrany | **jeden** ekran z przełącznikiem „Jeden dzień / Cały tydzień” i selectem tygodnia; 1 aktywność na dzień z kategorią i czasem; stany pending/approved/removed; „X z 5 zatwierdzone”, „Zatwierdź wszystkie”, „Zapisz w planie (X)” |
| 04 Plan miesiąca | `/plan/month` + `MonthGrid.tsx` | kolumny tylko pn–pt (dziś 7 z weekendem); **temat tygodnia w nagłówku wiersza**; **legenda z licznikami** (zatwierdzone / do przejrzenia / bez planu); **pusty tydzień = jedna szeroka komórka z CTA**; kategoria w komórce; brak przycisków PDF |
| Pasek aplikacji | `AppHeader.astro` — nazwa, e-mail, „Wyloguj się” | nawigacja „Plan miesiąca / Nowe propozycje” z aktywną pigułką, **awatar → `/konto`** (strona nie istnieje) |
| 07 Cennik, 08 Paywall, 09 FAQ, 10 Regulamin, 11/11b Kontakt, 12/12b/13 Reset hasła | brak | wszystkie nowe — zakres `M-03` (Kroki 13–14) |

### 3. Model danych a makiety (fakty)

- Tabele: tylko `day_plans` i `activities`
  (`supabase/migrations/20260718211452_day_plans_and_activities.sql:22-69`).
- Dzień: `prompt` (hasło), `theme` (zawężenie dnia z outline'u tygodnia,
  `20260823232953_day_theme_and_absent_guard.sql:50-60`), `accepted_at` (binarny stan
  roboczy/zaakceptowany), `current_generation`.
- Aktywność: `title`, `description`, `ordinal`. **Brak kategorii, czasu trwania, miejsca i materiałów.**
  Prompt prosi tylko prozą o zróżnicowanie form (`day-plan.pl.md:27-28`).
- **Nie ma encji tygodnia.** „Temat tygodnia” istnieje tylko pośrednio: to samo `prompt` jest
  kopiowane na każdy dzień zapisu tygodnia (`20260929120000_week_writer_consent_versions.sql:136-137`).
  Wiersz siatki z tematem da się **wyprowadzić** z danych bez migracji (np. wspólny prompt dni
  tygodnia), ale tydzień o mieszanych hasłach nie ma jednego tematu.
- Stan „usunięto + Przywróć” nie ma odpowiednika: nie ma soft-delete, a usunięcie kasuje dzień
  kaskadowo. Tekst potwierdzenia mówi „Tej operacji nie można cofnąć.” (`week-day-controls.ts:33-42`).
  „Undo” jest na liście Parked w roadmapie.
- Tydzień trzyma niezapisane propozycje w pamięci wyspy do „Zapisz tydzień” (`week/day.ts:9-27`,
  `WeekPlanBoard.tsx:37-51,297-303`). To najbliższy odpowiednik „Zapisz w planie”, ale zapisuje
  wszystko jako robocze, bez filtra akceptacji (`src/lib/week-generation.ts:55-72`).
- Dane siatki: `DayPlanSummary {plan_date, prompt, accepted, theme}` (`src/types.ts:114-126`).
  Liczniki „zatwierdzone / robocze / bez planu” da się policzyć z tego, co strona już ma. Dziś jest
  tylko `plannedCount` (`month.astro:41,56-58`).
- Brak resetu hasła, „remember me”, wysyłki e-maili, planów, subskrypcji i liczników zużycia.
  `src/lib/supabase.ts:10-23` przekazuje opcje ciasteczek bez zmian.

### 4. Ograniczenia, których redesign nie może złamać

**E2E (`tests/e2e/`)** — `E2E-RULES.md:8-10` wymaga lokatorów po rolach, etykietach i tekście. Wiążą:
- `/auth/signin`: etykiety **„Adres e-mail”**, **„Hasło”** (exact), przycisk „Zaloguj się”. Po
  zalogowaniu musi być **widoczny przycisk „Wyloguj się”** (`auth.setup.ts:22-34`). Awatar
  z ukrytym menu łamie setup wszystkich testów.
- `/plan?date=`: tytuły aktywności jako **nagłówki**, etykieta „Hasło dnia”, „Usuń plan dnia”,
  `Edytuj propozycję: {tytuł}`, „Tytuł”, „Zapisz”, teksty „Plan zaakceptowany”, „Plan roboczy”,
  „Akceptacja została cofnięta…”, „Akceptuj ponownie”.
- `/plan/week?from=`: karta dnia = `listitem` z nagłówkiem `dayLabel` (pełna polska data), przyciski
  `Usuń plan dnia: …`, `Cofnij akceptację: …`, `Akceptuj dzień: …`, `role=status` z „Usunięto” /
  „Cofnięto akceptację”, przyciski PDF „Pobierz PDF — dzień na stronę” / „— tydzień na stronie”.
- `/plan/month?month=`: kafelek = `link` o nazwie `/^Plan na {iso} /` (`src/lib/month-grid.ts:64-70`),
  `role=tooltip` podglądu, Tab i Esc, nagłówek „Plan miesiąca”, przyciski PDF „— siatka miesiąca” /
  „— tygodniami”.
- `window.confirm` w potwierdzeniach (`E2E-RULES.md:88-93`). Zamiana na `<dialog>` wymaga zmiany testów.
- `waitForIslands` zależy od `astro-island[ssr]` (`E2E-RULES.md:71-84`).

**PRD v2:**
- adresy i punkty wejścia dzień / tydzień / miesiąc; kliknięcie kafelka otwiera dzień (`:262,275-277`);
- „pełny miesiąc bez przewijania na tej samej szerokości; ustępuje podtytuł dnia” (`:321-323`, FR-011
  `:183-187`); dziś siatka ma 558 px przy 1024–1440 (archiwum `month-day-preview` plan.md:412-414);
- podgląd dnia z klawiatury (`:324-325`); dostęp tylko dla zalogowanych, brak powierzchni
  anonimowej (`:367-372`); rodzaje aktywności i wytyczne generowania bez zmian (`:387-389`).

**Archiwum:**
- `pl-landing-copy` plan.md:104-105,184-185: kafelki landingu **nie obiecują funkcji, których nie ma**.
- `month-home` plan.md:37-41: różne szerokości kontenerów trzech ekranów są celowe.
- `week-level-plan-controls` plan.md:45: bez nowych komponentów shadcn (menu, AlertDialog).
- `week-print` plan.md:43: wydruk tylko przez PDF, który ma własny silnik (`src/lib/plan-pdf/`)
  i nie dziedziczy CSS.

### 5. Funkcje aplikacji, których makiety nie pokazują (muszą zostać)

Makieta nie może ich wyrzucić. Plan musi dla nich zaprojektować miejsce w nowym języku wizualnym:
- „Zapytaj model” / „Polecenie dla modelu” (poprawka aktywności, `S-15`, `DayPlanEditor.tsx:847-991`);
- edycja inline „Tytuł”/„Opis” z „Zapisz”/„Anuluj”;
- wybór daty dnia (`type=date`), „← Wróć do miesiąca”, poprzedni/następny tydzień i miesiąc;
- przyciski PDF na tygodniu i miesiącu;
- `GenerationProgress` (etapy i zegar — wymóg jakościowy `prd-v2.md:309`);
- banery akceptacji i ostrzeżenie o niezapisanych dniach tygodnia;
- weekendy w siatce: dzień weekendowy da się zaplanować z widoku dnia, a legenda dziś to mówi;
- „Usuń plan dnia”;
- podgląd dnia na hoverze / focusie.

### 6. Monetyzacja: makiety vs `monetization.md` §Decyzje

| Makieta | Decyzja z 2026-09-29 |
| --- | --- |
| Paywall: „Pierwszy tydzień planowania był bezpłatny” | **pierwszy miesiąc pełny Basic bez karty, potem tydzień w miesiącu** (ad 3) |
| Cennik: domyślnie „Miesięcznie”, drugi „Rocznie” | **rok szkolny domyślny** (§4.4), ceny roczne 159/119 zł |
| Plany „Na start 0 zł” / „Pełny dostęp [XX] zł” | Free / Basic 19,99 zł, **cena założycielska 14,99/119 zł**, Pro „wkrótce” |
| — | gwarancja zwrotu 14 dni, stopka na darmowym wydruku, stan „pierwszy miesiąc pełny” i licznik darmowego tygodnia — `next-actions.md` Krok 10 prosił o nie w zakresie projektu, ale **makiet tych stanów nie ma** |
| Faktura dla przedszkola (FAQ) | B2C, faktura na przedszkole poza zakresem (ad 4) |

To nie blokuje `design-foundation` (Kroki 13–14 i tak idą po PRD v3), ale treść paywalla i cennika
trzeba poprawić przy ich slice'ach.

## Nowości do rozmowy

Każda pozycja ma rekomendację. „Teraz” = mieści się w Kroku 10 bez zmiany FR; „M-03/M-04” = do
shape'u właściwego kamienia; „odrzucić” = zostaje w makiecie, nie w produkcie.

| # | Nowość z makiety | Koszt / ryzyko | Rekomendacja |
| --- | --- | --- | --- |
| N1 | **Pole tematu na landingu + generowanie dla anonimowego** (01, 05) | łamie model dostępu PRD; koszt LLM bez konta, nadużycia (Turnstile), bramka bezpieczeństwa zawieszona | teraz: pole, które **przenosi hasło do rejestracji** (`/auth/signup?haslo=…` → po pierwszym logowaniu prefill), bez LLM; prawdziwe demo → temat do shape `M-03` |
| N2 | **Kategoria aktywności + czas trwania + miejsce** na karcie | zmiana kontraktu LLM, schematu DB, bramki dla każdego modelu (`lessons.md` §3); Non-Goal PRD | **M-04 (Krok 15, „rodzaje aktywności”)**; teraz karta bez tagów, a `CategoryTag` i tokeny `--cat-*` czekają |
| N3 | **Jedna aktywność na dzień** na karcie | sprzeczne z kontraktem 3/dzień | odrzucić dla danych; kartę dnia przerobić na 3 aktywności (nagłówek dnia + lista) |
| N4 | **Temat tygodnia w nagłówku wiersza siatki** (04) | danych brak jako encji; da się wyprowadzić ze wspólnego `prompt` dni tygodnia | teraz, jako wyprowadzenie (mieszany tydzień → brak etykiety albo pierwsze hasło); **sprawdzić warunek „miesiąc bez przewijania”** |
| N5 | **Legenda z licznikami** (zatwierdzone / do przejrzenia / bez planu) | tanie — liczone z `DayPlanSummary` | teraz |
| N6 | **Pusty tydzień jako jedna szeroka komórka z CTA** „Wpisz hasło na …” | zmienia strukturę kafelków (każdy dzień to dziś link `Plan na …`, testowany) | teraz, ale tylko gdy **wszystkie** dni tygodnia są puste; kafelki dni zostają linkami (a11y i e2e) — do decyzji w planie |
| N7 | **Siatka tylko pn–pt** | ukrywa weekendowe plany, które da się dziś utworzyć | odrzucić albo zostawić weekend w zwężonej kolumnie — do decyzji |
| N8 | **Scalony ekran „Nowe propozycje”** z przełącznikiem dzień/tydzień i selectem tygodnia | adresy chronione przez PRD; dwie wyspy o różnych kontraktach | nie scalać; nawigacja w pasku: „Plan miesiąca” → `/plan/month`, „Nowe propozycje” → `/plan/week` bieżącego tygodnia; `ScopeToggle` jako **linki** między `/plan` a `/plan/week` |
| N9 | **Cykl życia „zatwierdź → Zapisz w planie (X)”** (zapisuje tylko zatwierdzone) | zmiana zachowania zapisu tygodnia i dnia, dotyka ochrony „zapisana partia = ostatnia generacja” | odrzucić dla Kroku 10 (zostaje: roboczy/zaakceptowany + „Akceptuj tydzień (N)”); ewentualnie osobny temat, bo obietnica „nic nie trafia do planu bez akceptacji” dziś **nie jest prawdziwa** — copy landingu musi to uwzględnić |
| N10 | **„Usunięto … — Przywróć”** | brak soft-delete; „undo” na liście Parked | odrzucić teraz; potem ewentualnie undo tylko dla niezapisanych propozycji tygodnia (tanie, w pamięci wyspy) |
| N11 | **„Zatwierdź wszystkie”** | = istniejące „Akceptuj tydzień (N)” | teraz, jako restyle; nazwy nie wiąże żaden test |
| N12 | **Awatar → `/konto`** | strona konta nie istnieje; e2e wymaga widocznego „Wyloguj się” | teraz: awatar + e-mail + widoczny „Wyloguj się”; strona konta → `M-03` (zarządzanie subskrypcją, usunięcie konta z FAQ) |
| N13 | **„Nie wylogowuj mnie”** | wymaga sterowania `maxAge` ciasteczek Supabase; dziś sesja i tak trwa | odrzucić (bez tego pola) albo mały osobny slice |
| N14 | **„Nie pamiętasz hasła?” + ekrany 12/12b/13** | reset hasła = Open Roadmap Question #4, `M-03` | link dopiero z slice'em resetu (Krok 13); teraz go nie pokazywać |
| N15 | **Stopka z Cennik/FAQ/Regulamin/Kontakt** | strony nie istnieją | teraz stopka bez martwych linków; linki dochodzą z slice'ami `M-03` |
| N16 | **„Zobacz przykładowy plan”** (landing) | nowa strona lub statyczny podgląd | teraz jako statyczna ilustracja w sekcji (bez osobnej trasy) albo pominąć |
| N17 | Cennik, paywall, FAQ, regulamin, kontakt | nowe ekrany | `M-03`, Kroki 13–14; treść paywalla/cennika do zgrania z §Decyzje (§6) |

## Code References

Permalinki do commita `7a30f1a` (na `master`):

- [src/styles/global.css](https://github.com/arantasar/10x-preschool/blob/7a30f1ac98f1a96fc94abbb3cfc3b75bd630ca79/src/styles/global.css) — shadcn neutral oklch `:root`/`.dark` (6-73), `@theme inline` (75-111), `bg-cosmic` (113-115)
- [src/layouts/Layout.astro](https://github.com/arantasar/10x-preschool/blob/7a30f1ac98f1a96fc94abbb3cfc3b75bd630ca79/src/layouts/Layout.astro) — `lang="pl"`, banery konfiguracji, bez nagłówka/stopki
- [src/components/Welcome.astro](https://github.com/arantasar/10x-preschool/blob/7a30f1ac98f1a96fc94abbb3cfc3b75bd630ca79/src/components/Welcome.astro#L28-L127) — landing: H1, lead, 2 CTA, 3 kafelki
- [src/components/AppHeader.astro](https://github.com/arantasar/10x-preschool/blob/7a30f1ac98f1a96fc94abbb3cfc3b75bd630ca79/src/components/AppHeader.astro#L12-L19) — nazwa, e-mail, „Wyloguj się”
- [src/components/auth/SignInForm.tsx](https://github.com/arantasar/10x-preschool/blob/7a30f1ac98f1a96fc94abbb3cfc3b75bd630ca79/src/components/auth/SignInForm.tsx#L44-L84) — pola i przycisk logowania
- [src/components/auth/SignUpForm.tsx](https://github.com/arantasar/10x-preschool/blob/7a30f1ac98f1a96fc94abbb3cfc3b75bd630ca79/src/components/auth/SignUpForm.tsx#L8) — minimum 6 znaków
- [src/components/plan/DayPlanEditor.tsx](https://github.com/arantasar/10x-preschool/blob/7a30f1ac98f1a96fc94abbb3cfc3b75bd630ca79/src/components/plan/DayPlanEditor.tsx#L488-L991) — formularz, baner akceptacji, lista, edytor, „Zapytaj model”
- [src/components/plan/WeekPlanBoard.tsx](https://github.com/arantasar/10x-preschool/blob/7a30f1ac98f1a96fc94abbb3cfc3b75bd630ca79/src/components/plan/WeekPlanBoard.tsx#L862-L1035) — formularz tygodnia, licznik, akcje zbiorcze, PDF
- [src/components/plan/WeekDayCard.tsx](https://github.com/arantasar/10x-preschool/blob/7a30f1ac98f1a96fc94abbb3cfc3b75bd630ca79/src/components/plan/WeekDayCard.tsx#L133-L324) — karta dnia, odznaki, akcje
- [src/components/plan/MonthGrid.tsx](https://github.com/arantasar/10x-preschool/blob/7a30f1ac98f1a96fc94abbb3cfc3b75bd630ca79/src/components/plan/MonthGrid.tsx#L78-L191) — kafelki, podgląd, „Zaplanuj tydzień”, legenda
- [src/lib/month-grid.ts](https://github.com/arantasar/10x-preschool/blob/7a30f1ac98f1a96fc94abbb3cfc3b75bd630ca79/src/lib/month-grid.ts#L64-L70) — `tileLabel` (nazwa dostępna wiązana przez e2e)
- [src/pages/plan/month.astro](https://github.com/arantasar/10x-preschool/blob/7a30f1ac98f1a96fc94abbb3cfc3b75bd630ca79/src/pages/plan/month.astro#L41-L107) — licznik, nawigacja, PDF, siatka
- [src/lib/day-plan-limits.ts](https://github.com/arantasar/10x-preschool/blob/7a30f1ac98f1a96fc94abbb3cfc3b75bd630ca79/src/lib/day-plan-limits.ts#L39) — `ACTIVITY_COUNT = 3`
- [src/lib/services/prompts/day-plan.schema.json](https://github.com/arantasar/10x-preschool/blob/7a30f1ac98f1a96fc94abbb3cfc3b75bd630ca79/src/lib/services/prompts/day-plan.schema.json) — `tytul`, `opis`, `additionalProperties: false`
- [src/pages/api/day-plan/generate.ts](https://github.com/arantasar/10x-preschool/blob/7a30f1ac98f1a96fc94abbb3cfc3b75bd630ca79/src/pages/api/day-plan/generate.ts#L122-L141) — zapis od razu jako roboczy
- [src/lib/week-generation.ts](https://github.com/arantasar/10x-preschool/blob/7a30f1ac98f1a96fc94abbb3cfc3b75bd630ca79/src/lib/week-generation.ts#L55-L72) — które dni zapis tygodnia obejmuje
- [src/types.ts](https://github.com/arantasar/10x-preschool/blob/7a30f1ac98f1a96fc94abbb3cfc3b75bd630ca79/src/types.ts#L114-L138) — `DayPlanSummary`, `PlanAcceptance`
- [tests/e2e/auth.setup.ts](https://github.com/arantasar/10x-preschool/blob/7a30f1ac98f1a96fc94abbb3cfc3b75bd630ca79/tests/e2e/auth.setup.ts#L22-L34) — etykiety logowania, „Wyloguj się”
- `design/design/README.md`, `design/src/styles/tokens.css`, `design/src/components/**` — pakiet designu (nieśledzony, w tej gałęzi)

## Architecture Insights

- **Tokeny → Tailwind 4 + shadcn.** Rozsądna ścieżka: `tokens.css` jako źródło wartości, przeniesione
  do `@theme` (kolory `--color-*`, fonty, promienie) i do zmiennych shadcn (`--background` = Owies,
  `--foreground` = Las, `--primary` = Las, `--accent` = Morela, `--ring` = Morela, `--radius`).
  Wtedy `button.tsx` i klasy `bg-background`/`text-foreground` dziedziczą nowy wygląd, jak zakłada
  `next-actions.md` Krok 10 („reszta aplikacji dziedziczy przez tokeny”). **Uwaga:** komponenty
  planera mają dziś zaszyte klasy literalne (`bg-purple-600`, `text-white`, `bg-white/10`,
  `bg-cosmic`), więc po samej zmianie tokenów ekrany planowania będą **mieszanką jasnego tła i
  ciemnych kart**. Trzeba zdecydować, czy `design-foundation` zostawia `bg-cosmic` na `/plan*` do
  `design-planner`, czy przemalowuje wszystko naraz.
- **Komponenty z pakietu = specyfikacja, nie kod do skopiowania.** Instrukcja z README („skopiuj
  `src/components/**`”) koliduje z `CLAUDE.md` (Tailwind + `cn()`, React dla interakcji,
  shadcn w `src/components/ui/`). Statyczne (`Logo`, `Blob`, `SiteFooter`, `MarketingHeader`,
  `AuthSplit`, `FaqItem`, `LegalLayout`, `Notice`) mogą zostać Astro, przepisane na Tailwind.
  Interaktywne (karta propozycji, siatka, przełączniki) — jako React w istniejących wyspach.
- **Fonty:** `@fontsource/young-serif` + `@fontsource-variable/nunito-sans` (self-hosting,
  wariant A z README) pasuje do Workers i nie dodaje zewnętrznych domen.
- **Kontrast i focus:** paleta jest sprawdzona (README §6). Focus 3 px Morela zastępuje
  `outline-ring/50` shadcn. Morela tylko z ciemnym tekstem.
- **Przerywana ramka** w makiecie siatki oznacza „do przejrzenia” (dziś fioletowy „roboczy”), a
  pełna zielona — „zatwierdzone”. To mapuje się 1:1 na `accepted` i nie wymaga danych.

## Historical Context (from prior changes)

- `context/archive/2026-08-30-pl-landing-copy/plan.md:88-105` — landing zmieniony tylko w copy;
  warstwa wizualna świadomie poza zakresem; reguła „kafelki nie obiecują niezbudowanych funkcji”.
- `context/archive/2026-08-26-month-home/plan.md:37-49,88` — wspólny `AppHeader`, różne szerokości
  kontenerów, brak wspólnego wrappera; ochrona prefiksem `/plan`.
- `context/archive/2026-09-23-month-day-preview/plan.md:33-59,156-176,412-414` — siatka jako wyspa,
  kafelki `h-16`, 558 px, popover obok `<a>`, brak podglądu dotykowego i przebudowy mobilnej.
- `context/archive/2026-09-23-week-level-plan-controls/plan.md:45` — bez nowych komponentów shadcn.
- `context/archive/2026-09-27-week-print/plan.md:43` — wydruk tylko przez PDF.
- `context/archive/2026-08-22-first-day-generation/plan.md:193` — kontrakt 3 aktywności na dzień.
- `context/foundation/next-actions.md:297-341` — Krok 10: bez PRD, dwie zmiany
  (`design-foundation`, `design-planner`), ostrzeżenia o e2e, PDF, copy i warunkach siatki.
- `context/foundation/monetization.md:17-46,204-290` — decyzje o planach, cenach i paywallu.

## Related Research

- `context/archive/2026-09-23-month-day-preview/research.md` — siatka i podgląd dnia.
- `context/archive/2026-08-30-pl-landing-copy/` — ostatnia zmiana landingu.

## Open Questions

1. Które nowości z tabeli N1–N17 wchodzą do Kroku 10 (decyzje do rozmowy z Januszem).
2. Czy `design-foundation` przemalowuje już ekrany `/plan*` (choćby tło i header), czy zostawia
   `bg-cosmic` do `design-planner` — i jak wygląda aplikacja między dwoma merge'ami (merge = produkcja).
3. Czy wysokość siatki w nowym wyglądzie (większe kafelki, temat w wierszu) mieści się w warunku
   „pełny miesiąc bez przewijania” — do zmierzenia w planie `design-planner`.
4. Etykieta „E-mail” (makieta) vs „Adres e-mail” (e2e) — rekomendacja: zostaje „Adres e-mail”.
5. Czy landing z copy „Nic nie trafia do planu bez Twojej akceptacji” jest prawdziwy przy obecnym
   zapisie roboczym — do przeredagowania.
6. Kolejność względem Kroku 11: treść paywalla i cennika po walidacji cen (cena założycielska, rok szkolny).

## Follow-up Research 2026-09-29T20:50:00+02:00 — decyzje w sprawie nowości

Decyzje Janusza z rozmowy po researchu:

| # | Decyzja |
| --- | --- |
| N1 | **Pole tematu na landingu przenosi hasło do rejestracji** (bez LLM dla anonimowego). Hasło jedzie parametrem do `/auth/signup`, po pierwszym logowaniu wypełnia formularz generowania. Prawdziwe demo bez konta nie jest w zakresie. |
| N2 | **Kategorie i czas trwania → `M-04` (Krok 15).** Teraz karty bez tagów; `--cat-*` i `CategoryTag` czekają. |
| N3 | Kontrakt 3 aktywności na dzień zostaje; karta dnia pokazuje 3 aktywności (wynika z N2). |
| N9, N10 | **Zostaje obecny model** roboczy/zaakceptowany + „Akceptuj tydzień (N)” w nowym wyglądzie. Bez „Zapisz w planie (X)” i bez „Przywróć”. **Copy landingu i „Jak to działa” nie może obiecywać „nic nie trafia do planu bez Twojej akceptacji”** — przeredagować (np. „Ty decydujesz, co zatwierdzasz”). |
| N4 | **Temat tygodnia w nagłówku wiersza siatki** — wyprowadzony z danych (wspólne hasło dni tygodnia), bez migracji; tydzień mieszany → etykieta zastępcza do ustalenia w planie. |
| N5 | **Legenda z licznikami** zatwierdzone / do przejrzenia / bez planu. |
| N6 | **Pusty tydzień = jedna szeroka komórka z CTA** do `/plan/week?from=…`, gdy wszystkie dni tygodnia są puste. |
| N7 | **Siatka tylko pn–pt.** Konsekwencje do obsłużenia w planie: plany weekendowe (tworzone z `/plan?date=`) znikają z siatki, ale zostają w bazie i w PDF miesiąca → sygnał w UI (np. dopisek przy legendzie z liczbą planów weekendowych i linkiem do dnia); zmienia się legenda „weekend — poza generowaniem tygodnia”; sprawdzić testy `month-day-preview` pod kątem dat weekendowych. |

Przyjęte domyślnie (rekomendacje z tabeli, bez sprzeciwu — do korekty w planie):

- N8 — bez scalania ekranów; pasek: „Plan miesiąca” → `/plan/month`, „Nowe propozycje” → `/plan/week` bieżącego tygodnia; przełącznik dzień/tydzień jako linki.
- N11 — „Zatwierdź wszystkie” = restyle „Akceptuj tydzień (N)” (nazwa do decyzji; e2e jej nie wiąże).
- N12 — awatar + e-mail + **widoczny** „Wyloguj się”; strona `/konto` → `M-03`.
- N13 — bez „Nie wylogowuj mnie”.
- N14 — bez „Nie pamiętasz hasła?” do slice'u resetu hasła.
- N15 — stopka bez martwych linków.
- N16 — „Zobacz przykładowy plan” jako statyczna ilustracja albo pominięte.
- N17 — ekrany `M-03` poza tą zmianą; przy ich slice'ach zgrać treść z `monetization.md` §Decyzje.

Nadal otwarte: Open Questions 2 (czy `design-foundation` dotyka `/plan*`) i 3 (wysokość siatki).
