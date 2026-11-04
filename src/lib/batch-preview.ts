import { SERVICE_LABELS, type BatchComparison, type BatchDetail, type BatchSummary, type BatchTotals, type JudgeKey, type JudgeSummary, type RunBrief, type ServiceDetail } from "./batch-types";

const SERVICE_QUESTIONS: Record<string, string[]> = {
  "mission-material": [
    "请比较氮化铝与氮化硼作为芯片封装散热填料的优缺点，并给出选型建议。",
    "请给出一种适合高温工况的材料方案，并说明关键依据与限制。",
    "请比较三种封装材料的导热、可靠性和成本，给出取舍建议。",
  ],
  literature: [
    "请检索高超声速飞行器热防护材料近五年的研究进展，并总结关键结论。",
    "请梳理高温合金疲劳寿命预测的主要方法，并比较适用范围。",
    "请查找固态电解质界面改性的代表性研究，并给出证据链。",
  ],
  "literature-aircraft": [
    "航空发动机高温合金的服役失效模式有哪些？请给出文献依据。",
    "请检索航空材料在极端温度下的性能退化研究，并总结差异。",
    "请比较航空用复合材料的损伤检测方法，并给出文献支持。",
  ],
  alloy: [
    "请设计一种适用于 600°C 服役环境的轻质高强合金，并说明成分与工艺依据。",
    "请优化一种铝合金的强韧性与耐热性平衡，并给出验证方案。",
    "请比较两种高温合金的析出相控制策略，说明工艺窗口。",
  ],
  synthesis: [
    "请给出一种高熵陶瓷粉体的合成路线，说明前驱体、温度与气氛控制。",
    "请设计一条低温固相合成路线，并说明杂质控制与产率评估。",
    "请比较溶胶凝胶与水热法合成纳米粉体的优缺点，给出工艺建议。",
  ],
  "new-material": [
    "请评估一种新型固态电解质材料的界面稳定性，并给出改进方向。",
    "请给出一种高导热复合材料的制备方案，并说明界面调控依据。",
    "请分析新型储能材料在循环过程中的失效机制，并提出改进建议。",
  ],
};

const JUDGE_MODELS: Record<JudgeKey, string> = { deepSeek: "deepseek-chat", qwen: "qwen3.7-flash" };

type ServiceSpec = { key: string; expected: number; count: number; failures: number; timeouts: number; base: number };

