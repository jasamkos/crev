import { describe, it, expect } from "vitest";
import { aggregateReviews } from "../src/aggregator.js";
import type { ScoutResult, ReviewResult } from "../src/types.js";

const makeScout = (): ScoutResult => ({
  reviewer: "Scout",
  findings: [
    { severity: "critical", reviewer: "Scout", file: "auth.ts", line: 10, title: "SQL injection", description: "Unparameterized", suggestion: "Use prepared statement" },
  ],
  summary: "Found injection issue",
  escalate: true,
  escalateReason: "Security changes",
});

const makeSpecialists = (): readonly ReviewResult[] => [
  {
    reviewer: "Security",
    findings: [
      { severity: "critical", reviewer: "Security", file: "auth.ts", line: 10, title: "SQL injection", description: "Unparameterized query", suggestion: "Use prepared statement" },
      { severity: "low", reviewer: "Security", file: "utils.ts", line: 5, title: "Weak hash", description: "Using MD5", suggestion: "Use SHA-256" },
    ],
    summary: "Found injection vulnerability",
  },
  {
    reviewer: "Correctness",
    findings: [
      { severity: "high", reviewer: "Correctness", file: "auth.ts", line: 12, title: "Missing null check", description: "User could be null", suggestion: "Add guard" },
    ],
    summary: "One null safety issue",
  },
  {
    reviewer: "Performance",
    findings: [],
    summary: "No performance issues",
  },
];

describe("aggregateReviews", () => {
  it("sorts findings by severity (critical first)", () => {
    const result = aggregateReviews("https://github.com/org/repo/pull/5", "feat: auth", makeScout(), makeSpecialists());
    expect(result.findings[0].severity).toBe("critical");
  });

  it("deduplicates findings on same file+line+title", () => {
    const result = aggregateReviews("url", "title", makeScout(), makeSpecialists());
    const sqlFindings = result.findings.filter((f) => f.title === "SQL injection");
    expect(sqlFindings).toHaveLength(1);
  });

  it("counts findings by severity", () => {
    const result = aggregateReviews("url", "title", makeScout(), makeSpecialists());
    expect(result.stats.critical).toBe(1);
    expect(result.stats.high).toBe(1);
    expect(result.stats.low).toBe(1);
  });

  it("includes all reviewer summaries", () => {
    const result = aggregateReviews("url", "title", makeScout(), makeSpecialists());
    expect(result.reviewerSummaries.length).toBeGreaterThanOrEqual(4);
  });

  it("works with scout-only (no specialists)", () => {
    const result = aggregateReviews("url", "title", makeScout(), []);
    expect(result.findings).toHaveLength(1);
    expect(result.wasEscalated).toBe(false);
  });

  it("handles empty everything", () => {
    const emptyScout: ScoutResult = {
      reviewer: "Scout",
      findings: [],
      summary: "Clean",
      escalate: false,
      escalateReason: null,
    };
    const result = aggregateReviews("url", "title", emptyScout, []);
    expect(result.stats.total).toBe(0);
  });
});
