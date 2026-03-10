# crev Skill + Agent Architecture Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the subprocess-based review pipeline with native Claude Code skills and agent definitions, making crev a first-class Claude Code plugin rather than a hook-triggered CLI tool.

**Architecture:** Two skills (`/crev:review` and `/crev:audit`) orchestrate six agent definitions (scout + 5 specialists) using Claude Code's native Agent tool. The npm package becomes a delivery vehicle — `crev init` installs skill and agent markdown files into `.claude/` instead of wiring PostToolUse hooks. The entire TypeScript review pipeline (subprocess calls, JSON parsing, aggregation) is deleted and replaced by the agents themselves.

**Tech Stack:** TypeScript, Node.js, Claude Code skills (markdown), Claude Code agents (markdown with YAML frontmatter), vitest for testing

---

## File Structure

### New files (created)
- `skills/review.md` — `/crev:review` skill: orchestrates branch diff review
- `skills/audit.md` — `/crev:audit` skill: orchestrates file/directory review
- `agents/scout.md` — Scout agent: lightweight review + escalation decision
- `agents/security.md` — Security specialist agent
- `agents/correctness.md` — Correctness specialist agent
- `agents/performance.md` — Performance specialist agent
- `agents/style.md` — Style specialist agent
- `agents/api-contract.md` — API Contract specialist agent

### Modified files
- `src/commands/init.ts` — rewritten: installs skills + agents instead of hooks
- `src/commands/uninstall.ts` — rewritten: removes skills + agents instead of hooks
- `bin/cli.ts` — simplified: remove `hook-handler`, remove `--pr` option
- `package.json` — add `skills/` and `agents/` to `files` field, remove unused deps
- `README.md` — updated to reflect skill-based usage

### Deleted files
- `src/claude.ts` — subprocess pipeline removed
- `src/runner.ts` — parallelism handled by Agent tool
- `src/aggregator.ts` — aggregation handled by orchestrating Claude
- `src/scout.ts` — logic moved to `agents/scout.md`
- `src/reviewers.ts` — logic moved to `agents/*.md`
- `src/output.ts` — reporting handled in skill
- `src/config.ts` — config system removed (model in agent frontmatter)
- `src/diff.ts` — git commands run directly via Bash in skill
- `src/commands/review.ts` — replaced by skill (orphaned after Task 7, deleted in Task 8)
- `src/types.ts` — no longer needed
- `tests/aggregator.test.ts` — tests deleted source module
- `tests/claude.test.ts` — tests deleted source module
- `tests/config.test.ts` — tests deleted source module
- `tests/diff.test.ts` — tests deleted source module
- `tests/output.test.ts` — tests deleted source module
- `tests/reviewers.test.ts` — tests deleted source module
- `tests/runner.test.ts` — tests deleted source module
- `tests/scout.test.ts` — tests deleted source module

---

## Chunk 1: Agent Definition Files

Six agent markdown files that ship with the package. Each has YAML frontmatter (name, description, model) and a system prompt as the body.

### Task 1: Scout agent

**Files:**
- Create: `agents/scout.md`

- [ ] **Step 1: Create `agents/` directory and write scout agent**

```markdown
---
name: crev-scout
description: Lightweight code review and escalation decision. Given a diff, finds high-confidence issues and decides whether specialist reviewers are needed.
model: claude-sonnet-4-6
---

You are a code review scout. You perform two tasks in a single pass given a code diff.

## Task 1: Lightweight Review

Find only HIGH-CONFIDENCE issues in the changed lines (prefixed with `+`):
- Clear bugs, null pointer risks, off-by-one errors, wrong conditions
- Security vulnerabilities (injection, hardcoded secrets, auth bypass)
- Breaking API changes
- Missing error handling on critical paths

Do NOT report: style nits, formatting, minor naming issues, speculative concerns.

## Task 2: Escalation Decision

Should the 5 specialist reviewers (Security, Correctness, Performance, Style, API Contract) be invoked?

**Escalate YES** if any apply:
- Security-sensitive changes (auth, crypto, input handling, SQL, file access)
- Complex logic (algorithms, state machines, concurrency, error recovery)
- API contract changes (endpoints, public types, DB schema)
- Infrastructure changes (CI/CD, Docker, permissions, dependency updates)
- Large refactors touching multiple interrelated files

**Escalate NO** if all apply:
- Simple, mechanical changes you've already fully reviewed
- Test-only, docs-only, or config-only changes with no security impact
- Your review already covers everything needed

## Response Format

### Scout Review

**Escalate:** YES / NO
**Reason:** [one sentence]

**Findings:**

[For each finding:]
- [SEVERITY EMOJI] **[SEVERITY]** — `file:line`: [title]
  [Description of what's wrong and why]
  > **Suggestion:** [how to fix]

Severity levels: 🚨 CRITICAL, 🔴 HIGH, 🟡 MEDIUM, 🔵 LOW, ℹ️ INFO

**Summary:** [1-2 sentence overall assessment]

---

Rules:
- Only report issues you are confident about. Do not speculate.
- `line` must be the post-change line number, or omit for file-wide issues.
- Focus on CHANGED lines (prefixed with `+` in the diff).
- If no issues found, say so explicitly.
```

