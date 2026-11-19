"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth-gate";
import { Button, EmptyState, InlineAlert, Input } from "@/components/ui";
import { createRequestKey } from "@/lib/request-key";
import pageStyles from "./account-manager.module.css";
import styles from "./service-settings.module.css";

type Service = { key: string; label: string; enabled: boolean; address: string | null; defaultAddress: string | null };
type Settings = { storageReady: boolean; version: number; items: Service[] };
const endpoint = "/api/evaluation/unified/service-settings";
const draftItems = (items: Service[]) => items.map(item => ({ ...item, address: item.address ?? item.defaultAddress }));

async function settingsRequest(init?: RequestInit): Promise<Settings> {
  const response = await fetch(endpoint, { cache: "no-store", ...init });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : data.error?.message || "服务配置请求失败");
  if (!Array.isArray(data.items) || !Number.isInteger(data.version)) throw new Error("服务配置返回格式异常");
  return data;
}

export function ServiceSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Service[]>([]);
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!user.canManageAccounts) return;
    const controller = new AbortController();
    void settingsRequest({ signal: controller.signal }).then(next => {
      if (!controller.signal.aborted) { setSettings(next); setDraft(draftItems(next.items)); }
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "无法读取服务配置"); });
    return () => controller.abort();
  }, [user.canManageAccounts, reload]);

  if (!user.canManageAccounts) return <div className={pageStyles.page}><EmptyState state="forbidden" title="没有服务配置权限" description="仅管理员可启停测评服务和修改服务地址。" /></div>;

  const changes = draft.flatMap((item, index) => {
    const saved = settings?.items[index];
    const address = item.address?.trim() || null;
    if (!saved || (item.enabled === saved.enabled && address === (saved.address ?? saved.defaultAddress))) return [];
    return [{ key: item.key, enabled: item.enabled, address: address === saved.defaultAddress ? null : address }];
  });
  function edit(key: string, next: Partial<Pick<Service, "enabled" | "address">>) {
    setNotice(""); setError("");
    setDraft(items => items.map(item => item.key === key ? { ...item, ...next } : item));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!settings?.storageReady || !changes.length || saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const next = await settingsRequest({ method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": createRequestKey() }, body: JSON.stringify({
        version: settings.version, items: changes,
      }) });
      setSettings(next); setDraft(draftItems(next.items)); setNotice("配置已保存，对新测评生效。");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "保存服务配置失败"); }
    finally { setSaving(false); }
  }

  return <div className={pageStyles.page}>
    <div className={pageStyles.content}>
      <header className={pageStyles.header}>
        <div><p className={pageStyles.eyebrow}>评测管理</p><h1>测评服务</h1><p className={pageStyles.description}>设置可发起测评的服务和 WebSocket 地址。保存后对新测评生效，已派发的任务和历史记录保持原样。</p></div>
      </header>
      <div className={styles.feedback}>
        {error && <InlineAlert tone="danger" action={<Button type="button" variant="secondary" size="sm" disabled={saving} onClick={() => { setError(""); setNotice(""); setDraft([]); setSettings(null); setReload(value => value + 1); }}>重新读取</Button>}>{error}</InlineAlert>}
        {notice && <p role="status">{notice}</p>}
        {settings && !settings.storageReady && <InlineAlert tone="warning">服务配置暂未开放保存。当前显示后端已配置的地址。</InlineAlert>}
      </div>
      {!settings ? (!error && <EmptyState compact state="loading" title="正在读取服务配置…" />) : <form onSubmit={save}>
        <div className={styles.rows}>
          {draft.map((item, index) => {
            const saved = settings.items[index];
            const status = saved.enabled ? "已启用" : saved.address || saved.defaultAddress ? "暂停测评" : "待配置";
            const path = item.key === "new-material" ? "/new-material/start" : "/start";
            return <div className={styles.row} key={item.key}>
              <div className={styles.service}><strong>{item.label}</strong><span>{status}</span></div>
              <Input label={`${item.label}地址`} value={item.address ?? ""} placeholder={item.defaultAddress || `ws://公网IP:端口${path}`} maxLength={512} autoComplete="off" spellCheck={false} disabled={!settings.storageReady || saving} onChange={event => edit(item.key, { address: event.target.value || null })} />
              <label className={styles.toggle}><input type="checkbox" checked={item.enabled} disabled={!settings.storageReady || saving} onChange={event => edit(item.key, { enabled: event.target.checked })} aria-label={`允许${item.label}测评`} />允许测评</label>
            </div>;
          })}
        </div>
        <div className={styles.footer}>
          <p>留空时使用后端默认地址。新地址请填写完整公网 IPv4 和接口路径。</p>
          <Button type="submit" variant="primary" disabled={!settings.storageReady || saving || !changes.length} loading={saving}>保存配置</Button>
        </div>
      </form>}
    </div>
  </div>;
}
