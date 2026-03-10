import { spawn } from "node:child_process";

type ExecFn = (
  cmd: string,
  args: readonly string[],
  options?: { input?: string },
) => Promise<string>;

const defaultExec: ExecFn = (cmd, args, options) => {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, [...args], {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 120_000,
    });

    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));

    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      const stdout = Buffer.concat(chunks).toString("utf-8");
      if (code !== 0) {
        reject(new Error(`${cmd} exited with code ${code}: ${stderr}`));
      } else {
        resolve(stdout);
      }
    });

    child.on("error", reject);

    if (options?.input) {
      child.stdin.write(options.input);
      child.stdin.end();
    } else {
      child.stdin.end();
    }
  });
};

export const parseClaudeJsonResponse = (
  raw: string,
): Record<string, unknown> => {
  // Try direct parse
  try {
    return JSON.parse(raw);
  } catch {
    // continue
  }

  // Try extracting from code fence
  const fenceMatch = raw.match(/```(?:json)?\s*\n([\s\S]*?)\n```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]);
    } catch {
      // continue
    }
  }

  // Try finding first JSON object
  const objectMatch = raw.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      return JSON.parse(objectMatch[0]);
    } catch {
      // continue
    }
  }

  throw new Error(`No JSON found in response: ${raw.slice(0, 200)}`);
};

interface InvokeClaudeInput {
  readonly systemPrompt: string;
  readonly userMessage: string;
  readonly model: string;
  readonly exec?: ExecFn;
}

export const invokeClaude = async (
  input: InvokeClaudeInput,
): Promise<string> => {
  const exec = input.exec ?? defaultExec;
  const args = [
    "--print",
    "--system-prompt",
    input.systemPrompt,
    "--model",
    input.model,
    "--output-format",
    "json",
    "--no-session-persistence",
  ];

  const result = await exec("claude", args, { input: input.userMessage });
  return result;
};
