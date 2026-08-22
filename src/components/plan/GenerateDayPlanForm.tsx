import { useRef, useState } from "react";
import { CalendarDays, CircleAlert, RotateCcw, Sparkles } from "lucide-react";
import { GenerationProgress } from "@/components/plan/GenerationProgress";
import { Button } from "@/components/ui/button";
import { PROMPT_MAX } from "@/lib/day-plan-limits";
import { cn } from "@/lib/utils";
import type { ActivityDraft } from "@/types";

const ENDPOINT = "/api/day-plan/generate";

/**
 * S-01 stores nothing, so this component *is* the state of a generation: the
 * proposals live here and die with the page. Regeneration (FR-007) is therefore
 * just the same POST again - there is no batch to supersede yet. That arrives
 * with S-02.
 */
type Status =
  | { readonly kind: "idle" }
  | { readonly kind: "generating"; readonly startedAt: number }
  | { readonly kind: "ready"; readonly activities: readonly ActivityDraft[] }
  | {
      readonly kind: "failed";
      readonly message: string;
      readonly retryable: boolean;
      readonly signInRequired: boolean;
    };

interface FieldErrors {
  planDate?: string;
  prompt?: string;
}

export default function GenerateDayPlanForm() {
  const [planDate, setPlanDate] = useState(todayIsoDate);
  const [prompt, setPrompt] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  // The disabled button covers the ordinary double click; this covers the rest -
  // a double submit fired before React has re-rendered, or Enter held down in the
  // date field. A second POST would cost the teacher a second generation's worth
  // of credits and return a set of proposals nobody asked for.
  const inFlight = useRef(false);

  const isGenerating = status.kind === "generating";

  async function generate() {
    if (inFlight.current) return;

    const errors = validate(planDate, prompt);
    setFieldErrors(errors);
    if (errors.planDate ?? errors.prompt) return;

    inFlight.current = true;
    setStatus({ kind: "generating", startedAt: Date.now() });

    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_date: planDate, prompt }),
      });

      const body: unknown = await response.json().catch(() => null);

      if (response.ok && isSuccessBody(body)) {
        setStatus({ kind: "ready", activities: body.activities });
        return;
      }

      // The route decides whether retrying is worth the teacher's time; the
      // island does not second-guess it from the status code. Missing credits and
      // a passing rate limit both arrive as a failure, and only `retryable` tells
      // them apart.
      setStatus({
        kind: "failed",
        message: isErrorBody(body) ? body.error : "Nie udało się wygenerować propozycji. Spróbuj ponownie.",
        retryable: isErrorBody(body) ? body.retryable : true,
        signInRequired: response.status === 401,
      });
    } catch {
      // The request never completed - offline, or the connection dropped mid-way.
      setStatus({
        kind: "failed",
        message: "Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.",
        retryable: true,
        signInRequired: false,
      });
    } finally {
      inFlight.current = false;
    }
  }

  const remaining = PROMPT_MAX - prompt.length;

  return (
    <div className="space-y-6">
      <form
        className="space-y-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void generate();
        }}
      >
        <div>
          <label htmlFor="plan-date" className="mb-1 block text-sm text-blue-100/80">
            Dzień
          </label>
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-white/40" />
            <input
              id="plan-date"
              name="plan_date"
              type="date"
              value={planDate}
              disabled={isGenerating}
              onChange={(event) => {
                setPlanDate(event.target.value);
                setFieldErrors((previous) => ({ ...previous, planDate: undefined }));
              }}
              className={cn(
                "w-full rounded-lg border bg-white/10 px-3 py-2 pl-10 text-white [color-scheme:dark] transition-colors focus:ring-2 focus:outline-none disabled:opacity-60",
                fieldErrors.planDate ? "border-red-400/60 focus:ring-red-400" : "border-white/20 focus:ring-purple-400",
              )}
            />
          </div>
          <FieldError message={fieldErrors.planDate} />
        </div>

        <div>
          <label htmlFor="prompt" className="mb-1 block text-sm text-blue-100/80">
            Hasło dnia
          </label>
          <textarea
            id="prompt"
            name="prompt"
            rows={3}
            value={prompt}
            disabled={isGenerating}
            maxLength={PROMPT_MAX}
            placeholder="np. Andrzejki"
            onChange={(event) => {
              setPrompt(event.target.value);
              setFieldErrors((previous) => ({ ...previous, prompt: undefined }));
            }}
            className={cn(
              "w-full resize-y rounded-lg border bg-white/10 px-3 py-2 text-white placeholder-white/40 transition-colors focus:ring-2 focus:outline-none disabled:opacity-60",
              fieldErrors.prompt ? "border-red-400/60 focus:ring-red-400" : "border-white/20 focus:ring-purple-400",
            )}
          />
          <div className="mt-1 flex items-start justify-between gap-2">
            <FieldError message={fieldErrors.prompt} />
            {/* Same bound as the route's zod schema, read from the same module,
                so the counter cannot promise what the server then rejects. */}
            <span
              className={cn("ml-auto text-xs tabular-nums", remaining < 100 ? "text-amber-300" : "text-blue-100/50")}
            >
              {prompt.length} / {PROMPT_MAX}
            </span>
          </div>
        </div>

        <Button
          type="submit"
          disabled={isGenerating}
          className="w-full rounded-lg bg-purple-600 px-4 py-2 font-medium text-white transition-colors hover:bg-purple-500"
        >
          <Sparkles className="size-4" />
          {isGenerating ? "Generuję…" : "Generuj"}
        </Button>
      </form>

      {status.kind === "generating" && <GenerationProgress startedAt={status.startedAt} />}

      {status.kind === "failed" && (
        <div
          role="alert"
          className="space-y-3 rounded-xl border border-red-500/30 bg-red-900/30 p-4 text-sm text-red-200"
        >
          <p className="flex items-start gap-2">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            {status.message}
          </p>
          {status.signInRequired && (
            <a href="/auth/signin" className="inline-block font-medium text-purple-300 hover:underline">
              Zaloguj się ponownie
            </a>
          )}
          {status.retryable && (
            <Button
              type="button"
              onClick={() => void generate()}
              className="rounded-lg bg-white/10 px-4 py-2 text-white transition-colors hover:bg-white/20"
            >
              <RotateCcw className="size-4" />
              Spróbuj ponownie
            </Button>
          )}
        </div>
      )}

      {status.kind === "ready" && (
        <section className="space-y-4" aria-label="Wygenerowane propozycje">
          <ol className="space-y-3">
            {status.activities.map((activity, index) => (
              <li
                key={`${String(index)}-${activity.title}`}
                className="rounded-xl border border-white/10 bg-white/5 p-4 text-white"
              >
                <h3 className="font-semibold">
                  <span className="mr-2 text-purple-300">{index + 1}.</span>
                  {activity.title}
                </h3>
                <p className="mt-1 text-sm text-blue-100/80">{activity.description}</p>
              </li>
            ))}
          </ol>
          <div className="space-y-2">
            <Button
              type="button"
              onClick={() => void generate()}
              className="w-full rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-white transition-colors hover:bg-white/20"
            >
              <RotateCcw className="size-4" />
              Generuj ponownie
            </Button>
            <p className="text-center text-xs text-blue-100/50">
              Propozycje nie są jeszcze zapisywane — po odświeżeniu strony znikną.
            </p>
          </div>
        </section>
      )}
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="flex items-center gap-1 text-xs text-red-300">
      <CircleAlert className="size-3" />
      {message}
    </p>
  );
}

