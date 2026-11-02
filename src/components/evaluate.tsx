"use client";

import { questionDomains } from "@/lib/question-domains";
import { RunServiceDetails } from "@/components/run-service-details";
import { UnifiedScores } from "@/components/unified-scores";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ConversationAnswer } from "@/components/conversation-answer";
import { Button, Dialog, EmptyState, InlineAlert, Pagination, Select } from "@/components/ui";
import { createUnifiedRun } from "@/lib/unified-run-request";
import { watchLiveUnifiedRun } from "@/lib/unified-run-watch";
import { availableEvaluationServices, evaluationServiceCatalog, isEvaluationService, preferredEvaluationService } from "@/lib/evaluation-services";

type BankQuestion = {
  id: string;
  question: string;
  serviceKey: string | null;
  domainKey?: string | null;
  sourceType: string;
  datasetVersion: string;
};

type IconName = "book" | "shuffle" | "close" | "check" | "search" | "chevron" | "arrow-up";

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
  return `/api/question-bank/questions?${new URLSearchParams({ runnableFor: service, status: "active", ...params })}`;
}


export function Evaluate() {
  const [draft, setDraft] = useState("");
  const [source, setSource] = useState<BankQuestion | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [service, setService] = useState("mission-material");
  const [services, setServices] = useState(evaluationServiceCatalog);
  const [domain, setDomain] = useState("");
  const [bankSource, setBankSource] = useState("");
  const [randomBusy, setRandomBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [run, setRun] = useState<{ id: string; question: string; service: string; answer: string; status: string; executionStatus?: string; scoringStatus?: string; result: unknown; scores: unknown; scoreError: string; truncated: boolean; snapshotOnly?: boolean; canReply?: boolean } | null>(null);
  const [recovering, setRecovering] = useState(false);
  const runId = useRef("");
  const stopRecovery = useRef<(() => void) | null>(null);
  useEffect(() => () => { runId.current = ""; stopRecovery.current?.(); }, []);
  const [recoveryRetry, setRecoveryRetry] = useState(0);
  const [hasPendingRequest, setHasPendingRequest] = useState(false);
  const resetRun = useCallback(() => {
    stopRecovery.current?.(); stopRecovery.current = null;
    runId.current = "";
    sessionStorage.removeItem("evaluation-unified-run");
    window.dispatchEvent(new Event("evaluation-unified-change"));
    setRun(null); setSubmitting(false); setRecovering(false); setSubmitError("");
  }, []);

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

  const menuWrap = useRef<HTMLDivElement>(null);

  const trimmed = draft.trim();
  const length = draft.length;
  const max = service === "synthesis" ? 200 : MAX;
  const min = MIN;
  const unsupportedPending = hasPendingRequest && !isEvaluationService(service);
  const sourceMatchesService = !source?.serviceKey || source.serviceKey === service;
  const over = trimmed.length > max;
  const draftValid = sourceMatchesService && services.some(item => item.key === service && item.enabled) && trimmed.length >= min && !over && !submitting && !recovering;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const serviceLabel = services.find((item) => item.key === service)?.label ?? "暂未接入的服务";
  const busy = submitting || randomBusy;

  useEffect(() => {
    const controller = new AbortController();
    jsonRequest("/api/evaluation/unified/services", { signal: controller.signal }).then(data => {
      const available = availableEvaluationServices(data.items);
      setServices(available);
      // 待确认请求必须保留原服务，避免在刷新后改投其他服务。
      setService(current => sessionStorage.getItem("evaluation-unified-pending") ? current : preferredEvaluationService(available, current));
      if (!available.some(item => item.enabled)) setSubmitError("测评执行尚未启用，当前可查看题库和运行记录。");
    }).catch(error => { if (!controller.signal.aborted) setSubmitError(message(error)); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const selected = sessionStorage.getItem("evaluation-selected-question");
    if (!selected || sessionStorage.getItem("evaluation-unified-pending")) return;
    try {
      const row = JSON.parse(selected) as BankQuestion;
      if (row && typeof row.id === "string" && typeof row.datasetVersion === "string" && typeof row.question === "string" && (row.serviceKey === null || typeof row.serviceKey === "string") && ["fixed", "random"].includes(row.sourceType)) {
        if (row.serviceKey && !isEvaluationService(row.serviceKey)) {
          sessionStorage.removeItem("evaluation-selected-question");
          setSubmitError("这道题绑定的服务暂未接入，请重新选题或直接输入新题目。");
          return;
        }
        setDraft(row.question); if (row.serviceKey) setService(row.serviceKey); setSource(row);
        sessionStorage.removeItem("evaluation-selected-question");
      }
    } catch { setSubmitError("无法读取选中的题目，请返回题库重试。"); }
  }, []);

  useEffect(() => {
    const pendingText = sessionStorage.getItem("evaluation-unified-pending");
    if (!pendingText) return;
    setHasPendingRequest(true);
    try {
      const pending = JSON.parse(pendingText) as { body?: string };
      const body = JSON.parse(pending.body || "{}") as Record<string, unknown>;
      if (typeof body.question === "string" && typeof body.serviceKey === "string") {
        setDraft(body.question); setService(body.serviceKey);
        if (typeof body.questionId === "string" && typeof body.datasetVersion === "string" && typeof body.sourceType === "string") {
          setSource({ id: body.questionId, question: body.question, serviceKey: body.serviceKey, datasetVersion: body.datasetVersion, sourceType: body.sourceType });
        }
        setSubmitError(isEvaluationService(body.serviceKey) ? "上次提交的结果尚未确认，可使用原题重试以恢复原运行。" : "上次提交对应的服务暂不接入，请先核对运行记录，再允许新建测评。");
      }
    } catch { setSubmitError("上次提交状态无法读取，请先核对运行记录。"); }
  }, []);

  useEffect(() => {
    const startNew = (event: Event) => {
      if (submitting && !runId.current) { event.preventDefault(); setSubmitError("正在创建运行，请稍候。"); return; }
      resetRun();
    };
    window.addEventListener("evaluation-new-request", startNew);
    return () => window.removeEventListener("evaluation-new-request", startNew);
  }, [submitting, resetRun]);

  useEffect(() => {
    if (submitting) return;
    const id = sessionStorage.getItem("evaluation-unified-run");
    if (!id) return;
    runId.current = id;
    setRecovering(true);
    const stop = watchLiveUnifiedRun(id, {
      onData: data => {
        if (runId.current !== id) return;
        setRun({ id, question: data.question || "", service: data.serviceKey || "", answer: data.answer || "", status: data.status || "unknown", executionStatus: data.executionStatus, scoringStatus: data.scoringStatus, result: data.run, scores: data.scores || null, scoreError: data.scoreError || "", truncated: data.answerTruncated === true, snapshotOnly: data.recoveryState === "snapshot_only", canReply: data.canReply === true });
        setSubmitError(data.persistenceError === true ? "记录保存失败；请稍后读取原运行，不要重复发起。" : "");
        setRecovering(false);
      },
      onError: (error, retrying) => {
        if (runId.current !== id) return;
        setSubmitError(`无法恢复运行：${error}${retrying ? "；正在自动重试。" : "；请重试读取原运行。"}`);
        setRecovering(false);
      },
    });
    stopRecovery.current = stop;
    return () => { stop(); if (stopRecovery.current === stop) stopRecovery.current = null; };
  }, [submitting, recoveryRetry]);

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
    if (domain) params.domain = domain;
    if (bankSource) params.source = bankSource;
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
  }, [pickerOpen, page, search, reload, service, domain, bankSource]);

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
      const first = await jsonRequest(bankUrl(service, { limit: "1", offset: "0", ...(domain ? { domain } : {}), ...(bankSource ? { source: bankSource } : {}) }));
      const count = Number(first.total);
      if (!Number.isFinite(count) || count < 1) throw new Error("题库中还没有适用于当前服务的题目。");
      const offset = Math.floor(Math.random() * count);
      const data = offset === 0 ? first : await jsonRequest(bankUrl(service, { limit: "1", offset: String(offset), ...(domain ? { domain } : {}), ...(bankSource ? { source: bankSource } : {}) }));
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
    let id = "";
    try {
      const body = JSON.stringify({ serviceKey: service, question: trimmed, ...(source ? { questionId: source.id, datasetVersion: source.datasetVersion, sourceType: source.sourceType } : {}) });
      id = await createUnifiedRun(body);
      runId.current = id;
      sessionStorage.setItem("evaluation-unified-run", id);
      sessionStorage.removeItem("evaluation-unified-pending");
      setHasPendingRequest(false);
      window.dispatchEvent(new Event("evaluation-unified-change"));
      setRun({ id, question: trimmed, service, answer: "", status: "running", result: null, scores: null, scoreError: "", truncated: false });
    } catch (error) {
      if (id && runId.current !== id) return;
      const uncertain = Boolean(sessionStorage.getItem("evaluation-unified-pending"));
      setSubmitError(`${message(error)}${runId.current ? " 可根据已有运行 ID 恢复。" : uncertain ? " 请先核对运行记录后再重试。" : ""}`);
    } finally { if (!id || runId.current === id) { setHasPendingRequest(Boolean(sessionStorage.getItem("evaluation-unified-pending"))); setSubmitting(false); } }
  }

  const draftError = !sourceMatchesService
    ? "这道题仅适用于原服务，请切回对应服务或重新选题。"
    : over
    ? `题目超过 ${max} 个字符，请精简后再发起。`
    : trimmed && trimmed.length < min ? `题目过短，至少需要 ${min} 个字符。` : "";

  if (run) return <div className="chat-view"><div className="chat-top"><h1>运行详情</h1><span className={`run-dot ${run.status === "done" ? "done" : run.status === "error" ? "error" : "running"}`} /><span>{run.status === "done" ? "已结束" : run.status === "error" ? "失败" : run.status === "scoring" ? "评分中" : run.status === "queued" ? "排队中" : "运行中"} · {services.find((item) => item.key === run.service)?.label || run.service}</span></div><div className="chat-scroll"><div className="chat-scroll-inner"><div className="run-layout"><div className="run-chat" tabIndex={0} role="region" aria-label="对话内容"><p className="run-question">{run.question}</p><section className="run-answer-block"><div className="run-answer-head"><strong>{services.find((item) => item.key === run.service)?.label || run.service}</strong><span>回答</span></div><div className="run-answer"><ConversationAnswer content={run.answer} run={run.result} streaming={run.executionStatus === "running" || (!run.executionStatus && run.status === "running")} /></div><RunServiceDetails run={run.result} runId={run.id} canReply={run.canReply} snapshotOnly={run.snapshotOnly} />{run.truncated && <p className="run-score-note">恢复的回答已截断。</p>}{submitError && <InlineAlert tone="danger" className="eval-alert" action={<Button type="button" variant="secondary" size="sm" onClick={() => setRecoveryRetry(value => value + 1)}>重试读取运行</Button>}>{submitError}</InlineAlert>}</section></div><aside className="run-panel"><div className="run-panel-head"><h2>评分</h2></div>{run.snapshotOnly && ["queued", "running", "scoring"].includes(run.status) && <p className="run-score-note">显示的是已保存的快照，当前进程不能确认任务是否仍在执行或排队；请先核对运行记录。</p>}{run.scoreError && <p className="run-score-note">{run.scoreError}</p>}<UnifiedScores scores={run.scores} run={run.result} executionStatus={run.executionStatus || "running"} /><Button type="button" variant="secondary" disabled={submitting && !run.id} onClick={resetRun}>新建测评</Button></aside></div></div></div></div>;

  return (
    <main className="eval-page">
      <div className="eval-inner">
        <section className="eval-intro">
          <h1>要测评什么？</h1>
          <p>从题库选题或直接输入，再选择服务发起单题测评。</p>
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
            disabled={submitting || unsupportedPending}
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
                  disabled={busy || unsupportedPending}
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
                        onClick={() => { setService(item.key); if (source?.serviceKey && source.serviceKey !== item.key) setSource(null); setMenuOpen(false); }}
                      >
                        <span className="check"><Icon name="check" /></span>
                        <span>{item.label}</span>
                        {!item.enabled && <span className="tag">未启用</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button type="button" className="eval-tool" onClick={openPicker} disabled={busy || unsupportedPending}>
                <Icon name="book" /><span>从题库选</span>
              </button>

              <button type="button" className="eval-tool" onClick={pickRandom} disabled={busy || unsupportedPending}>
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

        {hasPendingRequest && <div className="eval-pending-recovery"><p>上次提交可能已创建任务，请先核对运行记录。允许新建不会取消已发出的运行。</p><div className="run-review-actions"><Button href="/runs" target="_blank" rel="noopener noreferrer" variant="ghost" size="sm">查看运行记录</Button><Button type="button" variant="secondary" disabled={busy} onClick={() => { sessionStorage.removeItem("evaluation-unified-pending"); setHasPendingRequest(false); setSubmitError(""); if (unsupportedPending) { setService(preferredEvaluationService(services, "mission-material")); setSource(null); setDraft(""); } }}>已核对记录，允许新建</Button></div></div>}
        {submitError && runId.current && !run && <Button type="button" variant="secondary" onClick={() => setRecoveryRetry(value => value + 1)}>重试读取运行</Button>}
        {submitError ? (
          <InlineAlert tone="danger" className="eval-alert">{submitError}</InlineAlert>
        ) : draftError ? (
          <InlineAlert tone="danger" className="eval-alert">{draftError}</InlineAlert>
        ) : null}
        <p className="eval-hint">{recovering ? "正在恢复最近一次运行…" : submitting ? "正在创建运行，请勿重复提交。" : "每次运行保留题目、回答及评分状态。"}</p>
      </div>

      <Dialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="从题库选择"
        description="选择领域和题型；仅显示可在当前服务执行且不带专属评分规则的题目"
        footerStart={<p>{loading ? "正在加载…" : `共 ${total} 道可用题目`}</p>}
        footer={<>
          <Button type="button" variant="secondary" onClick={() => setPickerOpen(false)}>取消</Button>
          <Button type="button" variant="primary" disabled={!picked} onClick={usePicked}>使用此题</Button>
        </>}
      >
        <div className="import-fields">
          <Select block label="领域" value={domain} onChange={(value) => { setDomain(value); setPage(0); setPicked(null); }} options={[{ value: "", label: "全部领域" }, { value: "unclassified", label: "未分类" }, ...Object.entries(questionDomains).map(([key, label]) => ({ value: key, label }))]} />
          <Select block label="题型" value={bankSource} onChange={(value) => { setBankSource(value); setPage(0); setPicked(null); }} options={[{ value: "", label: "固定题和随机题" }, { value: "fixed", label: "固定题" }, { value: "random", label: "随机题" }]} />
        </div>
        <div className="search-field eval-search">
          <Icon name="search" />
          <label className="sr-only" htmlFor="eval-search">搜索题目</label>
          <input id="eval-search" type="search" value={input} placeholder="搜索题面" autoComplete="off" onChange={(event) => setInput(event.target.value)} />
        </div>

        {loading ? (
          <EmptyState compact state="loading" title="正在加载题目…" />
        ) : loadError ? (
          <EmptyState compact state="error" title={loadError} action={<Button type="button" variant="secondary" onClick={() => setReload((value) => value + 1)}>重试</Button>} />
        ) : rows.length === 0 ? (
          <EmptyState compact state="empty" title={search ? "没有找到符合条件的题目。" : "当前条件下没有可用题目。"} />
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
                    <span className="eval-option-meta">{questionDomains[row.domainKey || ""] || "未分类"} · {row.sourceType === "random" ? "随机题" : "固定题"} · 数据集 {row.datasetVersion}</span>
                    <span className="eval-option-text">{row.question}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {pages > 1 && <Pagination page={page + 1} pages={pages} total={total} pageSize={PAGE_SIZE} disabled={loading} onPageChange={(next) => setPage(next - 1)} />}
      </Dialog>
    </main>
  );
}
