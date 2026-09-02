import type { APIRoute } from "astro";
import {
  generateDayActivities,
  GenerationError,
  type GenerationErrorCategory,
} from "@/lib/services/activity-generator";
import { generateDayPlanRequestSchema } from "@/lib/services/day-plan-contract";
import { readDayPlan, saveGeneration, StoreError } from "@/lib/services/day-plan-store";
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
  // `generateDayActivities` already logged this one with its status and
  // error_type. Store failures are logged by `toStoreError`, not here - the two
  // layers each record their own, so this route adds nothing on either path.
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
  // gets a written message instead of an issue tree - one message for every way
  // the body can be wrong, including the single-line rule the schema now applies
  // to `prompt` and `theme`, because naming the offending character would tell a
  // caller probing the injection surface exactly which one to try next.
  const parsed = generateDayPlanRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return badRequest("Podaj poprawną datę oraz hasło — jedna linia tekstu, od 1 do 2000 znaków.");
  }

  const supabase = context.locals.supabase;
  if (!supabase) {
    return unconfigured();
  }

  // Both questions are asked before the model is, not after.
  // `save_day_plan_generation` refuses either violation on its own - that
  // refusal is the enforcement point and this is not - but reaching it costs the
  // teacher a 10-30s wait and the tokens for a batch that will never be stored.
  // One indexed read is cheaper than finding out afterwards, and for a week that
  // is five wasted generations rather than one. The window between this check
  // and the write is closed inside the function by `for update`, not here.
  try {
    const existing = await readDayPlan(supabase, parsed.data.plan_date);
    if (existing && parsed.data.only_if_absent) {
      // The week generation's skip policy. Named rather than left to the
      // category default, which talks about refreshing the page - here nothing
      // is stale and nothing needs refreshing: the day was simply already
      // planned, and was left exactly as it was.
      return storeFailure(
        new StoreError("conflict", `Plan ${parsed.data.plan_date} already exists; week generation left it alone.`, {
          userMessage: "Ten dzień ma już plan — nie został nadpisany.",
        }),
      );
    }
    if (existing?.plan.accepted_at && !parsed.data.confirm_replace) {
      return storeFailure(
        new StoreError("conflict", `Plan ${parsed.data.plan_date} is accepted; regeneration was not confirmed.`),
      );
    }
  } catch (error) {
    return storeFailure(error);
  }

  let generated;
  try {
    // The date reaches the model now, which it did not in S-01 ("S-01 stores
    // nothing, so the date only labels the request"). With one day that was
    // immaterial; with five days grown from one hasło it is the difference
    // between a week of lessons and the same lesson five times - finding F4 of
    // the S-01 implementation review.
    generated = await generateDayActivities(parsed.data.prompt, {
      planDate: parsed.data.plan_date,
      theme: parsed.data.theme,
    });
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
      confirm_replace: parsed.data.confirm_replace,
      theme: parsed.data.theme,
      require_absent: parsed.data.only_if_absent,
    });

    return json(requireSaved(await readDayPlan(supabase, parsed.data.plan_date), planId), 200);
  } catch (error) {
    return storeFailure(error);
  }
};
