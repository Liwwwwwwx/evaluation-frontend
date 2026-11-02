import { normalizeAnswerMarkdown } from "@/lib/answer-markdown";
import { conversationSegments } from "@/lib/conversation-layout";
import { record, records, text } from "@/lib/structured-results";
import { type UnifiedRunSnapshot } from "@/lib/unified-run-poll";

const scoreStates: Record<string, string> = { pending: "评分中", ready: "已完成", failed: "评分失败", unavailable: "未配置", absent: "无评分", partial: "部分完成", skipped: "不适用", unknown: "状态未知" };
const scoreNames: Record<string, string> = { deepSeekScore: "DeepSeek", qwenScore: "千问", quality: "质量解读" };

function serviceAddress(value: unknown): string {
  try {
    const url = new URL(typeof value === "string" ? value : "");
    return ["ws:", "wss:", "http:", "https:"].includes(url.protocol) ? `${url.protocol}//${url.host}${url.pathname}` : "";
  } catch { return ""; }
}

function fenced(content: string): string {
  let longest = 2;
  for (const match of content.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
  const fence = "`".repeat(longest + 1);
  return `${fence}\n${content}\n${fence}`;
}

function modelReport(name: string, value: unknown): string[] {
  const item = record(value);
  const quality = record(item?.quality);
  const lines = [`## ${name}`, ""];
  if (!item) return [...lines, "暂无评分。", ""];
  if (item.status !== "ready") {
    lines.push(scoreStates[text(item.status)] || "状态未知", "");
    if (text(item.error)) lines.push(text(item.error), "");
    return lines;
  }

  const total = quality?.total;
  const clarity = record(quality?.clarity);
  const raw = clarity?.score;
  const legacyScore = typeof raw === "number" && Number.isFinite(raw) && raw >= 1 && raw <= 5 ? raw : null;
  if (typeof total === "number" && Number.isFinite(total) && total >= 0 && total <= 100) lines.push(`总分：${total} / 100`, "");
  else if (legacyScore !== null) lines.push(`可理解度：${Math.round(legacyScore / 5 * 1000) / 10} / 100（原分 ${legacyScore} / 5）`, "");
  else lines.push("暂无有效分数。", "");

  const dimensions = record(quality?.dimensions) || record(clarity?.dimensions);
  if (dimensions) {
    for (const [key, value] of Object.entries(dimensions)) {
      const dimension = record(value); if (!dimension) continue;
      const score = dimension.score;
      const valid = typeof score === "number" && Number.isFinite(score);
      const display = dimension.applicable === false ? "不适用" : valid && legacyScore !== null && score >= 1 && score <= 5 ? `${Math.round(score / 5 * 1000) / 10} / 100（原分 ${score} / 5）` : valid && legacyScore === null && score >= 0 && score <= 100 ? `${score} / 100` : "缺少评分";
      lines.push(`- ${text(dimension.label) || key}：${display}`);
    }
    lines.push("");
  }
  if (record(quality?.source)?.truncated === true) lines.push("> 评分仅基于截断后的正文。", "");
  return lines;
}

export function buildRunMarkdown(run: UnifiedRunSnapshot, { readError = "" } = {}): string {
  const native = record(run.run);
  const details = record(native?.details);
  const scores = record(run.scores);
  const streaming = run.executionStatus === "running" || (!run.executionStatus && run.status === "running");
  const address = serviceAddress(native?.serviceAddress);
  const addressNote = address && native?.serviceAddressSource === "configuration" ? "（当前配置）" : "";
  const lines = ["# 问题", "", run.question || "未记录题目。", "", "# 服务地址", "", `${address || "未记录。"}${addressNote}`, "", "# 正文内容", ""];

  if (run.answerTruncated) lines.push("> 正文已截断。", "");
  if (run.recoveryState === "snapshot_only") lines.push("> 当前为已保存快照，可能不是最新内容。", "");
  if (readError) lines.push(`> 页面读取异常，内容可能不是最新状态：${readError}`, "");

  const outputs = records(details?.displayEvents).filter(event => ["display.team_output", "display.final_answer"].includes(text(event.type)));
  const segments = conversationSegments(run.answer || "", outputs);
  let hasBody = false;
  for (const segment of segments) {
    if (segment.kind === "text") {
      const body = normalizeAnswerMarkdown(segment.content, { streaming }).trim();
      if (body) { lines.push(body, ""); hasBody = true; }
      continue;
    }
    const event = segment.event;
    const ended = event.phase === "end" || event.phase === "exit";
    const body = event.phase === "end" && typeof event.content === "string" ? event.content : text(event.delta);
    if (!body.trim()) continue;
    const team = record(event.team);
    lines.push(event.type === "display.final_answer" ? "**最终总结**" : `**团队输出 · ${text(team?.name) || "未命名团队"}**`, "", event.fence_risk === true ? fenced(body) : normalizeAnswerMarkdown(body, { streaming: streaming && !ended }), "");
    hasBody = true;
  }
  if (!hasBody) lines.push(streaming ? "等待服务输出…" : "暂无正文。", "");

  lines.push("# 评分", "");
  if (run.scoreError) lines.push(`> 评分错误：${run.scoreError}`, "");
  const entries = scores ? Object.entries(scores).filter(([key, value]) => Object.hasOwn(scoreNames, key) && record(value)) : [];
  if (!entries.length) lines.push(run.scoringStatus === "ready" ? "暂无评分。" : scoreStates[run.scoringStatus || ""] || "暂无评分。", "");
  else for (const [key, value] of entries) lines.push(...modelReport(scoreNames[key] || key, value));
  return lines.join("\n");
}

export function runMarkdownFilename(runId: string): string {
  const safe = runId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "run";
  return `测评运行-${safe}.md`;
}
