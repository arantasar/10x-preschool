import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/db/database.types";
import type { DayPlanClient } from "@/lib/services/day-plan-store";

// Dates and stamps come from the e2e tier rather than a copy of it: the same
// far-future window, so neither tier's days can land on a day someone looked at
// by hand in the app. This leans on `test-data.ts` importing `supabase-admin`
// type-only: a value import there would pull in e2e's `env.ts` and make this
// tier demand the e2e environment variables.
export { activitiesFor, plusDays, uniquePlanDate, uniqueStamp } from "../../../../tests/e2e/support/test-data";

/**
 * The one place that knows the local Supabase stack, for the route + real
 * client tier (`*.db.test.ts`, `npm run test:db:api`, test plan §6.3).
 *
 * Two clients, two kinds of trust:
 *
 *   * `teacherClient` - the publishable key plus a real sign-in. What a route
 *     gets in `locals.supabase` in production, so RLS decides what it sees.
 *     **Every assertion reads through one of these.**
 *   * the service client below - the secret key. It bypasses RLS, **and that is
 *     why nothing may assert through it.** Ownership here is RLS and nothing
 *     else (`day-plan-store.ts`: no function filters on `user_id`), so a read
 *     that bypasses RLS would check that a row exists in the database, not that
 *     *the other account cannot see it*. It creates accounts, seeds and cleans
 *     up - the same rule as `tests/e2e/support/supabase-admin.ts`.
 *
 * It fails loudly rather than skipping. A stack that is not running or keys
 * that are missing throw at import, so the run ends red with the reason; a
 * skipped test in CI is a green badge over nothing checked.
 */

interface LocalStack {
  readonly apiUrl: string;
  readonly publishableKey: string;
  readonly secretKey: string;
}

const STACK_VARIABLES = ["API_URL", "PUBLISHABLE_KEY", "SECRET_KEY"] as const;

/** `KEY="value"` lines, as `supabase status -o env` prints them. */
function parseEnvOutput(output: string): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const line of output.split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) {
      entries[match[1]] = match[2].replace(/^"(.*)"$/, "$1");
    }
  }
  return entries;
}

function readLocalStack(): LocalStack {
  // Named exactly as `supabase status -o env` names them, so CI can pipe that
  // output into the environment unchanged.
  let values: Record<string, string | undefined> = Object.fromEntries(
    STACK_VARIABLES.map((name) => [name, process.env[name]]),
  );

  let statusFailure = "";
  if (STACK_VARIABLES.some((name) => !values[name])) {
    try {
      const output = execFileSync("npx", ["supabase", "status", "-o", "env"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        // A hung Docker daemon would otherwise hang the run at import.
        timeout: 30_000,
      });
      values = { ...parseEnvOutput(output), ...Object.fromEntries(Object.entries(values).filter(([, v]) => v)) };
    } catch (error) {
      // Falls through to the missing-variable error below, which says what to
      // do; the CLI's own reason (e.g. no Docker daemon) rides along.
      const stderr = (error as { stderr?: unknown }).stderr;
      statusFailure = typeof stderr === "string" && stderr.trim() ? stderr.trim() : String(error);
    }
  }

  const missing = STACK_VARIABLES.filter((name) => !values[name]);
  if (missing.length > 0) {
    throw new Error(
      `Lokalny stos Supabase jest niedostępny (brak ${missing.join(", ")}). ` +
        "Uruchom `npx supabase start` i spróbuj ponownie - ta warstwa nie pomija testów bez stosu." +
        (statusFailure ? `\n\`supabase status\`: ${statusFailure}` : ""),
    );
  }

  const apiUrl = values.API_URL ?? "";
  // The tests create accounts and delete days. Pointed anywhere but this
  // machine, that is a production incident, so the check is on the hostname
  // rather than on trust in whoever set the variable.
  const hostname = new URL(apiUrl).hostname;
  if (hostname !== "127.0.0.1" && hostname !== "localhost") {
    throw new Error(`API_URL wskazuje na ${hostname}, nie na lokalny stos. Ta warstwa działa wyłącznie lokalnie.`);
  }

  return { apiUrl, publishableKey: values.PUBLISHABLE_KEY ?? "", secretKey: values.SECRET_KEY ?? "" };
}

