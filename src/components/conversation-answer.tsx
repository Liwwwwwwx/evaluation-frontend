"use client";

import { useMemo } from "react";
import { AnswerMarkdown } from "@/components/answer-markdown";
import { record, records, text } from "@/lib/structured-results";
import { conversationSegments } from "@/lib/conversation-layout";

const statuses: Record<string, string> = { running: "进行中", success: "已完成", warning: "需留意", failed: "失败", skipped: "已跳过", error: "失败", timeout: "超时" };

// 实时与历史共用：后端已按 event_id / seq 归并，展示层不再猜测或拼接协议帧。
export function ConversationAnswer({ content, run, streaming = false }: { content: string; run: unknown; streaming?: boolean }) {
  const details = record(record(run)?.details);
  const events = useMemo(() => records(details?.displayEvents), [details?.displayEvents]);
  const steps = events.filter(event => event.type === "display.process.step");
  const outputs = events.filter(event => ["display.team_output", "display.final_answer"].includes(text(event.type)));
  const notes = events.filter(event => ["display.followups", "display.followup_request", "display.followup_answer", "display.recommendations", "display.supplement"].includes(text(event.type)));
  return <div className="conversation-answer">
    {steps.length > 0 && <details className="conversation-process"><summary>处理过程 · {steps.length} 个步骤<span>{steps.some(step => step.status === "running") && streaming ? "执行中" : "查看步骤"}</span></summary><ol>{steps.map((step, index) => <li key={text(step.event_id) || index}><div className="conversation-block-head"><strong>{text(step.title) || "服务步骤"}</strong><span>{step.status === "running" && !streaming ? "未确认完成" : statuses[text(step.status)] || "状态未知"}</span></div>{text(step.detail) && <p>{text(step.detail)}</p>}{records(step.metrics).length > 0 && <dl className="conversation-metrics">{records(step.metrics).map((metric, i) => <div key={i}><dt>{text(metric.label)}</dt><dd>{text(metric.value)} {text(metric.unit)}</dd></div>)}</dl>}</li>)}</ol></details>}
    {conversationSegments(content, outputs).map((segment) => {
      if (segment.kind === "text") return <AnswerMarkdown key={segment.key} content={segment.content} streaming={streaming} empty="" />;
      const event = segment.event;
      const final = event.type === "display.final_answer";
      const ended = event.phase === "end" || event.phase === "exit";
      const body = event.phase === "end" && typeof event.content === "string" ? event.content : text(event.delta);
      const team = record(event.team);
      const title = final ? "最终总结" : `团队输出 · ${text(team?.name) || "未命名团队"}${typeof event.call_seq === "number" && event.call_seq > 1 ? ` · 第 ${event.call_seq} 次` : ""}`;
      const status = ended ? statuses[text(event.status)] || "已结束" : streaming ? "生成中" : "未收到结束标识";
      return <details className={`conversation-output${final ? " conversation-final" : ""}`} key={segment.key} open><summary><strong>{title}</strong><span>{status}{typeof event.elapsed_s === "number" && Number.isFinite(event.elapsed_s) && event.elapsed_s >= 0 ? ` · ${Math.round(event.elapsed_s)} 秒` : ""}</span></summary><div className="conversation-output-body">{body ? event.fence_risk === true ? <pre>{body}</pre> : <AnswerMarkdown content={body} streaming={streaming && !ended} /> : <p className="run-score-note">{streaming && !ended ? "正在接收输出…" : "服务未提供该段正文。"}</p>}</div></details>;
    })}
    {notes.map((event, index) => <section className="conversation-note" key={text(event.event_id) || index}>
      <h3>{event.type === "display.followup_request" ? "服务追问" : event.type === "display.followup_answer" ? "补充答复" : event.type === "display.supplement" ? "补充信息" : "后续建议"}</h3>
      {text(event.answer) && <AnswerMarkdown content={text(event.answer)} />}
      {text(event.preview) && <p>{text(event.preview)}</p>}
      {records(event.questions).length > 0 && <ul>{records(event.questions).map((question, i) => <li key={text(question.id) || i}>{text(question.question)}</li>)}</ul>}
      {records(event.items).length > 0 && <ul>{records(event.items).map((item, i) => <li key={text(item.id) || i}>{text(item.text)}</li>)}</ul>}
      {text(event.question) && <p>{text(event.question)}</p>}
    </section>)}
    {!content.trim() && !outputs.length && !steps.length && <p className="run-score-note">{streaming ? "等待服务输出…" : "暂无正文输出。"}</p>}
  </div>;
}
