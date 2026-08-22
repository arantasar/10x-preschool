import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { RETRY_VISIBLE_AFTER_MS } from "@/lib/day-plan-limits";
import { cn } from "@/lib/utils";

/**
 * Stages are indicative: nothing here reflects the model's actual state, because
 * without streaming there is nothing to reflect. What they do reflect honestly is
 * elapsed time, which is why there is no percentage bar - with a 10-30s spread a
 * bar would regularly reach 100% and stand there, which reads worse than a
 * spinner. The label changing on a schedule plus a running clock is the NFR's
 * "continuous, visible progress" without a claim we cannot back.
 *
 * The last stage is the exception: it is a deduction rather than a guess. See
 * `RETRY_VISIBLE_AFTER_MS`.
 */
interface Stage {
  readonly afterMs: number;
  readonly label: string;
  readonly isRetry?: boolean;
}

const STAGES: readonly Stage[] = [
  { afterMs: 0, label: "Wysyłam hasło do modelu…" },
  { afterMs: 4_000, label: "Model szuka pomysłów na zajęcia…" },
  { afterMs: 12_000, label: "Powstają opisy trzech propozycji…" },
  { afterMs: 30_000, label: "Odpowiedź jeszcze nie dotarła — czekam dalej…" },
  {
    afterMs: RETRY_VISIBLE_AFTER_MS,
    label: "Pierwsza próba się nie powiodła — generuję jeszcze raz…",
    isRetry: true,
  },
];

const TICK_MS = 250;

interface GenerationProgressProps {
  /** `Date.now()` from the moment the request left the browser. */
  startedAt: number;
}

export function GenerationProgress({ startedAt }: GenerationProgressProps) {
  // Seeded lazily rather than from the effect: the request may already have been
  // in flight for a tick before this mounts, and a clock that starts at 0 s twice
  // is exactly the "is it stuck?" impression the indicator exists to prevent.
  const [elapsedMs, setElapsedMs] = useState(() => Date.now() - startedAt);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - startedAt);
    }, TICK_MS);
    return () => {
      clearInterval(timer);
    };
  }, [startedAt]);

  const stageIndex = lastStageIndexReached(elapsedMs);
  const stage = STAGES[stageIndex];
  const seconds = Math.floor(elapsedMs / 1000);

  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        stage.isRetry ? "border-amber-400/40 bg-amber-500/10" : "border-white/15 bg-white/5",
      )}
    >
      {/* Announced, not just animated: a teacher using a screen reader gets the
          same "still working" signal as one watching the spinner. */}
      <p aria-live="polite" className="flex items-center gap-2 text-sm text-white">
        {stage.isRetry ? (
          <RefreshCw className="size-4 shrink-0 animate-spin text-amber-300" />
        ) : (
          <Loader2 className="size-4 shrink-0 animate-spin text-purple-300" />
        )}
        <span>{stage.label}</span>
        <span className="ml-auto shrink-0 text-blue-100/60 tabular-nums">{seconds} s</span>
      </p>

      {/* Position in the sequence, not a share of the remaining time. */}
      <ol className="mt-3 flex gap-1.5" aria-hidden="true">
        {STAGES.filter((candidate) => !candidate.isRetry || stage.isRetry).map((candidate, index) => (
          <li
            key={candidate.label}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              index < stageIndex && "bg-purple-400/70",
              index === stageIndex &&
                (candidate.isRetry ? "animate-pulse bg-amber-300" : "animate-pulse bg-purple-300"),
              index > stageIndex && "bg-white/15",
            )}
          />
        ))}
      </ol>

      <p className="mt-3 text-xs text-blue-100/50">
        Generowanie zwykle trwa od 10 do 30 sekund. Nie zamykaj tej strony.
      </p>
    </div>
  );
}

function lastStageIndexReached(elapsedMs: number): number {
  let index = 0;
  for (let candidate = 0; candidate < STAGES.length; candidate++) {
    if (elapsedMs >= STAGES[candidate].afterMs) {
      index = candidate;
    }
  }
  return index;
}
