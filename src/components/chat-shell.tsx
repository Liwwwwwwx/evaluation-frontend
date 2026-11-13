"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";
import { AccountMenu } from "@/components/workspace";
import { Button, Dialog, InlineAlert, Input } from "@/components/ui";
import { createRequestKey } from "@/lib/request-key";
import { appendFrom } from "@/lib/navigation";
import { isUncertainRun } from "@/lib/run-status";
import { mergeHistoryStatuses, type HistoryStatus } from "@/lib/run-history-status";
import { evaluationServiceCatalog } from "@/lib/evaluation-services";

type HistoryItem = {
  id: string;
  serviceKey?: string | null;
  question: string;
  title?: string | null;
  status: string;
  recoveryState?: string;
  startedAt: string | null;
  comparisonGroupId?: string | null;
  quality?: { status?: string | null } | null;
};

type IconName = "plus" | "grid" | "book" | "clock" | "layers" | "menu" | "close";

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    plus: <path d="M12 5v14M5 12h14" />,
    grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5z" /><path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20" /></>,
    clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></>,
    layers: <><path d="m12 3 8 4.5-8 4.5-8-4.5z" /><path d="m4 12 8 4.5 8-4.5" /><path d="m4 16.5 8 4.5 8-4.5" /></>,
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function statusClass(status: string) {
  if (["queued", "running", "scoring"].includes(status)) return "run-dot running";
  if (status === "done") return "run-dot done";
  if (status === "error") return "run-dot error";
  return "run-dot";
}

const activeStatusLabels: Record<string, string> = { queued: "排队中", running: "运行中", scoring: "评分中" };

function serviceLabels(key?: string | null) {
  const normalized = typeof key === "string" ? key.trim() : "";
  const full = evaluationServiceCatalog.find(item => item.key === normalized)?.label || normalized || "服务未知";
  return { full, short: full };
}

function groupLabel(value: string | null) {
  if (!value) return "更早";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "更早";
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const diff = startOfToday.getTime() - date.getTime();
  if (diff < 0) return "今天";
  if (diff < 86400000) return "昨天";
  return "更早";
}

