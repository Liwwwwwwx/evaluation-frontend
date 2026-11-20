"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-gate";
import { Button, EmptyState, Input, Pagination } from "@/components/ui";
import { evaluationServiceCatalog, historicalServiceLabels } from "@/lib/evaluation-services";
import { formatScoringCost, formatScoringTokens, type ScoringUsage } from "@/lib/scoring-usage";
import styles from "./account-manager.module.css";

type Actor = { actor: string; username: string | null; displayName: string | null };
type Detail = { evaluationId: string; serviceKey: string | null; batchId: string | null; direct: boolean; rescored: boolean; rounds: number; lastUsed: string };
type Row = ScoringUsage & (Actor | Detail);
type Report = { items: Row[]; total: number; pageSize: number };
const serviceNames = Object.fromEntries(evaluationServiceCatalog.map(s => [s.key, s.label]));
const dateFormat = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "short", timeStyle: "short" });

function actorName(row: Actor) {
  if (row.actor === "automation") return "系统自动测评";
  if (row.actor === "service") return "服务调用";
  return row.displayName || row.username || row.actor.replace(/^evaluation-user:/, "");
}

export function ScoringUsageReport() {
  const { user } = useAuth();
  const [actor, setActor] = useState<Actor | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<{ key: string; data?: Report; error?: string }>();
  const invalid = !!from && !!to && from > to;
  const params = new URLSearchParams({ page: String(page) });
  if (actor) params.set("actor", actor.actor);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const query = params.toString();
  const key = query + "/" + refresh;
  useEffect(() => {
    if (!user.canManageAccounts || invalid) return;
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/evaluation/unified/scoring-usage?" + query, { signal: controller.signal, cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error?.message || "评分用量读取失败");
        if (!controller.signal.aborted) setResult({ key, data: body });
      } catch (e) {
        if (!controller.signal.aborted) setResult({ key, error: e instanceof Error ? e.message : "评分用量读取失败" });
      }
    }
    void load();
    return () => controller.abort();
  }, [user.canManageAccounts, query, key, invalid]);

  if (!user.canManageAccounts) return <main className={styles.page}><EmptyState state="forbidden" title="仅管理员可查看评分用量" /></main>;
  const data = result?.key === key ? result.data : undefined;
  const error = result?.key === key ? result.error : undefined;
  function select(row: Actor | null) { setActor(row); setPage(1); }

  return <main className={styles.page}><div className={styles.content}>
    <header className={styles.header}><div>
      <h1>{actor ? actorName(actor) + "的评分明细" : "评分用量"}</h1>
      <p className={styles.description}>统计启用后的评分清单、评委调用及重试，日期按北京时间筛选。费用按调用时保存的参考单价估算，DeepSeek 区分高峰与空闲时段，节假日及账户优惠以实际账单为准。</p>
    </div>{actor && <Button onClick={() => select(null)}>返回按人汇总</Button>}</header>
    <section className={styles.section}>
      <div className={styles.usageFilters}>
        <Input label="开始日期" type="date" value={from} max={to || undefined} onChange={e => { setFrom(e.target.value); setPage(1); }} />
        <Input label="结束日期" type="date" value={to} min={from || undefined} onChange={e => { setTo(e.target.value); setPage(1); }} />
        <Button onClick={() => setRefresh(n => n + 1)}>刷新</Button>
      </div>
      {invalid ? <EmptyState state="error" title="结束日期须晚于或等于开始日期" />
        : error ? <EmptyState state="error" title="无法读取评分用量" description={error} />
        : !data ? <EmptyState state="loading" title="正在读取评分用量…" />
        : !data.items.length ? <EmptyState state="empty" title="所选时段没有评分调用记录" description="用量从启用记录后开始统计。" />
        : <><div className={styles.tableWrap}><table className={styles.table + " " + styles.usageTable}>
          <thead><tr><th>{actor ? "测评 / 运行 ID" : "账号"}</th><th>{actor ? "最近评分时间" : "涉及测评"}</th><th>调用次数</th><th>输入 token</th><th>输出 token</th><th>合计 token</th><th>预估费用（元）</th></tr></thead>
          <tbody>{data.items.map(row => <tr key={"actor" in row ? row.actor : row.evaluationId}>
            {"actor" in row ? <><td><Button size="sm" onClick={() => select(row)}>{actorName(row)}</Button>{row.username && row.username !== actorName(row) && <div className={styles.muted}>{row.username}</div>}</td><td>{row.evaluations}</td></>
              : <><td><strong>{row.direct ? "直接评分" : serviceNames[row.serviceKey || ""] || historicalServiceLabels[row.serviceKey || ""] || "测评运行"}</strong><div className={styles.muted}>{row.evaluationId}</div>{row.batchId && <div className={styles.muted}>批次 {row.batchId}</div>}{row.rescored && <div className={styles.muted}>含重评 · 共 {row.rounds} 轮</div>}</td>
                <td>{dateFormat.format(new Date(row.lastUsed))}</td></>}
            <td>{row.calls}</td><td>{row.inputTokens?.toLocaleString("zh-CN") ?? "待确认"}</td><td>{row.outputTokens?.toLocaleString("zh-CN") ?? "待确认"}</td>
            <td>{formatScoringTokens(row)}</td><td>{formatScoringCost(row)}{row.missingCost > 0 && <div className={styles.muted}>{row.missingCost} 笔待确认</div>}</td>
          </tr>)}</tbody>
        </table></div><Pagination page={page} pages={Math.ceil(data.total / data.pageSize)} total={data.total} pageSize={data.pageSize} onPageChange={setPage} /></>}
    </section>
  </div></main>;
}
