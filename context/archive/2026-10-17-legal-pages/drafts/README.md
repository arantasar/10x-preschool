# S-20 — szkice regulaminu i polityki prywatności

Stan 2026-10-17: pierwsza wersja obu tekstów, pisana bez prawnika (brak budżetu — decyzja Janusza).
Podstawa: przepisy (niżej), regulaminy ZabawAIki, Przygotuj Lekcje i Chalkie oraz stan kodu na
`master` @ `f3072cb`. **Teksty opisują wyłącznie usługę darmową w obecnym kształcie** — każde zdanie
o tym, co Temio robi, ma być prawdziwe w dniu publikacji, tak jak odpowiedzi w FAQ.

- [`regulamin.md`](regulamin.md) → `/regulamin`
- [`polityka-prywatnosci.md`](polityka-prywatnosci.md) → `/polityka-prywatnosci`

Miejsca do uzupełnienia są oznaczone `⟦…⟧`.

## Ustalenia z Januszem (2026-10-17)

1. **Usługodawca: JDG zarejestrowana na adres domowy** — dane z CEIDG wpisane do regulaminu (§ 1)
   i polityki (pkt 1). Ten adres jest już publiczny w CEIDG, więc strona nie ujawnia niczego
   nowego. Gdyby miał zniknąć z sieci, trzeba zmienić adres w CEIDG (np. na wirtualne biuro).
