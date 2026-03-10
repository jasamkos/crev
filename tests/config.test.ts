import { describe, it, expect, vi } from "vitest";
import { loadConfig, mergeConfigs } from "../src/config.js";
import { DEFAULT_CONFIG } from "../src/types.js";
import type { PluginConfig } from "../src/types.js";

describe("mergeConfigs", () => {
  it("returns default config when no overrides", () => {
    const result = mergeConfigs(DEFAULT_CONFIG);
    expect(result).toEqual(DEFAULT_CONFIG);
  });

  it("merges partial overrides into defaults", () => {
    const override: Partial<PluginConfig> = {
      output: { ...DEFAULT_CONFIG.output, githubIssue: true },
    };
    const result = mergeConfigs(DEFAULT_CONFIG, override);
    expect(result.output.githubIssue).toBe(true);
    expect(result.output.local).toBe(true);
    expect(result.scout.model).toBe("sonnet");
  });

  it("project config overrides global config", () => {
    const global: Partial<PluginConfig> = {
      scout: { model: "haiku" },
    };
    const project: Partial<PluginConfig> = {
      scout: { model: "opus" },
    };
    const result = mergeConfigs(DEFAULT_CONFIG, global, project);
    expect(result.scout.model).toBe("opus");
  });
});

describe("loadConfig", () => {
  it("returns default config when no files exist", async () => {
    const mockReadFile = vi.fn().mockRejectedValue(new Error("ENOENT"));
    const result = await loadConfig(mockReadFile);
    expect(result).toEqual(DEFAULT_CONFIG);
  });

  it("loads and merges global config", async () => {
    const globalConfig = JSON.stringify({
      output: { ...DEFAULT_CONFIG.output, githubIssue: true },
    });
    const mockReadFile = vi.fn()
      .mockResolvedValueOnce(globalConfig)
      .mockRejectedValueOnce(new Error("ENOENT"));
    const result = await loadConfig(mockReadFile);
    expect(result.output.githubIssue).toBe(true);
  });
});
