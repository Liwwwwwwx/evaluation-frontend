"use client";

import { useEffect, useImperativeHandle, useRef, useState, type FormEvent, type Ref } from "react";
import { createRequestKey } from "@/lib/request-key";
import { assistantDraftKey, clearDraft, readDraft, writeDraft } from "@/lib/assistant-draft";
import { useAuth } from "@/components/auth-gate";
import { StandardsQuestionPicker, type Question } from "@/components/standards-question-picker";
import { Button } from "@/components/ui";
import type { StandardContent } from "@/components/direct-score";
import styles from "./standards-assistant.module.css";

type Requirement = { id: string; requirement: string; critical: boolean; source: string };
type Criterion = { id: string; name: string; category: "required" | "recommended" | "needs_verification"; description: string; howToJudge: string; source: string | null };
type Result = { domain: string; taskType: string; explicitRequirements: Requirement[]; evaluationCriteria: Criterion[]; missingInformation: string[]; verification: { message: string }; model?: string | null };
type Saved = { id: string; state: "draft" | "confirmed" | "superseded"; question: string; content: Result; model: string | null; createdAt: string };
const labels = { required: "题目要求", recommended: "专业建议", needs_verification: "待核验" };

export type StandardsAssistantHandle = { hasWork: () => boolean };
export function StandardsAssistant({ ref, onUseForScore }: { ref?: Ref<StandardsAssistantHandle>; onUseForScore: (question: string, standard: StandardContent) => string }) {
  const { user } = useAuth();
  const draftKey = assistantDraftKey("standards", user.id);
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<Question | null>(null);
  const [saved, setSaved] = useState<Saved[]>([]); const [currentId, setCurrentId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false); const [notice, setNotice] = useState("");
  const [storageBusy, setStorageBusy] = useState(false); const requestRef = useRef(0);
  const [step, setStep] = useState<1 | 2>(1);
  const [hydrated, setHydrated] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => ({ hasWork: () => Boolean(question || result || busy || storageBusy) }));
  useEffect(() => {
    const draft = readDraft<{ question?: unknown; selected?: Question | null; result?: Result | null; saved?: Saved[]; currentId?: string | null; step?: number }>(draftKey);
    if (draft && typeof draft.question === "string") {
      setQuestion(draft.question);
      setSelected(draft.selected || null);
      setResult(draft.result || null);
      setSaved(Array.isArray(draft.saved) ? draft.saved : []);
      setCurrentId(typeof draft.currentId === "string" ? draft.currentId : null);
      setStep(draft.step === 2 && draft.result ? 2 : 1);
      if (draft.question.trim() || draft.result) setNotice("已恢复上次未提交的内容。");
    }
    setHydrated(true);
  }, [draftKey]);
  useEffect(() => {
    if (!hydrated) return;
    if (!question.trim() && !selected && !result && saved.length === 0 && !currentId) {
      clearDraft(draftKey);
      return;
    }
    writeDraft(draftKey, { question, selected, result, saved, currentId, step });
  }, [draftKey, hydrated, question, selected, result, saved, currentId, step]);
  function reset() {
    requestRef.current++; clearDraft(draftKey); setQuestion(""); setResult(null); setError(""); setSelected(null); setSaved([]); setCurrentId(null); setNotice(""); setEditing(false); setStep(1);
    scrollRef.current?.scrollTo({ top: 0 });
    inputRef.current?.focus();
  }
  function goStep(next: 1 | 2) {
    if (next === 1) { setStep(1); return; }
    if (!result) { setError("请先生成标准，再进入审阅。"); return; }
    setError("");
    setStep(2);
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
      setResult(data); setStep(2);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "生成失败，请稍后重试。"); }
    finally { setBusy(false); }
  }
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
      if (existing) { setResult({ ...existing.content, model: existing.model }); setCurrentId(existing.id); setStep(2); setNotice(existing.state === "confirmed" ? "已加载该题当前确认标准。" : "已加载该题最新草稿。"); }
      else { setNotice("该题暂无保存的标准，正在生成。"); void generate(value.question); }
    } catch (reason) { if (request === requestRef.current) setError(reason instanceof Error ? reason.message : "标准读取失败"); }
    finally { if (request === requestRef.current) setStorageBusy(false); }
  }
  const selectQuestionRef = useRef(selectQuestion);
  useEffect(() => { selectQuestionRef.current = selectQuestion; });
  useEffect(() => {
    const raw = sessionStorage.getItem("evaluation-standards-selected-question");
    if (!raw) return;
    sessionStorage.removeItem("evaluation-standards-selected-question");
    try {
      const value = JSON.parse(raw);
      if (typeof value?.id !== "string" || typeof value?.datasetVersion !== "string" || typeof value?.question !== "string" || typeof value?.sourceType !== "string") throw new Error();
      setTimeout(() => { void selectQuestionRef.current(value); }, 0);
    } catch { setTimeout(() => setError("题目信息无效，请重新选择。"), 0); }
  }, []);
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
    const lines=['# 题目','',question,'','# 测评标准','','## 题目明确要求',...result.explicitRequirements.map(item=>`- ${item.requirement}${item.critical?'（关键）':''}`),'','## 测评标准',...result.evaluationCriteria.flatMap(item=>[`### ${item.name}（${labels[item.category]}）`,item.description,`如何判断：${item.howToJudge}`,'']),'## 待补充的信息',...(result.missingInformation.length?result.missingInformation.map(item=>`- ${item}`):['无'])];
    const url=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/markdown;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='题目与测评标准.md';link.click();URL.revokeObjectURL(url);
  }
  return <main className={styles.page}>
    <div className={styles.stepper} aria-label="生成标准步骤">
      <button type="button" className={`${styles.step}${step === 1 ? ` ${styles.active}` : ` ${styles.done}`}`} onClick={() => goStep(1)}>
        <span className={styles.stepDot}>{step === 2 ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg> : "1"}</span><span>输入题目</span>
      </button>
      <span className={`${styles.stepLine}${result ? ` ${styles.done}` : ""}`} aria-hidden="true" />
      <button type="button" className={`${styles.step}${step === 2 ? ` ${styles.active}` : ""}`} onClick={() => goStep(2)}>
        <span className={styles.stepDot}>2</span><span>审阅标准</span>
      </button>
    </div>

    {step === 1 ? <form onSubmit={submit} className={styles.stepShell}>
      {(error || notice || storageBusy || busy) && <div className={styles.alerts}>
        {error && <p className={styles.error} role="alert">{error}</p>}
        {(notice || storageBusy || busy) && <p role="status" className={styles.muted}>{storageBusy ? "正在处理题目标准…" : busy ? "正在理解题目并整理检查项，请稍候。" : notice}</p>}
      </div>}
      <div className={styles.contentScroll} ref={scrollRef}>
        <section className={styles.inputSheet}>
          <div className={styles.sheetHead}><div><h2>题目</h2><p>用于生成测评标准的题目原文</p></div><Button type="button" variant="secondary" size="sm" disabled={busy || storageBusy} onClick={() => setPickerOpen(true)}>从题库选择</Button></div>
          {selected && <p className={styles.selectedMeta}>已选择题库题目 · 版本 {selected.datasetVersion}</p>}
          <textarea ref={inputRef} className={styles.questionInput} aria-label="题目" value={question} onChange={event => { setQuestion(event.target.value);setSelected(null);setSaved([]);setCurrentId(null);setResult(null);setNotice(''); }} disabled={busy || storageBusy} maxLength={4000} rows={5} placeholder="输入题目，或从题库选择。例如：比较两种铝合金用于无人机支架的适用性，并说明选择依据。" />
          <p className={styles.hint}>生成结果先作为可审阅草稿展示，不会自动用于实际评分。</p>
        </section>
      </div>
      <div className={styles.bottomBar}>
        <span className={styles.counter}>{question.length} / 4000</span>
        <div className={styles.footActions}>
          <Button type="button" variant="ghost" size="sm" disabled={busy || storageBusy || (!question && !result && !error)} onClick={reset}>清空</Button>
          <Button type="submit" variant="primary" size="sm" loading={busy} disabled={storageBusy}>{busy ? "正在生成" : "生成标准"}</Button>
        </div>
      </div>
    </form> : <div className={styles.stepShell}>
      {result ? <>
        {(error || notice || storageBusy) && <div className={styles.alerts}>
          {error && <p className={styles.error} role="alert">{error}</p>}
          {(notice || storageBusy) && <p role="status" className={styles.muted}>{storageBusy ? "正在处理题目标准…" : notice}</p>}
        </div>}
        <div className={styles.contentScroll} ref={scrollRef}>
          <div className={styles.reviewSheet}>
            <section className={styles.reviewColumn}>
              <div className={styles.columnHead}><h2>题目与要求</h2><span className={styles.tiny}>{result.domain} · {result.taskType}</span></div>
              <div className={styles.questionBlock}>{question}</div>
              {result.verification.message && <p className={styles.verification}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>{result.verification.message}</p>}
              <section className={styles.resultSection}>
                <h3>题目明确要求</h3>
                <ol className={styles.requirementList}>{result.explicitRequirements.map(item => <li key={item.id}>
                  <div className={styles.itemHead}><strong>{item.requirement}</strong>{item.critical && <span className={styles.tag}>关键</span>}</div>
                  <p>题目原文：{item.source}</p>
                </li>)}</ol>
              </section>
              <section className={styles.resultSection}>
                <h3>待补充的信息</h3>
                {result.missingInformation.length ? <ul className={styles.missingList}>{result.missingInformation.map((item, i) => <li key={i}>{item}</li>)}</ul> : <p className={styles.muted}>没有识别到必须补充的信息。</p>}
              </section>
            </section>
            <section className={styles.reviewColumn}>
              <div className={styles.columnHead}><h2>测评标准</h2><span className={styles.tiny}>{result.evaluationCriteria.length} 条</span></div>
              <ol className={styles.criteriaList}>{result.evaluationCriteria.map((item, index) => <li key={item.id}>
                <div className={styles.itemHead}><strong>{item.name}</strong><span className={styles.tag}>{labels[item.category]}</span></div>
                {editing ? <div className={styles.editFields}>
                  <label>检查内容<textarea value={item.description} onChange={event => setResult(current => current && { ...current, evaluationCriteria: current.evaluationCriteria.map((entry, i) => i === index ? { ...entry, description: event.target.value } : entry) })} /></label>
                  <label>如何判断<textarea value={item.howToJudge} onChange={event => setResult(current => current && { ...current, evaluationCriteria: current.evaluationCriteria.map((entry, i) => i === index ? { ...entry, howToJudge: event.target.value } : entry) })} /></label>
                </div> : <>
                  <p>{item.description}</p>
                  <p className={styles.judgeLine}><b>如何判断</b>{item.howToJudge}</p>
                </>}
                {item.source && <p className={styles.sourceLine}>题目原文：{item.source}</p>}
              </li>)}</ol>
            </section>
          </div>
        </div>
        <div className={styles.bottomBar}>
          <div className={styles.footerStart}>
            {selected && saved.length > 0 && <label className={styles.versionRow}>版本
              <select value={currentId || ""} onChange={event => { const item = saved.find(row => row.id === event.target.value); if (item) { setResult({ ...item.content, model: item.model }); setCurrentId(item.id); setEditing(false); setNotice("已切换保存的版本。"); } }}>
                <option value="" disabled>当前未保存</option>
                {saved.map(item => <option key={item.id} value={item.id}>{item.state === "confirmed" ? "已确认" : item.state === "draft" ? "草稿" : "历史"} · {new Date(item.createdAt).toLocaleString()}</option>)}
              </select>
            </label>}
          </div>
          <div className={styles.footActions}>
            <Button type="button" variant="secondary" size="sm" disabled={busy || storageBusy} onClick={() => goStep(1)}>上一步</Button>
            {selected && <Button type="button" variant="ghost" size="sm" disabled={storageBusy} onClick={() => { if (!editing) setCurrentId(null); setEditing(value => !value); }}>{editing ? "完成编辑" : "编辑标准"}</Button>}
            {selected && <Button type="button" variant="ghost" size="sm" disabled={storageBusy} onClick={save}>保存草稿</Button>}
            {currentId && saved.find(item => item.id === currentId)?.state === "draft" && <Button type="button" variant="ghost" size="sm" disabled={storageBusy || editing} onClick={confirm}>确认标准</Button>}
            <Button type="button" variant="ghost" size="sm" onClick={exportMarkdown}>导出 Markdown</Button>
            <Button type="button" variant="primary" size="sm" disabled={busy || storageBusy || editing} onClick={() => { const problem = onUseForScore(question, result); setError(problem); }}>用此标准评分</Button>
          </div>
        </div>
      </> : <div className={styles.emptyStep}>
        <p className={styles.muted}>还没有生成标准，请先返回上一步输入题目。</p>
        <Button type="button" variant="secondary" size="sm" onClick={() => goStep(1)}>返回输入题目</Button>
      </div>}
    </div>}
    <StandardsQuestionPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={selectQuestion} />
  </main>;
}
