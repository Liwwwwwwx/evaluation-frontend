"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { type ScoreSummaryValue } from "@/components/score-summary";
import { useRouter } from "next/navigation";
import { Button, Checkbox, ConfirmDialog, Dialog, EmptyState, InlineAlert, Input, Pagination, Select, Tabs, Textarea, ToastStack, useToasts, tabButtonId, tabPanelId } from "@/components/ui";
import { questionDomains as domains } from "@/lib/question-domains";
import { parseXlsxFirstSheet } from "@/lib/xlsx-parser";

type Question = { id: string; question: string; domainKey?: string | null; serviceKey: string | null; criteria?: unknown; sourceType: string; datasetVersion: string; createdAt?: string | null };
type QuestionScoreRow = { questionId: string; datasetVersion: string; runId: string; serviceKey: string; startedAt?: string; scores: ScoreSummaryValue };
type Draft = { domainKey: string; question: string };
type RowMenu = { row: Question; top: number; left: number; trigger: HTMLButtonElement };
type IconName = "search" | "close" | "trash" | "copy" | "chevron" | "more";


const pageSize = 20;
const rowKey = (row: Question) => `${row.id}|${row.datasetVersion}`;

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    trash: <><path d="M4 7h16M9 7V5h6v2M6.5 7l.9 13h9.2l.9-13" /><path d="M10.5 11v5.5M13.5 11v5.5" /></>,
    copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" /></>,
    chevron: <path d="m6 9 6 6 6-6" />,
    more: <><circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
