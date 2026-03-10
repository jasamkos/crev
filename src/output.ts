import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import type { AggregatedReview, Finding, Severity } from "./types.js";
import type { PrRef } from "./diff.js";

const execFileAsync = promisify(execFile);

const SEVERITY_EMOJI: Record<Severity, string> = {
  critical: "\u{1F6A8}",
  high: "\u{1F534}",
  medium: "\u{1F7E1}",
  low: "\u{1F535}",
  info: "\u2139\uFE0F",
};

const formatFinding = (f: Finding): string => {
  const location = f.line ? `${f.file}:${f.line}` : f.file;
  const suggestion = f.suggestion
    ? `\n  > **Suggestion:** ${f.suggestion}`
    : "";
  return `- ${SEVERITY_EMOJI[f.severity]} **${f.severity.toUpperCase()}** \u2014 ${f.title} _(${f.reviewer})_\n  \`${location}\`: ${f.description}${suggestion}`;
};

const formatSubject = (review: AggregatedReview): string => {
  if (review.prUrl) {
    return `**PR:** [${review.prTitle}](${review.prUrl})`;
  }
  return `**Branch:** ${review.prTitle}`;
};

export const formatAsMarkdown = (review: AggregatedReview): string => {
  const escalationNote = review.wasEscalated
    ? "Escalated to 5 specialist reviewers."
    : "Scout review only (no escalation needed).";

  if (review.stats.total === 0) {
    return `# Code Review \u2014 No issues found

${formatSubject(review)}
${escalationNote}

No issues found. All reviewers passed.
`;
  }

  const statsLine = (
    ["critical", "high", "medium", "low", "info"] as Severity[]
  )
    .filter((s) => review.stats[s] > 0)
    .map((s) => `${review.stats[s]} ${s}`)
    .join(", ");

  const findingsSection = review.findings.map(formatFinding).join("\n\n");

  const summariesSection = review.reviewerSummaries
    .map((s) => `- **${s.reviewer}**: ${s.summary}`)
    .join("\n");

  return `# Code Review \u2014 ${review.stats.total} finding${review.stats.total === 1 ? "" : "s"} (${statsLine})

${formatSubject(review)}
${escalationNote}

## Findings

${findingsSection}

## Reviewer Summaries

${summariesSection}
`;
};

type MkdirFn = (path: string) => Promise<void>;
type WriteFn = (path: string, content: string) => Promise<void>;
type ExecFn = (cmd: string, args: readonly string[]) => Promise<string>;

const defaultMkdir: MkdirFn = async (path) => {
  const { mkdir } = await import("node:fs/promises");
  await mkdir(path, { recursive: true });
};

const defaultWrite: WriteFn = async (path, content) => {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(path, content, "utf-8");
};

const defaultExec: ExecFn = async (cmd, args) => {
  const { stdout } = await execFileAsync(cmd, [...args]);
  return stdout;
};

const extractPrNumber = (url: string): number => {
  const match = url.match(/\/pull\/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
};

const buildFilename = (review: AggregatedReview): string => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  if (review.prUrl) {
    const prNumber = extractPrNumber(review.prUrl);
    return `PR-${prNumber}-${timestamp}.md`;
  }
  const safeBranch = review.prTitle
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .slice(0, 50);
  return `${safeBranch}-${timestamp}.md`;
};

export const writeLocalReport = async (
  review: AggregatedReview,
  dir: string,
  mkdirFn: MkdirFn = defaultMkdir,
  writeFn: WriteFn = defaultWrite,
): Promise<string> => {
  await mkdirFn(dir);
  const filename = buildFilename(review);
  const filepath = join(dir, filename);
  await writeFn(filepath, formatAsMarkdown(review));
  return filepath;
};

export const createGithubIssue = async (
  review: AggregatedReview,
  pr: PrRef,
  labels: readonly string[],
  exec: ExecFn = defaultExec,
): Promise<string> => {
  const findingCount = `${review.stats.total} finding${review.stats.total === 1 ? "" : "s"}`;
  const title = `Code Review: ${review.prTitle} (#${pr.number}) \u2014 ${findingCount}`;
  const body = formatAsMarkdown(review);

  const args = [
    "issue",
    "create",
    "--repo",
    `${pr.owner}/${pr.repo}`,
    "--title",
    title,
    "--body",
    body,
  ];

  for (const label of labels) {
    args.push("--label", label);
  }

  const output = await exec("gh", args);
  return output.trim();
};
