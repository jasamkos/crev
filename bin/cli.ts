#!/usr/bin/env node

import { parseArgs } from "node:util";

const usage = `crev \u2014 Code review skills for Claude Code

Usage:
  crev init [--global | --project]    Install /crev:review and /crev:audit skills + hook
  crev uninstall                      Remove installed skills, agents, and hook

Options:
  --global          Install to ~/.claude/ (all projects)
  --project         Install to .claude/ (this project only)
  -h, --help        Show this help

After install, use inside Claude Code:
  /crev:review      Review current branch before pushing
  /crev:audit       Review existing files or directories

Reviews also trigger automatically when you run \`gh pr create\`.
`;

const readStdin = async (): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf-8");
};

const handleHook = async (): Promise<void> => {
  try {
    const input = await readStdin();
    const data = JSON.parse(input);
    const command: string = data.tool_input?.command ?? "";

    if (!command.includes("gh pr create") && !command.includes("git push"))
      return;

    const { spawn } = await import("node:child_process");
    const child = spawn(
      "claude",
      ["--dangerously-skip-permissions", "-p", "/crev:review"],
      { detached: true, stdio: "ignore" },
    );
    child.unref();

    process.stderr.write("[crev] Review started in background\n");
  } catch {
    // Never block Claude — fail silently
  }
};

const main = async (): Promise<void> => {
  const subcommand = process.argv[2];

  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    process.stderr.write(usage);
    return;
  }

  switch (subcommand) {
    case "init": {
      const { values } = parseArgs({
        args: process.argv.slice(3),
        options: {
          global: { type: "boolean", default: false },
          project: { type: "boolean", default: false },
        },
      });
      const { runInitCommand } = await import("../src/commands/init.js");
      await runInitCommand({ global: values.global, project: values.project });
      break;
    }

    case "uninstall": {
      const { runUninstallCommand } =
        await import("../src/commands/uninstall.js");
      await runUninstallCommand();
      break;
    }

    case "hook-handler": {
      await handleHook();
      break;
    }

    default: {
      process.stderr.write(`Unknown command: ${subcommand}\n\n`);
      process.stderr.write(usage);
      process.exit(1);
    }
  }
};

main().catch((error) => {
  process.stderr.write(
    `[crev] Fatal: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