export function SidebarBody({ items, error, activeId, onNavigate, onManage, canManage, storageReady, preview = false }: {
  items: HistoryItem[];
  error: string;
  activeId: string | null;
  onNavigate?: () => void;
  onManage: (item: HistoryItem) => void;
  canManage: boolean;
  storageReady: boolean;
  preview?: boolean;
}) {
  const pathname = usePathname();
  const groups: { label: string; items: HistoryItem[] }[] = [];
  for (const item of items) {
    const label = groupLabel(item.startedAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }

  return (
    <>
      <Link className="chat-brand" href="/" onClick={onNavigate}>
        <Logo />
        <span>Science <b>评测</b></span>
      </Link>
      <Link className="chat-new" href="/evaluate" onClick={(event) => {
        const signal = new Event("evaluation-new-request", { cancelable: true });
        if (!window.dispatchEvent(signal)) { event.preventDefault(); return; }
        sessionStorage.removeItem("evaluation-unified-run");
        onNavigate?.();
      }}>
        <Icon name="plus" />
        <span>新建测评</span>
      </Link>

      <div className="chat-section">
        <span>近期对话</span>
      </div>

      <div className="chat-history">
        {!preview && !storageReady && !error && <p className="chat-note">对话管理暂未启用。</p>}
        {error ? <p className="chat-note">{error}</p> : items.length === 0 ? (
          <p className="chat-note">本标签页暂无流式对话。</p>
        ) : (
          groups.map((group) => (
            <div key={group.label}>
              <p className="chat-group-label">{group.label}</p>
              {group.items.map((item) => {
                const uncertain = isUncertainRun(item.status, item.recoveryState);
                const activeLabel = uncertain ? "状态待确认" : activeStatusLabels[item.status];
                const service = serviceLabels(item.serviceKey);
                return <div key={item.id} className={`chat-item-row${item.id === activeId ? " active" : ""}`} data-running={!uncertain && item.status === "running" ? "true" : undefined}>
                  <Link
                    className="chat-item"
                    href={`/runs/${item.id}`}
                    title={`${item.title || item.question} · ${service.full}`}
                    onClick={onNavigate}
                  >
                    <span className={statusClass(uncertain ? "unknown" : item.status)} />
                    <span className="chat-item-content">
                      <span className="chat-item-title-line"><span className="chat-item-text">{item.title || item.question}</span>{activeLabel && <span className="chat-item-status" data-status={uncertain ? "unknown" : item.status}><span className="chat-item-status-dot" aria-hidden="true" />{activeLabel}</span>}</span>
                      <span className="chat-item-service" title={service.full}>{service.short}</span>
                    </span>
                  </Link>
                  {item.comparisonGroupId && <Link className="chat-comparison-link" href={appendFrom(`/compare/${encodeURIComponent(item.comparisonGroupId)}`, pathname)} aria-label={`查看双服务对比：${item.title || item.question}`} onClick={onNavigate}>对比</Link>}
                  {canManage && <button type="button" className="chat-item-more" aria-label={`管理对话：${(item.title || item.question).slice(0, 24)}`} onClick={() => { onNavigate?.(); onManage(item); }}>•••</button>}
                </div>;
              })}
            </div>
          ))
        )}
      </div>

      <div className="chat-foot">
        <Link className={`chat-foot-link${pathname.startsWith("/batches") || pathname.startsWith("/preview/batches") || pathname.startsWith("/daily-reports") ? " active" : ""}`} href={preview ? "/preview/batches" : "/batches"} aria-current={pathname.startsWith("/batches") || pathname.startsWith("/preview/batches") || pathname.startsWith("/daily-reports") ? "page" : undefined} onClick={onNavigate}><Icon name="layers" />测评批次</Link>
        <Link className={`chat-foot-link${pathname === "/runs" || pathname.startsWith("/runs/") ? " active" : ""}`} href="/runs" aria-current={pathname === "/runs" || pathname.startsWith("/runs/") ? "page" : undefined} onClick={onNavigate}><Icon name="clock" />运行记录</Link>
        <Link className={`chat-foot-link${pathname.startsWith("/question-bank") ? " active" : ""}`} href="/question-bank" aria-current={pathname.startsWith("/question-bank") ? "page" : undefined} onClick={onNavigate}><Icon name="book" />题库</Link>
        <Link className={`chat-foot-link${pathname === "/standards" || pathname === "/scoring-rules" ? " active" : ""}`} href="/standards" aria-current={pathname === "/standards" || pathname === "/scoring-rules" ? "page" : undefined} onClick={onNavigate}><Icon name="grid" />测评助手</Link>
        {!preview && <div className="chat-account"><AccountMenu showName onNavigate={onNavigate} /></div>}
      </div>
    </>
  );
}

export function ChatShell({ children, preview = false }: { children: ReactNode; preview?: boolean }) {
  const pathname = usePathname();
  const [sidebarWidth, setSidebarWidth] = useState(288);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [historyError, setHistoryError] = useState(preview ? "预览模式不读取运行历史。" : "");
  const [historyReady, setHistoryReady] = useState(true);
  const [canManageHistory, setCanManageHistory] = useState(false);
  const [managedItem, setManagedItem] = useState<HistoryItem | null>(null);
  const [historyTitle, setHistoryTitle] = useState("");
  const [historyAction, setHistoryAction] = useState<"edit" | "remove">("edit");
  const [historyBusy, setHistoryBusy] = useState(false);
  const [historyActionError, setHistoryActionError] = useState("");
  const historyRequest = useRef(0);
  const historySequence = useRef(0);
  const statusUpdates = useRef(new Map<string, HistoryStatus>());
  const historyItems = useRef<HistoryItem[]>([]);
  const drawer = useRef<HTMLDialogElement>(null);
  const activeId = pathname.startsWith("/runs/") ? pathname.split("/")[2] : null;
  const isEvaluate = pathname === "/evaluate";

  useEffect(() => {
    if (preview) return;
    let active = true;
    const pending = new Set<AbortController>();
    const load = () => {
      const request = ++historyRequest.current;
      const sequence = historySequence.current;
      const controller = new AbortController(); pending.add(controller);
      const timeout = setTimeout(() => controller.abort(), 15000);
      fetch("/api/evaluation/unified/history", { cache: "no-store", signal: controller.signal })
        .then(async (response) => { if (response.status === 404 || response.status === 503) { const fallback = await fetch("/api/evaluation/unified/runs?origin=manual&page=1&pageSize=50", { cache: "no-store", signal: controller.signal }); if (!fallback.ok) throw new Error("加载失败"); return { ...await fallback.json(), storageReady: false, canManage: false }; } if (!response.ok) throw new Error("加载失败"); return response.json(); })
        .then((value) => { if (active && request === historyRequest.current) { if (!Array.isArray(value.items)) throw new Error("格式异常"); const next = value.items.map((item: { runId: string; serviceKey?: string | null; question: string; title?: string | null; status: string; recoveryState?: string; startedAt: string | null; comparisonGroupId?: string | null }) => ({ id: item.runId, serviceKey: typeof item.serviceKey === "string" ? item.serviceKey : null, question: item.question, title: item.title, status: item.status, recoveryState: item.recoveryState, startedAt: item.startedAt, comparisonGroupId: item.comparisonGroupId })); setItems(mergeHistoryStatuses(next, statusUpdates.current, sequence)); for (const [id, update] of statusUpdates.current) if (update.sequence <= sequence) statusUpdates.current.delete(id); setHistoryReady(value.storageReady === true); setCanManageHistory(value.canManage === true); setHistoryError(""); } })
        .catch(() => { if (active && request === historyRequest.current) setHistoryError("无法读取对话记录，请稍后重试。"); })
        .finally(() => { clearTimeout(timeout); pending.delete(controller); });
    };
    load();
    const onStatus = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail || typeof detail.runId !== "string" || typeof detail.status !== "string") return;
      const update = { status: detail.status, recoveryState: typeof detail.recoveryState === "string" ? detail.recoveryState : undefined, sequence: ++historySequence.current };
      statusUpdates.current.set(detail.runId, update);
      setItems(current => current.map(item => item.id === detail.runId ? { ...item, status: update.status, recoveryState: update.recoveryState } : item));
    };
    const timer = setInterval(() => { if (!pending.size && document.visibilityState === "visible" && historyItems.current.some(item => ["queued", "running", "scoring"].includes(item.status))) load(); }, 5000);
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    window.addEventListener("evaluation-unified-change", load);
    window.addEventListener("evaluation-run-status", onStatus);
    document.addEventListener("visibilitychange", onVisible);
    return () => { active = false; clearInterval(timer); for (const controller of pending) controller.abort(); window.removeEventListener("evaluation-unified-change", load); window.removeEventListener("evaluation-run-status", onStatus); document.removeEventListener("visibilitychange", onVisible); };
  }, [pathname, preview]);
  useEffect(() => { historyItems.current = items; }, [items]);

  const closeDrawer = () => drawer.current?.close();
  function manage(item: HistoryItem) { setManagedItem(item); setHistoryTitle((item.title || item.question).slice(0, 100)); setHistoryAction("edit"); setHistoryActionError(""); }
  async function updateHistory() {
    if (!managedItem || historyBusy) return;
    const title = historyTitle.trim();
    if (historyAction === "edit" && (!title || [...title].length > 100)) { setHistoryActionError("请输入 1–100 个字符的名称。"); return; }
    setHistoryBusy(true); setHistoryActionError("");
    try {
      const response = await fetch(`/api/evaluation/unified/history/${encodeURIComponent(managedItem.id)}`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": createRequestKey() }, body: JSON.stringify(historyAction === "edit" ? { action: "rename", title } : { action: "remove" }) });
      const value = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof value.error === "string" ? value.error : value.error?.message || "操作失败，请稍后重试。");
      historyRequest.current++;
      setItems(current => historyAction === "remove" ? current.filter(item => item.id !== managedItem.id) : current.map(item => item.id === managedItem.id ? { ...item, title } : item));
      setManagedItem(null);
      window.dispatchEvent(new Event("evaluation-unified-change"));
    } catch (error) { setHistoryActionError(error instanceof Error ? error.message : "操作失败，请稍后重试。"); }
    finally { setHistoryBusy(false); }
  }

  return (
    <div className="chat-shell">
      <aside className="chat-sidebar desktop-chat-sidebar" aria-label="运行历史" style={{ width: sidebarWidth }}>
        <SidebarBody items={items} error={historyError} activeId={activeId} onManage={manage} canManage={canManageHistory} storageReady={historyReady} preview={preview} />
        <div
          className="chat-resize"
          role="separator"
          aria-label="调整运行历史侧栏宽度"
          aria-orientation="vertical"
          aria-valuemin={240}
          aria-valuemax={400}
          aria-valuenow={sidebarWidth}
          tabIndex={0}
          onPointerDown={(event) => { if (event.button === 0) event.currentTarget.setPointerCapture(event.pointerId); }}
          onPointerMove={(event) => {
            if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
            const left = event.currentTarget.parentElement?.getBoundingClientRect().left ?? 0;
            setSidebarWidth(Math.max(240, Math.min(400, Math.round(event.clientX - left))));
          }}
          onKeyDown={(event) => {
            if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
            event.preventDefault();
            setSidebarWidth((width) => Math.max(240, Math.min(400, width + (event.key === "ArrowRight" ? 16 : -16))));
          }}
        />
      </aside>

      <dialog className="chat-drawer" ref={drawer} aria-label="运行历史" onClick={(event) => { if (event.target === event.currentTarget) closeDrawer(); }}>
        <button type="button" className="chat-drawer-close icon-button" aria-label="关闭运行历史" onClick={closeDrawer}><Icon name="close" /></button>
        <div className="chat-sidebar">
          <SidebarBody items={items} error={historyError} activeId={activeId} onNavigate={closeDrawer} onManage={manage} canManage={canManageHistory} storageReady={historyReady} preview={preview} />
        </div>
      </dialog>

      <Dialog open={!!managedItem} onClose={() => { if (!historyBusy) setManagedItem(null); }} title={historyAction === "edit" ? "管理对话" : "从侧栏移除对话？"} description={historyAction === "edit" ? "名称只对当前账号生效，不会修改题目原文。" : "仅从当前账号的近期对话中移除，运行记录和测评数据仍会保留。"} busy={historyBusy} footer={historyAction === "edit" ? <><Button variant="secondary" disabled={historyBusy} onClick={() => setManagedItem(null)}>取消</Button><Button variant="primary" loading={historyBusy} onClick={() => void updateHistory()}>保存名称</Button><Button variant="danger" disabled={historyBusy} onClick={() => { setHistoryAction("remove"); setHistoryActionError(""); }}>删除</Button></> : <><Button variant="secondary" disabled={historyBusy} onClick={() => { setHistoryAction("edit"); setHistoryActionError(""); }}>返回</Button><Button variant="danger" loading={historyBusy} onClick={() => void updateHistory()}>确认移除</Button></>}>
        {historyAction === "edit" && <Input label="对话名称" value={historyTitle} maxLength={100} disabled={historyBusy} onChange={event => setHistoryTitle(event.target.value)} />}
        {historyActionError && <InlineAlert tone="danger">{historyActionError}</InlineAlert>}
      </Dialog>

      <div className="chat-main">
        <div className="chat-mobilebar">
          <button type="button" className="icon-button" aria-label="打开运行历史" onClick={() => drawer.current?.showModal()}>
            <Icon name="menu" />
          </button>
          <span>{isEvaluate ? "新建测评" : pathname === "/" ? "评测工作台" : pathname.startsWith("/daily-reports") ? "测评日报" : pathname.startsWith("/batches") || pathname.startsWith("/preview/batches") ? "测评批次" : pathname.startsWith("/question-bank") ? "题库" : pathname === "/accounts" ? "用户管理" : pathname === "/standards" || pathname === "/scoring-rules" ? "测评助手" : pathname.startsWith("/compare") ? "对比测评" : "运行记录"}</span>
        </div>
        {children}
      </div>
    </div>
  );
}
