import { unlink, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const SKILL_FILES = ["review", "audit"] as const;
const AGENT_FILES = [
  "scout",
  "security",
  "correctness",
  "performance",
  "style",
  "api-contract",
] as const;

const tryRemove = async (path: string): Promise<boolean> => {
  try {
    await unlink(path);
    return true;
  } catch {
    return false;
  }
};

export const removeFiles = async (
  scope: "global" | "project",
  home: string = homedir(),
  cwd: string = process.cwd(),
): Promise<void> => {
  const targetDir =
    scope === "global" ? join(home, ".claude") : join(cwd, ".claude");

  for (const name of SKILL_FILES) {
    await tryRemove(join(targetDir, "skills", `crev-${name}.md`));
  }
  for (const name of AGENT_FILES) {
    await tryRemove(join(targetDir, "agents", `crev-${name}.md`));
  }
};

const removeStaleHook = async (settingsPath: string): Promise<boolean> => {
  try {
    const raw = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(raw) as Record<string, unknown>;
    const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;
    const postToolUse = (hooks.PostToolUse ?? []) as Record<string, unknown>[];
    const filtered = postToolUse.filter((h) => !JSON.stringify(h).includes("crev"));
    if (filtered.length === postToolUse.length) return false;
    const updated = { ...settings, hooks: { ...hooks, PostToolUse: filtered } };
    await writeFile(settingsPath, JSON.stringify(updated, null, 2) + "\n", "utf-8");
    return true;
  } catch {
    return false;
  }
};

export const runUninstallCommand = async (): Promise<void> => {
  process.stderr.write("crev \u2014 Uninstall\n\n");

  let removed = false;

  // Remove stale v0.1 PostToolUse hooks (migration from hook-based install)
  const globalSettings = join(homedir(), ".claude", "settings.json");
  const projectSettings = join(process.cwd(), ".claude", "settings.local.json");
  for (const path of [globalSettings, projectSettings]) {
    if (await removeStaleHook(path)) {
      process.stderr.write(`Removed stale hook from ${path}\n`);
      removed = true;
    }
  }

  for (const scope of ["global", "project"] as const) {
    const targetDir =
      scope === "global"
        ? join(homedir(), ".claude")
        : join(process.cwd(), ".claude");

    for (const name of SKILL_FILES) {
      const path = join(targetDir, "skills", `crev-${name}.md`);
      if (await tryRemove(path)) {
        process.stderr.write(`Removed ${path}\n`);
        removed = true;
      }
    }
    for (const name of AGENT_FILES) {
      const path = join(targetDir, "agents", `crev-${name}.md`);
      if (await tryRemove(path)) {
        process.stderr.write(`Removed ${path}\n`);
        removed = true;
      }
    }
  }

  if (!removed) {
    process.stderr.write("Nothing to remove.\n");
  } else {
    process.stderr.write("\nUninstalled.\n");
  }
};
