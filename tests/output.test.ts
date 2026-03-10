import { describe, it, expect, vi } from "vitest";
import { formatAsMarkdown, writeLocalReport, createGithubIssue } from "../src/output.js";
import type { AggregatedReview } from "../src/types.js";

const makeReview = (total = 3): AggregatedReview => ({
  prUrl: "https://github.com/org/repo/pull/42",
  prTitle: "feat: add auth",
  findings:
    total > 0
      ? [
          { severity: "critical", reviewer: "Scout", file: "auth.ts", line: 10, title: "SQL injection", description: "Bad query", suggestion: "Fix it" },
          { severity: "high", reviewer: "Correctness", file: "auth.ts", line: 12, title: "Null check", description: "Missing guard", suggestion: null },
          { severity: "low", reviewer: "Security", file: "utils.ts", line: 5, title: "Weak hash", description: "MD5", suggestion: "SHA-256" },
        ]
      : [],
  summary: total > 0 ? "Found issues" : "No issues",
  reviewerSummaries: [
    { reviewer: "Scout", summary: "Found SQL injection" },
    { reviewer: "Security", summary: "Confirmed injection" },
  ],
  stats: {
    critical: total > 0 ? 1 : 0,
    high: total > 0 ? 1 : 0,
    medium: 0,
    low: total > 0 ? 1 : 0,
    info: 0,
    total,
  },
  wasEscalated: true,
});

describe("formatAsMarkdown", () => {
  it("includes PR title and URL", () => {
    const md = formatAsMarkdown(makeReview());
    expect(md).toContain("feat: add auth");
    expect(md).toContain("github.com/org/repo/pull/42");
  });

  it("lists findings sorted by severity", () => {
    const md = formatAsMarkdown(makeReview());
    const criticalPos = md.indexOf("CRITICAL");
    const highPos = md.indexOf("HIGH");
    const lowPos = md.indexOf("LOW");
    expect(criticalPos).toBeLessThan(highPos);
    expect(highPos).toBeLessThan(lowPos);
  });

  it("shows all-clear for zero findings", () => {
    const md = formatAsMarkdown(makeReview(0));
    expect(md).toContain("No issues found");
  });

  it("indicates whether full review was run", () => {
    const md = formatAsMarkdown(makeReview());
    expect(md).toContain("Escalated");
  });
});

describe("writeLocalReport", () => {
  it("writes markdown to correct path", async () => {
    const mockMkdir = vi.fn().mockResolvedValue(undefined);
    const mockWrite = vi.fn().mockResolvedValue(undefined);

    const path = await writeLocalReport(makeReview(), "reviews", mockMkdir, mockWrite);

    expect(path).toMatch(/reviews\/PR-42-.+\.md$/);
    expect(mockMkdir).toHaveBeenCalledOnce();
    expect(mockWrite).toHaveBeenCalledOnce();
    const content = mockWrite.mock.calls[0][1] as string;
    expect(content).toContain("SQL injection");
  });
});

describe("createGithubIssue", () => {
  it("calls gh issue create with correct args", async () => {
    const mockExec = vi.fn().mockResolvedValue("https://github.com/org/repo/issues/58\n");

    const url = await createGithubIssue(
      makeReview(),
      { owner: "org", repo: "repo", number: 42 },
      ["code-review"],
      mockExec,
    );

    expect(url).toContain("issues/58");
    const args: string[] = mockExec.mock.calls[0][1];
    expect(args).toContain("--title");
    expect(args).toContain("--label");
  });

  it("includes finding count in issue title", async () => {
    const mockExec = vi.fn().mockResolvedValue("url\n");

    await createGithubIssue(
      makeReview(),
      { owner: "org", repo: "repo", number: 42 },
      [],
      mockExec,
    );

    const args: string[] = mockExec.mock.calls[0][1];
    const titleIdx = args.indexOf("--title");
    expect(args[titleIdx + 1]).toContain("3 finding");
  });
});
