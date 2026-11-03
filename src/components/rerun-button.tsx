"use client";

import { useState } from "react";
import { Button, ConfirmDialog, InlineAlert } from "@/components/ui";
import { requestRerun } from "@/lib/rerun-request";

export function RerunButton({ runId, allowed, preservesOutput, onCreated }: { runId: string; allowed?: boolean; preservesOutput: boolean; onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    if (busy) return;
    setBusy(true); setError("");
    try { const id = await requestRerun(runId); setOpen(false); onCreated(id); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "无法确认提交结果，请使用原请求重试。"); }
    finally { setBusy(false); }
  }
  if (!allowed) return null;
  return <>
    <Button type="button" variant="primary" size="sm" onClick={() => setOpen(true)}>重新测评</Button>
    <ConfirmDialog open={open} onClose={() => { if (!busy) setOpen(false); }} onConfirm={() => void submit()} title={preservesOutput ? "重新测评？" : "清除旧输出并重新测评？"} description={preservesOutput ? "将使用相同题目、服务和规则创建新一轮测评，原记录和评分会保留。" : "将使用相同题目、服务和规则重新执行；本次保存的回答、成果索引和评分会被清除。"} hint={preservesOutput ? "重新执行会调用被测服务。" : "旧输出清除后无法恢复；重新执行会调用被测服务。"} danger={!preservesOutput} busy={busy} confirmLabel={busy ? "正在提交…" : preservesOutput ? "重新测评" : "清除并重新测评"}>
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
    </ConfirmDialog>
  </>;
}
