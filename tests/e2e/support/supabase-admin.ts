import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";
import { e2eEnv } from "./env";

/**
 * Klient serwisowy: zaklada konta testowe, zasiewa plany i sprzata po testach.
 *
 * **Omija RLS — i dlatego nie wolno przez niego asertowac.** Ryzyko #4 z
 * `context/foundation/test-plan.md` mowi wprost, ze warstwa API nie sprawdza
 * wlasnosci sama (`readDayPlan` filtruje tylko po `plan_date`), wiec cala
 * izolacja stoi na RLS. Asercja czytajaca ta droga omijalaby dokladnie ten
 * mechanizm, ktorego testy maja pilnowac — sprawdzalaby, ze wiersz istnieje w
 * bazie, a nie ze *drugie konto go nie widzi*. Kazda asercja idzie przez
 * przegladarke, jako zalogowany nauczyciel.
 */
let adminClient: SupabaseClient<Database> | null = null;

export function admin(): SupabaseClient<Database> {
  adminClient ??= createClient<Database>(e2eEnv.supabaseUrl, e2eEnv.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return adminClient;
}

/** Konto testowe: adres jest stalym adresem, dane planow sa juz unikalne. */
export interface Teacher {
  readonly email: string;
  readonly storageState: string;
}

export const TEACHER_A: Teacher = {
  email: "e2e-teacher-a@example.test",
  storageState: "playwright/.auth/teacher-a.json",
};

export const TEACHER_B: Teacher = {
  email: "e2e-teacher-b@example.test",
  storageState: "playwright/.auth/teacher-b.json",
};

/**
 * Zaklada konto, jesli go jeszcze nie ma, i zwraca jego `id`.
 *
 * Idempotentne, bo konta sa stale miedzy przebiegami — unikalnosc, ktorej
 * wymagaja reguly e2e, siedzi w danych planu (data dnia, tytuly propozycji),
 * nie w tozsamosci. Dzieki temu `storageState` z poprzedniego przebiegu nie
 * wskazuje na uzytkownika, ktorego juz nie ma.
 */
export async function ensureTeacher(teacher: Teacher): Promise<string> {
  const existing = await findUserIdByEmail(teacher.email);
  if (existing) return existing;

  const { data, error } = await admin().auth.admin.createUser({
    email: teacher.email,
    password: e2eEnv.password,
    // Lokalny stack ma `enable_confirmations = false`, ale nie polegamy na tym:
    // konto ma byc gotowe do logowania niezaleznie od konfiguracji maili.
    email_confirm: true,
  });

  if (error) {
    // Wyscig miedzy rownoleglymi workerami setupu: ktos zdazyl przed nami.
    const raced = await findUserIdByEmail(teacher.email);
    if (raced) return raced;
    throw new Error(`Nie udalo sie zalozyc konta ${teacher.email}: ${error.message}`);
  }
  return data.user.id;
}

async function findUserIdByEmail(email: string): Promise<string | null> {
  // Admin API nie ma wyszukiwania po adresie, wiec strona po stronie. Lokalna
  // baza testowa ma kilku uzytkownikow, wiec limit stron jest bezpieczny.
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin().auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      throw new Error(`Nie udalo sie odczytac listy kont: ${error.message}`);
    }
    const hit = data.users.find((user) => user.email === email);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

export interface SeedActivity {
  readonly title: string;
  readonly description: string;
}

export interface SeedDayPlanOptions {
  readonly userId: string;
  readonly planDate: string;
  readonly prompt: string;
  readonly activities: readonly SeedActivity[];
  /** `true` zapisuje `accepted_at`, czyli plan zaakceptowany zamiast roboczego. */
  readonly accepted?: boolean;
}

/**
 * Zapisuje gotowy plan dnia prosto do bazy, z pominieciem generowania.
 *
 * Wywolanie LLM nie nalezy do zadnego z testowanych ryzyk (#4 i #7 dotycza
 * wlasnosci i kasowania), a kosztuje pieniadze i 10-30 s niedeterminizmu na
 * kazdy przebieg. Granice, na ktorych te ryzyka mieszkaja — sesja, routing,
 * API, RLS — zostaja w tescie prawdziwe; zasiew omija wylacznie zewnetrznego
 * dostawce. To jest ta sama zasada co "mock expensive external APIs at the
 * network layer", tyle ze wywolanie idzie z serwera, wiec `page.route()` by go
 * nie przechwycil.
 */
export async function seedDayPlan(options: SeedDayPlanOptions): Promise<string> {
  // Oba znaczniki z jednego odczytu zegara. `day_plans_accepted_after_created`
  // wymaga `accepted_at >= created_at`, a `created_at` domyslnie bierze `now()`
  // *bazy* — przy zasiewie z klienta te dwa zegary potrafia sie rozjechac o
  // ulamek sekundy w zla strone i wstawienie zaakceptowanego planu odpada.
  const now = new Date().toISOString();

  const { data: plan, error: planError } = await admin()
    .from("day_plans")
    .insert({
      user_id: options.userId,
      plan_date: options.planDate,
      prompt: options.prompt,
      created_at: now,
      accepted_at: options.accepted ? now : null,
    })
    .select("id")
    .single();

  if (planError) {
    throw new Error(`Nie udalo sie zasiac planu na ${options.planDate}: ${planError.message}`);
  }

  const { error: activitiesError } = await admin()
    .from("activities")
    .insert(
      options.activities.map((activity, index) => ({
        plan_id: plan.id,
        user_id: options.userId,
        generation: 1,
        ordinal: index + 1,
        title: activity.title,
        description: activity.description,
      })),
    );

  if (activitiesError) {
    throw new Error(`Nie udalo sie zasiac propozycji na ${options.planDate}: ${activitiesError.message}`);
  }

  return plan.id;
}

/**
 * Sprzata plany zasiane przez test. Propozycje znikaja kaskada z `activities`.
 *
 * Kasowanie po `id` zamiast po dacie: test, ktory sprzata "wszystko z tego
 * dnia", skasowalby tez wiersz drugiego konta, gdyby ten sam dzien byl w uzyciu
 * — a to jest dokladnie ten dzien, ktorego ryzyko #4 dotyczy.
 */
export async function deleteSeededPlans(planIds: readonly string[]): Promise<void> {
  if (planIds.length === 0) return;
  const { error } = await admin()
    .from("day_plans")
    .delete()
    .in("id", [...planIds]);
  if (error) {
    throw new Error(`Sprzatanie nie powiodlo sie: ${error.message}`);
  }
}
