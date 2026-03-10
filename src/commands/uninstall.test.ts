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
