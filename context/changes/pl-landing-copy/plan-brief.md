# Polska wersja powierzchni dla niezalogowanego — Plan Brief

> Full plan: `context/changes/pl-landing-copy/plan.md`

## What & Why

Wszystko, co widzi niezalogowany nauczyciel — strona główna, pasek nad nią, ekrany logowania,
rejestracji i potwierdzenia e-maila — jest po angielsku i **reklamuje inny produkt**: szablon
„10x Astro Starter" z Supabase auth, ESLintem i (nieaktualnym) „Astro 5". Zalogowana aplikacja
jest już w całości po polsku, więc granica językowa przebiega dziś dokładnie przez próg
logowania. Ta zmiana ją likwiduje.

Zgłoszenie #7 z triage'u 2026-08-30, poprawka **poza roadmapą** — bez FR i bez wiersza `S-NN`.

## Starting Point

`src/components/Welcome.astro` niesie hero i trzy kafelki opisujące szablon, nie produkt.
`src/components/Topbar.astro` (renderowany wyłącznie wewnątrz `Welcome`) jest angielski.
`src/layouts/Layout.astro` deklaruje `<html lang="en">` dla **całej** aplikacji i ma domyślny
tytuł „10x Astro Starter", który wchodzi na stronie głównej — jedynej stronie bez własnego
`title`. Za oboma przyciskami CTA stoją angielskie ekrany auth i angielskie komponenty
formularzy (etykiety, placeholdery, walidacja, `aria-label`).

## Desired End State

Nauczyciel wchodzi na `/`, czyta po polsku, po co ten produkt istnieje i co umie, klika
„Załóż konto" albo „Zaloguj się" i przechodzi cały lejek bez jednego angielskiego napisu
napisanego przez nas. Powłoka HTML deklaruje `lang="pl"`, a tytuł karty przeglądarki niesie
nazwę produktu.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Granica zakresu | Cały lejek niezalogowanego (landing + Topbar + strony auth + komponenty formularzy) | Zatrzymanie się na landingu zostawia oba CTA prowadzące wprost w angielski formularz — zgłoszenie wróciłoby po pierwszym teście z użytkownikiem. |
| Hero | Problem nauczyciela językiem PRD §Vision | Treść jest już napisana i uzgodniona; trafia w moment sięgnięcia po produkt opisany w §Persona. |
| Trzy kafelki | Zastąpione zdolnościami produktu, nie przetłumaczone | Tłumaczenie utrwaliłoby reklamę startera dla programisty i powieliło błąd „Astro 5"; każdy nowy kafelek ma pokrycie w zamkniętym slice. |
| `lang` i domyślny tytuł | Naprawione globalnie w `Layout.astro` | `lang="en"` na polskiej treści to defekt dostępności obejmujący całą aplikację, a żaden inny slice nie będzie miał powodu dotknąć tego pliku. |
| Weryfikacja | Zakresowany grep uruchomiony najpierw na stanie sprzed zmiany + ręczne przejście lejka | Spełnia `lessons.md` §„Kryterium weryfikacji musi móc nie przejść"; lint i build nie mają pojęcia o języku. |
| Błędy z Supabase | Poza zakresem, zapisane jako follow-up z właścicielem | Mapowanie cudzych komunikatów to logika w trasie API, nie wymiana copy; lista komunikatów Supabase jest niestabilna i nieudokumentowana. |
| Odmiana przez liczbę | Omijana, nie implementowana | `SignUpForm.tsx:59-61` to angielska logika liczby mnogiej; polski ma trzy formy, więc przeniesienie 1:1 dałoby „Jeszcze 1 znaków". |

## Scope

**In scope:** `Layout.astro` (`lang`, domyślny tytuł) · `index.astro` (własny `title`) ·
`Welcome.astro` (hero, CTA, trzy kafelki) · `Topbar.astro` · `auth/{signin,signup,confirm-email}.astro` ·
`auth/{SignInForm,SignUpForm,PasswordToggle}.tsx` · nasz string `"Supabase is not configured"`
w dwóch trasach API · plik follow-upu.

**Out of scope:** mapowanie `error.message` z Supabase · i18n i druga wersja językowa ·
testy automatyczne na język (teren `test-plan.md`, faza 2 nie ruszyła) · ekrany zalogowane
(już po polsku) · warstwa wizualna (klasy, układ, ikony) · usunięcie martwej gałęzi
`user ? …` w `Topbar.astro` · funkcje z `M-02` w treści kafelków.

## Architecture / Approach

Wymiana treści tekstowych w miejscu — projekt nie ma i nie dostaje warstwy i18n, napisy
zostają tam, gdzie są używane. Jedyne zmiany niebędące napisem to atrybut `lang` w powłoce
i przeformułowanie podpowiedzi o długości hasła tak, żeby liczba nie stała przed odmienianym
rzeczownikiem. `FormField.tsx`, `SubmitButton.tsx` i `ServerError.tsx` nie wymagają zmian —
całą treść dostają propsami.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Powłoka i strona główna | `/` w całości po polsku; `lang="pl"` i tytuł produktu dla całej aplikacji | Kafelek obiecujący funkcję z `M-02`, która jeszcze nie istnieje; dłuższe polskie teksty rozbijające siatkę na wąskim ekranie |
| 2. Ekrany logowania i rejestracji | Cały lejek za oboma CTA po polsku + zapisany follow-up | Grep weryfikacyjny trafiający w identyfikatory (`confirmPassword`, `type="password"`) zamiast w napisy — bramka czerwona na zawsze i przez to ignorowana |

**Prerequisites:** gałąź `chore/pl-landing-copy` (utworzona). Brak zależności od innych zmian.
**Estimated effort:** jedna sesja, dwie fazy.

## Open Risks & Assumptions

- Lista fraz w grepie jest ręczna — nie wyłapie napisu, którego na niej nie ma. Ręczne
  przejście lejka jest drugą, niezależną bramką właśnie z tego powodu.
- Nauczyciel z błędnym hasłem zobaczy „Invalid login credentials" po angielsku. To
  **świadomie przyjęte**, nie przeoczone — pokryte plikiem follow-upu z właścicielem.
- Proponowane copy hero i kafelków jest propozycją do doszlifowania; jedyne twarde
  ograniczenie to zakaz opisywania funkcji spoza zamkniętych slice'ów.
- Merge do `master` deployuje na produkcję (Cloudflare Workers Builds) — PR jest wydaniem.

## Success Criteria (Summary)

- Niezalogowany nauczyciel przechodzi `/` → rejestracja → logowanie i nie widzi angielskiego
  tekstu napisanego przez nas.
- Strona główna mówi, po co produkt istnieje i co realnie umie — bez obietnic bez pokrycia.
- Powłoka HTML deklaruje `lang="pl"`, a tytuł karty przeglądarki niesie nazwę produktu.
