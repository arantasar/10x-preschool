# Regulamin i polityka prywatności (S-20) — Implementation Plan

## Overview

Publikujemy pierwszą wersję regulaminu i polityki prywatności Temio (FR-025), napisaną bez prawnika
(`drafts/README.md`). Strony są publiczne, rejestracja wymaga akceptacji regulaminu, a produkt
zostaje zrównany z tym, co teksty o nim mówią — bo każde zdanie o działaniu Temio ma być prawdziwe
w dniu publikacji, tak jak odpowiedzi w FAQ.

## Current State Analysis

- Treść obu dokumentów istnieje jako szkice: `context/changes/legal-pages/drafts/{regulamin,polityka-prywatnosci}.md`.
  Jedyny brakujący element to data wejścia w życie (`⟦DATA WEJŚCIA W ŻYCIE⟧`).
- Nie ma stron `/regulamin` ani `/polityka-prywatnosci` (produkcja zwraca 404).
- Paczka designu ma `LegalLayout.astro` (spis treści + tekst, ≤ 900 px spis nad tekstem) i makietę
  `10-regulamin.html`; README designu zaleca treść w Markdown (`context/foundation/design/design/README.md:146`).
- Rejestracja (`src/components/auth/SignUpForm.tsx`, `src/pages/api/auth/signup.ts`) nie zbiera
  żadnej akceptacji.
- Planner nigdzie nie mówi, że propozycje pisze AI — tylko FAQ (`src/lib/faq.ts:41,47`).
- FAQ „Jak usunąć konto?” (`src/lib/faq.ts:79-87`) opisuje stan sprzed S-18 (prośba przez formularz).
- `auth.audit_log_entries` w Supabase przechowuje IP bezterminowo — sprzeczne z polityką (pkt 2.6, 8).
- `CONTACT_TO` przełączony na `kontakt@temio.pl` (2026-10-17, przed planem).

## Desired End State

Odwiedzający bez konta czyta regulamin i politykę pod stałymi adresami, dojdzie do nich ze stopki,
z notki formularza kontaktowego i z formularza rejestracji. Nowe konto nie powstanie bez
zaznaczenia akceptacji, a wersja i data akceptacji są zapisane przy koncie. Planner mówi wprost, że
propozycje pisze AI. FAQ zgadza się z regulaminem. Historia logowań nie trzyma IP dłużej niż 7 dni.
Obecne konta dostały e-mail, a regulamin wiąże je 14 dni po wysyłce.

Weryfikacja: `npm run test`, `npm run lint`, `npm run build`, e2e `legal-pages.spec.ts` zielone;
ręcznie — strony na telefonie i desktopie, rejestracja bez checkboxa odrzucona, wiersz
`auth.audit_log_entries` nie przybywa po zalogowaniu na produkcji.

### Key Discoveries:

- Astro renderuje importowany `.md` natywnie: `import { Content, getHeadings, frontmatter } from "…md"` —
  nagłówki dostają `id` ze slugów, `getHeadings()` daje spis treści bez ręcznych kotwic.
- Publiczna strona to `Layout` + `MarketingHeader` + `SiteFooter` (wzór: `src/pages/pomoc.astro`).
- `SiteFooter.astro` mówi wprost, że link „Regulamin” przychodzi z S-20 („A dead link is worse than none”).
- `?error=` na `/auth/signup` niesie kod tłumaczony przez `src/lib/auth-error-messages.ts` — nowy kod
  dla braku akceptacji idzie tam jako stała + wpis w mapie.
- Testy tras: wzór `src/pages/api/auth/change-password.test.ts`; e2e: `tests/e2e/help-and-contact.spec.ts`,
  reguły w `tests/e2e/E2E-RULES.md`.

## What We're NOT Doing

- Cennik, zapis na cenę założycielską, płatności — sekcje dopiszą S-22 / S-25 / S-26.
- Ponowna akceptacja przez obecne konta (blokujący ekran po zalogowaniu) — wystarcza e-mail
  z 14-dniowym wyprzedzeniem i prawo usunięcia konta (§ 13, § 14).
