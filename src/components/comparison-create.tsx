"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-gate";
import { Button, InlineAlert, ToastStack, useToasts } from "@/components/ui";
import { StandardsQuestionPicker, type Question } from "@/components/standards-question-picker";
import { comparisonErrorMessage } from "@/lib/comparison-api";
import { availableEvaluationServices, type EvaluationService } from "@/lib/evaluation-services";
import { createRequestKey } from "@/lib/request-key";
import styles from "./run-comparison.module.css";


type IconName = "book" | "shuffle" | "close" | "arrow-up";

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5z" /><path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20" /></>,
    shuffle: <><path d="M3 7h3.5c1.2 0 2.2.6 2.9 1.6L15 17c.7 1 1.7 1.6 2.9 1.6H21" /><path d="M3 17h3.5c1.2 0 2.2-.6 2.9-1.6l1.2-1.8" /><path d="M14 8.6l1-1.4c.7-1 1.7-1.6 2.9-1.6H21" /><path d="m18.4 3.6 2.4 2-2.4 2M18.4 16.6l2.4 2-2.4 2" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    "arrow-up": <path d="M12 19V5m-6 6 6-6 6 6" />,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

type Pending = { key: string; serviceKeys: [string, string]; question: string; questionId?: string; datasetVersion?: string; sourceType?: string };

const left = "synthesis";
const right = "alpha-rsi";
const max = 200;

