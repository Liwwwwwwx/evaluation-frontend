"use client";

import { useState } from "react";
import { Button, ConfirmDialog, InlineAlert } from "@/components/ui";
import { createRequestKey } from "@/lib/request-key";

export function EndRunButton({ runId, onEnded }: { runId: string; onEnded?: () => void }) {
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function end() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/evaluation/unified/runs/${encodeURIComponent(runId)}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": createRequestKey() },
        body: "{}",
      });
      const value = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof value.error === "string" ? value.error : value.error?.message || `结束失败（${response.status}）`);
      setOpen(false);
      window.dispatchEvent(new Event("evaluation-unified-change"));
      onEnded?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "无法结束本次测评。");
    } finally { setBusy(false); }
  }
  return <>
    <Button type="button" variant="secondary" size="sm" onClick={() => { setError(""); setOpen(true); }}>结束测评</Button>
    <ConfirmDialog open={open} onClose={() => { if (!busy) setOpen(false); }} onConfirm={() => void end()} title="结束本次测评？" description="平台会停止接收后续输出，并保留已经产生的正文。" hint="结束后不能恢复本次运行；远端服务可能仍在运行" danger busy={busy} confirmLabel={busy ? "正在结束…" : "结束测评"}>
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
    </ConfirmDialog>
  </>;
}
