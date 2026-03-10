import { parseClaudeJsonResponse } from "./claude.js";
import type { ReviewerConfig, ReviewResult, Finding, PrMetadata } from "./types.js";

type InvokeFn = (
  systemPrompt: string,
  userMessage: string,
  modelId: string,
) => Promise<string>;

interface RunSpecialistsInput {
  readonly diff: string;
  readonly metadata?: PrMetadata;
  readonly model: string;
  readonly reviewers: readonly ReviewerConfig[];
  readonly invoke: InvokeFn;
}

const MAX_DIFF_CHARS = 100_000;

const buildUserMessage = (diff: string, metadata?: PrMetadata): string => {
  const truncated =
    diff.length > MAX_DIFF_CHARS
      ? diff.slice(0, MAX_DIFF_CHARS) + "\n\n[... diff truncated ...]"
      : diff;

  if (!metadata) {
    return `Review the following diff:\n\n\`\`\`diff\n${truncated}\n\`\`\``;
  }

  const fileList = metadata.changedFiles
    .map((f) => `- ${f.path} (${f.changeType}) +${f.additions}/-${f.deletions}`)
    .join("\n");

  return `## PR Context
PR Title: ${metadata.title}
PR Author: ${metadata.author}
Branch: ${metadata.branch} -> ${metadata.baseBranch}
Changes: +${metadata.totalAdditions}/-${metadata.totalDeletions}

### Changed Files
${fileList}

---

\`\`\`diff
${truncated}
\`\`\``;
};

const parseSpecialistResponse = (
  reviewerName: string,
  raw: string,
): ReviewResult => {
  try {
    const parsed = parseClaudeJsonResponse(raw);
    const findings: readonly Finding[] = Array.isArray(parsed.findings)
      ? (parsed.findings as Record<string, unknown>[]).map((f) => ({
          severity: (f.severity as Finding["severity"]) ?? "info",
          reviewer: reviewerName,
          file: (f.file as string) ?? "unknown",
          line: (f.line as number) ?? null,
          title: (f.title as string) ?? "Untitled",
          description: (f.description as string) ?? "",
          suggestion: (f.suggestion as string) ?? null,
        }))
      : [];
    return {
      reviewer: reviewerName,
      findings,
      summary: typeof parsed.summary === "string" ? parsed.summary : "No summary",
    };
  } catch {
    return {
      reviewer: reviewerName,
      findings: [],
      summary: `${reviewerName}: failed to parse response`,
    };
  }
};

export const runSpecialists = async (
  input: RunSpecialistsInput,
): Promise<readonly ReviewResult[]> => {
  const userMessage = buildUserMessage(input.diff, input.metadata);

  const promises = input.reviewers.map(async (reviewer) => {
    try {
      const response = await input.invoke(
        reviewer.systemPrompt,
        userMessage,
        input.model,
      );
      return parseSpecialistResponse(reviewer.name, response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        reviewer: reviewer.name,
        findings: [] as readonly Finding[],
        summary: `${reviewer.name}: error — ${message}`,
      };
    }
  });

  return Promise.all(promises);
};
