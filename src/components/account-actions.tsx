"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { message } from "antd";
import { Button, ConfirmDialog, Dialog, InlineAlert, Input } from "@/components/ui";

export type ManagedAccount = { id: string; username: string; displayName: string | null; createdAt: string; manageable: boolean };
const subscribeNoop = () => () => {};

export function AccountEditDialog({ account, mode, onClose, onSaved }: { account: ManagedAccount; mode: "edit" | "password"; onClose: () => void; onSaved: () => void }) {
  const [displayName, setDisplayName] = useState(account.displayName || account.username);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const container = useRef<HTMLDivElement>(null);
  const [messageApi, holder] = message.useMessage({ getContainer: () => container.current || document.body, top: 24 });
  const insecure = useSyncExternalStore(subscribeNoop, () => !window.isSecureContext, () => false);

  async function save() {
    if (submitting.current) return;
    messageApi.destroy();
    if (mode === "edit" && (!displayName.trim() || displayName.trim().length > 50)) { void messageApi.error("显示名称需为 1–50 个字符。"); return; }
    if (mode === "password" && (password.length < 4 || password.length > 12 || !password.trim())) { void messageApi.error("密码需为 4–12 个字符。"); return; }
    if (mode === "password" && password !== confirmation) { void messageApi.error("两次输入的密码不一致。"); return; }
    submitting.current = true; setBusy(true);
    try {
      const path = `/api/evaluation/accounts/${encodeURIComponent(account.id)}${mode === "password" ? "/reset-password" : ""}`;
      const response = await fetch(path, { method: mode === "password" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mode === "password" ? { password } : { displayName: displayName.trim() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "保存失败，请稍后重试。");
      if ((mode === "password" && data.ok !== true) || (mode === "edit" && data.account?.id !== account.id)) throw new Error("返回结果异常，请刷新列表确认。");
      setPassword(""); setConfirmation(""); onSaved();
    } catch (error) { void messageApi.error(`${error instanceof Error ? error.message : "保存失败。"} 如连接中断，请核实结果后重试。`); }
    finally { submitting.current = false; setBusy(false); }
  }

  return <Dialog open onClose={onClose} busy={busy} title={mode === "edit" ? "编辑用户" : "重置密码"} description={mode === "edit" ? "修改用户显示名称，登录用户名保持不变。" : `为 ${account.username} 设置新密码，原有登录会话将失效。`} footer={<>
    <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>取消</Button>
    <Button type="button" variant="primary" loading={busy} onClick={() => void save()}>{mode === "edit" ? "保存修改" : "确认重置"}</Button>
  </>}>
    <div ref={container}>{holder}</div>
    <div className="import-fields">
      {mode === "edit" ? <>
        <Input label="用户名" value={account.username} readOnly />
        <Input label="显示名称" value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={50} disabled={busy} />
      </> : <>
        <p className="import-intro">密码重置后，请通过安全渠道告知用户。正在运行的评测可能继续执行。</p>
        {insecure && <InlineAlert tone="warning">当前使用 HTTP，密码可能在传输中被窃听。请仅在可信网络操作，并尽快启用 HTTPS。</InlineAlert>}
        <Input label="新密码" type={showPassword ? "text" : "password"} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} minLength={4} maxLength={12} disabled={busy} hint="4–12 个字符，保存后不会再次显示。" />
        <Input label="确认新密码" type={showPassword ? "text" : "password"} autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} minLength={4} maxLength={12} disabled={busy} />
        <button type="button" className="account-password-visibility" disabled={busy} onClick={() => setShowPassword(value => !value)}>{showPassword ? "隐藏密码" : "显示密码"}</button>
      </>}
    </div>
  </Dialog>;
}

export function AccountDeleteDialog({ account, onClose, onDeleted }: { account: ManagedAccount; onClose: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const container = useRef<HTMLDivElement>(null);
  const [messageApi, holder] = message.useMessage({ getContainer: () => container.current || document.body, top: 24 });
  async function remove() {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); messageApi.destroy();
    try {
      const response = await fetch(`/api/evaluation/accounts/${encodeURIComponent(account.id)}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "删除失败，请稍后重试。");
      if (data.ok !== true) throw new Error("返回结果异常，请刷新列表确认。");
      onDeleted();
    } catch (error) { void messageApi.error(`${error instanceof Error ? error.message : "删除失败。"} 如连接中断，请刷新列表核实结果。`); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <ConfirmDialog open onClose={onClose} onConfirm={() => void remove()} title={`删除用户 ${account.username}？`} description="该用户将失去评测平台访问权限，已有登录会话失效。历史评测记录会保留，正在运行的评测可能继续执行；同名账号暂不可重新创建。" hint="此操作会移除访问权限" danger busy={busy} confirmLabel={busy ? "删除中…" : "删除用户"}>
    <div ref={container}>{holder}</div>
  </ConfirmDialog>;
}
