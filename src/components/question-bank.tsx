"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { parseXlsxFirstSheet } from "@/lib/xlsx-parser";

type Question = { id: string; question: string; serviceKey: string | null; sourceType: string; datasetVersion: string; createdAt?: string | null };
type Draft = { serviceKey: string; question: string };
type IconName = "search" | "close" | "trash" | "copy" | "chevron";

const services: Record<string, string> = { "alpha-rsi": "1110", alloy: "合金材料", literature: "文献", "literature-aircraft": "航空文献", synthesis: "综合任务", "new-material": "新材料" };
const pageSize = 20;
const rowKey = (row: Question) => `${row.id}|${row.datasetVersion}`;

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    trash: <><path d="M4 7h16M9 7V5h6v2M6.5 7l.9 13h9.2l.9-13" /><path d="M10.5 11v5.5M13.5 11v5.5" /></>,
    copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" /></>,
    chevron: <path d="m6 9 6 6 6-6" />,
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
    const item = items[i]; const max = item.serviceKey === "synthesis" ? 200 : 500;
    if (!Object.hasOwn(services, item.serviceKey)) return `第 ${i + 1} 条服务标识无效。`;
    if (item.question.trim().length < 8 || item.question.trim().length > max) return `第 ${i + 1} 条题目需要 8–${max} 个字符。`;
    const key = `${item.serviceKey}\n${item.question.trim()}`;
    if (seen.has(key)) return `第 ${i + 1} 条与本次导入中的题目重复。`;
    seen.add(key);
  }
  return "";
}
function serviceLabel(row: Question) { return services[row.serviceKey || ""] || row.serviceKey || "未指定服务"; }
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

