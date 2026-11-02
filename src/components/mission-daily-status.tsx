"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type DailyScore = { status?: string; total?: number | null };
type DailyItem = { questionId: string; datasetVersion: string; question: string; runId: string | null; status: string; scores?: Record<string, DailyScore> | null };
type DailyStatus = { enabled: boolean; ready: boolean; time: string; targetCount: number; last: null | { date: string; state: string; reason: string | null; count: number; items: DailyItem[] } };
const statusNames: Record<string, string> = { queued: "排队中", running: "运行中", scoring: "评分中", done: "已结束", error: "失败", not_dispatched: "等待创建" };
const planNames: Record<string, string> = { dispatching: "创建中", submitted: "已创建", empty: "没有可用题目", skipped: "本轮未执行" };
function scoreLabel(score?: DailyScore) {
  if (score?.status === "ready" && typeof score.total === "number" && Number.isFinite(score.total)) return `${score.total} / 100`;
  return ({ pending: "评分中", failed: "评分失败", unavailable: "未配置", skipped: "不可评分" } as Record<string, string>)[score?.status || ""] || "待评分";
}

export function MissionDailyStatus() {
  const [data, setData] = useState<DailyStatus | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      try {
        const response = await fetch("/api/evaluation/unified/mission-daily", { cache: "no-store", signal: controller.signal });
        const value = await response.json();
        if (!response.ok || typeof value.enabled !== "boolean" || typeof value.ready !== "boolean") throw new Error("invalid");
        if (!controller.signal.aborted) { setData(value); setError(false); }
      } catch { if (!controller.signal.aborted) setError(true); }
      if (!controller.signal.aborted) timer = setTimeout(() => void load(), 30000);
    }
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, []);
  return <section className="mission-daily" aria-labelledby="mission-daily-title">
    <h2 id="mission-daily-title">主服务每日测评</h2>
    {error ? <p role="status">暂时无法读取每日测评状态，请稍后重试。</p> : !data ? <p>正在读取每日测评状态…</p> : <>
      <p>Mission_ScienceMaterial · 每天北京时间 {data.time} · 最多 {data.targetCount} 题 · {!data.enabled ? "未启用" : data.ready ? "已启用" : "未就绪"}</p>
      {data.last ? <details><summary>最近一轮：{data.last.date} · {planNames[data.last.state] || "状态未知"} · {data.last.count} 题 · 已结束 {data.last.items.filter(item => ["done", "error"].includes(item.status)).length} · 失败 {data.last.items.filter(item => item.status === "error").length}</summary>
        {data.last.reason && <p>{data.last.reason}</p>}
        <ul>{data.last.items.map(item => <li key={`${item.questionId}:${item.datasetVersion}`}>
          {item.runId ? <Link href={`/runs/${encodeURIComponent(item.runId)}`}>{item.question}</Link> : <span>{item.question}</span>}
          <span> · {statusNames[item.status] || "状态未知"} · DeepSeek {scoreLabel(item.scores?.deepSeekScore)} · 千问 {scoreLabel(item.scores?.qwenScore)}</span>
        </li>)}</ul>
      </details> : <p>暂无每日测评记录。</p>}
    </>}
  </section>;
}
