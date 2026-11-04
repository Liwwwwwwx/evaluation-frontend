"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth-gate";
import { Button, InlineAlert, Select, Textarea } from "@/components/ui";
import { comparisonErrorMessage } from "@/lib/comparison-api";
import { availableEvaluationServices, type EvaluationService } from "@/lib/evaluation-services";
import { createRequestKey } from "@/lib/request-key";
import styles from "./run-comparison.module.css";

type Pending = { key: string; serviceKeys: [string, string]; question: string };

function maxFor(serviceKey: string) {
  return serviceKey === "synthesis" ? 200 : 500;
}

export function ComparisonCreate() {
  const router = useRouter();
  const { user } = useAuth();
  const storageKey = user.id ? `evaluation-comparison-pending:${user.id}` : "";
  const [services, setServices] = useState<EvaluationService[]>([]);
  const [left, setLeft] = useState("mission-material");
  const [right, setRight] = useState("alpha-rsi");
  const [question, setQuestion] = useState("");
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
        if (!request.key || !Array.isArray(request.serviceKeys) || request.serviceKeys.length !== 2 || typeof request.question !== "string") throw new Error();
        setPending(request); setLeft(request.serviceKeys[0]); setRight(request.serviceKeys[1]); setQuestion(request.question);
      }
      setRestored(true);
    } catch { setError("无法读取待确认的对比请求，请检查浏览器会话存储。"); }
  }, [storageKey]);

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
        const preferredLeft = available.find((item) => item.key === "mission-material")?.key || available[0]?.key || "";
        const preferredRight = available.find((item) => item.key === "alpha-rsi" && item.key !== preferredLeft)?.key
          || available.find((item) => item.key !== preferredLeft)?.key || "";
        setLeft((current) => available.some((item) => item.key === current) ? current : preferredLeft);
        setRight((current) => available.some((item) => item.key === current) && current !== preferredLeft ? current : preferredRight);
        setLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "无法读取可用服务。");
        setLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!pending && right && right === left) setRight(services.find((item) => item.key !== left)?.key || "");
  }, [left, right, services, pending]);

  const max = Math.min(...[left, right].filter(Boolean).map(maxFor), 500);
  const text = question.trim();
  const valid = restored && !!storageKey && !submitting && (!!pending || (services.length >= 2 && !!left && !!right && left !== right && text.length >= 8 && text.length <= max));

  function change(run: (value: string) => void) {
    return (value: string) => {
      run(value);
      setError("");
    };
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || submitting) return;
    const request: Pending = pending || { key: createRequestKey(), serviceKeys: [left, right], question: text };
    try { sessionStorage.setItem(storageKey, JSON.stringify(request)); }
    catch { setError("浏览器无法保存发起记录，请允许会话存储后重试。"); return; }
    setPending(request);
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/evaluation/unified/comparisons", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": request.key },
        body: JSON.stringify({ serviceKeys: request.serviceKeys, question: request.question }),
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

  return <main className="eval-page">
    <div className="eval-inner">
      <section className="eval-intro">
        <h1>对比两个服务</h1>
        <p>同一道题分别提交给两个服务，并排查看回答和评分。</p>
      </section>
      {pending && <InlineAlert tone="warning">上次请求结果尚未确认。重试会使用原题目、服务和请求标识；请先查看运行记录，再决定是否放弃该请求。</InlineAlert>}
      {loading ? <p className="eval-hint">正在读取可用服务…</p> : services.length < 2 && !pending ? <InlineAlert tone="danger">至少需要两个已接入的服务才能对比，请先确认服务配置和运行写入开关。</InlineAlert> : (
        <form className="eval-composer" onSubmit={submit}>
          <div className={styles.createFields}>
            <Select disabled={!!pending || submitting} block label="服务 A" value={left} options={services.map((item) => ({ value: item.key, label: item.label }))} onChange={change(setLeft)} />
            <Select disabled={!!pending || submitting} block label="服务 B" value={right} options={services.map((item) => ({ value: item.key, label: item.label }))} onChange={change(setRight)} />
          </div>
          <Textarea
            disabled={!!pending || submitting}
            label="题目"
            value={question}
            maxLength={max}
            hint={`8–${max} 个字符；两条运行使用同一份题面。`}
            placeholder="输入同一道题…"
            onChange={(event) => { setQuestion(event.target.value); setError(""); }}
          />
          <div className={styles.createBar}>
            <p className={styles.createNote}>两条运行共用同一份评分规则，分别独立评分。</p>
            <div className={styles.createActions}>
              <Button type="button" variant="secondary" disabled={submitting} onClick={() => router.push("/runs")}>取消</Button>
              {pending && <Button type="button" variant="secondary" disabled={submitting} onClick={() => { if (window.confirm("请确认已查看运行记录。放弃后重新发起可能产生重复运行，是否继续？")) { sessionStorage.removeItem(storageKey); setPending(null); setError(""); } }}>已核对，放弃原请求</Button>}
              <Button type="submit" variant="primary" loading={submitting} disabled={!valid}>{pending ? "重试原请求" : "开始对比"}</Button>
            </div>
          </div>
        </form>
      )}
      {error && <InlineAlert tone="danger" className="eval-alert" action={<Button href="/runs" target="_blank" rel="noopener noreferrer" variant="secondary" size="sm">查看运行记录</Button>}>{error}</InlineAlert>}
    </div>
  </main>;
}
