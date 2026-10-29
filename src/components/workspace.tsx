"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { useAuth } from "@/components/auth-gate";

type IconName = "plus" | "grid" | "book" | "clock" | "arrow" | "menu" | "close";
function Icon({ name }: { name: IconName }) {
  const paths = {
    plus: <path d="M12 5v14M5 12h14" />,
    grid: <><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></>,
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5z"/><path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20"/></>,
    clock: <><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></>,
    arrow: <path d="M12 19V5m-6 6 6-6 6 6" />,
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function Navigation({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const isBank = pathname === "/question-bank";
  return <>
    <div className="sidebar-header"><Link className="brand" href="/" onClick={onClose} aria-label="Science 评测首页"><Logo /><span>Science <b>评测</b></span></Link>{onClose && <button type="button" className="icon-button drawer-close" onClick={onClose} aria-label="关闭导航"><Icon name="close"/></button>}</div>
    <nav className="navigation" aria-label="工作空间">
      <div className="nav-item muted"><Icon name="plus"/><span>新建评测</span><small>待接入</small></div>
      <Link className={`nav-item ${!isBank ? "active" : ""}`} href="/" aria-current={!isBank ? "page" : undefined} onClick={onClose}><Icon name="grid"/><span>评测工作台</span></Link>
      <Link className={`nav-item ${isBank ? "active" : ""}`} href="/question-bank" aria-current={isBank ? "page" : undefined} onClick={onClose}><Icon name="book"/><span>题库</span></Link>
      <div className="nav-item muted"><Icon name="clock"/><span>运行记录</span><small>待接入</small></div>
    </nav>
    <div className="sidebar-section"><span>最近评测</span><p>运行记录尚未接入</p></div>
    <div className="sidebar-footer"><span className="avatar">S</span><div><strong>Science 评测</strong><small>内部工作空间</small></div></div>
  </>;
}

function AccountMenu() {
  const { user, logout, exiting, error } = useAuth();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const item = useRef<HTMLButtonElement>(null);
  const displayName = user.nickName || user.name || user.username || "已登录";
  const initial = displayName.trim().slice(0, 1).toUpperCase();
  const handle = user.username?.trim();
  const secondary = handle && handle !== displayName ? `@${handle}` : "内部工作空间";
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => { if (!wrap.current?.contains(event.target as Node)) setOpen(false); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    item.current?.focus();
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, [open]);
  return <div className="account" ref={wrap}>
    <button ref={trigger} type="button" className="account-trigger" aria-haspopup="menu" aria-expanded={open} aria-label={`账户：${displayName}，已登录`} onClick={() => setOpen((value) => !value)}>
      <span className="account-avatar" aria-hidden="true">{initial}<span className="account-dot" /></span>
    </button>
    {open && <div className="account-menu" role="menu" aria-label="账户">
      <div className="account-menu-head"><strong>{displayName}</strong><span>{secondary}</span></div>
      {error && <p className="account-menu-error" role="alert">{error}</p>}
      <button ref={item} type="button" role="menuitem" className="account-menu-item" onClick={logout} disabled={exiting}>{exiting ? "退出中…" : "退出登录"}</button>
    </div>}
  </div>;
}

export function Workspace({ children }: { children?: ReactNode }) {
  const drawer = useRef<HTMLDialogElement>(null);
  const closeDrawer = () => drawer.current?.close();
  return <div className="workspace">
    <aside className="sidebar desktop-sidebar" aria-label="主导航"><Navigation /></aside>
    <dialog className="mobile-drawer" ref={drawer} aria-label="主导航" onClick={(event) => { if (event.target === event.currentTarget) closeDrawer(); }}><div className="sidebar drawer-sidebar"><Navigation onClose={closeDrawer}/></div></dialog>
    <main className="workspace-main">
      <header className="workspace-header">
        <button type="button" className="icon-button mobile-menu" aria-label="打开导航" aria-haspopup="dialog" onClick={() => drawer.current?.showModal()}><Icon name="menu"/></button>
        <div>Science 评测</div>
        <AccountMenu />
      </header>
      {children ?? <section className="center-stage" aria-labelledby="welcome-title">
        <div className="stage-content"><Logo className="stage-mark" /><h1 id="welcome-title">今天想评测什么？</h1><p className="stage-subtitle">输入问题，开始一次科学服务评测。</p>
          <div className="composer" aria-label="评测输入区"><textarea disabled placeholder="输入你想评测的问题" aria-label="评测问题"/><div className="composer-bottom"><span>＋ <span>选择题目</span></span><button disabled aria-label="发起评测"><Icon name="arrow"/></button></div></div>
          <div className="suggestions"><span>1110 问答</span><span>Markdown 机检</span><span>双模型评分</span></div>
          <p className="availability">评测功能正在接入，当前页面仅供预览。</p>
        </div>
      </section>}
      <footer className="workspace-footnote">模型评分仅供参考，不代表科学真实性已验证。</footer>
    </main>
  </div>;
}
