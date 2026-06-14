import { describe, expect, it } from "vitest";
import { Storage115Simulator } from "../src/acquisition-v2/storage-115-simulator.js";

function fullSeasonPack(episodes: number) {
  return {
    files: Array.from({ length: episodes }, (_, i) => ({
      // Real packs nest the episodes inside the pack's own directory — which is
      // exactly why flatten is needed later.
      path: `[NC-Raws] Show S01/Show - ${String(i + 1).padStart(2, "0")} [1080p].mkv`,
      sizeBytes: 1_000_000_000 + i,
    })),
  };
}

describe("Storage115Simulator — transfer materialization", () => {
  it("materializes a full-season pack's episode files into staging, nested in the pack dir", async () => {
    const sim = new Storage115Simulator({ packs: { cand_full: fullSeasonPack(12) } });
    const showDir = await sim.createDirectory({ name: "Show (2026)", parentId: "root" });
    const staging = await sim.createDirectory({ name: "staging-1", parentId: showDir });

    const attempt = await sim.transferCandidate({ candidateId: "cand_full", intoDirectoryId: staging });

    expect(attempt.status).toBe("succeeded");
    expect(attempt.materializedFileIds).toHaveLength(12);

    const tree = await sim.listTree({ directoryId: staging });
    const videos = tree.filter((file) => file.isVideo);
    expect(videos).toHaveLength(12);
    // The episodes landed nested inside the pack's own directory, not directly
    // in staging — the wrapper dir flatten will later have to peel off.
    expect(videos.every((file) => file.path.startsWith("[NC-Raws] Show S01/"))).toBe(true);
  });

  it("reports a failed transfer (dead share) without materializing anything", async () => {
    const sim = new Storage115Simulator({ packs: {} }); // unknown candidate = dead share
    const staging = await sim.createDirectory({ name: "staging-1", parentId: "root" });

    const attempt = await sim.transferCandidate({ candidateId: "cand_dead", intoDirectoryId: staging });

    expect(attempt.status).toBe("failed");
    expect(attempt.materializedFileIds).toEqual([]);
    expect((await sim.listTree({ directoryId: staging })).length).toBe(0);
  });
});
