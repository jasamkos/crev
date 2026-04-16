#!/usr/bin/env bash
set -euo pipefail

# Read PostToolUse event from stdin
INPUT=$(cat)

# Extract the command from tool_input.command
# Use python3 for reliable JSON parsing (available on macOS + most Linux)
COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('tool_input', {}).get('command', ''))
except:
    print('')
" 2>/dev/null || echo "")

# Only trigger on git push
case "$COMMAND" in
  *"git push"*) ;;
  *) exit 0 ;;
esac

# Spawn background review process
# The subshell runs the review, then extracts a summary into .crev-pending
(
  BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
  TIMESTAMP=$(date +%Y%m%d-%H%M%S)
  REPORT="reviews/${BRANCH}-${TIMESTAMP}.md"

  # Run the review skill — output goes to the report file
  claude --dangerously-skip-permissions -p "/crev:review" > /dev/null 2>&1 || true

  # Find the most recent review file (the skill writes it)
  LATEST=$(ls -t reviews/*.md 2>/dev/null | head -1)

  if [ -z "$LATEST" ]; then
    exit 0
  fi

  # Extract severity counts from the report
  CRITICAL=$(grep -ci '🚨\|CRITICAL' "$LATEST" 2>/dev/null || echo "0")
  HIGH=$(grep -ci '🔴\|severity.*HIGH' "$LATEST" 2>/dev/null || echo "0")
  MEDIUM=$(grep -ci '🟡\|severity.*MEDIUM' "$LATEST" 2>/dev/null || echo "0")

  # Extract finding lines (lines starting with "- " followed by severity emoji or bracket)
  FINDINGS=$(grep -E '^\s*-\s*(🚨|🔴|🟡|🔵|ℹ️|\*\*CRITICAL|HIGH|MEDIUM|LOW|INFO)' "$LATEST" 2>/dev/null | head -10 || echo "")

  # Build summary line
  SUMMARY=""
  [ "$CRITICAL" -gt 0 ] 2>/dev/null && SUMMARY="${SUMMARY}${CRITICAL} critical, "
  [ "$HIGH" -gt 0 ] 2>/dev/null && SUMMARY="${SUMMARY}${HIGH} high, "
  [ "$MEDIUM" -gt 0 ] 2>/dev/null && SUMMARY="${SUMMARY}${MEDIUM} medium, "
  SUMMARY="${SUMMARY%,*}"

  if [ -z "$SUMMARY" ]; then
    SUMMARY="No issues found"
  fi

  # Write the marker file
  {
    echo "review: $LATEST"
    echo "branch: $BRANCH"
    echo "summary: $SUMMARY"
    echo "findings:"
    if [ -n "$FINDINGS" ]; then
      echo "$FINDINGS"
    else
      echo "- No issues found"
    fi
  } > .crev-pending

) &
disown

echo "[crev] Review started in background" >&2
exit 0
