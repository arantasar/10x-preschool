# 10xPreschool — pakiet projektu „Ogród” dla Astro

Przekazanie projektu graficznego do implementacji. Pakiet zawiera:

```
src/
  styles/tokens.css              ← wszystkie kolory, fonty, promienie, cienie, odstępy (CSS custom properties)
  components/
    ui/        Button, Icon, Logo, CategoryTag, StatusBadge, ScopeToggle, TopicForm, Blob,
               TextField, Notice, FaqItem
    plan/      ProposalCard, RemovedProposal, MonthGrid
    billing/   PricingCard, BillingToggle, PaywallDialog
    layout/    MarketingHeader, SiteFooter, AppHeader, AuthSplit, AuthCard, LegalLayout
design/
  screens/     PNG każdego ekranu — tak ma to wyglądać
  reference/   statyczne HTML tych ekranów (style inline, dokładne wartości px) — źródło prawdy dla układu
```

## Instrukcja dla modelu kodującego (np. Claude Code)

> Zaimplementuj nowy wygląd 10xPreschool według `design/README.md`.
> 1. Skopiuj `src/styles/tokens.css` i `src/components/**` do projektu (dopasuj ścieżki, nie nadpisuj istniejących komponentów o tych nazwach bez sprawdzenia).
> 2. Podłącz fonty i `tokens.css` w głównym layoucie.
> 3. Przebuduj istniejące strony tak, żeby wyglądały jak `design/screens/*.png`. Wymiary i odstępy bierz z `design/reference/*.html`, ale w kodzie używaj zmiennych z `tokens.css` i komponentów — nie kopiuj stylów inline.
> 4. Zachowaj istniejącą logikę (auth, wywołania LLM, zapis planu). Podepnij przyciski z `data-action` do tego, czego aplikacja już używa.
> 5. Nowe strony (cennik, FAQ, regulamin, kontakt, reset hasła) i okno płatności zbuduj z komponentów wymienionych w sekcji 4. Teksty w [NAWIASACH] zostaw jako placeholdery — uzupełni je właściciel.
> 6. Sprawdź widoki przy 390 px, 768 px i 1440 px.

## 1. Fonty

Young Serif (tylko 400) i Nunito Sans (400–800). Obie mają polskie znaki.

**Wariant A: self-hosting (zalecany, szybszy na Workers):**

```bash
npm i @fontsource/young-serif @fontsource-variable/nunito-sans
```

```astro
---
// src/layouts/BaseLayout.astro
import '@fontsource/young-serif/latin-ext.css';
import '@fontsource/young-serif/latin.css';
import '@fontsource-variable/nunito-sans/wght.css';
import '../styles/tokens.css';
const { title = '10xPreschool — plan zajęć przedszkolnych' } = Astro.props;
---
<!doctype html>
<html lang="pl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
  </head>
  <body><slot /></body>
</html>
```

**Wariant B: Google Fonts.** Wstaw w `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Young+Serif&family=Nunito+Sans:opsz,wght@6..12,400;6..12,600;6..12,700;6..12,800&display=swap" rel="stylesheet">
```

`--font-body` w `tokens.css` obsługuje oba warianty (`'Nunito Sans Variable', 'Nunito Sans', …`).

## 2. Paleta

| Nazwa | Token | Hex | Użycie |
|---|---|---|---|
| Owies | `--color-bg` | #F3EFE4 | tło stron |
| Mleko | `--color-surface` | #FFFDF7 | karty, pola, pasek aplikacji |
| Las | `--color-text` / `--color-primary` | #1F3B2D | tekst, główne przyciski, ciemne panele |
| Mech | `--color-text-accent` | #4F6E4B | etykiety, meta, nadtytuły |
| Szałwia | `--color-sage` / `--color-sage-soft` | #C9DAC2 / #DCE7D6 | plamy dekoracyjne, aktywna nawigacja, „zatwierdzone” |
| Morela | `--color-apricot` / `--color-apricot-soft` | #EE9B6A / #F4C3A1 | ciepły akcent, „Zapisz w planie”, focus ring |

