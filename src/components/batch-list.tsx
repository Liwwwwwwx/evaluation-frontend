"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { previewBatches } from "@/lib/batch-preview";
import { fetchBatchList } from "@/lib/batch-api";
import type { BatchSource, BatchState, BatchSummary } from "@/lib/batch-types";
import { Button, EmptyState, Pagination, Tabs } from "@/components/ui";
import { DailyReportList } from "@/components/daily-reports";
import { BatchSchemePanel } from "@/components/batch-scheme-panel";
import { BatchSchemesList } from "@/components/batch-schemes-list";
import { BatchStatus, formatDate, formatDateTime, ScorePair, PreviewNote, sourceLabel, stateLabel } from "@/components/batch-ui";
import { appendFrom } from "@/lib/navigation";
import styles from "./batches.module.css";

const PAGE_SIZE = 20;

const sourceTabs = [
  { value: "all", label: "全部来源" },
  { value: "nightly", label: "夜间自动" },
  { value: "trial", label: "多服务随机题" },
  { value: "mission", label: "Mission 每日" },
  { value: "manual", label: "手动组合" },
];

type ListData = { items: BatchSummary[]; total: number; storageReady: boolean };
type ViewTab = "configs" | "batches" | "reports";
const viewTabs: { value: ViewTab; label: string }[] = [{ value: "configs", label: "批次配置" }, { value: "batches", label: "执行记录" }, { value: "reports", label: "测评日报" }];

type SourceFilter = "all" | "nightly" | BatchSource;

