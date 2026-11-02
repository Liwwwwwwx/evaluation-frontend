"use client";

import { useEffect, useState } from "react";
import { Button, Dialog, Pagination } from "@/components/ui";
import { questionDomains } from "@/lib/question-domains";
import styles from "./standards-assistant.module.css";

type Question = { id: string; datasetVersion: string; question: string; domainKey: string | null; sourceType: string };
const pageSize = 20;
export function StandardsQuestionPicker({ open, onClose, onSelect }: { open: boolean; onClose: () => void; onSelect: (question: string) => void }) {
  const [input, setInput] = useState(""); const [search, setSearch] = useState("");
  const [source, setSource] = useState(""); const [page, setPage] = useState(1);
  const [items, setItems] = useState<Question[]>([]); const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [attempt, setAttempt] = useState(0);
  useEffect(() => { const timer = setTimeout(() => { setSearch(input.trim()); setPage(1); }, 250); return () => clearTimeout(timer); }, [input]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ status: "active", limit: String(pageSize), offset: String((page - 1) * pageSize) });
    if (source) params.set("source", source); if (search) params.set("search", search);
    const timer = setTimeout(() => {
      setLoading(true); setError(""); setItems([]);
      void fetch(`/api/question-bank/questions?${params}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : data.error?.message || "题库读取失败，请重试。");
        if (!Array.isArray(data.items) || typeof data.total !== "number" || data.items.some((item: Question) => typeof item.id !== "string" || typeof item.datasetVersion !== "string" || typeof item.question !== "string")) throw new Error("题库返回格式异常。");
        if (!controller.signal.aborted) { setItems(data.items); setTotal(data.total); }
      }).catch(reason => { if (!controller.signal.aborted) { setError(reason instanceof Error ? reason.message : "题库读取失败，请重试。"); setItems([]); setTotal(0); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, search, source, page, attempt]);
  return <Dialog open={open} onClose={onClose} title="从题库选择" description="选择一道题后直接生成评判标准。">
    <div className={styles.picker}>
      <div className={styles.filters}>
        <label>搜索题目<input type="search" value={input} maxLength={500} onChange={event => setInput(event.target.value)} placeholder="输入题目关键词" /></label>
        <label>题目类型<select value={source} onChange={event => { setSource(event.target.value); setPage(1); }}><option value="">全部题目</option><option value="fixed">固定题</option><option value="random">随机题</option></select></label>
      </div>
      <div className={styles.questionList} aria-live="polite">
        {loading ? <p>正在读取题库…</p> : error ? <div role="alert"><p>{error}</p><Button variant="secondary" onClick={() => setAttempt(value => value + 1)}>重试</Button></div> : items.length ? items.map(item => <button type="button" className={styles.questionRow} key={`${item.id}:${item.datasetVersion}`} onClick={() => onSelect(item.question)}><span>{item.question}</span><small>{questionDomains[item.domainKey || ""] || "未分类"} · {item.sourceType === "fixed" ? "固定题" : item.sourceType === "random" ? "随机题" : "题目"} · 选择并生成</small></button>) : <p>没有找到符合条件的题目。</p>}
      </div>
      <Pagination page={page} pages={Math.max(1, Math.ceil(total / pageSize))} total={total} pageSize={pageSize} disabled={loading} onPageChange={setPage} />
    </div>
  </Dialog>;
}
