import type { SeedActivity } from "./supabase-admin";

/**
 * Unikalne dane testowe — warunek tego, zeby zestaw dalo sie uruchomic dwa razy
 * pod rzad i rownolegle.
 *
 * Unikalnosc siedzi w **dacie dnia**, nie w koncie. Baza wymusza
 * `unique (user_id, plan_date)`, a oba konta testowe sa stale (patrz
 * `supabase-admin.ts`), wiec dwa testy siegajace po ten sam dzien zderzylyby sie
 * przy zasiewie. Kazdy test bierze wiec wlasny dzien.
 *
 * Okno lezy w odleglej przyszlosci, zeby zaden przebieg nie deptal danych, ktore
 * ktos ogladal recznie w aplikacji, i zeby "dzien sasiedni" (`plusDays`) nigdy
 * nie wypadl na dzien innego testu.
 */
const WINDOW_START = Date.UTC(2100, 0, 1);
const WINDOW_DAYS = 20000; // ~54 lata: kolizja miedzy testami jest pomijalna
const DAY_MS = 86_400_000;

let sequence = 0;

/**
 * Dzien przypisany jednemu testowi, wraz z zapasem na dni sasiednie.
 *
 * Kazde wywolanie odsuwa sie o `spacing` dni od poprzedniego w tym samym
 * procesie, a losowy start rozsuwa rownolegle procesy. Dzieki temu
 * `plusDays(date, 1)` w tescie kasowania jest naprawde wolny.
 */
export function uniquePlanDate(spacing = 10): string {
  const offset = Math.floor(Math.random() * WINDOW_DAYS) + sequence * spacing;
  sequence += 1;
  return new Date(WINDOW_START + (offset % WINDOW_DAYS) * DAY_MS).toISOString().slice(0, 10);
}

/** Dzien sasiedni wzgledem podanego — do asercji "kasowanie nie zabralo za duzo". */
export function plusDays(isoDate: string, days: number): string {
  const shifted = new Date(`${isoDate}T00:00:00Z`).getTime() + days * DAY_MS;
  return new Date(shifted).toISOString().slice(0, 10);
}

/**
 * Poniedzialek przypisany jednemu testowi — dla testow widoku tygodnia, ktory
 * potrzebuje poniedzialku, a nie dowolnego dnia, i pieciu wolnych dni po nim.
 *
 * Rezerwuje 14 dni i przesuwa sie **w przod** do najblizszego poniedzialku —
 * o co najwyzej 6 dni, wiec caly tydzien roboczy (do +10) miesci sie w
 * rezerwacji. Przesuniecie wstecz mogloby wejsc w okno zarezerwowane przez
 * poprzednie wywolanie.
 */
export function uniqueWeekStart(): string {
  const reserved = uniquePlanDate(14);
  // getUTCDay(): 0 to niedziela, 1 poniedzialek. Dni do najblizszego
  // poniedzialku, liczac poniedzialek jako 0.
  const daysUntilMonday = (8 - new Date(`${reserved}T00:00:00Z`).getUTCDay()) % 7;
  return plusDays(reserved, daysUntilMonday);
}

/**
 * Znacznik wplatany w tytuly propozycji.
 *
 * Asercje celuja w niego, a nie w ogolne "jakis plan jest widoczny" — inaczej
 * test przeszedlby na cudzym planie, czyli dokladnie w sytuacji, ktora jest
 * trescia ryzyka #4.
 */
export function uniqueStamp(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/** Trzy propozycje w ksztalcie, ktory produkuje generowanie: tytul + opis. */
export function activitiesFor(stamp: string): SeedActivity[] {
  return [
    { title: `Powitanie ${stamp}`, description: `Krag powitalny i piosenka na dzien dobry. (${stamp})` },
    { title: `Zabawa ruchowa ${stamp}`, description: `Tor przeszkod z poduszek i szarf. (${stamp})` },
    { title: `Praca plastyczna ${stamp}`, description: `Wyklejanka z kolorowego papieru. (${stamp})` },
  ];
}
