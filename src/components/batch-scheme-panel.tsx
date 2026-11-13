"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Dialog, InlineAlert, Input, ToastStack, useToasts } from "@/components/ui";
import { createRequestKey } from "@/lib/request-key";
import styles from "./batch-scheme-panel.module.css";

type NumberInput = number | "";
type Config = { services: Record<string, NumberInput>; compareAlloyAlpha: boolean; compareSynthesisAlpha?: boolean; concurrency?: Record<string, NumberInput> };
type Scheme = { id: string; name: string; version: number; isNightly: boolean; createdBy?: string | null; updatedBy?: string; updatedAt?: string; config: Config };
type Catalog = { userId: string; storageReady: boolean; canManage: boolean; canSetNightly: boolean; canRun: boolean; defaultConfig: Config; concurrencyCaps?: Record<string, number> | null; items: Scheme[] };
type Pending = { key: string; config: Config; schemeId: string | null; schemeVersion: number | null };
type Mode = "launch" | "edit";
const BASE = "/api/evaluation/unified/batch-schemes";
const PENDING = "evaluation-manual-batch-pending";
const SERVICES: [string, string][] = [["mission-material", "Mission 主服务"], ["literature", "文献检索"], ["literature-aircraft", "航空文献"], ["alpha-rsi", "材料配比 RSI"], ["alpha-combined-rsi", "配比+制备 RSI"], ["new-material", "新材料"]];
const DEFAULT_CAPS: Record<string, number> = { "mission-material": 5, literature: 5, "literature-aircraft": 1, "new-material": 5, "alpha-rsi": 5, "alpha-combined-rsi": 5 };

function capsOf(catalog: Catalog | null) { return { ...DEFAULT_CAPS, ...(catalog?.concurrencyCaps || {}) }; }
function numberInput(value: string): NumberInput { return value === "" ? "" : Number(value); }
function countOf(value: NumberInput | undefined) { return Number(value) || 0; }
function totalOf(config: Config) { return SERVICES.reduce((sum, [key]) => sum + countOf(config.services[key]), 0); }
function normalizeConfig(input: Config | Record<string, unknown>): Config {
  const raw = input as { services?: Record<string, unknown>; compareAlloyAlpha?: unknown; compareSynthesisAlpha?: unknown; concurrency?: Record<string, NumberInput> };
  const services: Record<string, NumberInput> = {};
  for (const [key] of SERVICES) {
    const value = raw.services?.[key];
    services[key] = key === "new-material" ? 0 : value && typeof value === "object"
      ? countOf((value as { aviation?: NumberInput }).aviation) + countOf((value as { synthesis?: NumberInput }).synthesis)
      : typeof value === "number" || value === "" ? value : 0;
  }
  return { services, compareAlloyAlpha: false, compareSynthesisAlpha: false, concurrency: raw.concurrency };
}
function withConcurrency(config: Config, caps: Record<string, number>): Config {
  return { ...config, concurrency: Object.fromEntries(SERVICES.map(([key]) => [key, config.concurrency?.[key] ?? caps[key]])) };
}

async function api(path: string, body?: unknown, key?: string) {
  const response = await fetch(path, { cache: "no-store", ...(body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key || createRequestKey() }, body: JSON.stringify(body) }) });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(typeof value.error === "string" ? value.error : value.error?.message || "请求失败"), { status: response.status });
  return value;
}

function normalized(config: Config): Config { return normalizeConfig(config); }

function updatedLabel(value: string | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date).replace(/\//g, "-");
}

