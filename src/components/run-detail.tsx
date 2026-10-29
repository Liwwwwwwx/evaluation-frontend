"use client";

import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

type QualityDimension = { label: string; score: number; note: string };

type Quality = {
  summary?: string;
  confidence?: string;
  source?: { chars: number; truncated: boolean };
  understanding?: { status: string; note: string; met: string[]; missed: string[]; quote: string };
  clarity?: { score: number; difficulty: string; dimensions: Record<string, QualityDimension>; painPoints: string[] };
  taskCompletion?: {
    status: string;
    reason: string;
    requirements: { requirement: string; status: string; evidence: string }[];
    externalVerification?: string;
  };
  scientificReview?: {
    checks: { item: string; status: string; evidence: string }[];
    limitations: string[];
    status: string;
    accuracyVerified?: boolean;
  };
};

type ScoreState = { status: string; error: string | null; quality: Quality | null };

const EMPTY_SCORE: ScoreState = { status: "absent", error: null, quality: null };

type RunResult = {
  runId: string;
  status: string;
  question: string;
  verdict: string | null;
  elapsedMs: number | null;
  error: string | null;
  markdownSyntax: { status: string; issues: { id: string; status: string; detail: string }[] } | null;
  answer: string | null;
  deepSeekScore: ScoreState;
  qwenScore: ScoreState;
  startedAt: string | null;
  finishedAt: string | null;
};

type RunMeta = {
  questionId?: string | null;
  questionDatasetVersion?: string | null;
  questionSourceType?: string | null;
};

function cleanAnswer(text: string) {
  return text
    .replace(/<<<[^<>]{1,80}>>>/g, "")
    .replace(/\[(?:start|end)\]/gi, "")
    .trim();
}

function message(error: unknown) {
  return error instanceof Error ? error.message : "请求失败，请稍后重试。";
}

async function jsonRequest(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { cache: "no-store", signal });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    const detail = typeof data.error === "string" ? data.error : typeof data.error?.message === "string" ? data.error.message : "";
    throw new Error(detail || `请求失败（${response.status}）`);
  }
  return data;
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDuration(ms: number | null) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分 ${seconds % 60} 秒`;
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`;
}

function runStatusLabel(status: string) {
  if (status === "running") return "运行中";
  if (status === "done") return "已结束";
  if (status === "error") return "失败";
  return "状态未知";
}

function runStatusClass(status: string) {
  if (status === "running") return "run-dot running";
  if (status === "done") return "run-dot done";
  if (status === "error") return "run-dot error";
  return "run-dot";
}

function scoreStatusLabel(state: ScoreState, kind: "check" | "model") {
  if (state.status === "pending") return kind === "check" ? "机检中" : "评分中";
  if (state.status === "ready") return "已完成";
  if (state.status === "failed") return "评分失败";
  if (state.status === "absent") return "无评分";
  if (state.status === "unavailable") return "未配置";
  if (state.status === "skipped") return "不适用";
  return "状态未知";
}

function scoreStatusClass(state: ScoreState) {
  if (state.status === "pending") return "run-dot running";
  if (state.status === "ready") return "run-dot done";
  if (state.status === "failed") return "run-dot error";
  return "run-dot";
}

