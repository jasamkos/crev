# crev

Code reviews with Claude. A scout agent reviews your changes and escalates to 5 specialist reviewers when needed. Run it locally before pushing — catch issues before they reach PR review.

## How It Works

```
crev review -> reviews local branch diff vs main
  -> Scout agent reviews diff (single claude call)
  -> Scout decides: escalate?
     -> NO:  save scout findings -> done
     -> YES: launch 5 specialists in parallel -> aggregate -> done
  -> Output: local markdown file in reviews/
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
```

## Usage

### Local branch review (primary workflow)

After finishing your work, before pushing:

```bash
crev review
```

This diffs your current branch against `main` (or `master`) and runs the review. Results appear in the `reviews/` directory as markdown files.

### Review a GitHub PR

```bash
crev review --pr https://github.com/owner/repo/pull/42
```

### Hook-triggered (optional)

You can also set up a Claude Code hook to auto-trigger reviews on PR creation:

```bash
crev init [--global | --project]
```

## Configuration

Config file location:
- Global: `~/.config/crev/config.json`
- Project: `.claude/code-review.json`

Project config overrides global config. Both are optional — defaults are sensible.

```json
{
  "output": {
    "local": true,
    "localDir": "reviews",
    "githubIssue": false,
    "githubIssueLabels": ["code-review"]
  },
  "scout": {
    "model": "sonnet",
    "escalation": "balanced",
    "minLinesForEscalation": 20
  },
  "specialists": {
    "model": "sonnet"
  }
}
```

### Output options

| Option | Default | Description |
|--------|---------|-------------|
| `output.local` | `true` | Write markdown reports to a local directory |
| `output.localDir` | `"reviews"` | Directory for local reports (relative to cwd) |
| `output.githubIssue` | `false` | Create a GitHub issue when findings exist (PR mode only) |
| `output.githubIssueLabels` | `["code-review"]` | Labels to apply to created issues |

### Escalation control

The scout agent decides whether to launch 5 specialist reviewers. Two settings control this:

**`scout.escalation`** — how aggressively the scout escalates:

| Value | Behavior |
|-------|----------|
| `"conservative"` | Escalate unless trivially simple. Safest, highest cost. |
| `"balanced"` | Escalate for meaningful complexity or risk. **(default)** |
| `"minimal"` | Only escalate for clearly high-risk changes. Cheapest. |

**`scout.minLinesForEscalation`** — size-based pre-filter (default: `20`):
- PRs with fewer total changed lines than this threshold are **never escalated**, regardless of what the scout decides
- Exception: changes touching sensitive paths (auth, credentials, .env, migrations, Docker, CI) are **always** eligible for escalation regardless of size

### Model selection

| Option | Default | Description |
|--------|---------|-------------|
| `scout.model` | `"sonnet"` | Model for the scout agent |
| `specialists.model` | `"sonnet"` | Model for the 5 specialist reviewers |

Use `"haiku"` for lower cost, `"opus"` for deepest analysis. Any model supported by your `claude` CLI works.

## Uninstall

```bash
crev uninstall
```

Removes hooks from both global and project settings, plus config files.

## Prerequisites

- `claude` CLI configured (works with any auth: Bedrock, API key, or subscription)
- `gh` CLI authenticated (only needed for `--pr` mode and GitHub issue creation)
- Node.js >= 20

## Cost Estimates

Per review (Sonnet):
- Scout only: ~$0.02-0.05
- Full review (scout + 5 specialists): ~$0.12-0.30

Per review (Haiku):
- Scout only: ~$0.002-0.005
- Full review: ~$0.012-0.030
