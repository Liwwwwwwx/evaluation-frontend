"use client";

import { useEffect, useRef, useState } from "react";

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const field = document.createElement("textarea");
  field.value = value; field.readOnly = true;
  field.style.position = "fixed"; field.style.opacity = "0";
  document.body.appendChild(field);
  try { field.select(); if (!document.execCommand("copy")) throw new Error("copy unavailable"); }
  finally { field.remove(); previous?.focus(); }
}

export function RunCopyButton({ label, getText }: { label: "提问" | "回答"; getText: () => string }) {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  async function copy() {
    if (timer.current) clearTimeout(timer.current);
    try {
      const value = getText();
      if (!value.trim()) { setMessage(`暂无可复制的${label}`); return; }
      await copyText(value);
      setMessage("已复制");
      timer.current = setTimeout(() => setMessage(""), 2000);
    } catch { setMessage("复制失败，请手动选择文本"); }
  }
  return <span className="run-copy-control">
    <button type="button" className="run-copy-button" aria-label={`复制${label}`} onClick={() => void copy()}>
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5h10" /></svg>
      <span>复制{label}</span>
    </button>
    <span className="run-copy-feedback" role="status">{message}</span>
  </span>;
}
