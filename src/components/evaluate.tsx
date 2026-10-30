"use client";

import { UnifiedScores } from "@/components/unified-scores";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { readUnifiedStream } from "@/lib/unified-stream";

type BankQuestion = {
  id: string;
  question: string;
  serviceKey: string | null;
  sourceType: string;
  datasetVersion: string;
};

type IconName = "book" | "shuffle" | "close" | "check" | "search" | "chevron" | "arrow-up";

const services = [
  { key: "alpha-rsi", label: "1110", enabled: true },
  { key: "alloy", label: "合金材料", enabled: true },
  { key: "literature", label: "文献", enabled: true },
  { key: "literature-aircraft", label: "航空文献", enabled: true },
  { key: "synthesis", label: "综合任务", enabled: true },
  { key: "new-material", label: "新材料", enabled: true },
];

const MAX = 500;
const MIN = 8;
const PAGE_SIZE = 20;

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 1 4 17.5z" /><path d="M4 17.5A2.5 2.5 0 0 1 6.5 15H20" /></>,
    shuffle: <><path d="M3 7h3.5c1.2 0 2.2.6 2.9 1.6L15 17c.7 1 1.7 1.6 2.9 1.6H21" /><path d="M3 17h3.5c1.2 0 2.2-.6 2.9-1.6l1.2-1.8" /><path d="M14 8.6l1-1.4c.7-1 1.7-1.6 2.9-1.6H21" /><path d="m18.4 3.6 2.4 2-2.4 2M18.4 16.6l2.4 2-2.4 2" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    check: <path d="m5 12.5 4.5 4.5L19 7" />,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    chevron: <path d="m6 9 6 6 6-6" />,
    "arrow-up": <path d="M12 19V5m-6 6 6-6 6 6" />,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "请求失败，请稍后重试。";
}

async function jsonRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const detail = typeof data.error === "string" ? data.error : typeof data.error?.message === "string" ? data.error.message : "";
    throw new Error(detail || `请求失败（${response.status}）`);
  }
  return data;
}

function bankUrl(service: string, params: Record<string, string>) {
  return `/api/question-bank/questions?${new URLSearchParams({ service, source: "fixed", status: "active", ...params })}`;
}