- Wersjonowane archiwum poprzednich regulaminów na stronie — § 13 ust. 5 obiecuje je „na żądanie”.
- Skrypt masowej wysyłki — e-mail idzie ręcznie z `kontakt@temio.pl`.
- Oznaczenie maszynowe treści AI (AI Act art. 50 ust. 2) — ryzyko zapisane w `drafts/README.md`.
- Panel zgód cookies — są wyłącznie niezbędne.

## Implementation Approach

Treść jest Markdownem w `src/content/legal/`, a stałe wersji i dat w jednym module, którego używają
strony i rejestracja — tak, żeby podbicie wersji regulaminu było jedną zmianą. Kolejność faz: najpierw
strony (wszystko inne do nich linkuje), potem akceptacja, potem zrównanie produktu z tekstem, na
końcu wydanie z czynnościami produkcyjnymi w ściśle określonej kolejności.

## Critical Implementation Details

**Kolejność wydania.** Merge do `master` jest wydaniem. Wyłączenie zapisu historii logowań i usunięcie
starych wierszy musi nastąpić **przed** merge'em, inaczej polityka od pierwszej minuty obiecuje
„nie dłużej niż 7 dni” nieprawdziwie. Data publikacji wpisana w treść musi być dniem merge'u, a e-mail
do obecnych kont wychodzi tego samego dnia — od niego liczy się 14 dni.

**`user_metadata` nie jest dowodem nie do podważenia.** Użytkownik może je nadpisać własną sesją
(`updateUser({ data })`). Zapis wersji to ślad akceptacji, nie zabezpieczenie — nie opieramy na nim
żadnej logiki dostępu.

## Phase 1: Strony prawne

### Overview

`/regulamin` i `/polityka-prywatnosci` renderują treść z Markdown w układzie z makiety 10, z linkami
w stopce i w notce formularza kontaktowego.

### Changes Required:

#### 1. Treść

**File**: `src/content/legal/regulamin.md`, `src/content/legal/polityka-prywatnosci.md` (przeniesione z `drafts/`)

**Intent**: Treść dokumentów żyje w `src/`, a nie w `context/`. Szkice w `drafts/` zostają usunięte po przeniesieniu (README zostaje).

**Contract**: Bez nagłówka `#` i linii „Wersja · obowiązuje od” — tytuł i daty renderuje strona z `src/lib/legal.ts`. Nagłówki `##` to pozycje spisu treści. Linki wewnętrzne względne (`/regulamin`, `/polityka-prywatnosci`). Regulamin § 14 ust. 5 przepisany na dwie daty: wchodzi w życie z dniem publikacji; wobec Kont założonych przed tym dniem — po 14 dniach od zawiadomienia e-mailem. Daty w tekście nie są wpisane na sztywno — patrz kontrakt `legal.ts` (placeholder w treści zastępowany przy renderze albo zdanie odsyłające do daty w nagłówku strony; wybór należy do implementującego, byle była jedna wartość źródłowa).

#### 2. Stałe dokumentów

**File**: `src/lib/legal.ts`

**Intent**: Jedno miejsce na wersję i daty obu dokumentów oraz ścieżki stron.

**Contract**: `TERMS_VERSION = "1.0"`, `TERMS_PUBLISHED_ON` (data publikacji, ISO), `TERMS_BINDS_EXISTING_ON` (+14 dni), `PRIVACY_VERSION`, `PRIVACY_PUBLISHED_ON`, `TERMS_PATH = "/regulamin"`, `PRIVACY_PATH = "/polityka-prywatnosci"`. Daty formatowane po polsku w jednym helperze (np. „17 października 2026”). Do Fazy 4 data to bieżąca data robocza; Faza 4 ustawia ją na dzień merge'u.

#### 3. Układ długiego tekstu

**File**: `src/components/layout/LegalLayout.astro`

