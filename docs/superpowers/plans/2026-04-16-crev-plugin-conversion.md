# crev Plugin Conversion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert crev from a CLI installer to a native Claude Code plugin with async review notification via marker files.

**Architecture:** Plugin manifest (`.claude-plugin/plugin.json`) declares skills and agents. Hooks auto-load from `hooks/hooks.json`. PostToolUse hook detects `git push` and spawns background review. UserPromptSubmit hook checks for `.crev-pending` marker and surfaces results.

**Tech Stack:** Shell scripts (bash), Claude Code plugin system, no build step.

---

### Task 1: Create plugin manifest

**Files:**
- Create: `.claude-plugin/plugin.json`

- [ ] **Step 1: Create the plugin manifest**

```json
{
  "name": "crev",
  "version": "0.3.0",
  "description": "Code review skills for Claude Code — scout + 5 specialist reviewers",
  "author": {
    "name": "jasamkos"
  },
  "repository": "https://github.com/jasamkos/crev",
  "license": "MIT",
  "keywords": [
    "code-review",
    "security",
    "correctness",
    "performance",
    "agents",
    "skills"
  ],
  "skills": ["./skills/"],
  "agents": [
    "./agents/scout.md",
    "./agents/security.md",
    "./agents/correctness.md",
    "./agents/performance.md",
    "./agents/style.md",
    "./agents/api-contract.md"
  ]
}
```

- [ ] **Step 2: Verify the file was created**

Run: `cat .claude-plugin/plugin.json | python3 -m json.tool`
Expected: Valid JSON output matching the above.

- [ ] **Step 3: Commit**

```bash
git add .claude-plugin/plugin.json
git -c commit.gpgsign=false commit -m "feat: add plugin manifest"
```

---

### Task 2: Create the push-review hook script

This script replaces the TypeScript `hook-handler` in `bin/cli.ts`. It reads PostToolUse stdin JSON, checks for `git push`, spawns a background review, and writes a `.crev-pending` marker when done.

**Files:**
- Create: `hooks/push-review.sh`

- [ ] **Step 1: Create the hook script**

```bash
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
```

- [ ] **Step 2: Make the script executable**

Run: `chmod +x hooks/push-review.sh`

- [ ] **Step 3: Commit**

```bash
git add hooks/push-review.sh
git -c commit.gpgsign=false commit -m "feat: add push-review hook script"
```

---

### Task 3: Create the check-pending hook script

This script runs on UserPromptSubmit. It checks for a `.crev-pending` marker and outputs the review summary so the agent sees it as a system-reminder.

**Files:**
- Create: `hooks/check-pending.sh`

- [ ] **Step 1: Create the hook script**

```bash
#!/usr/bin/env bash

PENDING=".crev-pending"

# No marker — nothing to report
if [ ! -f "$PENDING" ]; then
  exit 0
fi

# Read and output the marker contents
REVIEW_PATH=$(grep '^review:' "$PENDING" | cut -d' ' -f2-)
BRANCH=$(grep '^branch:' "$PENDING" | cut -d' ' -f2-)
SUMMARY=$(grep '^summary:' "$PENDING" | cut -d' ' -f2-)
FINDINGS=$(sed -n '/^findings:/,$ { /^findings:/d; p }' "$PENDING")

echo "crev review completed for branch '${BRANCH}':"
echo "${SUMMARY}"
echo ""
echo "Findings:"
echo "${FINDINGS}"
echo ""
echo "Full report: ${REVIEW_PATH}"

# Remove the marker so we don't notify again
rm -f "$PENDING"

exit 0
```

- [ ] **Step 2: Make the script executable**

Run: `chmod +x hooks/check-pending.sh`

- [ ] **Step 3: Commit**

```bash
git add hooks/check-pending.sh
git -c commit.gpgsign=false commit -m "feat: add check-pending hook script"
```

---

### Task 4: Create hooks.json

