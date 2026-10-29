"use client";

import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/logo";
import { useAuth } from "@/components/auth-gate";

export function AccountMenu({ showName = false }: { showName?: boolean }) {
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
      {showName && <span className="account-name">{displayName}</span>}
    </button>
    {open && <div className="account-menu" role="menu" aria-label="账户">
      <div className="account-menu-head"><strong>{displayName}</strong><span>{secondary}</span></div>
      {error && <p className="account-menu-error" role="alert">{error}</p>}
      <button ref={item} type="button" role="menuitem" className="account-menu-item" onClick={logout} disabled={exiting}>{exiting ? "退出中…" : "退出登录"}</button>
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
