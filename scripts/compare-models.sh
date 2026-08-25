#!/usr/bin/env bash
#
# The quality gate.
#
# S-01 introduced it for one prompt. S-03 changed both the day prompt (it now
# accepts a theme and a weekday) and added a second contract (the week outline),
# so the gate covers both - lessons.md #3: when the prompt is the only layer
# protecting content, the gate has to cover every model the configuration admits,
# and any change to a prompt requires a fresh run before merge.
#
# Prompts and schemas are read straight out of src/lib/services/prompts/, never
# copied: a run against a duplicated prompt would prove something about the
# duplicate rather than about what teachers actually get.
#
# Three modes, run in this order because the third depends on the first:
#
#   outline     one hasło + five dates -> five day themes.
#   day         the bare hasło. Byte-identical to the S-01 request, so the
#               baseline the themed runs are compared against is unchanged.
#   day-themed  hasło + weekday + the theme this model produced for that day in
#               its own outline run. This is the configuration production uses
#               when a week is generated, and grading the day prompt without it
#               would grade a configuration nobody runs.
#
# `day-themed` samples days 1 and 5 of each outline rather than all five: those
# are the two positions the outline prompt treats specially (entry into the
# topic, and the week's summary), and five days x five keywords x three models
# would be 75 calls to review by hand for a marginal gain in coverage.
#
# Deliberately outside CI. The project has no TS runner (package.json carries
# only test:db), automated tests are Module 3, and this is a one-off decision
# aid, not a regression guard.
#
# Usage:
#   ./scripts/compare-models.sh [output-dir]
#
#   MODES="outline day day-themed"   subset of modes to run
#   ONLY_MODEL=luna ONLY_KEYWORD=trudne SKIP_EXISTING=1 ./scripts/compare-models.sh
#
# Reads OPENROUTER_API_KEY from the environment, falling back to .dev.vars.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROMPTS="$REPO_ROOT/src/lib/services/prompts"
DAY_PROMPT_FILE="$PROMPTS/day-plan.pl.md"
DAY_SCHEMA_FILE="$PROMPTS/day-plan.schema.json"
OUTLINE_PROMPT_FILE="$PROMPTS/week-outline.pl.md"
OUTLINE_SCHEMA_FILE="$PROMPTS/week-outline.schema.json"
OUT_DIR="${1:-$REPO_ROOT/context/changes/week-generation/model-outputs}"

OPENROUTER_URL="https://openrouter.ai/api/v1/chat/completions"

# Mirrors ATTEMPT_TIMEOUT_MS in src/lib/day-plan-limits.ts. A model that cannot
# answer inside the production timeout has not passed the gate either. The
# outline has a tighter production budget (OUTLINE_ATTEMPT_TIMEOUT_MS), and is
# held to it here for the same reason.
MAX_TIME=45
OUTLINE_MAX_TIME=20

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

# The working week the outline is asked to plan. Fixed rather than derived from
# today, so two runs of this script are comparable.
WEEK_DATES=(
  "poniedziałek, 14 września 2026"
  "wtorek, 15 września 2026"
  "środa, 16 września 2026"
  "czwartek, 17 września 2026"
  "piątek, 18 września 2026"
)

# Which days of each outline get a themed day generation. See the header.
THEMED_DAYS=(1 5)

MODES="${MODES:-outline day day-themed}"

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

for f in "$DAY_PROMPT_FILE" "$DAY_SCHEMA_FILE" "$OUTLINE_PROMPT_FILE" "$OUTLINE_SCHEMA_FILE"; do
  [[ -f "$f" ]] || { echo "Brak pliku: $f" >&2; exit 1; }
done

if [[ -z "${OPENROUTER_API_KEY:-}" && -f "$REPO_ROOT/.dev.vars" ]]; then
  OPENROUTER_API_KEY="$(grep -E '^OPENROUTER_API_KEY=' "$REPO_ROOT/.dev.vars" | head -n1 | cut -d= -f2-)"
fi

if [[ -z "${OPENROUTER_API_KEY:-}" ]]; then
  echo "Brak OPENROUTER_API_KEY (ani w środowisku, ani w .dev.vars)." >&2
  exit 1
fi

DAY_PROMPT="$(cat "$DAY_PROMPT_FILE")"
DAY_SCHEMA="$(cat "$DAY_SCHEMA_FILE")"
OUTLINE_PROMPT="$(cat "$OUTLINE_PROMPT_FILE")"
OUTLINE_SCHEMA="$(cat "$OUTLINE_SCHEMA_FILE")"

