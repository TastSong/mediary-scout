import { describe, expect, it } from "vitest";
import {
  aggregateStateFromSeasons,
  seasonBadgeState,
  type AggregateSeasonInput,
} from "./title-aggregate";

function season(overrides: Partial<AggregateSeasonInput>): AggregateSeasonInput {
  return {
    tracked: true,
    status: "completed",
    obtainedCount: 0,
    latestAiredEpisode: 13,
    totalEpisodes: 13,
    ...overrides,
  };
}

describe("aggregateStateFromSeasons", () => {
  it("untracked when no season is tracked", () => {
    expect(aggregateStateFromSeasons([season({ tracked: false, status: null })])).toBe(
      "untracked",
    );
  });

  it("complete when a completed season has all aired episodes obtained", () => {
    expect(aggregateStateFromSeasons([season({ obtainedCount: 13 })])).toBe("complete");
  });

  it("complete when resource is ahead (obtained >= aired)", () => {
    // 资源超前: 12 aired, 13 obtained.
    expect(
      aggregateStateFromSeasons([
        season({ obtainedCount: 13, latestAiredEpisode: 12, totalEpisodes: 13 }),
      ]),
    ).toBe("complete");
  });

  it("tracking when an active season is caught up to aired", () => {
    expect(
      aggregateStateFromSeasons([
        season({ status: "active", obtainedCount: 5, latestAiredEpisode: 5, totalEpisodes: 13 }),
      ]),
    ).toBe("tracking");
  });

  it("partial when an active season is behind aired", () => {
    expect(
      aggregateStateFromSeasons([
        season({ status: "active", obtainedCount: 3, latestAiredEpisode: 5, totalEpisodes: 13 }),
      ]),
    ).toBe("partial");
  });

  it("partial when some seasons are untracked", () => {
    expect(
      aggregateStateFromSeasons([
        season({ obtainedCount: 13 }),
        season({ tracked: false, status: null }),
      ]),
    ).toBe("partial");
  });

  // The regression that motivated this module: a FAILED/never-materialized
  // acquisition leaves a "completed" tracked season with 0 obtained and 0
  // materialized episode states. The old aggregate relied on missingAiredCount
  // (derived only from materialized episodes), which read 0 and falsely
  // reported "complete" → 已全部入库 for a 0/13 show. Must be "partial".
  it("partial when a completed season has 0 obtained and no materialized episodes", () => {
    expect(
      aggregateStateFromSeasons([
        season({ status: "completed", obtainedCount: 0, latestAiredEpisode: 13, totalEpisodes: 13 }),
      ]),
    ).toBe("partial");
  });
});

describe("seasonBadgeState", () => {
  it("untracked when not tracked", () => {
    expect(seasonBadgeState(season({ tracked: false, status: null }))).toBe("untracked");
  });

  it("missing when a completed season has fewer obtained than aired (failed/0-materialized)", () => {
    // The season-row regression: 0/13 completed showed green 已完结 because
    // missingAiredCount read 0 from zero materialized episodes.
    expect(seasonBadgeState(season({ status: "completed", obtainedCount: 0 }))).toBe("missing");
  });

  it("missing when an active season is behind aired", () => {
    expect(
      seasonBadgeState(season({ status: "active", obtainedCount: 3, latestAiredEpisode: 5 })),
    ).toBe("missing");
  });

  it("airing when an active season is caught up to aired", () => {
    expect(
      seasonBadgeState(season({ status: "active", obtainedCount: 5, latestAiredEpisode: 5 })),
    ).toBe("airing");
  });

  it("complete when a completed season has all aired obtained", () => {
    expect(seasonBadgeState(season({ status: "completed", obtainedCount: 13 }))).toBe("complete");
  });

  it("complete when resource is ahead of aired", () => {
    expect(
      seasonBadgeState(season({ status: "completed", obtainedCount: 13, latestAiredEpisode: 12 })),
    ).toBe("complete");
  });
});
