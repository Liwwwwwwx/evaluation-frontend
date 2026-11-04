"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { previewBatches } from "@/lib/batch-preview";
import { fetchBatchList } from "@/lib/batch-api";
import type { BatchSource, BatchState, BatchSummary } from "@/lib/batch-types";
import { Button, EmptyState, Pagination, Select, Tabs } from "@/components/ui";
import { DailyReportList } from "@/components/daily-reports";
import { BatchStatus, formatDate, formatDateTime, JudgeMeans, PreviewNote, sourceLabel, stateLabel } from "@/components/batch-ui";
import styles from "./batches.module.css";

const PAGE_SIZE = 20;

const sourceTabs = [
  { value: "all", label: "全部" },
  { value: "trial", label: "多服务随机题" },
  { value: "mission", label: "Mission 每日" },
];

type ListData = { items: BatchSummary[]; total: number; storageReady: boolean };
type ViewTab = "batches" | "reports";
const viewTabs: { value: ViewTab; label: string }[] = [{ value: "batches", label: "批次" }, { value: "reports", label: "测评日报" }];

export function BatchListPage({ basePath, preview = false, initialTab = "batches" }: { basePath: string; preview?: boolean; initialTab?: ViewTab }) {
  const [tab, setTab] = useState<ViewTab>(initialTab);
  const [source, setSource] = useState<"all" | BatchSource>("all");
  const [state, setState] = useState<"all" | BatchState>("all");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListData | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const filtersActive = source !== "all" || state !== "all";

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        if (preview) {
          const filtered = previewBatches.filter((batch) => (source === "all" || batch.source === source) && (state === "all" || batch.state === state));
          const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
          const safePage = Math.min(page, pages);
          setData({ items: filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), total: filtered.length, storageReady: true });
          setError("");
          if (safePage !== page) setPage(safePage);
          return;
        }
        const value = await fetchBatchList({ source, state: state === "all" ? undefined : state, page, pageSize: PAGE_SIZE }, controller.signal);
        setData({ items: value.items, total: value.total, storageReady: value.storageReady });
        setError("");
        if (value.page !== page) setPage(value.page);
      } catch (err) {
        if (!controller.signal.aborted) {
          setData(null);
          setError(err instanceof Error ? err.message : "批次列表读取失败。");
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [preview, source, state, page, retry]);

  function changeSource(value: "all" | BatchSource) { setSource(value); setPage(1); }
  function changeState(value: "all" | BatchState) { setState(value); setPage(1); }
  function reset() { setSource("all"); setState("all"); setPage(1); }

  const pages = Math.max(1, Math.ceil((data?.total || 0) / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const items = data?.items || [];

  return <main className={styles.page} aria-labelledby="batches-title">
    {preview && <PreviewNote />}
    <header className={styles.header}>
      <div>
        <h1 id="batches-title">测评批次</h1>
        <p>{tab === "batches" ? "夜间自动测评批次，按日期倒序。点开一批可以按服务查看完成情况和问题题目。" : "夜间测评的智能日报，按日期汇总各服务表现与主要问题。"}</p>
      </div>
    </header>
    <div className={styles.toolbar}>
      <Tabs variant="pill" ariaLabel="测评批次视图" className={styles.viewTabs} items={preview ? [viewTabs[0]] : viewTabs} value={tab} onChange={(value) => setTab(value as ViewTab)} />
      {tab === "batches" && <>
        <Tabs variant="pill" ariaLabel="批次来源" items={sourceTabs} value={source} onChange={(value) => changeSource(value as "all" | BatchSource)} />
        <Select label="状态" value={state} onChange={(value) => changeState(value as "all" | BatchState)} options={[
          { value: "all", label: "全部状态" },
          ...(["done", "partial", "running", "failed"] as BatchState[]).map((value) => ({ value, label: stateLabel(value) })),
        ]} />
        {filtersActive && <Button variant="ghost" size="sm" onClick={reset}>清除筛选</Button>}
      </>}
    </div>
    {tab === "reports" ? <DailyReportList embedded /> : <>
    <p className={styles.summaryLine}>
      {error ? "批次列表暂不可用。" : !data ? "正在读取批次…" : data.total ? `共 ${data.total} 个批次${items[0] ? ` · 当前页最近 ${formatDate(items[0].date)} · ${sourceLabel(items[0].source)}` : ""}` : filtersActive ? "没有匹配的批次。" : "暂无测评批次。"}
    </p>
    {error ? <EmptyState state="error" title="无法读取批次列表" description={error} action={<Button variant="secondary" onClick={() => setRetry((value) => value + 1)}>重试</Button>} /> : !data ? <EmptyState state="loading" title="正在读取批次…" /> : data.storageReady === false ? <EmptyState state="empty" title="批次存储尚未迁移" description="夜间测评批次功能需要先完成数据库迁移。" /> : items.length === 0 ? <EmptyState
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
      <Pagination page={safePage} pages={pages} total={data.total} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </>}
    </>}
  </main>;
}
