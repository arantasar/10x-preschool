import type { APIRoute } from "astro";
import {
  generateDayActivities,
  GenerationError,
  type GenerationErrorCategory,
} from "@/lib/services/activity-generator";
import { generateDayPlanRequestSchema } from "@/lib/services/day-plan-contract";
import { readDayPlan, saveGeneration } from "@/lib/services/day-plan-store";
import {
  json,
  requireSaved,
  badRequest,
  storeFailure,
  unauthorized,
  unconfigured,
  type DayPlanErrorBody,
} from "@/lib/services/day-plan-http";

export const prerender = false;

// ---------------------------------------------------------------------------
// Wire contract
// ---------------------------------------------------------------------------

/**
 * `retryable` is the whole point of this envelope. Without it, "out of credits"
 * and "rate limited for the next few seconds" look identical to a teacher, and
 * the island has to guess from a message string whether to keep the retry button.
 *
 * The envelope, the success body and the store-failure half of this table all
 * live in `day-plan-http.ts` now - three routes answer with them. What stays
 * here is what only this route can fail at: the model.
 */

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
 * What the teacher reads. Deliberately not `GenerationError.message`: that one
 * carries upstream status codes and provider wording, which belongs in the log,
 * not on a preschool teacher's screen.
 */
const MESSAGE_BY_CATEGORY: Record<GenerationErrorCategory, string> = {
  config: "Generowanie propozycji jest teraz niedostępne. Skontaktuj się z administratorem.",
  transient: "Usługa generowania jest chwilowo przeciążona. Spróbuj ponownie za chwilę.",
  invalid: "Coś poszło nie tak podczas generowania. Spróbuj ponownie.",
};

function generationFailure(error: unknown): Response {
  // The service already logged the failure with its status and error_type.
  const failure =
    error instanceof GenerationError
      ? error
      : new GenerationError("invalid", "Nieoczekiwany błąd trasy generowania.", { cause: error });

  const body: DayPlanErrorBody = {
    error: MESSAGE_BY_CATEGORY[failure.category],
    retryable: failure.retryable,
  };
  return json(body, STATUS_BY_CATEGORY[failure.category]);
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
    return unauthorized();
  }

  // JSON rather than `formData`, because the caller is a React island.
  let payload: unknown;
  try {
    payload = await context.request.json();
  } catch {
    return badRequest("Nieprawidłowe żądanie.");
  }

  // First use of zod in the project; the auth routes still read `form.get(...)
  // as string`. The bounds come from `day-plan-contract`, which mirrors the
  // CHECK constraints, so a hasło accepted here cannot become one S-02 refuses
  // to store. Zod's own error is logged-shaped, not user-shaped, so the client
  // gets a written message instead of an issue tree.
  const parsed = generateDayPlanRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return badRequest("Podaj poprawną datę oraz hasło o długości od 1 do 2000 znaków.");
  }

  const supabase = context.locals.supabase;
  if (!supabase) {
    return unconfigured();
  }

  let generated;
  try {
    generated = await generateDayActivities(parsed.data.prompt);
  } catch (error) {
    return generationFailure(error);
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

    return json(requireSaved(await readDayPlan(supabase, parsed.data.plan_date), planId), 200);
  } catch (error) {
    return storeFailure(error);
  }
};
