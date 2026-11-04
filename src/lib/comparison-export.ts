import type { Comparison, ComparisonJudge, ComparisonRequirement, ComparisonRun } from "./comparison-preview";

type JudgeKey = "deepSeekScore" | "qwenScore";
type RequirementRow = { label: string; left?: ComparisonRequirement; right?: ComparisonRequirement; same: boolean; winner: string };

const judgeKeys: JudgeKey[] = ["deepSeekScore", "qwenScore"];
const judgeLabels: Record<JudgeKey, string> = { deepSeekScore: "DeepSeek", qwenScore: "千问" };
const taskLabels: Record<string, string> = { completed: "已完成", partial: "部分完成", clarification: "请求补充信息", failed: "未完成", unclear: "无法确认" };
const qualificationLabels: Record<string, string> = { qualified: "合格", not_qualified: "未合格", unclear: "无法判断" };
const requirementLabels: Record<string, string> = { met: "满足", partial: "部分", missing: "缺失", unclear: "无法确认" };

function cleanAnswer(value: string) {
  return String(value || "")
    .replace(/\[start\]|\[end\]/g, "")
    .replace(/<<<CONTENT_(?:START|END):[^>]+>>>/g, "")
    .replace(/<p[^>]*>\s*<img[^>]*alt="([^"]*)"[^>]*>\s*<\/p>/gi, "\n\n[图片：$1]\n\n")
    .replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, "\n\n[图片：$1]\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatDate(value: string | null | undefined) {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date).replace(/\//g, "-");
}

function formatElapsed(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "未记录";
  if (value < 60000) return `${Math.max(1, Math.round(value / 1000))} 秒`;
  const minutes = value / 60000;
  return minutes >= 10 ? `${Math.round(minutes)} 分` : `${minutes.toFixed(1)} 分`;
}

function totalOf(judge: ComparisonJudge) {
  const total = judge.quality?.total;
  return judge.status === "ready" && typeof total === "number" && Number.isFinite(total) ? total : null;
}

function ruleHash(run: ComparisonRun) {
  const native = run.run as { ruleSnapshot?: { hash?: unknown }; scoring?: { ruleSnapshot?: { hash?: unknown } } } | null;
  const hash = native?.scoring?.ruleSnapshot?.hash || native?.ruleSnapshot?.hash;
  return typeof hash === "string" && hash ? hash : null;
}

function comparable(left: ComparisonRun, right: ComparisonRun, key: JudgeKey) {
  const a = left.scores[key];
  const b = right.scores[key];
  const sameRule = !!ruleHash(left) && ruleHash(left) === ruleHash(right);
  return sameRule && left.executionStatus === "succeeded" && right.executionStatus === "succeeded"
    && !left.answerTruncated && !right.answerTruncated
    && !!a.model && a.model === b.model && totalOf(a) !== null && totalOf(b) !== null;
}

function rank(status: string) {
  return ({ met: 3, partial: 2, unclear: 1, missing: 0 } as Record<string, number>)[status] || 0;
}

function compareRequirement(left: string, right: string) {
  const l = rank(left); const r = rank(right);
  return r > l ? "右侧更好" : r < l ? "左侧更好" : "持平";
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[\s，。；：、,.!?;:()[\]【】]/g, "");
}

function mergeRows(left: ComparisonRun, right: ComparisonRun, key: JudgeKey): RequirementRow[] {
  const map = new Map<string, RequirementRow>();
  const add = (item: ComparisonRequirement, side: "left" | "right") => {
    const id = normalize(item.requirement) || item.id;
    const row = map.get(id);
    if (row) {
      if (side === "left") row.left = item; else row.right = item;
      return;
    }
    map.set(id, { label: item.requirement, ...(side === "left" ? { left: item } : { right: item }), same: false, winner: "仅一侧列出" });
  };
  for (const item of left.scores[key].quality?.taskCompletion?.requirements || []) add(item, "left");
  for (const item of right.scores[key].quality?.taskCompletion?.requirements || []) add(item, "right");
  const rows = [...map.values()];
  for (const row of rows) {
    if (!row.left || !row.right) continue;
    row.same = rank(row.left.status) === rank(row.right.status);
    row.winner = compareRequirement(row.left.status, row.right.status);
  }
  return rows;
}

