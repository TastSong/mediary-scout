import type {
  AgentDecision,
  EpisodeState,
  MediaTitle,
  NotificationEvent,
  ResourceSnapshot,
  TrackedSeason,
  TransferAttempt,
  WorkflowRun,
} from "./domain.js";

export interface PersistWorkflowRunSnapshotInput {
  title: MediaTitle;
  season: TrackedSeason;
  workflowRun: WorkflowRun;
  episodes: EpisodeState[];
  resourceSnapshots: ResourceSnapshot[];
  decisions: AgentDecision[];
  transferAttempts: TransferAttempt[];
  notifications: NotificationEvent[];
}

export interface PersistedWorkflowRunSnapshot extends PersistWorkflowRunSnapshotInput {
  obtainedEpisodes: string[];
  providerAheadEpisodes: string[];
}

export interface WorkflowRepository {
  saveWorkflowRunSnapshot(input: PersistWorkflowRunSnapshotInput): Promise<void>;
  getWorkflowRunSnapshot(workflowRunId: string): Promise<PersistedWorkflowRunSnapshot | null>;
  listEpisodeStates(trackedSeasonId: string): Promise<EpisodeState[]>;
}

export class InMemoryWorkflowRepository implements WorkflowRepository {
  private readonly workflowRuns = new Map<string, PersistWorkflowRunSnapshotInput>();
  private readonly episodesBySeason = new Map<string, EpisodeState[]>();

  async saveWorkflowRunSnapshot(input: PersistWorkflowRunSnapshotInput): Promise<void> {
    validateWorkflowRunSnapshot(input);

    const cloned = clone(input);
    this.workflowRuns.set(cloned.workflowRun.id, cloned);
    this.episodesBySeason.set(cloned.season.id, clone(cloned.episodes));
  }

  async getWorkflowRunSnapshot(workflowRunId: string): Promise<PersistedWorkflowRunSnapshot | null> {
    const stored = this.workflowRuns.get(workflowRunId);
    if (!stored) {
      return null;
    }

    return withDerivedEpisodeSummaries(clone(stored));
  }

  async listEpisodeStates(trackedSeasonId: string): Promise<EpisodeState[]> {
    return clone(this.episodesBySeason.get(trackedSeasonId) ?? []);
  }
}

function validateWorkflowRunSnapshot(input: PersistWorkflowRunSnapshotInput): void {
  if (input.season.mediaTitleId !== input.title.id) {
    throw new Error("Tracked season does not belong to media title");
  }
  if (input.workflowRun.trackedSeasonId !== input.season.id) {
    throw new Error("Workflow run does not belong to tracked season");
  }

  for (const episode of input.episodes) {
    if (episode.trackedSeasonId !== input.season.id) {
      throw new Error(`Episode ${episode.episodeCode} does not belong to tracked season`);
    }
  }

  for (const transferAttempt of input.transferAttempts) {
    if (transferAttempt.workflowRunId !== input.workflowRun.id) {
      throw new Error(`Transfer attempt ${transferAttempt.id} does not belong to workflow run`);
    }
  }

  for (const notification of input.notifications) {
    if (notification.workflowRunId !== input.workflowRun.id) {
      throw new Error(`Notification ${notification.id} does not belong to workflow run`);
    }
  }

  const candidateIdsBySnapshot = new Map<string, Set<string>>();
  const allCandidateIds = new Set<string>();
  for (const snapshot of input.resourceSnapshots) {
    const snapshotCandidateIds = new Set<string>();
    for (const candidate of snapshot.candidates) {
      if (candidate.snapshotId !== snapshot.id) {
        throw new Error(`Resource candidate ${candidate.id} does not belong to snapshot ${snapshot.id}`);
      }
      snapshotCandidateIds.add(candidate.id);
      allCandidateIds.add(candidate.id);
    }
    candidateIdsBySnapshot.set(snapshot.id, snapshotCandidateIds);
  }

  for (const decision of input.decisions) {
    const candidateIds = candidateIdsBySnapshot.get(decision.snapshotId);
    if (!candidateIds) {
      throw new Error(`Agent decision referenced unknown resource snapshot ${decision.snapshotId}`);
    }

    const decisionCandidateIds = [
      ...decision.selectedCandidateIds,
      ...decision.rejectedCandidateIds,
      ...Object.keys(decision.episodeMapping),
      ...Object.keys(decision.providerAheadEpisodeMapping),
    ];
    if (decisionCandidateIds.some((candidateId) => !candidateIds.has(candidateId))) {
      throw new Error("Agent decision referenced candidates outside persisted resource snapshots");
    }
  }

  for (const transferAttempt of input.transferAttempts) {
    if (!allCandidateIds.has(transferAttempt.candidateId)) {
      throw new Error(`Transfer attempt ${transferAttempt.id} referenced an unknown candidate`);
    }
  }
}

function withDerivedEpisodeSummaries(input: PersistWorkflowRunSnapshotInput): PersistedWorkflowRunSnapshot {
  return {
    ...input,
    obtainedEpisodes: input.episodes
      .filter((episode) => episode.obtained)
      .map((episode) => episode.episodeCode),
    providerAheadEpisodes: input.episodes
      .filter((episode) => episode.obtained && episode.metadataStatus === "provider_ahead")
      .map((episode) => episode.episodeCode),
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
