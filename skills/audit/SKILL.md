---
name: audit
description: Review existing files or directories using specialist agents. Takes an optional path argument (defaults to src/). Agents read files directly rather than reviewing a diff.
---

# Code Audit — Existing Files

Review existing code at a given path, not a diff.

**Usage:** `/crev:audit [path]`

If no path is given, default to `src/`.

## Steps

### 1. List files

Use `Glob` to find all source files (`.ts`, `.js`, `.py`, `.go`, etc.) at the specified path. Skip: `node_modules/`, `dist/`, `build/`, `.git/`, test files, config files.

If the path is a single file, use just that file.

If more than 20 files: ask the user which subdirectory or file to focus on.

### 2. Create a temp workspace

```bash
CREV_DIR=$(mktemp -d /tmp/crev-audit-XXXXXX)
```

Write the file list to `$CREV_DIR/files.txt` (one absolute path per line). Note any files over 500 lines as "skipped (too large)".

### 3. Check for tmux

```bash
tmux list-sessions 2>/dev/null && echo "tmux available"
```

Use tmux mode if available (steps 4–6). Fall back to Agent tool mode (step 7) if not.

---

## tmux Mode

### 4. Launch 5 specialists in parallel tmux windows

For each specialist, read `$CLAUDE_PLUGIN_ROOT/agents/<role>.md` (skip YAML frontmatter), then append:

```
The file list is at: $CREV_DIR/files.txt — read the files listed there using the Read tool.
Focus: review for real issues in the existing code, not a diff.
Agents should focus on the most important issues — not every minor nit.
Write your full findings report to $CREV_DIR/<role>.md.
```

Launch all 5 simultaneously:

```bash
for ROLE in security correctness performance style api-contract; do
  PROMPT=$(tail -n +6 "$CLAUDE_PLUGIN_ROOT/agents/$ROLE.md")
  printf '%s\n\nFile list: %s\nThis is an audit of existing code, not a diff.\nWrite output to: %s\n' \
    "$PROMPT" "$CREV_DIR/files.txt" "$CREV_DIR/$ROLE.md" \
    > "$CREV_DIR/$ROLE-prompt.txt"
  tmux new-window -n "crev-$ROLE" \
    "claude --print \"$(cat $CREV_DIR/$ROLE-prompt.txt)\" > $CREV_DIR/$ROLE.md 2>&1; touch $CREV_DIR/$ROLE.done"
done
```

### 5. Wait for all specialists

```bash
for ROLE in security correctness performance style api-contract; do
  while [ ! -f "$CREV_DIR/$ROLE.done" ]; do sleep 2; done
done
```

### 6. Read results and present consolidated report

```
## Code Audit — <path>

**Files reviewed:** N
**Findings:** N total (X critical, Y high, Z medium, ...)

### Findings
[All findings sorted by severity, deduplicated]

### Reviewer Summaries
[One line per reviewer]
```

Save to `reviews/audit-<sanitized-path>-<timestamp>.md` if there are findings.

Cleanup: `rm -rf "$CREV_DIR"`

---

## Agent Tool Fallback (no tmux)

If tmux is not available, use the Agent tool directly:

- Launch `crev:security`, `crev:correctness`, `crev:performance`, `crev:style`, `crev:api-contract` in parallel via the Agent tool
- Provide each with the file list and instruction to read files directly
- Consolidate and present the same report format

---

## Notes

- Agents should focus on the most important issues — not every minor nit
- Deduplicate findings across reviewers
- Sort: critical → high → medium → low → info
- This is for reviewing existing code, not changes — frame findings accordingly
