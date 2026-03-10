# crev

Automated PR reviews using Claude Code CLI. A scout agent reviews every PR and escalates to 5 specialist reviewers when needed. Fully async — never blocks your workflow.

## How It Works

```
PR created -> hook fires -> background process starts
  -> Scout agent reviews diff (single claude call)
  -> Scout decides: escalate?
     -> NO:  save scout findings -> done
     -> YES: launch 5 specialists in parallel -> aggregate -> done
  -> Output: local markdown file + optional GitHub issue
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

# Interactive setup (asks global vs project):
crev init

# Or non-interactive:
crev init --global     # all repos
crev init --project    # this repo only
```

## Usage

### Automatic (recommended)

After installation, reviews trigger automatically when you create a PR via `gh pr create`. Results appear in:
- `reviews/` directory (local markdown files)
- GitHub issues (if enabled in config)

### Manual

```bash
crev review --pr https://github.com/owner/repo/pull/42
```

## Configuration

Config file location depends on install scope:
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
| `output.githubIssue` | `false` | Create a GitHub issue when findings exist |
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
- Exception: PRs touching sensitive paths (auth, credentials, .env, migrations, Docker, CI) are **always** eligible for escalation regardless of size

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
- `gh` CLI authenticated (`gh auth login`)
- Node.js >= 20

## Cost Estimates

Per review (Sonnet):
- Scout only: ~$0.02-0.05
- Full review (scout + 5 specialists): ~$0.12-0.30

Per review (Haiku):
- Scout only: ~$0.002-0.005
- Full review: ~$0.012-0.030