export function BatchSchemePanel({ open, onClose, onStarted, onSaved, initialAction = "launch", initialSchemeId = "" }: { open: boolean; onClose: () => void; onStarted: () => void; onSaved?: () => void; initialAction?: "create" | "edit" | "editDefault" | "launch"; initialSchemeId?: string }) {
  const router = useRouter();
  const { toasts, push: pushToast, dismiss: dismissToast } = useToasts();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [selected, setSelected] = useState("");
  const [mode, setMode] = useState<Mode>("launch");
  const [editTarget, setEditTarget] = useState<Scheme | null>(null);
  const [name, setName] = useState("");
  const [nightly, setNightly] = useState(false);
  const [nightlyCreate, setNightlyCreate] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setCatalog(null); setError(""); setMode("launch"); setEditTarget(null); setNightlyCreate(initialAction === "editDefault");
    api(BASE).then((value: Catalog) => {
      if (!alive) return;
      if (!("nightlyEnabled" in value) || !Array.isArray(value.items)) throw new Error("后端版本尚未更新，暂无法管理个人批次配置。");
      setCatalog(value);
      const editDefault = initialAction === "editDefault";
      const current = initialSchemeId ? value.items.find(item => item.id === initialSchemeId && item.createdBy === value.userId) || null : value.items.find(item => item.createdBy === value.userId) || null;
      if (initialSchemeId && !current) throw new Error("配置不存在或无权操作，请刷新列表。");
      setSelected(current?.id || "");
      const base = normalized(editDefault || initialAction === "create" ? value.defaultConfig : current?.config || value.defaultConfig);
      setConfig(structuredClone(initialAction === "launch" ? base : withConcurrency(base, capsOf(value))));
      setName(editDefault ? "内置默认配置" : initialAction === "create" ? "" : current?.name || ""); setNightly(Boolean(!editDefault && current?.isNightly));
      if (editDefault) { setMode("edit"); setEditTarget(null); }
      if (initialAction === "create") { setMode("edit"); setEditTarget(null); }
      if (initialAction === "edit" && current) { setMode("edit"); setEditTarget(current); }
      try { const saved = sessionStorage.getItem(`${PENDING}:${value.userId}`); setPending(saved ? JSON.parse(saved) as Pending : null); } catch { setPending(null); }
    }).catch(err => { if (alive) setError(err.message); });
    return () => { alive = false; };
  }, [open, initialAction, initialSchemeId]);

  function selectScheme(id: string) {
    setSelected(id); setError("");
    const item = catalog?.items.find(value => value.id === id);
    setConfig(structuredClone(normalized(item?.config || catalog!.defaultConfig)));
  }

  function startNew() {
    if (!catalog) return;
    setEditTarget(null); setName(""); setNightly(false); setNightlyCreate(false);
    setConfig(structuredClone(withConcurrency(normalized(catalog.defaultConfig), capsOf(catalog))));
    setMode("edit"); setError("");
  }

  function startEdit() {
    if (!catalog) return;
    const item = selected ? catalog.items.find(value => value.id === selected) : null;
    if (!item) { startNew(); return; }
    const editable = item.createdBy === catalog.userId;
    setEditTarget(editable ? item : null);
    setName(editable ? item.name : `${item.name}（副本）`);
    setNightly(editable ? item.isNightly : false); setNightlyCreate(false);
    setConfig(structuredClone(withConcurrency(normalized(item.config), capsOf(catalog))));
    setMode("edit"); setError("");
  }

  function backToLaunch() {
    if (!catalog || !config) { setMode("launch"); return; }
    const item = selected ? catalog.items.find(value => value.id === selected) : null;
    setConfig(structuredClone(normalized(item?.config || catalog.defaultConfig)));
    setName(item?.name || ""); setNightly(Boolean(item?.isNightly)); setNightlyCreate(false);
    setEditTarget(null); setMode("launch"); setError("");
  }

  function setCount(service: string, value: NumberInput) {
    setConfig(current => {
      if (!current) return current;
      const services = { ...current.services, [service]: value };
      return { ...current, services };
    });
  }
  function setConcurrency(service: string, value: NumberInput) {
    const cap = capsOf(catalog)[service] ?? 5;
    const next = value === "" || value === 0 ? value : Math.max(1, Math.min(cap, Math.round(Number.isFinite(value) ? value : 1)));
    setConfig(current => current && ({ ...current, concurrency: { ...current.concurrency, [service]: next } }));
  }

  async function save() {
    if (!config || !catalog || incompleteFields) return;
    setBusy(true); setError("");
    try {
      const result = await api(BASE, {
        ...(editTarget ? { id: editTarget.id, version: editTarget.version } : {}),
        name,
        version: editTarget?.version || 0,
        isNightly: nightlyCreate,
        config,
      });
      const updated = await api(BASE) as Catalog;
      setCatalog(updated); setSelected(result.item.id); setConfig(structuredClone(normalized(result.item.config)));
      setName(result.item.name); setNightly(result.item.isNightly); setNightlyCreate(false); setEditTarget(null); setMode("launch");
      pushToast("success", result.item.isNightly ? "配置已保存为夜间配置" : "配置已保存");
      onSaved?.();
      onClose();
    } catch (err) { pushToast("error", err instanceof Error ? err.message : "保存失败"); } finally { setBusy(false); }
  }

  async function run() {
    if (!config || !catalog?.canRun || incompleteFields) return;
    const item = selected ? catalog.items.find(value => value.id === selected) : null;
    const request = pending || { key: createRequestKey(), config: structuredClone(config), schemeId: item?.id || null, schemeVersion: item?.version ?? null };
    const pendingKey = `${PENDING}:${catalog.userId}`;
    try { sessionStorage.setItem(pendingKey, JSON.stringify(request)); } catch { pushToast("error", "浏览器无法保存发起记录，请允许会话存储后重试。"); return; }
    setPending(request); setBusy(true); setError("");
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

  const total = config ? totalOf(config) : 0;
  const generated = total;
  const overLimit = total > 320;
  const incompleteServices = config ? SERVICES.some(([key]) => config.services[key] === "") : false;
  const incompleteConcurrency = config ? Object.values(config.concurrency || {}).some(value => value === "" || value === 0) : false;
  const incompleteFields = incompleteServices || incompleteConcurrency;
  const caps = capsOf(catalog);
  const selectedScheme = catalog?.items.find(item => item.id === selected) || null;
  const canEditSelected = !selectedScheme || selectedScheme.createdBy === catalog?.userId;
  const summary = config && !incompleteServices ? `预计生成 ${generated} 道题 · ${total} 次运行（每批最多 320 次）` : "";
  const launch = mode === "launch";

  return <Dialog
    open={open}
    onClose={onClose}
    title={launch ? "发起批次" : nightlyCreate ? "修改夜间默认配置" : editTarget ? "编辑批次配置" : "新建批次配置"}
    description={launch ? "选择一个已保存的批次配置，确认题量和分配后发起；新建或修改请进入配置编辑。" : nightlyCreate ? "修改内置默认配置并保存为夜间方案，从后续新批次生效；不会自动发起批次。" : "配置各服务题量；保存后回到列表，不会自动发起批次。"}
    className={styles.dialog}
    contentClassName={styles.sheetContent}
    busy={busy}
    footerSticky
    footerStart={<span className={styles.footerNote}>{nightlyCreate ? "保存后设为夜间方案，后续夜间批次生效" : "手动批次不计入夜间日报"}</span>}
    footer={launch ? <>
      {catalog?.canManage && <Button variant="secondary" disabled={busy} onClick={startNew}>新建配置</Button>}
      {selectedScheme && catalog?.canManage && <Button variant="secondary" disabled={busy} onClick={startEdit}>{canEditSelected ? "编辑配置" : "另存为新配置"}</Button>}
      <Button variant="primary" disabled={busy || !catalog?.canRun || overLimit || incompleteFields || !config || (!total && !pending)} loading={busy} onClick={run}>{pending ? "查询或重试原批次" : "发起批次"}</Button>
    </> : <>
      <Button variant="secondary" disabled={busy} onClick={backToLaunch}>返回发起</Button>
      <Button variant="primary" disabled={busy || !name.trim() || overLimit || incompleteFields || !total} loading={busy} onClick={save}>保存配置</Button>
    </>}
  >
    <div className={styles.sheetBody}>
    {error && <InlineAlert tone="danger">{error}</InlineAlert>}
    {!catalog ? (!error && <p className={styles.loading}>正在读取配置…</p>) : !catalog.storageReady ? <InlineAlert tone="danger">批次配置存储尚未迁移，请先完成部署准备。</InlineAlert> : config && (launch ? <>
      <div className={styles.schemeList}>
        <button type="button" className={styles.schemeItem} data-selected={!selected} onClick={() => selectScheme("")}>
          <span className={styles.radio} aria-hidden="true" />
          <span className={styles.schemeInfo}><strong>默认配置</strong><span>内置题池与分配</span></span>
          <span className={styles.schemeTotal}>{totalOf(catalog.defaultConfig)} 次</span>
        </button>
        {catalog.items.filter(item => item.createdBy === catalog.userId).map(item => <button type="button" key={item.id} className={styles.schemeItem} data-selected={selected === item.id} onClick={() => selectScheme(item.id)}>
          <span className={styles.radio} aria-hidden="true" />
          <span className={styles.schemeInfo}><strong>{item.name}</strong><span>{item.isNightly ? "夜间配置" : "我的配置"}{item.updatedAt ? ` · ${updatedLabel(item.updatedAt)}` : ""}</span></span>
          <span className={styles.schemeTotal}>{totalOf(item.config)} 次</span>
        </button>)}
      </div>
      <div className={styles.launchSummary}>
        <span>服务：{SERVICES.filter(([key]) => countOf(config.services[key]) > 0).length} 个 · 运行 {total} 次</span>
        {config.concurrency && <span>并发：{SERVICES.filter(([key]) => countOf(config.services[key]) > 0).map(([key, label]) => `${label} ${config.concurrency?.[key] ?? caps[key]}`).join(" · ")}</span>}
      </div>
      {selectedScheme && countOf(config.services["alpha-combined-rsi"]) === 0 && <InlineAlert tone="warning">该配置未为配比+制备 RSI 设置题量；需要测评时请编辑配置。</InlineAlert>}
      {overLimit && <InlineAlert tone="danger">总运行次数 {total} 超过每批 320 次上限，请减少题量。</InlineAlert>}
      {pending && <InlineAlert tone="warning">上次发起结果尚未确认；重试会使用原配置和原请求，不会重新创建批次。</InlineAlert>}
    </> : <>
      <div className={styles.editorHead}>
        <Input label="配置名称" value={name} maxLength={80} placeholder="例如：夜间材料测评" onChange={(event) => setName(event.target.value)} disabled={busy} />
        {nightly && <span>此配置为夜间配置，保存后对后续夜间执行生效。</span>}
      </div>
      <p className={styles.saveHint}>{editTarget ? `正在编辑「${editTarget.name}」，保存后更新该配置。` : nightlyCreate ? "内置默认配置保留为兜底；保存后生成夜间方案，后续夜间批次使用该方案。" : "保存后会创建一个新配置，不会自动发起批次。"}</p>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h3>服务题量</h3>
        </div>
        <div className={styles.tableWrap}>
          <table>
            <caption className="sr-only">各服务使用题量与并发上限</caption>
            <thead><tr><th>服务</th><th>题数</th><th>并发</th></tr></thead>
            <tbody>{SERVICES.map(([key, label]) => <tr key={key}>
              <th scope="row">{label}{key === "new-material" && "（暂停测评）"}</th>
              <td><input className={styles.numInput} aria-label={`${label} 题数`} aria-invalid={config.services[key] === ""} type="number" min={0} max={100} disabled={key === "new-material"} value={String(config.services[key])} onChange={(event) => setCount(key, numberInput(event.target.value))} /></td>
              <td><input className={styles.numInput} aria-label={`${label} 并发上限`} aria-invalid={config.concurrency?.[key] === "" || config.concurrency?.[key] === 0} title={`该批次内 ${label} 同时执行的运行数上限（1–${caps[key]}）`} type="number" min={1} max={caps[key]} disabled={key === "new-material"} value={String(config.concurrency?.[key] ?? caps[key])} onChange={(event) => setConcurrency(key, numberInput(event.target.value))} /></td>
            </tr>)}</tbody>
          </table>
        </div>
        <p className={styles.pairHint}>每个服务按自身题型独立出题。</p>
        <p className={styles.pairHint}>并发为该批次内每个服务同时执行的运行数上限，保存后对后续新发起的批次生效。</p>
        {incompleteServices && <InlineAlert tone="danger">请填写所有服务的题量。</InlineAlert>}
        {incompleteConcurrency && <InlineAlert tone="danger">请填写 1 至服务上限范围内的并发值。</InlineAlert>}
      </section>
      <p className={styles.editorSummary}>{summary}</p>
      {selectedScheme && countOf(config.services["alpha-combined-rsi"]) === 0 && <InlineAlert tone="warning">该配置未为配比+制备 RSI 设置题量；需要测评时请编辑配置。</InlineAlert>}
      {overLimit && <InlineAlert tone="danger">总运行次数 {total} 超过每批 320 次上限，请减少题量。</InlineAlert>}
    </>)}
    </div>
    <ToastStack toasts={toasts} onDismiss={dismissToast} />
  </Dialog>;
}