2. **Poczta z linkami: własny SMTP `smtp.resend.com`** → Resend, Inc. (USA) w tabeli odbiorców.
   Resend przechowuje wysłane wiadomości 30 dni (każdy plan, cennik 2026-10-17), dane trzyma w USA,
   transfer na SCC z [DPA Resend](https://resend.com/legal/dpa). Do potwierdzenia: czy DPA wiąże
   automatycznie z warunkami usługi, czy trzeba go kontrasygnować (Resend publikuje wersję
   podpisaną przez siebie).
3. **`CONTACT_TO` przełączony na `kontakt@temio.pl`** (2026-10-17, `wrangler secret put`, z prywatnej
   skrzynki). Powody: polityka obiecuje 12 miesięcy, a kopia w skrzynce też się do tego liczy;
   prywatna skrzynka to dodatkowy odbiorca bez umowy powierzenia. Zostaje po stronie Janusza:
   usunąć wiadomości z formularza z prywatnej skrzynki (są w bazie) i raz w miesiącu kasować
   w `kontakt@temio.pl` to, co starsze niż 12 miesięcy (przypomnienie w kalendarzu).
4. **Supabase Free, Workers Paid.** Logi: Workers 7 dni, Supabase Free krócej — „≤ 7 dni” jest
   prawdziwe. Supabase Free nie robi codziennych kopii zapasowych, więc polityka (pkt 8) mówi tylko
   o technicznych kopiach dostawcy. Poza tematem prawnym: **awaria bazy na planie Free oznacza
   utratę wszystkich planów** — warto to rozważyć przed płatnościami.

## Warunki publikacji (zakres planu S-20, nie tylko strony)

1. **Strony** `/regulamin` i `/polityka-prywatnosci` (publiczne, `MarketingHeader` + `SiteFooter`)
   i linki do nich w stopce. W menu konta warto dodać link obok „Pomocy”.
2. **Akceptacja przy rejestracji** (regulamin § 5 ust. 1): checkbox „Akceptuję Regulamin” z linkiem
   do polityki, z walidacją w `POST /api/auth/signup`. Dobrze zapisać wersję i datę akceptacji
   (np. `user_metadata`), żeby było wiadomo, kto zaakceptował którą wersję.
3. **Formularz kontaktowy**: jednozdaniowa informacja z S-19 dostaje link do polityki (roadmapa
   §S-19, rozstrzygnięcie 2026-10-09).
4. **Oznaczenie AI w plannerze** (regulamin § 6 ust. 1): dziś mówi o tym tylko FAQ. Wystarczy
   krótka informacja przy generowaniu i przy planach „do przejrzenia”, np. „Propozycje przygotowuje
   sztuczna inteligencja — sprawdź je przed zajęciami”.
5. **Historia logowań bez terminu usunięcia.** `auth.audit_log_entries` trzyma adresy IP
   bezterminowo — tego nie da się uczciwie opisać, a RODO wymaga ograniczenia przechowywania.
   Polityka (pkt 2.6 i 8) jest już napisana pod rozwiązanie: w Supabase włączyć *Authentication →
   Audit Logs → „Disable writing auth audit logs to project database”* (logi zostają w log storage
   dostawcy, z jego retencją ≤ 7 dni) i usunąć istniejące wiersze z `auth.audit_log_entries`.
   Bez tego zdanie „nie dłużej niż 7 dni” jest nieprawdziwe.
6. **Ustawienia OpenRoutera** do potwierdzenia w panelu: logowanie zapytań i zgoda na trenowanie
   wyłączone. Na tym stoi zdanie, że pośrednik usuwa zapytania od razu (DPA OpenRoutera, § 2.4).
7. **FAQ jest nieaktualne**: „Jak usunąć konto?” (`src/lib/faq.ts`) nadal każe pisać przez
   formularz, choć S-18 dało samodzielne usuwanie. Regulamin § 12 opisuje stan prawdziwy — FAQ
   trzeba z nim zrównać.
8. **Obecne konta** nigdy nie akceptowały regulaminu. Przed wejściem w życie wysłać im e-mail
   z informacją i linkami. Kto się nie zgadza, usuwa konto. Termin wejścia w życie: co najmniej 14 dni
   od wysyłki, tak jak przy zmianach (regulamin § 13).

## Co dopiszą następne pozycje

- **S-21** (fair use): nic — limit przeciw nadużyciom jest już w regulaminie (§ 7 ust. 4).
- **S-22** (zapis na cenę założycielską): nowa sekcja polityki — e-maile osób bez konta, zgoda na
  kontakt, retencja zapisu.
- **S-25 / S-26** (płatności): regulamin do przepisania — ceny, odnowienia, prawo odstąpienia przy
  usłudze cyfrowej (zgoda na natychmiastowe świadczenie), niezgodność usługi z umową, faktury;
  w polityce — operator płatności i obowiązki księgowe (retencja 5 lat). **To jest moment na
  przegląd prawnika**, bo od płatności zaczyna się realne ryzyko finansowe.

## Ryzyko przyjęte świadomie (wersja bez prawnika)

- **Klauzule niedozwolone** (art. 385¹ k.c.): wyłączenia odpowiedzialności sformułowane wąsko
  (§ 9) i z zastrzeżeniem praw konsumenta; zmiany regulaminu tylko z przyczyn wyliczonych (§ 13).
  To najczęstszy zarzut UOKiK wobec regulaminów — przy płatnościach do ponownej oceny.
- **AI Act, art. 50 ust. 2** (od 2 sierpnia 2026, nieprzesunięty przez Digital Omnibus): dostawca
  systemu AI generującego tekst ma go oznaczać w formacie odczytywalnym maszynowo. Nie jest
  rozstrzygnięte, czy Temio — działające na modelu cudzego dostawcy — jest tu „dostawcą”. Dla
  systemów wprowadzonych przed 2 sierpnia 2026 jest okres przejściowy do 2 grudnia 2026. Do
  rozstrzygnięcia przed tą datą; poza zakresem S-20. Oznaczenie w interfejsie (warunek 4) to
  minimum, które i tak warto mieć.
- **DSA**: Temio przechowuje treści użytkowników, więc jest usługą hostingu (art. 11, 12, 14, 16, 17
  — punkt kontaktowy, zgłoszenia, uzasadnienia decyzji). Plany są prywatne, więc obowiązki platform
  internetowych go nie dotyczą. Pokryte w § 11 regulaminu.
- **Platforma ODR** zamknięta 20 lipca 2025 (rozp. 2024/3228) — regulamin celowo jej nie wymienia.
  Podaje krajowe pozasądowe drogi (rzecznik konsumentów, Inspekcja Handlowa).

## Źródła

Przepisy: ustawa o świadczeniu usług drogą elektroniczną (art. 5, 6, 8); RODO (art. 6, 12–22,
45–46); Prawo komunikacji elektronicznej (cookies niezbędne — bez zgody); ustawa o prawach
konsumenta (art. 7a, 27, 38a); rozp. 2022/2065 (DSA); rozp. 2024/1689 (AI Act) z nowelizacją
2026/1744.

Konkurencja: [ZabawAIka — regulamin](https://zabawaika.pl/terms),
[Przygotuj Lekcje — regulamin](https://przygotujlekcje.pl/terms) i
[polityka prywatności](https://przygotujlekcje.pl/privacy),
[Chalkie — terms](https://chalkie.ai/pl/terms). Wzięte: obowiązek weryfikacji treści AI,
pseudonimy zamiast danych uczniów, prawa do materiałów po stronie użytkownika. Celowo **nie**
wzięte: licencja na treści użytkowników do trenowania AI i marketingu (ZabawAIka, Chalkie),
akceptacja zmian przez samo dalsze korzystanie bez wyliczonych przyczyn (wszyscy trzej), prawo
obce (Chalkie).

Dostawcy: [DPA Supabase](https://supabase.com/legal/customer-resources/data-processing-addendum)
(Supabase Pte. Ltd., SCC moduł 2, część warunków usługi);
[DPA OpenRouter](https://openrouter.ai/data-processing-agreement) (SCC moduł 2, usuwanie wejść
i wyjść po generowaniu, § 2.4); [Turnstile Privacy Addendum](https://www.cloudflare.com/turnstile-privacy-policy/);
[Supabase Auth audit logs](https://supabase.com/docs/guides/auth/audit-logs);
[UOKiK o zamknięciu ODR](https://www.prawo.pl/biznes/uokik-e-sklepy-musza-zmienic-zapisy-o-platformie-odr,531199.html);
[AI Act po zmianach (KIRP)](https://kirp.pl/ai-act-po-zmianach-czyli-co-trzeba-wiedziec-przed-2-sierpnia-2026-r/).
