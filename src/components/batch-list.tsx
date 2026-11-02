"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { previewBatches, type BatchSource, type BatchState } from "@/lib/batch-preview";
import { Button, EmptyState, Pagination, Select, Tabs } from "@/components/ui";
import { BatchStatus, formatDate, formatDateTime, JudgeMeans, PreviewNote, sourceLabel, stateLabel } from "@/components/batch-ui";
import styles from "./batches.module.css";

const PAGE_SIZE = 20;

const sourceTabs = [
  { value: "all", label: "全部" },
  { value: "trial", label: "多服务试跑" },
  { value: "mission", label: "Mission 每日" },
];

export function BatchListPage({ basePath }: { basePath: string }) {
  const [source, setSource] = useState<"all" | BatchSource>("all");
  const [state, setState] = useState<"all" | BatchState>("all");
  const [page, setPage] = useState(1);
  const filtered = useMemo(() => previewBatches.filter((batch) => (source === "all" || batch.source === source) && (state === "all" || batch.state === state)), [source, state]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const items = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const filtersActive = source !== "all" || state !== "all";

  function changeSource(value: "all" | BatchSource) { setSource(value); setPage(1); }
  function changeState(value: "all" | BatchState) { setState(value); setPage(1); }
  function reset() { setSource("all"); setState("all"); setPage(1); }

  return <main className={styles.page} aria-labelledby="batches-title">
    <PreviewNote />
    <header className={styles.header}>
      <div>
        <h1 id="batches-title">测评批次</h1>
        <p>夜间自动测评批次，按日期倒序。点开一批可以按服务查看完成情况和问题题目。</p>
      </div>
    </header>
    <div className={styles.toolbar}>
      <Tabs variant="pill" ariaLabel="批次来源" items={sourceTabs} value={source} onChange={(value) => changeSource(value as "all" | BatchSource)} />
      <Select label="状态" value={state} onChange={(value) => changeState(value as "all" | BatchState)} options={[
        { value: "all", label: "全部状态" },
        ...(["done", "partial", "running", "failed"] as BatchState[]).map((value) => ({ value, label: stateLabel(value) })),
      ]} />
      {filtersActive && <Button variant="ghost" size="sm" onClick={reset}>清除筛选</Button>}
    </div>
    <p className={styles.summaryLine}>
      {filtered.length ? `共 ${filtered.length} 个批次 · 最近一次 ${formatDate(filtered[0].date)} · ${sourceLabel(filtered[0].source)}` : "没有匹配的批次。"}
    </p>
    {items.length === 0 ? <EmptyState
      state="empty"
      title={filtersActive ? "没有匹配的测评批次。" : "暂无夜间测评批次。"}
      action={filtersActive ? <Button variant="secondary" onClick={reset}>清除筛选</Button> : undefined}
    /> : <>
      <div className={styles.batchListWrap}>
        <div className={styles.batchListHead} aria-hidden="true"><span>日期 / 批次</span><span>来源</span><span>服务</span><span>已记录 / 计划</span><span>失败 / 超时</span><span>评分</span><span>状态</span><span /></div>
        <ul className={styles.batchList} aria-label="测评批次">
          {items.map((batch) => <li key={batch.batchId} className={styles.batchRow}>
            <Link className={styles.rowLink} href={`${basePath}/${batch.batchId}`} aria-label={`查看 ${batch.date} 测评批次`} />
            <span className={styles.rowMain}>
              <strong className={styles.rowTitle}>{formatDate(batch.date)} 夜间测评</strong>
              <span className={styles.rowMeta}>{sourceLabel(batch.source)} · {batch.services.length} 个服务 · 更新 {formatDateTime(batch.updatedAt)}</span>
              <span className={styles.mobileMeta}>{batch.totals.total}/{batch.totals.planned} 次 · 失败 {batch.totals.failed} · 超时 {batch.totals.timeout}</span>
            </span>
            <span className={`${styles.rowCell} ${styles.rowSource}`}>{sourceLabel(batch.source)}</span>
            <span className={`${styles.rowCell} ${styles.rowServices}`}>{batch.services.length} 个</span>
            <span className={`${styles.rowCell} ${styles.rowPlan}`}>{batch.totals.total} / {batch.totals.planned}</span>
            <span className={`${styles.rowCell} ${styles.rowFailure}`}>{batch.totals.failed} / {batch.totals.timeout}</span>
            <span className={styles.rowScores}><JudgeMeans scores={batch.scores} /></span>
            <span className={`${styles.rowStatus} ${styles.rowCell}`}><BatchStatus state={batch.state} /></span>
            <span className={styles.rowActions}><Link className={styles.rowAction} href={`${basePath}/${batch.batchId}/comparison`}>环比</Link></span>
          </li>)}
        </ul>
      </div>
      <Pagination page={safePage} pages={pages} total={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </>}
  </main>;
}
