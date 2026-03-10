import { describe, it, expect, vi } from "vitest";
import {
  SCOUT_SYSTEM_PROMPT,
  runScout,
  parseScoutResponse,
  shouldSkipEscalation,
} from "../src/scout.js";
import type { PrMetadata } from "../src/types.js";

const makeMeta = (): PrMetadata => ({
  url: "https://github.com/org/repo/pull/5",
  title: "feat: add auth",
  author: "janne",
  branch: "feat/auth",
  baseBranch: "main",
  totalAdditions: 120,
  totalDeletions: 30,
  changedFiles: [
    { path: "src/auth.ts", changeType: "added", additions: 100, deletions: 0 },
    {
      path: "src/utils.ts",
      changeType: "modified",
      additions: 20,
      deletions: 30,
    },
  ],
});

describe("SCOUT_SYSTEM_PROMPT", () => {
  it("includes escalation criteria", () => {
    expect(SCOUT_SYSTEM_PROMPT).toContain("escalate");
    expect(SCOUT_SYSTEM_PROMPT).toContain("security");
  });

  it("defines the JSON response schema", () => {
    expect(SCOUT_SYSTEM_PROMPT).toContain("findings");
    expect(SCOUT_SYSTEM_PROMPT).toContain("escalate");
    expect(SCOUT_SYSTEM_PROMPT).toContain("escalateReason");
  });
});

describe("parseScoutResponse", () => {
  it("parses valid scout JSON with escalate=true", () => {
    const raw = JSON.stringify({
      findings: [
        {
          severity: "high",
          file: "src/auth.ts",
          line: 10,
          title: "SQL injection",
          description: "Unparameterized query",
          suggestion: "Use prepared statement",
        },
      ],
      summary: "Auth changes need deeper review",
      escalate: true,
      escalateReason: "Security-sensitive auth changes",
    });
    const result = parseScoutResponse(raw);
    expect(result.escalate).toBe(true);
    expect(result.findings).toHaveLength(1);
    expect(result.reviewer).toBe("Scout");
  });

  it("parses valid scout JSON with escalate=false", () => {
    const raw = JSON.stringify({
      findings: [],
      summary: "Simple config change, looks good",
      escalate: false,
      escalateReason: null,
    });
    const result = parseScoutResponse(raw);
    expect(result.escalate).toBe(false);
    expect(result.findings).toEqual([]);
  });

  it("returns safe fallback on invalid JSON", () => {
    const result = parseScoutResponse("not json at all");
    expect(result.escalate).toBe(true);
    expect(result.summary).toContain("failed to parse");
  });
});

