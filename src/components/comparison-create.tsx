"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, InlineAlert, Select, Textarea } from "@/components/ui";
import { comparisonErrorMessage } from "@/lib/comparison-api";
import { availableEvaluationServices, type EvaluationService } from "@/lib/evaluation-services";
import { createRequestKey } from "@/lib/request-key";
import styles from "./run-comparison.module.css";

function maxFor(serviceKey: string) {
  return serviceKey === "synthesis" ? 200 : 500;
}

export function ComparisonCreate() {
  const router = useRouter();
  const [services, setServices] = useState<EvaluationService[]>([]);
  const [left, setLeft] = useState("mission-material");
  const [right, setRight] = useState("alpha-rsi");
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const requestKey = useRef("");

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
    if (right && right === left) setRight(services.find((item) => item.key !== left)?.key || "");
  }, [left, right, services]);

  const max = Math.min(...[left, right].filter(Boolean).map(maxFor), 500);
  const text = question.trim();
  const valid = services.length >= 2 && !!left && !!right && left !== right && text.length >= 8 && text.length <= max && !submitting;

  function change(run: (value: string) => void) {
    return (value: string) => {
      run(value);
      requestKey.current = "";
      setError("");
    };
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || submitting) return;
    if (!requestKey.current) requestKey.current = createRequestKey();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/evaluation/unified/comparisons", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": requestKey.current },
        body: JSON.stringify({ serviceKeys: [left, right], question: text }),
      });
      const value = await response.json().catch(() => null);
      if (!response.ok) throw new Error(comparisonErrorMessage(value, response.status));
      if (!value || typeof value.groupId !== "string") throw new Error("对比组返回格式异常。");
      requestKey.current = "";
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
      {loading ? <p className="eval-hint">正在读取可用服务…</p> : services.length < 2 ? <InlineAlert tone="danger">至少需要两个已接入的服务才能对比，请先确认服务配置和运行写入开关。</InlineAlert> : (
        <form className="eval-composer" onSubmit={submit}>
          <div className={styles.createFields}>
            <Select block label="服务 A" value={left} options={services.map((item) => ({ value: item.key, label: item.label }))} onChange={change(setLeft)} />
            <Select block label="服务 B" value={right} options={services.map((item) => ({ value: item.key, label: item.label }))} onChange={change(setRight)} />
          </div>
          <Textarea
            label="题目"
            value={question}
            maxLength={max}
            hint={`8–${max} 个字符；两条运行使用同一份题面。`}
            placeholder="输入同一道题…"
            onChange={(event) => { setQuestion(event.target.value); requestKey.current = ""; setError(""); }}
          />
          <div className={styles.createBar}>
            <p className={styles.createNote}>两条运行共用同一份评分规则，分别独立评分。</p>
            <div className={styles.createActions}>
              <Button type="button" variant="secondary" disabled={submitting} onClick={() => router.push("/runs")}>取消</Button>
              <Button type="submit" variant="primary" loading={submitting} disabled={!valid}>开始对比</Button>
            </div>
          </div>
        </form>
      )}
      {error && <InlineAlert tone="danger" className="eval-alert" action={<Button href="/runs" target="_blank" rel="noopener noreferrer" variant="secondary" size="sm">查看运行记录</Button>}>{error}</InlineAlert>}
    </div>
  </main>;
}
