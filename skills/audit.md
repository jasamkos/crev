---
name: crev-audit
description: Review existing files or directories using specialist agents. Takes an optional path argument (defaults to src/). Agents read files directly rather than reviewing a diff.
---

# Code Audit — Existing Files

Review existing code at a given path, not a diff.

**Usage:** `/crev:audit [path]`

If no path is given, default to `src/`.

## Steps

1. **List files at the target path:**
   Use `Glob` to find all source files (`.ts`, `.js`, `.py`, `.go`, etc.) at the specified path.
   If the path is a single file, use just that file.
   Skip: `node_modules/`, `dist/`, `build/`, `.git/`, test files, config files.

2. **If more than 20 files:** Ask the user which subdirectory or file to focus on — a full codebase audit is better done in focused passes.

3. **Instruct agents to skip large files:** Any file over 500 lines should be noted as "skipped (too large)" rather than read in full, to avoid context overflow.

4. **Launch specialist agents.** For a targeted audit, launch all 5 specialists IN PARALLEL, providing each with:
   - The list of files to review
   - Instruction to use the `Read` tool to read file contents directly
   - Focus: review for real issues in the existing code, not a diff

   Specialists to launch:
   - `crev-security`
   - `crev-correctness`
   - `crev-performance`
   - `crev-style`
   - `crev-api-contract`

4. **Present a consolidated report:**

   ```
   ## Code Audit — <path>

   **Files reviewed:** N
   **Findings:** N total (X critical, Y high, Z medium, ...)

   ### Findings
   [All findings sorted by severity, deduplicated]

   ### Reviewer Summaries
   [One line per reviewer]
   ```

5. **Save to file** (if there are findings):
   Write the report to `reviews/audit-<sanitized-path>-<timestamp>.md`.

## Notes
- Agents should focus on the most important issues — not every minor nit
- Deduplicate findings across reviewers
- Sort: critical → high → medium → low → info
- This is for reviewing existing code, not changes — frame findings accordingly
