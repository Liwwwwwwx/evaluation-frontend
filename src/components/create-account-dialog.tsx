"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { message } from "antd";
import { Button, Dialog, InlineAlert, Input } from "@/components/ui";

const subscribeNoop = () => () => {};

export function CreateAccountDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (username: string) => void }) {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const messageContainer = useRef<HTMLDivElement>(null);
  const [messageApi, messageHolder] = message.useMessage({ getContainer: () => messageContainer.current || document.body, top: 24 });
  const insecure = useSyncExternalStore(subscribeNoop, () => !window.isSecureContext, () => false);

  async function createAccount() {
    if (submitting.current) return;
    messageApi.destroy();
    if (!/^[a-z0-9_]{3,32}$/i.test(username.trim())) { void messageApi.error("用户名需为 3–32 位英文字母、数字或下划线。"); return; }
    if (password.length < 4 || password.length > 12 || !password.trim()) { void messageApi.error("初始密码需为 4–12 个字符。"); return; }
    if (password !== confirmation) { void messageApi.error("两次输入的密码不一致。"); return; }
    submitting.current = true; setBusy(true);
    try {
      const response = await fetch("/api/evaluation/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, displayName, password }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || "创建失败，请稍后重试。");
      if (!data.account?.id || typeof data.account.username !== "string") throw new Error("创建结果异常，请先刷新列表确认，避免重复创建。");
      setPassword(""); setConfirmation("");
      onCreated(data.account.username);
    } catch (error) { void messageApi.error(`${error instanceof Error ? error.message : "创建失败，请稍后重试。"} 如连接中断，请先查看账号列表确认结果。`); }
    finally { submitting.current = false; setBusy(false); }
  }

  return <Dialog open onClose={onClose} busy={busy} title="创建用户" description="设置登录信息，创建后请通过安全渠道分配初始密码。" footer={<>
    <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>取消</Button>
    <Button type="button" variant="primary" loading={busy} onClick={() => void createAccount()}>创建用户</Button>
  </>}>
    <div ref={messageContainer}>{messageHolder}</div>
    <div className="import-fields">
      <p className="import-intro">新用户可执行评测、维护共享题库和评测规则；个人运行记录按用户隔离。</p>
      <p className="import-intro">管理员可在用户管理页面重置普通用户密码。</p>
      {insecure && <InlineAlert tone="warning">当前使用 HTTP，密码可能在传输中被窃听。请仅在可信网络操作，并尽快启用 HTTPS。</InlineAlert>}
      <Input label="用户名" autoComplete="off" value={username} onChange={event => setUsername(event.target.value)} maxLength={32} disabled={busy} hint="3–32 位英文字母、数字或下划线；登录时不区分大小写。" />
      <Input label="显示名称（选填）" autoComplete="off" value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={50} disabled={busy} />
      <Input label="初始密码" type={showPassword ? "text" : "password"} autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} minLength={4} maxLength={12} disabled={busy} hint="4–12 个字符，创建后不会再次显示。" />
      <Input label="确认初始密码" type={showPassword ? "text" : "password"} autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} minLength={4} maxLength={12} disabled={busy} />
      <button type="button" className="account-password-visibility" disabled={busy} onClick={() => setShowPassword(value => !value)}>{showPassword ? "隐藏密码" : "显示密码"}</button>
    </div>
  </Dialog>;
}
