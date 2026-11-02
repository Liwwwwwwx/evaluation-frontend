"use client";

import { useEffect, useState } from "react";
import { ConversationAnswer } from "@/components/conversation-answer";
import { RunServiceDetails } from "@/components/run-service-details";
import { RescoreButton } from "@/components/rescore-button";
import { UnifiedScores } from "@/components/unified-scores";
import { RunMarkdownExport } from "@/components/run-markdown-export";
import { type UnifiedRunSnapshot } from "@/lib/unified-run-poll";
import { watchLiveUnifiedRun } from "@/lib/unified-run-watch";

type Run = UnifiedRunSnapshot;
const names: Record<string, string> = { "mission-material": "Mission 主服务", "alpha-rsi": "1110", alloy: "合金材料", literature: "文献检索", "literature-aircraft": "航空文献", synthesis: "合成制备", "new-material": "新材料" };
const statuses: Record<string, string> = { queued: "排队中", running: "运行中", scoring: "评分中", done: "已结束", error: "失败" };

export function UnifiedRunDetail({ runId }: { runId: string }) {
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => watchLiveUnifiedRun(runId, {
    onData: data => { setRun(data); setError(""); },
    onError: (message, retrying) => setError(`${message}${retrying ? " 正在自动重试…" : " 请重试读取。"}`),
  }), [runId, retry]);
  if (!run) return <div className="chat-state">{error ? <><p role="alert">{error}</p><button type="button" className="secondary-button" onClick={() => setRetry((value) => value + 1)}>重试</button></> : "正在读取运行…"}</div>;
  return <div className="chat-view">
    <div className="chat-top run-detail-top"><h1>运行详情</h1><span className={`run-dot ${run.status === "done" ? "done" : run.status === "error" ? "error" : "running"}`} /><span className="run-detail-state">{statuses[run.status] || "状态未知"} · {names[run.serviceKey] || run.serviceKey}</span><RunMarkdownExport run={run} readError={error} /></div>
    <div className="chat-scroll"><div className="chat-scroll-inner"><div className="run-layout">
      <div className="run-chat" role="region" aria-label="对话内容" tabIndex={0}>
        <p className="run-question">{run.question}</p>
        <section className="run-answer-block">
          <div className="run-answer-head"><strong>{names[run.serviceKey] || run.serviceKey}</strong><span>回答</span></div>
          <div className="run-answer"><ConversationAnswer content={run.answer} run={run.run} streaming={run.executionStatus === "running" || (!run.executionStatus && run.status === "running")} /></div>
          <RunServiceDetails run={run.run} runId={run.runId} canReply={run.canReply} snapshotOnly={run.recoveryState === "snapshot_only"} onRefresh={() => setRetry(value => value + 1)} />
          {run.answerTruncated && <p className="run-score-note">保存的回答已截断。</p>}
          {error && <div role="alert"><p className="eval-error">{error}</p><button type="button" className="secondary-button" onClick={() => setRetry(value => value + 1)}>重试读取运行</button></div>}
        </section>
      </div>
      <aside className="run-panel" tabIndex={0} aria-label="评分">
        <div className="run-panel-head run-panel-head-row"><h2>评分</h2><RescoreButton runId={run.runId} allowed={run.canRescore} revision={JSON.stringify(run.run && typeof run.run === "object" ? (run.run as Record<string, unknown>).scoring : null)} onRefresh={() => setRetry(value => value + 1)} /></div>
        {run.recoveryState === "snapshot_only" && ["queued", "running", "scoring"].includes(run.status) && <p className="run-score-note">显示的是已保存的快照，当前进程不能确认任务是否仍在执行或排队；请先核对运行记录。</p>}
        {run.error && <p className="run-score-note">{run.error}</p>}
        {run.persistenceError && <p role="alert" className="run-score-note">评分保存失败，当前仅显示内存结果，请稍后重试读取。</p>}
        {run.scoreError && <p className="run-score-note">{run.scoreError}</p>}
        <UnifiedScores scores={run.scores} run={run.run} executionStatus={run.executionStatus} />
      </aside>
    </div></div></div>
  </div>;
}
