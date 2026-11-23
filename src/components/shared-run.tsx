"use client";

import { useEffect, useState } from "react";
import { AnswerMarkdown } from "@/components/answer-markdown";
import { ScoreSummary, type ScoreSummaryValue } from "@/components/score-summary";
import { UnifiedScores } from "@/components/unified-scores";
import { Button, EmptyState } from "@/components/ui";
import { serviceLabel } from "@/lib/batch-types";
import { runStatusLabel } from "@/lib/run-status";
import layout from "./shared-daily-report.module.css";
import styles from "./shared-run.module.css";

type Result = {
  question: string; serviceKey: string; status: string; answer: string; truncated: boolean;
  sections: { title: string; content: string }[]; scores: ScoreSummaryValue; expiresAt: string;
  scoreDetails?: { scores: unknown; scoring: unknown };
};
type View = { state: "loading" | "invalid" | "forbidden" | "login" | "error" } | { state: "ready"; result: Result };
const time = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short", hour12: false });

export function SharedRun({ shareId }: { shareId: string }) {
  const [view, setView] = useState<View>({ state: "loading" });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      if (!/^[a-f0-9-]{36}$/i.test(shareId)) { setView({ state: "invalid" }); return; }
      try {
        const response = await fetch(`/api/evaluation/unified/shared-runs/${encodeURIComponent(shareId)}`, {
          cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        });
        if (controller.signal.aborted) return;
        if (response.status === 401) { setView({ state: "login" }); return; }
        if (response.status === 403) { setView({ state: "forbidden" }); return; }
        if (response.status === 404) { setView({ state: "invalid" }); return; }
        if (!response.ok) throw Error("分享结果暂不可用");
        const result = await response.json() as Result;
        if (typeof result?.answer !== "string" || typeof result.question !== "string" || !Array.isArray(result.sections)
          || !Number.isFinite(Date.parse(result.expiresAt))) throw Error("分享数据格式异常");
        if (!controller.signal.aborted) setView({ state: "ready", result });
      } catch { if (!controller.signal.aborted) setView({ state: "error" }); }
    }
    void load();
    return () => controller.abort();
  }, [shareId, retry]);

  const result = view.state === "ready" ? view.result : null;
  const title = { loading: "正在读取评测结果…", invalid: "分享链接已失效", forbidden: "没有测评查看权限",
    login: "登录后查看分享", error: "暂时无法读取评测结果", ready: "" };
  return <main className={layout.page}>
    <header className={layout.header}>
      <p className={layout.brand}>Science 评测 · 团队分享</p>
      <h1>评测结果</h1>
      {result && <p className={layout.meta}>{serviceLabel(result.serviceKey)} · {runStatusLabel(result.status)} · 有效至 {time.format(new Date(result.expiresAt))}（北京时间）</p>}
    </header>
    {result ? <>
      <section className={styles.section}>
        <h2>题目</h2>
        <p className={styles.question}>{result.question}</p>
      </section>
      <section className={styles.section}>
        <h2>评分摘要</h2>
        <ScoreSummary scores={result.scores} />
        {result.scoreDetails && <details className={`score-criteria ${styles.scoreDetails}`}>
          <summary>查看评分详情与标准</summary>
          <div className={styles.scoreDetailsContent}>
            <UnifiedScores scores={result.scoreDetails.scores} run={{ scoring: result.scoreDetails.scoring }} />
          </div>
        </details>}
      </section>
      <section className={styles.section}>
        <h2>回答</h2>
        {(result.answer.trim() || !result.sections.length) && <div className={`run-answer ${layout.report}`}><AnswerMarkdown content={result.answer} readOnlyShare /></div>}
        {result.sections.map((section, index) => <div key={index} className={styles.output}>
          <h3>{section.title}</h3>
          <div className={`run-answer ${layout.report}`}><AnswerMarkdown content={section.content} readOnlyShare /></div>
        </div>)}
        {result.truncated && <p className="run-score-note">当前分享只包含部分回答。</p>}
      </section>
    </> : <EmptyState state={view.state === "loading" ? "loading" : view.state === "error" ? "error" : "forbidden"}
      title={title[view.state]}
      description={view.state === "invalid" ? "请联系分享人获取新链接。" : undefined}
      action={view.state === "error" ? <Button variant="secondary" onClick={() => { setView({ state: "loading" }); setRetry(value => value + 1); }}>重试</Button>
        : view.state === "login" ? <Button href={`/login?next=${encodeURIComponent(`/shared/runs/${shareId}`)}`}>登录</Button> : undefined} />}
  </main>;
}
