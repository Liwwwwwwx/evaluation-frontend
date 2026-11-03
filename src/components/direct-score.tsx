"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { StandardsQuestionPicker, type Question } from "@/components/standards-question-picker";
import { Button, InlineAlert, Select, Textarea } from "@/components/ui";
import { createRequestKey } from "@/lib/request-key";
import { assistantDraftKey, clearDraft, readDraft, writeDraft } from "@/lib/assistant-draft";
import { useAuth } from "@/components/auth-gate";
import styles from "./direct-score.module.css";

export type StandardContent = {
  domain: string; taskType: string;
  explicitRequirements: { requirement: string; critical: boolean; source: string }[];
  evaluationCriteria: { name: string; category: string; description: string; howToJudge: string; source?: string | null }[];
  missingInformation: string[];
};
type SavedStandard = { id: string; state: "draft" | "confirmed" | "superseded"; content: StandardContent; createdAt: string };
type Criterion = { criterion: string; status: "met" | "partial" | "missing" | "unclear"; reason: string; evidence: string | null; evidenceUnverified?: boolean; standardUnverified?: boolean };
type Score = { status: "ready" | "failed" | "unavailable"; model: string | null; score?: number | null; summary?: string; criteria?: Criterion[]; suggestions?: string[]; error?: string; evidenceWarning?: string | null; provisional?: boolean };
type Result = { scores: { deepSeekScore: Score; qwenScore: Score }; redacted: boolean; note: string };
const labels: Record<string, string> = { met: "满足", partial: "部分满足", missing: "未满足", unclear: "无法判断" };
const states: Record<string, string> = { confirmed: "已确认", draft: "草稿", superseded: "历史" };

function standardText(content: StandardContent) {
  const categories: Record<string, string> = { required: "题目要求", recommended: "专业建议", needs_verification: "待核验" };
  return [
    `领域：${content.domain}；任务类型：${content.taskType}`,
    "题目明确要求：",
    ...content.explicitRequirements.map(item => `- ${item.requirement}${item.critical ? "（关键）" : ""}；题目原文：${item.source}`),
    "测评标准：",
    ...content.evaluationCriteria.map(item => `- ${item.name}（${categories[item.category] || item.category}）：${item.description}；如何判断：${item.howToJudge}${item.source ? `；题目原文：${item.source}` : ""}`),
    ...(content.missingInformation.length ? ["待补充信息：", ...content.missingInformation.map(item => `- ${item}`)] : []),
  ].join("\n");
}

async function readResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : data.error?.message || "请求失败，请稍后重试。");
  return data as T;
}

export type DirectScoreHandle = { hasWork: () => boolean; useStandard: (question: string, standard: StandardContent) => string };

