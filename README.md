# crev

Code review skills for Claude Code. A scout agent reviews your changes and escalates to 5 specialist reviewers when needed. Run `/crev:review` inside Claude Code before pushing — catch issues before they reach PR review.

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

```bash
npm install -g crev
crev init
```

The installer will ask:

1. **Scope** — global (`~/.claude/`, all projects) or project-local (`.claude/`)
2. **Model** — Haiku (fast/cheap) · Sonnet (default) · Opus (deepest analysis)
3. **Auto-trigger** — enable automatic reviews on `git push` (Y/n)

## Usage

### Automatic (hook)

Reviews trigger automatically when you run `git push` inside a Claude Code session. A new Claude instance starts in the background, runs `/crev:review`, and saves the report to `reviews/`.

### Manual (inside Claude Code)

```
/crev:review          Review current branch before pushing
/crev:audit [path]    Review existing files or directories (default: src/)
```

### `/crev:review`

Diffs the current branch against `main` (or `master`) and runs the review. Scout reviews first; if escalation is needed, all 5 specialists run in parallel. Findings are presented in the conversation and saved to `reviews/`.

### `/crev:audit`

Reviews existing code at a path without requiring a diff. Useful for auditing existing files or directories you didn't write. All 5 specialists run in parallel.

## File Structure

After `crev init`, the following files are installed:

```
~/.claude/
  skills/
    crev-review.md       # /crev:review skill
    crev-audit.md        # /crev:audit skill
  agents/
    crev-scout.md        # Scout agent
    crev-security.md     # Security specialist
    crev-correctness.md  # Correctness specialist
    crev-performance.md  # Performance specialist
    crev-style.md        # Style specialist
    crev-api-contract.md # API Contract specialist
```

## Uninstall

```bash
crev uninstall
```

Removes all installed skill and agent files and the PostToolUse hook.

## Prerequisites

- `claude` CLI (Claude Code) installed and configured
- Node.js >= 20
