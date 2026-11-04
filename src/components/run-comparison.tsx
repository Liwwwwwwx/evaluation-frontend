"use client";

import { AnswerMarkdown } from "@/components/answer-markdown";
import { ConversationAnswer } from "@/components/conversation-answer";
import { BackLink, StatusDot, type StatusTone } from "@/components/ui";
import type { Comparison, ComparisonJudge, ComparisonRun } from "@/lib/comparison-preview";
import { comparableJudge, totalOf } from "@/lib/comparison-validity";
import styles from "./run-comparison.module.css";

const judgeKeys = ["deepSeekScore", "qwenScore"] as const;
const judgeLabels: Record<(typeof judgeKeys)[number], string> = { deepSeekScore: "DeepSeek", qwenScore: "千问" };
const dimensionOrder = ["readability", "professionalism", "visualAids"];

const executionLabels: Record<string, string> = { queued: "排队中", running: "运行中", succeeded: "已完成", failed: "执行失败", cancelled: "已取消" };
const scoringLabels: Record<string, string> = { ready: "评分完成", partial: "部分评分", failed: "评分失败", pending: "评分中", absent: "无评分", unavailable: "未配置", skipped: "不适用" };
const taskLabels: Record<string, string> = { completed: "已完成", partial: "部分完成", clarification: "请求补充信息", failed: "未完成", unclear: "无法确认" };
const qualificationLabels: Record<string, string> = { qualified: "合格", not_qualified: "未达标", unclear: "无法判断" };
const judgeStateLabels: Record<string, string> = { pending: "评分中", failed: "评分失败", unavailable: "未配置", absent: "无评分", skipped: "不适用", invalid: "评分无效", unknown: "状态未知", ready: "评分完成" };

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function executionTone(status: string): StatusTone {
  return status === "succeeded" ? "success" : status === "queued" || status === "running" ? "info" : status === "cancelled" ? "neutral" : "danger";
}

function scoringTone(status: string): StatusTone {
  return status === "ready" ? "success" : status === "partial" ? "warning" : "danger";
}

function formatScore(value: number | null) {
  return value === null ? "" : `${value.toFixed(1)} / 100`;
}

function formatDelta(value: number | null) {
  if (value === null) return null;
  if (value === 0) return "0.0";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}

function deltaClass(value: number | null) {
  if (value === null || value === 0) return styles.deltaZero;
  return value > 0 ? styles.deltaUp : styles.deltaDown;
}

function formatElapsed(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "—";
  if (value < 60000) return `${Math.max(1, Math.round(value / 1000))} 秒`;
  const minutes = value / 60000;
  return minutes >= 10 ? `${Math.round(minutes)} 分` : `${minutes.toFixed(1)} 分`;
}