- [ ] **Step 2: Verify file exists with correct frontmatter**

```bash
head -6 agents/scout.md
```
Expected: frontmatter with `name: crev-scout`, `description:`, `model:`

- [ ] **Step 3: Commit**

```bash
git add agents/scout.md
git -c commit.gpgsign=false commit -m "feat: add crev-scout agent definition"
```

---

### Task 2: Specialist agent files

**Files:**
- Create: `agents/security.md`
- Create: `agents/correctness.md`
- Create: `agents/performance.md`
- Create: `agents/style.md`
- Create: `agents/api-contract.md`

- [ ] **Step 1: Write `agents/security.md`**

```markdown
---
name: crev-security
description: Security-focused code reviewer. Checks for OWASP Top 10 vulnerabilities, hardcoded secrets, injection flaws, and authentication issues.
model: claude-sonnet-4-6
---

You are a senior security engineer reviewing a code diff.

## Scope

Perform a comprehensive security review aligned with the OWASP Top 10:

- A01 — Broken Access Control
- A02 — Cryptographic Failures (weak hashing, missing encryption)
- A03 — Injection (SQL, XSS, command injection, LDAP)
- A04 — Insecure Design (missing rate limits, trust boundaries)
- A05 — Security Misconfiguration (debug enabled, default creds)
- A06 — Vulnerable and Outdated Components
- A07 — Identification and Authentication Failures
- A08 — Software and Data Integrity Failures (unsafe deserialization)
- A09 — Security Logging and Monitoring Failures
- A10 — Server-Side Request Forgery (SSRF)

Also check:
- Hardcoded secrets, API keys, or credentials
- Path traversal and open redirects
- Missing input validation at trust boundaries
- Information leakage in error messages
- Race conditions with security impact

Ignore style, performance, and correctness unless they have security implications.

## Response Format

### Security Review

**Findings:**

[For each finding:]
- [SEVERITY EMOJI] **[SEVERITY]** — `file:line`: [title]
  [Description of the vulnerability and its impact]
  > **Suggestion:** [how to remediate]

**Summary:** [1-2 sentence security assessment]

Severity: 🚨 CRITICAL, 🔴 HIGH, 🟡 MEDIUM, 🔵 LOW, ℹ️ INFO

If no security issues found, state that explicitly.
```

- [ ] **Step 2: Write `agents/correctness.md`**

```markdown
---
name: crev-correctness
description: Correctness-focused code reviewer. Finds logic errors, null handling gaps, race conditions, and unhandled edge cases.
model: claude-sonnet-4-6
---

You are a senior software engineer reviewing a code diff for correctness.

## Scope

- Logic errors, off-by-one mistakes, wrong conditions
- Null/undefined handling gaps
- Race conditions and concurrency issues
- Error handling gaps (unhandled promise rejections, missing catch)
- Type mismatches that static analysis might miss (runtime type issues)
- Edge cases not covered
- Broken contracts (function signatures vs actual usage)

Ignore style, security, and performance unless they cause bugs.

## Response Format

### Correctness Review

**Findings:**

[For each finding:]
- [SEVERITY EMOJI] **[SEVERITY]** — `file:line`: [title]
  [Description of the bug or risk]
  > **Suggestion:** [how to fix]

**Summary:** [1-2 sentence correctness assessment]

Severity: 🚨 CRITICAL, 🔴 HIGH, 🟡 MEDIUM, 🔵 LOW, ℹ️ INFO

If no correctness issues found, state that explicitly.
```

