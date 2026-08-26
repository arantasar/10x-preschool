import type { APIRoute } from "astro";
import { generateWeekOutline, GenerationError, type GenerationErrorCategory } from "@/lib/services/activity-generator";
import { weekOutlineRequestSchema } from "@/lib/services/day-plan-contract";
import { badRequest, json, unauthorized, unconfigured } from "@/lib/services/day-plan-http";
import type { DayTheme } from "@/types";

export const prerender = false;

/**
 * Splits one hasło into a theme per working day (S-03).
 *
 * Writes nothing, and that is the design rather than an omission. A theme
 * belongs to a `day_plans` row, and that row is created by the generation it
 * belongs to - so a theme stored here would have to invent five plans for days
 * that may never be generated (the teacher can close the tab, or every call can
 * fail), leaving empty plans behind that `/plan/month` would then show as
 * planned days. The outline is handed back to the island, which passes each
 * theme into the day generation that uses it.
 *
 * The consequence is honest and visible: a day whose generation failed has no
 * row, so after a refresh its theme is gone and a retry runs on the hasło alone.
 * The week board says so on the card rather than quietly dropping the day out of
 * the week's arc.
 *
 * Session is checked here rather than in `src/middleware.ts` for the reason
 * `day-plan-http.ts` records: this route is called with `fetch`, and a redirect
 * would arrive as a JSON parse error instead of "your session expired".
 */

const STATUS_BY_CATEGORY: Record<GenerationErrorCategory, number> = {
  config: 500,
  transient: 503,
  invalid: 502,
};

const MESSAGE_BY_CATEGORY: Record<GenerationErrorCategory, string> = {
  config: "Generowanie propozycji jest teraz niedostępne. Skontaktuj się z administratorem.",
  transient: "Usługa generowania jest chwilowo przeciążona. Spróbuj ponownie za chwilę.",
  invalid: "Nie udało się ułożyć tematów na tydzień. Spróbuj ponownie.",
};

/** What the island receives: one theme per working day, already pinned to dates. */
export interface WeekOutlineResponse {
  readonly themes: readonly DayTheme[];
}

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return unauthorized();
  }

  let payload: unknown;
  try {
    payload = await context.request.json();
  } catch {
    return badRequest("Nieprawidłowe żądanie.");
  }

  const parsed = weekOutlineRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return badRequest("Podaj hasło o długości od 1 do 2000 znaków oraz pięć dni roboczych.");
  }

  // Nothing here touches Supabase, but the check stays: a teacher whose database
  // is unreachable cannot store anything the outline leads to, and letting them
  // pay for five generations first would be the expensive way to find out.
  if (!context.locals.supabase) {
    return unconfigured();
  }

  try {
    const outline = await generateWeekOutline(parsed.data.prompt, parsed.data.dates);
    return json({ themes: outline.themes }, 200);
  } catch (error) {
    // `generateWeekOutline` already logged this with its status and error_type.
    const failure =
      error instanceof GenerationError
        ? error
        : new GenerationError("invalid", "Nieoczekiwany błąd trasy szkicu tygodnia.", { cause: error });

    return json(
      { error: MESSAGE_BY_CATEGORY[failure.category], retryable: failure.retryable },
      STATUS_BY_CATEGORY[failure.category],
    );
  }
};
