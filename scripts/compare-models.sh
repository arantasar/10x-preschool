#!/usr/bin/env bash
#
# S-01 phase 5 - the quality gate.
#
# Runs three candidate models over five keywords against the *same* system prompt
# and the *same* JSON Schema that the route uses in production. Both are read
# straight out of src/lib/services/prompts/, never copied: a comparison run
# against a duplicated prompt would prove something about the duplicate rather
# than about what teachers actually get.
#
# Deliberately outside CI. The project has no TS runner (package.json carries
# only test:db), automated tests are Module 3, and this is a one-off decision
# aid, not a regression guard.
#
# Usage:
#   ./scripts/compare-models.sh [output-dir]
#
# Reads OPENROUTER_API_KEY from the environment, falling back to .dev.vars.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROMPT_FILE="$REPO_ROOT/src/lib/services/prompts/day-plan.pl.md"
SCHEMA_FILE="$REPO_ROOT/src/lib/services/prompts/day-plan.schema.json"
OUT_DIR="${1:-$REPO_ROOT/context/changes/first-day-generation/model-outputs}"

OPENROUTER_URL="https://openrouter.ai/api/v1/chat/completions"

# Mirrors ATTEMPT_TIMEOUT_MS in src/lib/day-plan-limits.ts. A model that cannot
# answer inside the production timeout has not passed the gate either.
MAX_TIME=45

# Mirror the request body built by buildRequestBody() in
# src/lib/services/activity-generator.ts. Same values, same omissions - notably
# `provider.require_parameters` is absent here too, because it is absent there.
TEMPERATURE=0.8

# Endpoints that refuse to disable reasoning bill those tokens against the same
# completion budget, and they are not cheap: a first run at 1200 spent 728-972
# tokens reasoning and truncated the JSON mid-string, which arrives as
# finish_reason "length" and looks exactly like a model that cannot hold the
# contract. It is not - it was a budget never sized for it, and grading a
# candidate on that would blame the model for our configuration.
#
# Production was raised to the same ceiling for the same reason, so this stays a
# single mirrored number. See MAX_TOKENS in src/lib/services/activity-generator.ts.
MAX_TOKENS=4000
MAX_TOKENS_REASONING=4000

MODELS=(
  "google/gemini-3.7-flash"
  "openai/gpt-5.6-luna"
  "deepseek/deepseek-v4-flash"
)

# Optional substring filters, for re-running a subset after a fix:
#   ONLY_MODEL=gemini SKIP_EXISTING=1 ./scripts/compare-models.sh
ONLY_MODEL="${ONLY_MODEL:-}"
ONLY_KEYWORD="${ONLY_KEYWORD:-}"

# Five keywords, each probing a different failure mode of the prompt:
#   neutralne    - baseline; nothing to steer around
#   kulturowe    - Polish cultural competence (the PLCC criterion from the model research)
#   sezonowe     - seasonal grounding, everyday classroom materials
#   trudne       - a keyword that can exclude children (not every child has a mother)
#   abstrakcyjne - no obvious props; tests whether the model stays concrete
KEYWORD_IDS=(neutralne kulturowe sezonowe trudne abstrakcyjne)
KEYWORD_TEXTS=(
  "Kolory"
  "Andrzejki"
  "Jesień w lesie"
  "Dzień Matki"
  "Cisza"
)

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------

for tool in curl jq; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Brak wymaganego narzędzia: $tool" >&2; exit 1; }
done

[[ -f "$PROMPT_FILE" ]] || { echo "Brak promptu: $PROMPT_FILE" >&2; exit 1; }
[[ -f "$SCHEMA_FILE" ]] || { echo "Brak schematu: $SCHEMA_FILE" >&2; exit 1; }

if [[ -z "${OPENROUTER_API_KEY:-}" && -f "$REPO_ROOT/.dev.vars" ]]; then
  OPENROUTER_API_KEY="$(grep -E '^OPENROUTER_API_KEY=' "$REPO_ROOT/.dev.vars" | head -n1 | cut -d= -f2-)"
fi

if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
  echo "Brak OPENROUTER_API_KEY (ani w środowisku, ani w .dev.vars)." >&2
  exit 1
fi

SYSTEM_PROMPT="$(cat "$PROMPT_FILE")"
SCHEMA="$(cat "$SCHEMA_FILE")"

mkdir -p "$OUT_DIR/raw"
SUMMARY="$OUT_DIR/summary.tsv"
if [[ "${SKIP_EXISTING:-0}" != "1" || ! -f "$SUMMARY" ]]; then
  printf 'model\tkeyword_id\tkeyword\thttp\tfinish_reason\telapsed_s\tcost\tmodel_used\tactivities\treasoning_dropped\tstatus\n' > "$SUMMARY"
fi

# ---------------------------------------------------------------------------
# Request
# ---------------------------------------------------------------------------

build_body() {
  local model="$1" keyword="$2" reasoning="$3" max_tokens="$4"
  jq -n \
    --arg model "$model" \
    --arg system "$SYSTEM_PROMPT" \
    --arg user "$keyword" \
    --argjson schema "$SCHEMA" \
    --argjson reasoning "$reasoning" \
    --argjson temperature "$TEMPERATURE" \
    --argjson max_tokens "$max_tokens" \
    '{
       model: $model,
       messages: [
         { role: "system", content: $system },
         { role: "user",   content: $user }
       ],
       response_format: {
         type: "json_schema",
         json_schema: { name: "propozycja_dnia", strict: true, schema: $schema }
       },
       provider: { data_collection: "deny" },
       temperature: $temperature,
       max_tokens: $max_tokens
     } + $reasoning'
}