- [ ] **Step 3: Write `agents/performance.md`**

```markdown
---
name: crev-performance
description: Performance-focused code reviewer. Identifies N+1 queries, memory leaks, blocking operations on hot paths, and missing caching opportunities.
model: claude-sonnet-4-6
---

You are a performance engineer reviewing a code diff.

## Scope

- N+1 query patterns or missing pagination
- Unbounded data structures (arrays/maps that grow without limit)
- Missing indexes implied by new query patterns
- Expensive operations inside loops
- Memory leaks (event listeners, timers, unclosed resources)
- Blocking operations on hot paths
- Missing caching opportunities for repeated expensive calls

Ignore style, security, and correctness unless they cause performance problems.

## Response Format

### Performance Review

**Findings:**

[For each finding:]
- [SEVERITY EMOJI] **[SEVERITY]** — `file:line`: [title]
  [Description of the performance issue and its impact]
  > **Suggestion:** [how to fix]

**Summary:** [1-2 sentence performance assessment]

Severity: 🚨 CRITICAL, 🔴 HIGH, 🟡 MEDIUM, 🔵 LOW, ℹ️ INFO

If no performance issues found, state that explicitly.
```

- [ ] **Step 4: Write `agents/style.md`**

```markdown
---
name: crev-style
description: Code quality reviewer. Checks for mutation, deep nesting, DRY violations, unclear naming, and oversized functions/files.
model: claude-sonnet-4-6
---

You are a staff engineer reviewing a code diff for code quality.

## Scope

- Mutation where immutable patterns should be used
- Functions exceeding 50 lines or files exceeding 800 lines
- Deep nesting (>4 levels)
- Missing input validation on user-facing inputs (focus on completeness — is validation present at all? Security reviewer handles whether it's secure enough)
- Hardcoded magic values that should be constants
- Naming clarity (vague names like `data`, `result`, `temp`)
- DRY violations (duplicated logic that should be extracted)

Only report issues with HIGH confidence. Do not nitpick formatting.
Do NOT report security vulnerabilities — that is the Security reviewer's scope.

## Response Format

### Style Review

**Findings:**

[For each finding:]
- [SEVERITY EMOJI] **[SEVERITY]** — `file:line`: [title]
  [Description of the quality issue]
  > **Suggestion:** [how to improve]

**Summary:** [1-2 sentence code quality assessment]

Severity: 🚨 CRITICAL, 🔴 HIGH, 🟡 MEDIUM, 🔵 LOW, ℹ️ INFO

If no style issues found, state that explicitly.
```

- [ ] **Step 5: Write `agents/api-contract.md`**

```markdown
---
name: crev-api-contract
description: API design reviewer. Identifies breaking changes, missing error responses, inconsistent response shapes, and backwards-incompatible interface changes.
model: claude-sonnet-4-6
---

You are an API design reviewer examining a code diff.

## Scope

- Breaking changes to existing API endpoints
- Missing or inconsistent error responses
- Pagination issues (wrong totals, missing meta fields)
- Inconsistent response shapes across similar endpoints
- Missing HTTP status codes or wrong status codes
- Backwards-incompatible changes to public interfaces/types
- Missing validation on request body/params/query

Ignore internal implementation details unless they affect the API contract.

## Response Format

### API Contract Review

**Findings:**

[For each finding:]
- [SEVERITY EMOJI] **[SEVERITY]** — `file:line`: [title]
  [Description of the contract issue and who it affects]
  > **Suggestion:** [how to fix]

**Summary:** [1-2 sentence API contract assessment]

Severity: 🚨 CRITICAL, 🔴 HIGH, 🟡 MEDIUM, 🔵 LOW, ℹ️ INFO

If no API contract issues found, state that explicitly.
```

- [ ] **Step 6: Verify all 5 agent files exist**

```bash
ls agents/
```
Expected: `api-contract.md  correctness.md  performance.md  scout.md  security.md  style.md`

- [ ] **Step 7: Commit**

```bash
git add agents/
git -c commit.gpgsign=false commit -m "feat: add specialist agent definitions (security, correctness, performance, style, api-contract)"
```

---

## Chunk 2: Skill Files

Two skill markdown files that Claude Code users invoke as `/crev:review` and `/crev:audit`.