const stack = readLocalStack();

const service: SupabaseClient<Database> = createClient<Database>(stack.apiUrl, stack.secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Own addresses, distinct from the e2e accounts, so this tier and a Playwright
 * run against the same stack never share a teacher. Fixed across runs, like
 * e2e's: uniqueness lives in the plan date, not the identity.
 */
const TEACHERS = {
  a: "api-teacher-a@example.test",
  b: "api-teacher-b@example.test",
} as const;

/** Local stack only, guarded above - never a real credential. */
const PASSWORD = "api-teacher-local-only";

export type TeacherKey = keyof typeof TEACHERS;

export interface Teacher {
  /** Exactly what a route receives as `locals.supabase`, signed in as this teacher. */
  readonly client: DayPlanClient;
  readonly userId: string;
}

async function findUserId(email: string): Promise<string | null> {
  // The admin API has no lookup by address, so page through; a local stack has
  // a handful of users.
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      throw new Error(`Nie udało się odczytać listy kont: ${error.message}`);
    }
    const hit = data.users.find((user) => user.email === email);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function ensureUser(email: string): Promise<string> {
  const existing = await findUserId(email);
  if (existing) return existing;

  const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) {
    // Another run against the same stack created it first.
    const raced = await findUserId(email);
    if (raced) return raced;
    throw new Error(`Nie udało się założyć konta ${email}: ${error.message}`);
  }
  return data.user.id;
}

/** A client signed in as teacher a or b, creating the account the first time. */
export async function teacherClient(which: TeacherKey): Promise<Teacher> {
  const email = TEACHERS[which];
  const userId = await ensureUser(email);

  const client = createClient<Database>(stack.apiUrl, stack.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) {
    throw new Error(`Nie udało się zalogować jako ${email}: ${error.message}`);
  }
  return { client, userId };
}

export interface SeedDayOptions {
  readonly prompt: string;
  readonly activities: readonly { readonly title: string; readonly description: string }[];
  /** `true` stores an `accepted_at`: a day marked „zatwierdzony” rather than „do przejrzenia”. */
  readonly accepted?: boolean;
}

export interface SeededDay {
  readonly planId: string;
  /** In ordinal order. */
  readonly activityIds: readonly string[];
}

/** Writes a day straight into the database, as the service client, bypassing generation. */
export async function seedDay(userId: string, planDate: string, options: SeedDayOptions): Promise<SeededDay> {
  // Both stamps from one clock reading: `day_plans_accepted_after_created`
  // wants `accepted_at >= created_at`, and `created_at` would otherwise come
  // from the database's clock, which can sit a fraction of a second ahead.
  const now = new Date().toISOString();

  const { data: plan, error: planError } = await service
    .from("day_plans")
    .insert({
      user_id: userId,
      plan_date: planDate,
      prompt: options.prompt,
      created_at: now,
      accepted_at: options.accepted ? now : null,
    })
    .select("id")
    .single();
  if (planError) {
    throw new Error(`Nie udało się zasiać planu na ${planDate}: ${planError.message}`);
  }

  const { data: activities, error: activitiesError } = await service
    .from("activities")
    .insert(
      options.activities.map((activity, index) => ({
        plan_id: plan.id,
        user_id: userId,
        generation: 1,
        ordinal: index + 1,
        title: activity.title,
        description: activity.description,
      })),
    )
    .select("id, ordinal")
    .order("ordinal");
  if (activitiesError) {
    // The caller never gets this plan's id to clean up, so take it back here.
    await cleanup([plan.id]);
    throw new Error(`Nie udało się zasiać propozycji na ${planDate}: ${activitiesError.message}`);
  }

  return { planId: plan.id, activityIds: activities.map((activity) => activity.id) };
}

/**
 * Deletes plans by id; their proposals go by cascade.
 *
 * By id, never by date: a cleanup of "everything on this day" would also take
 * the other account's row on the same day - the very row these tests exist to
 * protect.
 */
export async function cleanup(planIds: readonly string[]): Promise<void> {
  if (planIds.length === 0) return;
  const { error } = await service
    .from("day_plans")
    .delete()
    .in("id", [...planIds]);
  if (error) {
    throw new Error(`Sprzątanie nie powiodło się: ${error.message}`);
  }
}