function validate(planDate: string, prompt: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!planDate) {
    errors.planDate = "Wybierz dzień, dla którego generujemy propozycje.";
  }
  const trimmed = prompt.trim();
  if (!trimmed) {
    errors.prompt = "Wpisz hasło dnia, np. „Andrzejki”.";
  } else if (prompt.length > PROMPT_MAX) {
    errors.prompt = `Hasło może mieć najwyżej ${String(PROMPT_MAX)} znaków.`;
  }
  return errors;
}

/**
 * Local date, not `toISOString().slice(0, 10)` - that one is UTC, and a teacher
 * opening the page at 22:00 in Poland would be offered tomorrow.
 */
function todayIsoDate(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${String(now.getFullYear())}-${month}-${day}`;
}

// ---------------------------------------------------------------------------
// Wire shapes
// ---------------------------------------------------------------------------
// Narrowed rather than asserted: an unexpected body should become a readable
// error, not a crash inside the island.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSuccessBody(body: unknown): body is { activities: ActivityDraft[] } {
  return (
    isRecord(body) &&
    Array.isArray(body.activities) &&
    body.activities.every(
      (item: unknown) => isRecord(item) && typeof item.title === "string" && typeof item.description === "string",
    )
  );
}

function isErrorBody(body: unknown): body is { error: string; retryable: boolean } {
  return isRecord(body) && typeof body.error === "string" && typeof body.retryable === "boolean";
}
