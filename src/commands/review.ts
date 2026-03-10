import {
  parsePrUrl,
  fetchDiff,
  fetchPrMetadata,
  detectBaseBranch,
  fetchLocalDiff,
  fetchLocalMetadata,
} from "../diff.js";
import { invokeClaude } from "../claude.js";
import { runScout } from "../scout.js";
import { SPECIALISTS } from "../reviewers.js";
import { runSpecialists } from "../runner.js";
import { aggregateReviews } from "../aggregator.js";
import { writeLocalReport, createGithubIssue } from "../output.js";
import { loadConfig } from "../config.js";
import type { PluginConfig, PrMetadata, ReviewResult } from "../types.js";

const log = (msg: string): void => {
  process.stderr.write(`[crev] ${msg}\n`);
};

const makeInvokeFn = () => {
  return async (
    systemPrompt: string,
    userMessage: string,
    model: string,
  ): Promise<string> => {
    return invokeClaude({ systemPrompt, userMessage, model });
  };
};

interface ReviewCommandInput {
  readonly prUrl?: string;
  readonly configOverride?: Partial<PluginConfig>;
}

const fetchFromPr = async (
  prUrl: string,
): Promise<{ diff: string; metadata: PrMetadata }> => {
  const prRef = parsePrUrl(prUrl);
  log(`Reviewing ${prRef.owner}/${prRef.repo}#${prRef.number}`);
  const [diff, metadata] = await Promise.all([
    fetchDiff(prRef),
    fetchPrMetadata(prRef, prUrl),
  ]);
  return { diff, metadata };
};

const fetchFromLocal = async (): Promise<{
  diff: string;
  metadata: PrMetadata;
}> => {
  const baseBranch = await detectBaseBranch();
  log(`Reviewing local changes against ${baseBranch}`);
  const [diff, metadata] = await Promise.all([
    fetchLocalDiff(baseBranch),
    fetchLocalMetadata(baseBranch),
  ]);
  return { diff, metadata };
};

export const runReviewCommand = async (
  input: ReviewCommandInput,
): Promise<void> => {
  const config = await loadConfig();
  const mergedConfig = input.configOverride
    ? { ...config, ...input.configOverride }
    : config;

  const { diff, metadata } = input.prUrl
    ? await fetchFromPr(input.prUrl)
    : await fetchFromLocal();

  log(`Diff: ${diff.length} chars, ${metadata.changedFiles.length} files`);

  const invoke = makeInvokeFn();

  // Phase 1: Scout
  log("Running scout agent...");
  const scoutResult = await runScout({
    diff,
    metadata,
    model: mergedConfig.scout.model,
    invoke,
    escalation: mergedConfig.scout.escalation,
    minLinesForEscalation: mergedConfig.scout.minLinesForEscalation,
  });
  log(
    `Scout: ${scoutResult.findings.length} findings, escalate=${scoutResult.escalate}`,
  );
  if (scoutResult.escalateReason) {
    log(`Escalation reason: ${scoutResult.escalateReason}`);
  }

  // Phase 2: Specialists (only if scout escalates)
  let specialistResults: readonly ReviewResult[] = [];
  if (scoutResult.escalate) {
    log(`Launching ${SPECIALISTS.length} specialist reviewers...`);
    specialistResults = await runSpecialists({
      diff,
      metadata,
      model: mergedConfig.specialists.model,
      reviewers: SPECIALISTS,
      invoke,
    });
    const totalFindings = specialistResults.reduce(
      (sum, r) => sum + r.findings.length,
      0,
    );
    log(
      `Specialists: ${totalFindings} findings across ${SPECIALISTS.length} reviewers`,
    );
  }

  // Phase 3: Aggregate
  const aggregated = aggregateReviews(
    metadata.url,
    metadata.title,
    scoutResult,
    specialistResults,
  );
  log(`Total: ${aggregated.stats.total} unique findings`);

  // Phase 4: Output
  if (mergedConfig.output.local) {
    const path = await writeLocalReport(
      aggregated,
      mergedConfig.output.localDir,
    );
    log(`Local report: ${path}`);
  }

  if (mergedConfig.output.githubIssue && aggregated.stats.total > 0 && input.prUrl) {
    const prRef = parsePrUrl(input.prUrl);
    try {
      const issueUrl = await createGithubIssue(
        aggregated,
        prRef,
        mergedConfig.output.githubIssueLabels,
      );
      log(`GitHub issue: ${issueUrl}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      log(`Failed to create GitHub issue: ${msg}`);
    }
  }

  log("Done.");
};
