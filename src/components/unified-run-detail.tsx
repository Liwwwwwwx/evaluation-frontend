"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConversationAnswer } from "@/components/conversation-answer";
import { RunServiceDetails } from "@/components/run-service-details";
import { RescoreButton } from "@/components/rescore-button";
import { UnifiedScores } from "@/components/unified-scores";
import { RunMarkdownExport } from "@/components/run-markdown-export";
import { RerunButton } from "@/components/rerun-button";
import { EndRunButton } from "@/components/end-run-button";
import { RunCopyButton } from "@/components/run-copy-button";
import { BackLink } from "@/components/ui";
import { appendFrom } from "@/lib/navigation";
import { copyableRunAnswer } from "@/lib/copy-run-answer";
import { type UnifiedRunSnapshot } from "@/lib/unified-run-poll";
import { watchLiveUnifiedRun } from "@/lib/unified-run-watch";
import { isRunOutputActive, useFollowRunOutput } from "@/lib/use-follow-run-output";
import { isUncertainRun, runStatusLabel } from "@/lib/run-status";

type Run = UnifiedRunSnapshot;
const names: Record<string, string> = { "mission-material": "Mission 主服务", "alpha-rsi": "材料配比 RSI", "alpha-combined-rsi": "配比+制备 RSI", alloy: "合金材料", literature: "文献检索", "literature-aircraft": "航空文献", synthesis: "合成制备", "new-material": "新材料" };

export function UnifiedRunDetail({ runId, backHref = "/runs", backLabel = "返回运行记录", selfHref }: { runId: string; backHref?: string; backLabel?: string; selfHref?: string }) {
  const router = useRouter();
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const uncertain = isUncertainRun(run?.status, run?.recoveryState);
  const following = !uncertain && isRunOutputActive(run?.status, run?.executionStatus);
  const conversationRef = useFollowRunOutput(runId, following, run?.answer, run?.run);
  useEffect(() => watchLiveUnifiedRun(runId, {
    onData: data => { setRun(data); setError(""); },
    onError: (message, retrying) => setError(`${message}${retrying ? " 正在自动重试…" : " 请重试读取。"}`),
  }), [runId, retry]);
  if (!run) return <div className="chat-state">{error ? <><p role="alert">{error}</p><button type="button" className="secondary-button" onClick={() => setRetry((value) => value + 1)}>重试</button></> : "正在读取运行…"}</div>;
  const native = run.run && typeof run.run === "object" ? run.run as Record<string, unknown> : null;
  const cleared = Boolean(native?.outputClearedAt);
  const replacement = typeof native?.replacementRunId === "string" ? native.replacementRunId : null;
  return <div className="chat-view">
    <div className="chat-top run-detail-top"><h1>运行详情</h1><span className={`run-dot ${run.status === "done" ? "done" : ["cancelled", "paused"].includes(run.status) ? "cancelled" : run.status === "error" ? "error" : uncertain ? "" : "running"}`} /><span className="run-detail-state">{cleared ? "输出已清除" : runStatusLabel(run.status, run.recoveryState)} · {names[run.serviceKey] || run.serviceKey}</span><div className="run-detail-actions"><BackLink href={backHref}>{backLabel}</BackLink>{run.comparisonGroupId && <Link className="secondary-button" href={appendFrom(`/compare/${encodeURIComponent(run.comparisonGroupId)}`, selfHref || `/runs/${encodeURIComponent(runId)}`)}>查看双服务对比</Link>}{run.canEnd && <EndRunButton runId={runId} onEnded={() => setRetry(value => value + 1)} />}<RerunButton runId={runId} allowed={run.canRerun} preservesOutput={run.rerunPreservesOutput === true} onCreated={id => {
      try { sessionStorage.setItem("evaluation-unified-run", id); } catch { /* 仍可通过新运行地址查看结果。 */ }
      setRun(null); setError("");
      window.dispatchEvent(new Event("evaluation-unified-change"));
      router.push(`/runs/${encodeURIComponent(id)}`);
    }} />{!cleared && <RunMarkdownExport run={run} readError={error} />}</div></div>
    <div className="chat-scroll"><div className="chat-scroll-inner"><div className="run-layout">
      <div ref={conversationRef} className="run-chat" role="region" aria-label="对话内容" tabIndex={0}>
        <div className="run-question-wrap"><p className="run-question">{run.question}</p><RunCopyButton label="提问" getText={() => run.question} /></div>
        <section className="run-answer-block">
          <div className="run-answer-head"><strong>{names[run.serviceKey] || run.serviceKey}</strong><span>回答</span>{!cleared && <RunCopyButton label="回答" getText={() => copyableRunAnswer(run.answer, run.run, following)} />}</div>
          {cleared ? <p className="run-score-note">本次保存的输出和评分已清除。{replacement && <Link href={`/runs/${encodeURIComponent(replacement)}`}>查看新一轮测评</Link>}</p> : <div className="run-answer"><ConversationAnswer content={run.answer} run={run.run} streaming={!uncertain && (run.executionStatus === "running" || (!run.executionStatus && run.status === "running"))} uncertain={uncertain} /></div>}
          <RunServiceDetails run={run.run} runId={run.runId} canReply={run.canReply} snapshotOnly={run.recoveryState === "snapshot_only"} onRefresh={() => setRetry(value => value + 1)} />
          {run.answerTruncated && <p className="run-score-note">保存的回答已截断。</p>}
          {error && <div role="alert"><p className="eval-error">{error}</p><button type="button" className="secondary-button" onClick={() => setRetry(value => value + 1)}>重试读取运行</button></div>}
        </section>
      </div>
      <aside className="run-panel" tabIndex={0} aria-label="评分">
        <div className="run-panel-head run-panel-head-row"><h2>评分</h2><RescoreButton runId={run.runId} allowed={run.canRescore} revision={JSON.stringify(run.run && typeof run.run === "object" ? (run.run as Record<string, unknown>).scoring : null)} onRefresh={() => setRetry(value => value + 1)} /></div>
        {uncertain && <p className="run-score-note">这是已保存的运行快照，当前进程无法确认远端任务是否仍在执行，也无法结束它；已保存的内容仍可查看。</p>}
        {run.error && <p className="run-score-note">{run.error}</p>}
        {run.persistenceError && <p role="alert" className="run-score-note">评分保存失败，当前仅显示内存结果，请稍后重试读取。</p>}
        {run.scoreError && <p className="run-score-note">{run.scoreError}</p>}
        {cleared ? <p className="run-score-note">本次评分已清除。</p> : uncertain && (["queued", "running"].includes(run.executionStatus || run.status) || !run.scores) ? <p className="run-score-note">当前没有可确认的评分结果。</p> : <UnifiedScores scores={run.scores} run={run.run} executionStatus={run.executionStatus} />}
      </aside>
    </div></div></div>
  </div>;
}
