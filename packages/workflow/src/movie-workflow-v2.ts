import type { LanguageModel } from "ai";
import {
  createEpisodeStates,
  movieAnchorSeason,
  type AgentDecision,
  type AuditEvent,
  type EpisodeState,
  type MediaTitle,
  type NotificationEvent,
  type ResourceSnapshot,
  type TrackedSeason,
  type TransferAttempt,
  type WorkflowStatus,
} from "./domain.js";
import type { MovieWorkflowResult } from "./movie-workflow.js";
import { buildMovieReport, formatReportPushText } from "./notification-report.js";
import type { ResourceProvider, StorageExecutor } from "./ports.js";
import { runAcquisitionV2 } from "./acquisition-v2/orchestrator.js";

function defaultNowIso(): string {
  return new Date().toISOString();
}

/**
 * Phase 7d — movie acquisition on the V2 engine. Same effect as the old
 * runMovieAcquisition (verify-or-create Movies/Title (Year), agent confirms the
 * one film and transfers it, mark, clean staging) but the semantic loop is the
 * strong movie task agent inside the sandbox. Produces the existing
 * MovieWorkflowResult so runner/web/UI are unchanged.
 */
export interface RunMovieAcquisitionV2Request {
  title: MediaTitle;
  resourceProvider: ResourceProvider;
  storage: StorageExecutor;
  model: LanguageModel;
  workflowRunId: string;
  stagingParentDirectoryId: string;
  moviesParentDirectoryId: string;
  searchBudget?: number;
  maxSteps?: number;
  preferredLanguage?: string;
  now?: () => string;
}

export async function runMovieAcquisitionV2(
  request: RunMovieAcquisitionV2Request,
): Promise<MovieWorkflowResult> {
  const now = request.now ?? defaultNowIso;

  // verify-or-create Movies/Title (Year)
  const movieDirectoryId = await request.storage.createDirectory({
    name: `${request.title.title} (${request.title.year ?? "—"})`,
    parentId: request.moviesParentDirectoryId,
  });

  // Already obtained? (a film really present in its dir) → no-op.
  const before = await request.storage.listVideoFiles(movieDirectoryId);
  if (before.length > 0) {
    return buildResult({
      request,
      movieDirectoryId,
      obtained: true,
      status: "succeeded",
      kind: "movie_init",
      snapshots: [],
      attempts: [],
      decisions: [],
      now,
    });
  }

  const stagingDirectoryId = await request.storage.createDirectory({
    name: `staging-${request.workflowRunId}`,
    parentId: request.stagingParentDirectoryId,
  });

  const v2 = await runAcquisitionV2({
    provider: request.resourceProvider,
    executor: request.storage,
    model: request.model,
    workflowRunId: request.workflowRunId,
    target: {
      kind: "movie",
      title: request.title.title,
      aliases: request.title.aliases,
      year: request.title.year ?? 0,
      qualityPreference: "4K",
    },
    stagingDirectoryId,
    targetMovieDirectoryId: movieDirectoryId,
    ...(request.searchBudget === undefined ? {} : { searchBudget: request.searchBudget }),
    ...(request.maxSteps === undefined ? {} : { maxSteps: request.maxSteps }),
    ...(request.preferredLanguage === undefined ? {} : { preferredLanguage: request.preferredLanguage }),
  });

  // Truth = what really landed in the movie dir.
  const after = await request.storage.listVideoFiles(movieDirectoryId);
  const obtained = after.length > 0;

  // Best-effort staging cleanup (never fail acquisition over cleanup).
  try {
    await request.storage.removeDirectory(stagingDirectoryId);
  } catch {
    // ignore
  }

  return buildResult({
    request,
    movieDirectoryId,
    obtained,
    status: obtained ? "succeeded" : "no_coverage",
    kind: obtained ? "movie_init" : "no_coverage",
    snapshots: v2.outcome.resourceSnapshots,
    attempts: v2.outcome.transferAttempts,
    decisions: v2.outcome.decisions,
    now,
  });
}

function buildResult(input: {
  request: RunMovieAcquisitionV2Request;
  movieDirectoryId: string;
  obtained: boolean;
  status: WorkflowStatus;
  kind: string;
  snapshots: ResourceSnapshot[];
  attempts: TransferAttempt[];
  decisions: AgentDecision[];
  now: () => string;
}): MovieWorkflowResult {
  const season: TrackedSeason = movieAnchorSeason({
    titleId: input.request.title.id,
    qualityPreference: "4K",
    storageDirectoryId: input.movieDirectoryId,
  });
  const episodes: EpisodeState[] = createEpisodeStates({
    trackedSeasonId: season.id,
    seasonNumber: 1,
    totalEpisodes: 1,
    latestAiredEpisode: 1,
  }).map((episode) => ({ ...episode, obtained: input.obtained }));

  const baseReport = buildMovieReport(input.request.title.title);
  const report = input.obtained
    ? baseReport
    : { ...baseReport, status: "no_coverage" as const, lines: ["暂未找到可用资源 · 将持续尝试"] };
  const notification: NotificationEvent = {
    id: `notification_${input.request.workflowRunId}`,
    workflowRunId: input.request.workflowRunId,
    kind: input.kind,
    title: input.request.title.title,
    body: formatReportPushText(report),
    createdAt: input.now(),
    trigger: "user",
    report,
  };
  const auditEvents: AuditEvent[] = [];

  return {
    status: input.status,
    title: input.request.title,
    season,
    episodes,
    resourceSnapshots: input.snapshots,
    transferAttempts: input.attempts,
    decisions: input.decisions,
    notification,
    notifications: [notification],
    auditEvents,
  };
}
