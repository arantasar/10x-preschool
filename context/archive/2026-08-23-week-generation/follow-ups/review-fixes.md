# S-03 `week-generation` — pozycje wyniesione z przeglądu implementacyjnego

Otwarte pozycje, których S-03 świadomie nie domyka. Zapisane tutaj, a nie w prozie przeglądu,
z powodu, który `lessons.md` #2 nazywa wprost: odroczenie bez własnego pliku, pozycji i właściciela
znika z pola widzenia.

## 1. Szkic tygodnia zwielokrotnia ekspozycję na hasło wykluczające

- **Właściciel**: Janusz
- **Źródło**: `model-comparison.md` § „«Dzień Matki» — bez regresji, ale ekspozycja rośnie";
  przegląd implementacyjny F8
- **Stan**: otwarte, świadomie poza zakresem S-03

**Problem.** Prompt dnia traktuje „Dzień Matki" tak, jak rozstrzygnęło to S-01: nie każde dziecko ma
mamę, ale prompt nie wymienia tego tematu jako wrażliwego i aktywności zakładają, że mama jest.
Do S-03 dziecko trafiało na **jeden** taki dzień. Szkic tygodnia rozkłada jedno hasło na pięć dni,
więc teraz cały tydzień potrafi być o mamie — w przebiegu bramki u DeepSeeka 5/5 tematów, u luny 5/5,
u Gemini 4/5.

To nie jest regresja promptu dnia — to nowa własność promptu szkicu, której przed S-03 nie było.

**Warunek domknięcia.** Przy najbliższej iteracji któregokolwiek z dwóch promptów: rozstrzygnąć, czy
prompt szkicu ma mieć regułę różnicowania ujęć dla haseł wykluczających (np. „jeśli hasło zakłada
obecność konkretnej osoby w rodzinie, przynajmniej dwa z pięciu tematów muszą działać bez tego
założenia"), czy zostaje jak jest. Każda zmiana promptu wymaga pełnego przebiegu bramki
(`./scripts/compare-models.sh`) przed scaleniem — `lessons.md` #3.

## 2. Wdrożenie: hosted project nie ma żadnej migracji

- **Właściciel**: Janusz
- **Źródło**: `change.md` S-02 krok 1.7; § Migration Notes tego planu
- **Stan**: otwarte, blokuje wdrożenie, nie implementację

`npx supabase db push` pozostaje warunkiem wdrożenia S-03. Kolejka to teraz siedem migracji.
