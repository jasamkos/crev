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
