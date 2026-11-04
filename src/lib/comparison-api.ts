import { evaluationServiceCatalog } from "./evaluation-services";
import type { ComparisonJudge, ComparisonRequirement, ComparisonRun } from "./comparison-preview";
import type { UnifiedRunSnapshot } from "./unified-run-poll";

const serviceLabels = new Map(evaluationServiceCatalog.map((item) => [item.key, item.label]));

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export type ComparisonMatrixRow = {
  key: string;
  label: string;
  left?: ComparisonRequirement;
  right?: ComparisonRequirement;
  same: boolean;
  winner: string;
};

export function rankRequirement(status: string) {
  return ({ met: 3, partial: 2, unclear: 1, missing: 0 } as Record<string, number>)[status] || 0;
}

function compareRequirement(left: string, right: string) {
  const l = rankRequirement(left);
  const r = rankRequirement(right);
  return r > l ? "右侧更好" : r < l ? "左侧更好" : "持平";
}

function normalizeRequirement(value: string) {
  return value.trim().toLowerCase().replace(/[\s，。；：、,.!?;:()[\]【】]/g, "");
}

export function comparisonRequirementRows(left: ComparisonRun, right: ComparisonRun, judgeKey: "deepSeekScore" | "qwenScore", comparable = true): ComparisonMatrixRow[] {
  const map = new Map<string, ComparisonMatrixRow>();
  const add = (item: ComparisonRequirement, side: "left" | "right") => {
    const normalized = normalizeRequirement(item.requirement) || item.id;
    const existing = map.get(normalized);
    if (existing) {
      if (side === "left") existing.left = item; else existing.right = item;
      return;
    }
    map.set(normalized, {
      key: normalized,
      label: item.requirement,
      ...(side === "left" ? { left: item } : { right: item }),
      same: false,
      winner: "仅一侧列出",
    });
  };
  for (const item of left.scores[judgeKey].quality?.taskCompletion?.requirements || []) add(item, "left");
  for (const item of right.scores[judgeKey].quality?.taskCompletion?.requirements || []) add(item, "right");
  const rows = [...map.values()];
  for (const row of rows) {
    if (!comparable) { row.same = false; row.winner = "不可比"; continue; }
    if (!row.left || !row.right) continue;
    row.same = rankRequirement(row.left.status) === rankRequirement(row.right.status);
    row.winner = compareRequirement(row.left.status, row.right.status);
  }
  return rows;
}

export function shortTopic(value: string) {
  if (/成分优化|配比优化/.test(value)) return "成分优化";
  if (/挤压/.test(value)) return "挤压路线";
  if (/固溶|时效/.test(value)) return "固溶时效";
  if (/未定参数|假设/.test(value)) return "参数假设";
  if (/成分范围|余量|合计/.test(value)) return "成分范围";
  if (/T6/i.test(value)) return "T6 状态";
  if (/25/.test(value)) return "25℃ 强度";
  if (/成分/.test(value)) return "成分方案";
  return value.length > 16 ? `${value.slice(0, 16)}…` : value;
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
