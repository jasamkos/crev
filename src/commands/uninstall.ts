import { readFile, writeFile, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const readJsonFile = async (path: string): Promise<Record<string, unknown> | null> => {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const removeHookFromSettings = async (settingsPath: string): Promise<boolean> => {
  const settings = await readJsonFile(settingsPath);
  if (!settings) return false;

  const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;
  const postToolUse = (hooks.PostToolUse ?? []) as Record<string, unknown>[];

  const filtered = postToolUse.filter(
    (h) => !JSON.stringify(h).includes("crev"),
  );

  if (filtered.length === postToolUse.length) return false;

  const updatedHooks = { ...hooks, PostToolUse: filtered };
  const updatedSettings = { ...settings, hooks: updatedHooks };
  await writeFile(settingsPath, JSON.stringify(updatedSettings, null, 2) + "\n", "utf-8");
  return true;
};

const tryRemoveFile = async (path: string): Promise<boolean> => {
  try {
    await unlink(path);
    return true;
  } catch {
    return false;
  }
};

export const runUninstallCommand = async (): Promise<void> => {
  process.stderr.write("crev \u2014 Uninstall\n\n");

  // Remove from global settings
  const globalSettings = join(homedir(), ".claude", "settings.json");
  const removedGlobal = await removeHookFromSettings(globalSettings);
  if (removedGlobal) {
    process.stderr.write(`Removed hook from ${globalSettings}\n`);
  }

  // Remove from project settings
  const projectSettings = join(process.cwd(), ".claude", "settings.local.json");
  const removedProject = await removeHookFromSettings(projectSettings);
  if (removedProject) {
    process.stderr.write(`Removed hook from ${projectSettings}\n`);
  }

  // Remove config files
  const globalConfig = join(homedir(), ".config", "crev", "config.json");
  const projectConfig = join(process.cwd(), ".claude", "code-review.json");

  if (await tryRemoveFile(globalConfig)) {
    process.stderr.write(`Removed ${globalConfig}\n`);
  }
  if (await tryRemoveFile(projectConfig)) {
    process.stderr.write(`Removed ${projectConfig}\n`);
  }

  if (!removedGlobal && !removedProject) {
    process.stderr.write("No hooks found to remove.\n");
  } else {
    process.stderr.write("\nUninstalled. Code reviews will no longer trigger.\n");
  }
};
