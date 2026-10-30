"use client";

import { useEffect, useState } from "react";
import { AnswerMarkdown } from "@/components/answer-markdown";
import { RunServiceInfo } from "@/components/run-service-info";
import { RunServiceDetails } from "@/components/run-service-details";
import { UnifiedScores } from "@/components/unified-scores";
import { watchUnifiedRun, type UnifiedRunSnapshot } from "@/lib/unified-run-poll";

type Run = UnifiedRunSnapshot;
const names: Record<string, string> = { "alpha-rsi": "1110", alloy: "合金材料", literature: "文献检索", "literature-aircraft": "航空文献", synthesis: "合成制备", "new-material": "新材料" };
const statuses: Record<string, string> = { running: "运行中", scoring: "评分中", done: "已结束", error: "失败" };
const executionStatuses: Record<string, string> = { running: "运行中", succeeded: "已结束", failed: "失败" };
const scoringStatuses: Record<string, string> = { pending: "评分中", ready: "已完成", failed: "评分失败", unavailable: "未配置", absent: "无评分", unknown: "状态未知" };

export function UnifiedRunDetail({ runId }: { runId: string }) {
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => watchUnifiedRun(runId, {
    onData: data => { setRun(data); setError(""); },
    onError: (message, retrying) => setError(`${message}${retrying ? " 正在自动重试…" : " 请重试读取。"}`),
  }), [runId, retry]);
  if (!run) return <div className="chat-state">{error ? <><p role="alert">{error}</p><button type="button" className="secondary-button" onClick={() => setRetry((value) => value + 1)}>重试</button></> : "正在读取运行…"}</div>;
  return <div className="chat-view"><div className="chat-top"><h1>运行详情</h1><span className={`run-dot ${run.status === "done" ? "done" : run.status === "error" ? "error" : "running"}`} /><span>{statuses[run.status] || "状态未知"} · {names[run.serviceKey] || run.serviceKey}</span></div>
    <div className="chat-scroll"><div className="chat-scroll-inner"><div className="run-layout">
      <div className="run-chat" role="region" aria-label="对话内容" tabIndex={0}><p className="run-question">{run.question}</p><section className="run-answer-block"><div className="run-answer-head"><strong>{names[run.serviceKey] || run.serviceKey}</strong><span>回答</span></div><div className="run-answer"><AnswerMarkdown content={run.answer} streaming={run.executionStatus === "running" || (!run.executionStatus && run.status === "running")} /></div><RunServiceDetails run={run.run} runId={run.runId} canReply={run.canReply} snapshotOnly={run.recoveryState === "snapshot_only"} onRefresh={() => setRetry(value => value + 1)} />{run.answerTruncated && <p className="run-score-note">保存的回答已截断。</p>}{error && <div role="alert"><p className="eval-error">{error}</p><button type="button" className="secondary-button" onClick={() => setRetry(value => value + 1)}>重试读取运行</button></div>}</section></div>
      <aside className="run-panel" tabIndex={0} aria-label="测评结果"><div className="run-panel-head"><h2>测评结果</h2><p>运行结束不代表题目要求已完成。</p></div><section className="run-block"><h3>运行信息</h3><dl className="run-info"><div><dt>运行 ID</dt><dd className="mono">{run.runId}</dd></div><RunServiceInfo serviceName={names[run.serviceKey] || run.serviceKey} run={run.run} /><div><dt>执行</dt><dd>{executionStatuses[run.executionStatus || ""] || "状态未知"}</dd></div><div><dt>评分</dt><dd>{scoringStatuses[run.scoringStatus || ""] || "状态未知"}</dd></div><div><dt>来源</dt><dd>{run.origin === "manual" ? "人工对话" : run.origin === "automation" ? "自动化" : run.origin === "legacy" ? "其他入口" : "未知"}</dd></div>{run.questionId && <div><dt>题库 ID</dt><dd>{run.questionId}</dd></div>}{run.datasetVersion && <div><dt>数据集</dt><dd>{run.datasetVersion}</dd></div>}</dl>{run.recoveryState === "snapshot_only" && ["running", "scoring"].includes(run.status) && <p className="run-score-note">显示的是已保存的快照，当前进程无法确认任务是否仍在运行。</p>}{run.error && <p className="run-score-note">{run.error}</p>}</section><section className="run-block"><h3>评分</h3>{run.scoreError && <p className="run-score-note">{run.scoreError}</p>}<UnifiedScores scores={run.scores} run={run.run} /></section><p className="run-note">模型评分不代表科学真实性。</p></aside>
    </div></div></div></div>;
}
