import { describe, it, expect, vi } from "vitest";
import { runSpecialists } from "../src/runner.js";
import type { ReviewerConfig } from "../src/types.js";

const fakeReviewers: readonly ReviewerConfig[] = [
  { name: "Alpha", scope: "test", systemPrompt: "You review alpha." },
  { name: "Beta", scope: "test", systemPrompt: "You review beta." },
];

describe("runSpecialists", () => {
  it("calls invoke once per reviewer in parallel", async () => {
    const mockInvoke = vi.fn().mockResolvedValue(
      JSON.stringify({
        findings: [{ severity: "low", file: "a.ts", line: 1, title: "Test", description: "Desc", suggestion: null }],
        summary: "Looks OK",
      }),
    );

    const results = await runSpecialists({
      diff: "diff content",
      model: "sonnet",
      reviewers: fakeReviewers,
      invoke: mockInvoke,
    });

    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(2);
    expect(results[0].reviewer).toBe("Alpha");
    expect(results[1].reviewer).toBe("Beta");
  });

  it("handles reviewer returning invalid JSON gracefully", async () => {
    const mockInvoke = vi
      .fn()
      .mockResolvedValueOnce("not valid json")
      .mockResolvedValueOnce(
        JSON.stringify({ findings: [], summary: "Clean" }),
      );

    const results = await runSpecialists({
      diff: "diff content",
      model: "sonnet",
      reviewers: fakeReviewers,
      invoke: mockInvoke,
    });

    expect(results).toHaveLength(2);
    expect(results[0].findings).toEqual([]);
    expect(results[0].summary).toContain("failed to parse");
    expect(results[1].findings).toEqual([]);
  });

  it("handles reviewer throwing an error gracefully", async () => {
    const mockInvoke = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(
        JSON.stringify({ findings: [], summary: "OK" }),
      );

    const results = await runSpecialists({
      diff: "diff content",
      model: "sonnet",
      reviewers: fakeReviewers,
      invoke: mockInvoke,
    });

    expect(results).toHaveLength(2);
    expect(results[0].summary).toContain("error");
    expect(results[1].summary).toBe("OK");
  });
});