**Intent**: Port `context/foundation/design/src/components/layout/LegalLayout.astro` na tokeny Tailwind projektu, z tymi samymi propsami (`title`, `toc`, `effectiveDate`, `version`).

**Contract**: Spis treści z `getHeadings()` filtrowanych do `depth === 2`. Blockquote „Najważniejsze w skrócie” stylowany jak `Notice tone="info"` z paczki designu. Tabele (polityka pkt 3, 7) czytelne na 360 px — przewijane poziomo w obrębie tabeli, nie strony. Pod tekstem: „Masz pytanie do regulaminu? Napisz do nas” → `/kontakt` (makieta 10).

#### 4. Strony

**File**: `src/pages/regulamin.astro`, `src/pages/polityka-prywatnosci.astro`

**Intent**: Publiczne, indeksowane strony wzorem `pomoc.astro` (`Layout` + `MarketingHeader` + `SiteFooter`), z tytułem i opisem dla SEO (`seo-meta`).

**Contract**: Obie ścieżki poza `PROTECTED_ROUTES`. `MarketingHeader` bez aktywnej pozycji (nie ma ich w nawigacji głównej).

#### 5. Linki

**File**: `src/components/layout/SiteFooter.astro`, `src/components/contact/ContactForm.tsx:306`

**Intent**: Stopka dostaje „Regulamin” i „Polityka prywatności”; notka formularza kontaktowego linkuje do polityki (rozstrzygnięcie S-19 z 2026-10-09). Komentarz w stopce zaktualizowany (zostaje tylko „Cennik with S-22”).

**Contract**: Ścieżki z `src/lib/legal.ts`.

### Success Criteria:

#### Automated Verification:

- Build przechodzi: `npm run build`
- Lint przechodzi: `npm run lint`
- Testy jednostkowe przechodzą: `npm run test` (w tym test helpera daty po polsku)
- E2E: `npx playwright test tests/e2e/legal-pages.spec.ts` — obie strony odpowiadają bez logowania, mają nagłówek `h1`, spis treści prowadzi do sekcji, stopka linkuje do obu
- Szkice usunięte: `git ls-files context/changes/legal-pages/drafts` zwraca tylko `README.md`
- Brak placeholderów w treści: `grep -c "⟦" src/content/legal/*.md` zwraca `0` dla obu plików (sprawdzić na czerwono przed usunięciem ostatniego `⟦`)

#### Manual Verification:

- Obie strony czytelne na telefonie (360 px) i desktopie; spis treści zwija się nad tekst ≤ 900 px
- Tabele w polityce nie rozpychają strony na wąskim ekranie
- Notka formularza kontaktowego linkuje do polityki

**Implementation Note**: Po zielonej automatyce poczekaj na ręczne potwierdzenie przed Fazą 2.

---

## Phase 2: Akceptacja przy rejestracji

### Overview

Konto nie powstaje bez zaznaczonej akceptacji; wersja i data akceptacji zapisują się przy koncie.

### Changes Required:

#### 1. Formularz

**File**: `src/components/auth/SignUpForm.tsx`

**Intent**: Wymagany checkbox „Akceptuję Regulamin” z linkami do regulaminu i polityki (otwierane w nowej karcie, żeby nie zgubić wpisanych danych), z błędem walidacji w stylu pozostałych pól.

**Contract**: Pole `name="terms"`, wartość wysyłana tylko po zaznaczeniu. Etykieta: „Akceptuję [Regulamin] i zapoznałam/em się z [Polityką prywatności]” — brzmienie neutralne płciowo do decyzji implementującego (np. „Akceptuję Regulamin. Wiem, jak Temio przetwarza dane — Polityka prywatności”). Błąd: „Zaakceptuj Regulamin, aby założyć konto”.

#### 2. Trasa

**File**: `src/pages/api/auth/signup.ts`, `src/lib/auth-error-messages.ts`

**Intent**: Serwer nie ufa walidacji w przeglądarce: bez `terms` przekierowuje z kodem błędu i nie woła Supabase. Z akceptacją przekazuje do `signUp` metadane akceptacji.

