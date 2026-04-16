# crev Plugin Design

**Date:** 2026-04-16
**Status:** Approved

## Summary

Convert crev from a CLI tool (`crev init` copies files) to a native Claude Code plugin. The plugin system handles discovery and loading of skills, agents, and hooks — no manual installation step needed.

## Motivation

crev currently works by copying skill/agent files into `~/.claude/` and registering hooks in settings.json. This is fragile:
- Files can drift out of sync with the source
- No auto-updates
- Manual install/uninstall required
- Hook registration modifies user settings directly

The Claude Code plugin system solves all of these. Skills, agents, and hooks are declared in a manifest and auto-loaded from the plugin cache.

## Architecture

### Plugin Manifest

`.claude-plugin/plugin.json` declares:
- 2 skills: `review.md`, `audit.md`
- 6 agents: scout, security, correctness, performance, style, api-contract
- Version, description, author, repository

### Hook System

`hooks/hooks.json` declares two hooks (auto-loaded by convention, NOT declared in plugin.json):

1. **PostToolUse** (matcher: `Bash`) — detects `git push` in the executed command
   - Script: `hooks/push-review.sh`
   - Reads stdin JSON from Claude's PostToolUse event
   - Checks if `tool_input.command` contains `git push`
   - Spawns a detached background process that:
     a. Runs `claude -p /crev:review`
     b. Parses the review report
     c. Writes a `.crev-pending` marker with summary + path

2. **UserPromptSubmit** — checks for pending review notifications
   - Script: `hooks/check-pending.sh`
   - Checks if `.crev-pending` exists in the current working directory
   - If found: outputs the summary (severity counts + one-liner per finding)
   - Deletes the marker after outputting

### Marker Format

`.crev-pending` is a plain text file written by the push-review hook after the background review completes:

```
review: reviews/feature-x-20260416-1423.md
summary: 2 CRITICAL, 1 HIGH, 3 MEDIUM issues
findings:
- CRITICAL [security]: SQL injection in user query endpoint (src/routes/users.ts:42)
- CRITICAL [correctness]: Null dereference in payment flow (src/services/payment.ts:118)
- HIGH [performance]: N+1 query in dashboard loader (src/pages/dashboard.ts:67)
- MEDIUM [style]: Function exceeds 80 lines (src/utils/parser.ts:23)
- MEDIUM [api-contract]: Missing error response for 404 (src/routes/items.ts:31)
- MEDIUM [correctness]: Unhandled promise rejection (src/jobs/sync.ts:55)
```

The agent sees this as a `<system-reminder>` on their next interaction and can read the full report if needed.

### Notification Flow

```
git push (in Claude session)
  → PostToolUse hook fires
  → push-review.sh detects "git push"
  → spawns detached: claude -p /crev:review
  → review completes → report saved to reviews/
  → push-review.sh writes .crev-pending with summary

user types next message
  → UserPromptSubmit hook fires
  → check-pending.sh finds .crev-pending
  → outputs summary as hook response
  → deletes .crev-pending
  → agent sees <system-reminder> with review findings
```

## File Structure

```
crev/
  .claude-plugin/
    plugin.json
  hooks/
    hooks.json
    push-review.sh
    check-pending.sh
  skills/
    review.md
    audit.md
  agents/
    scout.md
    security.md
    correctness.md
    performance.md
    style.md
    api-contract.md
  README.md
  LICENSE
```

## What Gets Removed

- `bin/cli.ts` — CLI entry point
- `src/commands/init.ts` — installer
- `src/commands/uninstall.ts` — uninstaller
- `src/commands/init.test.ts` — installer tests
- `src/commands/uninstall.test.ts` — uninstaller tests
- `tsconfig.json` — no TypeScript to compile
- `package-lock.json` — no npm dependencies
- `dist/` — no build output
- `package.json` — stripped to metadata only (no bin, no scripts, no deps)

## What Stays Unchanged

- `skills/review.md` — /crev:review skill
- `skills/audit.md` — /crev:audit skill
- `agents/*.md` — all 6 agent definitions

## Model Configuration

Agents default to `claude-sonnet-4-6`. Users who want a different model can override per-agent in their project's `.claude/settings.local.json`. No interactive model selection — the plugin is declarative.

## Distribution

### Option A: Extra marketplace (current)
Add to `extraKnownMarketplaces` in `~/.claude/settings.json`:
```json
"crev-marketplace": {
  "source": {
    "source": "github",
    "repo": "jasamkos/crev"
  }
}
```

### Option B: Official marketplace (future)
Publish to the Claude Code plugin marketplace when available.

## Migration

Users who installed via `crev init` should:
1. Run `crev uninstall` (removes old copied files + hook)
2. Install the plugin via marketplace
3. Delete the global `crev` npm package

## Testing

- Hook scripts tested with mock stdin/marker files
- Integration test: simulate PostToolUse event → verify marker creation
- Integration test: simulate UserPromptSubmit with marker → verify output + cleanup
