import { evaluationServiceCatalog } from "./evaluation-services";
import type { ComparisonJudge, ComparisonRun } from "./comparison-preview";
import type { UnifiedRunSnapshot } from "./unified-run-poll";

const serviceLabels = new Map(evaluationServiceCatalog.map((item) => [item.key, item.label]));

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function comparisonErrorMessage(value: unknown, status: number) {
  const data = record(value);
  const error = data?.error;
  if (typeof error === "string") return error;
  const nested = record(error);
  if (typeof nested?.message === "string") return nested.message;
  return `请求失败（${status}）`;
}

function judge(value: unknown): ComparisonJudge {
  const item = record(value);
  if (!item) return { status: "absent", model: "", quality: null };
  return {
    status: (typeof item.status === "string" ? item.status : "absent") as ComparisonJudge["status"],
    model: typeof item.model === "string" ? item.model : "",
    quality: (record(item.quality) || null) as ComparisonJudge["quality"],
  };
}

export function normalizeComparisonRun(run: UnifiedRunSnapshot): ComparisonRun {
  const native = record(run.run);
  const elapsed = typeof native?.elapsedMs === "number" && Number.isFinite(native.elapsedMs) ? native.elapsedMs : null;
  const scores = record(run.scores) || {};
  const executionStatus = run.executionStatus
    || (run.status === "error" ? "failed" : run.status === "queued" || run.status === "running" ? "running" : run.status === "cancelled" ? "cancelled" : "succeeded");
  return {
    runId: run.runId,
    serviceKey: run.serviceKey,
    serviceLabel: serviceLabels.get(run.serviceKey) || run.serviceKey,
    executionStatus,
    scoringStatus: run.scoringStatus || "pending",
    answer: run.answer || "",
    answerTruncated: run.answerTruncated === true,
    elapsedMs: elapsed,
    scores: { deepSeekScore: judge(scores.deepSeekScore), qwenScore: judge(scores.qwenScore) },
    run: run.run,
    startedAt: run.startedAt || null,
    scoreError: run.scoreError || null,
    error: run.error || null,
  };
}
