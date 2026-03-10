import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type ExecFn = (
  cmd: string,
  args: readonly string[],
  options?: { input?: string },
) => Promise<string>;

const defaultExec: ExecFn = async (cmd, args, options) => {
  const { stdout } = await execFileAsync(cmd, [...args], {
    input: options?.input,
    maxBuffer: 10 * 1024 * 1024,
    timeout: 120_000,
  });
  return stdout;
};

export const parseClaudeJsonResponse = (raw: string): Record<string, unknown> => {
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