export function BatchListPage({ basePath, preview = false, initialTab = "configs", initialSource = "all", initialState = "all", initialFrom = "", initialTo = "", initialPage = 1, initialSchemeId = "", initialSchemeName = "" }: {
  basePath: string;
  preview?: boolean;
  initialTab?: ViewTab;
  initialSource?: SourceFilter;
  initialState?: "all" | BatchState;
  initialFrom?: string;
  initialTo?: string;
  initialPage?: number;
  initialSchemeId?: string;
  initialSchemeName?: string;
}) {
  const [tab, setTab] = useState<ViewTab>(preview ? "batches" : initialTab);
  const [source, setSource] = useState<SourceFilter>(initialSource);
  const [state, setState] = useState<"all" | BatchState>(initialState);
  const [page, setPage] = useState(initialPage);
  const [data, setData] = useState<ListData | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [showSchemes, setShowSchemes] = useState(false);
  const [schemeFilter, setSchemeFilter] = useState<{ id: string; name: string } | null>(initialSchemeId ? { id: initialSchemeId, name: initialSchemeName || "已保存配置" } : null);
  const [schemeAction, setSchemeAction] = useState<"create" | "edit" | "launch">("create");
  const [schemeTarget, setSchemeTarget] = useState("");
  const [schemeRefresh, setSchemeRefresh] = useState(0);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const filtersActive = source !== "all" || state !== "all" || !!schemeFilter || !!from || !!to;
  const filterCount = [source !== "all", state !== "all", !!schemeFilter, !!(from || to)].filter(Boolean).length;

  useEffect(() => {
    if (tab !== "batches") return;
    const controller = new AbortController();
    async function load() {
      try {
        if (preview) {
          const filtered = previewBatches.filter((batch) => (source === "all" || source === "nightly" && batch.source !== "manual" || batch.source === source) && (state === "all" || batch.state === state) && (!from || batch.date >= from) && (!to || batch.date <= to));
          const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
          const safePage = Math.min(page, pages);
          setData({ items: filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), total: filtered.length, storageReady: true });
          setError("");
          if (safePage !== page) setPage(safePage);
          return;
        }
        const value = await fetchBatchList({ source, state: state === "all" ? undefined : state, from, to, schemeId: schemeFilter?.id, page, pageSize: PAGE_SIZE }, controller.signal);
        if (schemeFilter && value.storageReady !== false && value.schemeFilterApplied !== true) throw new Error("后端版本尚不支持按配置筛选执行记录，请更新后重试。");
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
  }, [tab, preview, source, state, from, to, page, retry, schemeFilter]);

  useEffect(() => {
    if (!filterOpen) return;
    const onPointerDown = (event: PointerEvent) => { if (!filterRef.current?.contains(event.target as Node)) setFilterOpen(false); };
    const onKeyDown = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setFilterOpen(false); filterButtonRef.current?.focus(); } };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, [filterOpen]);

  function changeSource(value: "all" | "nightly" | BatchSource) { setSource(value); setPage(1); }
  function changeState(value: "all" | BatchState) { setState(value); setPage(1); }
  function reset() { setSource("all"); setState("all"); setSchemeFilter(null); setFrom(""); setTo(""); setPage(1); }
  function openScheme(action: "create" | "edit" | "launch", id = "") { setSchemeAction(action); setSchemeTarget(id); setShowSchemes(true); }

  const pages = Math.max(1, Math.ceil((data?.total || 0) / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const items = data?.items || [];
  const listParams = new URLSearchParams({ tab: "batches" });
  if (source !== "all") listParams.set("source", source);
  if (state !== "all") listParams.set("state", state);
  if (from) listParams.set("from", from);
  if (to) listParams.set("to", to);
  if (safePage > 1) listParams.set("page", String(safePage));
  if (schemeFilter) { listParams.set("schemeId", schemeFilter.id); listParams.set("schemeName", schemeFilter.name); }
  const listHref = `${basePath}?${listParams.toString()}`;
  const pathname = usePathname();
  const pageParams = new URLSearchParams();
  if (tab !== "configs") pageParams.set("tab", tab);
  if (source !== "all") pageParams.set("source", source);
  if (state !== "all") pageParams.set("state", state);
  if (from) pageParams.set("from", from);
  if (to) pageParams.set("to", to);
  if (page > 1) pageParams.set("page", String(page));
  if (schemeFilter) { pageParams.set("schemeId", schemeFilter.id); pageParams.set("schemeName", schemeFilter.name); }
  const pageHref = `${basePath}${pageParams.toString() ? `?${pageParams.toString()}` : ""}`;
  useEffect(() => {
    if (pathname === basePath && typeof window !== "undefined") window.history.replaceState(null, "", pageHref);
  }, [pathname, basePath, pageHref]);

  return <main className={styles.page} aria-labelledby="batches-title">
    <div className={styles.pageInner}>
    {preview && <PreviewNote />}
    <header className={styles.header}>
      <div>
        <h1 id="batches-title">测评批次</h1>
        <p>{tab === "configs" ? "管理可重复使用的个人批次配置。" : tab === "batches" ? "查看夜间和手动测评的独立执行记录。" : "按日期查看夜间自动测评日报。"}</p>
      </div>
    </header>
    <BatchSchemePanel open={showSchemes && !preview} initialAction={schemeAction} initialSchemeId={schemeTarget} onClose={() => setShowSchemes(false)} onSaved={() => setSchemeRefresh(value => value + 1)} onStarted={() => { setShowSchemes(false); setTab("batches"); setSource("all"); setPage(1); setRetry(value => value + 1); }} />
    <div className={styles.toolbar}>
      <Tabs variant="segmented" ariaLabel="测评批次视图" items={preview ? [viewTabs[0], viewTabs[1]] : viewTabs} value={tab} onChange={(value) => { setTab(value as ViewTab); setFilterOpen(false); }} />
    </div>
    {tab === "batches" && <>
    <div className={styles.listControls}>
      <p className={styles.summaryLine}>
        {error ? "批次列表暂不可用。" : !data ? "正在读取批次…" : data.total ? `共 ${data.total} 个批次` : filtersActive ? "没有匹配的批次。" : "暂无测评批次。"}
      </p>
      <div className={styles.filters}>
        <div className={styles.filterWrap} ref={filterRef}>
          <button ref={filterButtonRef} type="button" className={styles.filterButton} aria-haspopup="dialog" aria-expanded={filterOpen} onClick={() => setFilterOpen(value => !value)}>
            筛选
            {filterCount > 0 && <span className={styles.filterCount}>{filterCount}</span>}
          </button>
          {filterOpen && <div className={styles.filterPanel} role="dialog" aria-label="筛选执行记录">
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>来源</span>
              <div className={styles.filterOptions}>{sourceTabs.map(item => <button key={item.value} type="button" className={styles.filterOption} aria-pressed={source === item.value} onClick={() => changeSource(item.value as "all" | "nightly" | BatchSource)}>{item.value === "all" ? "全部" : item.label}</button>)}</div>
            </div>
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>状态</span>
              <div className={styles.filterOptions}>{[{ value: "all", label: "全部" }, ...(["done", "partial", "running", "failed"] as BatchState[]).map(value => ({ value, label: stateLabel(value) }))].map(item => <button key={item.value} type="button" className={styles.filterOption} aria-pressed={state === item.value} onClick={() => changeState(item.value as "all" | BatchState)}>{item.label}</button>)}</div>
            </div>
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>日期</span>
              <div className={styles.filterDates}>
                <input type="date" aria-label="开始日期" value={from} max={to || undefined} onChange={event => { setFrom(event.target.value); setPage(1); }} />
                <span>至</span>
                <input type="date" aria-label="结束日期" value={to} min={from || undefined} onChange={event => { setTo(event.target.value); setPage(1); }} />
              </div>
            </div>
            <div className={styles.filterFoot}><Button variant="ghost" onClick={reset}>清除全部</Button><Button variant="secondary" onClick={() => setFilterOpen(false)}>完成</Button></div>
          </div>}
        </div>
        <Button variant="secondary" onClick={() => setRetry(value => value + 1)}>刷新</Button>
      </div>
    </div>
    {filtersActive && <div className={styles.filterChips}>
      {schemeFilter && <span className={styles.filterChip}>配置：{schemeFilter.name}<button type="button" aria-label="清除配置筛选" onClick={() => setSchemeFilter(null)}>×</button></span>}
      {source !== "all" && <span className={styles.filterChip}>来源：{sourceTabs.find(item => item.value === source)?.label}<button type="button" aria-label="清除来源筛选" onClick={() => changeSource("all")}>×</button></span>}
      {state !== "all" && <span className={styles.filterChip}>状态：{stateLabel(state)}<button type="button" aria-label="清除状态筛选" onClick={() => changeState("all")}>×</button></span>}
      {(from || to) && <span className={styles.filterChip}>日期：{from || "不限"} 至 {to || "不限"}<button type="button" aria-label="清除日期筛选" onClick={() => { setFrom(""); setTo(""); setPage(1); }}>×</button></span>}
    </div>}
    </>}
    {tab === "configs" ? <BatchSchemesList preview={preview} refresh={schemeRefresh} onOpen={openScheme} onHistory={(id, name) => { setSchemeFilter({ id, name }); setSource("all"); setState("all"); setFrom(""); setTo(""); setPage(1); setFilterOpen(false); setTab("batches"); }} /> : tab === "reports" ? <DailyReportList embedded /> : <>
    {error ? <EmptyState state="error" title="无法读取批次列表" description={error} action={<Button variant="secondary" onClick={() => setRetry((value) => value + 1)}>重试</Button>} /> : !data ? <EmptyState state="loading" title="正在读取批次…" /> : data.storageReady === false ? <EmptyState state="empty" title="批次存储尚未迁移" description="夜间测评批次功能需要先完成数据库迁移。" /> : <>
      <div className={styles.tabBody}>
      {items.length === 0 ? <EmptyState
        state="empty"
        title={source === "nightly" && from && from === to && state === "all" && !schemeFilter ? "该日期未发现夜间执行记录。" : filtersActive ? "没有匹配的执行记录。" : "暂无测评执行记录。"}
        action={filtersActive ? <Button variant="secondary" onClick={reset}>清除筛选</Button> : undefined}
      /> : <div className={styles.batchListWrap}>
        <ul className={styles.cardGrid} aria-label="测评批次">
          {items.map((batch) => <li key={batch.batchId} className={styles.dataCard}>
            <Link className={styles.cardLink} href={appendFrom(`${basePath}/${batch.batchId}`, listHref)} aria-label={`查看 ${batch.date} 测评批次`} />
            <div className={styles.cardHead}>
              <strong className={styles.cardTitle}>{formatDate(batch.date)} · {sourceLabel(batch.source)}</strong>
              <span className={styles.cardStatus}><BatchStatus state={batch.state} /></span>
            </div>
            <span className={styles.cardMeta}>{batch.scheme ? `${batch.scheme.name} v${batch.scheme.version} · ` : ""}{batch.services.length} 个服务 · 更新 {formatDateTime(batch.updatedAt)}{batch.error ? ` · ${batch.error}` : ""}</span>
            <div className={styles.cardStats}>
              <span><b>{batch.totals.total}</b>/{batch.totals.planned} 已记录</span>
              <span>失败 <b>{batch.totals.failed}</b></span>
              <span>超时 <b>{batch.totals.timeout}</b></span>
              <span className={styles.cardScores}><ScorePair deepSeek={batch.scores.deepSeek.mean} qwen={batch.scores.qwen.mean} /></span>
            </div>
            <div className={styles.cardFoot}>
              <Button variant="secondary" size="sm" href={`${basePath}/${batch.batchId}/comparison`}>环比</Button>
            </div>
          </li>)}
        </ul>
      </div>}
      </div>
      <Pagination page={safePage} pages={pages} total={data.total} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </>}
    </>}
    </div>
  </main>;
}
