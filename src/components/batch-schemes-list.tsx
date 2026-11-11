"use client";

import { useEffect, useState } from "react";
import { Button, ConfirmDialog, Dialog, EmptyState, InlineAlert, Pagination } from "@/components/ui";
import { createRequestKey } from "@/lib/request-key";
import { previewSchemeCatalog } from "@/lib/batch-preview";
import { formatDateTime } from "@/components/batch-ui";
import styles from "./batches.module.css";

type Counts = { aviation: number; synthesis: number };
type SchemeConfig = { pools: Counts; services: Record<string, Counts>; compareAlloyAlpha?: boolean; compareSynthesisAlpha?: boolean; concurrency?: Record<string, number> };
type Scheme = { id: string; name: string; version: number; createdBy: string | null; isNightly: boolean; updatedAt: string; config: SchemeConfig };
type Catalog = { items: Scheme[]; userId: string; canManage: boolean; canSetNightly: boolean; canRun: boolean; storageReady: boolean; nightly: { name: string; version: number } | null; nightlyEnabled: boolean | null; defaultConfig?: SchemeConfig; concurrencyCaps?: Record<string, number> | null };
const serviceNames: Record<string, string> = { "mission-material": "Mission 主服务", literature: "文献检索", "literature-aircraft": "航空文献", alloy: "合金材料", synthesis: "合成制备", "new-material": "新材料", "alpha-rsi": "ALPHA 1110" };
const serviceOrder = Object.keys(serviceNames);
const PAGE_SIZE = 8;

function schemeServices(item: Scheme) {
  return Object.entries(item.config.services)
    .filter(([, count]) => count.aviation + count.synthesis > 0)
    .sort(([a], [b]) => serviceOrder.indexOf(a) - serviceOrder.indexOf(b));
}

function schemeTotal(item: Scheme) {
  return schemeServices(item).reduce((sum, [, count]) => sum + count.aviation + count.synthesis, 0);
}

