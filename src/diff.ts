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

export const detectBaseBranch = async (
  exec: ExecFn = defaultExec,
): Promise<string> => {
  for (const candidate of ["main", "master"]) {
    try {
      await exec("git", ["rev-parse", "--verify", candidate]);
      return candidate;
    } catch {
      continue;
    }
  }
  throw new Error("Could not detect base branch (tried main, master)");
};

export const fetchLocalDiff = async (
  baseBranch: string,
  exec: ExecFn = defaultExec,
): Promise<string> => {
  const diff = await exec("git", ["diff", `${baseBranch}...HEAD`]);
  if (!diff.trim()) {
    throw new Error(`No changes found compared to ${baseBranch}`);
  }
  return diff;
};

interface DiffStatLine {
  readonly path: string;
  readonly additions: number;
  readonly deletions: number;
}

const parseDiffNumstat = (raw: string): readonly DiffStatLine[] =>
  raw
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const [add, del, ...pathParts] = line.split("\t");
      return {
        path: pathParts.join("\t"),
        additions: parseInt(add, 10) || 0,
        deletions: parseInt(del, 10) || 0,
      };
    });

export const fetchLocalMetadata = async (
  baseBranch: string,
  exec: ExecFn = defaultExec,
): Promise<PrMetadata> => {
  const [branch, author, numstat, logSubject] = await Promise.all([
    exec("git", ["rev-parse", "--abbrev-ref", "HEAD"]),
    exec("git", ["config", "user.name"]),
    exec("git", ["diff", "--numstat", `${baseBranch}...HEAD`]),
    exec("git", ["log", "--format=%s", "-1"]),
  ]);

  const stats = parseDiffNumstat(numstat);
  const totalAdditions = stats.reduce((sum, s) => sum + s.additions, 0);
  const totalDeletions = stats.reduce((sum, s) => sum + s.deletions, 0);

  const changedFiles: readonly ChangedFile[] = stats.map((s) => ({
    path: s.path,
    changeType: "modified" as FileChangeType,
    additions: s.additions,
    deletions: s.deletions,
  }));

  return {
    url: "",
    title: logSubject.trim() || branch.trim(),
    author: author.trim(),
    branch: branch.trim(),
    baseBranch: baseBranch,
    totalAdditions,
    totalDeletions,
    changedFiles,
  };
};

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
    "pr",
    "diff",
    String(pr.number),
    "--repo",
    `${pr.owner}/${pr.repo}`,
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
    "pr",
    "view",
    String(pr.number),
    "--repo",
    `${pr.owner}/${pr.repo}`,
    "--json",
    "title,author,headRefName,baseRefName,additions,deletions,files",
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
      (f: {
        path: string;
        status: string;
        additions: number;
        deletions: number;
      }) => ({
        path: f.path,
        changeType: toChangeType(f.status),
        additions: f.additions,
        deletions: f.deletions,
      }),
    ),
  };
};
