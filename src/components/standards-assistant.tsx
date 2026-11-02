"use client";

import { useRef, useState, type FormEvent } from "react";
import { createRequestKey } from "@/lib/request-key";
import { StandardsQuestionPicker } from "@/components/standards-question-picker";
import styles from "./standards-assistant.module.css";

type Requirement = { id: string; requirement: string; critical: boolean; source: string };
type Criterion = { id: string; name: string; category: "required" | "recommended" | "needs_verification"; description: string; howToJudge: string; source: string | null };
type Result = { domain: string; taskType: string; explicitRequirements: Requirement[]; evaluationCriteria: Criterion[]; missingInformation: string[]; verification: { message: string } };
const labels = { required: "题目要求", recommended: "专业建议", needs_verification: "待核验" };

export function StandardsAssistant() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  function reset() {
    setQuestion(""); setResult(null); setError("");
    scrollRef.current?.scrollTo({ top: 0 });
    inputRef.current?.focus();
  }
  async function generate(questionText: string) {
    if (busy) return;
    const input = questionText.trim();
    if (input.length < 8 || input.length > 4000) { setError("请输入 8 至 4000 个字符的问题。"); return; }
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch("/api/evaluation/standards", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": createRequestKey() }, body: JSON.stringify({ question: input }) });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : data.error?.message || "生成失败，请稍后重试。");
      if (!Array.isArray(data.evaluationCriteria) || !Array.isArray(data.explicitRequirements) || !Array.isArray(data.missingInformation) || typeof data.verification?.message !== "string") throw new Error("返回结果格式异常，请稍后重试。");
      setResult(data);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "生成失败，请稍后重试。"); }
    finally { setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void generate(question); }
  function selectQuestion(value: string) { setPickerOpen(false); setQuestion(value); scrollRef.current?.scrollTo({ top: 0 }); void generate(value); }
  return <div className={styles.scroll} ref={scrollRef}><main className={styles.page}>
    <header><h1>评判标准助手</h1><p>输入一个问题，生成可审阅的评判标准。</p></header>
    <form onSubmit={submit} className={styles.form}>
      <div className={styles.questionHeading}><label htmlFor="standards-question">问题</label><button type="button" className={styles.pickButton} disabled={busy} onClick={() => setPickerOpen(true)}>从题库选择</button></div>
      <textarea ref={inputRef} id="standards-question" value={question} onChange={event => setQuestion(event.target.value)} disabled={busy} maxLength={4000} rows={6} placeholder="例如：比较两种铝合金用于无人机支架的适用性，并说明选择依据。" />
      <div className={styles.actions}><span>{question.length} / 4000</span><div className={styles.buttons}><button type="button" className={styles.reset} disabled={busy || (!question && !result && !error)} onClick={reset}>清空重问</button><button type="submit" disabled={busy}>{busy ? "正在生成…" : "生成评判标准"}</button></div></div>
    </form>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {busy && <p role="status" className={styles.muted}>正在理解问题并整理检查项，请稍候。</p>}
    {result && <section aria-live="polite" className={styles.results}>
      <div><h2>生成结果</h2><p className={styles.muted}>{result.domain} · {result.taskType}</p><p className={styles.notice}>{result.verification.message}</p></div>
      <section><h3>题目明确要求</h3><ol>{result.explicitRequirements.map(item => <li key={item.id}><strong>{item.requirement}</strong>{item.critical && <span className={styles.tag}>关键</span>}<p>题目原文：{item.source}</p></li>)}</ol></section>
      <section><h3>评判标准</h3><ol className={styles.criteria}>{result.evaluationCriteria.map(item => <li key={item.id}><div><strong>{item.name}</strong><span className={styles.tag}>{labels[item.category]}</span></div><p>{item.description}</p><p><b>如何判断：</b>{item.howToJudge}</p>{item.source && <p className={styles.muted}>题目原文：{item.source}</p>}</li>)}</ol></section>
      <section><h3>待补充的信息</h3>{result.missingInformation.length ? <ul>{result.missingInformation.map((item, i) => <li key={i}>{item}</li>)}</ul> : <p className={styles.muted}>没有识别到必须补充的信息。</p>}</section>
    </section>}
    <StandardsQuestionPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={selectQuestion} />
  </main></div>;
}
