"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

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
  { key: "alloy", label: "合金材料", enabled: false },
  { key: "literature", label: "文献", enabled: false },
  { key: "literature-aircraft", label: "航空文献", enabled: false },
  { key: "synthesis", label: "综合任务", enabled: false },
  { key: "new-material", label: "新材料", enabled: false },
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

function bankUrl(params: Record<string, string>) {
  return `/api/question-bank/questions?${new URLSearchParams({ service: "alpha-rsi", source: "fixed", status: "active", ...params })}`;
}

export function Evaluate() {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [source, setSource] = useState<BankQuestion | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [service, setService] = useState("alpha-rsi");
  const [randomBusy, setRandomBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

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
  const over = length > MAX;
  const draftValid = trimmed.length >= MIN && !over && !submitting;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const serviceLabel = services.find((item) => item.key === service)?.label ?? "1110";
  const busy = submitting || randomBusy;

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
    jsonRequest(bankUrl(params), { signal: controller.signal })
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
  }, [pickerOpen, page, search, reload]);

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
      const first = await jsonRequest(bankUrl({ limit: "1", offset: "0" }));
      const count = Number(first.total);
      if (!Number.isFinite(count) || count < 1) throw new Error("题库中还没有适用于 1110 的题目。");
      const offset = Math.floor(Math.random() * count);
      const data = offset === 0 ? first : await jsonRequest(bankUrl({ limit: "1", offset: String(offset) }));
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
      const data = await jsonRequest("/api/evaluation/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: trimmed,
          ...(source ? { questionId: source.id, datasetVersion: source.datasetVersion, sourceType: source.sourceType === "random" ? "random" : "fixed" } : {}),
        }),
      });
      if (typeof data.runId !== "string" || !data.runId) throw new Error("评测服务未返回运行 ID，请稍后重试。");
      router.push(`/runs/${data.runId}`);
    } catch (error) {
      setSubmitError(message(error));
      setSubmitting(false);
    }
  }

  const draftError = over
    ? `题目超出 ${length - MAX} 个字符，请精简后再发起。`
    : trimmed && trimmed.length < MIN ? "题目过短，至少需要 8 个字符。" : "";

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
            placeholder="输入要在 1110 上测评的题目，或从题库随机带入…"
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
                        onClick={() => { setService(item.key); setMenuOpen(false); }}
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
              {length > 0 && <span className={`eval-count${over ? " over" : ""}`}>{length} / {MAX}</span>}
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
        <p className="eval-hint">{submitting ? "正在创建运行，请勿关闭页面" : "一次运行只包含一道题 · 回答由 Markdown 机检、DeepSeek 与 Qwen 分别评分"}</p>
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
