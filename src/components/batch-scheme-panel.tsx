"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { createRequestKey } from "@/lib/request-key";
import styles from "./batch-scheme-panel.module.css";

type Counts = { aviation: number; synthesis: number };
type Config = { pools: Counts; services: Record<string, Counts>; compareSynthesisAlpha: boolean };
type Scheme = { id: string; name: string; version: number; isNightly: boolean; config: Config };
type Catalog = { userId: string; storageReady: boolean; canManage: boolean; canRun: boolean; defaultConfig: Config; items: Scheme[] };
type Pending = { key: string; config: Config; schemeId: string | null; schemeVersion: number | null };
const BASE = "/api/evaluation/unified/batch-schemes";
const PENDING = "evaluation-manual-batch-pending";
const SERVICES: [string, string][] = [["mission-material", "Mission 主服务"], ["literature", "文献检索"], ["literature-aircraft", "航空文献"], ["alloy", "合金材料"], ["synthesis", "合成制备"], ["new-material", "新材料"], ["alpha-rsi", "ALPHA 1110"]];

async function api(path: string, body?: unknown, key?: string) {
  const response = await fetch(path, { cache: "no-store", ...(body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key || createRequestKey() }, body: JSON.stringify(body) }) });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(typeof value.error === "string" ? value.error : value.error?.message || "请求失败"), { status: response.status });
  return value;
}

