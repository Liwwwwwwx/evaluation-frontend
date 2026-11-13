"use client";

import { useEffect, useState } from "react";
import { Button, Dialog, Pagination, Select } from "@/components/ui";
import { questionDomains } from "@/lib/question-domains";
import styles from "./standards-assistant.module.css";

export type Question = { id: string; datasetVersion: string; question: string; domainKey: string | null; sourceType: string; serviceKey?: string | null; layer?: string; status?: string; criteria?: unknown; testSet?: string | null; applicableServices?: string[] | null };
const pageSize = 20;
export function StandardsQuestionPicker({ open, onClose, onSelect, description = "选择一道题后直接生成测评标准。", comparison }: { open: boolean; onClose: () => void; onSelect: (question: Question) => void; description?: string; comparison?: { left: string; right: string; max: number } }) {
  const [input, setInput] = useState(""); const [search, setSearch] = useState("");
  const [source, setSource] = useState(""); const [page, setPage] = useState(1);
  const [testSets, setTestSets] = useState<{ name: string; count: number }[]>([]); const [testSet, setTestSet] = useState("");
  const [domain, setDomain] = useState("");
  const [items, setItems] = useState<Question[]>([]); const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [attempt, setAttempt] = useState(0);
  const comparisonLeft = comparison?.left; const comparisonRight = comparison?.right; const comparisonMax = comparison?.max;
  useEffect(() => { const timer = setTimeout(() => { setSearch(input.trim()); setPage(1); }, 250); return () => clearTimeout(timer); }, [input]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void fetch("/api/question-bank/test-sets", { signal: controller.signal, cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!Array.isArray(data.items)) throw new Error();
      if (!controller.signal.aborted) setTestSets(data.items.filter((item: { name?: unknown; count?: unknown }) => typeof item?.name === "string" && typeof item?.count === "number"));
    }).catch(() => { if (!controller.signal.aborted) setTestSets([]); });
    return () => controller.abort();
  }, [open, attempt]);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ status: "active", limit: String(pageSize), offset: String((page - 1) * pageSize) });
    if (comparisonLeft && comparisonRight && comparisonMax) { params.set("runnableFor", comparisonLeft); params.set("comparisonWith", comparisonRight); params.set("maxLength", String(comparisonMax)); }
    if (source) params.set("source", source); if (domain) params.set("domain", domain); if (source !== "random" && testSet) params.set("testSet", testSet); if (search) params.set("search", search);
    const timer = setTimeout(() => {
      setLoading(true); setError(""); setItems([]);
      void fetch(`/api/question-bank/questions?${params}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : data.error?.message || "题库读取失败，请重试。");
        if (comparisonLeft && data.comparisonFiltered !== true) throw new Error("对比选题接口尚未更新，请重启本地后端后重试。");
        if (!Array.isArray(data.items) || typeof data.total !== "number" || data.items.some((item: Question) => typeof item.id !== "string" || typeof item.datasetVersion !== "string" || typeof item.question !== "string")) throw new Error("题库返回格式异常。");
        if (!controller.signal.aborted) { setItems(data.items); setTotal(data.total); }
      }).catch(reason => { if (!controller.signal.aborted) { setError(reason instanceof Error ? reason.message : "题库读取失败，请重试。"); setItems([]); setTotal(0); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, search, source, domain, testSet, page, attempt, comparisonLeft, comparisonRight, comparisonMax]);
  return <Dialog open={open} onClose={onClose} title="从题库选择" description={description}>
    <div className={styles.picker}>
      <div className={styles.filters}>
        <label>搜索题目<input type="search" value={input} maxLength={500} onChange={event => setInput(event.target.value)} placeholder="输入题目关键词" /></label>
        <div className={styles.filterField}>
          <span>题目类型</span>
          <Select block hideLabel label="题目类型" value={source} options={[{ value: "", label: "全部题目" }, { value: "fixed", label: "固定题" }, { value: "random", label: "随机题" }]} onChange={(value) => { setSource(value); if (value === "random") setTestSet(""); setPage(1); }} />
        </div>
        <div className={styles.filterField}>
          <span>领域</span>
          <Select block hideLabel label="领域" value={domain} options={[{ value: "", label: "全部领域" }, ...Object.entries(questionDomains).map(([value, label]) => ({ value, label }))]} onChange={(value) => { setDomain(value); setPage(1); }} />
        </div>
        {source !== "random" && <div className={styles.filterField}>
          <span>测试集</span>
          <Select block hideLabel label="测试集" value={testSet} options={[{ value: "", label: testSets.length ? `全部测试集（${testSets.length}）` : "暂无测试集" }, ...testSets.map(set => ({ value: set.name, label: `${set.name}（${set.count}）` }))]} onChange={(value) => { setTestSet(value); setPage(1); }} />
        </div>}
      </div>
      <div className={styles.questionList} aria-live="polite">
        {loading ? <p>正在读取题库…</p> : error ? <div role="alert"><p>{error}</p><Button variant="secondary" onClick={() => setAttempt(value => value + 1)}>重试</Button></div> : items.length ? items.map(item => { const applicable = Array.isArray(item.applicableServices) ? item.applicableServices : []; const crossUsable = item.serviceKey == null || (applicable.includes(comparison?.left || "") && applicable.includes(comparison?.right || "")); const unavailable = !!comparison && (!crossUsable || item.layer !== "base" || item.status !== "active" || item.criteria != null || !["fixed", "random"].includes(item.sourceType) || item.question.trim().length < 8 || item.question.trim().length > comparison.max); return <button type="button" className={styles.questionRow} key={`${item.id}:${item.datasetVersion}`} disabled={unavailable} onClick={() => onSelect(item)}><span>{item.question}</span><small>{item.testSet ? `${item.testSet} · ` : ""}{questionDomains[item.domainKey || ""] || "未分类"} · {item.sourceType === "fixed" ? "固定题" : item.sourceType === "random" ? "随机题" : "题目"} · {unavailable ? "不符合本次对比条件" : "选择"}</small></button>; }) : <p>没有找到符合条件的题目。</p>}
      </div>
      <Pagination page={page} pages={Math.max(1, Math.ceil(total / pageSize))} total={total} pageSize={pageSize} disabled={loading} onPageChange={setPage} />
    </div>
  </Dialog>;
}
