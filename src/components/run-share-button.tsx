"use client";

import { useState } from "react";
import { Button, Dialog, Input, InlineAlert } from "@/components/ui";
import { copyText } from "@/lib/clipboard";
import { createRequestKey } from "@/lib/request-key";

type Share = { id: string; path: string; expiresAt: string };
const time = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short", hour12: false });

export function RunShareButton({ runId }: { runId: string }) {
  const [open, setOpen] = useState(false);
  const [share, setShare] = useState<Share | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const link = share ? new URL(share.path, window.location.origin).href : "";

  async function request(action?: "create" | "revoke") {
    if (busy) return;
    setBusy(true);
    setNotice("");
    setError("");
    try {
      const response = await fetch(`/api/evaluation/unified/runs/${encodeURIComponent(runId)}/share`, {
        cache: "no-store", signal: AbortSignal.timeout(15000),
        ...(action ? {
          method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": createRequestKey() },
          body: JSON.stringify(action === "revoke" ? { action, shareId: share?.id } : { action }),
        } : {}),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : data?.error?.message || "无法读取分享状态，请重试。");
      const next = data?.share as Share | null | undefined;
      if (next !== null && (typeof next?.id !== "string" || !/^[a-f0-9-]{36}$/i.test(next.id)
        || next.path !== `/shared/runs/${next.id}` || !Number.isFinite(Date.parse(next.expiresAt)))) throw new Error("分享链接格式异常，请重试。");
      setShare(next);
      setLoaded(true);
      if (action === "revoke") setNotice(next ? "旧链接已失效，当前存在更新的分享链接。" : "分享链接已撤销。");
      if (action === "create") setNotice("分享链接已生成。");
    } catch (cause) {
      setError(cause instanceof Error && cause.name !== "TimeoutError" ? cause.message : "分享操作暂未确认，请重新打开弹窗核对。");
    } finally { setBusy(false); }
  }

  async function copy() {
    try { await copyText(link); setNotice("链接已复制。"); }
    catch { setNotice("复制失败，可以手动选中链接复制。"); }
  }

  return <>
    <Button variant="secondary" onClick={() => { setOpen(true); setLoaded(false); setShare(null); void request(); }}>分享</Button>
    <Dialog open={open} onClose={() => setOpen(false)} title="分享评测结果"
      description="有测评查看权限的团队成员登录后，可以查看这条运行的题目、回答和评分摘要。"
      busy={busy}
      footer={loaded ? share ? <>
        <Button variant="secondary" disabled={busy} onClick={() => void request("revoke")}>撤销链接</Button>
        <Button disabled={busy} onClick={() => void copy()}>复制链接</Button>
      </> : <Button loading={busy} onClick={() => void request("create")}>生成链接</Button>
        : error && <Button variant="secondary" onClick={() => void request()}>重试</Button>}>
      {share && <Input label="团队分享链接" readOnly value={link} hint={`有效至 ${time.format(new Date(share.expiresAt))}（北京时间）`} onFocus={event => event.target.select()} />}
      {!loaded && busy && <p role="status" className="run-score-note">正在读取分享状态…</p>}
      {loaded && !share && !notice && <p className="run-score-note">生成的链接有效期为 30 天，可以随时撤销。</p>}
      {notice && <p role="status" className="run-score-note">{notice}</p>}
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
    </Dialog>
  </>;
}
