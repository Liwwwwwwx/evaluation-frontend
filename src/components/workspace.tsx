"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { useTheme } from "@/components/theme-provider";
import { ThemeIcon, ThemeMenuItems, themeLabel } from "@/components/theme-controls";
import { useAuth } from "@/components/auth-gate";

export function AccountMenu({ showName = false, onNavigate }: { showName?: boolean; onNavigate?: () => void }) {
  const { user, logout, exiting, error } = useAuth();
  const { preference } = useTheme();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"account" | "appearance">("account");
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const appearance = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const displayName = user.nickName || user.name || user.username || "已登录";
  const initial = displayName.trim().slice(0, 1).toUpperCase();
  const handle = user.username?.trim();
  const secondary = handle && handle !== displayName ? `@${handle}` : "内部工作空间";
  function close(restoreFocus = false) {
    setOpen(false); setView("account");
    if (restoreFocus) trigger.current?.focus();
  }
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) { setOpen(false); setView("account"); }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault(); event.stopPropagation();
      if (view === "appearance") setView("account");
      else { setOpen(false); trigger.current?.focus(); }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, [open, view]);
  useEffect(() => {
    if (!open) return;
    if (view === "appearance") menu.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"][aria-checked="true"]')?.focus();
    else appearance.current?.focus();
  }, [open, view]);
  return <div className="account" ref={wrap} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }}>
    <button ref={trigger} type="button" className="account-trigger" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} aria-label={`账户：${displayName}，已登录`} onClick={() => { setView("account"); setOpen(value => !value); }}>
      <span className="account-avatar" aria-hidden="true">{initial}<span className="account-dot" /></span>
      {showName && <span className="account-name">{displayName}</span>}
    </button>
    {open && <div id={menuId} ref={menu} className="account-menu" role="menu" aria-label={view === "account" ? "账户" : "外观设置"} onKeyDown={event => {
      if (event.key === "ArrowRight" && view === "account" && event.target === appearance.current) { event.preventDefault(); setView("appearance"); return; }
      if (event.key === "ArrowLeft" && view === "appearance") { event.preventDefault(); setView("account"); return; }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)'));
      const index = buttons.indexOf(document.activeElement as HTMLElement);
      const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      event.preventDefault(); buttons[next]?.focus();
    }}>
      {view === "account" ? <>
        <div className="account-menu-head"><span className="account-menu-avatar" aria-hidden="true">{initial}</span><div className="account-menu-identity"><strong>{displayName}</strong><span>{secondary}</span></div></div>
        <div className="account-menu-divider" role="separator" />
        <button ref={appearance} type="button" role="menuitem" aria-haspopup="menu" className="account-menu-item account-appearance" onClick={() => setView("appearance")}><ThemeIcon value={preference} /><span>外观</span><span className="account-menu-trailing"><span className="account-current-theme">{themeLabel(preference)}</span><svg className="account-chevron" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="m9 5 7 7-7 7" /></svg></span></button>
        {user.canManageAccounts && <Link href="/accounts" role="menuitem" className="account-menu-item" onClick={() => { close(); onNavigate?.(); }}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3" /><path d="M3 19v-1a6 6 0 0 1 12 0v1M18 9v6m-3-3h6" /></svg><span>用户管理</span></Link>}
        <div className="account-menu-divider" role="separator" />
        <button type="button" role="menuitem" className="account-menu-item" onClick={logout} disabled={exiting}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5H5v14h4m4-7h8m-3-3 3 3-3 3" /></svg><span>{exiting ? "退出中…" : "退出登录"}</span></button>
        {error && <p className="account-menu-error" role="alert">{error}</p>}
      </> : <>
        <button type="button" role="menuitem" className="account-menu-item account-menu-back" aria-label="返回账户菜单" onClick={() => setView("account")}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="m14 5-7 7 7 7" /></svg><span>外观</span></button>
        <div className="account-menu-divider" role="separator" />
        <ThemeMenuItems onSelect={() => close(true)} />
      </>}
    </div>}
  </div>;
}

export function WorkspaceHome() {
  return <section className="center-stage" aria-labelledby="welcome-title">
    <div className="stage-content"><Logo className="stage-mark" /><h1 id="welcome-title">今天想评测什么？</h1><p className="stage-subtitle">输入问题，开始一次科学服务评测。</p>
      <div className="composer" aria-label="评测输入区"><textarea disabled placeholder="输入你想评测的问题" aria-label="评测问题" /><div className="composer-bottom"><span>＋ <span>选择题目</span></span><button disabled aria-label="发起评测"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5m-6 6 6-6 6 6" /></svg></button></div></div>
      <div className="suggestions"><span>1110 问答</span><span>Markdown 机检</span><span>双模型评分</span></div>
      <p className="availability">评测功能正在接入，当前页面仅供预览。</p>
    </div>
  </section>;
}
