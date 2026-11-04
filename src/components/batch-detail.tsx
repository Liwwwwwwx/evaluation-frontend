"use client";

import { useEffect, useState } from "react";
import { fetchBatchDetail, fetchBatchRuns } from "@/lib/batch-api";
import { previewBatchDetails, previewBatchRuns } from "@/lib/batch-preview";
import { serviceLabel, type BatchDetail, type RunBrief } from "@/lib/batch-types";
import { BackLink, Button, EmptyState, Pagination, Select, StatusDot, Tabs, tabButtonId, tabPanelId } from "@/components/ui";
import { BatchStatus, executionLabel, executionTone, formatDateTime, formatElapsed, formatMean, formatScore, judgeStateDescription, JudgeMeans, lowestScore, PreviewNote, ScorePair, sourceLabel } from "@/components/batch-ui";
import styles from "./batches.module.css";

const PAGE_SIZE = 20;
type Tab = "services" | "problems";
type ExecutionFilter = "" | RunBrief["execution"];
type Sort = "scoreAsc" | "scoreDesc" | "startedAtDesc" | "startedAtAsc";
type RunsData = { items: RunBrief[]; total: number; page: number; pageSize: number };

function previewRuns(batchId: string, service: string, execution: ExecutionFilter, sort: Sort, page: number): RunsData {
  const filtered = (previewBatchRuns[batchId] || []).filter((run) => (!service || run.serviceKey === service) && (!execution || run.execution === execution));
  filtered.sort((left, right) => {
    if (sort === "startedAtAsc") return Date.parse(left.startedAt) - Date.parse(right.startedAt);
    if (sort === "startedAtDesc") return Date.parse(right.startedAt) - Date.parse(left.startedAt);
    const l = lowestScore(left);
    const r = lowestScore(right);
    if (l === null && r === null) return 0;
    if (l === null) return 1;
    if (r === null) return -1;
    return sort === "scoreDesc" ? r - l : l - r;
  });
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  return { items: filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), total: filtered.length, page: safePage, pageSize: PAGE_SIZE };
}