function dimensionKeys(runs: ComparisonRun[]) {
  const keys = new Set<string>();
  for (const run of runs) for (const judgeKey of judgeKeys) {
    for (const key of Object.keys(run.scores[judgeKey].quality?.dimensions || {})) keys.add(key);
  }
  return [...keys].sort((a, b) => {
    const ai = dimensionOrder.indexOf(a); const bi = dimensionOrder.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

function DeltaCell({ left, right }: { left: number | null; right: number | null }) {
  const value = left !== null && right !== null ? left - right : null;
  const text = formatDelta(value);
  if (text === null) return <span className={styles.na}>不可比</span>;
  return <b className={deltaClass(value)}>{text}</b>;
}

function JudgeTable({ judgeKey, runs, dimensionKeyList, preview }: { judgeKey: (typeof judgeKeys)[number]; runs: ComparisonRun[]; dimensionKeyList: string[]; preview: boolean }) {
  const items = runs.map((run) => run.scores[judgeKey]);
  const comparable = comparableJudge(runs[0], runs[1], judgeKey, preview);
  return <div className={styles.tableWrap}>
    <table className={styles.table}>
      <caption className="sr-only">两家服务的 {judgeLabels[judgeKey]} 评分对比</caption>
      <thead><tr><th scope="col">评分项</th>{runs.map((run) => <th key={run.runId} scope="col">{run.serviceLabel}</th>)}<th scope="col">分差</th></tr></thead>
      <tbody>
        <tr className={styles.totalRow}>
          <th scope="row">总分</th>
          {items.map((item, index) => <td key={runs[index].runId}>{item.status === "ready" ? formatScore(totalOf(item)) : judgeStateLabels[item.status] || "状态未知"}</td>)}
          <td>{comparable ? <DeltaCell left={totalOf(items[0])} right={totalOf(items[1])} /> : <span className={styles.na}>不可比</span>}</td>
        </tr>
        {dimensionKeyList.map((dimensionKey) => {
          const dimensions = items.map((item) => item.quality?.dimensions?.[dimensionKey]);
          return <tr key={dimensionKey}>
            <th scope="row">{dimensions[0]?.label || dimensions[1]?.label || dimensionKey}{typeof dimensions[0]?.weight === "number" ? ` · ${Math.round(dimensions[0].weight * 100)}%` : ""}</th>
            {dimensions.map((dimension, index) => <td key={runs[index].runId}>{
              !dimension ? "缺少评分" : dimension.applicable === false ? "不适用" : number(dimension.score) === null ? "缺少评分" : `${dimension.score} / 100`
            }</td>)}
            <td>{comparable ? <DeltaCell left={number(dimensions[0]?.applicable === false ? null : dimensions[0]?.score)} right={number(dimensions[1]?.applicable === false ? null : dimensions[1]?.score)} /> : <span className={styles.na}>不可比</span>}</td>
          </tr>;
        })}
        <tr>
          <th scope="row">任务完成度</th>
          {items.map((item, index) => <td key={runs[index].runId}>{taskLabels[item.quality?.taskCompletion?.status || ""] || "无法确认"}</td>)}
          <td><span className={styles.na}>不可比</span></td>
        </tr>
        <tr>
          <th scope="row">内容判定</th>
          {items.map((item, index) => <td key={runs[index].runId}>{qualificationLabels[item.quality?.qualification?.status || ""] || "无法判断"}</td>)}
          <td><span className={styles.na}>不可比</span></td>
        </tr>
      </tbody>
    </table>
  </div>;
}

function Findings({ judge }: { judge: ComparisonJudge }) {
  const quality = judge.quality;
  if (!quality) return <p className={styles.na}>{judgeStateLabels[judge.status] || "暂无评分"}{judge.error ? ` · ${judge.error}` : ""}</p>;
  return <div className={styles.findings}>
    {quality.comment && <p className={styles.comment}>{quality.comment}</p>}
    <div className={styles.findingList}>
      <strong>扣分原因</strong>
      {quality.gaps?.length ? <ul>{quality.gaps.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className={styles.na}>未记录。</p>}
    </div>
    <div className={styles.findingList}>
      <strong>改进建议</strong>
      {quality.suggestions?.length ? <ul>{quality.suggestions.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className={styles.na}>未记录。</p>}
    </div>
  </div>;
}

export function RunComparison({ comparison, preview = false, backHref = "/runs", backLabel = "返回运行记录", notice }: { comparison: Comparison; preview?: boolean; backHref?: string; backLabel?: string; notice?: string }) {
  const [left, right] = comparison.runs;
  const dimensionKeyList = dimensionKeys(comparison.runs);
  return <main className={styles.page} aria-labelledby="comparison-title">
    {preview && <p className={styles.previewNote} role="note"><strong>界面预览</strong> 当前为演示数据，未接入真实对比接口；所有数字仅用于查看布局和状态。</p>}
    {notice && <p className={styles.errorNote} role="alert">{notice}</p>}
    <header className={styles.header}>
      <div>
        <h1 id="comparison-title">对比测评</h1>
        <p>{left.serviceLabel} 与 {right.serviceLabel} 的同一题目结果 · 规则「{comparison.rule.name}」v{comparison.rule.version}</p>
      </div>
      <BackLink href={backHref}>{backLabel}</BackLink>
    </header>

    <section className={styles.focus} aria-labelledby="comparison-question-title">
      <div className={styles.questionHead}><span id="comparison-question-title">题目</span><time dateTime={comparison.createdAt}>{new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(comparison.createdAt))}</time></div>
      <p className={styles.question}>{comparison.question}</p>
    </section>

    <section className={styles.section} aria-labelledby="comparison-runs-title">
      <h2 id="comparison-runs-title">服务结果</h2>
      <div className={styles.runCards}>
        {comparison.runs.map((run) => <article className={styles.runCard} key={run.runId}>
          <div className={styles.runCardHead}><strong>{run.serviceLabel}</strong><StatusDot tone={executionTone(run.executionStatus)}>{executionLabels[run.executionStatus] || "状态未知"}</StatusDot></div>
          <dl className={styles.runMeta}>
            <div><dt>评分</dt><dd><StatusDot tone={scoringTone(run.scoringStatus)}>{scoringLabels[run.scoringStatus] || "状态未知"}</StatusDot></dd></div>
            <div><dt>耗时</dt><dd>{formatElapsed(run.elapsedMs)}</dd></div>
            {judgeKeys.map((key) => <div key={key}><dt>{judgeLabels[key]}</dt><dd>{formatScore(totalOf(run.scores[key])) || judgeStateLabels[run.scores[key].status] || "状态未知"}</dd></div>)}
          </dl>
        </article>)}
      </div>
    </section>

    <section className={styles.section} aria-labelledby="comparison-answers-title">
      <h2 id="comparison-answers-title">回答对比</h2>
      <div className={styles.answerGrid}>
        {comparison.runs.map((run) => <article className={styles.answerPane} key={run.runId}>
          <div className={styles.answerHead}><strong>{run.serviceLabel}</strong><span>{executionLabels[run.executionStatus] || "状态未知"} · {formatElapsed(run.elapsedMs)}</span></div>
          {run.error && <p className={styles.answerError}>{run.error}</p>}
          {run.answer ? <div className={`${styles.answerBody} run-answer`} tabIndex={0} role="region" aria-label={`${run.serviceLabel} 的回答`}>
            {run.run ? <ConversationAnswer content={run.answer} run={run.run} streaming={run.executionStatus === "running"} /> : <AnswerMarkdown content={run.answer} />}
          </div> : <p className={styles.note}>{run.executionStatus === "running" || run.executionStatus === "queued" ? "正在等待回答…" : "没有可显示的回答。"}</p>}
          {run.answerTruncated && <p className={styles.note}>保存的回答已截断。</p>}
          {run.scoreError && <p className={styles.note}>{run.scoreError}</p>}
        </article>)}
      </div>
    </section>

    <section className={styles.section} aria-labelledby="comparison-scores-title">
      <h2 id="comparison-scores-title">逐项差异</h2>
      <p className={styles.note}>分差为「{left.serviceLabel} − {right.serviceLabel}」。两家模型独立评分，不取平均；百分制只表示回答质量，不代表科学真实性。</p>
      {judgeKeys.map((key) => <div className={styles.judgeBlock} key={key}>
        <div className={styles.judgeHead}><h3>{judgeLabels[key]}</h3><span>{comparison.runs[0].scores[key].model}</span></div>
        <JudgeTable judgeKey={key} runs={comparison.runs} dimensionKeyList={dimensionKeyList} preview={preview} />
        <div className={styles.findingsGrid}>
          {comparison.runs.map((run) => <div className={styles.findingCol} key={run.runId}>
            <h4>{run.serviceLabel}</h4>
            <Findings judge={run.scores[key]} />
          </div>)}
        </div>
      </div>)}
    </section>

    <p className={styles.footnote}>模型评分不等于独立事实核验；执行状态与评分状态分别呈现，缺失或失败不记为零分。</p>
  </main>;
}
