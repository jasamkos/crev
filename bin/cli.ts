#!/usr/bin/env node

import { parseArgs } from "node:util";

const usage = `crev \u2014 Code review skills for Claude Code

Usage:
  crev init [--global | --project]    Install /crev:review and /crev:audit skills
  crev uninstall                      Remove installed skills and agents

Options:
  --global          Install to ~/.claude/ (all projects)
  --project         Install to .claude/ (this project only)
  -h, --help        Show this help

After install, use inside Claude Code:
  /crev:review      Review current branch before pushing
  /crev:audit       Review existing files or directories
`;

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
      const { runUninstallCommand } = await import(
        "../src/commands/uninstall.js"
      );
      await runUninstallCommand();
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
