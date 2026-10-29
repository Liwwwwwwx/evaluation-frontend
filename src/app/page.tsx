import { AuthGate } from "@/components/auth-gate";
import { Logo } from "@/components/logo";
import Link from "next/link";

function Icon({ name }: { name: "plus" | "grid" | "book" | "clock" | "arrow" | "panel" }) {
  const paths = {
    plus: <path d="M12 5v14M5 12h14" />,
    grid: <><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></>,
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5z"/><path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20"/></>,
    clock: <><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></>,
    arrow: <path d="M12 19V5m-6 6 6-6 6 6" />,
    panel: <><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function Home() {
  return <AuthGate><div className="workspace">
    <aside className="sidebar" aria-label="主导航">
      <div className="sidebar-header"><Link className="brand" href="/" aria-label="Science 评测首页"><Logo /><span>Science <b>评测</b></span></Link><Icon name="panel" /></div>
      <div className="navigation">
        <div className="nav-item active"><Icon name="plus"/><span>新建评测</span></div>
        <div className="nav-item"><Icon name="grid"/><span>评测工作台</span></div>
        <div className="nav-item muted"><Icon name="book"/><span>题库</span><small>待接入</small></div>
        <div className="nav-item muted"><Icon name="clock"/><span>运行记录</span><small>待接入</small></div>
      </div>
      <div className="sidebar-section"><span>最近评测</span><p>暂无评测记录</p></div>
      <div className="sidebar-footer"><span className="avatar">S</span><div><strong>Science 评测</strong><small>内部工作空间</small></div></div>
    </aside>
    <main className="workspace-main">
      <header className="workspace-header"><div>Science 评测 <span>⌄</span></div></header>
      <section className="center-stage" aria-labelledby="welcome-title">
        <div className="stage-content"><Logo className="stage-mark" /><h1 id="welcome-title">今天想评测什么？</h1><p className="stage-subtitle">输入问题，开始一次科学服务评测。</p>
          <div className="composer" aria-label="评测输入区"><textarea disabled placeholder="输入你想评测的问题" aria-label="评测问题"/><div className="composer-bottom"><span>＋ <span>选择题目</span></span><button disabled aria-label="发起评测"><Icon name="arrow"/></button></div></div>
          <div className="suggestions"><span>1110 问答</span><span>Markdown 机检</span><span>双模型评分</span></div>
          <p className="availability">评测功能正在接入，当前页面仅供预览。</p>
        </div>
      </section>
      <footer className="workspace-footnote">模型评分仅供参考，不代表科学真实性已验证。</footer>
    </main>
  </div></AuthGate>;
}