mkdir -p "$OUT_DIR/raw"
SUMMARY="$OUT_DIR/summary.tsv"
if [[ "${SKIP_EXISTING:-0}" != "1" || ! -f "$SUMMARY" ]]; then
  printf 'mode\tmodel\tkeyword_id\tkeyword\tday\thttp\tfinish_reason\telapsed_s\tcost\tmodel_used\titems\treasoning_dropped\tstatus\n' > "$SUMMARY"
fi

# ---------------------------------------------------------------------------
# Request
# ---------------------------------------------------------------------------

build_body() {
  local model="$1" user="$2" reasoning="$3" max_tokens="$4" system="$5" schema="$6" schema_name="$7"
  jq -n \
    --arg model "$model" \
    --arg system "$system" \
    --arg user "$user" \
    --arg schema_name "$schema_name" \
    --argjson schema "$schema" \
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
         json_schema: { name: $schema_name, strict: true, schema: $schema }
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
  local body="$1" raw="$2" max_time="$3" code status
  set +e
  code="$(curl -sS -o "$raw" -w '%{http_code}' \
    --max-time "$max_time" \
    --connect-timeout 10 \
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

# Mirrors buildOutlineUserMessage() in activity-generator.ts.
outline_user_message() {
  local keyword="$1" i out
  out="Hasło: $keyword"$'\n'"Dni robocze tygodnia:"
  for i in "${!WEEK_DATES[@]}"; do
    out+=$'\n'"$((i + 1)). ${WEEK_DATES[$i]}"
  done
  printf '%s' "$out"
}

# Mirrors buildDayUserMessage() in activity-generator.ts. With no theme and no
# weekday this is the bare hasło, byte for byte what S-01 sent.
day_user_message() {
  local keyword="$1" weekday="${2:-}" theme="${3:-}"
  if [[ -z "$weekday" ]]; then
    printf '%s' "$keyword"
    return
  fi
  local out="Hasło: $keyword"$'\n'"Dzień tygodnia: $weekday"
  [[ -n "$theme" ]] && out+=$'\n'"Temat dnia: $theme"
  printf '%s' "$out"
}

# ---------------------------------------------------------------------------
# One call, graded
# ---------------------------------------------------------------------------
#
# $1 mode, $2 model, $3 keyword_id, $4 keyword, $5 day (or "-"), $6 user message,
# $7 system prompt, $8 schema, $9 schema name, $10 jq expression yielding the
# item count, $11 expected item count, $12 max_time, $13 output file.

run_call() {
  local mode="$1" model="$2" kid="$3" keyword="$4" day="$5" user="$6"
  local system="$7" schema="$8" schema_name="$9" count_expr="${10}" expected="${11}"
  local max_time="${12}" out="${13}"
  local raw="${out%.json}.response.json"
  raw="$OUT_DIR/raw/$(basename "$raw")"

  total=$((total + 1))
  echo "→ [$mode] $model / $kid${day:+ (dzień $day)}"

  # Resume support. A re-run after fixing the script must not re-bill calls that
  # already produced a valid output - and must not silently reuse one either, so
  # the skip is announced.
  if [[ "${SKIP_EXISTING:-0}" == "1" && -f "$out" ]] && \
     [[ "$(jq -r "$count_expr" "$out" 2>/dev/null || echo 0)" == "$expected" ]]; then
    echo "  · pomijam — wynik już istnieje"
    ok=$((ok + 1))
    return 0
  fi

  local reasoning='{"reasoning":{"enabled":false}}'
  local reasoning_dropped="no"
  local max_tokens="$MAX_TOKENS"
  local started http elapsed finish_reason cost model_used items status content

  started=$(date +%s)
  http="$(call_model "$(build_body "$model" "$user" "$reasoning" "$max_tokens" "$system" "$schema" "$schema_name")" "$raw" "$max_time")"

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
    http="$(call_model "$(build_body "$model" "$user" "$reasoning" "$max_tokens" "$system" "$schema" "$schema_name")" "$raw" "$max_time")"
  fi

  elapsed=$(( $(date +%s) - started ))

  finish_reason="$(jq -r '.choices[0].finish_reason // "-"' "$raw" 2>/dev/null || echo '-')"
  cost="$(jq -r '.usage.cost // "-"' "$raw" 2>/dev/null || echo '-')"
  model_used="$(jq -r '.model // "-"' "$raw" 2>/dev/null || echo '-')"
  items="-"
  status="ok"

  if [[ "$http" != "200" ]]; then
    status="http_$http"
  elif [[ "$finish_reason" == "error" ]] || jq -e '.choices[0].error' "$raw" >/dev/null 2>&1; then
    # A 200 is not proof of success - the same partial-failure shape the service
    # checks for before it parses anything.
    status="partial_failure"
  else
    content="$(jq -r '.choices[0].message.content // ""' "$raw" 2>/dev/null || echo '')"
    if [[ -z "$content" ]]; then
      status="empty"
    elif ! printf '%s' "$content" | jq '.' > "$out" 2>/dev/null; then
      rm -f "$out"
      # Truncation is a budget symptom, not a model that cannot hold the
      # contract. Naming it separately keeps the two out of one bucket when the
      # results are graded.
      if [[ "$finish_reason" == "length" ]]; then
        status="truncated_budget"
      else
        status="unparsable"
      fi
    else
      items="$(jq -r "$count_expr" "$out" 2>/dev/null || echo '-')"
      [[ "$items" == "$expected" ]] || status="schema_mismatch"
      # The uniqueness rule weekOutlineSchema enforces in zod. A model can return
      # five items with day 2 twice, which satisfies every bound in the JSON
      # Schema and still leaves one day of the week with no theme at all.
      if [[ "$mode" == "outline" && "$status" == "ok" ]]; then
        local distinct
        distinct="$(jq -r '[.tematy[].dzien] | unique | length' "$out" 2>/dev/null || echo 0)"
        [[ "$distinct" == "$expected" ]] || status="duplicate_days"
      fi
    fi
  fi

  [[ "$status" == "ok" ]] && ok=$((ok + 1))
  echo "  · $status  http=$http  ${elapsed}s  koszt=$cost  pozycji=$items"

  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$mode" "$model" "$kid" "$keyword" "${day:--}" "$http" "$finish_reason" "$elapsed" \
    "$cost" "$model_used" "$items" "$reasoning_dropped" "$status" >> "$SUMMARY"
}

# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

total=0
ok=0

for model in "${MODELS[@]}"; do
  [[ -n "$ONLY_MODEL" && "$model" != *"$ONLY_MODEL"* ]] && continue
  mslug="$(slug "$model")"

  for i in "${!KEYWORD_IDS[@]}"; do
    kid="${KEYWORD_IDS[$i]}"
    keyword="${KEYWORD_TEXTS[$i]}"
    [[ -n "$ONLY_KEYWORD" && "$kid" != *"$ONLY_KEYWORD"* ]] && continue

    outline_out="$OUT_DIR/${mslug}__${kid}__outline.json"

    if [[ " $MODES " == *" outline "* ]]; then
      run_call "outline" "$model" "$kid" "$keyword" "" \
        "$(outline_user_message "$keyword")" \
        "$OUTLINE_PROMPT" "$OUTLINE_SCHEMA" "szkic_tygodnia" \
        '.tematy | length' 5 "$OUTLINE_MAX_TIME" "$outline_out"
    fi

    if [[ " $MODES " == *" day "* ]]; then
      run_call "day" "$model" "$kid" "$keyword" "" \
        "$(day_user_message "$keyword")" \
        "$DAY_PROMPT" "$DAY_SCHEMA" "propozycja_dnia" \
        '.aktywnosci | length' 3 "$MAX_TIME" "$OUT_DIR/${mslug}__${kid}.json"
    fi

    if [[ " $MODES " == *" day-themed "* ]]; then
      if [[ ! -f "$outline_out" ]]; then
        # Not an error in the script: the outline for this pair failed or was
        # filtered out, and a themed day run without its own model's theme would
        # be measuring a configuration that cannot occur.
        echo "  · [day-themed] pomijam $model / $kid — brak szkicu"
        continue
      fi
      for d in "${THEMED_DAYS[@]}"; do
        theme="$(jq -r --argjson d "$d" '.tematy[] | select(.dzien == $d) | .temat' "$outline_out" 2>/dev/null || echo '')"
        if [[ -z "$theme" ]]; then
          echo "  · [day-themed] pomijam $model / $kid dzień $d — brak tematu w szkicu"
          continue
        fi
        run_call "day-themed" "$model" "$kid" "$keyword" "$d" \
          "$(day_user_message "$keyword" "${WEEK_DATES[$((d - 1))]%%,*}" "$theme")" \
          "$DAY_PROMPT" "$DAY_SCHEMA" "propozycja_dnia" \
          '.aktywnosci | length' 3 "$MAX_TIME" "$OUT_DIR/${mslug}__${kid}__d${d}.json"
      done
    fi
  done
done

echo
echo "Wywołań: $total, udanych: $ok"
echo "Wyjścia: $OUT_DIR"
echo "Podsumowanie: $SUMMARY"

# A failed call is a finding about a candidate, not a broken script - the run
# still has to produce its summary, so the exit code stays 0.
