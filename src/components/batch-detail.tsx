"use client";

import { useEffect, useState } from "react";
import { fetchBatchDetail, fetchBatchRuns } from "@/lib/batch-api";
import { previewBatchDetails, previewBatchRuns } from "@/lib/batch-preview";
import { serviceLabel, type BatchDetail, type JudgeSummary, type RunBrief } from "@/lib/batch-types";
import { BackLink, Button, EmptyState, Pagination, Select, StatusDot, Tabs, tabButtonId, tabPanelId } from "@/components/ui";
import { BatchStatus, executionLabel, executionTone, formatDateTime, formatElapsed, formatMean, formatScore, judgeStateDescription, lowestScore, PreviewNote, ScorePair, sourceLabel } from "@/components/batch-ui";
import { appendFrom } from "@/lib/navigation";
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

type BatchDetailPageProps = {
  batchId: string;
  basePath: string;
  backHref?: string;
  backLabel?: string;
  preview?: boolean;
  initialTab?: Tab;
  initialService?: string;
  initialExecution?: ExecutionFilter;
  initialSort?: Sort;
  initialPage?: number;
};

export function BatchDetailPage({ batchId, basePath, backHref = basePath, backLabel = "返回批次列表", preview = false, initialTab = "services", initialService = "", initialExecution = "", initialSort = "scoreAsc", initialPage = 1 }: BatchDetailPageProps) {
  const [detail, setDetail] = useState<BatchDetail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [detailRetry, setDetailRetry] = useState(0);
  const [runsData, setRunsData] = useState<RunsData | null>(null);
  const [runsError, setRunsError] = useState("");
  const [runsRetry, setRunsRetry] = useState(0);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [service, setService] = useState(initialService);
  const [execution, setExecution] = useState<ExecutionFilter>(initialExecution);
  const [sort, setSort] = useState<Sort>(initialSort);
  const [page, setPage] = useState(initialPage);
  const terminal = detail ? ["done", "partial", "failed"].includes(detail.batch.state) : false;

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
    const timer = preview || terminal ? null : window.setInterval(() => void load(), 5000);
    return () => { controller.abort(); if (timer !== null) window.clearInterval(timer); };
  }, [batchId, preview, detailRetry, terminal]);

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
    const timer = preview || terminal ? null : window.setInterval(() => void load(), 5000);
    return () => { controller.abort(); if (timer !== null) window.clearInterval(timer); };
  }, [batchId, preview, service, execution, sort, page, runsRetry, terminal]);

  if (!detail) {
    return <main className={styles.page}>
      <div className={styles.pageInner}>
      {preview && <PreviewNote />}
      {detailError ? <EmptyState state="error" title="无法读取批次" description={detailError} action={<div className={styles.headerActions}><Button variant="secondary" onClick={() => setDetailRetry((value) => value + 1)}>重试</Button><Button href={backHref} variant="secondary">{backLabel}</Button></div>} /> : <EmptyState state="loading" title="正在读取批次…" />}
      </div>
    </main>;
  }

  const pages = Math.max(1, Math.ceil((runsData?.total || 0) / PAGE_SIZE));
  const safePage = Math.min(runsData?.page || page, pages);
  const pageRuns = runsData?.items || [];
  const filtersActive = Boolean(service || execution);
  const finished = detail.totals.completed + detail.totals.failed + detail.totals.timeout;
  const progressPercent = detail.totals.planned > 0 ? Math.min(100, Math.round(finished / detail.totals.planned * 1000) / 10) : 0;
  const returnParams = new URLSearchParams();
  if (tab !== "services") returnParams.set("tab", tab);
  if (service) returnParams.set("service", service);
  if (execution) returnParams.set("execution", execution);
  if (sort !== "scoreAsc") returnParams.set("sort", sort);
  if (page > 1) returnParams.set("page", String(page));
  if (backHref !== basePath) returnParams.set("from", backHref);
  const selfHref = `${basePath}/${batchId}${returnParams.toString() ? `?${returnParams.toString()}` : ""}`;

  function showProblems(serviceKey = "") {
    setService(serviceKey);
    setExecution("");
    setPage(1);
    setTab("problems");
  }

  return <main className={styles.page} aria-labelledby="batch-detail-title">
    <div className={styles.pageInner}>
    {preview && <PreviewNote />}
    <header className={styles.header}>
      <div>
        <div className={styles.titleRow}><h1 id="batch-detail-title">{detail.batch.date} {detail.batch.source === "manual" ? "手动组合测评" : "夜间测评"}</h1><BatchStatus state={detail.batch.state} /></div>
        <p className={styles.subtitle}>{sourceLabel(detail.batch.source)} · {detail.batch.services.length} 个服务 · 计划 {detail.batch.planned} 次{detail.batch.scheme ? ` · 方案 ${detail.batch.scheme.name} v${detail.batch.scheme.version}` : ""} · 更新 {formatDateTime(detail.batch.updatedAt)}</p>
      </div>
      <div className={styles.headerActions}>
        <BackLink href={backHref}>{backLabel}</BackLink>
        {detail.links.dailyReport ? <Button href={appendFrom(detail.links.dailyReport, selfHref)} variant="secondary">查看日报</Button> : <Button variant="secondary" disabled>暂无日报</Button>}
        <Button href={`${basePath}/${batchId}/comparison?from=${encodeURIComponent(selfHref)}`} variant="secondary">查看环比</Button>
      </div>
    </header>

    <div className={styles.viewBar}>
      <Tabs
        variant="segmented"
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

    <div className={styles.detailLayout}>
    <div className={styles.detailLayoutMain}>
    {tab === "services" ? <div className={styles.tabPanel} id={tabPanelId("batch-view", "services")} role="tabpanel" aria-labelledby={tabButtonId("batch-view", "services")}>
      <div className={styles.serviceListWrap}>
      <div className={styles.serviceList}>
        <div className={styles.serviceHead} aria-hidden="true"><span>服务</span><span>完成进度</span><span>双评委均分</span><span>待关注</span><span /></div>
        {detail.services.map((item) => {
          const low = item.lowScores[0];
          const failure = item.failures[0];
          return <button key={item.serviceKey} type="button" className={styles.serviceRow} onClick={() => showProblems(item.serviceKey)}>
            <span className={styles.serviceMain}>
              <span className={styles.serviceName} title={item.label}>{item.label}</span>
              <span className={styles.serviceMeta}>计划 {item.expected} 次 · 最长 {formatElapsed(item.maxElapsedMs)}</span>
            </span>
            <span className={styles.serviceProgress}><strong>{item.totals.completed}<i> / {item.totals.total}</i></strong><span>失败 {item.totals.failed} · 超时 {item.totals.timeout}</span></span>
            <span className={styles.serviceScores}>
              <span className={styles.judgeScore}><span className={styles.judgeKey}>DS</span><b>{formatMean(item.scores.deepSeek)}</b><span className={styles.judgeCounts} title={judgeStateDescription(item.scores.deepSeek)}>{judgeStateDescription(item.scores.deepSeek)}</span></span>
              <span className={styles.judgeScore}><span className={styles.judgeKey}>QW</span><b>{formatMean(item.scores.qwen)}</b><span className={styles.judgeCounts} title={judgeStateDescription(item.scores.qwen)}>{judgeStateDescription(item.scores.qwen)}</span></span>
            </span>
            <span className={styles.serviceIssues}>
              {low ? <span className={styles.issueLine}><em className={styles.issueChip} data-kind="warn">低分</em><span className={styles.issueText} title={low.question}>{low.question}</span><b>{formatScore(lowestScore(low))}<i>分</i></b></span> : <span className={styles.issueLine}><em className={styles.issueChip} data-kind="ok">低分</em><span className={styles.issueText}>本次未发现</span></span>}
              {failure ? <span className={styles.issueLine}><em className={styles.issueChip} data-kind="bad">{failure.execution === "timeout" ? "超时" : "失败"}</em><span className={styles.issueText} title={`${failure.question} · ${failure.error}`}>{failure.question} · {failure.error}</span></span> : <span className={styles.issueLine}><em className={styles.issueChip} data-kind="ok">失败</em><span className={styles.issueText}>本次未发现</span></span>}
            </span>
            <span className={styles.serviceArrow} aria-hidden="true">›</span>
          </button>;
        })}
      </div>
      <div className={styles.listFade} aria-hidden="true" />
      </div>
      <p className={styles.coverage}>{detail.coverage.note} 计划 {detail.coverage.planned}，已持久化 {detail.coverage.persisted}，缺少 {detail.coverage.missing}。</p>
    </div> : <div className={styles.tabPanel} id={tabPanelId("batch-view", "problems")} role="tabpanel" aria-labelledby={tabButtonId("batch-view", "problems")}>
      {runsError ? <EmptyState state="error" title="无法读取批次运行" description={runsError} action={<Button variant="secondary" onClick={() => setRunsRetry((value) => value + 1)}>重试</Button>} /> : !runsData ? <EmptyState state="loading" title="正在读取运行记录…" /> : pageRuns.length === 0 ? <EmptyState state="empty" title="没有匹配的运行记录。" action={filtersActive ? <Button variant="secondary" onClick={() => { setService(""); setExecution(""); setPage(1); }}>清除筛选</Button> : undefined} /> : <>
        <div className={styles.runsPanel}>
        <div className={styles.runsListWrap}>
          <div className={styles.runsHead} aria-hidden="true"><span>题目</span><span>服务</span><span>状态</span><span>评分</span><span>耗时</span><span>开始时间</span><span /></div>
          <ul className={styles.runsList} aria-label="批次运行">
            {pageRuns.map((run) => {
              const meta = [run.questionId, run.datasetVersion].filter(Boolean).join(" · ");
              return <li key={run.runId} className={styles.runsRow}>
              <span className={styles.runQuestion}><strong className={styles.runQuestionTitle} title={run.question}>{run.question}</strong>{meta && <span className={styles.runMeta}>{meta}</span>}<span className={styles.mobileMeta}>{serviceLabel(run.serviceKey)} · 耗时 {formatElapsed(run.elapsedMs)}</span></span>
              <span className={`${styles.runCellMuted} ${styles.runService}`}>{serviceLabel(run.serviceKey)}</span>
              <span className={styles.runStatus}><StatusDot tone={run.status === "paused" ? "warning" : executionTone(run.execution)}>{run.status === "paused" ? "已暂停" : executionLabel(run.execution)}</StatusDot></span>
              <span className={styles.runScores}><ScorePair deepSeek={(run.displayScores || run.scores).deepSeek} qwen={(run.displayScores || run.scores).qwen} provisional={run.provisionalScores} /></span>
              <span className={styles.runTime}>{formatElapsed(run.elapsedMs)}</span>
              <span className={styles.runTime}>{formatDateTime(run.startedAt)}</span>
              <span className={styles.runActions}>{preview ? <button type="button" className={styles.runAction} disabled title="界面预览：单题详情待接入">查看</button> : <><Button href={appendFrom(`/runs/${encodeURIComponent(run.runId)}`, selfHref)} variant="ghost" size="sm">查看</Button>{run.comparisonGroupId && <Button href={appendFrom(`/compare/${encodeURIComponent(run.comparisonGroupId)}`, selfHref)} variant="ghost" size="sm">同题对比</Button>}</>}</span>
              </li>;
            })}
          </ul>
        </div>
        <div className={styles.listFade} aria-hidden="true" />
        </div>
        <Pagination page={safePage} pages={pages} total={runsData.total} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </>}
      <p className={styles.coverage}>{detail.coverage.note} 计划 {detail.coverage.planned}，已持久化 {detail.coverage.persisted}，缺少 {detail.coverage.missing}。</p>
    </div>}
    </div>

    <aside className={styles.detailSide} aria-label="批次概览">
      <section className={styles.sideCard}>
        <div className={styles.sideHead}><span>执行进度</span><b>{progressPercent}%</b></div>
        <div className={styles.sideValue}>{finished}<i> / {detail.totals.planned} 已结束</i></div>
        <div className={styles.progressTrack} data-state={detail.batch.state} role="progressbar" aria-label="执行进度" aria-valuemin={0} aria-valuemax={detail.totals.planned} aria-valuenow={finished}>
          <span style={{ width: `${progressPercent}%` }} />
        </div>
        <div className={styles.sideChips}>
          <span className={styles.sideChip}><span><i data-tone="success" />已完成</span><b>{detail.totals.completed}</b></span>
          <span className={styles.sideChip}><span><i data-tone="danger" />失败</span><b>{detail.totals.failed}</b></span>
          <span className={styles.sideChip}><span><i data-tone="warning" />超时</span><b>{detail.totals.timeout}</b></span>
          {detail.totals.queued + detail.totals.running + detail.totals.scoring === 0 ? <span className={styles.sideChip}><span><i data-tone="info" />未结束</span><b>{detail.totals.unfinished}</b></span> : <>
            {detail.totals.queued > 0 && <span className={styles.sideChip}><span><i data-tone="info" />排队</span><b>{detail.totals.queued}</b></span>}
            {detail.totals.running > 0 && <span className={styles.sideChip}><span><i data-tone="info" />执行中</span><b>{detail.totals.running}</b></span>}
            {detail.totals.scoring > 0 && <span className={styles.sideChip}><span><i data-tone="info" />评分中</span><b>{detail.totals.scoring}</b></span>}
          </>}
        </div>
        <p className={styles.sideNote}>已记录 {detail.totals.total} / {detail.totals.planned} · 失败不计零分 · 超时以远端确认为准{detail.coverage.missing > 0 ? ` · 缺少 ${detail.coverage.missing} 条` : ""}</p>
      </section>
      <section className={styles.sideCard}>
        <div className={styles.sideHead}><span>双评委均分</span></div>
        <JudgeCard name="DeepSeek" judge={detail.scores.deepSeek} />
        <JudgeCard name="千问" judge={detail.scores.qwen} />
      </section>
      <section className={styles.sideCard}>
        <div className={styles.sideHead}><span>批次信息</span></div>
        <div className={styles.sideRows}>
          <div className={styles.sideRow}><span>来源</span><b>{sourceLabel(detail.batch.source)}</b></div>
          <div className={styles.sideRow}><span>方案</span><b title={detail.batch.scheme ? `${detail.batch.scheme.name} v${detail.batch.scheme.version}` : "内置默认配置"}>{detail.batch.scheme ? `${detail.batch.scheme.name} v${detail.batch.scheme.version}` : "内置默认配置"}</b></div>
          <div className={styles.sideRow}><span>计划</span><b>{detail.totals.planned} 次</b></div>
          <div className={styles.sideRow}><span>记录</span><b>{detail.totals.total} / {detail.totals.planned}</b></div>
          <div className={styles.sideRow}><span>更新</span><b>{formatDateTime(detail.batch.updatedAt)}</b></div>
        </div>
      </section>
    </aside>
    </div>
    </div>
  </main>;
}

function JudgeCard({ name, judge }: { name: string; judge: JudgeSummary }) {
  const scored = judge.ready + judge.provisional;
  const total = scored + judge.pending + judge.failed + judge.unavailable + judge.absent + (judge.invalid || 0);
  const rest = Math.max(0, total - scored);
  return <div className={styles.judgeCard}>
    <div className={styles.judgeHead}><span>{name} 均分</span><b>{formatMean(judge)}</b></div>
    <span className={styles.judgeMeta}>{judgeStateDescription(judge)}</span>
    <div className={styles.coverageBar} aria-hidden="true">
      {judge.ready > 0 && <i data-kind="ready" style={{ flexGrow: judge.ready }} />}
      {judge.provisional > 0 && <i data-kind="tentative" style={{ flexGrow: judge.provisional }} />}
      {rest > 0 && <i data-kind="none" style={{ flexGrow: rest }} />}
    </div>
  </div>;
}