export function Evaluate() {
  const [draft, setDraft] = useState("");
  const [source, setSource] = useState<BankQuestion | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [service, setService] = useState("alpha-rsi");
  const [randomBusy, setRandomBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [run, setRun] = useState<{ id: string; question: string; service: string; answer: string; status: string; executionStatus?: string; scoringStatus?: string; result: unknown; scores: unknown; scoreError: string; truncated: boolean; snapshotOnly?: boolean } | null>(null);
  const [recovering, setRecovering] = useState(false);
  const runId = useRef("");
  const runStatus = useRef("");

  const [pickerOpen, setPickerOpen] = useState(false);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<BankQuestion[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [picked, setPicked] = useState<BankQuestion | null>(null);

  const dialog = useRef<HTMLDialogElement>(null);
  const menuWrap = useRef<HTMLDivElement>(null);

  const trimmed = draft.trim();
  const length = draft.length;
  const max = service === "synthesis" ? 200 : MAX;
  const min = service === "alpha-rsi" ? 1 : MIN;
  const over = trimmed.length > max;
  const draftValid = trimmed.length >= min && !over && !submitting && !recovering;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const serviceLabel = services.find((item) => item.key === service)?.label ?? "1110";
  const busy = submitting || randomBusy;

  useEffect(() => {
    const selected = sessionStorage.getItem("evaluation-selected-question");
    if (!selected || sessionStorage.getItem("evaluation-unified-pending")) return;
    try {
      const row = JSON.parse(selected) as BankQuestion;
      if (row && typeof row.id === "string" && typeof row.datasetVersion === "string" && typeof row.question === "string" && typeof row.serviceKey === "string" && ["fixed", "random"].includes(row.sourceType)) {
        setDraft(row.question); setService(row.serviceKey); setSource(row);
        sessionStorage.removeItem("evaluation-selected-question");
      }
    } catch { setSubmitError("无法读取选中的题目，请返回题库重试。"); }
  }, []);

  useEffect(() => {
    const pendingText = sessionStorage.getItem("evaluation-unified-pending");
    if (!pendingText) return;
    try {
      const pending = JSON.parse(pendingText) as { body?: string };
      const body = JSON.parse(pending.body || "{}") as Record<string, unknown>;
      if (typeof body.question === "string" && typeof body.serviceKey === "string") {
        setDraft(body.question); setService(body.serviceKey);
        if (typeof body.questionId === "string" && typeof body.datasetVersion === "string" && typeof body.sourceType === "string") {
          setSource({ id: body.questionId, question: body.question, serviceKey: body.serviceKey, datasetVersion: body.datasetVersion, sourceType: body.sourceType });
        }
        setSubmitError("上次提交的结果尚未确认，可使用原题重试以恢复原运行。");
      }
    } catch { setSubmitError("上次提交状态无法读取，请先核对运行记录。"); }
  }, []);

  useEffect(() => {
    const startNew = (event: Event) => {
      if (submitting) { event.preventDefault(); setSubmitError("当前运行仍在输出，请等待结束后新建测评。"); return; }
      runId.current = "";
      setRun(null);
      setSubmitError("");
    };
    window.addEventListener("evaluation-new-request", startNew);
    return () => window.removeEventListener("evaluation-new-request", startNew);
  }, [submitting]);

  useEffect(() => {
    let active = true;
    const id = sessionStorage.getItem("evaluation-unified-run");
    if (!id) return;
    runId.current = id;
    setRecovering(true);
    const load = async () => {
      try {
        const data = await jsonRequest(`/api/evaluation/unified/runs/${encodeURIComponent(id)}`);
        if (!active) return;
        runStatus.current = data.status || "unknown";
        setRun({ id, question: data.question || "", service: data.serviceKey || "", answer: data.answer || "", status: data.status || "unknown", executionStatus: data.executionStatus, scoringStatus: data.scoringStatus, result: data.run, scores: data.scores || null, scoreError: data.scoreError || "", truncated: data.answerTruncated === true, snapshotOnly: data.recoveryState === "snapshot_only" });
        setSubmitError(data.persistenceError === true ? "记录保存失败；请稍后读取原运行，不要重复发起。" : "");
      } catch (error) { if (active) { runStatus.current = "unknown"; setSubmitError(`无法恢复运行：${message(error)}；服务重启或记录过期后可能无法恢复。`); } }
      finally { if (active) setRecovering(false); }
    };
    void load();
    const timer = window.setInterval(() => { if (!submitting && ["running", "scoring"].includes(runStatus.current)) void load(); }, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [submitting]);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (pickerOpen && !node.open) node.showModal();
    if (!pickerOpen && node.open) node.close();
  }, [pickerOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => { if (!menuWrap.current?.contains(event.target as Node)) setMenuOpen(false); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, [menuOpen]);

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(input.trim()); setPage(0); }, 250);
    return () => clearTimeout(timer);
  }, [input]);

  useEffect(() => {
    if (!pickerOpen) return;
    const controller = new AbortController();
    setLoading(true);
    setLoadError("");
    const params: Record<string, string> = { limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) };
    if (search) params.search = search;
    jsonRequest(bankUrl(service, params), { signal: controller.signal })
      .then((data) => {
        if (!Array.isArray(data.items) || typeof data.total !== "number") throw new Error("题库数据格式异常，请稍后重试。");
        setRows(data.items);
        setTotal(data.total);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setLoadError(message(error));
        setRows([]);
        setTotal(0);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [pickerOpen, page, search, reload, service]);

  function openPicker() {
    setPicked(null);
    setInput("");
    setSearch("");
    setPage(0);
    setPickerOpen(true);
  }

  function usePicked() {
    if (!picked) return;
    setDraft(picked.question);
    setSource(picked);
    setSubmitError("");
    setPickerOpen(false);
  }

  async function pickRandom() {
    if (busy) return;
    setRandomBusy(true);
    setSubmitError("");
    try {
      const first = await jsonRequest(bankUrl(service, { limit: "1", offset: "0" }));
      const count = Number(first.total);
      if (!Number.isFinite(count) || count < 1) throw new Error("题库中还没有适用于当前服务的题目。");
      const offset = Math.floor(Math.random() * count);
      const data = offset === 0 ? first : await jsonRequest(bankUrl(service, { limit: "1", offset: String(offset) }));
      const row = data.items?.[0] as BankQuestion | undefined;
      if (!row) throw new Error("没有取到可用题目，请重试。");
      setDraft(row.question);
      setSource(row);
    } catch (error) {
      setSubmitError(message(error));
    } finally {
      setRandomBusy(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!draftValid) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const body = JSON.stringify({ serviceKey: service, question: trimmed, ...(source ? { questionId: source.id, datasetVersion: source.datasetVersion, sourceType: source.sourceType } : {}) });
      const pendingText = sessionStorage.getItem("evaluation-unified-pending");
      let pending: { key: string; body: string } | null = null;
      if (pendingText) { try { pending = JSON.parse(pendingText); } catch { throw new Error("上次请求状态无法读取，请先核对运行记录。"); } }
      if (pending && pending.body !== body) throw new Error("上次提交结果尚未确认，请使用原题和原服务重试，或先核对运行记录。");
      const key = pending?.key || crypto.randomUUID();
      sessionStorage.setItem("evaluation-unified-pending", JSON.stringify({ key, body }));
      const created = await fetch("/api/evaluation/unified/runs", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body });
      const createdData = await created.json().catch(() => ({}));
      if (!created.ok) {
        // 权限变化或网络错误不能证明之前的提交未被服务端接收。
        if (created.status === 400) sessionStorage.removeItem("evaluation-unified-pending");
        throw new Error(typeof createdData.error === "string" ? createdData.error : typeof createdData.error?.message === "string" ? createdData.error.message : `请求失败（${created.status}）`);
      }
      if (typeof createdData.runId !== "string") throw new Error("未收到运行 ID，请使用原题重试以确认状态。");
      const id = createdData.runId;
      runId.current = id; runStatus.current = "running";
      sessionStorage.setItem("evaluation-unified-run", id);
      sessionStorage.removeItem("evaluation-unified-pending");
      window.dispatchEvent(new Event("evaluation-unified-change"));
      setRun({ id, question: trimmed, service, answer: "", status: "running", result: null, scores: null, scoreError: "", truncated: false });
      const response = await fetch(`/api/evaluation/unified/runs/${encodeURIComponent(id)}/events`, { cache: "no-store" });
      if (!response.ok) throw new Error(`订阅运行失败（${response.status}）`);
      let finished = false;
      await readUnifiedStream(response, ({ event: name, data }) => {
        if (name === "snapshot") {
          const status = typeof data.status === "string" ? data.status : "unknown";
          runStatus.current = status;
          setRun((current) => current ? { ...current, answer: typeof data.answer === "string" ? data.answer : "", status,
            executionStatus: typeof data.executionStatus === "string" ? data.executionStatus : undefined,
            scoringStatus: typeof data.scoringStatus === "string" ? data.scoringStatus : undefined,
            result: data.run || null, scores: data.scores || null, scoreError: typeof data.scoreError === "string" ? data.scoreError : "",
            truncated: data.answerTruncated === true, snapshotOnly: data.recoveryState === "snapshot_only" } : current);
          if (data.live === false) finished = true;
        } else if (name === "text" && typeof data.delta === "string") {
          const delta = data.delta;
          setRun((current) => current ? { ...current, answer: current.answer + delta } : current);
        } else if (name === "run") {
          setRun((current) => current ? { ...current, status: data.status === "error" ? "error" : "scoring", executionStatus: data.status === "error" ? "failed" : "succeeded", result: data } : current);
        } else if (name === "score") {
          setRun((current) => current ? { ...current, scores: data.scores, scoringStatus: typeof data.scoringStatus === "string" ? data.scoringStatus : current.scoringStatus, scoreError: typeof data.scoreError === "string" ? data.scoreError : "" } : current);
        } else if (name === "done") {
          finished = true;
          runStatus.current = typeof data.status === "string" ? data.status : "unknown";
          setRun((current) => current ? { ...current, status: typeof data.status === "string" ? data.status : "unknown", executionStatus: typeof data.executionStatus === "string" ? data.executionStatus : current.executionStatus, scoringStatus: typeof data.scoringStatus === "string" ? data.scoringStatus : current.scoringStatus } : current);
        } else if (name === "error") {
          finished = true;
          if (data.code !== "UNIFIED_EVAL_PERSISTENCE_FAILED") setRun((current) => current ? { ...current, status: "error" } : current);
          setSubmitError(typeof data.message === "string" ? data.message : "评测执行失败。");
        }
      });
      if (!finished) setSubmitError("连接中断，正在尝试按运行 ID 恢复；不会重复发起。");
    } catch (error) {
      setSubmitError(`${message(error)}${runId.current ? " 可根据已有运行 ID 恢复。" : " 如果请求已发出，请确认任务状态后再重试。"}`);
    } finally { setSubmitting(false); }
  }

  const draftError = over
    ? `题目超过 ${max} 个字符，请精简后再发起。`
    : trimmed && trimmed.length < min ? `题目过短，至少需要 ${min} 个字符。` : "";

  if (run) return <div className="chat-view"><div className="chat-top"><h1>运行详情</h1><span className={`run-dot ${run.status === "done" ? "done" : run.status === "error" ? "error" : "running"}`} /><span>{run.status === "done" ? "已结束" : run.status === "error" ? "失败" : run.status === "scoring" ? "评分中" : "运行中"} · {services.find((item) => item.key === run.service)?.label || run.service}</span></div><div className="chat-scroll"><div className="chat-scroll-inner"><div className="run-layout"><div className="run-chat" tabIndex={0} role="region" aria-label="对话内容"><p className="run-question">{run.question}</p><section className="run-answer-block"><div className="run-answer-head"><strong>{services.find((item) => item.key === run.service)?.label || run.service}</strong><span>回答</span></div><div className="run-answer"><Markdown remarkPlugins={[remarkGfm]}>{run.answer || "等待服务输出…"}</Markdown></div>{run.truncated && <p className="run-score-note">恢复的回答已截断。</p>}{submitError && <p className="eval-error" role="alert">{submitError}</p>}</section></div><aside className="run-panel"><div className="run-panel-head"><h2>测评结果</h2><p>运行结束不代表题目要求已完成。</p></div><section className="run-block"><h3>运行信息</h3><dl className="run-info"><div><dt>运行 ID</dt><dd className="mono">{run.id}</dd></div><div><dt>执行</dt><dd>{run.executionStatus === "succeeded" ? "已结束" : run.executionStatus === "failed" ? "失败" : "运行中"}</dd></div><div><dt>评分</dt><dd>{({ pending: "评分中", ready: "已完成", failed: "评分失败", unavailable: "未配置", absent: "无评分", unknown: "状态未知" } as Record<string, string>)[run.scoringStatus || "pending"] || "状态未知"}</dd></div></dl></section><section className="run-block"><h3>评分</h3>{run.snapshotOnly && ["running", "scoring"].includes(run.status) && <p className="run-score-note">显示的是已保存的快照，当前进程无法确认任务是否仍在运行。</p>}{run.scoreError && <p className="run-score-note">{run.scoreError}</p>}<UnifiedScores scores={run.scores} run={run.result} /></section><p className="run-note">模型评分不代表科学真实性。运行记录依赖服务端持久化。</p><button type="button" className="secondary-button" disabled={submitting} onClick={() => { sessionStorage.removeItem("evaluation-unified-run"); window.dispatchEvent(new Event("evaluation-unified-change")); runId.current = ""; setRun(null); setSubmitError(""); }}>新建测评</button></aside></div></div></div></div>;

  return (
    <main className="eval-page">
      <div className="eval-inner">
        <section className="eval-intro">
          <h1>要测评什么？</h1>
          <p>选择服务，随机取一道题库题或直接输入，发起一次单题测评。</p>
        </section>

        <form className="eval-composer" data-disabled={busy} onSubmit={handleSubmit}>
          {source && (
            <div className="eval-source">
              <span className="eval-chip">
                <Icon name="book" />
                <span>题库 {source.id} · {source.sourceType === "random" ? "随机题" : "固定题"}</span>
                <button type="button" aria-label="清除题库题目" disabled={busy} onClick={() => { setSource(null); setDraft(""); }}>
                  <Icon name="close" />
                </button>
              </span>
              <span className="eval-note">数据集 {source.datasetVersion} · 不会修改题库原题</span>
            </div>
          )}

          <label className="sr-only" htmlFor="eval-question">题目内容</label>
          <textarea
            id="eval-question"
            value={draft}
            maxLength={800}
            disabled={submitting}
            placeholder={`输入要在${serviceLabel}上测评的题目，或从题库选择…`}
            onChange={(event) => {
              const value = event.target.value;
              setDraft(value);
              if (source && value !== source.question) setSource(null);
            }}
          />

          <div className="eval-bar">
            <div className="eval-tools">
              <div className="eval-service" ref={menuWrap}>
                <button
                  type="button"
                  className="eval-service-trigger"
                  aria-haspopup="listbox"
                  aria-expanded={menuOpen}
                  aria-controls="eval-service-menu"
                  disabled={busy}
                  onClick={() => setMenuOpen((value) => !value)}
                >
                  <span>{serviceLabel}</span>
                  <Icon name="chevron" />
                </button>
                {menuOpen && (
                  <div className="eval-menu" id="eval-service-menu" role="listbox" aria-label="选择服务">
                    {services.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        role="option"
                        aria-selected={item.key === service}
                        aria-disabled={!item.enabled}
                        disabled={!item.enabled}
                        onClick={() => { setService(item.key); setSource(null); setMenuOpen(false); }}
                      >
                        <span className="check"><Icon name="check" /></span>
                        <span>{item.label}</span>
                        {!item.enabled && <span className="tag">未接入</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button type="button" className="eval-tool" onClick={openPicker} disabled={busy}>
                <Icon name="book" /><span>从题库选</span>
              </button>

              <button type="button" className="eval-tool" onClick={pickRandom} disabled={busy}>
                {randomBusy ? <span className="eval-spinner" aria-hidden="true" /> : <Icon name="shuffle" />}
                <span>{source ? "换一题" : "随机一题"}</span>
              </button>
            </div>

            <div className="eval-actions">
              {length > 0 && <span className={`eval-count${over ? " over" : ""}`}>{length} / {max}</span>}
              <button type="submit" className="eval-send" aria-label="开始测评" disabled={!draftValid}>
                {submitting ? <span className="eval-spinner" aria-hidden="true" /> : <Icon name="arrow-up" />}
              </button>
            </div>
          </div>
        </form>

        {submitError ? (
          <p className="eval-error" role="alert">{submitError}</p>
        ) : draftError ? (
          <p className="eval-error">{draftError}</p>
        ) : null}
        <p className="eval-hint">{recovering ? "正在恢复最近一次运行…" : submitting ? "正在创建运行，请勿重复提交。" : "每次运行保留题目、回答及评分状态。"}</p>
      </div>

      <dialog className="eval-dialog" ref={dialog} onClose={() => setPickerOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) setPickerOpen(false); }} aria-labelledby="eval-picker-title">
        <div className="eval-dialog-body">
          <div className="eval-dialog-head">
            <div>
              <h2 id="eval-picker-title">从题库选择</h2>
              <p>服务 {serviceLabel} · 只显示适用于该服务的题目</p>
            </div>
            <button type="button" className="icon-button" aria-label="关闭题库" onClick={() => setPickerOpen(false)}>
              <Icon name="close" />
            </button>
          </div>

          <div className="search-field eval-search">
            <Icon name="search" />
            <label className="sr-only" htmlFor="eval-search">搜索题目</label>
            <input id="eval-search" type="search" value={input} placeholder="搜索题面" autoComplete="off" onChange={(event) => setInput(event.target.value)} />
          </div>

          {loading ? (
            <p className="eval-dialog-state">正在加载题目…</p>
          ) : loadError ? (
            <div className="eval-dialog-state">
              <p>{loadError}</p>
              <button type="button" className="secondary-button" onClick={() => setReload((value) => value + 1)}>重试</button>
            </div>
          ) : rows.length === 0 ? (
            <p className="eval-dialog-state">{search ? "没有找到符合条件的题目。" : "题库里还没有适用于 1110 的题目。"}</p>
          ) : (
            <div className="eval-options" role="listbox" aria-label="题目列表">
              {rows.map((row) => {
                const key = `${row.id}|${row.datasetVersion}`;
                const selected = picked?.id === row.id && picked?.datasetVersion === row.datasetVersion;
                return (
                  <button
                    key={key}
                    type="button"
                    className="eval-option"
                    role="option"
                    aria-selected={selected}
                    onClick={() => setPicked(selected ? null : row)}
                  >
                    <span className="eval-check" aria-hidden="true" />
                    <span className="eval-option-body">
                      <span className="eval-option-meta">{row.id} · {row.sourceType === "random" ? "随机题" : "固定题"} · 数据集 {row.datasetVersion}</span>
                      <span className="eval-option-text">{row.question}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {pages > 1 && (
            <div className="eval-pager">
              <button type="button" disabled={page === 0 || loading} onClick={() => setPage((value) => Math.max(0, value - 1))}>上一页</button>
              <span>{page + 1} / {pages}</span>
              <button type="button" disabled={page + 1 >= pages || loading} onClick={() => setPage((value) => value + 1)}>下一页</button>
            </div>
          )}

          <div className="eval-dialog-foot">
            <p>{loading ? "正在加载…" : `共 ${total} 道可用题目`}</p>
            <div className="eval-dialog-actions">
              <button type="button" className="secondary-button" onClick={() => setPickerOpen(false)}>取消</button>
              <button type="button" className="primary-button" disabled={!picked} onClick={usePicked}>使用此题</button>
            </div>
          </div>
        </div>
      </dialog>
    </main>
  );
}
