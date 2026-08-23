import { useRef, useState } from "react";
import { CalendarDays, Check, CircleAlert, Pencil, RotateCcw, Sparkles, Undo2, X } from "lucide-react";
import { GenerationProgress } from "@/components/plan/GenerationProgress";
import { Button } from "@/components/ui/button";
import { DESCRIPTION_MAX, PROMPT_MAX, TITLE_MAX } from "@/lib/day-plan-limits";
import { formatAcceptedAt, formatPlanDate } from "@/lib/day-plan-dates";
import { cn } from "@/lib/utils";
import type { Activity, DayPlanView } from "@/types";

/**
 * The view of one saved day, not the owner of a generation.
 *
 * S-01's island *was* the plan: proposals lived in its state and died with the
 * page. That is the thing S-02 takes away. The initial state arrives from the
 * server, every mutation is a request, and the response replaces the state
 * wholesale - there are no optimistic writes, because the database now holds
 * facts this component cannot derive. Editing a title also clears the plan's
 * acceptance, by trigger, and the only way to know that happened is to be told.
 *
 * Changing the day is navigation, not state. `/plan?date=…` is what makes the
 * URL identify a day, refresh work, and the back button mean something.
 */

interface DayPlanEditorProps {
  /** The day this page is showing, already resolved server-side. */
  readonly planDate: string;
  /** What the server read for that day, or `null` when there is no plan yet. */
  readonly initialPlan: DayPlanView | null;
}

type Busy = "idle" | "generating" | "saving";

interface Failure {
  readonly message: string;
  readonly retryable: boolean;
  readonly signInRequired: boolean;
}

interface Draft {
  readonly id: string;
  readonly title: string;
  readonly description: string;
}

