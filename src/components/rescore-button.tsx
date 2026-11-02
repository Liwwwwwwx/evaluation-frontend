"use client";
import { createRequestKey } from "@/lib/request-key";
import { useId, useRef, useState } from "react";
export function RescoreButton({ runId, allowed, revision, onRefresh }: { runId: string; allowed?: boolean; revision: string; onRefresh: () => void }) {
  const hintId = useId();
  const key = useRef<string | null>(null); const [busy, setBusy] = useState(false); const [accepted, setAccepted] = useState<string | null>(null); const [error, setError] = useState("");
  if (!allowed && !busy && accepted === null) return null;
  async function rescore() {
    if (busy || !allowed || accepted === revision) return;
    setBusy(true); setError(""); key.current ||= createRequestKey();
    try {
      const response = await fetch(`/api/evaluation/unified/runs/${encodeURIComponent(runId)}/score`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key.current }, body: "{}" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : data.error?.message || "无法发起重评，请重试。");
      setAccepted(revision); key.current = null; onRefresh();
    } catch (error) { setError(error instanceof Error ? error.message : "结果未知，请用原请求重试。"); }
    finally { setBusy(false); }
  }
  return <div className="score-rescore">
    <button type="button" className="score-rescore-button" title="使用已保存的答案，不重新运行服务" aria-describedby={hintId} disabled={busy || !allowed || accepted === revision} onClick={() => void rescore()}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 17.9 17" /></svg>
      <span>{busy ? "正在提交…" : accepted === revision ? "已提交重评" : "重新评分"}</span>
    </button>
    <span id={hintId} className="sr-only">使用已保存的答案，不重新运行服务。</span>
    {error && <p role="alert" className="run-score-note score-rescore-error">{error}</p>}
  </div>;
}