Zasady:
- **Morela tylko z ciemnym tekstem** (`--color-text`). Biały tekst na moreli nie ma wystarczającego kontrastu.
- Jeden przycisk `primary` (ciemny) na widok. Akcje drugorzędne mają wariant `secondary` albo `ghost`.
- Nagłówki są w Young Serif, zawsze w grubości 400 (ten font nie ma pogrubienia). Kursywa w Mchu wyróżnia jedno słowo, np. „zajęć.”.
- Tekst interfejsu (tytuły kart, przyciski) jest w Nunito Sans 800.
- Wszystkie przyciski i tagi mają kształt pigułki (`--radius-pill`), a karty zaokrąglenie 24–28 px.
- Plamy (`Blob`) to wyłącznie dekoracja w tle hero, logowania i pasa CTA, nigdy za treścią.

## 3. Kategorie aktywności

`CategoryTag` ma kolory dla: Ruch, Plastyka, Mowa, Odkrywanie, Muzyka. Inna nazwa zwrócona przez LLM dostaje neutralny szary. Żeby dodać kategorię, dopisz parę `--cat-<slug>-bg/-fg` w `tokens.css` i klucz w `CategoryTag.astro`. Zadbaj, żeby kontrast tekstu do tła wynosił co najmniej 4.5:1.

Warto, żeby prompt LLM zwracał kategorię z tej zamkniętej listy.

## 4. Ekrany → komponenty

Trasy są propozycją, więc dopasuj je do istniejących.

| Ekran | PNG | Komponenty |
|---|---|---|
| Strona główna `/` | 01, 05 (mobile) | `MarketingHeader`, `Blob`, `TopicForm`, `ProposalCard layout="card" showActions={false}`, sekcja „Jak to działa”, podgląd miesiąca, ciemny pas CTA z `Button variant="inverse"` |
| Logowanie `/logowanie` | 02 | `Logo`, formularz (e-mail, hasło, „Nie pamiętasz hasła?”, „Nie wylogowuj mnie”), `Button block`, ciemny panel z `Blob` + przykładową kartą. Na < 900 px panel znika. |
| Rejestracja `/rejestracja` | 06 | Układ jak logowanie: e-mail, hasło (+ podpowiedź z wymaganiami — wpisz własne), powtórz hasło, `Button block`, link „Masz już konto? Zaloguj się”. Ciemny panel pokazuje 3 kroki „Jak to działa”. |
| Nowe propozycje `/generuj` | 03 | `AppHeader active="generate"`, panel formularza (temat, `ScopeToggle`, wybór tygodnia, „Wygeneruj ponownie”), lista `ProposalCard layout="row"` + `RemovedProposal`, licznik „X z 5 zatwierdzone”, „Zatwierdź wszystkie” (`secondary`), „Zapisz w planie (X)” (`accent`) |
| Plan miesiąca `/plan` | 04 | `AppHeader active="plan"`, nagłówek miesiąca ze strzałkami, legenda, `MonthGrid` |
| Cennik `/cennik` | 07 | `MarketingHeader active="cennik"`, `BillingToggle`, 2× `PricingCard` (`default` „Na start”, `featured` „Pełny dostęp” z cenami `{monthly, yearly}`), `FaqItem` (pytania o płatności), `SiteFooter` |
| Prośba o płatność (start 2. tygodnia) | 08 | `PaywallDialog` — natywny `<dialog>`, otwierany `showModal()` gdy nauczyciel chce generować tydzień 2+ bez aktywnego planu. Tło = zwykły ekran `/generuj`. |
| FAQ `/faq` | 09 | `MarketingHeader active="faq"`, lewa kolumna kotwic kategorii (Jak to działa / Płatności / Konto i dane), `FaqItem` w sekcjach z `id`, ciemny pas z linkiem do kontaktu, `SiteFooter` |
| Regulamin `/regulamin` | 10 | `LegalLayout` (spis treści + tekst; najlepiej treść z Markdown / content collection), `Notice tone="info"` w § 5 (treści AI) |
| Kontakt `/kontakt` | 11, 11b | `MarketingHeader active="kontakt"`, `TextField` (imię, e-mail, temat `as="select"`, wiadomość `as="textarea"`), checkbox zgody, stan po wysłaniu (11b) |
| Reset hasła `/reset-hasla` | 12, 12b | `AuthCard` + `TextField` e-mail → po wysłaniu stan „Sprawdź skrzynkę” (12b). Przycisk „Otwórz link (demo)” jest tylko w makiecie — w aplikacji go nie ma. |
| Nowe hasło `/nowe-haslo?token=…` | 13 | `AuthCard mirror` + 2× `TextField type="password"` |
| Konto założone `/konto-zalozone` | 14 | `AuthCard` + ikona ✓ w zielonym kształcie liścia, `<h1>Konto założone</h1>`, tekst z `role="status"`, `Button href="/logowanie" block` „Zaloguj się”. Pokazywany po udanej rejestracji. |