export function BatchDetailPage({ batchId, basePath, preview = false }: { batchId: string; basePath: string; preview?: boolean }) {
  const [detail, setDetail] = useState<BatchDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [detailRetry, setDetailRetry] = useState(0);
  const [runsData, setRunsData] = useState<RunsData | null>(null);
  const [runsError, setRunsError] = useState("");
  const [runsRetry, setRunsRetry] = useState(0);
  const [tab, setTab] = useState<Tab>("services");
  const [service, setService] = useState("");
  const [execution, setExecution] = useState<ExecutionFilter>("");
  const [sort, setSort] = useState<Sort>("scoreAsc");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const controller = new AbortController();
    let loading = false;
    async function load() {
      if (loading) return;
      loading = true;
      try {
        if (preview) {
          const value = previewBatchDetails[batchId] || null;
          setDetail(value);
          setDetailError(value ? "" : "这个批次不存在。");
          return;
        }
        const value = await fetchBatchDetail(batchId, controller.signal);
        setDetail(value);
        setDetailError("");
      } catch (err) {
        if (!controller.signal.aborted) {
          setDetail(null);
          setDetailError(err instanceof Error ? err.message : "批次详情读取失败。");
        }
      } finally { loading = false; }
    }
    void load();
    const timer = preview ? null : window.setInterval(() => void load(), 5000);
    return () => { controller.abort(); if (timer !== null) window.clearInterval(timer); };
  }, [batchId, preview, detailRetry]);

  useEffect(() => {
    const controller = new AbortController();
    let loading = false;
    async function load() {
      if (loading) return;
      loading = true;
      try {
        if (preview) {
          const value = previewRuns(batchId, service, execution, sort, page);
          setRunsData(value);
          setRunsError("");
          if (value.page !== page) setPage(value.page);
          return;
        }
        const value = await fetchBatchRuns(batchId, { serviceKey: service || undefined, execution: execution || undefined, sort, page, pageSize: PAGE_SIZE }, controller.signal);
        setRunsData(value);
        setRunsError("");
        if (value.page !== page) setPage(value.page);
      } catch (err) {
        if (!controller.signal.aborted) {
          setRunsData(null);
          setRunsError(err instanceof Error ? err.message : "批次运行读取失败。");
        }
      } finally { loading = false; }
    }
    void load();
    const timer = preview ? null : window.setInterval(() => void load(), 5000);
    return () => { controller.abort(); if (timer !== null) window.clearInterval(timer); };
  }, [batchId, preview, service, execution, sort, page, runsRetry]);

  if (!detail) {
    return <main className={styles.page}>
      {preview && <PreviewNote />}
      {detailError ? <EmptyState state="error" title="无法读取批次" description={detailError} action={<div className={styles.headerActions}><Button variant="secondary" onClick={() => setDetailRetry((value) => value + 1)}>重试</Button><Button href={basePath} variant="secondary">返回批次列表</Button></div>} /> : <EmptyState state="loading" title="正在读取批次…" />}
    </main>;
  }

  const pages = Math.max(1, Math.ceil((runsData?.total || 0) / PAGE_SIZE));
  const safePage = Math.min(runsData?.page || page, pages);
  const pageRuns = runsData?.items || [];
  const filtersActive = Boolean(service || execution);

  function showProblems(serviceKey = "") {
    setService(serviceKey);
    setExecution("");
    setPage(1);
    setTab("problems");
  }

  return <main className={styles.page} aria-labelledby="batch-detail-title">
    {preview && <PreviewNote />}
    <header className={styles.header}>
      <div>
        <div className={styles.titleRow}><h1 id="batch-detail-title">{detail.batch.date} {detail.batch.source === "manual" ? "手动组合测评" : "夜间测评"}</h1><BatchStatus state={detail.batch.state} /></div>
        <p className={styles.subtitle}>{sourceLabel(detail.batch.source)} · {detail.batch.services.length} 个服务 · 计划 {detail.batch.planned} 次{detail.batch.scheme ? ` · 方案 ${detail.batch.scheme.name} v${detail.batch.scheme.version}` : ""} · 更新 {formatDateTime(detail.batch.updatedAt)}</p>
      </div>
      <div className={styles.headerActions}>
        <BackLink href={basePath}>返回批次列表</BackLink>
        {detail.links.dailyReport ? <Button href={detail.links.dailyReport} variant="secondary">查看日报</Button> : <Button variant="secondary" disabled>暂无日报</Button>}
        <Button href={`${basePath}/${batchId}/comparison`} variant="secondary">查看环比</Button>
      </div>
    </header>

    <div className={styles.metricStrip}>
      <Metric label="已记录 / 计划" value={`${detail.totals.total} / ${detail.totals.planned}`} sub={detail.coverage.missing > 0 ? `缺少 ${detail.coverage.missing} 条` : "计划已全部创建"} />
      <Metric label="执行完成" value={String(detail.totals.completed)} sub={`未完成 ${detail.totals.unfinished}`} />
      <Metric label="失败" value={String(detail.totals.failed)} sub="执行失败，不计零分" />
      <Metric label="超时" value={String(detail.totals.timeout)} sub="未确认远端已取消" />
      <Metric label="DeepSeek 均分" value={formatMean(detail.scores.deepSeek)} sub={judgeStateDescription(detail.scores.deepSeek)} />
      <Metric label="千问均分" value={formatMean(detail.scores.qwen)} sub={judgeStateDescription(detail.scores.qwen)} />
    </div>

    <div className={styles.viewBar}>
      <Tabs
        variant="pill"
        ariaLabel="批次视图"
        idBase="batch-view"
        value={tab}
        onChange={(value) => setTab(value as Tab)}
        items={[{ value: "services", label: "服务概览" }, { value: "problems", label: "问题清单" }]}
      />
      {tab === "problems" && <div className={styles.runsToolbar}>
        <Select label="服务" value={service} onChange={(value) => { setService(value); setPage(1); }} options={[
          { value: "", label: "全部服务" },
          ...detail.services.map((item) => ({ value: item.serviceKey, label: item.label })),
        ]} />
        <Select label="执行" value={execution} onChange={(value) => { setExecution(value as ExecutionFilter); setPage(1); }} options={[
          { value: "", label: "全部状态" },
          { value: "completed", label: "已完成" },
          { value: "failed", label: "失败" },
          { value: "timeout", label: "超时" },
          { value: "unfinished", label: "未完成" },
        ]} />
        <Select label="排序" value={sort} onChange={(value) => { setSort(value as Sort); setPage(1); }} options={[
          { value: "scoreAsc", label: "分数从低到高" },
          { value: "scoreDesc", label: "分数从高到低" },
          { value: "startedAtDesc", label: "开始时间倒序" },
          { value: "startedAtAsc", label: "开始时间正序" },
        ]} />
        {filtersActive && <Button variant="ghost" size="sm" onClick={() => { setService(""); setExecution(""); setPage(1); }}>清除筛选</Button>}
      </div>}
    </div>

    {tab === "services" ? <div className={styles.tabPanel} id={tabPanelId("batch-view", "services")} role="tabpanel" aria-labelledby={tabButtonId("batch-view", "services")}>
      <div className={styles.serviceList}>
        {detail.services.map((item) => {
          const low = item.lowScores[0];
          const failure = item.failures[0];
          return <button key={item.serviceKey} type="button" className={styles.serviceRow} onClick={() => showProblems(item.serviceKey)}>
            <span className={styles.serviceMain}>
              <span className={styles.serviceName}>{item.label}</span>
              <span className={styles.serviceMeta}>计划 {item.expected} 次 · 最长 {formatElapsed(item.maxElapsedMs)}</span>
            </span>
            <span className={styles.serviceProgress}><strong>{item.totals.completed} / {item.totals.total} 完成</strong><span>失败 {item.totals.failed} · 超时 {item.totals.timeout}</span></span>
            <span className={styles.serviceScores}><JudgeMeans scores={item.scores} /></span>
            <span className={styles.serviceIssues}>
              {low ? <span className={styles.issueLine}><span className={styles.issueLabel}>低分</span>{low.question} · {formatScore(lowestScore(low))}</span> : <span className={styles.issueLine}><span className={styles.issueOk}>低分</span>本次未发现</span>}
              {failure ? <span className={styles.issueLine}><span className={styles.issueLabel}>{failure.execution === "timeout" ? "超时" : "失败"}</span>{failure.question} · {failure.error}</span> : <span className={styles.issueLine}><span className={styles.issueOk}>失败/超时</span>本次未发现</span>}
            </span>
            <span className={styles.serviceArrow} aria-hidden="true">›</span>
          </button>;
        })}
      </div>
      <p className={styles.coverage}>{detail.coverage.note} 计划 {detail.coverage.planned}，已持久化 {detail.coverage.persisted}，缺少 {detail.coverage.missing}。</p>
    </div> : <div className={styles.tabPanel} id={tabPanelId("batch-view", "problems")} role="tabpanel" aria-labelledby={tabButtonId("batch-view", "problems")}>
      {runsError ? <EmptyState state="error" title="无法读取批次运行" description={runsError} action={<Button variant="secondary" onClick={() => setRunsRetry((value) => value + 1)}>重试</Button>} /> : !runsData ? <EmptyState state="loading" title="正在读取运行记录…" /> : pageRuns.length === 0 ? <EmptyState state="empty" title="没有匹配的运行记录。" action={filtersActive ? <Button variant="secondary" onClick={() => { setService(""); setExecution(""); setPage(1); }}>清除筛选</Button> : undefined} /> : <>
        <div className={styles.runsListWrap}>
          <div className={styles.runsHead} aria-hidden="true"><span>题目</span><span>服务</span><span>状态</span><span>评分</span><span>耗时</span><span>开始时间</span><span /></div>
          <ul className={styles.runsList} aria-label="批次运行">
            {pageRuns.map((run) => {
              const meta = [run.questionId, run.datasetVersion].filter(Boolean).join(" · ");
              return <li key={run.runId} className={styles.runsRow}>
              <span className={styles.runQuestion}><strong className={styles.runQuestionTitle} title={run.question}>{run.question}</strong>{meta && <span className={styles.runMeta}>{meta}</span>}<span className={styles.mobileMeta}>{serviceLabel(run.serviceKey)} · 耗时 {formatElapsed(run.elapsedMs)}</span></span>
              <span className={`${styles.runCellMuted} ${styles.runService}`}>{serviceLabel(run.serviceKey)}</span>
              <span className={styles.runStatus}><StatusDot tone={run.status === "paused" ? "warning" : executionTone(run.execution)}>{run.status === "paused" ? "已暂停" : executionLabel(run.execution)}</StatusDot></span>
              <span className={styles.runScores}><ScorePair deepSeek={run.scores.deepSeek} qwen={run.scores.qwen} /></span>
              <span className={styles.runTime}>{formatElapsed(run.elapsedMs)}</span>
              <span className={styles.runTime}>{formatDateTime(run.startedAt)}</span>
              <span className={styles.runActions}>{preview ? <button type="button" className={styles.runAction} disabled title="界面预览：单题详情待接入">查看</button> : <><Button href={`/runs/${run.runId}`} variant="ghost" size="sm">查看</Button>{run.comparisonGroupId && <Button href={`/compare/${encodeURIComponent(run.comparisonGroupId)}`} variant="ghost" size="sm">同题对比</Button>}</>}</span>
              </li>;
            })}
          </ul>
        </div>
        <Pagination page={safePage} pages={pages} total={runsData.total} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </>}
      <p className={styles.coverage}>{detail.coverage.note} 计划 {detail.coverage.planned}，已持久化 {detail.coverage.persisted}，缺少 {detail.coverage.missing}。</p>
    </div>}
  </main>;
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div className={styles.metric}><span className={styles.metricLabel}>{label}</span><strong className={styles.metricValue}>{value}</strong><span className={styles.metricSub}>{sub}</span></div>;
}
