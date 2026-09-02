#!/bin/bash
# PostToolUse hook (Write|Edit) - runs ESLint on the just-edited file only.
# Reads the tool-call JSON from stdin; see .claude/settings.json.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Skip non-source files (md/json/css/...) - nothing for ESLint to check.
if [[ -z "$FILE_PATH" || ! "$FILE_PATH" =~ \.(ts|tsx|astro)$ || ! -f "$FILE_PATH" ]]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

OUTPUT=$("${CLAUDE_PROJECT_DIR:-.}/node_modules/.bin/eslint" "$FILE_PATH" 2>&1)
STATUS=$?

if [[ $STATUS -ne 0 ]]; then
  jq -n --arg output "$OUTPUT" --arg file "$FILE_PATH" '{
    hookSpecificOutput: {
      hookEventName: "PostToolUse",
      systemMessage: ("ESLint znalazł problemy w " + $file),
      additionalContext: $output
    }
  }'
  exit 2
fi

exit 0
