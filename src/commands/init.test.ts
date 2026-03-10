import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fs/path deps
const mockMkdir = vi.fn().mockResolvedValue(undefined);
const mockCopyFile = vi.fn().mockResolvedValue(undefined);
const mockExecFile = vi.fn();

vi.mock("node:fs/promises", () => ({
  mkdir: mockMkdir,
  copyFile: mockCopyFile,
}));

describe("installFiles", () => {
  beforeEach(() => {
    mockMkdir.mockClear();
    mockCopyFile.mockClear();
  });

  it("installs skills and agents to global .claude dir", async () => {
    const { installFiles } = await import("./init.js");
    await installFiles("global", "/fake/package/root", "/fake/home");

    // Should create skills and agents directories
    expect(mockMkdir).toHaveBeenCalledWith(
      expect.stringContaining(".claude/skills"),
      expect.any(Object),
    );
    expect(mockMkdir).toHaveBeenCalledWith(
      expect.stringContaining(".claude/agents"),
      expect.any(Object),
    );

    // Should copy all skill files
    expect(mockCopyFile).toHaveBeenCalledWith(
      expect.stringContaining("skills/review.md"),
      expect.stringContaining(".claude/skills/crev-review.md"),
    );
    expect(mockCopyFile).toHaveBeenCalledWith(
      expect.stringContaining("skills/audit.md"),
      expect.stringContaining(".claude/skills/crev-audit.md"),
    );

    // Should copy all agent files
    for (const name of ["scout", "security", "correctness", "performance", "style", "api-contract"]) {
      expect(mockCopyFile).toHaveBeenCalledWith(
        expect.stringContaining(`agents/${name}.md`),
        expect.stringContaining(`.claude/agents/crev-${name}.md`),
      );
    }
  });

  it("installs to project .claude dir when scope is project", async () => {
    const { installFiles } = await import("./init.js");
    await installFiles("project", "/fake/package/root", "/fake/home", "/fake/project");

    expect(mockCopyFile).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("/fake/project/.claude/skills/crev-review.md"),
    );
  });
});
