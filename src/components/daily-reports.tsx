"use client";
import { createRequestKey } from "@/lib/request-key";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnswerMarkdown } from "@/components/answer-markdown";
import { BackLink, Button, EmptyState, InlineAlert, Pagination } from "@/components/ui";
import styles from "./daily-reports.module.css";

type Item = { date: string; status: string; analysisState: string; total: number; completed: number; unfinished: number; updatedAt: string };
type Catalog = { items: Item[]; total: number; enabled: boolean; preferred: string; configured: boolean; storageReady: boolean; canGenerate: boolean };
type Report = { date: string; status: string; analysisState: string; markdown: string | null; error: string | null; model: string | null; provider: string | null; canGenerate: boolean; notificationState: string | null; share?: { url: string; expiresAt: string } | null; snapshot: { inProgress: boolean } };
const states: Record<string, string> = { generating: "正在生成", ready: "已生成", failed: "生成中断" };
const analysisStates: Record<string, string> = { ready: "含智能总结", pending: "等待智能总结", unavailable: "仅统计 · 暂无智能总结", failed: "仅统计 · 智能总结失败" };
const base = "/api/evaluation/unified/daily-reports";
async function readResponse(response: Response) {
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof value.error === "string" ? value.error : value.error?.message || "每日报告暂不可用，请稍后重试。");
  return value;
}
async function generate(date: string) {
  return readResponse(await fetch(`${base}/${date}/generate`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": createRequestKey() }, body: "{}" }));
}

export function DailyReportList({ embedded = false }: { embedded?: boolean } = {}) {
  const router = useRouter();
  const [data, setData] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [date, setDate] = useState("");
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${base}?page=${page}`, { cache: "no-store", signal: controller.signal }).then(readResponse)
      .then(value => { if (!Array.isArray(value.items)) throw new Error("报告列表格式异常。"); setData(value); setError(""); })
      .catch(err => { if (!controller.signal.aborted) { setData(null); setError(err.message); } });
    return () => controller.abort();
  }, [page, retry]);
  async function submit() {
    if (!date || submitting) return;
    setSubmitting(true); setError("");
    try { await generate(date); router.push(`/daily-reports/${date}?generating=1`); }
    catch (err) { setError(err instanceof Error ? err.message : "无法生成报告。"); }
    finally { setSubmitting(false); }
  }
  const content = <>
    {error && <InlineAlert tone="danger" action={<Button type="button" variant="secondary" onClick={() => setRetry(v => v + 1)}>重试</Button>}>{error}</InlineAlert>}
    {!data && !error && <EmptyState state="loading" title="正在读取测评日报…" />}
    {data && <>
      <div className={styles.statusRow}>
        <p className={styles.muted} title="日期按北京时间当晚 22:00 起的测评归属。仅统计已保存的自动运行；迟到结果会在自动汇总启用后更新。">自动汇总{data.enabled ? "已启用" : "暂停"} · 优先使用 {data.preferred === "qwen" ? "千问" : "DeepSeek"}{!data.configured && " · 汇总模型未配置"}</p>
        {embedded && <Button className={styles.barAction} variant="secondary" onClick={() => setRetry(v => v + 1)}>刷新</Button>}
      </div>
      {!data.storageReady ? <InlineAlert tone="warning">每日报告存储尚未启用，需要先完成数据库迁移。</InlineAlert> : <>
        {data.canGenerate && <form className={styles.form} onSubmit={event => { event.preventDefault(); void submit(); }}><label>测评日期<input type="date" value={date} required onChange={event => setDate(event.target.value)} /></label><Button type="submit" variant="primary" disabled={!date || submitting}>{submitting ? "正在提交…" : "生成该日总结"}</Button></form>}
        {!embedded && <p className={`${styles.muted} ${styles.note}`}>日期按北京时间当晚 22:00 起的测评归属。仅统计已保存的自动运行；迟到结果会在自动汇总启用后更新。</p>}
        <div className={styles.listArea}>
        {data.items.length === 0 ? <EmptyState state="empty" title="暂无测评日报。" description="自动测评结束后会生成报告，也可在具备权限时选择日期生成。" /> : <ul className={styles.list}>{data.items.map(item => <li key={item.date} className={styles.reportCard}>
          <Link className={styles.reportLink} href={`/daily-reports/${item.date}`} aria-label={`查看 ${item.date} 测评日报`} />
          <div className={styles.reportHead}>
            <strong>{item.date}</strong>
            <span className={styles.reportState} data-state={item.status}><i aria-hidden="true" />{states[item.status] || "状态未知"} · {analysisStates[item.analysisState] || "状态未知"}</span>
          </div>
          <div className={styles.reportStats}>
            <span><b>{item.total}</b> 已记录</span>
            <span><b>{item.completed}</b> 执行完成</span>
            <span><b>{item.unfinished}</b> 未完成</span>
          </div>
          <div className={styles.reportFoot}><Button variant="secondary" size="sm" href={`/daily-reports/${item.date}`}>查看日报</Button></div>
        </li>)}</ul>}
        </div>
        <Pagination page={page} pages={Math.max(1, Math.ceil(data.total / 20))} total={data.total} pageSize={20} onPageChange={setPage} />
      </>}
    </>}
  </>;
  if (embedded) return <div className={`${styles.page} ${styles.embedded}`}>{content}</div>;
  return <main className={styles.page}>
    <header className={styles.header}><div><h1>测评日报</h1><p>汇总夜间自动测评，查看各服务表现与主要问题。</p></div><Button variant="secondary" onClick={() => setRetry(v => v + 1)}>刷新</Button></header>
    {content}
  </main>;
}

export function DailyReportDetail({ date, pending = false, backHref = "/daily-reports", backLabel = "返回测评日报" }: { date: string; pending?: boolean; backHref?: string; backLabel?: string }) {
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    async function read() {
      try {
        const response = await fetch(`${base}/${date}`, { cache: "no-store", signal: controller.signal });
        if (response.status === 404 && pending && Date.now() - started < 120000) { timer = setTimeout(read, 3000); return; }
        const value = await readResponse(response); setData(value); setError("");
        if (value.status === "generating") timer = setTimeout(read, 5000);
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "读取失败。"); }
    }
    void read(); return () => { controller.abort(); clearTimeout(timer); };
  }, [date, pending, retry]);
  async function resubmit() {
    setSubmitting(true); setError("");
    try { await generate(date); setRetry(v => v + 1); }
    catch (err) { setError(err instanceof Error ? err.message : "无法重新生成。"); }
    finally { setSubmitting(false); }
  }
  return <div className={styles.detailViewport} role="region" aria-label="测评日报内容" tabIndex={0}>
  <main className={`${styles.page} ${styles.reading}`}>
    <header className={styles.header}>
      <div><h1>{date} 测评日报</h1></div>
      <div className={styles.headerActions}>
        <BackLink href={backHref}>{backLabel}</BackLink>
        {data?.share && <a className="secondary-button" href={data.share.url} target="_blank" rel="noreferrer noopener">免登录分享</a>}
        {data?.status === "ready" && data.markdown && <a className="secondary-button" href={`${base}/${date}/markdown`}>下载 Markdown</a>}
      </div>
    </header>
    {error && <InlineAlert tone="danger" action={<Button type="button" variant="secondary" onClick={() => setRetry(v => v + 1)}>重试读取</Button>}>{error}</InlineAlert>}
    {!data && !error && <EmptyState state="loading" title={pending ? "正在等待总结生成…" : "正在读取总结…"} />}
    {data && <>
      <p className={styles.muted} role="status">{states[data.status] || "状态未知"} · {analysisStates[data.analysisState] || "状态未知"}{data.model && ` · ${data.model}`}</p>
      {data.status === "generating" && <p>正在汇总已有测评结果，旧版内容暂不展示。</p>}
      {data.status === "failed" && <InlineAlert tone="warning">生成过程已中断，可重试总结。</InlineAlert>}
      {data.canGenerate && data.status !== "generating" && (data.analysisState !== "ready" || data.status === "failed") && <Button variant="primary" disabled={submitting} onClick={() => void resubmit()}>{submitting ? "正在提交…" : "重试智能总结"}</Button>}
      {data.status === "ready" && data.markdown && <article className={`${styles.report} run-answer`}><AnswerMarkdown content={data.markdown.replace(/^# [^\n]+\n/, "")} /></article>}
    </>}
  </main></div>;
}
