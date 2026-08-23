import type { APIRoute } from "astro";
import {
  generateDayActivities,
  GenerationError,
  type GenerationErrorCategory,
} from "@/lib/services/activity-generator";
import { generateDayPlanRequestSchema } from "@/lib/services/day-plan-contract";
import { readDayPlan, saveGeneration, StoreError, type StoreErrorCategory } from "@/lib/services/day-plan-store";
import type { DayPlanWithCurrentActivities } from "@/types";

export const prerender = false;

// ---------------------------------------------------------------------------
// Wire contract
// ---------------------------------------------------------------------------

/**
 * The saved plan, not the proposals that were generated.
 *
 * S-01 answered with loose `ActivityDraft`s because nothing was stored. Now that
 * the database is the source of truth, there is no such thing as a proposal
 * without a row - so the response is a read of what was written, and the island
 * renders persisted state rather than the echo of its own request.
 */
type GenerateSuccessBody = DayPlanWithCurrentActivities;

/**
 * `retryable` is the whole point of this envelope. Without it, "out of credits"
 * and "rate limited for the next few seconds" look identical to a teacher, and
 * the island has to guess from a message string whether to keep the retry button.
 */
interface GenerateErrorBody {
  readonly error: string;
  readonly retryable: boolean;
}

/**
 * One status per category, so a server log can tell the three apart without
 * reading response bodies: 500 needs an operator (key, credits), 503 will pass
 * on its own, 502 means the model answered with something off-contract.
 */
const STATUS_BY_CATEGORY: Record<GenerationErrorCategory, number> = {
  config: 500,
  transient: 503,
  invalid: 502,
};

/**
 * The same question asked of the persistence layer. A failed write is the
 * teacher's problem in a different way than a failed generation - they have
 * already paid the 10-30 seconds - so `transient` is the one that must survive
 * as 503 with `retryable: true`.
 */
const STATUS_BY_STORE_CATEGORY: Record<StoreErrorCategory, number> = {
  config: 500,
  transient: 503,
  invalid: 500,
  not_found: 404,
};

const STORE_MESSAGE_BY_CATEGORY: Record<StoreErrorCategory, string> = {
  config: "Zapisywanie planów jest teraz niedostępne. Skontaktuj się z administratorem.",
  transient: "Nie udało się zapisać planu. Spróbuj ponownie za chwilę.",
  invalid: "Nie udało się zapisać planu. Spróbuj wygenerować propozycje ponownie.",
  not_found: "Nie znaleziono planu dnia.",
};

/**
 * What the teacher reads. Deliberately not `GenerationError.message`: that one
 * carries upstream status codes and provider wording, which belongs in the log,
 * not on a preschool teacher's screen.
 */
const MESSAGE_BY_CATEGORY: Record<GenerationErrorCategory, string> = {
  config: "Generowanie propozycji jest teraz niedostępne. Skontaktuj się z administratorem.",
  transient: "Usługa generowania jest chwilowo przeciążona. Spróbuj ponownie za chwilę.",
  invalid: "Coś poszło nie tak podczas generowania. Spróbuj ponownie.",
};

function json(body: GenerateSuccessBody | GenerateErrorBody, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

/**
 * Generates three activity proposals for one day and stores them.
 *
 * Authentication is checked here rather than left to `src/middleware.ts`, which
 * answers a missing session with `context.redirect("/auth/signin")`. That is
 * right for a page and wrong for this route: the React island calling it with
 * `fetch` would follow the redirect and try to parse the sign-in page as JSON,
 * turning "your session expired" into a parse error. `/plan` - the page - is the
 * one that belongs in `PROTECTED_ROUTES`.
 */
export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return json({ error: "Twoja sesja wygasła. Zaloguj się ponownie.", retryable: false }, 401);
  }

  // JSON rather than `formData`, because the caller is a React island.
  let payload: unknown;
  try {
    payload = await context.request.json();
  } catch {
    return json({ error: "Nieprawidłowe żądanie.", retryable: false }, 400);
  }

  // First use of zod in the project; the auth routes still read `form.get(...)
  // as string`. The bounds come from `day-plan-contract`, which mirrors the
  // CHECK constraints, so a hasło accepted here cannot become one S-02 refuses
  // to store. Zod's own error is logged-shaped, not user-shaped, so the client
  // gets a written message instead of an issue tree.
  const parsed = generateDayPlanRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return json(
      {
        error: "Podaj poprawną datę oraz hasło o długości od 1 do 2000 znaków.",
        retryable: false,
      },
      400,
    );
  }

  const supabase = context.locals.supabase;
  if (!supabase) {
    return json({ error: MESSAGE_BY_CATEGORY.config, retryable: false }, 500);
  }

  let generated;
  try {
    generated = await generateDayActivities(parsed.data.prompt);
  } catch (error) {
    // The service already logged the failure with its status and error_type.
    const failure =
      error instanceof GenerationError
        ? error
        : new GenerationError("invalid", "Nieoczekiwany błąd trasy generowania.", { cause: error });

    return json(
      { error: MESSAGE_BY_CATEGORY[failure.category], retryable: failure.retryable },
      STATUS_BY_CATEGORY[failure.category],
    );
  }

  // From here the proposals exist but have no home yet, and this is the one
  // place in the request where that is true. If the write fails, the teacher is
  // told so - the proposals are *not* handed back unsaved. "A proposal without a
  // row" is a state this slice deliberately has no representation for; offering
  // one would put the island back in the business of owning plan state, which is
  // exactly what S-02 takes away from it.
  try {
    const planId = await saveGeneration(supabase, {
      plan_date: parsed.data.plan_date,
      prompt: parsed.data.prompt,
      activities: generated.activities,
    });

    const saved = await readDayPlan(supabase, parsed.data.plan_date);
    if (!saved) {
      // The write reported success and the read found nothing. Not a 404 - the
      // plan id is in hand - so it is reported as the inconsistency it is.
      throw new StoreError("transient", `Zapisany plan ${planId} nie jest widoczny po zapisie.`);
    }

    return json(saved, 200);
  } catch (error) {
    const failure =
      error instanceof StoreError ? error : new StoreError("transient", "Nieoczekiwany błąd zapisu.", { cause: error });

    return json(
      { error: STORE_MESSAGE_BY_CATEGORY[failure.category], retryable: failure.retryable },
      STATUS_BY_STORE_CATEGORY[failure.category],
    );
  }
};