const TRIAL_SPECS: ServiceSpec[] = [
  { key: "mission-material", expected: 20, count: 20, failures: 1, timeouts: 0, base: 82 },
  { key: "literature", expected: 50, count: 50, failures: 1, timeouts: 0, base: 79 },
  { key: "literature-aircraft", expected: 50, count: 50, failures: 0, timeouts: 0, base: 83 },
  { key: "alloy", expected: 50, count: 50, failures: 0, timeouts: 1, base: 77 },
  { key: "synthesis", expected: 50, count: 48, failures: 1, timeouts: 0, base: 80 },
  { key: "new-material", expected: 50, count: 50, failures: 1, timeouts: 0, base: 81 },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function makeRuns(batchId: string, date: string, spec: ServiceSpec, offset: number): RunBrief[] {
  return Array.from({ length: spec.count }, (_, index) => {
    const failed = index < spec.failures;
    const timeout = !failed && index < spec.failures + spec.timeouts;
    const status: RunBrief["status"] = failed || timeout ? "error" : "done";
    const execution: RunBrief["execution"] = failed ? "failed" : timeout ? "timeout" : "completed";
    const deepSeek = failed || timeout ? null : clamp(spec.base + offset + ((index * 7) % 19) - 9, 45, 96);
    const qwen = deepSeek == null ? null : clamp(deepSeek - 2 + (index % 5), 44, 95);
    const minute = 5 + ((index + spec.key.length) % 50);
    return {
      runId: `${batchId}-${spec.key}-${String(index + 1).padStart(3, "0")}`,
      questionId: `q-${spec.key}-${index + 1}`,
      datasetVersion: "2026-11-02",
      question: SERVICE_QUESTIONS[spec.key][index % SERVICE_QUESTIONS[spec.key].length],
      serviceKey: spec.key,
      status,
      execution,
      scores: { deepSeek, qwen },
      error: failed ? "服务返回执行错误" : timeout ? "执行超时（360 秒）" : null,
      startedAt: `${date}T22:${String(minute).padStart(2, "0")}:00+08:00`,
      elapsedMs: failed || timeout ? 360000 : 120000 + ((index * 37000) % 780000),
    };
  });
}

function totalsOf(runs: RunBrief[], planned = runs.length): BatchTotals {
  const completed = runs.filter((run) => run.execution === "completed").length;
  const failed = runs.filter((run) => run.execution === "failed").length;
  const timeout = runs.filter((run) => run.execution === "timeout").length;
  return {
    planned,
    total: runs.length,
    completed,
    failed,
    timeout,
    unfinished: runs.length - completed - failed - timeout,
    queued: runs.filter((run) => run.status === "queued").length,
    running: runs.filter((run) => run.status === "running").length,
    scoring: runs.filter((run) => run.status === "scoring").length,
  };
}

function judgeSummary(runs: RunBrief[], key: JudgeKey): JudgeSummary {
  const values = runs.map((run) => run.scores[key]).filter((value): value is number => typeof value === "number");
  const mean = values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : null;
  return {
    mean,
    count: values.length,
    ready: values.length,
    provisional: 0,
    pending: 0,
    failed: 0,
    unavailable: 0,
    absent: runs.length - values.length,
    model: JUDGE_MODELS[key],
  };
}

function addTotals(items: BatchTotals[], planned: number): BatchTotals {
  return items.reduce<BatchTotals>((sum, item) => ({
    planned,
    total: sum.total + item.total,
    completed: sum.completed + item.completed,
    failed: sum.failed + item.failed,
    timeout: sum.timeout + item.timeout,
    unfinished: sum.unfinished + item.unfinished,
    queued: sum.queued + item.queued,
    running: sum.running + item.running,
    scoring: sum.scoring + item.scoring,
  }), { planned, total: 0, completed: 0, failed: 0, timeout: 0, unfinished: 0, queued: 0, running: 0, scoring: 0 });
}

function buildServiceDetail(spec: ServiceSpec, runs: RunBrief[]): ServiceDetail {
  const scored = runs.filter((run) => typeof run.scores.deepSeek === "number" || typeof run.scores.qwen === "number");
  return {
    serviceKey: spec.key,
    label: SERVICE_LABELS[spec.key] || spec.key,
    expected: spec.expected,
    totals: totalsOf(runs, spec.expected),
    scores: { deepSeek: judgeSummary(runs, "deepSeek"), qwen: judgeSummary(runs, "qwen") },
    maxElapsedMs: runs.reduce<number | null>((max, run) => run.elapsedMs == null ? max : Math.max(max || 0, run.elapsedMs), null),
    lowScores: [...scored].sort((a, b) => Math.min(a.scores.deepSeek ?? 101, a.scores.qwen ?? 101) - Math.min(b.scores.deepSeek ?? 101, b.scores.qwen ?? 101)).slice(0, 2),
    failures: runs.filter((run) => run.status === "error").slice(0, 2),
  };
}

function buildTrialBatch(id: string, date: string, offset: number): { summary: BatchSummary; detail: BatchDetail; runs: RunBrief[] } {
  const specs = TRIAL_SPECS.map((spec) => ({ ...spec, count: date === "2026-11-02" && spec.key === "synthesis" ? 48 : spec.expected }));
  const runs = specs.flatMap((spec) => makeRuns(id, date, spec, offset));
  const services = specs.map((spec) => buildServiceDetail(spec, runs.filter((run) => run.serviceKey === spec.key)));
  const planned = specs.reduce((sum, spec) => sum + spec.expected, 0);
  const totals = addTotals(services.map((service) => service.totals), planned);
  const scores = { deepSeek: judgeSummary(runs, "deepSeek"), qwen: judgeSummary(runs, "qwen") };
  const plans = specs.map((spec) => ({ key: spec.key, label: SERVICE_LABELS[spec.key] || spec.key, expected: spec.expected }));
  const summary: BatchSummary = {
    batchId: id,
    date,
    source: "trial",
    state: totals.total < planned ? "partial" : "done",
    rawState: totals.total < planned ? "dispatching" : "submitted",
    planned,
    services: plans,
    totals,
    scores,
    startedAt: `${date}T22:00:00+08:00`,
    updatedAt: `${date}T23:42:00+08:00`,
  };
  const detail: BatchDetail = {
    batch: {
      batchId: id,
      date,
      source: "trial",
      state: summary.state,
      rawState: summary.rawState,
      planned,
      services: plans,
      rule: { name: "科学服务评测规则", version: "v1", hash: "rule-eval-v1" },
      startedAt: summary.startedAt,
      updatedAt: summary.updatedAt,
      error: null,
    },
    totals,
    scores,
    services,
    coverage: {
      planned,
      persisted: totals.total,
      missing: Math.max(0, planned - totals.total),
      note: "已持久化自动测评；未入库脚本不在统计范围内。",
    },
    links: { dailyReport: `/daily-reports/${date}`, comparison: `/preview/batches/${id}/comparison` },
  };
  return { summary, detail, runs };
}

function buildMissionBatch(id: string, date: string, offset: number): { summary: BatchSummary; detail: BatchDetail; runs: RunBrief[] } {
  const spec: ServiceSpec = { key: "mission-material", expected: 10, count: 10, failures: 1, timeouts: 0, base: 82 };
  const runs = makeRuns(id, date, spec, offset);
  const service = buildServiceDetail(spec, runs);
  const totals = totalsOf(runs, 10);
  const scores = { deepSeek: service.scores.deepSeek, qwen: service.scores.qwen };
  const plans = [{ key: spec.key, label: SERVICE_LABELS[spec.key], expected: 10 }];
  const summary: BatchSummary = {
    batchId: id,
    date,
    source: "mission",
    state: totals.total < 10 ? "partial" : "done",
    rawState: "submitted",
    planned: 10,
    services: plans,
    totals,
    scores,
    startedAt: `${date}T22:00:00+08:00`,
    updatedAt: `${date}T23:12:00+08:00`,
  };
  const detail: BatchDetail = {
    batch: {
      batchId: id,
      date,
      source: "mission",
      state: summary.state,
      rawState: summary.rawState,
      planned: 10,
      services: plans,
      rule: { name: "科学服务评测规则", version: "v1", hash: "rule-eval-v1" },
      startedAt: summary.startedAt,
      updatedAt: summary.updatedAt,
      error: null,
    },
    totals,
    scores,
    services: [service],
    coverage: { planned: 10, persisted: 10, missing: 0, note: "已持久化自动测评；未入库脚本不在统计范围内。" },
    links: { dailyReport: `/daily-reports/${date}`, comparison: `/preview/batches/${id}/comparison` },
  };
  return { summary, detail, runs };
}

const trialCurrent = buildTrialBatch("trial-20261102", "2026-11-02", 0);
const missionCurrent = buildMissionBatch("mission-20261102", "2026-11-02", 1);
const trialPrevious = buildTrialBatch("trial-20261101", "2026-11-01", -2);
const missionPrevious = buildMissionBatch("mission-20261101", "2026-11-01", -1);
const trialOlder = buildTrialBatch("trial-20261031", "2026-10-31", -3);
const missionOlder = buildMissionBatch("mission-20261030", "2026-10-30", -2);

export const previewBatches: BatchSummary[] = [
  trialCurrent.summary,
  missionCurrent.summary,
  trialPrevious.summary,
  missionPrevious.summary,
  trialOlder.summary,
  missionOlder.summary,
];

export const previewBatchDetails: Record<string, BatchDetail> = {
  [trialCurrent.summary.batchId]: trialCurrent.detail,
  [missionCurrent.summary.batchId]: missionCurrent.detail,
  [trialPrevious.summary.batchId]: trialPrevious.detail,
  [missionPrevious.summary.batchId]: missionPrevious.detail,
  [trialOlder.summary.batchId]: trialOlder.detail,
  [missionOlder.summary.batchId]: missionOlder.detail,
};

export const previewBatchRuns: Record<string, RunBrief[]> = {
  [trialCurrent.summary.batchId]: trialCurrent.runs,
  [missionCurrent.summary.batchId]: missionCurrent.runs,
  [trialPrevious.summary.batchId]: trialPrevious.runs,
  [missionPrevious.summary.batchId]: missionPrevious.runs,
  [trialOlder.summary.batchId]: trialOlder.runs,
  [missionOlder.summary.batchId]: missionOlder.runs,
};

const missionComparison: BatchComparison = {
  base: { batchId: missionCurrent.summary.batchId, date: missionCurrent.summary.date, planned: 10 },
  previous: { batchId: missionPrevious.summary.batchId, date: missionPrevious.summary.date, planned: 10 },
  comparable: true,
  mode: "question",
  reason: null,
  matchedQuestions: 8,
  thresholdPoints: 5,
  services: [
    { serviceKey: "mission-material", label: "Mission 主服务", scoreDelta: { deepSeek: 2.0, qwen: 2.0 }, completionDelta: 0, failureDelta: -2, newFailureCount: 0, fixedCount: 2 },
  ],
  questions: [
    { questionId: "mission-q-1", datasetVersion: "2026-11-02", question: "请比较氮化铝与氮化硼作为芯片封装散热填料的优缺点。", serviceKey: "mission-material", before: { score: 84, status: "done" }, after: { score: 61, status: "done" }, delta: -23, level: "regressed" },
    { questionId: "mission-q-2", datasetVersion: "2026-11-02", question: "请给出高熵陶瓷粉体的合成路线与关键控制点。", serviceKey: "mission-material", before: { score: 78, status: "done" }, after: { score: 82, status: "done" }, delta: 4, level: "stable" },
    { questionId: "mission-q-3", datasetVersion: "2026-11-02", question: "请说明高温合金的失效模式及文献依据。", serviceKey: "mission-material", before: { score: 90, status: "done" }, after: { score: 88, status: "done" }, delta: -2, level: "stable" },
    { questionId: "mission-q-4", datasetVersion: "2026-11-02", question: "请评估固态电解质材料的界面稳定性并给出改进方向。", serviceKey: "mission-material", before: { score: null, status: "error" }, after: { score: 58, status: "done" }, delta: null, level: "fixed" },
    { questionId: "mission-q-5", datasetVersion: "2026-11-02", question: "请设计一种适用于 600°C 的轻质高强合金。", serviceKey: "mission-material", before: { score: 62, status: "done" }, after: { score: 74, status: "done" }, delta: 12, level: "improved" },
    { questionId: "mission-q-6", datasetVersion: "2026-11-02", question: "请总结航空发动机热防护材料的研究进展。", serviceKey: "mission-material", before: { score: null, status: "error" }, after: { score: 80, status: "done" }, delta: null, level: "fixed" },
    { questionId: "mission-q-7", datasetVersion: "2026-11-02", question: "请比较三种材料方案的适用条件和取舍。", serviceKey: "mission-material", before: { score: 70, status: "done" }, after: { score: 66, status: "done" }, delta: -4, level: "stable" },
    { questionId: "mission-q-8", datasetVersion: "2026-11-02", question: "请给出材料表征方案与预期结果。", serviceKey: "mission-material", before: { score: 88, status: "done" }, after: { score: 91, status: "done" }, delta: 3, level: "stable" },
  ],
};

const trialComparison: BatchComparison = {
  base: { batchId: trialCurrent.summary.batchId, date: trialCurrent.summary.date, planned: trialCurrent.summary.planned },
  previous: { batchId: trialPrevious.summary.batchId, date: trialPrevious.summary.date, planned: trialPrevious.summary.planned },
  comparable: true,
  mode: "aggregate",
  reason: "随机题批次每次重新生成题目，没有同题同版本记录；本次只比较服务汇总。",
  matchedQuestions: 0,
  thresholdPoints: 5,
  services: [
    { serviceKey: "mission-material", label: "Mission 主服务", scoreDelta: { deepSeek: 1.8, qwen: 2.1 }, completionDelta: 0, failureDelta: -1, newFailureCount: 0, fixedCount: 1 },
    { serviceKey: "literature", label: "文献检索", scoreDelta: { deepSeek: -2.4, qwen: -1.9 }, completionDelta: -1, failureDelta: 1, newFailureCount: 2, fixedCount: 1 },
    { serviceKey: "literature-aircraft", label: "航空文献", scoreDelta: { deepSeek: 0.6, qwen: 0.4 }, completionDelta: 0, failureDelta: 0, newFailureCount: 0, fixedCount: 0 },
    { serviceKey: "alloy", label: "合金材料", scoreDelta: { deepSeek: -3.5, qwen: -2.8 }, completionDelta: -1, failureDelta: 1, newFailureCount: 1, fixedCount: 0 },
    { serviceKey: "synthesis", label: "合成制备", scoreDelta: { deepSeek: 1.2, qwen: 0.9 }, completionDelta: 0, failureDelta: 0, newFailureCount: 1, fixedCount: 1 },
    { serviceKey: "new-material", label: "新材料", scoreDelta: { deepSeek: -0.8, qwen: -0.5 }, completionDelta: 0, failureDelta: 0, newFailureCount: 0, fixedCount: 0 },
  ],
  questions: [],
};

export const previewBatchComparisons: Record<string, BatchComparison> = {
  [trialCurrent.summary.batchId]: trialComparison,
  [missionCurrent.summary.batchId]: missionComparison,
};

export function previewComparisonFor(batchId: string): BatchComparison {
  const detail = previewBatchDetails[batchId];
  if (!detail) throw new Error("批次不存在");
  return previewBatchComparisons[batchId] || {
    base: { batchId, date: detail.batch.date, planned: detail.batch.planned },
    previous: null,
    comparable: false,
    mode: "none",
    reason: "没有更早的同来源批次可用于比较。",
    matchedQuestions: 0,
    thresholdPoints: 5,
    services: [],
    questions: [],
  };
}

