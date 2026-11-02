"use client";
import { createRequestKey } from "@/lib/request-key";

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { ScoreSummary, type ScoreSummaryValue } from "@/components/score-summary";
import { Button, EmptyState, Pagination, StatusDot, ToastStack, useToasts, type StatusTone, type ToastTone } from "@/components/ui";
import { questionDomains } from "@/lib/question-domains";
import { buildRunMarkdown, runMarkdownFilename } from "@/lib/run-markdown";
import Link from "next/link";

type Run = { runId: string; serviceKey: string; origin: string; question: string; status: string; startedAt: string | null; domainKey?: string | null; canRescore?: boolean; scores?: ScoreSummaryValue };
type MenuState = { run: Run; top: number; left: number; trigger: HTMLButtonElement };
const names: Record<string, string> = { "mission-material": "Mission 主服务", "alpha-rsi": "1110", alloy: "合金材料", literature: "文献检索", "literature-aircraft": "航空文献", synthesis: "合成制备", "new-material": "新材料" };
const statuses: Record<string, string> = { queued: "排队中", running: "运行中", scoring: "评分中", done: "已结束", error: "失败" };
const origins: Record<string, string> = { manual: "人工对话", automation: "自动化", legacy: "其他入口" };
const domainOptions: [string, string][] = [["", "全部领域"], ["unclassified", "未分类"], ...Object.entries(questionDomains)];
function pad(value: number) { return String(value).padStart(2, "0"); }
function dateLabel(value: string | null) {
  if (!value) return "未知";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function statusTone(status: string): StatusTone {
  if (status === "done") return "success";
  if (status === "error") return "danger";
  return status === "running" || status === "scoring" ? "info" : "neutral";
}
function domainLabel(key?: string | null) { return questionDomains[key || ""] || "未分类"; }

function RunRow({ run, menuOpen, onMenu }: { run: Run; menuOpen: boolean; onMenu: (event: ReactMouseEvent<HTMLButtonElement>, run: Run) => void }) {
  const started = dateLabel(run.startedAt);
  const service = names[run.serviceKey] || run.serviceKey;
  const origin = origins[run.origin] || "未知";
  const status = statuses[run.status] || "状态未知";
  return <li className="run-row">
    <Link className="run-row-link" href={`/runs/${run.runId}`} title={run.question} aria-label={`查看运行：${run.question}`} />
    <span className="run-row-main">
      <strong className="run-row-question">{run.question || "未命名题目"}</strong>
      <span className="run-row-meta">{service} · {domainLabel(run.domainKey)} · {origin}<span className="run-row-inline-time"> · {started}</span></span>
    </span>
    <span className="run-row-status"><StatusDot tone={statusTone(run.status)}>{status}</StatusDot></span>
    <span className="run-row-score"><ScoreSummary scores={run.scores} /></span>
    <time className="run-row-time" dateTime={run.startedAt || undefined}>{started}</time>
    <span className="run-row-actions">
      <button type="button" className="run-action-button" aria-haspopup="menu" aria-expanded={menuOpen} aria-label={`更多操作：${run.question}`} onClick={(event) => onMenu(event, run)}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
      </button>
    </span>
  </li>;
}

export function UnifiedRunList() {
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [domain, setDomain] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<{ items: Run[]; total: number } | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [rescoring, setRescoring] = useState<string | null>(null);
  const { toasts, push: pushToast, dismiss: dismissToast } = useToasts();
  const filterRef = useRef<HTMLDivElement>(null);
  const filterButton = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(query.trim()); setPage(1); }, 250);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (search) params.set("q", search);
    if (domain) params.set("domain", domain);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    fetch(`/api/evaluation/unified/runs?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { const value = await response.json().catch(() => ({})); if (!response.ok || !Array.isArray(value.items) || typeof value.total !== "number") throw new Error(typeof value.error === "string" ? value.error : "无法读取运行记录。"); return value; })
      .then((value) => { setData(value); setError(""); })
      .catch((err) => { if (!controller.signal.aborted) { setData(null); setError(err instanceof Error ? err.message : "读取失败。"); } });
    return () => controller.abort();
  }, [page, retry, search, domain, from, to]);
  useEffect(() => {
    if (!filterOpen) return;
    const onPointerDown = (event: PointerEvent) => { if (!filterRef.current?.contains(event.target as Node)) setFilterOpen(false); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setFilterOpen(false); filterButton.current?.focus(); } };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, [filterOpen]);
  useEffect(() => {
    if (!menu) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (menuRef.current?.contains(target as Node) || target?.closest?.(".run-row-actions")) return;
      setMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); const trigger = menu.trigger; setMenu(null); trigger.focus(); } };
    const onScroll = () => setMenu(null);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); window.removeEventListener("scroll", onScroll, true); };
  }, [menu]);
  useEffect(() => {
    if (!menu) return;
    const frame = requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
    return () => cancelAnimationFrame(frame);
  }, [menu]);
  const pages = Math.max(1, Math.ceil((data?.total || 0) / 20));
  const filtersActive = Boolean(search || domain || from || to);
  const hasChips = Boolean(domain || from || to);
  const filterCount = (domain ? 1 : 0) + (from || to ? 1 : 0);
  function notify(message: string, tone: ToastTone = "success") {
    pushToast(tone, message);
  }
  function clearSearch() { setQuery(""); setSearch(""); setPage(1); }
  function resetFilters() { setQuery(""); setSearch(""); setDomain(""); setFrom(""); setTo(""); setPage(1); }
  function openMenu(event: ReactMouseEvent<HTMLButtonElement>, run: Run) {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = 180;
    setMenu({ run, left: Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width)), top: Math.min(rect.bottom + 6, window.innerHeight - 190), trigger: event.currentTarget });
  }
  function toggleMenu(event: ReactMouseEvent<HTMLButtonElement>, run: Run) {
    if (menu?.run.runId === run.runId) { setMenu(null); return; }
    openMenu(event, run);
  }
  async function copyQuestion(run: Run) {
    setMenu(null);
    try { await navigator.clipboard.writeText(run.question); notify("题目已复制到剪贴板。"); }
    catch { notify("无法访问剪贴板，请打开详情后手动复制。", "error"); }
  }
  async function rescore(run: Run) {
    setMenu(null);
    if (rescoring) return;
    setRescoring(run.runId);
    try {
      const response = await fetch(`/api/evaluation/unified/runs/${encodeURIComponent(run.runId)}/score`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": createRequestKey() }, body: "{}" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : data.error?.message || "无法发起重评，请重试。");
      notify("已提交重新评分。");
      setRetry((value) => value + 1);
    } catch (err) { notify(err instanceof Error ? err.message : "结果未知，请用原请求重试。", "error"); }
    finally { setRescoring(null); }
  }
  async function exportMarkdown(run: Run) {
    setMenu(null);
    notify("正在准备导出…", "info");
    try {
      const response = await fetch(`/api/evaluation/unified/runs/${encodeURIComponent(run.runId)}`, { cache: "no-store" });
      const snapshot = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof snapshot.error === "string" ? snapshot.error : "无法读取运行详情。");
      const content = buildRunMarkdown(snapshot, { readError: "" });
      const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url; link.download = runMarkdownFilename(run.runId);
      document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      notify("已导出 Markdown。");
    } catch (err) { notify(err instanceof Error ? err.message : "导出失败，请重试。", "error"); }
  }
  return <section className="runs-list-page" aria-labelledby="runs-title"><header className="runs-list-header"><div><h1 id="runs-title">运行记录</h1><p>统一流式对话和自动化运行记录，点击任意一条查看详情。</p></div><Button href="/evaluate" variant="primary">新建测评</Button></header>
    <div className="runs-toolbar">
      <div className="runs-search">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.4-3.4" /></svg>
        <input value={query} maxLength={100} autoComplete="off" spellCheck={false} placeholder="搜索题目或运行 ID" aria-label="搜索运行记录" onChange={(event) => setQuery(event.target.value)} />
        {query && <button type="button" className="runs-search-clear" aria-label="清除搜索" onClick={clearSearch}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg></button>}
      </div>
      <div className="runs-filter-wrap" ref={filterRef}>
        <button ref={filterButton} type="button" className="runs-filter" aria-haspopup="dialog" aria-expanded={filterOpen} onClick={() => setFilterOpen((value) => !value)}>
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M7 12h10M10 17h4" /></svg>
          <span>筛选</span>
          {filterCount > 0 && <span className="runs-filter-count">{filterCount}</span>}
        </button>
        {filterOpen && <div className="runs-filter-panel" role="dialog" aria-label="筛选运行记录">
          <div className="runs-filter-group"><span className="runs-filter-label">日期</span><div className="runs-filter-dates">
            <input type="date" value={from} max={to || undefined} aria-label="开始日期" onChange={(event) => { setFrom(event.target.value); setPage(1); }} />
            <span>至</span>
            <input type="date" value={to} min={from || undefined} aria-label="结束日期" onChange={(event) => { setTo(event.target.value); setPage(1); }} />
          </div></div>
          <div className="runs-filter-group"><span className="runs-filter-label">领域</span><div className="runs-domain-options" role="group" aria-label="领域">{domainOptions.map(([key, label]) => <button key={key} type="button" className="runs-domain-option" aria-pressed={domain === key} onClick={() => { setDomain(key); setPage(1); }}>{label}</button>)}</div></div>
          <div className="runs-filter-foot"><Button type="button" variant="ghost" size="sm" onClick={resetFilters}>清除全部</Button><Button type="button" variant="secondary" onClick={() => setFilterOpen(false)}>完成</Button></div>
        </div>}
      </div>
      {filtersActive && <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>重置</Button>}
    </div>
    {hasChips && <div className="runs-filter-chips">
      {(from || to) && <span className="runs-filter-chip"><span>日期 {from || "不限"} 至 {to || "不限"}</span><button type="button" aria-label="清除日期筛选" onClick={() => { setFrom(""); setTo(""); setPage(1); }}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg></button></span>}
      {domain && <span className="runs-filter-chip"><span>{domain === "unclassified" ? "未分类" : domainLabel(domain)}</span><button type="button" aria-label="清除领域筛选" onClick={() => { setDomain(""); setPage(1); }}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg></button></span>}
    </div>}
    {error ? <EmptyState state="error" title={error} action={<Button type="button" variant="secondary" onClick={() => setRetry((value) => value + 1)}>重试</Button>} /> : !data ? <EmptyState state="loading" title="正在读取运行记录…" /> : data.total === 0 ? <EmptyState state="empty" title={filtersActive ? "没有匹配的运行记录。" : "暂无统一运行记录。"} action={filtersActive ? <Button type="button" variant="secondary" onClick={resetFilters}>清除筛选</Button> : undefined} /> : <><div className="runs-list-wrap"><div className="runs-list-head" aria-hidden="true"><span>题目</span><span>状态</span><span>评分</span><span>开始时间</span><span>操作</span></div><ul className="runs-list" aria-label="运行记录">{data.items.map((run) => <RunRow key={run.runId} run={run} menuOpen={menu?.run.runId === run.runId} onMenu={toggleMenu} />)}</ul></div><Pagination page={page} pages={pages} total={data.total} pageSize={20} onPageChange={(next) => { setData(null); setPage(next); }} /></>}
    {menu && <div ref={menuRef} className="run-action-menu" role="menu" style={{ top: menu.top, left: menu.left }}>
      <Link className="run-action-item" role="menuitem" href={`/runs/${menu.run.runId}`} onClick={() => setMenu(null)}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-6-6 6 6-6 6" /></svg><span>查看详情</span></Link>
      <button type="button" className="run-action-item" role="menuitem" onClick={() => void copyQuestion(menu.run)}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5h10" /></svg><span>复制题目</span></button>
      {menu.run.canRescore && <button type="button" className="run-action-item" role="menuitem" disabled={rescoring === menu.run.runId} onClick={() => void rescore(menu.run)}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 17.9 17" /></svg><span>{rescoring === menu.run.runId ? "正在提交…" : "重新评分"}</span></button>}
      <button type="button" className="run-action-item" role="menuitem" onClick={() => void exportMarkdown(menu.run)}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v11m-4-4 4 4 4-4M5 20h14" /></svg><span>导出 Markdown</span></button>
    </div>}
    {toasts.length > 0 && <ToastStack toasts={toasts} onDismiss={dismissToast} />}
  </section>;
}
