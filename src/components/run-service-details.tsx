"use client";
import { createRequestKey } from "@/lib/request-key";

import { useState } from "react";
import { StructuredOutcomes } from "@/components/structured-outcomes";

type ObjectValue = Record<string, unknown>;
function object(value: unknown): ObjectValue | null { return value && typeof value === "object" && !Array.isArray(value) ? value as ObjectValue : null; }
function text(value: unknown) { return typeof value === "string" ? value : typeof value === "number" ? String(value) : ""; }
function followup(value: unknown) {
  const result = object(value); const info = object(result?.requirement_interpretation); const data = object(result?.data);
  const title = [result?.user_conclusion, info?.confirmation_message, result?.message].map(text).find(item => item.trim()) || "";
  const fields = [info?.questions_to_confirm, result?.questions_to_confirm, info?.missing_required_inputs, data?.questions];
  const questions = [...new Set(fields.flatMap(value => Array.isArray(value) ? value : []).map(item => text(typeof item === "object" ? object(item)?.question || object(item)?.label : item).trim()).filter(Boolean))];
  return { title, questions };
}
function FollowupNotice({ title, questions, heading = "服务追问" }: { title: string; questions: string[]; heading?: string }) {
  return <section className="run-service-section" aria-label={heading}><h3>{heading}</h3>{title && <p>{title}</p>}{questions.length > 0 ? <ul className="run-list">{questions.map((question, index) => <li key={index}>{question}</li>)}</ul> : !title && <p className="run-score-note">服务未说明需要补充的具体信息。</p>}</section>;
}

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
  const supplements = reviews.map(object).filter(item => item?.source === "automatic" && item.action === "apply" && ["sent", "failed"].includes(text(item.delivery)) && Array.isArray(item.answers) && item.answers.length > 0);
  const retry = object(details.autoRetry);
  const retryQuestions = Array.isArray(retry?.questions) ? retry.questions.map(text).filter(Boolean) : [];
  const inputRequests = (Array.isArray(details.protocolFrames) ? details.protocolFrames : []).map(object).filter(item => item?.type === "user_input_request" && object(item.parameters)?.reason === "requirements");
  const recordedRequests = inputRequests.filter((item, index) => inputRequests.findIndex(other => other?.request_id === item?.request_id) === index);
  const reviewRequests = reviews.map(object).filter(item => item?.source === "service" && item.action === "requested" && !item.request).map(item => ({ message: text(object(item?.data)?.title), data: item?.data }));
  const missionRequests = reviews.map(object).map(item => object(item?.request)).filter(item => item && (item.type === "user_input_request" || item.type === "display.followup_request") && item.kind !== "approval");
  const nativeStatus = text(result?.status);
  const resultStates: Record<string, string> = { completed: "已完成", partially_completed: "部分完成", pending_validation: "待验证", waiting_for_input: "等待补充信息", failed: "失败", done: "已结束", success: "成功", ok: "成功" };
  return <div className="run-service-details">
    {automaticReplies > 0 && <p className="run-score-note" role="status">测评平台已自动答复继续（{automaticReplies}次）。</p>}
    {decisions.length > 0 && <ul className="run-score-note" aria-label="自动确认结果">{decisions.map((item, index) => <li key={index}>{text(item?.summary)}</li>)}</ul>}
    {supplements.map((item, index) => <details key={index} className="run-score-note"><summary>{item?.delivery === "sent" ? "查看自动补充的条件" : "查看未发送的自动补充"}{text(item?.model) ? `（${text(item?.model)}）` : ""}</summary>{(Array.isArray(item?.answers) ? item.answers : []).map((answer, answerIndex) => <p key={answerIndex}>{text(object(answer)?.answer)}</p>)}</details>)}
    {text(nativeRun?.error) && <p className="eval-error" role="alert">{text(nativeRun?.error)}</p>}
    {retry && <>
      <FollowupNotice title={text(retry.title)} questions={retryQuestions} />
      <p className="run-score-note">{({ generating: "原连接已结束，正在自动生成补充。", restarting: "补充已生成，正在重新发起一次。", running: "已携带补充重新发起，正在运行。", completed: "已携带补充重新发起，运行已结束。", failed: "自动补充或重新发起未完成，请查看失败原因。", unavailable: "服务未给出具体追问，无法自动补充。" } as Record<string, string>)[text(retry.state)] || "自动补充状态未知。"}</p>
      {text(retry.message) && <details className="run-score-note"><summary>查看自动补充内容{text(retry.model) ? `（${text(retry.model)}）` : ""}</summary><p>{text(retry.message)}</p><p>自动补充可能包含假设，请结合题目核对。</p></details>}
      {text(retry.previousAnswer) && <details className="run-score-note"><summary>查看首轮回答</summary><p>{text(retry.previousAnswer)}</p>{retry.previousAnswerTruncated === true && <p>首轮回答已截断。</p>}</details>}
    </>}
    {recordedRequests.map((item, index) => { const request = followup(item); return <FollowupNotice key={text(item?.request_id) || index} {...request} />; })}
    {reviewRequests.map((item, index) => <FollowupNotice key={`review-${index}`} {...followup(item)} />)}
    {missionRequests.map((item, index) => <FollowupNotice key={`mission-${index}`} {...followup({ ...item, data: { ...object(item?.data), questions: item?.questions || object(item?.data)?.questions } })} />)}
    {nativeStatus === "waiting_for_input" && (!retry || (retry.state === "failed" && !!retry.taskId)) && <><FollowupNotice {...followup(result)} heading={retry ? "重试后服务仍要求补充" : "服务追问"} />{!retry && <p className="run-score-note">原连接已结束，无法直接回复；有权限时可重新测评，系统会在收到具体追问后尝试自动补充。</p>}</>}
    {pending && <section className="run-service-section" aria-label="运行条件确认"><h3>{text(pending.title) || "请确认运行条件"}</h3><p className="run-score-note">服务正在等待答复，尚未自动接受建议条件。</p><details><summary>查看服务提出的条件</summary><pre>{JSON.stringify(pending.data, null, 2)}</pre></details>{canReply && !snapshotOnly ? <ReviewForm key={text(pending.requestId)} review={pending} runId={runId} onRefresh={onRefresh} /> : <p className="run-score-note">仅发起人可在原运行进程中答复；当前显示的记录无法提交确认。</p>}</section>}
    {nativeStatus && <p className="run-score-note">服务结果：{resultStates[nativeStatus] || nativeStatus}。这是服务自报状态。</p>}
    <StructuredOutcomes details={details} runId={runId} />
  </div>;
}