### Task 3: Review skill

**Files:**
- Create: `skills/review.md`

- [ ] **Step 1: Create `skills/` directory and write review skill**

```markdown
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
```

- [ ] **Step 2: Verify file**

```bash
head -5 skills/review.md
```
Expected: frontmatter with `name: crev-review`

- [ ] **Step 3: Commit**

```bash
git add skills/review.md
git -c commit.gpgsign=false commit -m "feat: add /crev:review skill"
```

---

### Task 4: Audit skill

**Files:**
- Create: `skills/audit.md`

- [ ] **Step 1: Write audit skill**

```markdown
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
```

- [ ] **Step 2: Verify file**

```bash
head -5 skills/audit.md
```

- [ ] **Step 3: Commit**

```bash
git add skills/audit.md
git -c commit.gpgsign=false commit -m "feat: add /crev:audit skill"
```

---

## Chunk 3: Update CLI (init, uninstall, package.json)

Remove the hook-based setup. `crev init` now installs skill and agent files.

### Task 5: Rewrite `init.ts`

**Files:**
- Modify: `src/commands/init.ts`
- Create: `src/commands/init.test.ts`

The new init logic:
1. Check prerequisite: `claude --version`
2. Ask scope: global (`~/.claude/`) or project (`.claude/`)
3. Copy `skills/*.md` → `<scope>/skills/crev-*.md`
4. Copy `agents/*.md` → `<scope>/agents/crev-*.md`
5. No more hook wiring. No more config file writing.

- [ ] **Step 1: Write failing tests for init**

Create `src/commands/init.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fs/path deps
const mockMkdir = vi.fn().mockResolvedValue(undefined);
const mockCopyFile = vi.fn().mockResolvedValue(undefined);
const mockExecFile = vi.fn();

vi.mock("node:fs/promises", () => ({
  mkdir: mockMkdir,
  copyFile: mockCopyFile,
}));

describe("installFiles", () => {
  beforeEach(() => {
    mockMkdir.mockClear();
    mockCopyFile.mockClear();
  });

  it("installs skills and agents to global .claude dir", async () => {
    const { installFiles } = await import("./init.js");
    await installFiles("global", "/fake/package/root", "/fake/home");

    // Should create skills and agents directories
    expect(mockMkdir).toHaveBeenCalledWith(
      expect.stringContaining(".claude/skills"),
      expect.any(Object),
    );
    expect(mockMkdir).toHaveBeenCalledWith(
      expect.stringContaining(".claude/agents"),
      expect.any(Object),
    );

    // Should copy all skill files
    expect(mockCopyFile).toHaveBeenCalledWith(
      expect.stringContaining("skills/review.md"),
      expect.stringContaining(".claude/skills/crev-review.md"),
    );
    expect(mockCopyFile).toHaveBeenCalledWith(
      expect.stringContaining("skills/audit.md"),
      expect.stringContaining(".claude/skills/crev-audit.md"),
    );

    // Should copy all agent files
    for (const name of ["scout", "security", "correctness", "performance", "style", "api-contract"]) {
      expect(mockCopyFile).toHaveBeenCalledWith(
        expect.stringContaining(`agents/${name}.md`),
        expect.stringContaining(`.claude/agents/crev-${name}.md`),
      );
    }
  });

  it("installs to project .claude dir when scope is project", async () => {
    const { installFiles } = await import("./init.js");
    await installFiles("project", "/fake/package/root", "/fake/home", "/fake/project");

    expect(mockCopyFile).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("/fake/project/.claude/skills/crev-review.md"),
    );
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- src/commands/init.test.ts
```
Expected: FAIL — `installFiles` not found

- [ ] **Step 3: Rewrite `src/commands/init.ts`**

