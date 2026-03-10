import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { createInterface } from "node:readline";
import { DEFAULT_CONFIG } from "../types.js";

const execFileAsync = promisify(execFile);

const ask = async (question: string): Promise<string> => {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
};

const checkPrerequisite = async (cmd: string, args: string[], name: string): Promise<boolean> => {
  try {
    await execFileAsync(cmd, args);
    process.stderr.write(`  \u2713 ${name}\n`);
    return true;
  } catch {
    process.stderr.write(`  \u2717 ${name} \u2014 not found or not authenticated\n`);
    return false;
  }
};

const readJsonFile = async (path: string): Promise<Record<string, unknown>> => {
  try {
    const raw = await readFile(path, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
};

const writeJsonFile = async (path: string, data: Record<string, unknown>): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
};

const HOOK_ENTRY = {
  matcher: "Bash",
  hooks: [
    {
      type: "command",
      command: "crev hook-handler",
      timeout: 5,
    },
  ],
};

const addHookToSettings = async (settingsPath: string): Promise<void> => {
  const settings = await readJsonFile(settingsPath);
  const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;
  const postToolUse = (hooks.PostToolUse ?? []) as Record<string, unknown>[];

  const alreadyInstalled = postToolUse.some(
    (h) => JSON.stringify(h).includes("crev"),
  );
  if (alreadyInstalled) {
    process.stderr.write("Hook already installed.\n");
    return;
  }

  const updatedPostToolUse = [...postToolUse, HOOK_ENTRY];
  const updatedSettings = {
    ...settings,
    hooks: { ...hooks, PostToolUse: updatedPostToolUse },
  };
  await writeJsonFile(settingsPath, updatedSettings);
};

interface InitOptions {
  readonly global?: boolean;
  readonly project?: boolean;
}

export const runInitCommand = async (options: InitOptions = {}): Promise<void> => {
  process.stderr.write("crev \u2014 Setup\n\n");

  // Check prerequisites
  process.stderr.write("Checking prerequisites:\n");
  const ghOk = await checkPrerequisite("gh", ["auth", "status"], "gh CLI (authenticated)");
  const claudeOk = await checkPrerequisite("claude", ["--version"], "claude CLI");

  if (!ghOk || !claudeOk) {
    process.stderr.write("\nMissing prerequisites. Please install and configure the tools above.\n");
    process.exit(1);
  }

  // Determine scope
  let scope: "global" | "project";
  if (options.global) {
    scope = "global";
  } else if (options.project) {
    scope = "project";
  } else {
    process.stderr.write("\nWhere should the hook be installed?\n");
    process.stderr.write("  [1] Global \u2014 triggers for all repos (~/.claude/settings.json)\n");
    process.stderr.write("  [2] This project \u2014 triggers only here (.claude/settings.local.json)\n");
    const answer = await ask("\nChoice [1/2]: ");
    scope = answer === "2" ? "project" : "global";
  }

  // Install hook
  const settingsPath =
    scope === "global"
      ? join(homedir(), ".claude", "settings.json")
      : join(process.cwd(), ".claude", "settings.local.json");

  process.stderr.write(`\nInstalling hook to ${settingsPath}...\n`);
  await addHookToSettings(settingsPath);

  // Write default config
  const configPath =
    scope === "global"
      ? join(homedir(), ".config", "crev", "config.json")
      : join(process.cwd(), ".claude", "code-review.json");

  process.stderr.write(`Writing default config to ${configPath}...\n`);
  await writeJsonFile(configPath, DEFAULT_CONFIG as unknown as Record<string, unknown>);

  process.stderr.write(`\nInstalled (${scope}). Code reviews will trigger automatically on PR creation.\n`);
  process.stderr.write(`Edit ${configPath} to customize behavior.\n`);
};
