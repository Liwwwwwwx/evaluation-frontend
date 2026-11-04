"use client";
import { createRequestKey } from "@/lib/request-key";

import { useState } from "react";
import { StructuredOutcomes } from "@/components/structured-outcomes";

type ObjectValue = Record<string, unknown>;
function object(value: unknown): ObjectValue | null { return value && typeof value === "object" && !Array.isArray(value) ? value as ObjectValue : null; }
function text(value: unknown) { return typeof value === "string" ? value : typeof value === "number" ? String(value) : ""; }

function ReviewForm({ review, runId, onRefresh }: { review: ObjectValue; runId: string; onRefresh?: () => void }) {
  const questions = Array.isArray(review.questions) ? review.questions.map(object).filter((item): item is ObjectValue => !!item) : [];
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false); const [handled, setHandled] = useState(false); const [error, setError] = useState("");
  async function send(action: string) {
    if (busy || handled) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/evaluation/unified/runs/${encodeURIComponent(runId)}/reply`, {
        method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": createRequestKey() },
        body: JSON.stringify({ requestId: review.requestId, action, answers: questions.map(q => ({ id: q.id, answer: answers[text(q.id)] || "" })) }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error?.message || result.error || `答复失败（${response.status}）`);
      setHandled(true); onRefresh?.();
    } catch (err) { setError(err instanceof Error ? err.message : "答复失败，请刷新原运行确认状态。"); }
    finally { setBusy(false); }
  }
  return <form className="run-review-form" onSubmit={event => { event.preventDefault(); void send(questions.length ? "apply" : "continue"); }}>
    {questions.map(q => <label key={text(q.id)}>{text(q.question)}{q.required === true && "（必填）"}<textarea value={answers[text(q.id)] || ""} maxLength={2000} required={q.required === true} disabled={busy || handled} onChange={event => setAnswers(current => ({ ...current, [text(q.id)]: event.target.value }))} />{text(q.suggestedAnswer) && <span className="run-score-note">服务建议：{text(q.suggestedAnswer)}。请核对后明确填写。</span>}</label>)}
    {error && <p className="eval-error" role="alert">{error}</p>}
    {handled ? <p role="status">答复已提交，正在读取运行状态。</p> : <div className="run-review-actions"><button type="submit" className="primary-button" disabled={busy}>{busy ? "提交中…" : questions.length ? "提交答复" : "确认继续"}</button><button type="button" className="secondary-button" disabled={busy} onClick={() => void send("stop")}>停止本次运行</button></div>}
  </form>;
}

export function RunServiceDetails({ run, runId, canReply = false, snapshotOnly = false, onRefresh }: { run: unknown; runId: string; canReply?: boolean; snapshotOnly?: boolean; onRefresh?: () => void }) {
  const nativeRun = object(run); const details = object(nativeRun?.details);
  if (!details) return text(nativeRun?.error) ? <p className="eval-error" role="alert">{text(nativeRun?.error)}</p> : null;
  const pending = object(details.pendingReview);
  const snapshot = object(details.snapshot); const result = object(snapshot?.data) || object(details.result);
  const reviews = Array.isArray(details.review) ? details.review : [];
  const automaticReplies = reviews.map(object).filter(item => item?.source === "automatic" && item.action === "continue" && item.delivery === "sent").length;
  const decisions = reviews.map(object).filter(item => item?.source === "automatic" && item.delivery === "sent" && text(item.summary));
  const supplements = reviews.map(object).filter(item => item?.source === "automatic" && item.action === "apply" && item.delivery === "sent");
  const nativeStatus = text(result?.status);
  const resultStates: Record<string, string> = { completed: "已完成", partially_completed: "部分完成", pending_validation: "待验证", waiting_for_input: "等待补充信息", failed: "失败", done: "已结束", success: "成功", ok: "成功" };
  return <div className="run-service-details">
    {automaticReplies > 0 && <p className="run-score-note" role="status">测评平台已自动答复继续（{automaticReplies}次）。</p>}
    {decisions.length > 0 && <ul className="run-score-note" aria-label="自动确认结果">{decisions.map((item, index) => <li key={index}>{text(item?.summary)}</li>)}</ul>}
    {supplements.map((item, index) => <details key={index} className="run-score-note"><summary>查看自动补充的条件{text(item?.model) ? `（${text(item?.model)}）` : ""}</summary>{(Array.isArray(item?.answers) ? item.answers : []).map((answer, answerIndex) => <p key={answerIndex}>{text(object(answer)?.answer)}</p>)}</details>)}
    {text(nativeRun?.error) && <p className="eval-error" role="alert">{text(nativeRun?.error)}</p>}
    {pending && <section className="run-service-section" aria-label="运行条件确认"><h3>{text(pending.title) || "请确认运行条件"}</h3><p className="run-score-note">服务正在等待答复，尚未自动接受建议条件。</p><details><summary>查看服务提出的条件</summary><pre>{JSON.stringify(pending.data, null, 2)}</pre></details>{canReply && !snapshotOnly ? <ReviewForm key={text(pending.requestId)} review={pending} runId={runId} onRefresh={onRefresh} /> : <p className="run-score-note">仅发起人可在原运行进程中答复；当前显示的记录无法提交确认。</p>}</section>}
    {nativeStatus && <p className="run-score-note">服务结果：{resultStates[nativeStatus] || nativeStatus}。这是服务自报状态。</p>}
    <StructuredOutcomes details={details} runId={runId} />
  </div>;
}
