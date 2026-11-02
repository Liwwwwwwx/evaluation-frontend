"use client";
import { createRequestKey } from "@/lib/request-key";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnswerMarkdown } from "@/components/answer-markdown";
import styles from "./daily-reports.module.css";

type Item = { date: string; status: string; analysisState: string; total: number; completed: number; unfinished: number; updatedAt: string };
type Catalog = { items: Item[]; total: number; enabled: boolean; preferred: string; configured: boolean; storageReady: boolean; canGenerate: boolean };
type Report = { date: string; status: string; analysisState: string; markdown: string | null; error: string | null; model: string | null; provider: string | null; canGenerate: boolean; notificationState: string | null; snapshot: { inProgress: boolean } };
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

export function DailyReportList() {
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
  return <main className={styles.page}>
    <header className={styles.header}><div><h1>每日总结</h1><p>汇总夜间自动测评，查看各服务表现与主要问题。</p></div><button className="secondary-button" onClick={() => setRetry(v => v + 1)}>刷新</button></header>
    {error && <p className={styles.message} role="alert">{error}</p>}
    {!data && !error && <p role="status">正在读取每日总结…</p>}
    {data && <>
      <p className={styles.muted}>自动汇总{data.enabled ? "已启用" : "暂停"} · 优先使用 {data.preferred === "qwen" ? "千问" : "DeepSeek"}{!data.configured && " · 汇总模型未配置"}</p>
      {!data.storageReady ? <p className={styles.message} role="status">每日报告存储尚未启用，需要先完成数据库迁移。</p> : <>
        {data.canGenerate && <form className={styles.form} onSubmit={event => { event.preventDefault(); void submit(); }}><label>测评日期<input type="date" value={date} required onChange={event => setDate(event.target.value)} /></label><button className="primary-button" disabled={!date || submitting}>{submitting ? "正在提交…" : "生成该日总结"}</button></form>}
        <p className={styles.muted}>日期按北京时间当晚 22:00 起的测评归属。仅统计已保存的自动运行；迟到结果会在自动汇总启用后更新。</p>
        {data.items.length === 0 ? <p className={styles.empty}>暂无每日总结。自动测评结束后会生成报告，也可在具备权限时选择日期生成。</p> : <ul className={styles.list}>{data.items.map(item => <li key={item.date}><Link href={`/daily-reports/${item.date}`}><strong>{item.date}</strong><span>{states[item.status] || "状态未知"} · {analysisStates[item.analysisState] || "状态未知"}</span><span>已记录 {item.total} 次 · 执行完成 {item.completed} 次 · 未完成 {item.unfinished} 次</span></Link></li>)}</ul>}
        {data.total > 20 && <div className={styles.pagination}><button className="secondary-button" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button><span>第 {page} / {Math.ceil(data.total / 20)} 页</span><button className="secondary-button" disabled={page * 20 >= data.total} onClick={() => setPage(p => p + 1)}>下一页</button></div>}
      </>}
    </>}
  </main>;
}

export function DailyReportDetail({ date, pending = false }: { date: string; pending?: boolean }) {
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
  return <main className={`${styles.page} ${styles.reading}`}>
    <Link className={styles.back} href="/daily-reports">返回每日总结</Link>
    <header className={styles.header}><h1>{date} 每日测评总结</h1>{data?.status === "ready" && data.markdown && <a className="secondary-button" href={`${base}/${date}/markdown`}>下载 Markdown</a>}</header>
    {error && <p className={styles.message} role="alert">{error} <button className="secondary-button" onClick={() => setRetry(v => v + 1)}>重试读取</button></p>}
    {!data && !error && <p role="status">{pending ? "正在等待总结生成…" : "正在读取总结…"}</p>}
    {data && <>
      <p className={styles.muted} role="status">{states[data.status] || "状态未知"} · {analysisStates[data.analysisState] || "状态未知"}{data.model && ` · ${data.model}`}</p>
      {data.status === "generating" && <p>正在汇总已有测评结果，旧版内容暂不展示。</p>}
      {data.status === "failed" && <p className={styles.message}>生成过程已中断，可重试总结。</p>}
      {data.canGenerate && data.status !== "generating" && (data.analysisState !== "ready" || data.status === "failed") && <button className="primary-button" disabled={submitting} onClick={() => void resubmit()}>{submitting ? "正在提交…" : "重试智能总结"}</button>}
      {data.status === "ready" && data.markdown && <article className={`${styles.report} run-answer`}><AnswerMarkdown content={data.markdown.replace(/^# [^\n]+\n/, "")} /></article>}
    </>}
  </main>;
}
