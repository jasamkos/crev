#!/usr/bin/env node

import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const usage = `crev \u2014 Code review with Claude

Usage:
  crev review                         Review local branch changes (default)
  crev review --pr <url>              Review a GitHub PR
  crev init [--global | --project]    Install the hook
  crev uninstall                      Remove hooks and config
  crev hook-handler                   (internal) Called by hook, reads stdin

Options:
  --pr <url>        GitHub PR URL (omit for local branch review)
  --global          Install hook globally
  --project         Install hook for current project only
  -h, --help        Show this help
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
    const stdout: string = data.tool_result?.stdout ?? "";

    // Only trigger on gh pr create
    if (!command.includes("gh pr create")) {
      return;
    }

    // Extract PR URL from command output
    const prUrlMatch = stdout.match(/https:\/\/github\.com\/[^\s]+\/pull\/\d+/);
    if (!prUrlMatch) return;

    const prUrl = prUrlMatch[0];

    // Spawn review as fully detached background process
    const { spawn } = await import("node:child_process");
    const child = spawn(
      process.execPath,
      [fileURLToPath(import.meta.url), "review", "--pr", prUrl],
      {
        detached: true,
        stdio: "ignore",
      },
    );
    child.unref();

    process.stderr.write(`[crev] Review triggered for ${prUrl}\n`);
  } catch {
    // Hook should never block Claude — fail silently
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

    case "review": {
      const { values } = parseArgs({
        args: process.argv.slice(3),
        options: {
          pr: { type: "string", short: "p" },
        },
      });
      const { runReviewCommand } = await import("../src/commands/review.js");
      await runReviewCommand({ prUrl: values.pr });
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
