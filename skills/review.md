---
name: crev-review
description: Review current branch changes using specialist agents. Diffs current branch against main/master, runs scout agent, escalates to specialists if needed.
---

# Code Review — Current Branch

Review the changes on this branch before pushing.

## Steps

1. **Detect the base branch and get the diff:**
   ```bash
   git rev-parse --abbrev-ref HEAD
   ```
   Then detect the default branch:
   ```bash
   git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||'
   ```
   If that fails, try `main` then `master`. If neither exists, tell the user to specify a base branch and stop.

   Get the diff against the detected base:
   ```bash
   git diff <base>...HEAD
   ```
   If the diff is empty, report "No changes to review" and stop.

2. **Get file stats:**
   ```bash
   git diff --stat <base>...HEAD
   ```

4. **Launch the `crev-scout` agent.** Provide it with:
   - The full diff
   - The file stats
   - Instruction to return findings and escalation decision

5. **Read the scout's response:**
   - If **Escalate: NO** — proceed to step 7 with only scout findings
   - If **Escalate: YES** — proceed to step 6

6. **Launch all 5 specialist agents IN PARALLEL** (use the Agent tool for each simultaneously):
   - `crev-security`
   - `crev-correctness`
   - `crev-performance`
   - `crev-style`
   - `crev-api-contract`

   Provide each agent with the same diff and file stats.

7. **Present a consolidated report** in the conversation:

   ```
   ## Code Review — <branch-name>

   **Reviewers:** Scout [+ 5 specialists if escalated]
   **Findings:** N total (X critical, Y high, Z medium, ...)

   ### Findings
   [All findings sorted by severity, deduplicated]

   ### Reviewer Summaries
   [One line per reviewer]
   ```

8. **Save to file** (if there are findings):
   ```bash
   # Create reviews/ directory and save report
   mkdir -p reviews
   ```
   Write the report to `reviews/<branch>-<timestamp>.md`.

## Notes
- Deduplicate findings that appear in multiple reviewers (same file + line + issue)
- Sort findings: critical → high → medium → low → info
- If no issues found across all reviewers, say so clearly — that's a good outcome
