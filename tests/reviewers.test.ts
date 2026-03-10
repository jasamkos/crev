import { describe, it, expect } from "vitest";
import { SPECIALISTS } from "../src/reviewers.js";

describe("SPECIALISTS", () => {
  it("defines exactly 5 reviewers", () => {
    expect(SPECIALISTS).toHaveLength(5);
  });

  it("each has name, scope, and systemPrompt", () => {
    for (const r of SPECIALISTS) {
      expect(r.name).toBeTruthy();
      expect(r.scope).toBeTruthy();
      expect(r.systemPrompt).toBeTruthy();
    }
  });

  it("names are unique", () => {
    const names = SPECIALISTS.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("none are named Scout (reserved)", () => {
    expect(SPECIALISTS.find((r) => r.name === "Scout")).toBeUndefined();
  });

  it("security reviewer includes OWASP references", () => {
    const security = SPECIALISTS.find((r) => r.name === "Security");
    expect(security?.systemPrompt).toContain("OWASP");
    expect(security?.systemPrompt).toContain("A03:2021");
  });

  it("all include the JSON response format", () => {
    for (const r of SPECIALISTS) {
      expect(r.systemPrompt).toContain('"findings"');
      expect(r.systemPrompt).toContain('"summary"');
    }
  });
});
