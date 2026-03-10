import { parseClaudeJsonResponse } from "./claude.js";
import type {
  ScoutResult,
  Finding,
  PrMetadata,
  EscalationThreshold,
} from "./types.js";

const MAX_DIFF_CHARS = 100_000;

export const SCOUT_SYSTEM_PROMPT = `You are a code review scout agent. You perform two tasks in a single pass:

## Task 1: Lightweight Review
Review the PR diff for obvious issues. Focus on HIGH-CONFIDENCE findings only:
- Clear bugs, null pointer risks, logic errors
- Security vulnerabilities (injection, hardcoded secrets, auth bypass)
- Breaking API changes
- Missing error handling on critical paths

Do NOT report: style nits, formatting, minor naming issues, or speculative concerns.

## Task 2: Escalation Decision
Decide if this PR needs a full review by 5 specialist agents (Security, Correctness, Performance, Style, API Contract).

Answer escalate=TRUE if ANY apply:
- Security-sensitive changes (auth, crypto, input handling, SQL, file access)
- Complex logic changes (algorithms, state machines, concurrency, error recovery)
- API contract changes (new/modified endpoints, changed public types, DB schema)
- Infrastructure changes (CI/CD, Docker, permissions, dependency updates)
- Large refactors touching multiple interrelated files

Answer escalate=FALSE if ALL apply:
- Simple, mechanical changes you've already fully reviewed
- Test-only, docs-only, or config-only changes with no security impact
- Your scout review already covers everything needed

## Response Format
Respond with ONLY valid JSON:
{
  "findings": [
    {
      "severity": "critical" | "high" | "medium" | "low" | "info",
      "file": "path/to/file.ts",
      "line": 42,
      "title": "Short title",
      "description": "What's wrong and why",
      "suggestion": "How to fix (or null)"
    }
  ],
  "summary": "1-2 sentence assessment",
  "escalate": true | false,
  "escalateReason": "Why full review is needed (or null)"
}

Rules:
- Only report issues you are confident about
- "line" must be the NEW file line number (post-change), or null for file-wide issues
- Focus on CHANGED lines (prefixed with + in the diff)`;

const formatDiffWithContext = (diff: string, metadata: PrMetadata): string => {
  const truncated =
    diff.length > MAX_DIFF_CHARS
      ? diff.slice(0, MAX_DIFF_CHARS) +
        "\n\n[... diff truncated at 100k chars ...]"
      : diff;

  const fileList = metadata.changedFiles
    .map((f) => `- ${f.path} (${f.changeType}) +${f.additions}/-${f.deletions}`)
    .join("\n");

  return `## PR Context
PR Title: ${metadata.title}
PR Author: ${metadata.author}
Branch: ${metadata.branch} -> ${metadata.baseBranch}
Changes: +${metadata.totalAdditions}/-${metadata.totalDeletions} across ${metadata.changedFiles.length} files

### Changed Files
${fileList}

---

\`\`\`diff
${truncated}
\`\`\``;
};

export const parseScoutResponse = (raw: string): ScoutResult => {
  try {
    const parsed = parseClaudeJsonResponse(raw);
    const findings: readonly Finding[] = Array.isArray(parsed.findings)
      ? (parsed.findings as Record<string, unknown>[]).map((f) => ({
          severity: (f.severity as Finding["severity"]) ?? "info",
          reviewer: "Scout",
          file: (f.file as string) ?? "unknown",
          line: (f.line as number) ?? null,
          title: (f.title as string) ?? "Untitled",
          description: (f.description as string) ?? "",
          suggestion: (f.suggestion as string) ?? null,
        }))
      : [];
    return {
      reviewer: "Scout",
      findings,
      summary:
        typeof parsed.summary === "string" ? parsed.summary : "No summary",
      escalate: typeof parsed.escalate === "boolean" ? parsed.escalate : true,
      escalateReason:
        typeof parsed.escalateReason === "string"
          ? parsed.escalateReason
          : null,
    };
  } catch {
    return {
      reviewer: "Scout",
      findings: [],
      summary: "Scout: failed to parse response — escalating by default",
      escalate: true,
      escalateReason: "Failed to parse scout response",
    };
  }
};

type InvokeFn = (
  systemPrompt: string,
  userMessage: string,
  model: string,
) => Promise<string>;

const SENSITIVE_PATTERNS = [
  /auth/i,
  /login/i,
  /password/i,
  /secret/i,
  /token/i,
  /crypt/i,
  /permission/i,
  /role/i,
  /admin/i,
  /sql/i,
  /query/i,
  /migration/i,
  /docker/i,
  /ci[/-]/i,
  /\.env/i,
  /credential/i,
  /session/i,
];

const touchesSensitivePaths = (metadata: PrMetadata): boolean =>
  metadata.changedFiles.some((f) =>
    SENSITIVE_PATTERNS.some((p) => p.test(f.path)),
  );

export const shouldSkipEscalation = (
  metadata: PrMetadata,
  minLines: number,
): boolean => {
  const totalChanges = metadata.totalAdditions + metadata.totalDeletions;
  if (totalChanges >= minLines) return false;
  if (touchesSensitivePaths(metadata)) return false;
  return true;
};

const ESCALATION_PROMPT_SUFFIX: Record<EscalationThreshold, string> = {
  conservative: `\n\nEscalation bias: CONSERVATIVE. When in doubt, escalate. Only skip escalation for trivially simple changes you are 100% confident about.`,
  balanced: `\n\nEscalation bias: BALANCED. Use your best judgment. Escalate when the change has meaningful complexity or risk.`,
  minimal: `\n\nEscalation bias: MINIMAL. Only escalate for clearly high-risk changes (security, complex logic, breaking API). Prefer handling the review yourself when possible.`,
};

interface RunScoutInput {
  readonly diff: string;
  readonly metadata: PrMetadata;
  readonly model: string;
  readonly invoke: InvokeFn;
  readonly escalation?: EscalationThreshold;
  readonly minLinesForEscalation?: number;
}

export const runScout = async (input: RunScoutInput): Promise<ScoutResult> => {
  const escalation = input.escalation ?? "balanced";
  const minLines = input.minLinesForEscalation ?? 20;

  try {
    const systemPrompt =
      SCOUT_SYSTEM_PROMPT + ESCALATION_PROMPT_SUFFIX[escalation];
    const userMessage = formatDiffWithContext(input.diff, input.metadata);
    const response = await input.invoke(systemPrompt, userMessage, input.model);
    const result = parseScoutResponse(response);

    // Size-based pre-filter: skip escalation for tiny PRs on non-sensitive paths
    if (result.escalate && shouldSkipEscalation(input.metadata, minLines)) {
      return {
        ...result,
        escalate: false,
        escalateReason: `Skipped: PR under ${minLines} changed lines and no sensitive paths`,
      };
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      reviewer: "Scout",
      findings: [],
      summary: `Scout: error — ${message}`,
      escalate: true,
      escalateReason: `Scout failed: ${message}`,
    };
  }
};