export function BatchSchemesList({ refresh, onOpen, onHistory, preview = false }: { refresh: number; onOpen: (action: "create" | "edit" | "editDefault" | "launch", id?: string) => void; onHistory: (id: string, name: string) => void; preview?: boolean }) {
  const [catalog, setCatalog] = useState<Catalog | null>(preview ? previewSchemeCatalog : null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [pending, setPending] = useState<{ action: "remove" | "setNightly"; item: Scheme } | null>(null);
  const [detail, setDetail] = useState<Scheme | null>(null);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    fetch("/api/evaluation/unified/batch-schemes", { cache: "no-store", signal: controller.signal }).then(async response => {
      const value = await response.json(); if (!response.ok) throw new Error(value.error?.message || "读取配置失败");
      if (!("nightlyEnabled" in value) || !Array.isArray(value.items)) throw new Error("后端版本尚未更新，暂无法管理个人批次配置。");
      return value as Catalog;
    }).then(value => { setCatalog(value); setError(""); }).catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "读取配置失败"); });
    return () => controller.abort();
  }, [preview, refresh, retry]);
  async function confirm() {
    if (!pending) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/evaluation/unified/batch-schemes", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": createRequestKey() }, body: JSON.stringify({ action: pending.action, id: pending.item.id, version: pending.item.version }) });
      const value = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(value.error?.message || "操作失败");
      setPending(null); setRetry(value => value + 1);
    } catch (err) { setError(err instanceof Error ? err.message : "操作失败"); setPending(null); }
    finally { setBusy(false); }
  }
  const gridItems = catalog ? catalog.items.filter(item => !item.isNightly) : [];
  const schemePages = Math.max(1, Math.ceil(gridItems.length / PAGE_SIZE));
  const schemePage = Math.min(page, schemePages);
  const schemeItems = gridItems.slice((schemePage - 1) * PAGE_SIZE, schemePage * PAGE_SIZE);
  const nightlyState = catalog?.nightlyEnabled === null ? "状态待确认" : catalog?.nightlyEnabled ? "已开启" : "未开启";
  const nightlyConfig = catalog?.storageReady ? catalog?.nightly ? `${catalog.nightly.name} v${catalog.nightly.version}` : "内置默认配置" : "待确认";
  // 夜间实际使用的方案可能未显式指定：此时展示内置默认配置，避免管理员看不到夜间在跑什么。
  const nightlyScheme = catalog?.nightly ? catalog.items.find(item => item.isNightly) || null : null;
  const nightlyCard: { name: string; version: number; item: Scheme | null; builtin: boolean } | null = !catalog ? null : catalog.nightly
    ? { name: catalog.nightly.name, version: catalog.nightly.version, item: nightlyScheme, builtin: false }
    : { name: "内置默认配置", version: 0, builtin: true, item: catalog.defaultConfig ? { id: "builtin-nightly", name: "内置默认配置", version: 0, createdBy: null, isNightly: true, updatedAt: "", config: catalog.defaultConfig } : null };
  const nightlyItem = nightlyCard?.item || null;

  return <div className={styles.schemeManagement}>
    {error && <InlineAlert tone="danger" action={<Button size="sm" onClick={() => setRetry(value => value + 1)}>重试</Button>}>{error}</InlineAlert>}
    {!catalog && !error && <EmptyState state="loading" title="正在读取批次配置…" />}
    {catalog && <>
      <div className={styles.schemeStatusBar}>
        <span className={styles.schemeStatusValue} title={`北京时间 02:00–02:10 · 归属前一晚 · 当前配置：${nightlyConfig}`}>
          <span className={styles.schemeStatusDot} data-on={catalog.nightlyEnabled === true ? "true" : catalog.nightlyEnabled === false ? "false" : "unknown"} />
          夜间调度{nightlyState}{catalog.storageReady ? ` · ${nightlyConfig}` : ""}
        </span>
        {catalog.canManage && <Button className={styles.schemeCreate} variant="primary" onClick={() => onOpen("create")}>新建批次配置</Button>}
      </div>
      {!catalog.storageReady ? <InlineAlert tone="warning">批次配置管理尚未完成数据库迁移。</InlineAlert> : <>
        <div className={styles.schemeListArea}>
        {!gridItems.length && <EmptyState state="empty" title="暂无批次配置" description="创建配置后可以重复发起测评。" />}
        {(nightlyCard || schemeItems.length > 0) && <ul className={styles.schemeGrid}>
          {nightlyCard && <li className={`${styles.schemeCard} ${styles.schemeCardNightly}`} aria-label="夜间执行方案">
            <div className={styles.schemeCardHead}>
              <div className={styles.schemeTitle}>
                <strong>{nightlyCard.name}</strong>
                <span className={styles.schemeNightly}>夜间执行</span>
              </div>
              <span className={styles.schemeOwner}>{nightlyCard.builtin ? "系统内置" : nightlyItem?.createdBy === catalog.userId ? "个人" : nightlyItem?.createdBy ? "其他用户" : "未知"}</span>
            </div>
            {nightlyItem ? <>
              <span className={styles.schemeMeta}>{nightlyCard.builtin ? `内置默认 · ${schemeServices(nightlyItem).length} 个服务 · 未指定方案时使用` : `v${nightlyItem.version} · ${schemeServices(nightlyItem).length} 个服务 · 更新 ${formatDateTime(nightlyItem.updatedAt)}`}</span>
              <div className={styles.schemeStats}>
                <span className={styles.schemeStat}><b>{nightlyItem.config.pools.aviation}</b><span>航空题</span></span>
                <span className={styles.schemeStat}><b>{nightlyItem.config.pools.synthesis}</b><span>合成题</span></span>
                <span className={styles.schemeStat}><b>{schemeTotal(nightlyItem)}</b><span>运行次数</span></span>
              </div>
              <div className={styles.schemeActions}>
                <Button size="sm" variant="secondary" onClick={() => setDetail(nightlyItem)}>配置明细</Button>
                {nightlyCard.builtin && catalog.canSetNightly && <Button size="sm" variant="secondary" onClick={() => onOpen("editDefault")}>编辑</Button>}
                {!nightlyCard.builtin && <>
                  <span className={styles.schemeActionSpacer} />
                  <Button size="sm" variant="secondary" onClick={() => onHistory(nightlyItem.id, nightlyItem.name)}>执行记录</Button>
                  {nightlyItem.createdBy === catalog.userId && catalog.canRun && <Button size="sm" variant="secondary" onClick={() => onOpen("launch", nightlyItem.id)}>发起测评</Button>}
                  {nightlyItem.createdBy === catalog.userId && catalog.canManage && <details className={styles.schemeMore}>
                    <summary>更多</summary>
                    <div className={styles.schemeMoreMenu}>
                      <button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); onOpen("edit", nightlyItem.id); }}>编辑</button>
                      <button type="button" disabled title="请先由管理员切换夜间配置" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); setPending({ action: "remove", item: nightlyItem }); }}>删除</button>
                    </div>
                  </details>}
                </>}
              </div>
            </> : <span className={styles.schemeMeta}>v{nightlyCard.version} · 由管理员维护，当前账号无权查看该方案明细。</span>}
          </li>}
          {schemeItems.map(item => {
            const own = item.createdBy === catalog.userId;
            const services = schemeServices(item);
            const showMore = Boolean((own && catalog.canManage) || (catalog.canSetNightly && !item.isNightly));
            return <li key={item.id} className={styles.schemeCard}>
              <div className={styles.schemeCardHead}>
                <div className={styles.schemeTitle}>
                  <strong>{item.name}</strong>
                  {item.isNightly && <span className={styles.schemeNightly}>夜间配置</span>}
                </div>
                <span className={styles.schemeOwner}>{own ? "个人" : item.createdBy ? "其他用户" : "未知"}</span>
              </div>
              <span className={styles.schemeMeta}>v{item.version} · {services.length} 个服务 · 更新 {formatDateTime(item.updatedAt)}</span>
              <div className={styles.schemeStats}>
                <span className={styles.schemeStat}><b>{item.config.pools.aviation}</b><span>航空题</span></span>
                <span className={styles.schemeStat}><b>{item.config.pools.synthesis}</b><span>合成题</span></span>
                <span className={styles.schemeStat}><b>{schemeTotal(item)}</b><span>运行次数</span></span>
              </div>
              <div className={styles.schemeActions}>
                <Button size="sm" variant="secondary" onClick={() => setDetail(item)}>配置明细</Button>
                <span className={styles.schemeActionSpacer} />
                <Button size="sm" variant="secondary" onClick={() => onHistory(item.id, item.name)}>执行记录</Button>
                {own && catalog.canRun && <Button size="sm" variant="secondary" onClick={() => onOpen("launch", item.id)}>发起测评</Button>}
                {showMore && <details className={styles.schemeMore}>
                  <summary>更多</summary>
                  <div className={styles.schemeMoreMenu}>
                    {own && catalog.canManage && <button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); onOpen("edit", item.id); }}>编辑</button>}
                    {catalog.canSetNightly && !item.isNightly && <button type="button" onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); setPending({ action: "setNightly", item }); }}>设为夜间</button>}
                    {own && catalog.canManage && <button type="button" disabled={item.isNightly} title={item.isNightly ? "请先由管理员切换夜间配置" : undefined} onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); setPending({ action: "remove", item }); }}>删除</button>}
                  </div>
                </details>}
              </div>
            </li>;
          })}
        </ul>}
        </div>
        <Pagination page={schemePage} pages={schemePages} total={gridItems.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </>}
    </>}
    <ConfirmDialog open={!!pending} onClose={() => setPending(null)} onConfirm={() => void confirm()} busy={busy} danger={pending?.action === "remove"} title={pending?.action === "remove" ? "删除批次配置" : "切换夜间配置"} description={pending?.action === "remove" ? `删除「${pending.item.name}」后不能再用于发起，已有执行记录会保留。` : `将「${pending?.item.name || ""}」设为夜间配置，从后续新批次生效。`} confirmLabel={pending?.action === "remove" ? "删除配置" : "确认切换"} />
    <Dialog
      open={!!detail}
      onClose={() => setDetail(null)}
      title={detail?.name || "配置明细"}
      description={detail ? `${detail.version ? `v${detail.version}` : "内置默认"} · ${detail.version === 0 ? "系统内置" : detail.createdBy === catalog?.userId ? "个人配置" : detail.createdBy ? "其他用户配置" : "创建人未知"}${detail.updatedAt ? ` · 更新 ${formatDateTime(detail.updatedAt)}` : ""}` : undefined}
      className={styles.detailDialog}
      contentClassName={styles.detailSheet}
      footerSticky
      footer={<Button variant="secondary" onClick={() => setDetail(null)}>关闭</Button>}
    >
      {detail && <div className={styles.detailBody}>
        {detail.isNightly && <span className={styles.schemeNightly}>夜间配置</span>}
        <section className={styles.detailSection}>
          <h3>题池</h3>
          <div className={styles.detailPools}>
            <div className={styles.detailPool}><span>航空材料</span><b>{detail.config.pools.aviation} 题</b></div>
            <div className={styles.detailPool}><span>新材料合成</span><b>{detail.config.pools.synthesis} 题</b></div>
          </div>
        </section>
        <section className={styles.detailSection}>
          <h3>服务题量</h3>
          <table className={styles.detailTable}>
            <caption className="sr-only">各服务使用题量与并发上限</caption>
            <thead><tr><th>服务</th><th>航空</th><th>合成</th><th>并发</th><th>合计</th></tr></thead>
            <tbody>{schemeServices(detail).map(([key, count]) => <tr key={key}>
              <th scope="row">{serviceNames[key] || key}</th>
              <td>{count.aviation}</td>
              <td>{count.synthesis}</td>
              <td>{detail.config.concurrency?.[key] ?? catalog?.concurrencyCaps?.[key] ?? 5}</td>
              <td>{count.aviation + count.synthesis}</td>
            </tr>)}</tbody>
          </table>
          {!detail.config.concurrency && <p className={styles.detailHint}>并发未单独设置，按服务默认上限执行。</p>}
        </section>
        <section className={styles.detailSection}>
          <h3>运行</h3>
          <div className={styles.detailRows}>
            <div className={styles.detailRow}><span>预计运行</span><b>{schemeTotal(detail)} 次</b></div>
            <div className={styles.detailRow}><span>同题对比</span><b>{detail.config.compareAlloyAlpha || detail.config.compareSynthesisAlpha ? "开启" : "关闭"}</b></div>
          </div>
        </section>
      </div>}
    </Dialog>
  </div>;
}