Declares both hooks for the plugin system. Auto-loaded by convention from `hooks/hooks.json` — NOT declared in plugin.json.

**Files:**
- Create: `hooks/hooks.json`

- [ ] **Step 1: Create the hooks declaration**

```json
{
  "description": "Auto-review on git push with async notification of results.",
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/push-review.sh\"",
            "timeout": 5
          }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/check-pending.sh\"",
            "timeout": 3
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 2: Validate JSON**

Run: `cat hooks/hooks.json | python3 -m json.tool`
Expected: Valid JSON output.

- [ ] **Step 3: Commit**

```bash
git add hooks/hooks.json
git -c commit.gpgsign=false commit -m "feat: add hooks.json for plugin auto-loading"
```

---

### Task 5: Remove CLI infrastructure

Remove all TypeScript/CLI files that are no longer needed.

**Files:**
- Delete: `bin/cli.ts`
- Delete: `src/commands/init.ts`
- Delete: `src/commands/init.test.ts`
- Delete: `src/commands/uninstall.ts`
- Delete: `src/commands/uninstall.test.ts`
- Delete: `tsconfig.json`
- Delete: `package-lock.json`
- Delete: `dist/` (entire directory)

- [ ] **Step 1: Remove CLI and source files**

Run:
```bash
rm -f bin/cli.ts
rm -rf src/
rm -f tsconfig.json
rm -f package-lock.json
rm -rf dist/
rmdir bin 2>/dev/null || true
```

- [ ] **Step 2: Verify removal**

Run: `ls bin/ src/ dist/ 2>&1`
Expected: Errors showing directories don't exist.

- [ ] **Step 3: Strip package.json to metadata only**

Replace `package.json` with:

```json
{
  "name": "crev",
  "version": "0.3.0",
  "description": "Code review skills for Claude Code — scout + 5 specialist reviewers",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/jasamkos/crev"
  },
  "private": true
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git -c commit.gpgsign=false commit -m "refactor: remove CLI infrastructure, convert to plugin-only"
```

---

### Task 6: Add .crev-pending to .gitignore

The marker file is ephemeral — never commit it.

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add marker to .gitignore**

Append to `.gitignore`:
```
# crev async review marker
.crev-pending
```

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git -c commit.gpgsign=false commit -m "chore: ignore .crev-pending marker file"
```

---

### Task 7: Update README.md

Replace CLI install instructions with plugin-based install.

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Rewrite README**

```markdown
# crev

Code review plugin for Claude Code. A scout agent reviews your changes and escalates to 5 specialist reviewers when needed. Run `/crev:review` inside Claude Code before pushing — catch issues before they reach PR review.

## How It Works

```
/crev:review
  -> diff current branch vs main/master
  -> crev-scout agent reviews diff
  -> Scout decides: escalate?
     -> NO:  report scout findings
     -> YES: launch 5 specialists in parallel -> consolidated report
  -> Saves report to reviews/<branch>-<timestamp>.md
```

### Reviewers

| Agent | Scope |
|-------|-------|
| Scout | Lightweight review + escalation decision |
| Security | OWASP Top 10, secrets, injection, auth |
| Correctness | Logic errors, null handling, race conditions |
| Performance | N+1 queries, memory leaks, hot paths |
| Style | Mutation, naming, nesting, DRY |
| API Contract | Breaking changes, response shapes, status codes |

## Install

Add crev as a marketplace source in `~/.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "crev": {
      "source": {
        "source": "github",
        "repo": "jasamkos/crev"
      }
    }
  }
}
```

Then enable the plugin:

```json
{
  "enabledPlugins": {
    "crev@crev": true
  }
}
```

Restart Claude Code. The skills, agents, and hooks are loaded automatically.

## Usage

### Automatic (hook)

Reviews trigger automatically when you run `git push` inside a Claude Code session. A background process runs `/crev:review` and notifies you of the results on your next interaction.

### Manual (inside Claude Code)

```
/crev:review          Review current branch before pushing
/crev:audit [path]    Review existing files or directories (default: src/)
```

### `/crev:review`

Diffs the current branch against `main` (or `master`) and runs the review. Scout reviews first; if escalation is needed, all 5 specialists run in parallel. Findings are presented in the conversation and saved to `reviews/`.

### `/crev:audit`

Reviews existing code at a path without requiring a diff. Useful for auditing existing files or directories you didn't write. All 5 specialists run in parallel.

## Uninstall

Remove the `"crev@crev": true` entry from `enabledPlugins` and the `"crev"` entry from `extraKnownMarketplaces` in `~/.claude/settings.json`.

## Prerequisites

- Claude Code CLI installed and configured
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git -c commit.gpgsign=false commit -m "docs: update README for plugin-based install"
```

