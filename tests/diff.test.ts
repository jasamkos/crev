import { describe, it, expect, vi } from "vitest";
import { parsePrUrl, fetchDiff, fetchPrMetadata } from "../src/diff.js";

describe("parsePrUrl", () => {
  it("extracts owner, repo, and number from GitHub URL", () => {
    const result = parsePrUrl("https://github.com/acme/webapp/pull/42");
    expect(result).toEqual({ owner: "acme", repo: "webapp", number: 42 });
  });

  it("throws on invalid URL", () => {
    expect(() => parsePrUrl("https://example.com")).toThrow(/invalid pr url/i);
  });

  it("handles URLs with trailing slash", () => {
    const result = parsePrUrl("https://github.com/org/repo/pull/7/");
    expect(result).toEqual({ owner: "org", repo: "repo", number: 7 });
  });
});

describe("fetchDiff", () => {
  it("calls gh pr diff with correct args", async () => {
    const mockExec = vi.fn().mockResolvedValue("diff --git a/file.ts b/file.ts\n+new line");
    const diff = await fetchDiff(
      { owner: "org", repo: "repo", number: 5 },
      mockExec,
    );
    expect(mockExec).toHaveBeenCalledWith("gh", [
      "pr", "diff", "5", "--repo", "org/repo",
    ]);
    expect(diff).toContain("diff --git");
  });

  it("throws when diff is empty", async () => {
    const mockExec = vi.fn().mockResolvedValue("");
    await expect(
      fetchDiff({ owner: "org", repo: "repo", number: 1 }, mockExec),
    ).rejects.toThrow(/empty diff/i);
  });
});

describe("fetchPrMetadata", () => {
  it("parses gh pr view JSON into PrMetadata", async () => {
    const ghOutput = JSON.stringify({
      title: "feat: add auth",
      author: { login: "janne" },
      headRefName: "feat/auth",
      baseRefName: "main",
      additions: 120,
      deletions: 30,
      files: [
        { path: "src/auth.ts", status: "added", additions: 100, deletions: 0 },
        { path: "src/utils.ts", status: "modified", additions: 20, deletions: 30 },
      ],
    });
    const mockExec = vi.fn().mockResolvedValue(ghOutput);
    const meta = await fetchPrMetadata(
      { owner: "org", repo: "repo", number: 5 },
      "https://github.com/org/repo/pull/5",
      mockExec,
    );
    expect(meta.title).toBe("feat: add auth");
    expect(meta.author).toBe("janne");
    expect(meta.branch).toBe("feat/auth");
    expect(meta.changedFiles).toHaveLength(2);
    expect(meta.changedFiles[0].changeType).toBe("added");
    expect(meta.changedFiles[1].changeType).toBe("modified");
  });
});
