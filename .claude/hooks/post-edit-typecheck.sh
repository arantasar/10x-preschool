#!/bin/bash
# PostToolUse hook (Write|Edit) - runs a full project typecheck after a
# source edit. Whole-project, not per-file: `tsc` needs the full program for
# path aliases (`@/*`) and Astro's generated types to resolve correctly.
# Reads the tool-call JSON from stdin; see .claude/settings.json.
#
# ~5s on this project as of 2026-09 (astro sync + tsc --noEmit). If edits pile
# up in one turn and this becomes annoying, move it to a pre-commit step
# instead (test-plan.md-style layering: per-edit -> pre-commit -> pre-push -> CI).

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [[ -z "$FILE_PATH" || ! "$FILE_PATH" =~ \.(ts|tsx|astro)$ || ! -f "$FILE_PATH" ]]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

SYNC_OUTPUT=$("${CLAUDE_PROJECT_DIR:-.}/node_modules/.bin/astro" sync 2>&1)
SYNC_STATUS=$?

if [[ $SYNC_STATUS -ne 0 ]]; then
  OUTPUT="$SYNC_OUTPUT"
  STATUS=$SYNC_STATUS
else
  OUTPUT=$("${CLAUDE_PROJECT_DIR:-.}/node_modules/.bin/tsc" --noEmit 2>&1)
  STATUS=$?
fi

if [[ $STATUS -ne 0 ]]; then
  jq -n --arg output "$OUTPUT" '{
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      systemMessage: "Typecheck (tsc --noEmit) znalazł błędy typów",
      additionalContext: $output
    }
  }'
  exit 2
fi

exit 0
