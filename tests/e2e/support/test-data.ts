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
const WINDOW_DAYS = 20000; // ~54 lata
const DAY_MS = 86_400_000;

/**
 * Okno jest podzielone na pasy, po jednym na rownolegly worker
 * (`TEST_PARALLEL_INDEX`, ustawiany przez Playwrighta). Wczesniej kazde
 * wywolanie losowalo dzien z calego okna od nowa, wiec dwa testy w jednym
 * przebiegu potrafily trafic na ten sam dzien — `month-grid-fit.spec.ts`
 * padal raz na kilkanascie przebiegow na `day_plans_user_id_plan_date_key`.
 * Teraz rownolegle workery nie dziela dni, a w obrebie workera rezerwacje ida
 * po kolei. Workerow wiecej niz pasow dzieli pasy modulo — dopiero wtedy
 * kolizja wraca jako mozliwa.
 */
const LANES = 16;
const LANE_DAYS = Math.floor(WINDOW_DAYS / LANES);
const lane = Number(process.env.TEST_PARALLEL_INDEX ?? 0) % LANES;

// Losowy start w pasie: kolejne przebiegi nie siegaja wciaz po te same dni.
let laneOffset = Math.floor(Math.random() * LANE_DAYS);

/**
 * Dzien przypisany jednemu testowi, wraz z zapasem na dni sasiednie.
 *
 * Kolejne wywolanie w tym samym procesie zaczyna sie `spacing` dni dalej, w
 * pasie tego workera. Dzieki temu `plusDays(date, 1)` w tescie kasowania jest
 * naprawde wolny. Zawiniecie na poczatek pasu trafia w dni testow, ktore juz
 * po sobie posprzataly (worker wykonuje testy po kolei).
 */
export function uniquePlanDate(spacing = 10): string {
  if (laneOffset + spacing > LANE_DAYS) laneOffset = 0;
  const offset = lane * LANE_DAYS + laneOffset;
  laneOffset += spacing;
  return new Date(WINDOW_START + offset * DAY_MS).toISOString().slice(0, 10);
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
 * Poniedzialek, ktorego caly tydzien roboczy lezy w jednym miesiacu — dla
 * testow siatki miesiaca.
 *
 * Siatka pokazuje dzien spoza miesiaca jako pusta komorke, nie jako kafelek,
 * wiec tydzien na granicy miesiecy (poniedzialek 30., wtorek 1.) nie ma na
 * stronie miesiaca wszystkich swoich dni. Rezerwuje 21 dni: gdy piatek wypada
 * juz w nastepnym miesiacu, bierze kolejny poniedzialek (najwyzej +13), a jego
 * piatek (+17) nadal miesci sie w rezerwacji.
 */
export function uniqueWeekStartWithinMonth(): string {
  const reserved = uniquePlanDate(21);
  const daysUntilMonday = (8 - new Date(`${reserved}T00:00:00Z`).getUTCDay()) % 7;
  const monday = plusDays(reserved, daysUntilMonday);
  return plusDays(monday, 4).slice(0, 7) === monday.slice(0, 7) ? monday : plusDays(monday, 7);
}

/**
 * Tydzien wewnatrz horyzontu planowania (S-31) — dla testow, ktore potrzebuja
 * formularza generowania albo pustego dnia z polem hasla. Na datach z
 * `uniquePlanDate()` (rok 2100+) strona pokazuje zamiast nich notke horyzontu.
 *
 * Okno jest za krotkie na losowanie: kilkadziesiat dni przy `fullyParallel` i
 * `unique (user_id, plan_date)` dawaloby zderzenia. Kazdy test dostaje wiec
 * **wlasny, staly** tydzien — slot — i tylko on po nim siega:
 *
 * - `0`, `1`: `regenerate-confirmation.spec.ts`, testy tygodnia (po jednym)
 * - `2`: testy dnia — pn `seed.spec.ts`, wt `regenerate-confirmation.spec.ts`,
 *   sr `day-plan-ownership.spec.ts`, czw + pt `day-plan-delete-scope.spec.ts`
 *
 * Nowy test, ktory potrzebuje formularza, bierze nowy slot albo wolny dzien,
 * i dopisuje sie do tej listy.
 *
 * Sloty leza w nastepnym miesiacu (Europe/Warsaw), ktory jest w oknie zawsze w
 * calosci: pierwszy poniedzialek miesiaca wypada najpozniej 7., wiec piatek
 * slotu `2` najpozniej 25. Liczone tu, nie importowane z aplikacji — jak
 * `dayLabel` w specach.
 */
export function weekStartInHorizon(slot: 0 | 1 | 2): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(new Date());
  const [year, month] = today.split("-").map(Number);
  const firstOfNextMonth = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  const daysUntilMonday = (8 - new Date(`${firstOfNextMonth}T00:00:00Z`).getUTCDay()) % 7;
  return plusDays(firstOfNextMonth, daysUntilMonday + slot * 7);
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