function percent(score: number) {
  const value = Math.round((score / 5) * 1000) / 10;
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1)} / 100`;
}

const understandingLabels: Record<string, string> = {
  on_target: "贴合题面",
  partial: "部分贴合",
  off_target: "偏离题面",
  unclear: "无法判断",
};

const requirementLabels: Record<string, string> = {
  met: "已满足",
  partial: "部分满足",
  missing: "缺失",
  unclear: "无法确认",
};

const taskLabels: Record<string, string> = {
  completed: "已完成",
  partial: "部分完成",
  clarification: "请求补充信息",
  failed: "未完成",
  unclear: "无法确认",
};

const checkLabels: Record<string, string> = {
  passed: "通过",
  observe: "有提示",
  failed: "未通过",
  not_evaluable: "无法评估",
  consistent: "一致",
  issue: "有疑点",
  unclear: "无法判断",
  not_applicable: "不适用",
};

function ModelScore({ name, state, running }: { name: string; state: ScoreState; running: boolean }) {
  const quality = state.quality;
  const clarity = quality?.clarity;
  const waiting = running && state.status !== "ready" && state.status !== "failed";
  return (
    <div className="run-score">
      <div className="run-score-head">
        <span className={scoreStatusClass(state)} />
        <strong>{name}</strong>
        <span className={`run-score-value${state.status === "ready" && clarity ? " done" : ""}`}>
          {state.status === "ready" && clarity ? percent(clarity.score) : waiting ? "等待运行结束" : scoreStatusLabel(state, "model")}
        </span>
      </div>
      {state.status === "ready" && clarity ? (
        <>
          <p className="run-score-note">
            原分 {clarity.score} / 5 · 可理解度{quality?.understanding ? ` · ${understandingLabels[quality.understanding.status] || quality.understanding.status}` : ""}
          </p>
          {quality?.understanding?.note && <p className="run-score-note">{quality.understanding.note}</p>}
          {quality?.summary && <p className="run-score-note">{quality.summary}</p>}
          {quality?.source?.truncated && <p className="run-score-note">回答已截断，评分只针对前段内容。</p>}
        </>
      ) : waiting ? null : state.status === "failed" ? (
        <p className="run-score-note">{state.error || "评分失败，稍后可刷新重试。"}</p>
      ) : state.status === "absent" || state.status === "unavailable" ? (
        <p className="run-score-note">{state.status === "absent" ? "本次运行没有生成该模型的评分。" : "该模型评分未配置。"}</p>
      ) : null}
    </div>
  );
}

export function RunDetail({ runId }: { runId: string }) {
  const [data, setData] = useState<RunResult | null>(null);
  const [meta, setMeta] = useState<RunMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const settled = useRef(false);

  useEffect(() => {
    let active = true;
    jsonRequest(`/api/evaluation/runs/${encodeURIComponent(runId)}`)
      .then((value) => { if (active) setMeta(value as RunMeta); })
      .catch(() => { if (active) setMeta(null); });
    return () => { active = false; };
  }, [runId]);

  useEffect(() => {
    let active = true;
    settled.current = false;

    const load = async () => {
      try {
        const value = (await jsonRequest(`/api/evaluation/result/${encodeURIComponent(runId)}`)) as RunResult;
        if (!active) return;
        setData(value);
        setError("");
        const pending = value.status === "running" || value.deepSeekScore?.status === "pending" || value.qwenScore?.status === "pending";
        if (!pending) settled.current = true;
      } catch (err) {
        if (!active) return;
        setError(message(err));
      } finally {
        if (active) setLoading(false);
      }
    };

    const timer = window.setInterval(() => {
      if (settled.current) {
        window.clearInterval(timer);
        return;
      }
      void load();
    }, 4000);
    void load();
    return () => { active = false; window.clearInterval(timer); };
  }, [runId, tick]);

  const quality = data?.deepSeekScore?.quality || null;
  const task = quality?.taskCompletion || null;
  const science = quality?.scientificReview || null;
  const md = data?.markdownSyntax || null;
  const running = data ? data.status === "running" : false;
  const answerText = data?.answer ? cleanAnswer(data.answer) : "";
  const pending = data ? data.status === "running" || data.deepSeekScore?.status === "pending" || data.qwenScore?.status === "pending" : false;

  return (
    <div className="chat-view">
      <div className="chat-top">
        <h1>运行详情</h1>
        <span className={runStatusClass(data?.status ?? "running")} />
        <span>{data ? `${runStatusLabel(data.status)} · 1110` : "正在读取运行…"}</span>
        {pending && <span className="run-muted">页面会自动刷新</span>}
      </div>

      <div className="chat-scroll">
        <div className="chat-scroll-inner">
          {loading && !data ? (
            <p className="chat-state">正在读取运行…</p>
          ) : error && !data ? (
            <div className="chat-state">
              <p>{error}</p>
              <button type="button" className="secondary-button" onClick={() => { setLoading(true); setError(""); setTick((value) => value + 1); }}>重试</button>
            </div>
          ) : data ? (
            <div className="run-layout">
          <div className="run-chat" role="region" aria-label="对话内容" tabIndex={0}>
            <p className="run-question">{data.question}</p>
            <section className="run-answer-block">
              <div className="run-answer-head">
                <strong>1110</strong>
                <span>回答</span>
                <span className="run-answer-state">
                  {data.status === "running" ? "生成中" : data.status === "error" ? "未完成" : "已输出"}
                </span>
              </div>
              {answerText ? (
                <div className="run-answer">
                  <Markdown remarkPlugins={[remarkGfm]} components={{ table: ({ children, ...props }) => <div className="run-table-wrap"><table {...props}>{children}</table></div> }}>{answerText}</Markdown>
                </div>
              ) : (
                <p className="run-answer empty">
                  {data.status === "running" ? "服务正在生成回答，单题通常需要数分钟，页面会自动刷新。" : data.error || "本次运行没有返回回答。"}
                </p>
              )}
            </section>
          </div>

          <aside className="run-panel" aria-labelledby="run-result-title" tabIndex={0}>
            <div className="run-panel-head">
              <h2 id="run-result-title">测评结果</h2>
              <p>运行结束不代表题目要求已完成</p>
            </div>

            <section className="run-block">
              <h3>运行信息</h3>
              <dl className="run-info">
                <div><dt>服务</dt><dd>1110</dd></div>
                <div><dt>来源</dt><dd>{meta ? (meta.questionId ? `题库 ${meta.questionId}` : "自定义提问") : "—"}</dd></div>
                {meta?.questionDatasetVersion && <div><dt>数据集</dt><dd>{meta.questionDatasetVersion}</dd></div>}
                <div><dt>运行 ID</dt><dd className="mono">{data.runId}</dd></div>
                <div><dt>开始时间</dt><dd>{formatDateTime(data.startedAt)}</dd></div>
                <div><dt>结束时间</dt><dd>{formatDateTime(data.finishedAt)}</dd></div>
                <div><dt>耗时</dt><dd>{formatDuration(data.elapsedMs)}</dd></div>
              </dl>
            </section>

            <section className="run-block">
              <h3>评分</h3>

              <div className="run-score">
                <div className="run-score-head">
                  <span className={md && !running ? (md.status === "failed" ? "run-dot error" : "run-dot done") : "run-dot"} />
                  <strong>Markdown 机检</strong>
                  <span className="run-score-value">{running || !md ? "等待运行结束" : checkLabels[md.status] || md.status}</span>
                </div>
                {!running && md?.issues?.length ? (
                  <ul className="run-list">
                    {md.issues.map((issue) => <li key={issue.id}>{issue.id} · {issue.detail}</li>)}
                  </ul>
                ) : !running && md ? (
                  <p className="run-score-note">未发现 Markdown 结构问题；机检只覆盖已有规则。</p>
                ) : null}
              </div>

              <div className="run-score">
                <div className="run-score-head">
                  <span className={task ? "run-dot done" : "run-dot"} />
                  <strong>任务完成情况</strong>
                  <span className="run-score-value">{task ? taskLabels[task.status] || task.status : running ? "等待运行结束" : scoreStatusLabel(data.deepSeekScore ?? EMPTY_SCORE, "model")}</span>
                </div>
                {task ? (
                  <>
                    <p className="run-score-note">{task.reason}</p>
                    <ul className="run-list">
                      {task.requirements.map((item, index) => (
                        <li key={`${index}-${item.requirement.slice(0, 12)}`}>
                          [{requirementLabels[item.status] || item.status}] {item.requirement}
                          {item.evidence ? ` — ${item.evidence}` : ""}
                        </li>
                      ))}
                    </ul>
                    <p className="run-score-note">要求清单由模型提取，尚未做独立外部验证。</p>
                  </>
                ) : null}
              </div>

              <ModelScore name="DeepSeek" state={data.deepSeekScore ?? EMPTY_SCORE} running={running} />
              <ModelScore name="Qwen" state={data.qwenScore ?? EMPTY_SCORE} running={running} />

              <div className="run-score">
                <div className="run-score-head">
                  <span className={science ? "run-dot done" : "run-dot"} />
                  <strong>科学检查与局限</strong>
                  <span className="run-score-value">{science ? (science.status === "ready" ? "已列出" : "不完整") : running ? "等待运行结束" : "等待评分"}</span>
                </div>
                {science ? (
                  <>
                    {science.checks.length > 0 && (
                      <ul className="run-list">
                        {science.checks.map((item, index) => (
                          <li key={`${index}-${item.item.slice(0, 10)}`}>{checkLabels[item.status] || item.status} · {item.item}{item.evidence ? ` — ${item.evidence}` : ""}</li>
                        ))}
                      </ul>
                    )}
                    {science.limitations.length > 0 && (
                      <ul className="run-list">
                        {science.limitations.map((item, index) => <li key={`limit-${index}`}>{item}</li>)}
                      </ul>
                    )}
                    <p className="run-score-note">以上疑点未做独立核验，不代表已确认正确或错误。</p>
                  </>
                ) : null}
              </div>
            </section>

            <p className="run-note">模型评分与任务完成判断不代表科学真实性；失败、缺失或未配置会分别标注，不显示为零分。</p>
          </aside>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