function shortTopic(value: string) {
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

function judgeSection(run: ComparisonRun, key: JudgeKey) {
  const judge = run.scores[key];
  const quality = judge.quality;
  const lines = [`### ${judgeLabels[key]}`, "", `- 状态：${judge.status}`, `- 模型：${judge.model || "未记录"}`];
  if (quality) {
    const total = totalOf(judge);
    if (total !== null) lines.push(`- 总分：${total.toFixed(1)} / 100`);
    lines.push(`- 任务完成度：${taskLabels[quality.taskCompletion?.status || ""] || "无法确认"}`);
    lines.push(`- 内容判定：${qualificationLabels[quality.qualification?.status || ""] || "无法判断"}`);
    const dimensions = Object.entries(quality.dimensions).filter(([, value]) => value.applicable !== false);
    if (dimensions.length) {
      lines.push("- 评分维度：");
      for (const [id, value] of dimensions) lines.push(`  - ${value.label || id}：${value.score ?? "—"} / 100`);
    }
    if (quality.taskCompletion?.requirements?.length) {
      lines.push("- 逐项要求：");
      for (const item of quality.taskCompletion?.requirements) lines.push(`  - [${requirementLabels[item.status] || item.status}] ${item.requirement}${item.note ? ` — ${item.note}` : ""}`);
    }
    if (quality.gaps?.length) {
      lines.push("- 扣分原因：");
      for (const item of quality.gaps) lines.push(`  - ${item}`);
    }
    if (quality.suggestions?.length) {
      lines.push("- 改进建议：");
      for (const item of quality.suggestions) lines.push(`  - ${item}`);
    }
    if (quality.comment) lines.push(`- 总评：${quality.comment}`);
    const source = (quality as { source?: { truncated?: boolean } }).source;
    if (source?.truncated) lines.push("- 注意：评分输入不完整，分数仅供参考。");
  } else if (judge.error) {
    lines.push(`- 错误：${judge.error}`);
  }
  return lines.join("\n");
}

export function comparisonServiceFilename(comparison: Comparison, run: ComparisonRun) {
  const safe = run.serviceLabel.replace(/[\\/:*?"<>|]/g, "-");
  return `对比测评-${comparison.groupId.slice(0, 8)}-${safe}.md`;
}

export function comparisonOverviewFilename(comparison: Comparison) {
  return `对比测评-${comparison.groupId.slice(0, 8)}-对比内容.md`;
}

export function buildServiceMarkdown(comparison: Comparison, run: ComparisonRun) {
  const lines = [
    `# ${run.serviceLabel} · 问题 / 回答 / 评分`,
    "",
    `- 对比组：${comparison.groupId}`,
    `- 规则：${comparison.rule.name} v${comparison.rule.version}`,
    `- 运行 ID：${run.runId}`,
    `- 执行状态：${run.executionStatus}`,
    `- 评分状态：${run.scoringStatus}`,
    `- 耗时：${formatElapsed(run.elapsedMs)}`,
    `- 开始时间：${formatDate(run.startedAt)}`,
    "",
    "## 题目",
    "",
    comparison.question,
    "",
    "## 回答",
    "",
    cleanAnswer(run.answer) || "（没有可显示的回答）",
    "",
    ...(run.answerTruncated ? ["", "> 保存的回答已截断。"] : []),
    "",
    "## 评分",
    "",
    ...judgeKeys.map((key) => judgeSection(run, key)),
    "",
    ...(run.error ? [`> 执行错误：${run.error}`, ""] : []),
    ...(run.scoreError ? [`> 评分错误：${run.scoreError}`, ""] : []),
    "> 模型评分不等于独立事实核验；百分制只表示回答质量，不代表科学真实性。",
  ];
  return `${lines.join("\n")}\n`;
}

export function buildComparisonMarkdown(comparison: Comparison, { preview = false }: { preview?: boolean } = {}) {
  const [left, right] = comparison.runs;
  if (!left || !right) return `# 对比测评\n\n对比组数据不完整。\n`;
  const dsComparable = preview || comparable(left, right, "deepSeekScore");
  const qwComparable = preview || comparable(left, right, "qwenScore");
  const dsDelta = dsComparable && totalOf(left.scores.deepSeekScore) !== null && totalOf(right.scores.deepSeekScore) !== null
    ? (totalOf(right.scores.deepSeekScore) as number) - (totalOf(left.scores.deepSeekScore) as number) : null;
  const qwDelta = qwComparable && totalOf(left.scores.qwenScore) !== null && totalOf(right.scores.qwenScore) !== null
    ? (totalOf(right.scores.qwenScore) as number) - (totalOf(left.scores.qwenScore) as number) : null;
  const leader = dsDelta !== null && qwDelta !== null && dsDelta > 0 && qwDelta > 0 ? right : dsDelta !== null && qwDelta !== null && dsDelta < 0 && qwDelta < 0 ? left : null;
  const bothFailed = dsComparable && qwComparable && [left, right].every((run) => judgeKeys.every((key) => run.scores[key].quality?.qualification?.status === "not_qualified"));
  const dsRows = mergeRows(left, right, "deepSeekScore");
  const commonGaps = dsRows.filter((row) => row.left && row.right && ["partial", "missing"].includes(row.left.status) && ["partial", "missing"].includes(row.right.status)).map((row) => row.label);
  const title = !dsComparable || !qwComparable ? "评分暂不可比较" : leader ? `${leader.serviceLabel} 总分领先${bothFailed ? "，但双方都未合格" : ""}` : dsDelta === 0 && qwDelta === 0 ? "两家评委总分持平" : "两家评委总分结论不一致";
  const lines = [
    "# 对比测评 · 对比内容",
    "",
    `- 对比组：${comparison.groupId}`,
    `- 规则：${comparison.rule.name} v${comparison.rule.version}`,
    `- 时间：${formatDate(comparison.createdAt)}`,
    "",
    "## 题目",
    "",
    comparison.question,
    "",
    "## 结论",
    "",
    title,
    "",
    ...(commonGaps.length ? [`双方共同缺少：${commonGaps.slice(0, 3).map(shortTopic).join("、")}。`] : []),
    ...(!dsComparable || !qwComparable ? ["双方需执行完成，且同一规则、同一评委模型的有效评分才展示综合结论。"] : []),
    "",
    "## 服务概览",
    "",
    "| 服务 | 执行 | 评分 | 耗时 | DeepSeek | 千问 |",
    "| --- | --- | --- | --- | ---: | ---: |",
    `| ${left.serviceLabel} | ${left.executionStatus} | ${left.scoringStatus} | ${formatElapsed(left.elapsedMs)} | ${totalOf(left.scores.deepSeekScore)?.toFixed(1) ?? "—"} | ${totalOf(left.scores.qwenScore)?.toFixed(1) ?? "—"} |`,
    `| ${right.serviceLabel} | ${right.executionStatus} | ${right.scoringStatus} | ${formatElapsed(right.elapsedMs)} | ${totalOf(right.scores.deepSeekScore)?.toFixed(1) ?? "—"} | ${totalOf(right.scores.qwenScore)?.toFixed(1) ?? "—"} |`,
    "",
    "## 逐项核对",
    "",
  ];
  for (const key of judgeKeys) {
    const rows = mergeRows(left, right, key);
    lines.push(`### ${judgeLabels[key]}`, "");
    lines.push("| 要求 | " + left.serviceLabel + " | " + right.serviceLabel + " | 判断 |");
    lines.push("| --- | --- | --- | --- |");
    for (const row of rows) {
      const leftCell = row.left ? `${requirementLabels[row.left.status] || row.left.status}${row.left.note ? `：${row.left.note}` : ""}` : "未列出";
      const rightCell = row.right ? `${requirementLabels[row.right.status] || row.right.status}${row.right.note ? `：${row.right.note}` : ""}` : "未列出";
      lines.push(`| ${row.label.replace(/\|/g, "\\|")} | ${leftCell.replace(/\|/g, "\\|")} | ${rightCell.replace(/\|/g, "\\|")} | ${row.winner} |`);
    }
    lines.push("", "| 维度 | " + left.serviceLabel + " | " + right.serviceLabel + " | 分差 |", "| --- | ---: | ---: | ---: |");
    const ids = new Set<string>();
    for (const run of [left, right]) for (const [id, value] of Object.entries(run.scores[key].quality?.dimensions || {})) if (value.applicable !== false) ids.add(id);
    for (const id of ids) {
      const l = left.scores[key].quality?.dimensions?.[id];
      const r = right.scores[key].quality?.dimensions?.[id];
      const lScore = typeof l?.score === "number" ? l.score : null;
      const rScore = typeof r?.score === "number" ? r.score : null;
      const delta = lScore !== null && rScore !== null ? rScore - lScore : null;
      lines.push(`| ${l?.label || r?.label || id} | ${lScore ?? "—"} / 100 | ${rScore ?? "—"} / 100 | ${delta === null ? "不可比" : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`} |`);
    }
    lines.push("");
  }
  lines.push("## 差异摘要", "");
  lines.push(`- 共同缺失：${commonGaps.slice(0, 3).map(shortTopic).join("、") || "未提取到共同缺失项"}`);
  lines.push(`- ${right.serviceLabel} 风险：${(right.scores.deepSeekScore.quality?.gaps || []).slice(0, 3).map((item) => shortTopic(item)).join("、") || "未记录"}`);
  lines.push(`- ${left.serviceLabel} 问题：${(left.scores.deepSeekScore.quality?.gaps || []).slice(0, 3).map((item) => shortTopic(item)).join("、") || "未记录"}`);
  lines.push("", "> 模型评分不等于独立事实核验；百分制只表示回答质量，不代表科学真实性。", "");
  return `${lines.join("\n")}\n`;
}

export function downloadMarkdown(filename: string, content: string) {
  if (typeof document === "undefined") return;
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportComparisonFiles(comparison: Comparison, options: { preview?: boolean } = {}) {
  const [left, right] = comparison.runs;
  if (!left || !right) return;
  downloadMarkdown(comparisonServiceFilename(comparison, left), buildServiceMarkdown(comparison, left));
  setTimeout(() => downloadMarkdown(comparisonServiceFilename(comparison, right), buildServiceMarkdown(comparison, right)), 120);
  setTimeout(() => downloadMarkdown(comparisonOverviewFilename(comparison), buildComparisonMarkdown(comparison, options)), 240);
}
