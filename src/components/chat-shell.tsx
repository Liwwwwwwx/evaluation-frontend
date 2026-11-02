"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/logo";
import { AccountMenu } from "@/components/workspace";

type HistoryItem = {
  id: string;
  question: string;
  status: string;
  startedAt: string | null;
  quality?: { status?: string | null } | null;
};

type IconName = "plus" | "grid" | "book" | "clock" | "menu" | "close";

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    plus: <path d="M12 5v14M5 12h14" />,
    grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5z" /><path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20" /></>,
    clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></>,
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

function SidebarBody({ items, error, activeId, onNavigate }: {
  items: HistoryItem[];
  error: string;
  activeId: string | null;
  onNavigate?: () => void;
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
        {error ? <p className="chat-note">{error}</p> : items.length === 0 ? (
          <p className="chat-note">本标签页暂无流式对话。</p>
        ) : (
          groups.map((group) => (
            <div key={group.label}>
              <p className="chat-group-label">{group.label}</p>
              {group.items.map((item) => (
                <Link
                  key={item.id}
                  className={`chat-item${item.id === activeId ? " active" : ""}`}
                  href={`/runs/${item.id}`}
                  title={item.question}
                  onClick={onNavigate}
                >
                  <span className={statusClass(item.status)} />
                  <span className="chat-item-text">{item.question}</span>
                </Link>
              ))}
            </div>
          ))
        )}
      </div>

      <div className="chat-foot">
        <Link className={`chat-foot-link${pathname === "/runs" ? " active" : ""}`} href="/runs" aria-current={pathname === "/runs" ? "page" : undefined} onClick={onNavigate}><Icon name="clock" />运行记录</Link>
        <Link className={`chat-foot-link${pathname === "/question-bank" ? " active" : ""}`} href="/question-bank" aria-current={pathname === "/question-bank" ? "page" : undefined} onClick={onNavigate}><Icon name="book" />题库</Link>
        <Link className={`chat-foot-link${pathname === "/scoring-rules" ? " active" : ""}`} href="/scoring-rules" aria-current={pathname === "/scoring-rules" ? "page" : undefined} onClick={onNavigate}><Icon name="grid" />评测规则</Link>
        <div className="chat-account"><AccountMenu showName /></div>
      </div>
    </>
  );
}

export function ChatShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [sidebarWidth, setSidebarWidth] = useState(288);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [historyError, setHistoryError] = useState("");
  const drawer = useRef<HTMLDialogElement>(null);
  const activeId = pathname.startsWith("/runs/") ? pathname.split("/")[2] : null;
  const isEvaluate = pathname === "/evaluate";

  useEffect(() => {
    let active = true;
    const load = () => {
      fetch("/api/evaluation/unified/runs?origin=manual&page=1&pageSize=50", { cache: "no-store" })
        .then(async (response) => { if (!response.ok) throw new Error("加载失败"); return response.json(); })
        .then((value) => { if (active) { if (!Array.isArray(value.items)) throw new Error("格式异常"); setItems(value.items.map((item: { runId: string; question: string; status: string; startedAt: string | null }) => ({ id: item.runId, question: item.question, status: item.status, startedAt: item.startedAt }))); setHistoryError(""); } })
        .catch(() => { if (active) { setItems([]); setHistoryError("无法读取对话记录，请稍后重试。"); } });
    };
    load();
    window.addEventListener("evaluation-unified-change", load);
    return () => { active = false; window.removeEventListener("evaluation-unified-change", load); };
  }, [pathname]);

  const closeDrawer = () => drawer.current?.close();

  return (
    <div className="chat-shell">
      <aside className="chat-sidebar desktop-chat-sidebar" aria-label="运行历史" style={{ width: sidebarWidth }}>
        <SidebarBody items={items} error={historyError} activeId={activeId} />
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
        <div className="chat-sidebar">
          <SidebarBody items={items} error={historyError} activeId={activeId} onNavigate={closeDrawer} />
        </div>
      </dialog>

      <div className="chat-main">
        <div className="chat-mobilebar">
          <button type="button" className="icon-button" aria-label="打开运行历史" onClick={() => drawer.current?.showModal()}>
            <Icon name="menu" />
          </button>
          <span>{isEvaluate ? "新建测评" : pathname === "/" ? "评测工作台" : pathname === "/question-bank" ? "题库" : pathname === "/scoring-rules" ? "评测规则" : "运行记录"}</span>
        </div>
        {children}
      </div>
    </div>
  );
}
