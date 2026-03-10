import { describe, it, expect, vi } from "vitest";
import { SCOUT_SYSTEM_PROMPT, runScout, parseScoutResponse } from "../src/scout.js";
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
    { path: "src/utils.ts", changeType: "modified", additions: 20, deletions: 30 },
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
        { severity: "high", file: "src/auth.ts", line: 10, title: "SQL injection", description: "Unparameterized query", suggestion: "Use prepared statement" },
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
});