Linki: „Nie pamiętasz hasła?” na logowaniu → `/reset-hasla` (`TextField labelAside`). Stopka `SiteFooter` na wszystkich stronach publicznych, łącznie ze stroną główną.

### Stany propozycji

| Stan | Wygląd | Akcje (`data-action`) |
|---|---|---|
| `pending` | karta bez obramowania | `approve`, `edit`, `remove` |
| `approved` | ramka 2 px w kolorze Mech + znaczek „Zatwierdzone” | `unapprove` |
| usunięta | `RemovedProposal`: przerywana ramka, „usunięto „…”” | `restore` |

W planie miesiąca: zatwierdzone mają zielone tło i ciągłą ramkę, do przejrzenia białe tło i przerywaną ramkę, a tydzień bez tematu to jedna szeroka szara komórka z przyciskiem.

Przykład użycia:

```astro
---
import AppHeader from '../components/layout/AppHeader.astro';
import ProposalCard from '../components/plan/ProposalCard.astro';
import RemovedProposal from '../components/plan/RemovedProposal.astro';
const proposals = /* z bazy / LLM */ [];
---
<AppHeader active="generate" />
<main class="list">
  {proposals.map((p) =>
    p.status === 'removed'
      ? <RemovedProposal id={p.id} dayLabel={p.dayLabel} title={p.title} />
      : <ProposalCard proposal={p} status={p.status} layout="row" />
  )}
</main>
```

### Okno płatności — użycie

```astro
<PaywallDialog
  weekLabel="Tydzień 12–16 października"
  savedWeekLabel="5–9 października"
  monthly={{ amount: '29 zł', period: '/ miesiąc' }}
  yearly={{ amount: '290 zł', period: '/ rok' }}
  action="/api/checkout"            // POST z polem plan=monthly|yearly
  providerName="Stripe"
/>
<script>
  // np. po kliknięciu „Wygeneruj” dla tygodnia 2+, gdy użytkownik nie ma planu:
  document.getElementById('paywall')?.showModal();
</script>
```

Zasady: okno pojawia się dopiero przy próbie generowania kolejnego tygodnia (nie przy logowaniu). Zawsze da się je zamknąć („Nie teraz”, ×, Esc), a zatwierdzony pierwszy tydzień zostaje dostępny.

## 5. Responsywność

- **≤ 640 px (telefon):** pole tematu i przycisk jeden pod drugim, przycisk na całą szerokość; w nagłówku zostaje tylko „Zaloguj się”; hero ma 46 px (`--text-display-xl` używa clamp); karty układają się jedna pod drugą. Wzór: `05-strona-glowna-mobile.png`.
- **≤ 900 px:** nawigacja publiczna chowa się w menu (ikona ☰, natywny `<details>`); spis treści regulaminu idzie nad tekst; karty cennika jedna pod drugą;
  wiersze propozycji zamieniają się w karty; siatka miesiąca staje się listą tygodni; panel formularza w `/generuj` idzie nad listę; logowanie jest jednokolumnowe.
- **≥ 1200 px:** treść ma maksymalnie `--content-max` (1200 px), marginesy boczne `--page-gutter`.

## 6. Dostępność

- Prawdziwe `<button>`, `<a href>`, `<input>` + `<label>`. Przyciski z samą ikoną (kosz) mają `aria-label`.
- Obszar klikalny ma co najmniej 44 px wysokości.
- Focus to 3 px obrys w kolorze moreli (`:focus-visible` w `tokens.css`). Nie usuwaj go.
- Kontrasty w palecie są sprawdzone, więc nie rozjaśniaj szarego tekstu (`--color-text-muted`) ani etykiet (`--color-text-accent`).

## 7. Treści

Placeholdery w [NAWIASACH] do uzupełnienia przez właściciela: ceny planów, operator płatności, adres e-mail, czas odpowiedzi, czas ważności linku resetu, wymagania hasła, odpowiedzi w FAQ o rezygnacji / fakturach / danych / usuwaniu konta. **Regulamin zawiera tylko strukturę — treść prawną musi przygotować lub sprawdzić prawnik.**


Nazwy aktywności i tematy tygodni na ekranach to przykłady. W aplikacji pochodzą z LLM i danych użytkownika.