export function BatchSchemePanel({ onStarted }: { onStarted: () => void }) {
  const router = useRouter();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [nightly, setNightly] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    let alive = true;
    api(BASE).then((value: Catalog) => { if (alive) {
      setCatalog(value);
      const current = value.items.find(item => item.isNightly);
      setConfig(structuredClone(current?.config || value.defaultConfig));
      if (current) { setSelected(current.id); setName(current.name); setNightly(true); }
      try { const saved = sessionStorage.getItem(`${PENDING}:${value.userId}`); if (saved) setPending(JSON.parse(saved) as Pending); } catch { /* 存储不可用时不读取 */ }
    } }).catch(err => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, []);

  function select(id: string) {
    setSelected(id); setError(""); setMessage("");
    const item = catalog?.items.find(value => value.id === id);
    if (!item) { setName(""); setNightly(false); setConfig(structuredClone(catalog!.defaultConfig)); return; }
    setName(item.name); setNightly(item.isNightly); setConfig(structuredClone(item.config));
  }
  function setPool(key: keyof Counts, value: number) { setConfig(current => current && ({ ...current, pools: { ...current.pools, [key]: value } })); }
  function setCount(service: string, key: keyof Counts, value: number) {
    setConfig(current => {
      if (!current) return current;
      const services = { ...current.services, [service]: { ...current.services[service], [key]: value } };
      if (current.compareSynthesisAlpha && service === "synthesis") services["alpha-rsi"] = { ...services.synthesis };
      return { ...current, services };
    });
  }
  function setPair(checked: boolean) { setConfig(current => current && ({ ...current, compareSynthesisAlpha: checked, services: checked ? { ...current.services, "alpha-rsi": { ...current.services.synthesis } } : current.services })); }
  async function save() {
    if (!config || !catalog) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const previous = catalog.items.find(item => item.id === selected);
      const result = await api(BASE, { ...(previous ? { id: previous.id } : {}), name, version: previous?.version || 0, isNightly: nightly, config });
      const updated = await api(BASE) as Catalog;
      setCatalog(updated); setSelected(result.item.id); setMessage(nightly ? "方案已保存为夜间方案，从下一个新批次生效。" : "方案已保存。");
    } catch (err) { setError(err instanceof Error ? err.message : "保存失败"); } finally { setBusy(false); }
  }
  async function run() {
    if (!config || !catalog?.canRun) return;
    const item = catalog.items.find(value => value.id === selected);
    const request = pending || { key: createRequestKey(), config: structuredClone(config), schemeId: item?.id || null, schemeVersion: item?.version ?? null };
    const pendingKey = `${PENDING}:${catalog.userId}`;
    try { sessionStorage.setItem(pendingKey, JSON.stringify(request)); } catch { setError("浏览器无法保存发起记录，请允许会话存储后重试。"); return; }
    setPending(request); setBusy(true); setError(""); setMessage("");
    try {
      const result = await api(`${BASE}/run`, { config: request.config, schemeId: request.schemeId, schemeVersion: request.schemeVersion }, request.key);
      if (typeof result.batchId !== "string" || !result.batchId) throw new Error("发起结果不完整，请使用原请求重试。");
      sessionStorage.removeItem(pendingKey); setPending(null); onStarted(); router.push(`/batches/${encodeURIComponent(result.batchId)}`);
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status && status >= 400 && status < 500) { sessionStorage.removeItem(pendingKey); setPending(null); }
      setError(err instanceof Error ? err.message : "发起状态未知，请使用原请求重试。");
    } finally { setBusy(false); }
  }
  const total = config ? Object.values(config.services).reduce((sum, item) => sum + item.aviation + item.synthesis, 0) : 0;

  return <section className={styles.panel} aria-labelledby="batch-scheme-title">
    <div className={styles.heading}><div><h2 id="batch-scheme-title">测评方案</h2><p>配置题池和各服务的用题数量；手动发起只影响本次批次。</p></div></div>
    {error && <p role="alert" className={styles.error}>{error}</p>}{message && <p role="status">{message}</p>}
    {!catalog ? !error && <p>正在读取方案…</p> : !catalog.storageReady ? <p>测评方案存储尚未迁移，请先完成部署准备。</p> : config && <>
      <div className={styles.controls}>
        <label>选择方案<select value={selected} onChange={event => select(event.target.value)} disabled={busy}><option value="">默认方案 / 新方案</option>{catalog.items.map(item => <option key={item.id} value={item.id}>{item.name}{item.isNightly ? "（夜间）" : ""}</option>)}</select></label>
        <label>航空材料题池<input type="number" min={0} max={100} value={config.pools.aviation} onChange={event => setPool("aviation", Number(event.target.value))} /></label>
        <label>新材料合成题池<input type="number" min={0} max={100} value={config.pools.synthesis} onChange={event => setPool("synthesis", Number(event.target.value))} /></label>
      </div>
      <div className={styles.tableWrap}><table><caption>各服务使用题量</caption><thead><tr><th>服务</th><th>航空材料题</th><th>新材料合成题</th><th>运行次数</th></tr></thead><tbody>{SERVICES.map(([key, label]) => <tr key={key}><th scope="row">{label}</th>{(["aviation", "synthesis"] as const).map(pool => <td key={pool}><input aria-label={`${label} ${pool === "aviation" ? "航空材料" : "合成"}题数`} type="number" min={0} max={100} disabled={key === "synthesis" && pool === "aviation" || key === "alpha-rsi" && config.compareSynthesisAlpha} value={config.services[key][pool]} onChange={event => setCount(key, pool, Number(event.target.value))} /></td>)}<td>{config.services[key].aviation + config.services[key].synthesis}</td></tr>)}</tbody></table></div>
      <label className={styles.check}><input type="checkbox" checked={config.compareSynthesisAlpha} onChange={event => setPair(event.target.checked)} /> 合成制备与 1110 使用相同题目并生成对比</label>
      <p className={styles.summary}>预计生成 {config.pools.aviation + config.pools.synthesis} 道题 · {total} 次运行 · {config.compareSynthesisAlpha ? config.services.synthesis.synthesis : 0} 组同题对比（每批最多 320 次）</p>
      {catalog.canManage && <div className={styles.controls}><label>方案名称<input maxLength={80} value={name} onChange={event => setName(event.target.value)} placeholder="例如：夜间材料测评" /></label><label className={styles.check}><input type="checkbox" checked={nightly} onChange={event => setNightly(event.target.checked)} /> 设为夜间方案</label><Button disabled={busy || !name.trim()} onClick={save}>保存方案</Button></div>}
      {pending && <p className={styles.error}>上次发起结果尚未确认；重试会使用原方案和原请求，不会重新创建批次。</p>}
      <div className={styles.actions}><Button variant="primary" disabled={busy || !catalog.canRun} loading={busy} onClick={run}>{pending ? "查询或重试原批次" : "发起手动组合测评"}</Button><span>本次为个人手动批次，不计入夜间日报。</span></div>
    </>}
  </section>;
}