```typescript
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, copyFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const execFileAsync = promisify(execFile);

const PACKAGE_ROOT = join(fileURLToPath(import.meta.url), "..", "..", "..");

const SKILL_FILES = ["review", "audit"] as const;
const AGENT_FILES = [
  "scout",
  "security",
  "correctness",
  "performance",
  "style",
  "api-contract",
] as const;

const ask = async (question: string): Promise<string> => {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
};

const checkPrerequisite = async (
  cmd: string,
  args: string[],
  name: string,
): Promise<boolean> => {
  try {
    await execFileAsync(cmd, args);
    process.stderr.write(`  \u2713 ${name}\n`);
    return true;
  } catch {
    process.stderr.write(`  \u2717 ${name} \u2014 not found\n`);
    return false;
  }
};

export const installFiles = async (
  scope: "global" | "project",
  packageRoot: string = PACKAGE_ROOT,
  home: string = homedir(),
  cwd: string = process.cwd(),
): Promise<void> => {
  const targetDir =
    scope === "global"
      ? join(home, ".claude")
      : join(cwd, ".claude");

  const skillsDir = join(targetDir, "skills");
  const agentsDir = join(targetDir, "agents");

  await mkdir(skillsDir, { recursive: true });
  await mkdir(agentsDir, { recursive: true });

  for (const name of SKILL_FILES) {
    await copyFile(
      join(packageRoot, "skills", `${name}.md`),
      join(skillsDir, `crev-${name}.md`),
    );
    process.stderr.write(`  \u2713 skills/crev-${name}.md\n`);
  }

  for (const name of AGENT_FILES) {
    await copyFile(
      join(packageRoot, "agents", `${name}.md`),
      join(agentsDir, `crev-${name}.md`),
    );
    process.stderr.write(`  \u2713 agents/crev-${name}.md\n`);
  }
};

interface InitOptions {
  readonly global?: boolean;
  readonly project?: boolean;
}

export const runInitCommand = async (
  options: InitOptions = {},
): Promise<void> => {
  process.stderr.write("crev \u2014 Setup\n\n");

  process.stderr.write("Checking prerequisites:\n");
  const claudeOk = await checkPrerequisite(
    "claude",
    ["--version"],
    "claude CLI",
  );

  if (!claudeOk) {
    process.stderr.write(
      "\nMissing prerequisites. Install the claude CLI first.\n",
    );
    process.exit(1);
  }

  let scope: "global" | "project";
  if (options.global) {
    scope = "global";
  } else if (options.project) {
    scope = "project";
  } else {
    process.stderr.write("\nWhere should skills and agents be installed?\n");
    process.stderr.write(
      "  [1] Global \u2014 available in all projects (~/.claude/)\n",
    );
    process.stderr.write(
      "  [2] This project \u2014 available here only (.claude/)\n",
    );
    const answer = await ask("\nChoice [1/2]: ");
    scope = answer === "2" ? "project" : "global";
  }

  process.stderr.write("\nInstalling skills and agents:\n");
  await installFiles(scope);

  const location =
    scope === "global" ? "~/.claude/" : ".claude/";
  process.stderr.write(
    `\nInstalled to ${location}\nUse /crev:review or /crev:audit in Claude Code.\n`,
  );
};
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- src/commands/init.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/init.ts src/commands/init.test.ts
git -c commit.gpgsign=false commit -m "feat: rewrite init to install skills and agents"
```

---

### Task 6: Rewrite `uninstall.ts`

**Files:**
- Modify: `src/commands/uninstall.ts`
- Create: `src/commands/uninstall.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/commands/uninstall.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUnlink = vi.fn().mockResolvedValue(undefined);

vi.mock("node:fs/promises", () => ({
  unlink: mockUnlink,
}));

describe("removeFiles", () => {
  beforeEach(() => {
    mockUnlink.mockClear();
    mockUnlink.mockResolvedValue(undefined);
  });

  it("removes skills and agents from global .claude dir", async () => {
    const { removeFiles } = await import("./uninstall.js");
    await removeFiles("global", "/fake/home");

    expect(mockUnlink).toHaveBeenCalledWith(
      expect.stringContaining(".claude/skills/crev-review.md"),
    );
    expect(mockUnlink).toHaveBeenCalledWith(
      expect.stringContaining(".claude/skills/crev-audit.md"),
    );
    for (const name of ["scout", "security", "correctness", "performance", "style", "api-contract"]) {
      expect(mockUnlink).toHaveBeenCalledWith(
        expect.stringContaining(`.claude/agents/crev-${name}.md`),
      );
    }
  });

  it("removes from project .claude dir when scope is project", async () => {
    const { removeFiles } = await import("./uninstall.js");
    await removeFiles("project", "/fake/home", "/fake/project");

    expect(mockUnlink).toHaveBeenCalledWith(
      expect.stringContaining("/fake/project/.claude/skills/crev-review.md"),
    );
  });

  it("silently ignores missing files", async () => {
    mockUnlink.mockRejectedValueOnce({ code: "ENOENT" });
    const { removeFiles } = await import("./uninstall.js");
    await expect(removeFiles("global", "/fake/home")).resolves.not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npm test -- src/commands/uninstall.test.ts
```
Expected: FAIL

