import type { BatchSource, BatchState, JudgeSummary } from "@/lib/batch-types";
import { StatusDot, type StatusTone } from "@/components/ui";
import styles from "./batches.module.css";

const stateLabels: Record<BatchState, string> = {
  preparing: "准备题目",
  dispatching: "派发中",
  running: "执行中",
  done: "已完成",
  partial: "部分完成",
  failed: "计划失败",
};

const sourceLabels: Record<BatchSource, string> = { trial: "多服务试跑", mission: "Mission 每日" };

export function stateLabel(state: BatchState) {
  return stateLabels[state] || "状态未知";
}

export function sourceLabel(source: BatchSource) {
  return sourceLabels[source] || source;
}

export function statusTone(state: BatchState): StatusTone {
  if (state === "done") return "success";
  if (state === "failed") return "danger";
  if (state === "partial") return "warning";
  return "info";
}

export function BatchStatus({ state }: { state: BatchState }) {
  return <StatusDot tone={statusTone(state)}>{stateLabel(state)}</StatusDot>;
}

export function formatScore(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : "—";
}

export function formatMean(judge: JudgeSummary) {
  return formatScore(judge.mean);
}

export function judgeStateDescription(judge: JudgeSummary) {
  const states: [number | undefined, string][] = [
    [judge.ready, "有效"], [judge.provisional, "暂定"], [judge.pending, "评分中"],
    [judge.failed, "评分失败"], [judge.unavailable, "未配置"], [judge.absent, "无评分"], [judge.invalid, "评分无效"],
  ];
  return states.filter(([count]) => count && count > 0).map(([count, label]) => `${label} ${count}`).join(" · ") || "暂无评分记录";
}

export function formatDelta(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value === 0) return "0.0";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}

export function deltaTone(value: number | null | undefined) {
  if (typeof value !== "number" || value === 0) return "";
  return value > 0 ? styles.deltaUp : styles.deltaDown;
}

export function formatDate(date: string) {
  return date;
}

export function formatDateTime(value: string | null) {
  if (!value) return "未记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未记录";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date).replace(/\//g, "-");
}

export function formatElapsed(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (value < 60000) return `${Math.max(1, Math.round(value / 1000))} 秒`;
  const minutes = value / 60000;
  return `${minutes >= 10 ? Math.round(minutes) : minutes.toFixed(1)} 分`;
}

export function lowestScore(run: { scores: { deepSeek: number | null; qwen: number | null } }) {
  const values = [run.scores.deepSeek, run.scores.qwen].filter((value): value is number => typeof value === "number");
  return values.length ? Math.min(...values) : null;
}

export function executionLabel(execution: string) {
  return { completed: "已完成", failed: "失败", timeout: "超时", unfinished: "未完成" }[execution] || "状态未知";
}

export function executionTone(execution: string): StatusTone {
  if (execution === "completed") return "success";
  if (execution === "failed") return "danger";
  if (execution === "timeout") return "warning";
  return "info";
}

export function ScorePair({ deepSeek, qwen }: { deepSeek: number | null; qwen: number | null }) {
  return <span className={styles.scorePair}><span>DS <b>{formatScore(deepSeek)}</b></span><span>QW <b>{formatScore(qwen)}</b></span></span>;
}

export function JudgeMeans({ scores }: { scores: { deepSeek: JudgeSummary; qwen: JudgeSummary } }) {
  return <span className={styles.scorePair}><span>DS <b>{formatMean(scores.deepSeek)}</b>（{judgeStateDescription(scores.deepSeek)}）</span><span>QW <b>{formatMean(scores.qwen)}</b>（{judgeStateDescription(scores.qwen)}）</span></span>;
}

export function PreviewNote() {
  return <p className={styles.previewNote} role="note"><strong>界面预览</strong> 当前为演示数据，未接入真实批次接口；所有数字仅用于查看布局和状态。</p>;
}
