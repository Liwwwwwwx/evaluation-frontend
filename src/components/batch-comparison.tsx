"use client";

import { useEffect, useState } from "react";
import { fetchBatchComparison } from "@/lib/batch-api";
import { previewComparisonFor } from "@/lib/batch-preview";
import { serviceLabel, type BatchComparison, type ComparisonQuestion } from "@/lib/batch-types";
import { BackLink, Badge, Button, EmptyState, type StatusTone } from "@/components/ui";
import { deltaTone, formatDelta, formatScore, PreviewNote } from "@/components/batch-ui";
import styles from "./batches.module.css";

const levelLabels: Record<ComparisonQuestion["level"], string> = {
  regressed: "回归",
  improved: "改善",
  stable: "持平",
  new_failure: "新增失败",
  fixed: "已修复",
};

const levelTones: Record<ComparisonQuestion["level"], StatusTone> = {
  regressed: "danger",
  improved: "success",
  stable: "neutral",
  new_failure: "danger",
  fixed: "success",
};

export function BatchComparisonPage({ batchId, basePath, preview = false }: { batchId: string; basePath: string; preview?: boolean }) {
  const [comparison, setComparison] = useState<BatchComparison | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        if (preview) {
          setComparison(previewComparisonFor(batchId));
          setError("");
          return;
        }
        const value = await fetchBatchComparison(batchId, "previous", controller.signal);
        setComparison(value);
        setError("");
      } catch (err) {
        if (!controller.signal.aborted) {
          setComparison(null);
          setError(err instanceof Error ? err.message : "批次环比读取失败。");
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [batchId, preview, retry]);

  if (!comparison) {
    return <main className={`${styles.page} ${styles.comparePage}`}>
      {preview && <PreviewNote />}
      {error ? <EmptyState state="error" title="无法读取批次环比" description={error} action={<div className={styles.headerActions}><Button variant="secondary" onClick={() => setRetry((value) => value + 1)}>重试</Button><Button href={`${basePath}/${batchId}`} variant="secondary">返回批次详情</Button></div>} /> : <EmptyState state="loading" title="正在读取批次环比…" />}
    </main>;
  }

  const regressions = comparison.questions.filter((question) => question.level === "regressed" || question.level === "new_failure");
  const improvements = comparison.questions.filter((question) => question.level === "improved" || question.level === "fixed");
  const stable = comparison.questions.filter((question) => question.level === "stable");

  return <main className={`${styles.page} ${styles.comparePage}`} aria-labelledby="comparison-title">
    {preview && <PreviewNote />}
    <header className={styles.header}>
      <div>
        <h1 id="comparison-title">批次环比</h1>
        <p>{comparison.base.date} 对比 {comparison.previous?.date || "无可比批次"} · 比较阈值 ±{comparison.thresholdPoints} 分</p>
      </div>
      <div className={styles.headerActions}>
        <BackLink href={`${basePath}/${batchId}`}>返回批次详情</BackLink>
        {comparison.previous && <Button href={`${basePath}/${comparison.previous.batchId}`} variant="secondary">查看上次批次</Button>}
      </div>
    </header>

    <div className={styles.modeBanner}>
      <span className={styles.modeTag}>{comparison.mode === "question" ? "逐题对比" : comparison.mode === "aggregate" ? "仅服务汇总" : "暂不可比"}</span>
      <span>{comparison.reason || (comparison.mode === "question" ? `匹配到 ${comparison.matchedQuestions} 道同题同版本记录。` : "没有同题同版本记录，只比较服务汇总。")}</span>
    </div>

    {comparison.services.length === 0 ? <EmptyState
      state="empty"
      title={comparison.reason || "暂无可比数据。"}
      action={<Button href={`${basePath}/${batchId}`} variant="secondary">返回批次详情</Button>}
    /> : <>
      <section className={styles.section} aria-labelledby="comparison-services-title">
        <h2 id="comparison-services-title">服务变化</h2>
        <div className={styles.compareGrid}>
          {comparison.services.map((item) => <div key={item.serviceKey} className={styles.serviceDeltaRow}>
            <span className={styles.serviceDeltaMain}>
              <strong>{serviceLabel(item.serviceKey)}</strong>
              <span>完成变化 {formatDelta(item.completionDelta)} · 失败变化 {formatDelta(item.failureDelta)}</span>
            </span>
            <span className={styles.deltaCells}>
              <span className={styles.deltaCell}><span>DeepSeek</span><b className={`${styles.deltaValue} ${deltaTone(item.scoreDelta.deepSeek)}`}>{formatDelta(item.scoreDelta.deepSeek)}</b></span>
              <span className={styles.deltaCell}><span>千问</span><b className={`${styles.deltaValue} ${deltaTone(item.scoreDelta.qwen)}`}>{formatDelta(item.scoreDelta.qwen)}</b></span>
            </span>
            <span className={styles.serviceCount}><span>新增失败 <b>{item.newFailureCount}</b></span><span>修复 <b>{item.fixedCount}</b></span></span>
          </div>)}
        </div>
      </section>

      {comparison.mode === "question" ? <section className={styles.section} aria-labelledby="comparison-questions-title">
        <h2 id="comparison-questions-title">逐题变化</h2>
        <div className={styles.split}>
          <div className={styles.panel}>
            <div className={styles.panelHead}><h3>新增回归 / 新增失败</h3><span>{regressions.length} 道</span></div>
            {regressions.length ? <ul className={styles.questionList}>{regressions.map((question) => <QuestionRow key={`${question.questionId}-${question.level}`} question={question} />)}</ul> : <p className={styles.emptyPanel}>本次没有新增回归或新增失败。</p>}
          </div>
          <div className={styles.panel}>
            <div className={styles.panelHead}><h3>改善 / 已修复</h3><span>{improvements.length} 道</span></div>
            {improvements.length ? <ul className={styles.questionList}>{improvements.map((question) => <QuestionRow key={`${question.questionId}-${question.level}`} question={question} />)}</ul> : <p className={styles.emptyPanel}>本次没有改善或修复的题目。</p>}
          </div>
        </div>
        {stable.length > 0 && <p className={styles.note}>另有 {stable.length} 道题在阈值内持平，未列入变化清单。</p>}
      </section> : <section className={styles.section} aria-labelledby="comparison-aggregate-title">
        <h2 id="comparison-aggregate-title">为什么没有逐题对比</h2>
        <p className={styles.note}>{comparison.reason || "本次没有同题同版本记录，只比较服务汇总。"}分数差仅在同一规则版本和同一模型下计算，不把不同版本直接相减。</p>
      </section>}
    </>}

    <p className={styles.note}>环比结论只用于定位问题；模型评分不等于科学正确率。点进批次详情可查看低分题和失败原因。</p>
  </main>;
}

function QuestionRow({ question }: { question: ComparisonQuestion }) {
  return <li className={styles.questionRow}>
    <span className={styles.questionTitle}>{question.question}</span>
    <span className={styles.questionMeta}>
      <Badge tone={levelTones[question.level]}>{levelLabels[question.level]}</Badge>
      <span>{serviceLabel(question.serviceKey)}</span>
      <span>{formatScore(question.before.score)} → {formatScore(question.after.score)}</span>
      <span className={deltaTone(question.delta)}>{formatDelta(question.delta)} 分</span>
    </span>
  </li>;
}
