import { describe, it, expect, vi, beforeEach } from "vitest";

const mockMkdir = vi.fn().mockResolvedValue(undefined);
const mockReadFile = vi
  .fn()
  .mockResolvedValue("---\nmodel: claude-sonnet-4-6\n---\ncontent");
const mockWriteFile = vi.fn().mockResolvedValue(undefined);

vi.mock("node:fs/promises", () => ({
  mkdir: mockMkdir,
  readFile: mockReadFile,
  writeFile: mockWriteFile,
}));

describe("installFiles", () => {
  beforeEach(() => {
    mockMkdir.mockClear();
    mockReadFile.mockClear();
    mockWriteFile.mockClear();
    mockReadFile.mockResolvedValue(
      "---\nmodel: claude-sonnet-4-6\n---\ncontent",
    );
  });

  it("installs skills and agents to global .claude dir", async () => {
    const { installFiles } = await import("./init.js");
    await installFiles("global", "sonnet", "/fake/package/root", "/fake/home");

    expect(mockMkdir).toHaveBeenCalledWith(
      expect.stringContaining(".claude/skills"),
      expect.any(Object),
    );
    expect(mockMkdir).toHaveBeenCalledWith(
      expect.stringContaining(".claude/agents"),
      expect.any(Object),
    );

    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining(".claude/skills/crev-review.md"),
      expect.any(String),
      "utf-8",
    );
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining(".claude/skills/crev-audit.md"),
      expect.any(String),
      "utf-8",
    );

    for (const name of [
      "scout",
      "security",
      "correctness",
      "performance",
      "style",
      "api-contract",
    ]) {
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining(`.claude/agents/crev-${name}.md`),
        expect.any(String),
        "utf-8",
      );
    }
  });

  it("installs to project .claude dir when scope is project", async () => {
    const { installFiles } = await import("./init.js");
    await installFiles(
      "project",
      "sonnet",
      "/fake/package/root",
      "/fake/home",
      "/fake/project",
    );

    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining("/fake/project/.claude/skills/crev-review.md"),
      expect.any(String),
      "utf-8",
    );
  });

  it("patches model in agent files when haiku is selected", async () => {
    const { installFiles } = await import("./init.js");
    await installFiles("global", "haiku", "/fake/package/root", "/fake/home");

    const agentWriteCalls = mockWriteFile.mock.calls.filter(
      ([path]: string[]) => path.includes("/agents/"),
    );
    for (const [, content] of agentWriteCalls) {
      expect(content).toContain("claude-haiku-4-5-20251001");
    }
  });

  it("patches model in agent files when opus is selected", async () => {
    const { installFiles } = await import("./init.js");
    await installFiles("global", "opus", "/fake/package/root", "/fake/home");

    const agentWriteCalls = mockWriteFile.mock.calls.filter(
      ([path]: string[]) => path.includes("/agents/"),
    );
    for (const [, content] of agentWriteCalls) {
      expect(content).toContain("claude-opus-4-6");
    }
  });
});
