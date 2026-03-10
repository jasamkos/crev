import type { AggregatedReview, Finding, ReviewResult, ScoutResult, Severity } from "./types.js";

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const findingKey = (f: Finding): string =>
  `${f.file}:${f.line ?? "null"}:${f.title.toLowerCase()}`;

const deduplicate = (findings: readonly Finding[]): readonly Finding[] => {
  const seen = new Set<string>();
  const result: Finding[] = [];
  for (const f of findings) {
    const key = findingKey(f);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(f);
    }
  }
  return result;
};

export const aggregateReviews = (
  prUrl: string,
  prTitle: string,
  scout: ScoutResult,
  specialists: readonly ReviewResult[],
): AggregatedReview => {
  const allFindings = [
    ...scout.findings,
    ...specialists.flatMap((r) => [...r.findings]),
  ];

  const deduped = deduplicate(allFindings);
  const sorted = [...deduped].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );

  const stats = {
    critical: sorted.filter((f) => f.severity === "critical").length,
    high: sorted.filter((f) => f.severity === "high").length,
    medium: sorted.filter((f) => f.severity === "medium").length,
    low: sorted.filter((f) => f.severity === "low").length,
    info: sorted.filter((f) => f.severity === "info").length,
    total: sorted.length,
  };

  const allResults: readonly ReviewResult[] = [scout, ...specialists];
  const reviewerSummaries = allResults.map((r) => ({
    reviewer: r.reviewer,
    summary: r.summary,
  }));

  const summaryParts = allResults
    .filter((r) => r.findings.length > 0)
    .map((r) => `**${r.reviewer}**: ${r.summary}`);

  const summary =
    summaryParts.length > 0
      ? summaryParts.join("\n")
      : "No issues found.";

  return {
    prUrl,
    prTitle,
    findings: sorted,
    summary,
    reviewerSummaries,
    stats,
    wasEscalated: specialists.length > 0,
  };
};