- [ ] **Step 3: Rewrite `src/commands/uninstall.ts`**

```typescript
import { unlink, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const SKILL_FILES = ["review", "audit"] as const;
const AGENT_FILES = [
  "scout",
  "security",
  "correctness",
  "performance",
  "style",
  "api-contract",
] as const;

const tryRemove = async (path: string): Promise<boolean> => {
  try {
    await unlink(path);
    return true;
  } catch {
    return false;
  }
};

export const removeFiles = async (
  scope: "global" | "project",
  home: string = homedir(),
  cwd: string = process.cwd(),
): Promise<void> => {
  const targetDir =
    scope === "global" ? join(home, ".claude") : join(cwd, ".claude");

  for (const name of SKILL_FILES) {
    await tryRemove(join(targetDir, "skills", `crev-${name}.md`));
  }
  for (const name of AGENT_FILES) {
    await tryRemove(join(targetDir, "agents", `crev-${name}.md`));
  }
};

const removeStaleHook = async (settingsPath: string): Promise<boolean> => {
  try {
    const raw = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(raw) as Record<string, unknown>;
    const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;
    const postToolUse = (hooks.PostToolUse ?? []) as Record<string, unknown>[];
    const filtered = postToolUse.filter((h) => !JSON.stringify(h).includes("crev"));
    if (filtered.length === postToolUse.length) return false;
    const updated = { ...settings, hooks: { ...hooks, PostToolUse: filtered } };
    await writeFile(settingsPath, JSON.stringify(updated, null, 2) + "\n", "utf-8");
    return true;
  } catch {
    return false;
  }
};

export const runUninstallCommand = async (): Promise<void> => {
  process.stderr.write("crev \u2014 Uninstall\n\n");

  let removed = false;

  // Remove stale v0.1 PostToolUse hooks (migration from hook-based install)
  const globalSettings = join(homedir(), ".claude", "settings.json");
  const projectSettings = join(process.cwd(), ".claude", "settings.local.json");
  for (const path of [globalSettings, projectSettings]) {
    if (await removeStaleHook(path)) {
      process.stderr.write(`Removed stale hook from ${path}\n`);
      removed = true;
    }
  }

  for (const scope of ["global", "project"] as const) {
    const targetDir =
      scope === "global"
        ? join(homedir(), ".claude")
        : join(process.cwd(), ".claude");

    for (const name of SKILL_FILES) {
      const path = join(targetDir, "skills", `crev-${name}.md`);
      if (await tryRemove(path)) {
        process.stderr.write(`Removed ${path}\n`);
        removed = true;
      }
    }
    for (const name of AGENT_FILES) {
      const path = join(targetDir, "agents", `crev-${name}.md`);
      if (await tryRemove(path)) {
        process.stderr.write(`Removed ${path}\n`);
        removed = true;
      }
    }
  }

  if (!removed) {
    process.stderr.write("Nothing to remove.\n");
  } else {
    process.stderr.write("\nUninstalled.\n");
  }
};
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- src/commands/uninstall.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/uninstall.ts src/commands/uninstall.test.ts
git -c commit.gpgsign=false commit -m "feat: rewrite uninstall to remove skills and agents"
```

---

### Task 7: Simplify `bin/cli.ts` and `package.json`

**Files:**
- Modify: `bin/cli.ts`
- Modify: `package.json`

- [ ] **Step 1: Simplify `bin/cli.ts`**

Remove `hook-handler`, `review` subcommand, and `--pr` option. Keep only `init` and `uninstall`.

```typescript
#!/usr/bin/env node

import { parseArgs } from "node:util";

const usage = `crev \u2014 Code review skills for Claude Code

Usage:
  crev init [--global | --project]    Install /crev:review and /crev:audit skills
  crev uninstall                      Remove installed skills and agents

Options:
  --global          Install to ~/.claude/ (all projects)
  --project         Install to .claude/ (this project only)
  -h, --help        Show this help

