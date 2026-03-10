import { homedir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { DEFAULT_CONFIG, type PluginConfig } from "./types.js";

const GLOBAL_CONFIG_PATH = join(
  homedir(),
  ".config",
  "crev",
  "config.json",
);
const PROJECT_CONFIG_PATH = join(
  process.cwd(),
  ".claude",
  "code-review.json",
);

export const mergeConfigs = (
  base: PluginConfig,
  ...overrides: (Partial<PluginConfig> | undefined)[]
): PluginConfig => {
  let result = base;
  for (const override of overrides) {
    if (!override) continue;
    result = {
      output: { ...result.output, ...override.output },
      scout: { ...result.scout, ...override.scout },
      specialists: { ...result.specialists, ...override.specialists },
    };
  }
  return result;
};

type ReadFileFn = (path: string) => Promise<string>;

const defaultReadFile: ReadFileFn = (path) => readFile(path, "utf-8");

const tryLoadJson = async (
  path: string,
  read: ReadFileFn,
): Promise<Partial<PluginConfig> | undefined> => {
  try {
    const raw = await read(path);
    return JSON.parse(raw) as Partial<PluginConfig>;
  } catch {
    return undefined;
  }
};

export const loadConfig = async (
  read: ReadFileFn = defaultReadFile,
): Promise<PluginConfig> => {
  const globalOverride = await tryLoadJson(GLOBAL_CONFIG_PATH, read);
  const projectOverride = await tryLoadJson(PROJECT_CONFIG_PATH, read);
  return mergeConfigs(DEFAULT_CONFIG, globalOverride, projectOverride);
};