**Contract**: Nowa stała `TERMS_NOT_ACCEPTED = "terms_not_accepted"` z polskim komunikatem w `AUTH_ERROR_MESSAGES`. `signUp({ email, password, options: { emailRedirectTo, data: { terms_version: TERMS_VERSION, terms_accepted_at: <ISO now> } } })`.

#### 3. Testy

**File**: `src/pages/api/auth/signup.test.ts` (nowy), `tests/e2e/legal-pages.spec.ts`

**Intent**: Unit (wzór `change-password.test.ts`): brak `terms` → redirect z `terms_not_accepted` i brak wywołania `signUp`; z `terms` → `signUp` dostaje `data.terms_version === TERMS_VERSION`. E2E: wysłanie formularza bez checkboxa pokazuje błąd i zostaje na `/auth/signup`.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe przechodzą: `npm run test` (nowy `signup.test.ts`)
- Test „bez `terms` nie woła `signUp`” sprawdzony na czerwono (z usuniętym warunkiem w trasie)
- E2E przechodzi: `npx playwright test tests/e2e/legal-pages.spec.ts tests/e2e/landing-topic-carry.spec.ts`
- Lint i build przechodzą: `npm run lint && npm run build`

#### Manual Verification:

- Lokalnie: rejestracja z checkboxem tworzy konto; w Studio `raw_user_meta_data` zawiera `terms_version` i `terms_accepted_at`
- Rejestracja bez checkboxa (np. z wyłączonym JS) kończy się polskim komunikatem, konto nie powstaje

**Implementation Note**: Po zielonej automatyce poczekaj na ręczne potwierdzenie przed Fazą 3.

---

## Phase 3: Spójność produktu z tekstem

### Overview

Produkt robi to, co mówią regulamin § 6 ust. 1 i § 12 oraz FAQ.

### Changes Required:

#### 1. Oznaczenie AI przy generowaniu

**File**: `src/components/plan/WeekPlanBoard.tsx` (formularz ~896), `src/components/plan/DayPlanEditor.tsx` (formularz ~543)

**Intent**: Pod formularzem generowania krótka, stała informacja: „Propozycje przygotowuje sztuczna inteligencja. Sprawdź je przed zajęciami.” Bez linku — to informacja, nie odesłanie.

**Contract**: Jedna stała tekstu (np. w `src/lib/legal.ts` albo obok tekstów plannera), użyta w obu formularzach; tekst pomocniczy (`text-las-szary`), nie alert.

#### 2. FAQ

**File**: `src/lib/faq.ts`

**Intent**: „Jak usunąć konto?” opisuje samodzielne usuwanie w Ustawieniach (link `/ustawienia#usun-konto`), z uwagą, że to nieodwracalne; usunięty komentarz „S-18 rewrites this entry”. Nowe pytanie w sekcji „Konto i dane”: „Co dzieje się z moimi danymi?” — 1–2 zdania + link do polityki.

**Contract**: Każda odpowiedź prawdziwa dziś (nagłówek pliku). Treść zgodna z regulaminem § 12 ust. 1 i polityką pkt 8.

#### 3. Ustawienia

**File**: `src/pages/ustawienia.astro`

**Intent**: W karcie „Konto” łącza „Regulamin” i „Polityka prywatności” — zalogowany nie widzi stopki publicznej.

**Contract**: Ścieżki z `src/lib/legal.ts`.

### Success Criteria:

#### Automated Verification:

- Testy jednostkowe przechodzą: `npm run test`
- E2E przechodzi: `npx playwright test tests/e2e/help-and-contact.spec.ts tests/e2e/account-deletion.spec.ts`
- Lint i build przechodzą: `npm run lint && npm run build`
- FAQ nie odsyła do formularza po usunięcie konta: `grep -n "usuniemy konto" src/lib/faq.ts` zwraca pusto (sprawdzone na czerwono przed zmianą)

#### Manual Verification:

- Informacja o AI widoczna pod formularzem tygodnia i dnia, nie przeszkadza w układzie na telefonie
- `/pomoc` — nowa odpowiedź o usuwaniu konta, link prowadzi do karty „Usuń konto”
- `/ustawienia` — linki do dokumentów działają

**Implementation Note**: Po zielonej automatyce poczekaj na ręczne potwierdzenie przed Fazą 4.

---

## Phase 4: Wydanie

### Overview

Czynności produkcyjne w kolejności, która utrzymuje każdą obietnicę polityki prawdziwą od pierwszej minuty.

### Changes Required:

#### 1. Przed merge'em (Janusz, panel)

- Supabase → *Authentication → Audit Logs* → włączyć „Disable writing auth audit logs to project database”.
- SQL Editor (produkcja): `delete from auth.audit_log_entries;` — po włączeniu przełącznika.
- OpenRouter → *Settings → Privacy*: logowanie zapytań wyłączone, zgoda na trenowanie wyłączona.
- Resend: potwierdzić, że DPA wiąże bez kontrasygnaty (albo ją złożyć).
- Ostatni test formularza kontaktowego: wiadomość dociera do `kontakt@temio.pl`.

#### 2. Daty

**File**: `src/lib/legal.ts`

**Intent**: `TERMS_PUBLISHED_ON` / `PRIVACY_PUBLISHED_ON` = dzień merge'u, `TERMS_BINDS_EXISTING_ON` = +14 dni.

#### 3. Roadmapa i notatki

**File**: `context/foundation/roadmap.md`, `context/foundation/next-actions.md`

**Intent**: S-20 → `done` w tabeli i w sekcji; blocker „treść od prawnika” zastąpiony decyzją z 2026-10-17 (wersja bez prawnika, przegląd prawnika przy S-25/S-26). Ślad dla S-22: polityka dostaje sekcję o zapisie.

#### 4. Po merge'u (Janusz, ten sam dzień)

E-mail z `kontakt@temio.pl` do wszystkich obecnych kont, w BCC (paczki ≤ 50). Lista adresów:
`select email from auth.users where created_at < '<data merge'u>' and email_confirmed_at is not null order by created_at;`

Treść:

> **Temat:** Temio ma regulamin i politykę prywatności
>
> Dzień dobry,
>
> od dziś Temio ma regulamin i politykę prywatności: https://temio.pl/regulamin, https://temio.pl/polityka-prywatnosci.
>
> Najważniejsze: Temio pozostaje bezpłatne, propozycje pisze sztuczna inteligencja i warto je sprawdzać przed zajęciami, a Twoich planów nikt poza Tobą nie widzi i nie trenujemy na nich modeli. Prosimy też, żeby nie wpisywać do Temio danych dzieci.
>
> Regulamin zacznie obowiązywać Twoje konto <TERMS_BINDS_EXISTING_ON>. Jeśli się z nim nie zgadzasz, możesz wcześniej usunąć konto w Ustawieniach — razem ze wszystkimi planami. Pytania? Odpowiedz na tę wiadomość.
>
> Janusz, Temio

### Success Criteria:

#### Automated Verification:

- Daty ustawione: `grep -n "PUBLISHED_ON" src/lib/legal.ts` pokazuje dzień merge'u
- Pełny zestaw zielony: `npm run lint && npm run test && npm run build`
- Roadmapa: `grep -n "| S-20 |" context/foundation/roadmap.md` zawiera `done`

#### Manual Verification:

- Przełącznik audit logów włączony; po zalogowaniu na produkcji `select count(*) from auth.audit_log_entries` zwraca 0
- Ustawienia OpenRoutera i DPA Resend potwierdzone
- Po wdrożeniu: `https://temio.pl/regulamin` i `/polityka-prywatnosci` odpowiadają 200, stopka linkuje, rejestracja wymaga checkboxa
- E-mail do obecnych kont wysłany w dniu merge'u

---

## Testing Strategy

### Unit Tests:

- `signup.ts`: brak `terms` → `terms_not_accepted`, brak wywołania Supabase; z `terms` → metadane z `TERMS_VERSION`.
- `legal.ts`: formatowanie daty po polsku; `TERMS_BINDS_EXISTING_ON` = publikacja + 14 dni.

