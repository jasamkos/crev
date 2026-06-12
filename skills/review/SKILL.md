---
name: review
description: Review current branch changes using specialist agents. Diffs current branch against main/master, runs scout, escalates to 5 specialists in parallel tmux windows if needed.
---

# Code Review — Current Branch

Review the changes on this branch before pushing.

## Steps

### 1. Get the diff

```bash
git rev-parse --abbrev-ref HEAD
git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||'
git diff <base>...HEAD
git diff --stat <base>...HEAD
```

If the diff is empty, report "No changes to review" and stop. If base detection fails, try `main` then `master`; if neither, ask the user.

### 2. Create a temp workspace

```bash
CREV_DIR=$(mktemp -d /tmp/crev-XXXXXX)
```

Write the full diff to `$CREV_DIR/diff.patch` and stats to `$CREV_DIR/stats.txt`.

### 3. Check for tmux

```bash
tmux list-sessions 2>/dev/null && echo "tmux available"
```

Use tmux mode if available (steps 4–8). Fall back to Agent tool mode (step 9) if not.

---

## tmux Mode

### 4. Run scout in a tmux window

Scout performs the lightweight review, decides escalation, and — if needed — launches the 5 specialist agents itself as subagents.

```bash
tmux new-window -n "crev-scout" \
  "claude --print '$(cat $CLAUDE_PLUGIN_ROOT/agents/scout.md | tail -n +6)

The diff is at: $CREV_DIR/diff.patch — read it with the Read tool or cat.
The stats are at: $CREV_DIR/stats.txt.
Write your full response to $CREV_DIR/scout.md.' \
  > $CREV_DIR/scout.md 2>&1; touch $CREV_DIR/scout.done"
```

Poll until done (scout may take longer when it escalates to specialists):

```bash
while [ ! -f "$CREV_DIR/scout.done" ]; do sleep 2; done
```

### 5. Read result and present consolidated report

Read `$CREV_DIR/scout.md`. Scout's output is the full consolidated report (includes specialist findings if it escalated). Present:

```
## Code Review — <branch-name>

**Reviewers:** Scout [+ 5 specialists if escalated]
**Findings:** N total (X critical, Y high, Z medium, ...)

### Findings
[All findings sorted by severity, deduplicated]

### Reviewer Summaries
[One line per reviewer]
```

Save to `reviews/<branch>-<timestamp>.md` if there are findings.

Cleanup: `rm -rf "$CREV_DIR"`

---

## Agent Tool Fallback (no tmux)

If tmux is not available, use the Agent tool directly:

- Launch `crev:scout` with the diff path and stats path
- Scout handles escalation internally — it will spawn specialist subagents itself if needed
- Read scout's return value and present the same report format

---

## Notes

- Deduplicate findings that appear in multiple reviewers (same file + line + issue)
- Sort: critical → high → medium → low → info
- If no issues found, say so clearly — that's a good outcome