export function QuestionBank() {
  const router = useRouter();
  const [quickBusy, setQuickBusy] = useState(false);
  const [rows, setRows] = useState<Question[]>([]); const [total, setTotal] = useState(0);
  const [source, setSource] = useState("fixed"); const [service, setService] = useState("");
  const [input, setInput] = useState(""); const [search, setSearch] = useState(""); const [page, setPage] = useState(0); const [tick, setTick] = useState(0);
  const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const [write, setWrite] = useState(false); const [permissionReady, setPermissionReady] = useState(false); const [permissionError, setPermissionError] = useState("");
  const [selected, setSelected] = useState<Record<string, Question>>({});
  const [detail, setDetail] = useState<Question | null>(null);
  const [editMode, setEditMode] = useState(false); const [editText, setEditText] = useState(""); const [editBusy, setEditBusy] = useState(false); const [editError, setEditError] = useState("");
  const [topic, setTopic] = useState(""); const [generateCount, setGenerateCount] = useState(3); const [generating, setGenerating] = useState(false);
  const [confirmRows, setConfirmRows] = useState<Question[]>([]); const [deleting, setDeleting] = useState<{ done: number; total: number } | null>(null); const [deleteError, setDeleteError] = useState("");
  const [toasts, setToasts] = useState<{ id: number; kind: "success" | "error"; text: string }[]>([]);
  const toastId = useRef(0); const toastTimers = useRef<number[]>([]);
  useEffect(() => () => { toastTimers.current.forEach((timer) => clearTimeout(timer)); }, []);
  function toast(kind: "success" | "error", text: string) {
    const id = ++toastId.current;
    setToasts((list) => [...list.slice(-2), { id, kind, text }]);
    const timer = window.setTimeout(() => setToasts((list) => list.filter((item) => item.id !== id)), kind === "error" ? 4200 : 2400);
    toastTimers.current.push(timer);
  }
  const [drafts, setDrafts] = useState<Draft[]>([]); const [draftService, setDraftService] = useState("alpha-rsi"); const [draftQuestion, setDraftQuestion] = useState("");
  const [importMode, setImportMode] = useState<"manual" | "excel" | "generate">("manual");
  const [importError, setImportError] = useState(""); const [importing, setImporting] = useState(false);
  const importDialog = useRef<HTMLDialogElement>(null); const detailDialog = useRef<HTMLDialogElement>(null); const confirmDialog = useRef<HTMLDialogElement>(null);
  const headCheck = useRef<HTMLInputElement>(null); const requestId = useRef(0);

  useEffect(() => { const controller = new AbortController(); jsonRequest("/api/question-bank/access", { signal: controller.signal }).then((data) => setWrite(canWrite(data.access?.permissions))).catch(() => { if (!controller.signal.aborted) { setWrite(false); setPermissionError("无法确认导入权限，请刷新页面重试。"); } }).finally(() => { if (!controller.signal.aborted) setPermissionReady(true); }); return () => controller.abort(); }, []);

  const load = useCallback(async () => {
    const request = ++requestId.current; setLoading(true); setError("");
    const params = new URLSearchParams({ source, status: "active", limit: String(pageSize), offset: String(page * pageSize) });
    if (service) params.set("service", service); if (search) params.set("search", search);
    try { const data = await jsonRequest(`/api/question-bank/questions?${params}`); if (request !== requestId.current) return; if (!Array.isArray(data.items) || typeof data.total !== "number") throw new Error("题库数据格式异常，请稍后重试。"); setRows(data.items); setTotal(data.total); }
    catch (err) { if (request === requestId.current) { setError(getMessage(err)); setRows([]); setTotal(0); } }
    finally { if (request === requestId.current) setLoading(false); }
  }, [source, service, search, page]);
  useEffect(() => { if (!permissionReady) return; const activeRequest = requestId; const timeout = setTimeout(() => void load(), 0); return () => { clearTimeout(timeout); activeRequest.current++; }; }, [load, permissionReady, tick]);
  useEffect(() => { setSelected({}); }, [source, service, search, page]);

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const canManage = write && source === "fixed";
  const selectedRows = Object.values(selected);
  const allSelected = rows.length > 0 && rows.every((row) => Object.hasOwn(selected, rowKey(row)));
  const someSelected = rows.some((row) => Object.hasOwn(selected, rowKey(row)));
  useEffect(() => { if (headCheck.current) headCheck.current.indeterminate = someSelected && !allSelected; }, [someSelected, allSelected]);

  function toggleRow(row: Question) { setSelected((current) => { const next = { ...current }; const key = rowKey(row); if (Object.hasOwn(next, key)) delete next[key]; else next[key] = row; return next; }); }
  function toggleAll() { setSelected((current) => { if (allSelected) { const next = { ...current }; rows.forEach((row) => delete next[rowKey(row)]); return next; } const next = { ...current }; rows.forEach((row) => { next[rowKey(row)] = row; }); return next; }); }
  function clearFilters() { setInput(""); setSearch(""); setService(""); setPage(0); }
  useEffect(() => { const timer = setTimeout(() => { setSearch(input.trim()); setPage(0); }, 250); return () => clearTimeout(timer); }, [input]);

  function askDelete(target: Question[]) { if (!target.length) return; setDeleteError(""); setConfirmRows(target); confirmDialog.current?.showModal(); }
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
      confirmDialog.current?.close(); setConfirmRows([]); setDetail(null);
      toast("success", `已删除 ${target.length} 道题目。`);
      shiftPage(target.length);
      return;
    }
    setDeleteError(`有 ${failed.length} 道题目未能删除：${failed[0].message}${failed.length > 1 ? " 请重试其余题目。" : ""}`);
    setConfirmRows(failed.map((item) => item.row));
    if (failed.length < target.length) { toast("success", `已删除 ${target.length - failed.length} 道题目。`); shiftPage(target.length - failed.length); }
  }

  async function prepareEvaluation(row: Question) {
    if (quickBusy || !row.serviceKey || !["fixed", "random"].includes(row.sourceType)) return;
    if (sessionStorage.getItem("evaluation-unified-pending")) { toast("error", "上次提交结果尚未确认，请先返回测评页面处理。"); return; }
    setQuickBusy(true);
    try {
      const current = sessionStorage.getItem("evaluation-unified-run");
      if (current) {
        const run = await jsonRequest(`/api/evaluation/unified/runs/${encodeURIComponent(current)}`);
        if (["running", "scoring"].includes(run.status)) throw new Error("当前测评还未结束，请先返回查看。");
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

  function openImport(mode: "manual" | "excel" | "generate") { setImportMode(mode); setDrafts([]); setDraftQuestion(""); setImportError(""); importDialog.current?.showModal(); }
  async function readFile(file: File) { setImportError(""); try { const items = await parseXlsxFirstSheet(file); const cleaned = items.map(item => ({ serviceKey: item.serviceKey.trim(), question: item.question.trim() })); const problem = validate(cleaned); if (problem) throw new Error(problem); setDrafts(cleaned); } catch (err) { setDrafts([]); setImportError(getMessage(err)); } }
  function addDraft() { const next = [...drafts, { serviceKey: draftService, question: draftQuestion.trim() }]; const problem = validate(next); if (problem) { setImportError(problem); return; } setDrafts(next); setDraftQuestion(""); setImportError(""); }
  async function generateDrafts() {
    if (generating || !topic.trim()) return;
    setGenerating(true); setImportError(""); setDrafts([]);
    try {
      const data = await jsonRequest("/api/question-bank/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serviceKey: draftService, topic: topic.trim(), count: generateCount }) });
      if (!Array.isArray(data.items)) throw new Error("生成结果格式异常");
      const problem = validate(data.items); if (problem) throw new Error(problem);
      setDrafts(data.items); if (data.items.length < generateCount) setImportError(`模型返回了 ${data.items.length} 道有效题目，少于所请求数量。`);
    } catch (err) { setImportError(getMessage(err)); } finally { setGenerating(false); }
  }
  async function saveEdit() {
    if (!detail || editBusy) return;
    const problem = validate([{ serviceKey: detail.serviceKey || "", question: editText }]); if (problem) { setEditError(problem); return; }
    setEditBusy(true); setEditError("");
    try { await jsonRequest("/api/question-bank/update", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: detail.id, datasetVersion: detail.datasetVersion, question: editText.trim() }) });
      detailDialog.current?.close(); setEditMode(false); toast("success", "题目已更新，历史记录保留原版本。"); setTick(value => value + 1);
    } catch (err) { setEditError(getMessage(err)); } finally { setEditBusy(false); }
  }
  async function submitImport() { const problem = validate(drafts); if (problem) { setImportError(problem); return; } setImporting(true); setImportError(""); try { const data = await jsonRequest("/api/question-bank/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: drafts }) }); if (!Array.isArray(data.items)) throw new Error("导入结果格式异常，请刷新列表核实，避免重复提交。"); importDialog.current?.close(); toast("success", `已导入 ${data.items.length} 道固定题。`); setSource("fixed"); setService(""); setInput(""); setSearch(""); if (page !== 0) setPage(0); else setTick((value) => value + 1); }
    catch (err) { setImportError(`${getMessage(err)} 若连接中断，请先刷新列表核实结果，避免重复导入。`); } finally { setImporting(false); } }

  return <section className="bank-page" aria-labelledby="bank-title">
    <div className="bank-heading">
      <div><h1 id="bank-title">题库</h1><p>固定题由团队维护，随机题在评测时自动生成。</p></div>
      {write && source === "fixed" && <button className="primary-button" onClick={() => openImport("manual")}>导入题目</button>}
    </div>

    <div className="bank-toolbar">
      <div className="bank-tabs" role="tablist" aria-label="题目类型">
        <button type="button" role="tab" aria-selected={source === "fixed"} className={source === "fixed" ? "selected" : ""} onClick={() => { setSource("fixed"); setPage(0); }}>固定题</button>
        <button type="button" role="tab" aria-selected={source === "random"} className={source === "random" ? "selected" : ""} onClick={() => { setSource("random"); setPage(0); }}>随机题</button>
      </div>
      <div className="bank-filters">
        <div className="search-field">
          <Icon name="search" />
          <label><span className="sr-only">搜索题目</span><input value={input} onChange={event => setInput(event.target.value)} placeholder="搜索题目内容" /></label>
          {input && <button type="button" className="search-clear" aria-label="清除搜索" onClick={() => { setInput(""); setSearch(""); setPage(0); }}><Icon name="close" /></button>}
        </div>
        <label className="bank-select"><span className="sr-only">筛选服务</span><select value={service} onChange={event => { setService(event.target.value); setPage(0); }}><option value="">全部服务</option>{Object.entries(services).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><Icon name="chevron" /></label>
      </div>
    </div>

    {permissionError && <p className="bank-message error" role="alert">{permissionError}</p>}

    {selectedRows.length > 0 && <div className="selection-bar" role="status">
      <span>已选 {selectedRows.length} 条</span>
      <div><button type="button" className="text-danger-button" onClick={() => askDelete(selectedRows)}>删除</button><button type="button" className="text-button" onClick={() => setSelected({})}>取消选择</button></div>
    </div>}

    {!permissionReady && <p className="bank-state" role="status">正在检查访问权限…</p>}
    {permissionReady && loading && <p className="bank-state" role="status">正在加载题目…</p>}
    {permissionReady && !loading && error && <div className="bank-state" role="alert"><p>{error}</p><button className="secondary-button" onClick={() => void load()}>重试</button></div>}
    {permissionReady && !loading && !error && (rows.length > 0
      ? <div className="bank-table-wrap">
        <table className="bank-table">
          <colgroup>{canManage && <col className="col-check" />}<col /><col className="col-service" /><col className="col-time" /><col className="col-action" /></colgroup>
          <thead><tr>
            {canManage && <th className="col-check"><input ref={headCheck} type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="全选本页题目" /></th>}
            <th scope="col">题目</th>
            <th scope="col" className="col-service">服务</th>
            <th scope="col" className="col-time">更新时间</th>
            <th scope="col" className="col-action"><span className="sr-only">操作</span></th>
          </tr></thead>
          <tbody>{rows.map((row) => {
            const key = rowKey(row); const checked = Object.hasOwn(selected, key);
            return <tr key={key} className={checked ? "selected" : ""}>
              {canManage && <td className="col-check"><input type="checkbox" checked={checked} onChange={() => toggleRow(row)} aria-label={`选择题目：${row.question.slice(0, 24)}`} /></td>}
              <td className="col-question"><button type="button" className="row-question" title={row.question} onClick={() => { setDetail(row); setEditMode(false); setEditError(""); setEditText(row.question); detailDialog.current?.showModal(); }}>{row.question}</button></td>
              <td className="col-service">{serviceLabel(row)}</td>
              <td className="col-time">{formatDate(row.createdAt)}</td>
              <td className="col-action">{canManage && <button type="button" className="icon-button row-delete" aria-label="删除该题目" onClick={() => askDelete([row])}><Icon name="trash" /></button>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      : <div className="bank-state">
        <p>{search || service ? "没有找到符合条件的题目。" : "题库还没有题目。"}</p>
        {search || service ? <button className="secondary-button" onClick={clearFilters}>清除筛选</button>
          : write && source === "fixed" && <button className="primary-button" onClick={() => openImport("manual")}>导入题目</button>}
      </div>)}

    {permissionReady && !loading && !error && total > 0 && <div className="bank-footer">
      <span>第 {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} 条 / 共 {total} 条{source === "random" && <span className="bank-footer-note">随机题由评测过程生成，不支持删除</span>}</span>
      <div className="bank-pager">
        <button className="secondary-button" disabled={page === 0} onClick={() => setPage(page - 1)}>上一页</button>
        <span className="bank-page-indicator">{page + 1} / {pages}</span>
        <button className="secondary-button" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>下一页</button>
      </div>
    </div>}

    <dialog ref={detailDialog} className="bank-dialog" aria-labelledby="detail-title" onClose={() => setDetail(null)}>
      {detail && <div className="bank-dialog-content">
        <div className="bank-dialog-heading"><div><h2 id="detail-title">题目详情</h2><p>{serviceLabel(detail)} · {detail.sourceType === "random" ? "随机题" : "固定题"}</p></div><button type="button" className="icon-button" aria-label="关闭详情" onClick={() => detailDialog.current?.close()}><Icon name="close" /></button></div>
        {editMode ? <label>题目内容<textarea value={editText} onChange={event => setEditText(event.target.value)} maxLength={500} disabled={editBusy} /></label> : <p className="detail-question">{detail.question}</p>}
        {editError && <p className="bank-message error" role="alert">{editError}</p>}
        <dl className="detail-meta">
          <div><dt>数据集版本</dt><dd>{detail.datasetVersion || "—"}</dd></div>
          <div><dt>创建时间</dt><dd>{formatDateTime(detail.createdAt)}</dd></div>
          <div className="detail-meta-wide"><dt>题目 ID</dt><dd className="mono">{detail.id}</dd></div>
        </dl>
        <div className="bank-dialog-actions">
          <button type="button" className="secondary-button" onClick={() => void copyQuestion(detail.question)}><Icon name="copy" />复制题目</button>
          <div>{["fixed", "random"].includes(detail.sourceType) && detail.serviceKey && !editMode && <button type="button" className="secondary-button" disabled={quickBusy} onClick={() => void prepareEvaluation(detail)}>{quickBusy ? "正在准备…" : "使用这道题测评"}</button>}{canManage && (editMode ? <button type="button" className="primary-button" disabled={editBusy} onClick={() => void saveEdit()}>{editBusy ? "保存中…" : "保存修改"}</button> : <button type="button" className="secondary-button" onClick={() => setEditMode(true)}>编辑</button>)}{canManage && !editMode && <button type="button" className="danger-button" onClick={() => { detailDialog.current?.close(); askDelete([detail]); }}>删除</button>}<button type="button" className="secondary-button" onClick={() => detailDialog.current?.close()}>关闭</button></div>
        </div>
      </div>}
    </dialog>

    <dialog ref={confirmDialog} className="bank-dialog" aria-labelledby="delete-title" onCancel={event => { if (deleting) event.preventDefault(); }} onClose={() => { if (!deleting) { setConfirmRows([]); setDeleteError(""); } }}>
      <div className="bank-dialog-content">
        <div className="bank-dialog-heading"><div><h2 id="delete-title">删除 {confirmRows.length} 道题目？</h2><p>删除后题目不再出现在题库，也不再参与评测。</p></div><button type="button" className="icon-button" aria-label="取消删除" disabled={!!deleting} onClick={() => confirmDialog.current?.close()}><Icon name="close" /></button></div>
        <ul className="delete-list">{confirmRows.slice(0, 5).map((row) => <li key={rowKey(row)}>{row.question}</li>)}{confirmRows.length > 5 && <li>另有 {confirmRows.length - 5} 道题目</li>}</ul>
        {deleteError && <p className="form-error" role="alert">{deleteError}</p>}
        <div className="bank-dialog-actions">
          <span className="delete-hint">此操作无法通过本页面撤销</span>
          <div><button type="button" className="secondary-button" disabled={!!deleting} onClick={() => confirmDialog.current?.close()}>取消</button><button type="button" className="danger-button" disabled={!!deleting} onClick={() => void submitDelete()}>{deleting ? `删除中 ${deleting.done}/${deleting.total}` : "删除"}</button></div>
        </div>
      </div>
    </dialog>

    <dialog ref={importDialog} className="bank-dialog" aria-labelledby="import-title" onCancel={event => { if (importing) event.preventDefault(); }}>
      <div className="bank-dialog-content">
        <div className="bank-dialog-heading"><div><h2 id="import-title">导入固定题</h2><p>先准备题目，确认预览后再保存到题库。</p></div><button type="button" className="icon-button" aria-label="关闭导入" disabled={importing} onClick={() => importDialog.current?.close()}><Icon name="close" /></button></div>
        <div className="bank-modes" role="tablist" aria-label="导入方式">
          <button type="button" role="tab" aria-selected={importMode === "manual"} className={importMode === "manual" ? "selected" : ""} disabled={importing} onClick={() => setImportMode("manual")}>手动添加</button>
          <button type="button" role="tab" aria-selected={importMode === "excel"} className={importMode === "excel" ? "selected" : ""} disabled={importing || generating} onClick={() => setImportMode("excel")}>导入 Excel</button>
          <button type="button" role="tab" aria-selected={importMode === "generate"} className={importMode === "generate" ? "selected" : ""} disabled={importing || generating} onClick={() => setImportMode("generate")}>AI 生成</button>
        </div>
        {importMode === "manual" ? <div className="import-fields"><p className="import-intro">选择服务并输入题目，可连续添加多条。</p><label>服务<select value={draftService} onChange={event => setDraftService(event.target.value)} disabled={importing}>{Object.entries(services).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>题目<textarea value={draftQuestion} onChange={event => setDraftQuestion(event.target.value)} maxLength={500} disabled={importing} placeholder="输入题目内容（至少 8 个字符）" /></label><button type="button" className="secondary-button" onClick={addDraft} disabled={importing || !draftQuestion.trim()}>添加到预览</button></div>
          : importMode === "generate" ? <div className="import-fields"><p className="import-intro">描述想考察的主题，生成后可预览并确认入库。</p><label>服务<select value={draftService} onChange={event => setDraftService(event.target.value)} disabled={generating}>{Object.entries(services).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label>出题主题<textarea value={topic} onChange={event => setTopic(event.target.value)} maxLength={500} disabled={generating} placeholder="例如：高温合金的强度与成分比较" /></label><label>生成数量<input type="number" min={1} max={10} value={generateCount} onChange={event => setGenerateCount(Number(event.target.value))} disabled={generating} /></label><button type="button" className="secondary-button" onClick={() => void generateDrafts()} disabled={generating || !topic.trim() || generateCount < 1 || generateCount > 10}>{generating ? "正在生成…" : "生成题目"}</button></div>
          : <div className="excel-guide"><p>1. 在 Excel 第一张工作表中填写以下两列：</p><div className="example-table"><div><strong>服务</strong><strong>题目</strong></div><div><span>alpha-rsi</span><span>填写需要评测的题目内容</span></div></div><p>2. 保存为 .xlsx 文件，选择文件后检查预览。</p><p className="excel-hint">一次最多 100 条、10 MB；重新选择文件会替换当前预览。</p><details className="service-guide"><summary>查看支持的服务标识</summary><div>{Object.entries(services).map(([key, label]) => <span key={key}><strong>{label}</strong><code>{key}</code></span>)}</div></details><label className="secondary-button file-button">选择 Excel 文件<input type="file" accept=".xlsx" disabled={importing} onChange={event => { const file = event.target.files?.[0]; if (file) void readFile(file); event.target.value = ""; }} /></label></div>}
        {importError && <p className="form-error" role="alert">{importError}</p>}
        {drafts.length > 0 && <div className="import-preview"><h3>导入预览 · {drafts.length} 条</h3>{drafts.map((item, index) => <div className="preview-row" key={`${index}-${item.serviceKey}`}><span>{services[item.serviceKey]}</span><p>{item.question}</p><button type="button" className="text-button" disabled={importing} onClick={() => setDrafts(drafts.filter((_, i) => i !== index))}>移除</button></div>)}</div>}
        <div className="bank-dialog-actions"><span /><div><button type="button" className="secondary-button" disabled={importing} onClick={() => importDialog.current?.close()}>取消</button><button type="button" className="primary-button" disabled={importing || generating || !drafts.length} onClick={() => void submitImport()}>{importing ? "导入中…" : `确认导入${drafts.length ? `（${drafts.length}）` : ""}`}</button></div></div>
      </div>
    </dialog>

    <div className="toast-stack">{toasts.map((item) => <div key={item.id} className={`toast ${item.kind}`} role={item.kind === "error" ? "alert" : "status"}>{item.text}</div>)}</div>
  </section>;
}
