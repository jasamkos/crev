export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type FileChangeType = "added" | "modified" | "deleted" | "renamed";

export interface ChangedFile {
  readonly path: string;
  readonly changeType: FileChangeType;
  readonly additions: number;
  readonly deletions: number;
}

export interface PrMetadata {
  readonly url: string;
  readonly title: string;
  readonly author: string;
  readonly branch: string;
  readonly baseBranch: string;
  readonly totalAdditions: number;
  readonly totalDeletions: number;
  readonly changedFiles: readonly ChangedFile[];
}

export interface Finding {
  readonly severity: Severity;
  readonly reviewer: string;
  readonly file: string;
  readonly line: number | null;
  readonly title: string;
  readonly description: string;
  readonly suggestion: string | null;
}

export interface ReviewResult {
  readonly reviewer: string;
  readonly findings: readonly Finding[];
  readonly summary: string;
}

export interface ScoutResult extends ReviewResult {
  readonly escalate: boolean;
  readonly escalateReason: string | null;
}

export interface AggregatedReview {
  readonly prUrl: string;
  readonly prTitle: string;
  readonly findings: readonly Finding[];
  readonly summary: string;
  readonly reviewerSummaries: readonly {
    readonly reviewer: string;
    readonly summary: string;
  }[];
  readonly stats: {
    readonly critical: number;
    readonly high: number;
    readonly medium: number;
    readonly low: number;
    readonly info: number;
    readonly total: number;
  };
  readonly wasEscalated: boolean;
}

export interface ReviewerConfig {
  readonly name: string;
  readonly scope: string;
  readonly systemPrompt: string;
}

export interface PluginConfig {
  readonly output: {
    readonly local: boolean;
    readonly localDir: string;
    readonly githubIssue: boolean;
    readonly githubIssueLabels: readonly string[];
  };
  readonly scout: {
    readonly model: string;
  };
  readonly specialists: {
    readonly model: string;
  };
}

export const DEFAULT_CONFIG: PluginConfig = {
  output: {
    local: true,
    localDir: "reviews",
    githubIssue: false,
    githubIssueLabels: ["code-review"],
  },
  scout: {
    model: "sonnet",
  },
  specialists: {
    model: "sonnet",
  },
};
