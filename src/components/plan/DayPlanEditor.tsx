import { useRef, useState } from "react";
import { CalendarDays, Check, CircleAlert, Pencil, RotateCcw, Sparkles, Trash2, Undo2, X } from "lucide-react";
import { GenerationProgress } from "@/components/plan/GenerationProgress";
import { Button } from "@/components/ui/button";
import { DESCRIPTION_MAX, PROMPT_MAX, TITLE_MAX } from "@/lib/day-plan-limits";
import { formatAcceptedAt, formatPlanDate } from "@/lib/day-plan-dates";
import { cn } from "@/lib/utils";
import { isDayPlanBody, isErrorBody, readAcceptanceCleared } from "@/lib/day-plan-guards";
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

type Busy = "idle" | "generating" | "saving" | "deleting";

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
  const [draft, setDraftState] = useState<Draft | null>(null);
  // Whether the *last* mutation is the one that took the acceptance away.
  //
  // Read from the response, never from `accepted`: this island's copy of the
  // truth can be minutes old, and the case this whole change exists for is
  // exactly the one where it is wrong. Local and deliberately not persisted -
  // it is a sentence about something that just happened on this screen, and a
  // reload has nothing to explain.
  const [clearedByEdit, setClearedByEdit] = useState(false);
  // A live mirror of `draft`, read by the retry path. `draft` itself is captured
  // by whichever closure was built at the first attempt, and the teacher goes on
  // typing after a failure - the editor stays open precisely so they can. Reading
  // state through this ref is what makes "Spróbuj ponownie" mean "send what is on
  // screen now" rather than "send what was on screen when it failed".
  const draftRef = useRef<Draft | null>(null);

  function setDraft(next: Draft | null): void {
    draftRef.current = next;
    setDraftState(next);
  }

  // The disabled buttons cover the ordinary double click; this covers the rest -
  // a second submit fired before React re-renders, or Enter held down in a field.
  // A duplicated generate would cost the teacher another 10-30s and more credits.
  const inFlight = useRef(false);
  // What the "Spróbuj ponownie" button re-runs. A ref rather than state because
  // it is never rendered, and storing a closure in state would re-render on every
  // request for nothing.
  const lastAttempt = useRef<(() => void) | null>(null);
  // Set once a delete has succeeded and `window.location.assign` has been
  // called. `assign` does not block, so without this the `finally` below hands
  // the button back to the teacher for the whole length of the SSR round trip -
  // enabled, relabelled, and still showing the plan that is already gone.
  const navigatingAway = useRef(false);

  const isBusy = busy !== "idle";
  const accepted = plan?.plan.accepted_at ?? null;
  const hasActivities = (plan?.activities.length ?? 0) > 0;

  /**
   * Re-reads the day after a mutation failed, so what is on screen is what the
   * server holds before the teacher decides whether to retry.
   *
   * A failed write does not mean nothing was written. `saveGeneration` retries
   * once and is knowingly not idempotent, so a lost response can leave a batch
   * committed that this island has never seen; showing the pre-request view and a
   * retry button then invites a second paid generation of a day that already has
   * one. Its own failure is swallowed: the mutation's message is the one worth
   * reading, and replacing it with "the refresh also failed" helps nobody.
   */
  async function reconcile(): Promise<void> {
    try {
      const response = await fetch(`/api/day-plan?date=${planDate}`);
      if (response.status === 404) {
        setPlan(null);
        return;
      }
      const body: unknown = await response.json().catch(() => null);
      if (response.ok && isDayPlanBody(body)) {
        setPlan(body);
      }
    } catch {
      // Leave the stale view standing rather than blanking it on a second failure.
    }
  }

  /**
   * Every mutation goes through here: one in-flight guard, one error envelope,
   * one rule for what happens on success. The routes all answer with the whole
   * plan, so "apply the response" is the same line in all three cases.
   */
  async function mutate(request: () => Promise<Response>, busyKind: Busy, retry?: () => void): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    // Re-running `request` verbatim is right for the mutations whose body is
    // already settled, and wrong for the one whose body is still being edited -
    // hence `retry`, which lets a caller describe the intent instead of freezing
    // the payload. See `saveDraft`.
    lastAttempt.current =
      retry ??
      (() => {
        void mutate(request, busyKind);
      });
    setBusy(busyKind);
    setFailure(null);
    // Cleared at the *start* of every mutation, not only when one succeeds.
    // "Ten plan wrócił do roboczego, bo zmieniłeś treść" must not outlive the
    // operation it describes: an acceptance made right afterwards would leave
    // that sentence standing directly under a green "Plan zaakceptowany" badge,
    // contradicting it.
    setClearedByEdit(false);

    try {
      const response = await request();

      // The one success with nothing to apply. A 204 has no body, so
      // `response.json()` rejects, the catch below hands back `null`, and
      // `isDayPlanBody(null)` is false - without this branch a delete that
      // worked would be reported as "Nie udało się zapisać zmiany" and then
      // `reconcile()` would blank the day underneath the message.
      //
      // Navigation rather than `setPlan(null)`, and that is correctness rather
      // than convenience: the day's subtitle is static SSR in `plan.astro`,
      // outside this island's reach, so clearing state here would leave the
      // deleted day's theme standing in the header above "Ten dzień nie ma
      // jeszcze planu". One SSR read rebuilds header, form and empty-day
      // message together.
      if (busyKind === "deleting" && response.ok) {
        navigatingAway.current = true;
        window.location.assign(`/plan?date=${planDate}`);
        return;
      }

      const body: unknown = await response.json().catch(() => null);

      if (response.ok && isDayPlanBody(body)) {
        setPlan(body);
        // Only a generation writes the hasło, so only a generation may take it
        // back from the server. Resyncing on every response meant a teacher who
        // retyped the hasło, then saved an edit or accepted the plan instead,
        // watched their unsent text replaced by the stored one - the textarea is
        // re-enabled by then, so `disabled={isBusy}` never covered this.
        if (busyKind === "generating") {
          setPrompt(body.plan.prompt);
        }
        setDraft(null);
        // The server's answer to "did this write take an acceptance away", not
        // this island's guess. Only the edit route ever sets it, so generate and
        // accept read as `false` without either route having to say so.
        setClearedByEdit(readAcceptanceCleared(body));
        return;
      }

      // The route decides whether retrying is worth the teacher's time; the
      // island does not second-guess it from the status code. Missing credits and
      // a passing rate limit both arrive as a failure, and only `retryable` tells
      // them apart.
      const signInRequired = response.status === 401;
      setFailure({
        message: isErrorBody(body) ? body.error : "Nie udało się zapisać zmiany. Spróbuj ponownie.",
        retryable: isErrorBody(body) ? body.retryable : true,
        signInRequired,
      });
      if (!signInRequired) await reconcile();
    } catch {
      // The request never completed - offline, or the connection dropped.
      setFailure({
        message: "Brak połączenia z serwerem. Sprawdź internet i spróbuj ponownie.",
        retryable: true,
        signInRequired: false,
      });
      await reconcile();
    } finally {
      // Not on the delete path: the document is on its way out, and handing the
      // button back now is what lets a second click answer 404 over the top of a
      // delete that worked.
      if (!navigatingAway.current) {
        inFlight.current = false;
        setBusy("idle");
      }
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
    //
    // This dialog is an affordance, not the guard. `accepted` is this island's
    // copy of the truth and can be stale - another tab, or a page rendered while
    // the plan could not be read. `save_day_plan_generation` refuses an
    // unconfirmed replacement itself and answers 409, which arrives here as an
    // ordinary non-retryable failure telling the teacher to refresh.
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
          body: JSON.stringify({ plan_date: planDate, prompt, confirm_replace: accepted !== null }),
        }),
      "generating",
    );
  }

  /**
   * Saves one proposal, asking first when that save costs an acceptance (FR-017).
   *
   * The question belongs at "Zapisz" and not at "Edytuj": the acceptance dies at
   * the moment of the write, and asking when the editor opens would name a
   * consequence that may never happen - while "Anuluj przywróci poprzedni tekst
   * — nic nie zostanie zapisane" would need an exception written next to it.
   *
   * Gated on `accepted`, the same field `generate()` gates on. That gate also
   * settles the second edit for free: the first save cleared the acceptance, so
   * there is nothing left to ask about.
   *
   * Unlike `generate()`, nothing refuses behind this dialog - no
   * `confirm_replace`, no 409. That asymmetry is deliberate. Regeneration
   * destroys a batch the teacher paid 10-30 seconds and tokens for and cannot
   * get back; losing an acceptance costs one click to undo. The honesty that
   * *is* owed regardless lives after the fact, in `clearedByEdit`, which is read
   * from the server rather than from this dialog - because the stale-copy case
   * is precisely the one where the dialog never appears.
   */
  function saveDraft(current: Draft): void {
    if (accepted) {
      const consequence =
        "Ten dzień jest zaakceptowany. Zapisanie zmiany cofnie akceptację i plan wróci do roboczego. " +
        "Akceptację można przywrócić jednym kliknięciem.";
      if (!window.confirm(consequence)) {
        return;
      }
    }

    void mutate(
      () =>
        fetch(`/api/day-plan/activity/${current.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: current.title, description: current.description }),
        }),
      "saving",
      // Deliberately not a re-run of the request above. On failure the editor
      // stays open and the teacher keeps typing; retrying the frozen body would
      // save the older text and then close the editor over the newer, with no
      // error to show for it. "Spróbuj ponownie" and "Zapisz" sit next to each
      // other, so they had better mean the same thing.
      //
      // Which is also why it re-enters `saveDraft` rather than `mutate`: a
      // failed save left the acceptance standing, so the dialog is asked again.
      // That is the same operation with the same consequence, not a
      // continuation of consent already given.
      () => {
        const live = draftRef.current;
        if (live) saveDraft(live);
      },
    );
  }

  function setAcceptance(next: boolean): void {
    if (!plan) return;
    const planId = plan.plan.id;
    // The generation this view was rendered from. If the day has moved on since -
    // another tab regenerated it - the route refuses rather than signing off on
    // proposals nobody here has read, and the teacher is told to refresh.
    const expected = plan.plan.current_generation;
    void mutate(
      () =>
        fetch("/api/day-plan/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan_id: planId, accepted: next, expected_generation: expected }),
        }),
      "saving",
    );
  }

  /**
   * Deletes the whole day: the hasło, the proposals, the row.
   *
   * The dialog is unconditional, unlike the one in `generate()`. There the
   * question is only worth asking on an accepted plan, because regeneration
   * hands back a new batch in exchange and a teacher still iterating on a draft
   * has invested nothing in what is on screen. Deleting hands back nothing, and
   * a draft cost the same 10-30 seconds and the same tokens.
   *
   * Unlike that dialog, this one has nothing behind it: there is no schema-side
   * refusal to fall back on, so the confirmation is the whole protection against
   * a misclick. Hence text that names what is lost rather than a generic
   * "are you sure?".
   */
  function deletePlan(): void {
    if (!plan) return;
    const consequence =
      "Usunięcie planu dnia skasuje hasło i wszystkie propozycje tego dnia. " +
      "Dzień wróci do stanu sprzed planowania. Tej operacji nie można cofnąć.";
    if (!window.confirm(consequence)) {
      return;
    }
    // No headers and no body: the route reads the day from the query string,
    // exactly as `GET` does.
    void mutate(() => fetch(`/api/day-plan?date=${planDate}`, { method: "DELETE" }), "deleting");
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

        {/* The control row `prd-v2.md` §Constraints „Warunek układu" asks for:
            hasło, then generowanie, then akceptacja, in that order in the DOM so
            the tab order is the reading order. Stacked on a phone, side by side
            from `sm` up.

            The acceptance button stays `type="button"`. Inside a `<form>` a
            bare button submits, so dropping that attribute would silently make
            accepting run `generate()` - the one operation on this screen that
            destroys the batch it replaces. `AcceptanceBanner` deliberately did
            *not* come along: it describes the proposals and belongs next to
            them, not in a row of controls.

            The labels are not repeated in this comment on purpose: a grep gate
            anchored on one of them must find the button, not this paragraph
            (`lessons.md`, "Bramka grepowa musi celować w konstrukcję"). */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            type="submit"
            disabled={isBusy}
            className="w-full rounded-lg bg-purple-600 px-4 py-2 font-medium text-white transition-colors hover:bg-purple-500 sm:flex-1"
          >
            {hasActivities ? <RotateCcw className="size-4" /> : <Sparkles className="size-4" />}
            {busy === "generating" ? "Generuję…" : hasActivities ? "Generuj ponownie" : "Generuj"}
          </Button>

          {/* Same visibility gate as before the move: a day with no proposals
              has nothing to accept, while the hasło form renders on an empty day
              too - so this is gated on the batch and the form is not. */}
          {plan && hasActivities && (
            <Button
              type="button"
              disabled={isBusy || draft !== null}
              onClick={() => {
                setAcceptance(accepted === null);
              }}
              className={cn(
                "w-full rounded-lg px-4 py-2 font-medium text-white transition-colors sm:flex-1",
                accepted
                  ? "border border-white/20 bg-white/10 hover:bg-white/20"
                  : "bg-emerald-600 hover:bg-emerald-500",
              )}
            >
              {accepted ? <Undo2 className="size-4" /> : <Check className="size-4" />}
              {accepted ? "Cofnij akceptację" : "Akceptuj plan"}
            </Button>
          )}
        </div>
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
              onClick={() => lastAttempt.current?.()}
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
          <AcceptanceBanner
            acceptedAt={accepted}
            clearedByEdit={clearedByEdit}
            disabled={isBusy || draft !== null}
            onReaccept={() => {
              setAcceptance(true);
            }}
          />

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
        </section>
      )}

      {/* Gated on the plan row, not on `hasActivities`. A day_plans row with no
          live batch is unreachable through the application's own paths, but if
          one ever existed it would be the day that most needs deleting: not
          visible as a plan anywhere, and still occupying `unique (user_id,
          plan_date)` so week generation skips over it.

          Left at the bottom, alone, and deliberately quieter than everything
          above it - an outline rather than a fill. This is not an action the eye
          should fall into. Disabled during an open proposal edit for the same
          reason the acceptance button is: deleting mid-edit would drop unsaved
          text without a word.

          It stayed here when `prd-v2.md` §Constraints „Warunek układu" moved
          acceptance up to the control row, and the separation is the point
          rather than an unfinished move. The generate button is pressed many
          times in one sitting; seating an irreversible delete beside something
          clicked that often would satisfy the condition's letter against its
          substance. Acceptance is reversible in one click and belongs next to
          the operation it follows - deleting a day is neither. */}
      {plan && (
        <Button
          type="button"
          disabled={isBusy || draft !== null}
          onClick={deletePlan}
          className="w-full rounded-lg border border-red-400/30 bg-transparent px-4 py-2 text-sm text-red-300/90 transition-colors hover:bg-red-500/10 hover:text-red-200"
        >
          <Trash2 className="size-4" />
          {busy === "deleting" ? "Usuwam…" : "Usuń plan dnia"}
        </Button>
      )}
    </div>
  );
}

/**
 * Draft or accepted, said in words and in colour rather than only in colour.
 *
 * Three states, not two. The third is the second half of FR-017: after a save
 * that cost an acceptance, "Plan roboczy" is true and useless - it describes the
 * day without mentioning that this screen is what changed it, so the green badge
 * simply disappears and the teacher is left to work out why. `clearedByEdit`
 * replaces it with the reason and the way back.
 *
 * It is `clearedByEdit` and not `!acceptedAt && justSaved`, because the fact is
 * the server's: see `readAcceptanceCleared`.
 */
function AcceptanceBanner({
  acceptedAt,
  clearedByEdit,
  disabled,
  onReaccept,
}: {
  acceptedAt: string | null;
  clearedByEdit: boolean;
  disabled: boolean;
  onReaccept: () => void;
}) {
  if (!acceptedAt && clearedByEdit) {
    return (
      <div className="space-y-2 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
        <p className="flex items-start gap-2">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          {/* Bezosobowo, jak reszta kopii w tej wyspie — komunikat nie zgaduje
              rodzaju czytającej osoby. */}
          Akceptacja została cofnięta, bo zmieniła się treść propozycji. Plan wrócił do roboczego.
        </p>
        <Button
          type="button"
          disabled={disabled}
          onClick={onReaccept}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-white transition-colors hover:bg-emerald-500"
        >
          <Check className="size-4" />
          Akceptuj ponownie
        </Button>
      </div>
    );
  }
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