function getMessage(error: unknown) { return error instanceof Error ? error.message : "请求失败，请稍后重试。"; }
async function jsonRequest(url: string, options?: RequestInit) {
  const response = await fetch(url, { ...options, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(typeof data.error === "string" ? data.error : typeof data.error?.message === "string" ? data.error.message : response.status === 403 ? "没有操作权限，请联系管理员。" : `请求失败（${response.status}）`);
  return data;
}
function canWrite(permissions: unknown) {
  if (Array.isArray(permissions)) return permissions.includes("team-services:write") || permissions.includes("teamServices:manage");
  if (permissions && typeof permissions === "object") { const p = permissions as Record<string, unknown>; return p["team-services:write"] === true || p["teamServices:manage"] === true; }
  return false;
}
function validate(items: Draft[]) {
  if (!items.length || items.length > 100) return "一次需要导入 1–100 条题目。";
  const seen = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    const item = items[i]; const max = 500;
    if (!Object.hasOwn(domains, item.domainKey)) return `第 ${i + 1} 条领域无效。`;
    if (item.question.trim().length < 8 || item.question.trim().length > max) return `第 ${i + 1} 条题目需要 8–${max} 个字符。`;
    const key = `${item.domainKey}\n${item.question.trim()}`;
    if (seen.has(key)) return `第 ${i + 1} 条与本次导入中的题目重复。`;
    seen.add(key);
  }
  return "";
}
function domainLabel(row: Question) { return domains[row.domainKey || ""] || "未分类"; }
function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const serviceNames: Record<string, string> = { "mission-material": "Mission 主服务", literature: "文献检索", "literature-aircraft": "航空文献", alloy: "合金材料", synthesis: "合成制备", "new-material": "新材料" };
const shortServiceNames: Record<string, string> = { "mission-material": "Mission", literature: "文献", "literature-aircraft": "航空", alloy: "合金", synthesis: "合成", "new-material": "新材料" };
const scoreStateNames: Record<string, string> = { pending: "评分中", failed: "评分失败", unavailable: "未配置", absent: "无评分", skipped: "不适用" };
const taskStateNames: Record<string, string> = { partial: "部分完成", failed: "未完成", unclear: "无法确认" };

function scoreText(item: ScoreSummaryValue[string] | undefined) {
  if (!item) return "—";
  if (item.status === "ready") return typeof item.total === "number" && Number.isFinite(item.total) && item.total >= 0 && item.total <= 100 ? `${item.total}${item.provisional ? "*" : ""}` : "数据异常";
  return scoreStateNames[item.status || ""] || (item.status ? "状态未知" : "未评分");
}

function scoreDetail(item: ScoreSummaryValue[string] | undefined) {
  if (!item) return "无评分";
  if (item.status === "ready" && typeof item.total === "number" && Number.isFinite(item.total) && item.total >= 0 && item.total <= 100) return `${item.total} / 100${item.provisional ? "（参考）" : ""}`;
  return scoreText(item);
}

function taskText(row: QuestionScoreRow) {
  const statuses = [row.scores.deepSeekScore?.taskStatus, row.scores.qwenScore?.taskStatus].filter(Boolean);
  for (const key of ["failed", "partial", "unclear"]) if (statuses.includes(key)) return taskStateNames[key];
  return "";
}

function ScoreLine({ row }: { row: QuestionScoreRow }) {
  const deepSeek = row.scores.deepSeekScore;
  const qwen = row.scores.qwenScore;
  const items = [deepSeek, qwen].filter(Boolean);
  const summary = !items.length ? "未评分"
    : items.every((item) => item.status === "skipped") ? "不适用"
      : items.every((item) => item.status === "pending") ? "评分中"
        : `DS ${scoreText(deepSeek)} · QW ${scoreText(qwen)}`;
  const task = taskText(row);
  const service = serviceNames[row.serviceKey] || row.serviceKey;
  const full = `${service} · DeepSeek ${scoreDetail(deepSeek)} · 千问 ${scoreDetail(qwen)}${task ? ` · ${task}` : ""}`;
  return <Link className="score-bank-line" href={`/runs/${row.runId}`} title={full}>
    <span className="score-bank-service">{shortServiceNames[row.serviceKey] || service}</span>
    <span className="score-bank-values">{summary}</span>
    {task && <span className="score-bank-task">{task}</span>}
  </Link>;
}

function QuestionScores({ rows, state }: { rows: QuestionScoreRow[]; state: string }) {
  if (state !== "ready") return <span className="run-score-note">{state === "failed" ? "评分读取失败" : "读取中…"}</span>;
  if (!rows.length) return <span className="run-score-note">未评分</span>;
  const ordered = [...rows].sort((a,b) => (Date.parse(b.startedAt || "") || 0) - (Date.parse(a.startedAt || "") || 0) || b.runId.localeCompare(a.runId));
  return <div className="score-bank-cell">
    <ScoreLine row={ordered[0]} />
    {ordered.length > 1 && <details className="score-bank-more">
      <summary>+{ordered.length - 1}</summary>
      <div className="score-bank-more-list">{ordered.slice(1).map((row) => <ScoreLine key={row.runId} row={row} />)}</div>
    </details>}
  </div>;
}

export function QuestionBank() {
  const router = useRouter();
  const [scoreRows, setScoreRows] = useState<QuestionScoreRow[]>([]);
  const [scoresState, setScoresState] = useState("loading");
  const [quickBusy, setQuickBusy] = useState(false);
  const [rows, setRows] = useState<Question[]>([]); const [total, setTotal] = useState(0);
  const [source, setSource] = useState<"fixed" | "random">("fixed"); const [service, setService] = useState("");
  const [input, setInput] = useState(""); const [search, setSearch] = useState(""); const [page, setPage] = useState(0); const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const [write, setWrite] = useState(false); const [permissionReady, setPermissionReady] = useState(false); const [permissionError, setPermissionError] = useState("");
  const [selected, setSelected] = useState<Record<string, Question>>({});
  const [detail, setDetail] = useState<Question | null>(null);
  const [detailDomain, setDetailDomain] = useState(""); const [domainBusy, setDomainBusy] = useState(false);
  const [editMode, setEditMode] = useState(false); const [editText, setEditText] = useState(""); const [editBusy, setEditBusy] = useState(false); const [editError, setEditError] = useState("");
  const [focus, setFocus] = useState("general"); const [topic, setTopic] = useState(""); const [generateCount, setGenerateCount] = useState(3); const [generating, setGenerating] = useState(false);
  const [confirmRows, setConfirmRows] = useState<Question[]>([]); const [deleting, setDeleting] = useState<{ done: number; total: number } | null>(null); const [deleteError, setDeleteError] = useState("");
  const { toasts, push: pushToast, dismiss: dismissToast } = useToasts();
  function toast(kind: "success" | "error", text: string) { pushToast(kind, text); }
  const [drafts, setDrafts] = useState<Draft[]>([]); const [draftDomain, setDraftDomain] = useState("materials-rd"); const [draftQuestion, setDraftQuestion] = useState("");
  const [importMode, setImportMode] = useState<"manual" | "excel" | "generate">("manual");
  const [importTarget, setImportTarget] = useState<"fixed" | "random">("fixed");
  const [importOpen, setImportOpen] = useState(false);
  const [importError, setImportError] = useState(""); const [importing, setImporting] = useState(false);
  const [rowMenu, setRowMenu] = useState<RowMenu | null>(null);
  const rowMenuRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);

  useEffect(() => { const controller = new AbortController(); jsonRequest("/api/question-bank/access", { signal: controller.signal }).then((data) => setWrite(canWrite(data.access?.permissions))).catch(() => { if (!controller.signal.aborted) { setWrite(false); setPermissionError("无法确认导入权限，请刷新页面重试。"); } }).finally(() => { if (!controller.signal.aborted) setPermissionReady(true); }); return () => controller.abort(); }, []);

  const load = useCallback(async () => {
    const request = ++requestId.current; setLoading(true); setError("");
    const params = new URLSearchParams({ source, status: "active", limit: String(pageSize), offset: String(page * pageSize) });
    if (service) params.set("domain", service); if (search) params.set("search", search);
    try { const data = await jsonRequest(`/api/question-bank/questions?${params}`); if (request !== requestId.current) return; if (!Array.isArray(data.items) || typeof data.total !== "number") throw new Error("题库数据格式异常，请稍后重试。"); setRows(data.items); setScoreRows([]); setScoresState("loading"); setTotal(data.total); }
    catch (err) { if (request === requestId.current) { setError(getMessage(err)); setRows([]); setTotal(0); } }
    finally { if (request === requestId.current) setLoading(false); }
  }, [source, service, search, page]);
  useEffect(() => { if (!permissionReady) return; const activeRequest = requestId; const timeout = setTimeout(() => void load(), 0); return () => { clearTimeout(timeout); activeRequest.current++; }; }, [load, permissionReady, tick]);
  useEffect(() => { setSelected({}); }, [source, service, search, page]);

  useEffect(() => {
    const controller = new AbortController();
    if (!rows.length) return () => controller.abort();
    const items = rows.map(row => ({ id: row.id, datasetVersion: row.datasetVersion }));
    const query = new URLSearchParams({ items: JSON.stringify(items) });
    jsonRequest(`/api/evaluation/unified/question-scores?${query}`, { signal: controller.signal }).then(data => { if (!Array.isArray(data.items)) throw new Error("格式错误"); setScoreRows(data.items); setScoresState("ready"); }).catch(() => { if (!controller.signal.aborted) { setScoreRows([]); setScoresState("failed"); } });
    return () => controller.abort();
  }, [rows]);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const canManage = write;
  const selectedRows = Object.values(selected);
  const allSelected = rows.length > 0 && rows.every((row) => Object.hasOwn(selected, rowKey(row)));
  const someSelected = rows.some((row) => Object.hasOwn(selected, rowKey(row)));

  function openDetail(row: Question) {
    router.push(`/question-bank/${encodeURIComponent(row.id)}?datasetVersion=${encodeURIComponent(row.datasetVersion)}`);
  }
  function openRowMenu(event: ReactMouseEvent<HTMLButtonElement>, row: Question) {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const width = 180;
    setRowMenu({ row, top: Math.min(rect.bottom + 6, window.innerHeight - 180), left: Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width)), trigger: event.currentTarget });
  }
  function closeRowMenu(restoreFocus = false) {
    const trigger = rowMenu?.trigger;
    setRowMenu(null);
    if (restoreFocus) trigger?.focus();
  }
  function toggleRow(row: Question) { setSelected((current) => { const next = { ...current }; const key = rowKey(row); if (Object.hasOwn(next, key)) delete next[key]; else next[key] = row; return next; }); }
  function toggleAll() { setSelected((current) => { if (allSelected) { const next = { ...current }; rows.forEach((row) => delete next[rowKey(row)]); return next; } const next = { ...current }; rows.forEach((row) => { next[rowKey(row)] = row; }); return next; }); }
  function clearFilters() { setInput(""); setSearch(""); setService(""); setPage(0); }
  useEffect(() => { const timer = setTimeout(() => { setSearch(input.trim()); setPage(0); }, 250); return () => clearTimeout(timer); }, [input]);
  useEffect(() => {
    if (!rowMenu) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (rowMenuRef.current?.contains(target as Node) || target?.closest?.(".bank-row-more")) return;
      setRowMenu(null);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      const trigger = rowMenu.trigger;
      setRowMenu(null);
      trigger.focus();
    };
    const onScroll = () => setRowMenu(null);
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [rowMenu]);
  useEffect(() => {
    if (!rowMenu) return;
    const frame = requestAnimationFrame(() => rowMenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
    return () => cancelAnimationFrame(frame);
  }, [rowMenu]);

  function askDelete(target: Question[]) { if (!target.length) return; setDeleteError(""); setConfirmRows(target); }
  function shiftPage(removed: number) {
    const nextTotal = Math.max(0, total - removed);
    const lastPage = Math.max(0, Math.ceil(nextTotal / pageSize) - 1);
    if (page > lastPage) setPage(lastPage); else setTick((value) => value + 1);
  }
  async function submitDelete() {
    const target = confirmRows; if (!target.length || deleting) return;
    const failed: { row: Question; message: string }[] = [];
    setDeleting({ done: 0, total: target.length });
    for (let index = 0; index < target.length; index++) {
      try { await jsonRequest("/api/question-bank/delete", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: target[index].id, datasetVersion: target[index].datasetVersion }) }); }
      catch (err) { failed.push({ row: target[index], message: getMessage(err) }); }
      setDeleting({ done: index + 1, total: target.length });
    }
    const removedKeys = target.filter((row) => !failed.some((item) => rowKey(item.row) === rowKey(row))).map(rowKey);
    setSelected((current) => { const next = { ...current }; removedKeys.forEach((key) => delete next[key]); return next; });
    setDeleting(null);
    if (!failed.length) {
      setConfirmRows([]); setDetail(null);
      toast("success", `已删除 ${target.length} 道题目。`);
      shiftPage(target.length);
      return;
    }
    setDeleteError(`有 ${failed.length} 道题目未能删除：${failed[0].message}${failed.length > 1 ? " 请重试其余题目。" : ""}`);
    setConfirmRows(failed.map((item) => item.row));
    if (failed.length < target.length) { toast("success", `已删除 ${target.length - failed.length} 道题目。`); shiftPage(target.length - failed.length); }
  }

  async function prepareEvaluation(row: Question) {
    if (quickBusy || !["fixed", "random"].includes(row.sourceType)) return;
    if (sessionStorage.getItem("evaluation-unified-pending")) { toast("error", "上次提交结果尚未确认，请先返回测评页面处理。"); return; }
    setQuickBusy(true);
    try {
      const current = sessionStorage.getItem("evaluation-unified-run");
      if (current) {
        const run = await jsonRequest(`/api/evaluation/unified/runs/${encodeURIComponent(current)}`);
        if (!["done", "error"].includes(run.status)) throw new Error("当前测评尚未结束或状态未知，请先返回查看。");
      }
      sessionStorage.setItem("evaluation-selected-question", JSON.stringify(row));
      sessionStorage.removeItem("evaluation-unified-run");
      router.push("/evaluate");
    } catch (err) { toast("error", getMessage(err)); } finally { setQuickBusy(false); }
  }

  async function copyQuestion(text: string) {
    try { await navigator.clipboard.writeText(text); toast("success", "题目已复制到剪贴板。"); }
    catch { toast("error", "无法访问剪贴板，请手动选择文本复制。"); }
  }
  function generateStandards(row: Question) {
    try {
      sessionStorage.setItem("evaluation-standards-selected-question", JSON.stringify({ id: row.id, datasetVersion: row.datasetVersion, question: row.question, domainKey: row.domainKey || null, sourceType: row.sourceType }));
      router.push("/standards");
    } catch { toast("error", "无法带入题目，请在评判标准页面重新选择。"); }
  }

  function openImport(mode: "manual" | "excel" | "generate") { setImportTarget(source); setImportMode(mode); setDrafts([]); setDraftQuestion(""); setImportError(""); setImportOpen(true); }
  async function readFile(file: File) { setImportError(""); try { const items = await parseXlsxFirstSheet(file); const cleaned = items.map(item => ({ domainKey: Object.entries(domains).find(([key, label]) => key === item.domainKey.trim() || label === item.domainKey.trim())?.[0] || item.domainKey.trim(), question: item.question.trim() })); const problem = validate(cleaned); if (problem) throw new Error(problem); setDrafts(cleaned); } catch (err) { setDrafts([]); setImportError(getMessage(err)); } }
  function addDraft() { const next = [...drafts, { domainKey: draftDomain, question: draftQuestion.trim() }]; const problem = validate(next); if (problem) { setImportError(problem); return; } setDrafts(next); setDraftQuestion(""); setImportError(""); }
  async function generateDrafts() {
    if (generating || (focus === "custom" && !topic.trim())) return;
    setGenerating(true); setImportError(""); setDrafts([]);
    try {
      const data = await jsonRequest("/api/question-bank/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domainKey: draftDomain, focus, ...(focus === "custom" ? { topic: topic.trim() } : {}), count: generateCount }) });
      if (!Array.isArray(data.items)) throw new Error("生成结果格式异常");
      const problem = validate(data.items); if (problem) throw new Error(problem);
      setDrafts(data.items); if (data.items.length < generateCount) setImportError(`模型返回了 ${data.items.length} 道有效题目，少于所请求数量。`);
    } catch (err) { setImportError(getMessage(err)); } finally { setGenerating(false); }
  }
  async function saveDomain() {
    if (!detail || !detailDomain || domainBusy) return;
    setDomainBusy(true); setEditError("");
    try {
      const data = await jsonRequest("/api/question-bank/domain", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: detail.id, datasetVersion: detail.datasetVersion, domainKey: detailDomain }) });
      setDetail(data.question); setTick(value => value + 1); toast("success", "领域已更新。");
    } catch (err) { setEditError(getMessage(err)); } finally { setDomainBusy(false); }
  }
  async function saveEdit() {
    if (!detail || editBusy) return;
    const max = detail.serviceKey === "synthesis" ? 200 : 500; if (editText.trim().length < 8 || editText.trim().length > max) { setEditError(`题目需要 8–${max} 个字符。`); return; }
    setEditBusy(true); setEditError("");
    try { await jsonRequest("/api/question-bank/update", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: detail.id, datasetVersion: detail.datasetVersion, question: editText.trim() }) });
      setDetail(null); setEditMode(false); toast("success", "题目已更新，历史记录保留原版本。"); setTick(value => value + 1);
    } catch (err) { setEditError(getMessage(err)); } finally { setEditBusy(false); }
  }
  async function submitImport() { const problem = validate(drafts); if (problem) { setImportError(problem); return; } setImporting(true); setImportError(""); try { const data = await jsonRequest(importTarget === "random" ? "/api/question-bank/random-save" : "/api/question-bank/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: drafts }) }); if (!Array.isArray(data.items)) throw new Error("保存结果格式异常，请刷新列表核实，避免重复提交。"); setImportOpen(false); toast("success", importTarget === "random" ? `已保存 ${data.created} 道随机题，复用 ${data.reused} 道已有题目。` : `已导入 ${data.items.length} 道固定题。`); setSource(importTarget); setService(""); setInput(""); setSearch(""); if (page !== 0) setPage(0); else setTick((value) => value + 1); }
    catch (err) { setImportError(`${getMessage(err)} 若连接中断，请先刷新列表核实结果，避免重复导入。`); } finally { setImporting(false); } }

  return <section className="bank-page" aria-labelledby="bank-title">
    <div className="bank-heading">
      <div><h1 id="bank-title">题库</h1><p>固定题由团队维护，随机题可由 AI 生成。</p></div>
      {write && source === "fixed" && <Button variant="primary" onClick={() => openImport("manual")}>导入题目</Button>}
      {write && source === "random" && <Button variant="primary" onClick={() => openImport("generate")}>生成随机题</Button>}
    </div>

    <div className="bank-toolbar">
      <Tabs
        variant="underline"
        bordered={false}
        ariaLabel="题目类型"
        idBase="bank-source"
        value={source}
        onChange={(value) => { setSource(value as "fixed" | "random"); setPage(0); }}
        items={[{ value: "fixed", label: "固定题" }, { value: "random", label: "随机题" }]}
      />
      <div className="bank-filters">
        <div className="search-field">
          <Icon name="search" />
          <label><span className="sr-only">搜索题目</span><input value={input} onChange={event => setInput(event.target.value)} placeholder="搜索题目内容" /></label>
          {input && <button type="button" className="search-clear" aria-label="清除搜索" onClick={() => { setInput(""); setSearch(""); setPage(0); }}><Icon name="close" /></button>}
        </div>
        <Select
          variant="bare"
          hideLabel
          label="筛选领域"
          value={service}
          onChange={(value) => { setService(value); setPage(0); }}
          options={[{ value: "", label: "全部领域" }, { value: "unclassified", label: "未分类" }, ...Object.entries(domains).map(([key, label]) => ({ value: key, label }))]}
        />
      </div>
    </div>

    <div className="bank-source-panel" id={tabPanelId("bank-source", source)} role="tabpanel" aria-labelledby={tabButtonId("bank-source", source)}>
    {permissionError && <InlineAlert tone="danger">{permissionError}</InlineAlert>}

    {selectedRows.length > 0 && <div className="selection-bar" role="status">
      <span>已选 {selectedRows.length} 条</span>
      <div><button type="button" className="text-danger-button" onClick={() => askDelete(selectedRows)}>删除</button><Button type="button" variant="ghost" size="sm" onClick={() => setSelected({})}>取消选择</Button></div>
    </div>}

    {!permissionReady && <EmptyState state="loading" title="正在检查访问权限…" />}
    {permissionReady && loading && <EmptyState state="loading" title="正在加载题目…" />}
    {permissionReady && !loading && error && <EmptyState state="error" title={error} action={<Button variant="secondary" onClick={() => void load()}>重试</Button>} />}
    {permissionReady && !loading && !error && (rows.length > 0
      ? <div className="bank-table-wrap">
        <table className="bank-table">
          <colgroup>{canManage && <col className="col-check" />}<col /><col className="col-service" /><col className="col-time" /><col className="col-score" /><col className="col-action" /></colgroup>
          <thead><tr>
            {canManage && <th className="col-check"><Checkbox checked={allSelected} indeterminate={someSelected && !allSelected} onChange={toggleAll} aria-label="全选本页题目" /></th>}
            <th scope="col">题目</th>
            <th scope="col" className="col-service">领域</th>
            <th scope="col" className="col-time">更新时间</th>
            <th scope="col" className="col-score">评分（本版本最近运行）</th>
            <th scope="col" className="col-action"><span className="sr-only">操作</span></th>
          </tr></thead>
          <tbody>{rows.map((row) => {
            const key = rowKey(row); const checked = Object.hasOwn(selected, key);
            return <tr key={key} className={checked ? "selected" : ""}>
              {canManage && <td className="col-check"><Checkbox checked={checked} onChange={() => toggleRow(row)} aria-label={`选择题目：${row.question.slice(0, 24)}`} /></td>}
              <td className="col-question"><button type="button" className="row-question" title={row.question} onClick={() => openDetail(row)}>{row.question}</button></td>
              <td className="col-service">{domainLabel(row)}</td>
              <td className="col-time">{formatDate(row.createdAt)}</td>
              <td className="col-score"><QuestionScores rows={scoreRows.filter(v => v.questionId === row.id && v.datasetVersion === row.datasetVersion)} state={scoresState} /></td>
              <td className="col-action"><button type="button" className="icon-button bank-row-more" aria-label={`更多操作：${row.question.slice(0, 24)}`} aria-haspopup="menu" aria-expanded={rowMenu?.row === row} onClick={(event) => openRowMenu(event, row)}><Icon name="more" /></button></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      : <EmptyState
        state="empty"
        title={search || service ? "没有找到符合条件的题目。" : "题库还没有题目。"}
        action={search || service
          ? <Button variant="secondary" onClick={clearFilters}>清除筛选</Button>
          : write && (source === "fixed" ? <Button variant="primary" onClick={() => openImport("manual")}>导入题目</Button> : <Button variant="primary" onClick={() => openImport("generate")}>生成随机题</Button>)}
      />)}

    {permissionReady && !loading && !error && total > 0 && <Pagination page={page + 1} pages={pages} total={total} pageSize={pageSize} onPageChange={(next) => setPage(next - 1)} />}
    </div>

    <Dialog
      open={!!detail}
      onClose={() => setDetail(null)}
      title="题目详情"
      description={detail ? `${domainLabel(detail)} · ${detail.sourceType === "random" ? "随机题" : "固定题"}` : undefined}
      footerStart={detail ? <Button type="button" variant="secondary" onClick={() => void copyQuestion(detail.question)}><Icon name="copy" />复制题目</Button> : undefined}
      footer={detail ? <>
        {!editMode && <Button type="button" variant="secondary" onClick={() => generateStandards(detail)}>生成评判标准</Button>}
        {["fixed", "random"].includes(detail.sourceType) && !detail.criteria && (!detail.serviceKey || ["mission-material", "literature", "literature-aircraft", "alloy", "synthesis", "new-material"].includes(detail.serviceKey)) && !editMode && <Button type="button" variant="secondary" disabled={quickBusy} onClick={() => void prepareEvaluation(detail)}>{quickBusy ? "正在准备…" : "使用这道题测评"}</Button>}
        {canManage && (editMode ? <Button type="button" variant="primary" disabled={editBusy} onClick={() => void saveEdit()}>{editBusy ? "保存中…" : "保存修改"}</Button> : <Button type="button" variant="secondary" disabled={domainBusy} onClick={() => setEditMode(true)}>编辑</Button>)}
        {canManage && !editMode && <Button type="button" variant="danger" disabled={domainBusy} onClick={() => { setDetail(null); askDelete([detail]); }}>删除</Button>}
        <Button type="button" variant="secondary" onClick={() => setDetail(null)}>关闭</Button>
      </> : undefined}
    >
      {detail && <>
        {editMode ? <Textarea label="题目内容" value={editText} onChange={event => setEditText(event.target.value)} maxLength={500} disabled={editBusy} /> : <p className="detail-question">{detail.question}</p>}
        {editError && <InlineAlert tone="danger" className="form-alert">{editError}</InlineAlert>}
        {write && !editMode && <div className="import-fields">
          <Select block label="领域" value={detailDomain} onChange={setDetailDomain} disabled={domainBusy || editBusy} options={[{ value: "", label: "请选择领域" }, ...Object.entries(domains).map(([key, label]) => ({ value: key, label }))]} />
          <Button type="button" variant="secondary" disabled={!detailDomain || detailDomain === detail.domainKey || domainBusy} onClick={() => void saveDomain()}>{domainBusy ? "保存中…" : "保存领域"}</Button>
        </div>}
        <dl className="detail-meta">
          <div><dt>数据集版本</dt><dd>{detail.datasetVersion || "—"}</dd></div>
          <div><dt>创建时间</dt><dd>{formatDateTime(detail.createdAt)}</dd></div>
          <div className="detail-meta-wide"><dt>题目 ID</dt><dd className="mono">{detail.id}</dd></div>
        </dl>
      </>}
    </Dialog>

    <ConfirmDialog
      open={confirmRows.length > 0}
      onClose={() => { if (!deleting) { setConfirmRows([]); setDeleteError(""); } }}
      onConfirm={() => void submitDelete()}
      title={`删除 ${confirmRows.length} 道题目？`}
      description="删除后题目不再出现在题库，也不再参与评测。"
      hint="此操作无法通过本页面撤销"
      danger
      busy={!!deleting}
      confirmLabel={deleting ? `删除中 ${deleting.done}/${deleting.total}` : "删除"}
    >
      <ul className="delete-list">{confirmRows.slice(0, 5).map((row) => <li key={rowKey(row)}>{row.question}</li>)}{confirmRows.length > 5 && <li>另有 {confirmRows.length - 5} 道题目</li>}</ul>
      {deleteError && <InlineAlert tone="danger" className="form-alert">{deleteError}</InlineAlert>}
    </ConfirmDialog>

    <Dialog
      open={importOpen}
      onClose={() => setImportOpen(false)}
      title={importTarget === "random" ? "生成随机题" : "导入固定题"}
      description="先准备题目，确认预览后再保存到题库。"
      busy={importing}
      footer={<>
        <Button type="button" variant="secondary" disabled={importing} onClick={() => setImportOpen(false)}>取消</Button>
        <Button type="button" variant="primary" disabled={importing || generating || !drafts.length} onClick={() => void submitImport()}>{importing ? "保存中…" : `${importTarget === "random" ? "保存随机题" : "确认导入"}${drafts.length ? `（${drafts.length}）` : ""}`}</Button>
      </>}
    >
      {importTarget === "fixed" && <Tabs
        variant="underline"
        bordered={false}
        ariaLabel="导入方式"
        idBase="import-mode"
        value={importMode}
        onChange={(value) => setImportMode(value as "manual" | "excel" | "generate")}
        items={[
          { value: "manual", label: "手动添加", disabled: importing },
          { value: "excel", label: "导入 Excel", disabled: importing || generating },
          { value: "generate", label: "AI 生成", disabled: importing || generating },
        ]}
      />}
      <div id={tabPanelId("import-mode", importMode)} role="tabpanel" aria-labelledby={tabButtonId("import-mode", importMode)}>
        {importMode === "manual" ? <div className="import-fields">
          <p className="import-intro">选择领域并输入题目，可连续添加多条。</p>
          <Select block label="领域" value={draftDomain} onChange={setDraftDomain} disabled={importing} options={Object.entries(domains).map(([key, label]) => ({ value: key, label }))} />
          <Textarea label="题目" value={draftQuestion} onChange={event => setDraftQuestion(event.target.value)} maxLength={500} disabled={importing} placeholder="输入题目内容（至少 8 个字符）" />
          <Button type="button" variant="secondary" onClick={addDraft} disabled={importing || !draftQuestion.trim()}>添加到预览</Button>
        </div>
          : importMode === "generate" ? <div className="import-fields">
            <p className="import-intro">选择领域和出题方向即可生成，预览确认后保存到题库。</p>
            <Select block label="领域" value={draftDomain} onChange={setDraftDomain} disabled={generating} options={Object.entries(domains).map(([key, label]) => ({ value: key, label }))} />
            <Select block label="出题方向" value={focus} onChange={setFocus} disabled={generating || importing} options={[
              { value: "general", label: "综合出题（推荐）" },
              { value: "principles", label: "基础原理" },
              { value: "design", label: "方案设计" },
              { value: "comparison", label: "性能对比" },
              { value: "validation", label: "实验验证" },
              { value: "diagnosis", label: "问题诊断" },
              { value: "custom", label: "自定义主题" },
            ]} />
            {focus === "custom" && <Textarea label="自定义主题" value={topic} onChange={event => setTopic(event.target.value)} maxLength={500} disabled={generating || importing} placeholder="例如：高温合金的强度与成分比较" />}
            <Input label="生成数量" type="number" min={1} max={10} value={generateCount} onChange={event => setGenerateCount(Number(event.target.value))} disabled={generating} />
            <Button type="button" variant="secondary" onClick={() => void generateDrafts()} disabled={generating || importing || (focus === "custom" && !topic.trim()) || !Number.isInteger(generateCount) || generateCount < 1 || generateCount > 10}>{generating ? "正在生成…" : "生成题目"}</Button>
          </div>
          : <div className="excel-guide"><p>1. 在 Excel 第一张工作表中填写以下两列：</p><div className="example-table"><div><strong>领域</strong><strong>题目</strong></div><div><span>材料研发</span><span>填写需要评测的题目内容</span></div></div><p>2. 保存为 .xlsx 文件，选择文件后检查预览。</p><p className="excel-hint">一次最多 100 条、10 MB；重新选择文件会替换当前预览。</p><details className="service-guide"><summary>查看支持的领域</summary><div>{Object.entries(domains).map(([key, label]) => <span key={key}><strong>{label}</strong><code>{key}</code></span>)}</div></details><label className="secondary-button file-button">选择 Excel 文件<input type="file" accept=".xlsx" disabled={importing} onChange={event => { const file = event.target.files?.[0]; if (file) void readFile(file); event.target.value = ""; }} /></label></div>}
        {importError && <InlineAlert tone="danger" className="form-alert">{importError}</InlineAlert>}
        {drafts.length > 0 && <div className="import-preview"><h3>保存预览 · {drafts.length} 条</h3>{drafts.map((item, index) => <div className="preview-row" key={`${index}-${item.domainKey}`}><span>{domains[item.domainKey]}</span><p>{item.question}</p><Button type="button" variant="ghost" size="sm" disabled={importing} onClick={() => setDrafts(drafts.filter((_, i) => i !== index))}>移除</Button></div>)}</div>}
      </div>
    </Dialog>

    {rowMenu && <div ref={rowMenuRef} className="run-action-menu" role="menu" style={{ top: rowMenu.top, left: rowMenu.left }}>
      <button type="button" className="run-action-item" role="menuitem" onClick={() => { closeRowMenu(); openDetail(rowMenu.row); }}><Icon name="search" /><span>查看详情</span></button>
      <button type="button" className="run-action-item" role="menuitem" onClick={() => { const row = rowMenu.row; closeRowMenu(); generateStandards(row); }}><Icon name="copy" /><span>生成评判标准</span></button>
      {canManage && <button type="button" className="run-action-item" role="menuitem" onClick={() => { const row = rowMenu.row; closeRowMenu(); askDelete([row]); }}><Icon name="trash" /><span>删除</span></button>}
    </div>}

    <ToastStack toasts={toasts} onDismiss={dismissToast} />
  </section>;
}
