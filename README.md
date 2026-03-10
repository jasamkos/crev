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

```json
{
  "output": {
    "local": true,
    "localDir": "reviews",
    "githubIssue": false,
    "githubIssueLabels": ["code-review"]
  },
  "scout": {
    "model": "sonnet"
  },
  "specialists": {
    "model": "sonnet"
  }
}
```

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
