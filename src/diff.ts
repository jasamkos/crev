import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { PrMetadata, ChangedFile, FileChangeType } from "./types.js";

const execFileAsync = promisify(execFile);

export interface PrRef {
  readonly owner: string;
  readonly repo: string;
  readonly number: number;
}

type ExecFn = (cmd: string, args: readonly string[]) => Promise<string>;

const defaultExec: ExecFn = async (cmd, args) => {
  const { stdout } = await execFileAsync(cmd, [...args]);
  return stdout;
};

const PR_URL_PATTERN = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/;

export const parsePrUrl = (url: string): PrRef => {
  const match = url.match(PR_URL_PATTERN);
  if (!match) {
    throw new Error(`Invalid PR URL: ${url}`);
  }
  return {
    owner: match[1],
    repo: match[2],
    number: parseInt(match[3], 10),
  };
};

export const fetchDiff = async (
  pr: PrRef,
  exec: ExecFn = defaultExec,
): Promise<string> => {
  const diff = await exec("gh", [
    "pr", "diff", String(pr.number), "--repo", `${pr.owner}/${pr.repo}`,
  ]);
  if (!diff.trim()) {
    throw new Error("Empty diff returned from PR");
  }
  return diff;
};

const STATUS_MAP: Record<string, FileChangeType> = {
  added: "added",
  removed: "deleted",
  modified: "modified",
  renamed: "renamed",
  copied: "added",
  changed: "modified",
};

const toChangeType = (status: string): FileChangeType =>
  STATUS_MAP[status] ?? "modified";

export const fetchPrMetadata = async (
  pr: PrRef,
  prUrl: string,
  exec: ExecFn = defaultExec,
): Promise<PrMetadata> => {
  const raw = await exec("gh", [
    "pr", "view", String(pr.number),
    "--repo", `${pr.owner}/${pr.repo}`,
    "--json", "title,author,headRefName,baseRefName,additions,deletions,files",
  ]);
  const data = JSON.parse(raw);
  return {
    url: prUrl,
    title: data.title,
    author: data.author.login,
    branch: data.headRefName,
    baseBranch: data.baseRefName,
    totalAdditions: data.additions,
    totalDeletions: data.deletions,
    changedFiles: (data.files ?? []).map(
      (f: { path: string; status: string; additions: number; deletions: number }) => ({
        path: f.path,
        changeType: toChangeType(f.status),
        additions: f.additions,
        deletions: f.deletions,
      }),
    ),
  };
};
