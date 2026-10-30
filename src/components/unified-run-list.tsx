"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Run = { runId: string; serviceKey: string; origin: string; question: string; status: string; startedAt: string | null };
const names: Record<string, string> = { "alpha-rsi": "1110", alloy: "合金材料", literature: "文献检索", "literature-aircraft": "航空文献", synthesis: "合成制备", "new-material": "新材料" };
const statuses: Record<string, string> = { running: "运行中", scoring: "评分中", done: "已结束", error: "失败" };
function dateLabel(value: string | null) {
  if (!value) return "未知";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "未知" : date.toLocaleString("zh-CN", { hour12: false });
}
export function UnifiedRunList() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: Run[]; total: number } | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/evaluation/unified/runs?page=${page}&pageSize=20`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => { const value = await response.json().catch(() => ({})); if (!response.ok || !Array.isArray(value.items) || typeof value.total !== "number") throw new Error(typeof value.error === "string" ? value.error : "无法读取运行记录。"); return value; })
      .then((value) => { setData(value); setError(""); })
      .catch((err) => { if (!controller.signal.aborted) { setData(null); setError(err instanceof Error ? err.message : "读取失败。"); } });
    return () => controller.abort();
  }, [page, retry]);
  const pages = Math.max(1, Math.ceil((data?.total || 0) / 20));
  return <section className="runs-list-page" aria-labelledby="runs-title"><header className="runs-list-header"><div><h1 id="runs-title">运行记录</h1><p>统一流式对话和自动化运行记录。</p></div><Link href="/evaluate" className="primary-button">新建测评</Link></header>
    {error ? <div className="bank-state"><p role="alert">{error}</p><button type="button" className="secondary-button" onClick={() => setRetry((value) => value + 1)}>重试</button></div> : !data ? <div className="bank-state">正在读取运行记录…</div> : data.total === 0 ? <div className="bank-state">暂无统一运行记录。</div> : <><div className="runs-table-wrap"><table className="runs-table"><thead><tr><th scope="col">题目</th><th scope="col">服务</th><th scope="col">来源</th><th scope="col">状态</th><th scope="col">开始时间</th><th scope="col">操作</th></tr></thead><tbody>{data.items.map((run) => <tr key={run.runId}><td><Link className="runs-question" href={`/runs/${run.runId}`}>{run.question}</Link></td><td>{names[run.serviceKey] || run.serviceKey}</td><td>{run.origin === "manual" ? "人工对话" : run.origin === "automation" ? "自动化" : run.origin === "legacy" ? "其他入口" : "未知"}</td><td>{statuses[run.status] || "状态未知"}</td><td>{dateLabel(run.startedAt)}</td><td><Link className="runs-detail-link" href={`/runs/${run.runId}`}>查看详情</Link></td></tr>)}</tbody></table></div><footer className="bank-footer"><span>共 {data.total} 条</span><div className="bank-pager"><button type="button" className="secondary-button" disabled={page <= 1} onClick={() => { setData(null); setPage(page - 1); }}>上一页</button><span>{page} / {pages}</span><button type="button" className="secondary-button" disabled={page >= pages} onClick={() => { setData(null); setPage(page + 1); }}>下一页</button></div></footer></>}
  </section>;
}