---

### Task 8: Test the plugin locally

Verify the plugin structure is correct and hooks load properly.

**Files:**
- No files created/modified — verification only

- [ ] **Step 1: Verify plugin structure**

Run:
```bash
echo "=== Plugin manifest ===" && cat .claude-plugin/plugin.json | python3 -m json.tool && echo "=== Hooks ===" && cat hooks/hooks.json | python3 -m json.tool && echo "=== Skills ===" && ls skills/ && echo "=== Agents ===" && ls agents/
```

Expected: Valid JSON for both files, 2 skills listed, 6 agents listed.

- [ ] **Step 2: Verify all agent files referenced in plugin.json exist**

Run:
```bash
python3 -c "
import json, os
with open('.claude-plugin/plugin.json') as f:
    p = json.load(f)
for a in p['agents']:
    path = a.lstrip('./')
    exists = os.path.exists(path)
    print(f'  {\"✓\" if exists else \"✗\"} {path}')
"
```

Expected: All 6 agents show ✓.

- [ ] **Step 3: Verify hook scripts are executable**

Run: `ls -la hooks/*.sh`
Expected: Both scripts show `rwxr-xr-x` permissions.

- [ ] **Step 4: Test check-pending with a mock marker**

Run:
```bash
cat > .crev-pending << 'EOF'
review: reviews/test-branch-20260416-1200.md
branch: test-branch
summary: 1 critical, 2 medium
findings:
- 🚨 **CRITICAL** — `src/auth.ts:42`: SQL injection in login query
- 🟡 **MEDIUM** — `src/utils.ts:15`: Unused import
- 🟡 **MEDIUM** — `src/api.ts:88`: Missing error response for 404
EOF
bash hooks/check-pending.sh
```

Expected: Outputs formatted review summary. The `.crev-pending` file should be deleted after.

Run: `test -f .crev-pending && echo "FAIL: marker not deleted" || echo "PASS: marker deleted"`
Expected: `PASS: marker deleted`

- [ ] **Step 5: Test push-review with mock stdin (no git push)**

Run:
```bash
echo '{"tool_input":{"command":"ls -la"}}' | bash hooks/push-review.sh
echo "Exit code: $?"
```

Expected: Exit code 0, no output (not a git push command).

- [ ] **Step 6: Remove old crev hook from global settings**

The old `crev hook-handler` entry in `~/.claude/settings.json` needs to be removed since the plugin's `hooks/hooks.json` replaces it. Check and remove:

Run:
```bash
python3 -c "
import json
with open('$HOME/.claude/settings.json') as f:
    s = json.load(f)
hooks = s.get('hooks', {})
ptu = hooks.get('PostToolUse', [])
filtered = [h for h in ptu if 'crev' not in json.dumps(h)]
if len(filtered) != len(ptu):
    hooks['PostToolUse'] = filtered
    s['hooks'] = hooks
    with open('$HOME/.claude/settings.json', 'w') as f:
        json.dump(s, f, indent=2)
        f.write('\n')
    print('Removed old crev hook entry')
else:
    print('No old crev hook found')
"
```