describe("runScout", () => {
  it("invokes claude and returns parsed ScoutResult", async () => {
    const mockInvoke = vi.fn().mockResolvedValue(
      JSON.stringify({
        findings: [],
        summary: "LGTM",
        escalate: false,
        escalateReason: null,
      }),
    );
    const result = await runScout({
      diff: "diff content",
      metadata: makeMeta(),
      model: "sonnet",
      invoke: mockInvoke,
    });
    expect(result.escalate).toBe(false);
    expect(mockInvoke).toHaveBeenCalledOnce();
  });

  it("escalates by default when claude call fails", async () => {
    const mockInvoke = vi.fn().mockRejectedValue(new Error("timeout"));
    const result = await runScout({
      diff: "diff content",
      metadata: makeMeta(),
      model: "sonnet",
      invoke: mockInvoke,
    });
    expect(result.escalate).toBe(true);
    expect(result.summary).toContain("error");
  });

  it("overrides escalation for tiny PRs on non-sensitive paths", async () => {
    const tinyMeta: PrMetadata = {
      url: "https://github.com/org/repo/pull/5",
      title: "fix: typo",
      author: "janne",
      branch: "fix/typo",
      baseBranch: "main",
      totalAdditions: 3,
      totalDeletions: 3,
      changedFiles: [
        {
          path: "src/utils.ts",
          changeType: "modified",
          additions: 3,
          deletions: 3,
        },
      ],
    };
    const mockInvoke = vi.fn().mockResolvedValue(
      JSON.stringify({
        findings: [],
        summary: "Trivial change but escalating anyway",
        escalate: true,
        escalateReason: "Just being cautious",
      }),
    );
    const result = await runScout({
      diff: "diff content",
      metadata: tinyMeta,
      model: "sonnet",
      invoke: mockInvoke,
      minLinesForEscalation: 20,
    });
    expect(result.escalate).toBe(false);
    expect(result.escalateReason).toContain("under 20");
  });

  it("still escalates tiny PRs that touch sensitive paths", async () => {
    const tinyAuthMeta: PrMetadata = {
      url: "https://github.com/org/repo/pull/5",
      title: "fix: auth typo",
      author: "janne",
      branch: "fix/auth-typo",
      baseBranch: "main",
      totalAdditions: 2,
      totalDeletions: 2,
      changedFiles: [
        {
          path: "src/auth.ts",
          changeType: "modified",
          additions: 2,
          deletions: 2,
        },
      ],
    };
    const mockInvoke = vi.fn().mockResolvedValue(
      JSON.stringify({
        findings: [],
        summary: "Small auth change",
        escalate: true,
        escalateReason: "Auth file changed",
      }),
    );
    const result = await runScout({
      diff: "diff content",
      metadata: tinyAuthMeta,
      model: "sonnet",
      invoke: mockInvoke,
      minLinesForEscalation: 20,
    });
    expect(result.escalate).toBe(true);
  });

  it("passes escalation threshold to system prompt", async () => {
    const mockInvoke = vi
      .fn()
      .mockResolvedValue(
        JSON.stringify({
          findings: [],
          summary: "OK",
          escalate: false,
          escalateReason: null,
        }),
      );
    await runScout({
      diff: "diff",
      metadata: makeMeta(),
      model: "sonnet",
      invoke: mockInvoke,
      escalation: "minimal",
    });
    const prompt = mockInvoke.mock.calls[0][0] as string;
    expect(prompt).toContain("MINIMAL");
  });
});

describe("shouldSkipEscalation", () => {
  it("skips for small PRs on non-sensitive paths", () => {
    const meta: PrMetadata = {
      url: "",
      title: "",
      author: "",
      branch: "",
      baseBranch: "",
      totalAdditions: 5,
      totalDeletions: 3,
      changedFiles: [
        {
          path: "README.md",
          changeType: "modified",
          additions: 5,
          deletions: 3,
        },
      ],
    };
    expect(shouldSkipEscalation(meta, 20)).toBe(true);
  });

  it("does not skip for large PRs", () => {
    const meta: PrMetadata = {
      url: "",
      title: "",
      author: "",
      branch: "",
      baseBranch: "",
      totalAdditions: 100,
      totalDeletions: 50,
      changedFiles: [
        {
          path: "README.md",
          changeType: "modified",
          additions: 100,
          deletions: 50,
        },
      ],
    };
    expect(shouldSkipEscalation(meta, 20)).toBe(false);
  });

  it("does not skip for small PRs touching sensitive paths", () => {
    const meta: PrMetadata = {
      url: "",
      title: "",
      author: "",
      branch: "",
      baseBranch: "",
      totalAdditions: 2,
      totalDeletions: 1,
      changedFiles: [
        {
          path: "src/auth/login.ts",
          changeType: "modified",
          additions: 2,
          deletions: 1,
        },
      ],
    };
    expect(shouldSkipEscalation(meta, 20)).toBe(false);
  });

  it("detects .env files as sensitive", () => {
    const meta: PrMetadata = {
      url: "",
      title: "",
      author: "",
      branch: "",
      baseBranch: "",
      totalAdditions: 1,
      totalDeletions: 0,
      changedFiles: [
        {
          path: ".env.example",
          changeType: "modified",
          additions: 1,
          deletions: 0,
        },
      ],
    };
    expect(shouldSkipEscalation(meta, 20)).toBe(false);
  });
});
