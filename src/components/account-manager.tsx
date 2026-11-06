"use client";

import { useEffect, useState } from "react";
import { message } from "antd";
import { useAuth } from "@/components/auth-gate";
import { CreateAccountDialog } from "@/components/create-account-dialog";
import { AccountDeleteDialog, AccountEditDialog, type ManagedAccount } from "@/components/account-actions";
import { Button, EmptyState, Pagination } from "@/components/ui";
import styles from "./account-manager.module.css";

type AccountList = { items: ManagedAccount[]; total: number; page: number; pageSize: number };
const PAGE_SIZE = 20;

function formatDate(value: string) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function AccountManager() {
  const { user } = useAuth();
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<AccountList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<{ account: ManagedAccount; mode: "edit" | "password" } | null>(null);
  const [deleting, setDeleting] = useState<ManagedAccount | null>(null);
  const [messageApi, messageHolder] = message.useMessage({ top: 24 });

  useEffect(() => {
    const timer = setTimeout(() => { setPage(1); setSearch(input.trim()); }, 250);
    return () => clearTimeout(timer);
  }, [input]);

  useEffect(() => {
    if (!user.canManageAccounts) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true); setError("");
      const query = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), search });
      fetch(`/api/evaluation/accounts?${query}`, { cache: "no-store", signal: controller.signal }).then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error?.message || "无法读取用户列表。");
        if (!Array.isArray(data.items) || !Number.isInteger(data.total) || !Number.isInteger(data.page) || !Number.isInteger(data.pageSize)) throw new Error("用户列表返回格式异常。");
        if (!controller.signal.aborted) setResult(data);
      }).catch(error => { if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "无法读取用户列表。"); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [user.canManageAccounts, page, search, reload]);

  if (!user.canManageAccounts) return <main className={styles.page}><EmptyState state="forbidden" title="没有用户管理权限" description="请联系管理员处理。" /></main>;

  const pages = Math.max(1, Math.ceil((result?.total || 0) / PAGE_SIZE));
  return <main className={styles.page} aria-labelledby="account-page-title">
    {messageHolder}
    <div className={styles.content}>
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>账号与权限</p><h1 id="account-page-title">用户管理</h1><p className={styles.description}>查看和管理平台账号；新用户默认获得评测读写权限。</p></div>
        <Button type="button" variant="primary" onClick={() => setCreateOpen(true)}><span className={styles.plus} aria-hidden="true">＋</span>创建用户</Button>
      </header>

      <div className={styles.notice}>
        <span className={styles.noticeIcon} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3.5 19 6v5.7c0 4.4-3.1 7.2-7 8.8-3.9-1.6-7-4.4-7-8.8V6z" /><path d="M9 12l2 2 4-4" /></svg></span>
        <div><strong>评测账号权限</strong><p>新用户可发起评测、维护共享题库和评测规则；个人运行记录按用户隔离。</p></div>
      </div>

      <section className={styles.section} aria-labelledby="account-list-title">
        <div className={styles.toolbar}>
          <div><div className={styles.sectionTitle}><h2 id="account-list-title">用户列表</h2>{result && !error && <span className={styles.count}>{result.total}</span>}</div><p>查看已分配评测权限的账号。</p></div>
          <label className={styles.search}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 4 4" /></svg><span className="sr-only">搜索用户名或显示名称</span><input value={input} onChange={event => setInput(event.target.value)} maxLength={100} placeholder="搜索用户名或显示名称" /></label>
        </div>

        {loading ? <EmptyState compact state="loading" title="正在读取用户列表…" /> : error ? <EmptyState compact state="error" title="无法读取用户列表" description={error} action={<Button variant="secondary" onClick={() => setReload(value => value + 1)}>重新加载</Button>} /> : !result?.items.length ? <EmptyState compact state="empty" title={search ? "没有找到匹配的用户" : "暂无评测账号"} description={search ? "请尝试其他用户名或显示名称。" : "创建账号后，用户会显示在这里。"} action={search ? <Button variant="secondary" onClick={() => setInput("")}>清除搜索</Button> : <Button variant="secondary" onClick={() => setCreateOpen(true)}>创建用户</Button>} /> : <>
          <div className={styles.tableWrap}><table className={styles.table}>
            <thead><tr><th scope="col">用户</th><th scope="col">账号角色</th><th scope="col">默认权限</th><th scope="col">创建时间</th><th scope="col">操作</th></tr></thead>
            <tbody>{result.items.map(account => <tr key={account.id}>
              <td><div className={styles.identity}><span className={styles.avatar} aria-hidden="true">{(account.displayName || account.username).trim().slice(0, 1).toUpperCase()}</span><span className={styles.name}><strong>{account.displayName || account.username}</strong><span>@{account.username}</span></span></div></td>
              <td><span className={styles.role}>{account.username === "admin" ? "管理员" : "评测成员"}</span></td>
              <td className={styles.muted}>评测读写</td><td className={styles.muted}>{formatDate(account.createdAt)}</td>
              <td><div className={styles.actions}>{account.manageable ? <><button type="button" onClick={() => setEditing({ account, mode: "edit" })}>编辑</button><button type="button" onClick={() => setEditing({ account, mode: "password" })}>重置密码</button><button type="button" className={styles.danger} onClick={() => setDeleting(account)}>删除</button></> : <span className={styles.muted}>受保护</span>}</div></td>
            </tr>)}</tbody>
          </table></div>
          <Pagination page={page} pages={pages} total={result.total} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </>}
      </section>
    </div>
    {createOpen && <CreateAccountDialog onClose={() => setCreateOpen(false)} onCreated={username => { setCreateOpen(false); setInput(""); setSearch(""); setPage(1); setReload(value => value + 1); void messageApi.success(`用户 ${username} 已创建，请通过安全渠道分配初始密码。`); }} />}
    {editing && <AccountEditDialog account={editing.account} mode={editing.mode} onClose={() => setEditing(null)} onSaved={() => { const mode = editing.mode; setEditing(null); setReload(value => value + 1); void messageApi.success(mode === "edit" ? "用户信息已更新。" : "密码已重置，用户需重新登录。"); }} />}
    {deleting && <AccountDeleteDialog account={deleting} onClose={() => setDeleting(null)} onDeleted={() => { setDeleting(null); if (page > 1 && result?.items.length === 1) setPage(page - 1); else setReload(value => value + 1); void messageApi.success("用户已移除，历史评测记录已保留。"); }} />}
  </main>;
}