### Integration Tests:

- E2E `legal-pages.spec.ts` (role-based locators, bez `waitForTimeout`, wg `E2E-RULES.md`): strony bez logowania, spis treści, linki ze stopki, rejestracja bez checkboxa.

### Manual Testing Steps:

1. Otwórz `/regulamin` na telefonie, rozwiń spis treści, przejdź do § 12.
2. Załóż konto bez checkboxa (JS wyłączony) — polski błąd, konto nie powstaje.
3. Załóż konto z checkboxem — metadane w Studio.
4. Wygeneruj tydzień — informacja o AI pod formularzem.

## Migration Notes

Brak migracji schematu. Jedyna zmiana danych to usunięcie `auth.audit_log_entries` na produkcji (Faza 4) — nieodwracalne i zamierzone. Konta sprzed S-20 nie mają `terms_version` w metadanych; to oczekiwane — wiąże je e-mail.

## References

- Szkice i decyzje: `context/changes/legal-pages/drafts/README.md`
- Makieta: `context/foundation/design/design/reference/10-regulamin.html`, `context/foundation/design/src/components/layout/LegalLayout.astro`
- Wzór strony publicznej: `src/pages/pomoc.astro`; wzór testu trasy: `src/pages/api/auth/change-password.test.ts`
- Roadmapa: `context/foundation/roadmap.md` §S-20

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Strony prawne

#### Automated

- [x] 1.1 Build przechodzi — 5e5a2fe
- [x] 1.2 Lint przechodzi — 5e5a2fe
- [x] 1.3 Testy jednostkowe przechodzą — 5e5a2fe
- [x] 1.4 E2E legal-pages: strony, spis treści, stopka — 5e5a2fe
- [x] 1.5 Szkice usunięte z drafts/ — 5e5a2fe
- [x] 1.6 Brak placeholderów w treści — 5e5a2fe

#### Manual

- [x] 1.7 Strony czytelne na telefonie i desktopie
- [x] 1.8 Tabele nie rozpychają strony
- [x] 1.9 Notka formularza linkuje do polityki

### Phase 2: Akceptacja przy rejestracji

#### Automated

- [x] 2.1 Testy jednostkowe z signup.test.ts przechodzą — 41c26ce
- [x] 2.2 Test „bez terms nie woła signUp” widziany na czerwono — 41c26ce
- [x] 2.3 E2E legal-pages i landing-topic-carry przechodzą — 41c26ce
- [x] 2.4 Lint i build przechodzą — 41c26ce

#### Manual

- [x] 2.5 Metadane akceptacji zapisane przy nowym koncie
- [x] 2.6 Rejestracja bez checkboxa odrzucona po polsku

### Phase 3: Spójność produktu z tekstem

#### Automated

- [x] 3.1 Testy jednostkowe przechodzą — d2ad4ea
- [x] 3.2 E2E help-and-contact i account-deletion przechodzą — d2ad4ea
- [x] 3.3 Lint i build przechodzą — d2ad4ea
- [x] 3.4 FAQ nie odsyła do formularza po usunięcie konta — d2ad4ea

#### Manual

- [x] 3.5 Informacja o AI pod formularzami generowania
- [x] 3.6 Nowa odpowiedź FAQ o usuwaniu konta
- [x] 3.7 Linki do dokumentów w Ustawieniach

### Phase 4: Wydanie

#### Automated

- [x] 4.1 Daty ustawione na dzień merge'u — 679fd86
- [x] 4.2 Pełny zestaw zielony — 679fd86
- [x] 4.3 Roadmapa: S-20 done — 679fd86

#### Manual

- [x] 4.4 Audit logi wyłączone i wyczyszczone
- [x] 4.5 OpenRouter i DPA Resend potwierdzone
- [x] 4.6 Strony i rejestracja działają na produkcji
- [ ] 4.7 E-mail do obecnych kont wysłany