export default function DayPlanEditor({ planDate, initialPlan }: DayPlanEditorProps) {
  const [plan, setPlan] = useState<DayPlanView | null>(initialPlan);
  const [prompt, setPrompt] = useState(initialPlan?.plan.prompt ?? "");
  const [promptError, setPromptError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState<Busy>("idle");
  const [failure, setFailure] = useState<Failure | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  // The disabled buttons cover the ordinary double click; this covers the rest -
  // a second submit fired before React re-renders, or Enter held down in a field.
  // A duplicated generate would cost the teacher another 10-30s and more credits.
  const inFlight = useRef(false);
  // What the "Spróbuj ponownie" button re-runs. A ref rather than state because
  // it is never rendered, and storing a closure in state would re-render on every
  // request for nothing.
  const lastAttempt = useRef<(() => Promise<void>) | null>(null);

  const isBusy = busy !== "idle";
  const accepted = plan?.plan.accepted_at ?? null;
  const hasActivities = (plan?.activities.length ?? 0) > 0;

  /**
   * Every mutation goes through here: one in-flight guard, one error envelope,
   * one rule for what happens on success. The routes all answer with the whole
   * plan, so "apply the response" is the same line in all three cases.
   */
  async function mutate(request: () => Promise<Response>, busyKind: Busy): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    lastAttempt.current = () => mutate(request, busyKind);
    setBusy(busyKind);
    setFailure(null);

    try {
      const response = await request();
      const body: unknown = await response.json().catch(() => null);

      if (response.ok && isDayPlanBody(body)) {
        setPlan(body);
        setPrompt(body.plan.prompt);
        setDraft(null);
        return;
      }

      // The route decides whether retrying is worth the teacher's time; the
      // island does not second-guess it from the status code. Missing credits and
      // a passing rate limit both arrive as a failure, and only `retryable` tells
      // them apart.
      setFailure({
        message: isErrorBody(body) ? body.error : "Nie udało się zapisać zmiany. Spróbuj ponownie.",
        retryable: isErrorBody(body) ? body.retryable : true,
        signInRequired: response.status === 401,
      });
    } catch {
      // The request never completed - offline, or the connection dropped.
      setFailure({
        message: "Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.",
        retryable: true,
        signInRequired: false,
      });
    } finally {
      inFlight.current = false;
      setBusy("idle");
    }
  }

  function generate(): void {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setPromptError("Wpisz hasło dnia, np. „Andrzejki”.");
      return;
    }
    if (prompt.length > PROMPT_MAX) {
      setPromptError(`Hasło może mieć najwyżej ${String(PROMPT_MAX)} znaków.`);
      return;
    }
    setPromptError(undefined);

    // Only on an accepted plan. Regeneration always deletes the batch it
    // supersedes, but on a draft the teacher is still iterating and has invested
    // nothing in what is there - interrupting that is friction without a
    // decision behind it. An acceptance is the thing worth asking about, and the
    // prompt names what it costs rather than asking a generic "are you sure?".
    if (accepted) {
      const consequence =
        "Wygenerowanie nowych propozycji usunie obecne i cofnie akceptację tego planu. " +
        "Tej operacji nie można cofnąć.";
      if (!window.confirm(consequence)) {
        return;
      }
    }

    void mutate(
      () =>
        fetch("/api/day-plan/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan_date: planDate, prompt }),
        }),
      "generating",
    );
  }

  function saveDraft(current: Draft): void {
    void mutate(
      () =>
        fetch(`/api/day-plan/activity/${current.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: current.title, description: current.description }),
        }),
      "saving",
    );
  }

  function setAcceptance(next: boolean): void {
    if (!plan) return;
    const planId = plan.plan.id;
    void mutate(
      () =>
        fetch("/api/day-plan/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan_id: planId, accepted: next }),
        }),
      "saving",
    );
  }

  const remaining = PROMPT_MAX - prompt.length;

  return (
    <div className="space-y-6">
      <form
        className="space-y-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          generate();
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
              disabled={isBusy}
              onChange={(event) => {
                // Navigation, not state: the URL is what identifies the day, so
                // a refresh, a bookmark and the back button all keep working.
                if (event.target.value) {
                  window.location.assign(`/plan?date=${event.target.value}`);
                }
              }}
              className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 pl-10 text-white [color-scheme:dark] transition-colors focus:ring-2 focus:ring-purple-400 focus:outline-none disabled:opacity-60"
            />
          </div>
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
            disabled={isBusy}
            maxLength={PROMPT_MAX}
            placeholder="np. Andrzejki"
            onChange={(event) => {
              setPrompt(event.target.value);
              setPromptError(undefined);
            }}
            className={cn(
              "w-full resize-y rounded-lg border bg-white/10 px-3 py-2 text-white placeholder-white/40 transition-colors focus:ring-2 focus:outline-none disabled:opacity-60",
              promptError ? "border-red-400/60 focus:ring-red-400" : "border-white/20 focus:ring-purple-400",
            )}
          />
          <div className="mt-1 flex items-start justify-between gap-2">
            <FieldError message={promptError} />
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
          disabled={isBusy}
          className="w-full rounded-lg bg-purple-600 px-4 py-2 font-medium text-white transition-colors hover:bg-purple-500"
        >
          {hasActivities ? <RotateCcw className="size-4" /> : <Sparkles className="size-4" />}
          {busy === "generating" ? "Generuję…" : hasActivities ? "Generuj ponownie" : "Generuj"}
        </Button>
      </form>

      {busy === "generating" && <GenerationProgress />}

      {failure && (
        <div
          role="alert"
          className="space-y-3 rounded-xl border border-red-500/30 bg-red-900/30 p-4 text-sm text-red-200"
        >
          <p className="flex items-start gap-2">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            {failure.message}
          </p>
          {failure.signInRequired && (
            <a href="/auth/signin" className="inline-block font-medium text-purple-300 hover:underline">
              Zaloguj się ponownie
            </a>
          )}
          {failure.retryable && !failure.signInRequired && (
            <Button
              type="button"
              disabled={isBusy}
              onClick={() => void lastAttempt.current?.()}
              className="rounded-lg bg-white/10 px-4 py-2 text-white transition-colors hover:bg-white/20"
            >
              <RotateCcw className="size-4" />
              Spróbuj ponownie
            </Button>
          )}
        </div>
      )}

      {!hasActivities && busy !== "generating" && (
        <p className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-blue-100/70">
          Ten dzień nie ma jeszcze planu. Wpisz hasło i wygeneruj trzy propozycje zajęć.
        </p>
      )}

      {plan && hasActivities && (
        <section className="space-y-4" aria-label={`Plan na ${formatPlanDate(planDate)}`}>
          <AcceptanceBanner acceptedAt={accepted} />

          <ol className="space-y-3">
            {plan.activities.map((activity, index) => (
              <li key={activity.id} className="rounded-xl border border-white/10 bg-white/5 p-4 text-white">
                {draft?.id === activity.id ? (
                  <ActivityEditor
                    draft={draft}
                    disabled={isBusy}
                    onChange={setDraft}
                    onCancel={() => {
                      // The teacher's previous text was never sent, so cancelling
                      // is simply dropping the draft. This is the one thing this
                      // protocol buys over autosaving; it has to actually work.
                      setDraft(null);
                    }}
                    onSave={() => {
                      saveDraft(draft);
                    }}
                  />
                ) : (
                  <ActivityPreview
                    activity={activity}
                    index={index}
                    disabled={isBusy || draft !== null}
                    onEdit={() => {
                      setDraft({
                        id: activity.id,
                        title: activity.title,
                        description: activity.description,
                      });
                    }}
                  />
                )}
              </li>
            ))}
          </ol>

          <Button
            type="button"
            disabled={isBusy || draft !== null}
            onClick={() => {
              setAcceptance(accepted === null);
            }}
            className={cn(
              "w-full rounded-lg px-4 py-2 font-medium text-white transition-colors",
              accepted ? "border border-white/20 bg-white/10 hover:bg-white/20" : "bg-emerald-600 hover:bg-emerald-500",
            )}
          >
            {accepted ? <Undo2 className="size-4" /> : <Check className="size-4" />}
            {accepted ? "Cofnij akceptację" : "Akceptuj plan"}
          </Button>
        </section>
      )}
    </div>
  );
}

/** Draft or accepted, said in words and in colour rather than only in colour. */
function AcceptanceBanner({ acceptedAt }: { acceptedAt: string | null }) {
  if (!acceptedAt) {
    return (
      <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-blue-100/70">
        Plan roboczy — zmiany zapisują się od razu, ale plan nie jest jeszcze zaakceptowany.
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">
      <Check className="size-4 shrink-0" />
      Plan zaakceptowany {formatAcceptedAt(acceptedAt)}.
    </p>
  );
}

function ActivityPreview({
  activity,
  index,
  disabled,
  onEdit,
}: {
  activity: Activity;
  index: number;
  disabled: boolean;
  onEdit: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="font-semibold">
          <span className="mr-2 text-purple-300">{index + 1}.</span>
          {activity.title}
        </h3>
        <p className="mt-1 text-sm whitespace-pre-line text-blue-100/80">{activity.description}</p>
      </div>
      <Button
        type="button"
        disabled={disabled}
        onClick={onEdit}
        aria-label={`Edytuj propozycję: ${activity.title}`}
        className="shrink-0 rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white transition-colors hover:bg-white/20"
      >
        <Pencil className="size-3.5" />
        Edytuj
      </Button>
    </div>
  );
}

function ActivityEditor({
  draft,
  disabled,
  onChange,
  onCancel,
  onSave,
}: {
  draft: Draft;
  disabled: boolean;
  onChange: (next: Draft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const invalid = draft.title.trim().length === 0 || draft.description.trim().length === 0;

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`title-${draft.id}`} className="mb-1 block text-xs text-blue-100/70">
          Tytuł
        </label>
        <input
          id={`title-${draft.id}`}
          type="text"
          value={draft.title}
          disabled={disabled}
          maxLength={TITLE_MAX}
          onChange={(event) => {
            onChange({ ...draft, title: event.target.value });
          }}
          className="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white transition-colors focus:ring-2 focus:ring-purple-400 focus:outline-none disabled:opacity-60"
        />
      </div>
      <div>
        <label htmlFor={`description-${draft.id}`} className="mb-1 block text-xs text-blue-100/70">
          Opis
        </label>
        <textarea
          id={`description-${draft.id}`}
          rows={5}
          value={draft.description}
          disabled={disabled}
          maxLength={DESCRIPTION_MAX}
          onChange={(event) => {
            onChange({ ...draft, description: event.target.value });
          }}
          className="w-full resize-y rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-white transition-colors focus:ring-2 focus:ring-purple-400 focus:outline-none disabled:opacity-60"
        />
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          disabled={disabled || invalid}
          onClick={onSave}
          className="rounded-lg bg-purple-600 px-4 py-2 text-white transition-colors hover:bg-purple-500"
        >
          <Check className="size-4" />
          Zapisz
        </Button>
        <Button
          type="button"
          disabled={disabled}
          onClick={onCancel}
          className="rounded-lg bg-white/10 px-4 py-2 text-white transition-colors hover:bg-white/20"
        >
          <X className="size-4" />
          Anuluj
        </Button>
      </div>
      <p className="text-xs text-blue-100/50">Anuluj przywróci poprzedni tekst — nic nie zostanie zapisane.</p>
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

// ---------------------------------------------------------------------------
// Wire shapes
// ---------------------------------------------------------------------------
// Narrowed rather than asserted: an unexpected body should become a readable
// error, not a crash inside the island. `DayPlanView` and not
// `DayPlanWithCurrentActivities` - the brand on the latter says the batch has
// been checked against its plan's counter, and a predicate here would be
// claiming a check that never ran. The server did it before serialising.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDayPlanBody(body: unknown): body is DayPlanView {
  if (!isRecord(body) || !isRecord(body.plan) || !Array.isArray(body.activities)) {
    return false;
  }
  const plan = body.plan;
  if (typeof plan.id !== "string" || typeof plan.prompt !== "string") {
    return false;
  }
  if (plan.accepted_at !== null && typeof plan.accepted_at !== "string") {
    return false;
  }
  return body.activities.every(
    (item: unknown) =>
      isRecord(item) &&
      typeof item.id === "string" &&
      typeof item.title === "string" &&
      typeof item.description === "string",
  );
}

function isErrorBody(body: unknown): body is { error: string; retryable: boolean } {
  return isRecord(body) && typeof body.error === "string" && typeof body.retryable === "boolean";
}
