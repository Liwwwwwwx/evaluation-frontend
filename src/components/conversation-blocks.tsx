"use client";

import { useId, useMemo, useState } from "react";
import { AnswerMarkdown } from "@/components/answer-markdown";

type Event = Record<string, unknown>;

const statusNames: Record<string, string> = {
  running: "运行中",
  unknown: "状态待确认",
  success: "完成",
  warning: "需留意",
  failed: "失败",
  error: "失败",
  skipped: "已跳过",
  timeout: "超时",
};

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function list(value: unknown): Event[] {
  return Array.isArray(value) ? value.filter((item): item is Event => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function StatusIcon({ status }: { status: string }) {
  if (status === "running") return <span className="conversation-step-spinner" aria-hidden="true" />;
  if (status === "success") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" /></svg>;
  if (status === "warning") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 8v4" /><path d="M12 16h.01" /></svg>;
  if (status === "failed" || status === "error") return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" /></svg>;
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 12h12" /></svg>;
}

function Step({ step, uncertain = false }: { step: Event; uncertain?: boolean }) {
  const detailId = useId();
  const [expanded, setExpanded] = useState(false);
  const title = text(step.title).trim() || "处理步骤";
  const detail = text(step.detail).trim();
  const metrics = list(step.metrics);
  const summary = detail || metrics.map((metric) => [text(metric.label), text(metric.value), text(metric.unit)].filter(Boolean).join(" ")).join(" · ");
  const storedStatus = text(step.status).trim() || "unknown";
  const status = uncertain && storedStatus === "running" ? "unknown" : storedStatus;
  const hasDetail = Boolean(detail || metrics.length);
  const head = <>
    <span className={`conversation-step-icon status-${status}`} aria-hidden="true"><StatusIcon status={status} /></span>
    <span className="conversation-step-title">{title}</span>
    {summary && <span className="conversation-step-preview">{summary}</span>}
    <span className="conversation-step-status">{statusNames[status] || "状态未知"}</span>
    {hasDetail && <svg className="conversation-step-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>}
  </>;
  return <div className={`conversation-step tone-${status}`}>
    {hasDetail
      ? <button type="button" className="conversation-step-row" aria-expanded={expanded} aria-controls={detailId} onClick={() => setExpanded((value) => !value)}>{head}</button>
      : <div className="conversation-step-row">{head}</div>}
    {expanded && hasDetail && <div id={detailId} className="conversation-step-detail">
      {detail && <div className="conversation-step-detail-text">{detail}</div>}
      {metrics.length > 0 && <div className="conversation-step-metrics">{metrics.map((metric, index) => <span key={`${text(metric.label)}:${index}`}>{text(metric.label)}: {text(metric.value)}{text(metric.unit) ? ` ${text(metric.unit)}` : ""}</span>)}</div>}
    </div>}
  </div>;
}

export function InlineProcess({ steps, uncertain = false }: { steps: Event[]; uncertain?: boolean }) {
  if (!steps.length) return null;
  return <section className="conversation-steps" aria-label="处理过程">
    {steps.map((step, index) => <Step key={text(step.step_id) || String(index)} step={step} uncertain={uncertain} />)}
  </section>;
}

export function TeamOutputBlock({ event, live, uncertain = false }: { event: Event; live: boolean; uncertain?: boolean }) {
  const [expanded, setExpanded] = useState(true);
  const ended = event.phase === "end" || event.phase === "exit";
  const status = text(event.status) || (ended ? "success" : "running");
  const settled = status === "running" && !live;
  const streaming = status === "running" && live;
  const team = event.team && typeof event.team === "object" ? event.team as Event : {};
  const body = ended && typeof event.content === "string" ? event.content : text(event.delta);
  const elapsed = typeof event.elapsed_s === "number" && Number.isFinite(event.elapsed_s) ? ` · ${Math.round(event.elapsed_s)} 秒` : "";
  const callSeq = typeof event.call_seq === "number" && event.call_seq > 1 ? ` · 第 ${event.call_seq} 次` : "";
  const label = settled ? (uncertain ? "状态待确认" : "已结束") : status === "running" ? "生成中" : statusNames[status] || "状态未知";
  return <section className={`conversation-output${streaming ? " is-live" : ""}`} aria-label="团队输出">
    <button type="button" className="conversation-output-head" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
      <span className="conversation-output-source">团队输出 · {text(team.name) || "未命名团队"}{callSeq}</span>
      <span className="conversation-output-status" data-status={settled ? "settled" : status}>{streaming && <span className="conversation-output-dot" aria-hidden="true" />}{label}</span>
      {elapsed && <span className="conversation-output-elapsed">{elapsed}</span>}
      <svg className="conversation-output-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    {body && <div className="conversation-output-body" hidden={!expanded}>
      {event.fence_risk === true ? <pre>{body}</pre> : <AnswerMarkdown content={body} streaming={streaming} breaks />}
    </div>}
  </section>;
}

export function RecommendationCard({ title, items }: { title: string; items: Event[] }) {
  const list = items.filter((item) => text(item.text || item.question).trim().length > 0);
  if (!list.length) return null;
  return <section className="conversation-recommendation" aria-label={title}>
    <div className="conversation-recommendation-head">
      <svg className="conversation-recommendation-spark" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l1.7 4.6L18 9.3l-4.3 1.7L12 16l-1.7-5L6 9.3l4.3-1.7L12 3Z" /><path d="M19 15l.7 1.9L21.6 18l-1.9.7L19 20.6l-.7-1.9L16.4 18l1.9-1.1L19 15Z" /></svg>
      <span className="conversation-recommendation-title">{title}</span>
      <span className="conversation-recommendation-count">{String(list.length).padStart(2, "0")}</span>
    </div>
    <div className="conversation-recommendation-list">
      {list.map((item, index) => {
        const body = text(item.text) || text(item.question);
        const prompt = text(item.prompt);
        return <div className="conversation-recommendation-item" key={`${text(item.id) || index}`}>
          <span className="conversation-recommendation-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
          <span className="conversation-recommendation-body"><span className="conversation-recommendation-text">{body}</span>{prompt && prompt !== body && <span className="conversation-recommendation-prompt">{prompt}</span>}</span>
        </div>;
      })}
    </div>
  </section>;
}

export function FollowupAnswer({ event }: { event: Event }) {
  const answer = text(event.answer);
  const rows = useMemo(() => answer.split(/\n+/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const index = line.search(/[：:]/);
    return index <= 0 ? { label: "", value: line } : { label: line.slice(0, index).trim(), value: line.slice(index + 1).trim() };
  }), [answer]);
  if (!rows.length) return null;
  return <div className="conversation-followup-answer">
    <span className="conversation-followup-label">已答</span>
    <div className="conversation-followup-rows">{rows.map((row, index) => <div className="conversation-followup-row" key={`${index}:${row.label}`}>
      {row.label && <span className="conversation-followup-row-label" title={row.label}>{row.label}</span>}
      <span className="conversation-followup-row-value">{row.value}</span>
    </div>)}</div>
  </div>;
}