After install, use inside Claude Code:
  /crev:review      Review current branch before pushing
  /crev:audit       Review existing files or directories
`;

const main = async (): Promise<void> => {
  const subcommand = process.argv[2];

  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    process.stderr.write(usage);
    return;
  }

  switch (subcommand) {
    case "init": {
      const { values } = parseArgs({
        args: process.argv.slice(3),
        options: {
          global: { type: "boolean", default: false },
          project: { type: "boolean", default: false },
        },
      });
      const { runInitCommand } = await import("../src/commands/init.js");
      await runInitCommand({ global: values.global, project: values.project });
      break;
    }

    case "uninstall": {
      const { runUninstallCommand } = await import(
        "../src/commands/uninstall.js"
      );
      await runUninstallCommand();
      break;
    }

    default: {
      process.stderr.write(`Unknown command: ${subcommand}\n\n`);
      process.stderr.write(usage);
      process.exit(1);
    }
  }
};

main().catch((error) => {
  process.stderr.write(
    `[crev] Fatal: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
```

- [ ] **Step 2: Update `package.json`**

Update `files` field to include `skills/` and `agents/`, remove now-unused entries:

```json
{
  "name": "crev",
  "version": "0.2.0",
  "type": "module",
  "bin": {
    "crev": "./dist/bin/cli.js"
  },
  "files": ["dist", "skills", "agents"],
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "npm run build",
    "dev": "tsx bin/cli.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@types/node": "^25.4.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^4.0.0"
  }
}
```

- [ ] **Step 3: Build and verify**

```bash
npm run build 2>&1
```
Expected: clean build, no errors

- [ ] **Step 4: Run all tests**

```bash
npm test
```
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add bin/cli.ts package.json
git -c commit.gpgsign=false commit -m "feat: simplify CLI to init/uninstall only, bump to v0.2.0"
```

---

## Chunk 4: Delete Old Pipeline + Update Docs

### Task 8: Delete old source and test files

> **Depends on Task 7** — `bin/cli.ts` must no longer reference any deleted modules before this task runs.

**Files to delete:**
- `src/claude.ts`, `src/runner.ts`, `src/aggregator.ts`, `src/scout.ts`
- `src/reviewers.ts`, `src/output.ts`, `src/config.ts`, `src/diff.ts`
- `src/types.ts`, `src/commands/review.ts`
- `tests/aggregator.test.ts`, `tests/claude.test.ts`, `tests/config.test.ts`
- `tests/diff.test.ts`, `tests/output.test.ts`, `tests/reviewers.test.ts`
- `tests/runner.test.ts`, `tests/scout.test.ts`

- [ ] **Step 1: Delete all old pipeline and test files**

```bash
rm src/claude.ts src/runner.ts src/aggregator.ts src/scout.ts \
   src/reviewers.ts src/output.ts src/config.ts src/diff.ts \
   src/types.ts src/commands/review.ts
rm tests/aggregator.test.ts tests/claude.test.ts tests/config.test.ts \
   tests/diff.test.ts tests/output.test.ts tests/reviewers.test.ts \
   tests/runner.test.ts tests/scout.test.ts
```

- [ ] **Step 2: Build — verify no broken imports**

```bash
npm run build 2>&1
```
Expected: clean build

- [ ] **Step 3: Run all tests**

```bash
npm test
```
Expected: all pass (only init and uninstall tests remain)

- [ ] **Step 4: Commit**

```bash
git add -A
git -c commit.gpgsign=false commit -m "chore: remove subprocess review pipeline (replaced by skills + agents)"
```

---

### Task 9: Update README and Obsidian

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Rewrite README**

Update to reflect:
- Primary usage: `/crev:review` and `/crev:audit` inside Claude Code
- `crev init` installs skills/agents
- No mention of hooks, subprocess pipeline, or `--pr` flag
- Prerequisites: only `claude` CLI (no `gh` required)
- Architecture section showing skills/ and agents/ structure

- [ ] **Step 2: Update Obsidian note**

Run `obsidian create path="Projects/crev.md" content="..." overwrite silent` to update the vault note (use `dangerouslyDisableSandbox`).

- [ ] **Step 3: Final commit**

```bash
git add README.md
git -c commit.gpgsign=false commit -m "docs: update README for skill-based architecture"
```

- [ ] **Step 4: Push**

```bash
git push
```

---
