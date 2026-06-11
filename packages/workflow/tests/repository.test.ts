import { describe, expect, it } from "vitest";
import {
  episodeCode,
  InMemoryWorkflowRepository,
  type AgentDecision,
  type EpisodeState,
  type MediaTitle,
  type NotificationEvent,
  type ResourceSnapshot,
  type TrackedSeason,
  type TransferAttempt,
  type WorkflowRun,
} from "../src/index.js";

describe("InMemoryWorkflowRepository", () => {
  it("persists a complete workflow run snapshot and returns defensive copies", async () => {
    const repository = new InMemoryWorkflowRepository();
    const snapshot = workflowPersistenceFixture();

    await repository.saveWorkflowRunSnapshot(snapshot);
    snapshot.episodes[0]!.obtained = false;
    snapshot.resourceSnapshots[0]!.candidates[0]!.title = "mutated outside repository";

    const loaded = await repository.getWorkflowRunSnapshot("run_1");

    expect(loaded).toMatchObject({
      title: { id: "title_1" },
      season: { id: "season_1" },
      workflowRun: { id: "run_1", status: "succeeded" },
      obtainedEpisodes: ["S01E01"],
      providerAheadEpisodes: [],
    });
    expect(loaded?.episodes.find((episode) => episode.episodeCode === "S01E01")).toMatchObject({
      obtained: true,
      verifiedFileIds: ["file_1"],
    });
    expect(loaded?.resourceSnapshots[0]?.candidates[0]?.title).toBe("Show S01E01");

    loaded!.episodes[0]!.obtained = false;
    const loadedAgain = await repository.getWorkflowRunSnapshot("run_1");

    expect(loadedAgain?.episodes[0]).toMatchObject({
      episodeCode: "S01E01",
      obtained: true,
    });
  });

  it("rejects inconsistent workflow snapshots before mutating stored state", async () => {
    const repository = new InMemoryWorkflowRepository();
    const validSnapshot = workflowPersistenceFixture();
    await repository.saveWorkflowRunSnapshot(validSnapshot);

    const invalidSnapshot = workflowPersistenceFixture({
      workflowRun: {
        ...validSnapshot.workflowRun,
        status: "failed",
      },
      decisions: [
        {
          ...validSnapshot.decisions[0]!,
          selectedCandidateIds: ["snapshot_99_candidate_1"],
        },
      ],
    });

    await expect(repository.saveWorkflowRunSnapshot(invalidSnapshot)).rejects.toThrow(
      "Agent decision referenced candidates outside persisted resource snapshots",
    );

    const loaded = await repository.getWorkflowRunSnapshot("run_1");
    expect(loaded?.workflowRun.status).toBe("succeeded");
    expect(loaded?.decisions[0]?.selectedCandidateIds).toEqual(["snapshot_1_candidate_1"]);
  });

  it("lists stored episode state for a tracked season", async () => {
    const repository = new InMemoryWorkflowRepository();
    const snapshot = workflowPersistenceFixture();

    await repository.saveWorkflowRunSnapshot(snapshot);

    await expect(repository.listEpisodeStates("season_1")).resolves.toEqual(snapshot.episodes);
    await expect(repository.listEpisodeStates("missing_season")).resolves.toEqual([]);
  });
});

function workflowPersistenceFixture(
  overrides: Partial<{
    title: MediaTitle;
    season: TrackedSeason;
    workflowRun: WorkflowRun;
    episodes: EpisodeState[];
    resourceSnapshots: ResourceSnapshot[];
    decisions: AgentDecision[];
    transferAttempts: TransferAttempt[];
    notifications: NotificationEvent[];
  }> = {},
) {
  const title: MediaTitle = {
    id: "title_1",
    tmdbId: 100,
    type: "tv",
    title: "Show",
    originalTitle: "Show",
    year: 2026,
    aliases: [],
  };
  const season: TrackedSeason = {
    id: "season_1",
    mediaTitleId: title.id,
    seasonNumber: 1,
    status: "active",
    qualityPreference: "4K",
    storageDirectoryId: "dir_1",
    totalEpisodes: 2,
    latestAiredEpisode: 1,
    latestAiredSource: "metadata",
  };
  const workflowRun: WorkflowRun = {
    id: "run_1",
    kind: "type2_init",
    status: "succeeded",
    trackedSeasonId: season.id,
    startedAt: "2026-06-11T00:00:00.000Z",
    finishedAt: "2026-06-11T00:01:00.000Z",
    auditEvents: [
      {
        type: "resource_snapshot_created",
        message: "Created resource snapshot snapshot_1",
      },
    ],
  };
  const episodes: EpisodeState[] = [
    {
      trackedSeasonId: season.id,
      episodeCode: episodeCode(1, 1),
      airDate: null,
      title: "Episode 1",
      airStatus: "aired",
      obtained: true,
      metadataStatus: "confirmed",
      verifiedFileIds: ["file_1"],
    },
    {
      trackedSeasonId: season.id,
      episodeCode: episodeCode(1, 2),
      airDate: null,
      title: "Episode 2",
      airStatus: "unaired",
      obtained: false,
      metadataStatus: "confirmed",
      verifiedFileIds: [],
    },
  ];
  const resourceSnapshots: ResourceSnapshot[] = [
    {
      id: "snapshot_1",
      provider: "fake",
      keyword: "Show 4K",
      createdAt: "2026-06-11T00:00:00.000Z",
      candidates: [
        {
          id: "snapshot_1_candidate_1",
          snapshotId: "snapshot_1",
          index: 0,
          title: "Show S01E01",
          type: "115",
          source: "fake",
          episodeHints: ["S01E01"],
          qualityHints: ["4K"],
          providerPayload: {},
        },
      ],
    },
  ];
  const decisions: AgentDecision[] = [
    {
      node: "fake_episode_coverage",
      snapshotId: "snapshot_1",
      selectedCandidateIds: ["snapshot_1_candidate_1"],
      episodeMapping: {
        snapshot_1_candidate_1: ["S01E01"],
      },
      providerAheadEpisodeMapping: {},
      rejectedCandidateIds: [],
      confidence: "high",
      reason: "Selected fake candidate",
    },
  ];
  const transferAttempts: TransferAttempt[] = [
    {
      id: "transfer_1",
      workflowRunId: workflowRun.id,
      candidateId: "snapshot_1_candidate_1",
      status: "succeeded",
      providerMessage: "",
      materializedFileIds: ["file_1"],
    },
  ];
  const notifications: NotificationEvent[] = [
    {
      id: "notification_1",
      workflowRunId: workflowRun.id,
      kind: "tracking_initialized",
      title: "Show tracking initialized",
      body: "1 episodes obtained",
      createdAt: "2026-06-11T00:01:00.000Z",
    },
  ];

  return {
    title,
    season,
    workflowRun,
    episodes,
    resourceSnapshots,
    decisions,
    transferAttempts,
    notifications,
    ...overrides,
  };
}