export function ComparisonCreate() {
  const router = useRouter();
  const { user } = useAuth();
  const storageKey = user.id ? `evaluation-comparison-pending:${user.id}` : "";
  const [services, setServices] = useState<EvaluationService[]>([]);
  const [question, setQuestion] = useState("");
  const [source, setSource] = useState<Question | null>(null);
  const [generated, setGenerated] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [randomBusy, setRandomBusy] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    if (!storageKey) { setError("无法确认当前账号，暂不能发起对比。"); return; }
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const request = JSON.parse(saved) as Pending;
        if (typeof request.key !== "string" || !request.key || !Array.isArray(request.serviceKeys) || request.serviceKeys.length !== 2 || request.serviceKeys.some(key => typeof key !== "string") || typeof request.question !== "string") throw new Error();
        setPending(request); setQuestion(request.question);
        if (request.questionId && request.datasetVersion && request.sourceType) setSource({ id: request.questionId, datasetVersion: request.datasetVersion, sourceType: request.sourceType, question: request.question, domainKey: null });
      }
      setRestored(true);
    } catch { setError("无法读取待确认的对比请求，请检查浏览器会话存储。"); }
  }, [storageKey]);
  const { toasts, push: pushToast, dismiss: dismissToast } = useToasts();

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/evaluation/unified/services", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const value = await response.json().catch(() => null);
        if (!response.ok) throw new Error(comparisonErrorMessage(value, response.status));
        return value;
      })
      .then((value) => {
        const available = availableEvaluationServices(value.items).filter((item) => item.enabled);
        setServices(available);
        setLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "无法读取可用服务。");
        setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const text = question.trim();
  const ready = [left, right].every(key => services.some(service => service.key === key && service.enabled));
  const valid = restored && !!storageKey && !submitting && !randomBusy && (!!pending || (ready && text.length >= 8 && text.length <= max));

  function selectQuestion(item: Question) {
    setQuestion(item.question); setSource(item); setGenerated(false); setPickerOpen(false); setError("");
  }

  async function pickRandom() {
    if (randomBusy || submitting || pending) return;
    setRandomBusy(true); setError("");
    try {
      const response = await fetch("/api/question-bank/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ generationMode: "comparison", serviceKeys: [left, right], count: 1 }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(comparisonErrorMessage(data, response.status));
      const generated = data?.items?.[0]?.question;
      if (data?.generationMode !== "comparison" || !Array.isArray(data.serviceKeys) || data.serviceKeys.length !== 2 || data.serviceKeys[0] !== left || data.serviceKeys[1] !== right || typeof generated !== "string" || generated.trim().length < 8 || generated.trim().length > max) throw new Error("生成结果不符合当前服务或字数要求，请重试。");
      setQuestion(generated.trim()); setSource(null); setGenerated(true);
      pushToast("success", "已生成对比题");
    } catch (err) { pushToast("error", err instanceof Error ? err.message : "无法读取题库，请重试。"); }
    finally { setRandomBusy(false); }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || submitting) return;
    const request: Pending = pending || { key: createRequestKey(), serviceKeys: [left, right], question: text, ...(source ? { questionId: source.id, datasetVersion: source.datasetVersion, sourceType: source.sourceType } : {}) };
    try { sessionStorage.setItem(storageKey, JSON.stringify(request)); }
    catch { setError("浏览器无法保存发起记录，请允许会话存储后重试。"); return; }
    setPending(request);
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/evaluation/unified/comparisons", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": request.key },
        body: JSON.stringify({ serviceKeys: request.serviceKeys, question: request.question, ...(request.questionId ? { questionId: request.questionId, datasetVersion: request.datasetVersion, sourceType: request.sourceType } : {}) }),
      });
      const value = await response.json().catch(() => null);
      if (!response.ok) throw new Error(comparisonErrorMessage(value, response.status));
      if (!value || typeof value.groupId !== "string") throw new Error("对比组返回格式异常。");
      sessionStorage.removeItem(storageKey); setPending(null);
      router.push(`/compare/${encodeURIComponent(value.groupId)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法创建对比测评，请稍后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  const labelOf = (key: string) => services.find((service) => service.key === key)?.label || (key === "synthesis" ? "合成制备" : key === "alpha-rsi" ? "ALPHA 材料 RSI（1110）" : key);
  const pairReady = ready;

  return <main className="eval-page">
    <div className="eval-inner">
      <section className="eval-intro">
        <h1>要对比什么？</h1>
        <p>同一道题分别提交给{labelOf(left)}和{labelOf(right)}，并排查看回答和评分。</p>
      </section>

      <form className="eval-composer" onSubmit={submit}>
        {source && (
          <div className="eval-source">
            <span className="eval-chip">
              <Icon name="book" />
              <span>题库 {source.id} · {source.sourceType === "random" ? "随机题" : "固定题"}</span>
              <button type="button" aria-label="清除题库题目" disabled={!!pending || submitting || randomBusy} onClick={() => { setSource(null); setQuestion(""); }}>
                <Icon name="close" />
              </button>
            </span>
            <span className="eval-note">数据集 {source.datasetVersion} · 不会修改题库原题</span>
          </div>
        )}

        <label className="sr-only" htmlFor="comparison-question">题目内容</label>
        <textarea
          id="comparison-question"
          value={question}
          maxLength={max}
          disabled={!!pending || submitting || randomBusy}
          placeholder="输入要对比的题目，或从题库选择…"
          onChange={(event) => {
            const value = event.target.value;
            setQuestion(value);
            if (source && value !== source.question) setSource(null);
            setGenerated(false);
            setError("");
          }}
        />

        <div className="eval-bar">
          <div className="eval-tools">
            <span className={styles.comparePairTrigger}>
              <span className={styles.comparePairLabel}>对比</span>
              <span>{labelOf(left)}</span>
              <b>vs</b>
              <span>{labelOf(right)}</span>
            </span>
            <button type="button" className="eval-tool" onClick={() => { setError(""); setPickerOpen(true); }} disabled={!!pending || !pairReady || submitting || randomBusy}>
              <Icon name="book" /><span>从题库选</span>
            </button>
            <button type="button" className="eval-tool" onClick={() => void pickRandom()} disabled={!!pending || !pairReady || submitting || randomBusy}>
              {randomBusy ? <span className="eval-spinner" aria-hidden="true" /> : <Icon name="shuffle" />}
              <span>{randomBusy ? "正在生成…" : "随机一题"}</span>
            </button>
            <Button href="/evaluate" variant="ghost" size="sm">单题测评</Button>
          </div>

          <div className="eval-actions">
            {question.length > 0 && <span className={`eval-count${question.length > max ? " over" : ""}`}>{question.length} / {max}</span>}
            <button type="submit" className="eval-send" aria-label={pending ? "重试原请求" : "开始对比"} disabled={!valid}>
              {submitting ? <span className="eval-spinner" aria-hidden="true" /> : <Icon name="arrow-up" />}
            </button>
          </div>
        </div>
      </form>

      {pending && <InlineAlert tone="warning" className="eval-alert" action={<><Button href="/runs" target="_blank" rel="noopener noreferrer" variant="secondary" size="sm">查看运行记录</Button><Button type="button" variant="secondary" size="sm" disabled={submitting} onClick={() => { if (window.confirm("请确认已查看运行记录。放弃后重新发起可能产生重复运行，是否继续？")) { sessionStorage.removeItem(storageKey); setPending(null); setError(""); } }}>已核对，放弃原请求</Button></>}>上次对比请求结果尚未确认（{pending.serviceKeys.map(labelOf).join(" 与 ")}）；重试会使用原题目、题库版本和请求标识。</InlineAlert>}
      {!pairReady && !loading && <InlineAlert tone="danger" className="eval-alert">合成制备或 ALPHA 材料 RSI（1110）尚未启用，暂不能开始对比。</InlineAlert>}
      {generated && <p className="eval-hint">根据两个服务生成 · 请核对题目和服务适用性。</p>}
      {error && <InlineAlert tone="danger" className="eval-alert" action={<Button href="/runs" target="_blank" rel="noopener noreferrer" variant="secondary" size="sm">查看运行记录</Button>}>{error}</InlineAlert>}
      <p className="eval-hint">{loading ? "正在读取可用服务…" : submitting ? "正在创建对比运行，请勿重复提交。" : pending ? "点击发送按钮重试原请求。" : "每次对比保留题目、两份回答及评分状态。"}</p>
    </div>
    <ToastStack toasts={toasts} onDismiss={dismissToast} />
    <StandardsQuestionPicker key={`${left}:${right}`} open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={selectQuestion} comparison={{ left, right, max }} description="选择未绑定单一服务、无专属评分规则且符合字数上限的题目；请自行确认题目适合两个服务。" />
  </main>;
}
