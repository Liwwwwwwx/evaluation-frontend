export type BatchSource = "trial" | "mission" | "manual";
export type BatchState = "preparing" | "dispatching" | "running" | "done" | "partial" | "failed";
export type JudgeKey = "deepSeek" | "qwen";

export type JudgeSummary = {
  mean: number | null;
  count: number;
  ready: number;
  provisional: number;
  pending: number;
  failed: number;
  unavailable: number;
  absent: number;
  invalid?: number;
  model: string | null;
};

export type BatchServicePlan = { key: string; label: string; expected: number };

export type BatchTotals = {
  planned: number;
  total: number;
  completed: number;
  failed: number;
  timeout: number;
  unfinished: number;
  queued: number;
  running: number;
  scoring: number;
};

export type BatchSummary = {
  batchId: string;
  date: string;
  source: BatchSource;
  state: BatchState;
  rawState: string;
  scheme?: { id: string; name: string; version: number } | null;
  error?: string | null;
  planned: number;
  services: BatchServicePlan[];
  totals: BatchTotals;
  scores: { deepSeek: JudgeSummary; qwen: JudgeSummary };
  startedAt: string | null;
  updatedAt: string;
};

export type RunBrief = {
  runId: string;
  questionId: string | null;
  datasetVersion: string | null;
  question: string;
  comparisonGroupId?: string | null;
  serviceKey: string;
  status: "queued" | "running" | "scoring" | "done" | "error" | "paused";
  execution: "completed" | "failed" | "timeout" | "unfinished";
  scores: { deepSeek: number | null; qwen: number | null };
  displayScores?: { deepSeek: number | null; qwen: number | null };
  provisionalScores?: { deepSeek: boolean; qwen: boolean };
  error: string | null;
  startedAt: string;
  elapsedMs: number | null;
};

export type ServiceDetail = {
  serviceKey: string;
  label: string;
  expected: number;
  totals: BatchTotals;
  scores: { deepSeek: JudgeSummary; qwen: JudgeSummary };
  maxElapsedMs: number | null;
  lowScores: RunBrief[];
  failures: RunBrief[];
};

export type BatchDetail = {
  batch: {
    batchId: string;
    date: string;
    source: BatchSource;
    state: BatchState;
    rawState: string;
    planned: number;
    services: BatchServicePlan[];
    rule: { name: string | null; version: string | null; hash: string | null };
    scheme?: { id: string; name: string; version: number } | null;
    startedAt: string | null;
    updatedAt: string;
    error: string | null;
  };
  totals: BatchTotals;
  scores: { deepSeek: JudgeSummary; qwen: JudgeSummary };
  services: ServiceDetail[];
  coverage: { planned: number; persisted: number; missing: number; note: string };
  links: { dailyReport: string | null; comparison: string };
};

export type ComparisonService = {
  serviceKey: string;
  label: string;
  scoreDelta: { deepSeek: number | null; qwen: number | null };
  completionDelta: number;
  failureDelta: number;
  newFailureCount: number | null;
  fixedCount: number | null;
};

export type ComparisonQuestion = {
  questionId: string;
  datasetVersion: string;
  question: string;
  serviceKey: string;
  before: { score: number | null; status: string };
  after: { score: number | null; status: string };
  delta: number | null;
  level: "regressed" | "improved" | "stable" | "new_failure" | "fixed";
};

export type BatchComparison = {
  base: { batchId: string; date: string; planned: number };
  previous: { batchId: string; date: string; planned: number } | null;
  comparable: boolean;
  mode: "question" | "aggregate" | "none";
  reason: string | null;
  matchedQuestions: number;
  thresholdPoints: number;
  services: ComparisonService[];
  questions: ComparisonQuestion[];
};

export const SERVICE_LABELS: Record<string, string> = {
  "mission-material": "Mission 主服务",
  literature: "文献检索",
  "literature-aircraft": "航空文献",
  alloy: "合金材料",
  synthesis: "合成制备",
  "new-material": "新材料",
  "alpha-rsi": "ALPHA 材料 RSI（1110）",
};

export function serviceLabel(key: string) {
  return SERVICE_LABELS[key] || key;
}
