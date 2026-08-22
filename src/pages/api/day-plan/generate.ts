import type { APIRoute } from "astro";
import {
  generateDayActivities,
  GenerationError,
  type GenerationErrorCategory,
} from "@/lib/services/activity-generator";
import { generateDayPlanRequestSchema } from "@/lib/services/day-plan-contract";
import type { ActivityDraft } from "@/types";

export const prerender = false;

// ---------------------------------------------------------------------------
// Wire contract
// ---------------------------------------------------------------------------

interface GenerateSuccessBody {
  readonly activities: readonly ActivityDraft[];
}

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
 * Generates three activity proposals for one day.
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

  // `plan_date` is validated but not used: S-01 stores nothing, so the date only
  // labels the request. Validating it now keeps the wire contract stable for
  // S-02, which will persist it, instead of widening the endpoint later.
  try {
    const result = await generateDayActivities(parsed.data.prompt);
    return json({ activities: result.activities }, 200);
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
};
