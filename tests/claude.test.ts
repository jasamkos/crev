import { describe, it, expect, vi } from "vitest";
import { invokeClaude, parseClaudeJsonResponse } from "../src/claude.js";

describe("parseClaudeJsonResponse", () => {
  it("parses clean JSON response", () => {
    const raw = '{"findings":[],"summary":"LGTM"}';
    const result = parseClaudeJsonResponse(raw);
    expect(result).toEqual({ findings: [], summary: "LGTM" });
  });

  it("extracts JSON from markdown code fence", () => {
    const raw = 'Here is my review:\n```json\n{"findings":[],"summary":"OK"}\n```';
    const result = parseClaudeJsonResponse(raw);
    expect(result).toEqual({ findings: [], summary: "OK" });
  });

  it("extracts first JSON object from mixed text", () => {
    const raw = 'Some preamble\n{"findings":[],"summary":"OK"}\nSome postamble';
    const result = parseClaudeJsonResponse(raw);
    expect(result).toEqual({ findings: [], summary: "OK" });
  });

  it("throws on no JSON found", () => {
    expect(() => parseClaudeJsonResponse("no json here")).toThrow(
      /no json/i,
    );
  });
});

describe("invokeClaude", () => {
  it("builds correct command arguments", async () => {
    const mockExec = vi.fn().mockResolvedValue('{"findings":[],"summary":"OK"}');

    await invokeClaude({
      systemPrompt: "You are a reviewer",
      userMessage: "Review this",
      model: "sonnet",
      exec: mockExec,
    });

    const callArgs = mockExec.mock.calls[0];
    expect(callArgs[0]).toBe("claude");
    const args: string[] = callArgs[1];
    expect(args).toContain("--print");
    expect(args).toContain("--system-prompt");
    expect(args).toContain("--output-format");
    expect(args).toContain("json");
    expect(args).toContain("--model");
    expect(args).toContain("sonnet");
  });

  it("throws on non-zero exit code", async () => {
    const mockExec = vi.fn().mockRejectedValue(new Error("exit code 1"));
    await expect(
      invokeClaude({
        systemPrompt: "test",
        userMessage: "test",
        model: "sonnet",
        exec: mockExec,
      }),
    ).rejects.toThrow();
  });
});
