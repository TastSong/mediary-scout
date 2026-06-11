import { describe, expect, it } from "vitest";
import {
  FakeAgentNodes,
  FakeResourceProvider,
  FakeStorageExecutor,
  runType2Initialization,
  type MediaTitle,
  type TrackedSeason,
} from "../src/index.js";

describe("runType2Initialization", () => {
  it("initializes tracking and marks only verified current episodes obtained", async () => {
    const title: MediaTitle = {
      id: "title_qiaochu",
      tmdbId: 289271,
      type: "tv",
      title: "翘楚",
      originalTitle: "翘楚",
      year: 2026,
      aliases: ["Ashes to Crown"],
    };
    const season: TrackedSeason = {
      id: "season_qiaochu_1",
      mediaTitleId: title.id,
      seasonNumber: 1,
      status: "active",
      qualityPreference: "4K",
      storageDirectoryId: "dir_qiaochu_s1",
      totalEpisodes: 24,
      latestAiredEpisode: 14,
      latestAiredSource: "metadata",
    };

    const resourceProvider = new FakeResourceProvider({
      keywordResults: {
        "翘楚 4K": Array.from({ length: 14 }, (_, index) => ({
          title: `翘楚 S01E${String(index + 1).padStart(2, "0")} 4K`,
          episodeHints: [`S01E${String(index + 1).padStart(2, "0")}`],
          qualityHints: ["4K"],
        })),
      },
    });
    const storage = new FakeStorageExecutor({
      directories: { dir_qiaochu_s1: [] },
      transferOutcomes: Object.fromEntries(
        Array.from({ length: 14 }, (_, index) => {
          const episode = `S01E${String(index + 1).padStart(2, "0")}`;
          const candidateId = `snapshot_1_candidate_${index + 1}`;
          return [
            candidateId,
            {
              status: "succeeded",
              providerMessage: "",
              files: [
                {
                  id: `file_${episode}`,
                  storageDirectoryId: "dir_qiaochu_s1",
                  name: `翘楚.${episode}.mkv`,
                  sizeBytes: 1_000_000_000,
                  episodeCode: episode,
                  providerFileId: `provider_${episode}`,
                },
              ],
            },
          ];
        }),
      ),
    });

    const result = await runType2Initialization({
      title,
      season,
      keyword: "翘楚 4K",
      resourceProvider,
      storage,
      agents: new FakeAgentNodes(),
    });

    expect(result.status).toBe("succeeded");
    expect(result.obtainedEpisodes).toEqual(
      Array.from({ length: 14 }, (_, index) => `S01E${String(index + 1).padStart(2, "0")}`),
    );
    expect(result.episodes.filter((episode) => episode.obtained)).toHaveLength(14);
    expect(result.episodes.find((episode) => episode.episodeCode === "S01E15")).toMatchObject({
      obtained: false,
      airStatus: "unaired",
    });
    expect(result.notification.body).toContain("14 episodes obtained");
    expect(result.notifications).toEqual([result.notification]);
  });

  it("does not mark future episodes obtained during initialization even if a selected resource materializes them", async () => {
    const title: MediaTitle = {
      id: "title_qiaochu",
      tmdbId: 289271,
      type: "tv",
      title: "翘楚",
      originalTitle: "翘楚",
      year: 2026,
      aliases: ["Ashes to Crown"],
    };
    const season: TrackedSeason = {
      id: "season_qiaochu_1",
      mediaTitleId: title.id,
      seasonNumber: 1,
      status: "active",
      qualityPreference: "4K",
      storageDirectoryId: "dir_qiaochu_s1",
      totalEpisodes: 24,
      latestAiredEpisode: 14,
      latestAiredSource: "metadata",
    };
    const resourceProvider = new FakeResourceProvider({
      keywordResults: {
        "翘楚 4K": [
          {
            title: "翘楚 S01E14-S01E15 4K",
            episodeHints: ["S01E14", "S01E15"],
            qualityHints: ["4K"],
          },
        ],
      },
    });
    const storage = new FakeStorageExecutor({
      directories: { dir_qiaochu_s1: [] },
      transferOutcomes: {
        snapshot_1_candidate_1: {
          status: "succeeded",
          providerMessage: "",
          files: [
            {
              id: "file_S01E14",
              storageDirectoryId: "dir_qiaochu_s1",
              name: "翘楚.S01E14.mkv",
              sizeBytes: 1_000_000_000,
              episodeCode: "S01E14",
              providerFileId: "provider_S01E14",
            },
            {
              id: "file_S01E15",
              storageDirectoryId: "dir_qiaochu_s1",
              name: "翘楚.S01E15.mkv",
              sizeBytes: 1_000_000_000,
              episodeCode: "S01E15",
              providerFileId: "provider_S01E15",
            },
          ],
        },
      },
    });

    const result = await runType2Initialization({
      title,
      season,
      keyword: "翘楚 4K",
      resourceProvider,
      storage,
      agents: new FakeAgentNodes(),
    });

    expect(result.obtainedEpisodes).toEqual(["S01E14"]);
    expect(result.providerAheadEpisodes).toEqual([]);
    expect(result.episodes.find((episode) => episode.episodeCode === "S01E15")).toMatchObject({
      airStatus: "unaired",
      obtained: false,
      metadataStatus: "confirmed",
    });
  });
});