# Echoes the HTTP status; writes the response body to $2.
#
# On a transport failure (timeout, dropped connection) curl still writes a
# `-w` status and then exits non-zero. Appending a fallback with `||` would
# concatenate onto that, which is how a timed-out call once reported itself as
# "200000". The status is captured first and only replaced when curl actually
# failed.
call_model() {
  local body="$1" raw="$2" code status
  set +e
  code="$(curl -sS -o "$raw" -w '%{http_code}' \
    --max-time "$MAX_TIME" \
    -X POST "$OPENROUTER_URL" \
    -H "Authorization: Bearer $OPENROUTER_API_KEY" \
    -H "Content-Type: application/json" \
    -H "X-OpenRouter-Title: 10xPreschool" \
    --data-binary @- <<<"$body")"
  status=$?
  set -e
  if [[ $status -ne 0 ]]; then
    echo "000"
  else
    echo "$code"
  fi
}

slug() { printf '%s' "$1" | tr '/' '_'; }

# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

total=0
ok=0

for model in "${MODELS[@]}"; do
  [[ -n "$ONLY_MODEL" && "$model" != *"$ONLY_MODEL"* ]] && continue
  for i in "${!KEYWORD_IDS[@]}"; do
    kid="${KEYWORD_IDS[$i]}"
    keyword="${KEYWORD_TEXTS[$i]}"
    [[ -n "$ONLY_KEYWORD" && "$kid" != *"$ONLY_KEYWORD"* ]] && continue
    name="$(slug "$model")__$kid"
    raw="$OUT_DIR/raw/$name.response.json"
    out="$OUT_DIR/$name.json"
    total=$((total + 1))

    echo "→ $model / $kid (\"$keyword\")"

    # Resume support. A re-run after fixing the script must not re-bill calls
    # that already produced a valid output - and must not silently reuse one
    # either, so the skip is announced.
    if [[ "${SKIP_EXISTING:-0}" == "1" && -f "$out" ]] && \
       [[ "$(jq -r '.aktywnosci | length' "$out" 2>/dev/null || echo 0)" == "3" ]]; then
      echo "  · pomijam — wynik już istnieje"
      continue
    fi

    reasoning='{"reasoning":{"enabled":false}}'
    reasoning_dropped="no"
    max_tokens="$MAX_TOKENS"
    started=$(date +%s)
    http="$(call_model "$(build_body "$model" "$keyword" "$reasoning" "$max_tokens")" "$raw")"

    # Some endpoints bill reasoning as mandatory and reject the disable flag
    # outright (google/gemini-3.7-flash does, as recorded in
    # src/lib/services/activity-generator.ts). Retry once without the flag rather
    # than dropping the candidate: prompt and schema - the things this gate is
    # actually about - stay byte-identical, and the divergence is recorded in the
    # summary instead of being hidden.
    if [[ "$http" != "200" ]] && jq -e -r '.error.message // ""' "$raw" 2>/dev/null | grep -qi 'reasoning'; then
      echo "  · endpoint wymaga reasoning — ponawiam bez flagi"
      reasoning='{}'
      reasoning_dropped="yes"
      max_tokens="$MAX_TOKENS_REASONING"
      started=$(date +%s)
      http="$(call_model "$(build_body "$model" "$keyword" "$reasoning" "$max_tokens")" "$raw")"
    fi

    elapsed=$(( $(date +%s) - started ))

    finish_reason="$(jq -r '.choices[0].finish_reason // "-"' "$raw" 2>/dev/null || echo '-')"
    cost="$(jq -r '.usage.cost // "-"' "$raw" 2>/dev/null || echo '-')"
    model_used="$(jq -r '.model // "-"' "$raw" 2>/dev/null || echo '-')"
    activities="-"
    status="ok"

    if [[ "$http" != "200" ]]; then
      status="http_$http"
    elif [[ "$finish_reason" == "error" ]] || jq -e '.choices[0].error' "$raw" >/dev/null 2>&1; then
      # A 200 is not proof of success - the same partial-failure shape the
      # service checks for before it parses anything.
      status="partial_failure"
    else
      content="$(jq -r '.choices[0].message.content // ""' "$raw" 2>/dev/null || echo '')"
      if [[ -z "$content" ]]; then
        status="empty"
      elif ! printf '%s' "$content" | jq '.' > "$out" 2>/dev/null; then
        rm -f "$out"
        # Truncation is a budget symptom, not a model that cannot hold the
        # contract. Naming it separately keeps the two out of one bucket when
        # the results are graded.
        if [[ "$finish_reason" == "length" ]]; then
          status="truncated_budget"
        else
          status="unparsable"
        fi
      else
        activities="$(jq -r '.aktywnosci | length' "$out" 2>/dev/null || echo '-')"
        [[ "$activities" == "3" ]] || status="schema_mismatch"
      fi
    fi

    [[ "$status" == "ok" ]] && ok=$((ok + 1))
    echo "  · $status  http=$http  ${elapsed}s  koszt=$cost  aktywności=$activities"

    printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
      "$model" "$kid" "$keyword" "$http" "$finish_reason" "$elapsed" \
      "$cost" "$model_used" "$activities" "$reasoning_dropped" "$status" >> "$SUMMARY"
  done
done

echo
echo "Wywołań: $total, udanych: $ok"
echo "Wyjścia: $OUT_DIR"
echo "Podsumowanie: $SUMMARY"

# A failed call is a finding about a candidate, not a broken script - the run
# still has to produce its summary, so the exit code stays 0.
