"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { createRequestKey } from "@/lib/request-key";
import { StandardsQuestionPicker, type Question } from "@/components/standards-question-picker";
import styles from "./standards-assistant.module.css";

type Requirement = { id: string; requirement: string; critical: boolean; source: string };
type Criterion = { id: string; name: string; category: "required" | "recommended" | "needs_verification"; description: string; howToJudge: string; source: string | null };
type Result = { domain: string; taskType: string; explicitRequirements: Requirement[]; evaluationCriteria: Criterion[]; missingInformation: string[]; verification: { message: string }; model?: string | null };
type Saved = { id: string; state: "draft" | "confirmed" | "superseded"; question: string; content: Result; model: string | null; createdAt: string };
const labels = { required: "题目要求", recommended: "专业建议", needs_verification: "待核验" };

export function StandardsAssistant() {
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<Question | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]); const [currentId, setCurrentId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false); const [notice, setNotice] = useState("");
  const [storageBusy, setStorageBusy] = useState(false); const requestRef = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  function reset() {
    requestRef.current++; setQuestion(""); setResult(null); setError(""); setSelected(null); setSaved([]); setCurrentId(null); setNotice(""); setEditing(false);
    scrollRef.current?.scrollTo({ top: 0 });
    inputRef.current?.focus();
  }
  async function generate(questionText: string) {
    if (busy) return;
    const input = questionText.trim();
    if (input.length < 8 || input.length > 4000) { setError("请输入 8 至 4000 个字符的问题。"); return; }
    setBusy(true); setError(""); setResult(null); setCurrentId(null); setEditing(false); setNotice("");
    try {
      const response = await fetch("/api/evaluation/standards", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": createRequestKey() }, body: JSON.stringify({ question: input }) });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : data.error?.message || "生成失败，请稍后重试。");
      if (!Array.isArray(data.evaluationCriteria) || !Array.isArray(data.explicitRequirements) || !Array.isArray(data.missingInformation) || typeof data.verification?.message !== "string") throw new Error("返回结果格式异常，请稍后重试。");
      setResult(data);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "生成失败，请稍后重试。"); }
    finally { setBusy(false); }
  }
  const generateRef = useRef(generate);
  useEffect(() => { generateRef.current = generate; });
  useEffect(() => {
    const raw = sessionStorage.getItem("evaluation-standards-selected-question");
    if (!raw) return;
    sessionStorage.removeItem("evaluation-standards-selected-question");
    try {
      const value = JSON.parse(raw);
      if (typeof value?.id !== "string" || typeof value?.datasetVersion !== "string" || typeof value?.question !== "string" || typeof value?.sourceType !== "string") throw new Error();
      setTimeout(() => { setSelected(value); setQuestion(value.question); void generateRef.current(value.question); }, 0);
    } catch { setTimeout(() => setError("题目信息无效，请重新选择。"), 0); }
  }, []);
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void generate(question); }
  async function selectQuestion(value: Question) {
    const request = ++requestRef.current; setPickerOpen(false); setQuestion(value.question); setSelected(value); setSaved([]); setResult(null); setCurrentId(null); setNotice(""); setEditing(false); setError(""); setStorageBusy(true); scrollRef.current?.scrollTo({ top: 0 });
    try {
      const query = new URLSearchParams({ questionId: value.id, datasetVersion: value.datasetVersion });
      const response = await fetch(`/api/evaluation/question-standards?${query}`, { cache: "no-store" }); const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : data.error?.message || "标准读取失败");
      if (!Array.isArray(data.items)) throw new Error("标准返回格式异常");
      if (request !== requestRef.current) return;
      setSaved(data.items); const existing = data.items.find((item: Saved) => item.state === "confirmed") || data.items.find((item: Saved) => item.state === "draft");
      if (existing) { setResult({ ...existing.content, model: existing.model }); setCurrentId(existing.id); setNotice(existing.state === "confirmed" ? "已加载该题当前确认标准。" : "已加载该题最新草稿。"); }
      else { setNotice("该题暂无保存的标准，正在生成。"); void generate(value.question); }
    } catch (reason) { if (request === requestRef.current) setError(reason instanceof Error ? reason.message : "标准读取失败"); }
    finally { if (request === requestRef.current) setStorageBusy(false); }
  }
  async function save() {
    if (!selected || !result || storageBusy) return;
    setStorageBusy(true); setError("");
    try {
      const response = await fetch('/api/evaluation/question-standards', { method:'POST', headers:{'Content-Type':'application/json','Idempotency-Key':createRequestKey()}, body:JSON.stringify({questionId:selected.id,datasetVersion:selected.datasetVersion,question:selected.question,content:result,model:result.model}) });
      const data=await response.json(); if (!response.ok) throw new Error(data.error?.message || data.error || '保存失败');
      const item:Saved={id:data.id,state:'draft',question:selected.question,content:result,model:result.model || null,createdAt:new Date().toISOString()};
      setSaved(current=>[item,...current]);setCurrentId(item.id);setEditing(false);setNotice('草稿已保存，确认后才会成为当前标准。');
    } catch(reason) { setError(reason instanceof Error ? reason.message : '保存失败'); } finally { setStorageBusy(false); }
  }
  async function confirm() {
    if (!currentId || storageBusy || editing) return;
    setStorageBusy(true);setError('');
    try { const response=await fetch(`/api/evaluation/question-standards/${encodeURIComponent(currentId)}/confirm`,{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':createRequestKey()},body:'{}'});const data=await response.json();if(!response.ok)throw new Error(data.error?.message || data.error || '确认失败');setSaved(current=>current.map(item=>({...item,state:item.id===currentId?'confirmed':item.state==='confirmed'?'superseded':item.state})));setNotice('已确认该题标准，不会自动用于实际评分。'); }
    catch(reason){setError(reason instanceof Error?reason.message:'确认失败');}finally{setStorageBusy(false);}
  }
  function exportMarkdown() {
    if (!result) return;
    const lines=['# 题目','',question,'','# 评判标准','','## 题目明确要求',...result.explicitRequirements.map(item=>`- ${item.requirement}${item.critical?'（关键）':''}`),'','## 评判标准',...result.evaluationCriteria.flatMap(item=>[`### ${item.name}（${labels[item.category]}）`,item.description,`如何判断：${item.howToJudge}`,'']),'## 待补充的信息',...(result.missingInformation.length?result.missingInformation.map(item=>`- ${item}`):['无'])];
    const url=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/markdown;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='题目与评判标准.md';link.click();URL.revokeObjectURL(url);
  }
  return <div className={styles.scroll} ref={scrollRef}><main className={styles.page}>
    <header><h1>评判标准助手</h1><p>输入一个问题，生成可审阅的评判标准。</p></header>
    <form onSubmit={submit} className={styles.form}>
      <div className={styles.questionHeading}><label htmlFor="standards-question">问题</label><button type="button" className={styles.pickButton} disabled={busy || storageBusy} onClick={() => setPickerOpen(true)}>从题库选择</button></div>
      <textarea ref={inputRef} id="standards-question" value={question} onChange={event => { setQuestion(event.target.value);setSelected(null);setSaved([]);setCurrentId(null);setResult(null);setNotice(''); }} disabled={busy || storageBusy} maxLength={4000} rows={6} placeholder="例如：比较两种铝合金用于无人机支架的适用性，并说明选择依据。" />
      <div className={styles.actions}><span>{question.length} / 4000</span><div className={styles.buttons}><button type="button" className={styles.reset} disabled={busy || storageBusy || (!question && !result && !error)} onClick={reset}>清空重问</button><button type="submit" disabled={busy || storageBusy}>{busy ? "正在生成…" : "生成评判标准"}</button></div></div>
    </form>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p role="status" className={styles.muted}>{notice}</p>}
    {storageBusy && <p role="status" className={styles.muted}>正在处理题目标准…</p>}
    {busy && <p role="status" className={styles.muted}>正在理解问题并整理检查项，请稍候。</p>}
    {result && <section aria-live="polite" className={styles.results}>
      <div className={styles.buttons}><button type="button" className={styles.pickButton} onClick={exportMarkdown}>导出题目和标准</button>{selected && <><button type="button" className={styles.pickButton} disabled={storageBusy} onClick={() => { if (!editing) setCurrentId(null); setEditing(value => !value); }}>{editing ? '完成编辑' : '编辑标准'}</button><button type="button" className={styles.pickButton} disabled={storageBusy} onClick={save}>保存草稿</button>{currentId && saved.find(item=>item.id===currentId)?.state==='draft' && <button type="button" className={styles.pickButton} disabled={storageBusy || editing} onClick={confirm}>确认标准</button>}</>}</div>
      {selected && saved.length>0 && <label>已保存版本 <select value={currentId || ''} onChange={event=>{const item=saved.find(row=>row.id===event.target.value);if(item){setResult({...item.content,model:item.model});setCurrentId(item.id);setEditing(false);setNotice('已切换保存的版本。');}}}><option value="" disabled>当前未保存</option>{saved.map(item=><option key={item.id} value={item.id}>{item.state==='confirmed'?'已确认':item.state==='draft'?'草稿':'历史'} · {new Date(item.createdAt).toLocaleString()}</option>)}</select></label>}
      <div><h2>生成结果</h2><p className={styles.muted}>{result.domain} · {result.taskType}</p><p className={styles.notice}>{result.verification.message}</p></div>
      <section><h3>题目明确要求</h3><ol>{result.explicitRequirements.map(item => <li key={item.id}><strong>{item.requirement}</strong>{item.critical && <span className={styles.tag}>关键</span>}<p>题目原文：{item.source}</p></li>)}</ol></section>
      <section><h3>评判标准</h3><ol className={styles.criteria}>{result.evaluationCriteria.map((item,index) => <li key={item.id}><div><strong>{item.name}</strong><span className={styles.tag}>{labels[item.category]}</span></div>{editing ? <><label>检查内容<textarea value={item.description} onChange={event=>setResult(current=>current && {...current,evaluationCriteria:current.evaluationCriteria.map((entry,i)=>i===index?{...entry,description:event.target.value}:entry)})} /></label><label>如何判断<textarea value={item.howToJudge} onChange={event=>setResult(current=>current && {...current,evaluationCriteria:current.evaluationCriteria.map((entry,i)=>i===index?{...entry,howToJudge:event.target.value}:entry)})} /></label></> : <><p>{item.description}</p><p><b>如何判断：</b>{item.howToJudge}</p></>}{item.source && <p className={styles.muted}>题目原文：{item.source}</p>}</li>)}</ol></section>
      <section><h3>待补充的信息</h3>{result.missingInformation.length ? <ul>{result.missingInformation.map((item, i) => <li key={i}>{item}</li>)}</ul> : <p className={styles.muted}>没有识别到必须补充的信息。</p>}</section>
    </section>}
    <StandardsQuestionPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={selectQuestion} />
  </main></div>;
}
