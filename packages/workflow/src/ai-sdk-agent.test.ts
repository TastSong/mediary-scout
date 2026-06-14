import { describe, expect, it } from "vitest";
import { VercelAiAgentNodes } from "./ai-sdk-agent.js";
import { MAX_DISTINCT_PLANNING_SEARCHES } from "./planning-search-gate.js";
import type { ResourceSnapshot } from "./domain.js";

function snapshot(keyword: string, index: number): ResourceSnapshot {
  return {
    id: `snap-${index}`,
    provider: "pansou",
    keyword,
    candidates: [],
    createdAt: "2026-06-14T00:00:00.000Z",
  };
}

describe("planAcquisition search guardrails (integration through the real gate)", () => {
  it("caps distinct provider searches and dedups repeated keywords", async () => {
    const providerKeywords: string[] = [];
    const searchResources = async ({ keyword }: { keyword: string }): Promise<ResourceSnapshot> => {
      providerKeywords.push(keyword);
      return snapshot(keyword, providerKeywords.length);
    };

    // A thrashing "model": 10 distinct keywords (exceeds the budget of 8) plus
    // two repeats of the first (one with different case/whitespace).
    const toolOutputs: Array<Record<string, unknown>> = [];
    const fakeExecutor = async (request: {
      tools: { searchResources: { execute: (i: { keyword: string }) => Promise<unknown> } };
    }) => {
      const search = request.tools.searchResources.execute;
      for (let i = 0; i < 10; i++) {
        toolOutputs.push((await search({ keyword: `k${i}` })) as Record<string, unknown>);
      }
      toolOutputs.push((await search({ keyword: "k0" })) as Record<string, unknown>);
      toolOutputs.push((await search({ keyword: "  K0 " })) as Record<string, unknown>);
      return {
        selectedSnapshotId: null,
        searchedKeywords: ["k0"],
        candidateDispositions: [],
        confidence: "low" as const,
        reason: "test",
      };
    };

    const nodes = new VercelAiAgentNodes({
      generateStructuredOutput: fakeExecutor as never,
    });
    const result = await nodes.planAcquisition({
      title: "T",
      aliases: [],
      seasons: [{ seasonNumber: 1, totalEpisodes: 12, latestAiredEpisode: 12 }],
      qualityPreference: "1080p",
      missingEpisodes: ["S01E01"],
      initialKeyword: "k0",
      failureEvidence: [],
      searchResources,
    });

    // The provider is hit ONLY for distinct keywords, capped at the budget —
    // not the 12 raw search calls the model issued.
    expect(providerKeywords).toHaveLength(MAX_DISTINCT_PLANNING_SEARCHES);
    // The over-budget distinct keywords (k8, k9) were refused with an error.
    const errors = toolOutputs.filter((output) => typeof output.error === "string");
    expect(errors).toHaveLength(10 - MAX_DISTINCT_PLANNING_SEARCHES);
    // Both repeats of k0 (incl. the case/whitespace variant) deduped to a note,
    // never reaching the provider.
    const notes = toolOutputs.filter((output) => typeof output.note === "string");
    expect(notes).toHaveLength(2);
    expect(providerKeywords.filter((keyword) => keyword === "k0")).toHaveLength(1);
    // Snapshots collected reflect only the real provider hits.
    expect(result.snapshots).toHaveLength(MAX_DISTINCT_PLANNING_SEARCHES);
  });
});