export function DirectScore({ ref }: { ref?: Ref<DirectScoreHandle> }) {
  const { user } = useAuth();
  const draftKey = assistantDraftKey("score", user.id);
  const [question, setQuestion] = useState("");
  const [selected, setSelected] = useState<Question | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [standards, setStandards] = useState<SavedStandard[]>([]);
  const [standardId, setStandardId] = useState("");
  const [standard, setStandard] = useState("");
  const [answer, setAnswer] = useState("");
  const [loadingStandards, setLoadingStandards] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [hydrated, setHydrated] = useState(false);
  const request = useRef(0);
  const busy = loadingStandards || generating || scoring;
  const questionValid = question.trim().length >= 8 && question.trim().length <= 4000;
  const filled = [questionValid, standard.trim().length > 0, answer.trim().length > 0] as const;
  const ready = filled.every(Boolean);
  function goStep(next: 1 | 2 | 3) {
    if (busy) return;
    if (next > step) {
      if (next >= 2 && !filled[0]) { setError("请先填写题目，或从题库选择。"); return; }
      if (next >= 3 && !filled[1]) { setError("请先选择、生成或输入评分标准。"); return; }
    }
    setError("");
    setStep(next);
  }

  useImperativeHandle(ref, () => ({
    hasWork: () => Boolean(question || standard || answer || result || busy),
    useStandard: (newQuestion, content) => {
      if (busy) return "回答评分正在处理，请稍后再带入标准。";
      const generated = standardText(content);
      if (generated.length > 20000) return "标准超过 20000 字，请缩短后再用于评分。";
      if ((question || standard || answer || result) && !window.confirm("带入后将替换回答评分中现有的题目、标准、输出和结果。继续？")) return "已取消带入，回答评分中的内容未更改。";
      request.current++;
      setSelected(null); setQuestion(newQuestion); setStandards([]); setStandardId(""); setStandard(generated); setAnswer(""); setResult(null); setError(""); setStep(2);
      setNotice("已带入题目和标准，请审阅后粘贴输出。此标准按自定义文本评分。");
      return "";
    },
  }));
  useEffect(() => {
    const draft = readDraft<{ question?: unknown; selected?: Question | null; standards?: SavedStandard[]; standardId?: string; standard?: unknown; answer?: unknown; result?: Result | null; step?: number }>(draftKey);
    if (draft && typeof draft.question === "string") {
      setQuestion(draft.question);
      setSelected(draft.selected || null);
      setStandards(Array.isArray(draft.standards) ? draft.standards : []);
      setStandardId(typeof draft.standardId === "string" ? draft.standardId : "");
      setStandard(typeof draft.standard === "string" ? draft.standard : "");
      setAnswer(typeof draft.answer === "string" ? draft.answer : "");
      setResult(draft.result || null);
      setStep(draft.step === 2 || draft.step === 3 ? draft.step : 1);
      if (draft.question.trim() || draft.standard || draft.answer || draft.result) setNotice("已恢复上次填写的内容。");
    }
    setHydrated(true);
  }, [draftKey]);
  useEffect(() => {
    if (!hydrated) return;
    if (!question.trim() && !selected && !standard.trim() && !answer.trim() && !result) {
      clearDraft(draftKey);
      return;
    }
    writeDraft(draftKey, { question, selected, standards, standardId, standard, answer, result, step });
  }, [draftKey, hydrated, question, selected, standards, standardId, standard, answer, result, step]);
  function resetScore() {
    request.current++;
    clearDraft(draftKey);
    setQuestion(""); setSelected(null); setStandards([]); setStandardId(""); setStandard(""); setAnswer(""); setResult(null); setNotice(""); setError(""); setStep(1);
  }

  async function selectQuestion(value: Question) {
    const current = ++request.current;
    setPickerOpen(false); setSelected(value); setQuestion(value.question); setStandards([]); setStandardId(""); setStandard(""); setResult(null); setError(""); setNotice(""); setLoadingStandards(true);
    try {
      const query = new URLSearchParams({ questionId: value.id, datasetVersion: value.datasetVersion });
      const data = await readResponse<{ items: SavedStandard[] }>(await fetch(`/api/evaluation/question-standards?${query}`, { cache: "no-store" }));
      if (!Array.isArray(data.items)) throw new Error("标准列表格式异常，请重试。");
      if (request.current !== current) return;
      setStandards(data.items);
      setNotice(data.items.length ? "请选择这道题关联的标准，也可以自行输入或生成。" : "这道题暂无关联标准，可以自行输入或生成。");
    } catch (reason) { if (request.current === current) setError(reason instanceof Error ? reason.message : "标准读取失败。"); }
    finally { if (request.current === current) setLoadingStandards(false); }
  }

  async function generate() {
    if (busy) return;
    if (question.trim().length < 8 || question.trim().length > 4000) { setError("题目需要 8 至 4000 个字符。"); return; }
    setGenerating(true); setError(""); setNotice(""); setResult(null);
    try {
      const data = await readResponse<StandardContent>(await fetch("/api/evaluation/standards", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": createRequestKey() }, body: JSON.stringify({ question: question.trim() }) }));
      if (!Array.isArray(data.explicitRequirements) || !Array.isArray(data.evaluationCriteria) || !Array.isArray(data.missingInformation) || typeof data.domain !== "string" || typeof data.taskType !== "string") throw new Error("生成结果格式异常，请重试。");
      const generated = standardText(data);
      if (generated.length > 20000) throw new Error("生成的标准过长，请缩短后使用。");
      setStandardId(""); setStandard(generated); setNotice("标准已生成，请查看并按需修改后评分。生成内容尚未保存到题库。");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "生成标准失败。"); }
    finally { setGenerating(false); }
  }

  async function score() {
    if (busy) return;
    if (question.trim().length < 8 || question.trim().length > 4000 || !standard.trim() || !answer.trim()) { setError("请填写题目、评分标准和待评输出。"); return; }
    setScoring(true); setError(""); setNotice(""); setResult(null);
    try {
      const chosen = selected && standardId ? { type: "saved", id: standardId, questionId: selected.id, datasetVersion: selected.datasetVersion } : { type: "text", text: standard };
      const data = await readResponse<Result>(await fetch("/api/evaluation/direct-score", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": createRequestKey() }, body: JSON.stringify({ question: question.trim(), standard: chosen, answer }) }));
      if (!data.scores?.deepSeekScore || !data.scores?.qwenScore) throw new Error("评分结果格式异常，请重试。");
      setResult(data);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "评分失败，请重试。"); }
    finally { setScoring(false); }
  }

  return <main className={styles.page}>
    <div className={styles.stepper} aria-label="评分步骤">
      <button type="button" className={`${styles.step}${step === 1 ? ` ${styles.active}` : filled[0] ? ` ${styles.done}` : ""}`} onClick={() => goStep(1)}>
        <span className={styles.stepDot}>{filled[0] && step !== 1 ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg> : "1"}</span><span>题目</span>
      </button>
      <span className={`${styles.stepLine}${filled[0] ? ` ${styles.done}` : ""}`} aria-hidden="true" />
      <button type="button" className={`${styles.step}${step === 2 ? ` ${styles.active}` : filled[1] ? ` ${styles.done}` : ""}`} onClick={() => goStep(2)}>
        <span className={styles.stepDot}>{filled[1] && step !== 2 ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg> : "2"}</span><span>评分标准</span>
      </button>
      <span className={`${styles.stepLine}${filled[1] ? ` ${styles.done}` : ""}`} aria-hidden="true" />
      <button type="button" className={`${styles.step}${step === 3 ? ` ${styles.active}` : filled[2] ? ` ${styles.done}` : ""}`} onClick={() => goStep(3)}>
        <span className={styles.stepDot}>{filled[2] && step !== 3 ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg> : "3"}</span><span>待评分输出</span>
      </button>
    </div>

    <div className={styles.contentScroll}>
      <section className={styles.stepCard}>
        <div className={styles.stepHead}>
          {step === 1 && <><div><h2 id="direct-score-question-heading">题目</h2><p>要评分的题目原文</p></div><Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => setPickerOpen(true)}>从题库选择</Button></>}
          {step === 2 && <><div><h2 id="direct-score-standard-heading">评分标准</h2><p>用于逐条判断回答质量</p></div><Button type="button" variant="secondary" size="sm" disabled={busy} loading={generating} onClick={() => void generate()}>{generating ? "正在生成" : "根据题目生成"}</Button></>}
          {step === 3 && <><div><h2 id="direct-score-answer-heading">待评分输出</h2><p>粘贴服务回答或其他系统的输出</p></div><span className={styles.counter}>{answer.length} / 60000</span></>}
        </div>
        <div className={styles.stepBody}>
          {step === 1 && <>
            {selected && <p className={styles.selectedMeta}>已选择题库题目 · 版本 {selected.datasetVersion}</p>}
            <Textarea aria-label="题目" value={question} disabled={busy} maxLength={4000} rows={5} placeholder="输入题目，或从题库选择" onChange={event => { request.current++; setQuestion(event.target.value); setSelected(null); setStandards([]); setStandardId(""); setStandard(""); setNotice(""); setResult(null); }} />
          </>}
          {step === 2 && <>
            {selected && (loadingStandards ? <p className={styles.meta}>正在读取关联标准…</p> : standards.length > 0 ? <Select label="题目关联标准" block value={standardId} disabled={busy} options={[{ value: "", label: "选择关联标准" }, ...standards.map(item => ({ value: item.id, label: `${states[item.state] || "标准"} · ${new Date(item.createdAt).toLocaleString("zh-CN")}` }))]} onChange={id => { setStandardId(id); const item = standards.find(row => row.id === id); setStandard(item ? standardText(item.content) : ""); setResult(null); setNotice(item ? "已选择关联标准；编辑后将按自定义标准评分。" : ""); }} /> : null)}
            <Textarea aria-label="评分标准" value={standard} disabled={busy} maxLength={20000} rows={9} placeholder="选择关联标准、根据题目生成，或在这里输入评分标准" onChange={event => { setStandard(event.target.value); setStandardId(""); setResult(null); }} />
          </>}
          {step === 3 && <>
            <Textarea className={styles.answerInput} aria-label="待评分的输出" value={answer} disabled={busy} maxLength={60000} rows={10} placeholder="粘贴你自己的回答或其他系统的输出" onChange={event => { setAnswer(event.target.value); setResult(null); }} />
            <div className={styles.summaryStrip}>
              <div className={styles.summaryLine}><span className={styles.summaryCheck} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="m5 12 4 4L19 6" /></svg></span><strong>题目</strong><span>{question.trim().slice(0, 56) || "尚未填写"}{question.trim().length > 56 ? "…" : ""}</span></div>
              <div className={styles.summaryLine}><span className={styles.summaryCheck} aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6"><path d="m5 12 4 4L19 6" /></svg></span><strong>标准</strong><span>{standard.trim() ? `${standard.trim().slice(0, 56)}${standard.trim().length > 56 ? "…" : ""}` : "尚未填写"}</span></div>
            </div>
          </>}
        </div>
      </section>
      {result && <section className={styles.results} aria-live="polite"><div className={styles.resultIntro}><div><span className={styles.eyebrow}>评分结果</span><h2>两位评委的独立结论</h2></div><p className={styles.meta}>{result.note}</p></div>{result.redacted && <InlineAlert tone="warning">检测到可能的凭据信息，发送给评委前已隐藏，评分依据可能不完整。</InlineAlert>}
        <div className={styles.resultGrid}>
        {([ ["DeepSeek", result.scores.deepSeekScore], ["千问", result.scores.qwenScore] ] as const).map(([name, value]) => <section className={styles.judge} key={name}>
          <div className={styles.judgeHead}><div><span className={styles.judgeName}>{name}</span><span className={styles.meta}>{value.model || "独立评委"}</span></div>{value.status === "ready" && <strong className={styles.score}>{typeof value.score === "number" ? value.score : "—"}<span>/ 100{value.provisional ? " · 参考分" : ""}</span></strong>}</div>
          {value.status !== "ready" ? <p className={styles.meta}>{value.error || (value.status === "unavailable" ? "模型未配置" : "评分失败")}</p> : <><p className={styles.summary}>{value.summary}</p>{value.evidenceWarning && <InlineAlert tone="warning">{value.evidenceWarning}</InlineAlert>}<ol className={styles.criteria}>{value.criteria?.map((item, index) => <li key={index}><div className={styles.criterionHead}><strong>{item.criterion}</strong><span className={styles.meta}>{item.evidenceUnverified ? "依据待核验" : labels[item.status] || "无法判断"}{item.standardUnverified ? " · 标准项待核验" : ""}</span></div><p>{item.evidenceUnverified ? `模型判断：${item.reason}` : item.reason}</p>{item.evidence && <blockquote>依据：{item.evidence}</blockquote>}</li>)}</ol>{Boolean(value.suggestions?.length) && <div className={styles.suggestions}><h4>改进建议</h4><ul>{value.suggestions?.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}</>}
        </section>)}
        </div>
      </section>}
    </div>
    {(notice || error) && <div className={styles.alerts}>{notice && <p className={styles.meta} role="status">{notice}</p>}{error && <InlineAlert tone="danger">{error}</InlineAlert>}</div>}
    <div className={styles.bottomBar}>
      <div className={styles.footerStart}>
        {(question.trim() || standard.trim() || answer.trim() || result) && <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={resetScore}>清空</Button>}
        {step === 3 && <span className={styles.tiny}>结果只保留在当前页面</span>}
      </div>
      <div className={styles.footActions}>
        {step > 1 && <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => goStep((step - 1) as 1 | 2 | 3)}>上一步</Button>}
        {step < 3
          ? <Button type="button" variant="primary" size="sm" disabled={busy || !filled[step - 1]} onClick={() => goStep((step + 1) as 1 | 2 | 3)}>下一步</Button>
          : <Button type="button" variant="primary" size="sm" loading={scoring} disabled={!ready || busy} onClick={() => void score()}>{scoring ? "正在评分" : "开始评分"}</Button>}
      </div>
    </div>
    <StandardsQuestionPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={selectQuestion} description="选择题目后可以查看关联标准。" />
  </main>;
}
