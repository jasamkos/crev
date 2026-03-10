import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";

const execFileAsync = promisify(execFile);

const PACKAGE_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

const SKILL_FILES = ["review", "audit"] as const;
const AGENT_FILES = [
  "scout",
  "security",
  "correctness",
  "performance",
  "style",
  "api-contract",
] as const;

const MODELS = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-6",
} as const;

type ModelChoice = keyof typeof MODELS;

const DEFAULT_MODEL: ModelChoice = "sonnet";

const ask = async (question: string): Promise<string> => {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
};

const checkPrerequisite = async (
  cmd: string,
  args: string[],
  name: string,
): Promise<boolean> => {
  try {
    await execFileAsync(cmd, args);
    process.stderr.write(`  \u2713 ${name}\n`);
    return true;
  } catch {
    process.stderr.write(`  \u2717 ${name} \u2014 not found\n`);
    return false;
  }
};

export const installFiles = async (
  scope: "global" | "project",
  model: ModelChoice = DEFAULT_MODEL,
  packageRoot: string = PACKAGE_ROOT,
  home: string = homedir(),
  cwd: string = process.cwd(),
): Promise<void> => {
  const targetDir =
    scope === "global" ? join(home, ".claude") : join(cwd, ".claude");

  const skillsDir = join(targetDir, "skills");
  const agentsDir = join(targetDir, "agents");

  await mkdir(skillsDir, { recursive: true });
  await mkdir(agentsDir, { recursive: true });

  for (const name of SKILL_FILES) {
    const content = await readFile(
      join(packageRoot, "skills", `${name}.md`),
      "utf-8",
    );
    await writeFile(join(skillsDir, `crev-${name}.md`), content, "utf-8");
    process.stderr.write(`  \u2713 skills/crev-${name}.md\n`);
  }

  const modelId = MODELS[model];
  for (const name of AGENT_FILES) {
    const content = await readFile(
      join(packageRoot, "agents", `${name}.md`),
      "utf-8",
    );
    const patched = content.replace(
      /^model: .+$/m,
      `model: ${modelId}`,
    );
    await writeFile(join(agentsDir, `crev-${name}.md`), patched, "utf-8");
    process.stderr.write(`  \u2713 agents/crev-${name}.md\n`);
  }
};

const HOOK_ENTRY = {
  matcher: "Bash",
  hooks: [{ type: "command", command: "crev hook-handler", timeout: 5 }],
};

export const installHook = async (
  scope: "global" | "project",
  home: string = homedir(),
  cwd: string = process.cwd(),
): Promise<void> => {
  const settingsPath =
    scope === "global"
      ? join(home, ".claude", "settings.json")
      : join(cwd, ".claude", "settings.local.json");

  let settings: Record<string, unknown> = {};
  try {
    settings = JSON.parse(await readFile(settingsPath, "utf-8"));
  } catch {
    // File doesn't exist yet — start fresh
  }

  const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>;
  const postToolUse = (hooks.PostToolUse ?? []) as Record<string, unknown>[];

  if (postToolUse.some((h) => JSON.stringify(h).includes("crev"))) {
    process.stderr.write(`  \u2713 hook (already installed)\n`);
    return;
  }

  const updated = {
    ...settings,
    hooks: { ...hooks, PostToolUse: [...postToolUse, HOOK_ENTRY] },
  };

  await mkdir(dirname(settingsPath), { recursive: true });
  await writeFile(
    settingsPath,
    JSON.stringify(updated, null, 2) + "\n",
    "utf-8",
  );
  process.stderr.write(`  \u2713 hook \u2192 ${settingsPath}\n`);
};

interface InitOptions {
  readonly global?: boolean;
  readonly project?: boolean;
}

export const runInitCommand = async (
  options: InitOptions = {},
): Promise<void> => {
  process.stderr.write("crev \u2014 Setup\n\n");

  process.stderr.write("Checking prerequisites:\n");
  const claudeOk = await checkPrerequisite(
    "claude",
    ["--version"],
    "claude CLI",
  );

  if (!claudeOk) {
    process.stderr.write(
      "\nMissing prerequisites. Install the claude CLI first.\n",
    );
    process.exit(1);
  }

  // Scope
  let scope: "global" | "project";
  if (options.global) {
    scope = "global";
  } else if (options.project) {
    scope = "project";
  } else {
    process.stderr.write("\nWhere should skills and agents be installed?\n");
    process.stderr.write(
      "  [1] Global \u2014 available in all projects (~/.claude/)\n",
    );
    process.stderr.write(
      "  [2] This project \u2014 available here only (.claude/)\n",
    );
    const answer = await ask("\nChoice [1/2]: ");
    scope = answer === "2" ? "project" : "global";
  }

  // Model
  process.stderr.write("\nWhich model should reviewers use?\n");
  process.stderr.write(
    "  [1] Haiku  \u2014 faster and cheaper (~$0.01 per review)\n",
  );
  process.stderr.write(
    "  [2] Sonnet \u2014 balanced quality and cost (~$0.10 per review) [default]\n",
  );
  process.stderr.write(
    "  [3] Opus   \u2014 deepest analysis (~$0.50 per review)\n",
  );
  const modelAnswer = await ask("\nChoice [1/2/3]: ");
  const model: ModelChoice =
    modelAnswer === "1" ? "haiku" : modelAnswer === "3" ? "opus" : "sonnet";

  // Auto-trigger
  process.stderr.write(
    "\nAuto-review on \`git push\`? Reviews run in the background and save to reviews/\n",
  );
  const hookAnswer = await ask("Enable [Y/n]: ");
  const enableHook = hookAnswer.toLowerCase() !== "n";

  // Install
  process.stderr.write("\nInstalling:\n");
  await installFiles(scope, model);
  if (enableHook) {
    await installHook(scope);
  }

  const location = scope === "global" ? "~/.claude/" : ".claude/";
  const hookNote = enableHook
    ? "Reviews trigger automatically on `git push`."
    : "Auto-trigger disabled. Run /crev:review manually.";
  process.stderr.write(
    `\nInstalled to ${location} (model: ${model})\n${hookNote}\n`,
  );
};
