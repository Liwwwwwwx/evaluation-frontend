import { AnswerMarkdown } from "@/components/answer-markdown";
import { EmptyState } from "@/components/ui/empty-state";
import type { SharedDailyReportResult } from "@/lib/shared-daily-report";
import styles from "./shared-daily-report.module.css";

const formatTime = (value: string) => new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short", hour12: false }).format(new Date(value));

export function SharedDailyReport({ result }: { result: SharedDailyReportResult }) {
  const report = result.status === "ready" ? result.report : null;
  return <main className={styles.page}>
    <header className={styles.header}>
      <p className={styles.brand}>Science 评测 · 只读分享</p>
      <h1>{report ? `${report.date} 测评日报` : "测评日报"}</h1>
      {report && <p className={styles.meta}>更新于 {formatTime(report.updatedAt)} · 链接有效至 {formatTime(report.expiresAt)}（北京时间）</p>}
    </header>
    {report ? <>
      <p className={styles.notice}>此页无需登录。报告中的案例详情需要登录评测平台后查看。</p>
      <article className={`${styles.report} run-answer`}><AnswerMarkdown content={report.markdown.replace(/^# [^\n]+\n/, "")} /></article>
    </> : <EmptyState state={result.status === "invalid" ? "forbidden" : result.status === "updating" ? "loading" : "error"}
      title={result.status === "invalid" ? "分享链接无效或已过期" : result.status === "updating" ? "报告正在更新" : "暂时无法读取报告"}
      description={result.status === "invalid" ? "请联系分享人获取新的链接。" : "请稍后刷新此页面重试。"} />}
  </main>;
}
