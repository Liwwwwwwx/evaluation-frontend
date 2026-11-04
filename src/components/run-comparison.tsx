"use client";

import { useMemo, useRef, useState } from "react";
import { AnswerMarkdown } from "@/components/answer-markdown";
import { ConversationAnswer } from "@/components/conversation-answer";
import { BackLink, StatusDot, Tabs, type StatusTone } from "@/components/ui";
import type { Comparison, ComparisonJudge, ComparisonRun } from "@/lib/comparison-preview";
import { comparisonRequirementRows, shortTopic } from "@/lib/comparison-api";
import { comparableJudge, totalOf, type JudgeKey } from "@/lib/comparison-validity";
import { buildComparisonMarkdown, buildServiceMarkdown, comparisonOverviewFilename, comparisonServiceFilename, downloadMarkdown, exportComparisonFiles } from "@/lib/comparison-export";
import styles from "./run-comparison.module.css";

type ViewTab = "matrix" | "answers";
const judgeKeys: JudgeKey[] = ["deepSeekScore", "qwenScore"];
const judgeLabels: Record<JudgeKey, string> = { deepSeekScore: "DeepSeek", qwenScore: "千问" };
const executionLabels: Record<string, string> = { queued: "排队中", running: "运行中", succeeded: "已完成", failed: "执行失败", cancelled: "已取消" };
const judgeStateLabels: Record<string, string> = { pending: "评分中", failed: "评分失败", unavailable: "未配置", absent: "无评分", skipped: "不适用", invalid: "评分无效", unknown: "状态未知", ready: "评分完成" };
const taskLabels: Record<string, string> = { completed: "已完成", partial: "部分完成", clarification: "请求补充信息", failed: "未完成", unclear: "无法确认" };
const qualificationLabels: Record<string, string> = { qualified: "合格", not_qualified: "未合格", unclear: "无法判断" };
const requirementLabels: Record<string, string> = { met: "满足", partial: "部分", missing: "缺失", unclear: "无法确认" };

function number(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function scoreShort(value: ComparisonJudge) {
  const total = totalOf(value);
  return total === null ? judgeStateLabels[value.status] || "状态未知" : total.toFixed(1);
}

function formatScore(value: number | null) {
  return value === null ? "" : `${value.toFixed(1)} / 100`;
}

function formatDelta(value: number | null) {
  if (value === null) return "—";
  if (value === 0) return "0.0";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}

function deltaClass(value: number | null) {
  if (value === null || value === 0) return styles.deltaZero;
  return value > 0 ? styles.deltaUp : styles.deltaDown;
}

function formatElapsed(value: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "—";
  if (value < 60000) return `${Math.max(1, Math.round(value / 1000))} 秒`;
  const minutes = value / 60000;
  return minutes >= 10 ? `${Math.round(minutes)} 分` : `${minutes.toFixed(1)} 分`;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date).replace(/\//g, "-");
}

function statusLabel(status: string) { return requirementLabels[status] || "无法确认"; }
function statusTone(status: string): StatusTone {
  if (status === "met") return "success";
  if (status === "partial") return "warning";
  if (status === "missing") return "danger";
  return "neutral";
}
function dimensionRows(left: ComparisonRun, right: ComparisonRun, judgeKey: JudgeKey, comparable: boolean) {
  const ids = new Set<string>();
  for (const run of [left, right]) {
    for (const [id, value] of Object.entries(run.scores[judgeKey].quality?.dimensions || {})) {
      if (value.applicable !== false) ids.add(id);
    }
  }
  const order = ["readability", "professionalism", "visualAids"];
  return [...ids].sort((a, b) => (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b))).map((id) => {
    const l = left.scores[judgeKey].quality?.dimensions?.[id];
    const r = right.scores[judgeKey].quality?.dimensions?.[id];
    const lScore = number(l?.score);
    const rScore = number(r?.score);
    return { id, label: l?.label || r?.label || id, left: lScore, right: rScore, delta: comparable && lScore !== null && rScore !== null ? rScore - lScore : null, same: comparable && lScore === rScore };
  });
}

function qualificationSummary(run: ComparisonRun) {
  const states = judgeKeys.map((key) => run.scores[key].quality?.qualification?.status);
  if (states.every((status) => status === "not_qualified")) return "未合格";
  if (states.some((status) => status === "qualified")) return "合格";
  return "无法判断";
}

function serviceIssueLabel(run: ComparisonRun, judgeKey: JudgeKey) {
  return taskLabels[run.scores[judgeKey].quality?.taskCompletion?.status || ""] || "无法确认";
}

function StatusChip({ status }: { status?: string }) {
  if (!status) return <span className={styles.unlisted}>未列出</span>;
  return <StatusDot tone={statusTone(status)}>{statusLabel(status)}</StatusDot>;
}

function GroupRow({ children }: { children: React.ReactNode }) {
  return <tr className={styles.groupRow}><th colSpan={4}>{children}</th></tr>;
}

function Finding({ title, items }: { title: string; items: string[] }) {
  return <div className={styles.finding}><h3>{title}</h3>{items.length ? <ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className={styles.emptyNote}>未记录。</p>}</div>;
}

function GapBlock({ run, judgeKey }: { run: ComparisonRun; judgeKey: JudgeKey }) {
  const quality = run.scores[judgeKey].quality;
  return <div className={styles.gapBlock}>
    <h4>{run.serviceLabel}</h4>
    <div className={styles.gapGroup}><strong>扣分原因</strong>{quality?.gaps?.length ? <ul>{quality.gaps.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className={styles.emptyNote}>未记录。</p>}</div>
    <div className={styles.gapGroup}><strong>改进建议</strong>{quality?.suggestions?.length ? <ul>{quality.suggestions.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p className={styles.emptyNote}>未记录。</p>}</div>
  </div>;
}

function executionTone(status: string): StatusTone {
  return status === "succeeded" ? "success" : status === "queued" || status === "running" ? "info" : status === "cancelled" ? "neutral" : "danger";
}

function ServiceSummaryBlock({ run }: { run: ComparisonRun }) {
  return <div className={styles.serviceBlock}>
    <div className={styles.serviceInfo}><strong>{run.serviceLabel}</strong><span><StatusDot tone={executionTone(run.executionStatus)}>{executionLabels[run.executionStatus] || "状态未知"}</StatusDot> · {formatElapsed(run.elapsedMs)} · {qualificationSummary(run)}</span>{run.error && <span role="alert">执行错误：{run.error}</span>}</div>
    <div className={styles.scoreLine}>{judgeKeys.map((key) => <span key={key}><em>{judgeLabels[key]}</em><b>{scoreShort(run.scores[key])}</b></span>)}</div>
  </div>;
}

export function RunComparison({ comparison, preview = false, backHref = "/runs", backLabel = "返回运行记录", notice }: {
  comparison: Comparison;
  preview?: boolean;
  backHref?: string;
  backLabel?: string;
  notice?: string;
}) {
  const [tab, setTab] = useState<ViewTab>("matrix");
  const [judgeKey, setJudgeKey] = useState<JudgeKey>("deepSeekScore");
  const [diffOnly, setDiffOnly] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [syncScroll, setSyncScroll] = useState(true);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);
  const left = comparison.runs[0];
  const right = comparison.runs[1] || comparison.runs[0];

  const comparable = comparableJudge(left, right, judgeKey, preview);
  const rows = useMemo(() => comparisonRequirementRows(left, right, judgeKey, comparable), [left, right, judgeKey, comparable]);
  const dimensions = useMemo(() => dimensionRows(left, right, judgeKey, comparable), [left, right, judgeKey, comparable]);
  const selected = rows.find((row) => row.key === selectedKey) || rows.find((row) => row.left && row.right) || rows[0] || null;
  const visibleRows = diffOnly ? rows.filter((row) => !row.same) : rows;
  const sameCount = rows.filter((row) => row.same).length;
  const leftGaps = left.scores[judgeKey].quality?.gaps || [];
  const rightGaps = right.scores[judgeKey].quality?.gaps || [];
  const commonGaps = comparable ? rows.filter((row) => row.left && row.right && ["partial", "missing"].includes(row.left.status) && ["partial", "missing"].includes(row.right.status)).map((row) => row.label) : [];
  const bothComparable = judgeKeys.every((key) => comparableJudge(left, right, key, preview));
  const dsDelta = bothComparable ? (totalOf(right.scores.deepSeekScore) as number) - (totalOf(left.scores.deepSeekScore) as number) : null;
  const qwDelta = bothComparable ? (totalOf(right.scores.qwenScore) as number) - (totalOf(left.scores.qwenScore) as number) : null;
  const leader = dsDelta !== null && qwDelta !== null && dsDelta > 0 && qwDelta > 0 ? right : dsDelta !== null && qwDelta !== null && dsDelta < 0 && qwDelta < 0 ? left : null;
  const bothFailed = bothComparable && [left, right].every((run) => judgeKeys.every((key) => run.scores[key].quality?.qualification?.status === "not_qualified"));
  const dimDeltas = ["readability", "professionalism"].map((id) => {
    const l = number(left.scores.deepSeekScore.quality?.dimensions?.[id]?.score);
    const r = number(right.scores.deepSeekScore.quality?.dimensions?.[id]?.score);
    const lq = number(left.scores.qwenScore.quality?.dimensions?.[id]?.score);
    const rq = number(right.scores.qwenScore.quality?.dimensions?.[id]?.score);
    return {
      id,
      label: left.scores.deepSeekScore.quality?.dimensions?.[id]?.label || id,
      ds: comparableJudge(left, right, "deepSeekScore", preview) && l !== null && r !== null ? r - l : null,
      qw: comparableJudge(left, right, "qwenScore", preview) && lq !== null && rq !== null ? rq - lq : null,
    };
  });
  const topDimension = [...dimDeltas].sort((a, b) => Math.abs(b.ds || 0) + Math.abs(b.qw || 0) - (Math.abs(a.ds || 0) + Math.abs(a.qw || 0)))[0];
  const professionalism = dimDeltas.find((item) => item.id === "professionalism");
  const split = professionalism && professionalism.ds !== null && professionalism.qw !== null && professionalism.ds * professionalism.qw < 0
    ? `专业性 DS ${formatDelta(professionalism.ds)} · QW ${formatDelta(professionalism.qw)}`
    : null;
  const chips = [
    topDimension && (topDimension.ds !== null || topDimension.qw !== null) ? { label: topDimension.label, value: `${right.serviceLabel} ${formatDelta(topDimension.ds)} / ${formatDelta(topDimension.qw)}` } : null,
    split ? { label: "专业性分歧", value: split } : null,
    commonGaps.length ? { label: "共同缺失", value: commonGaps.slice(0, 2).map(shortTopic).join(" · ") } : null,
    rightGaps.length ? { label: `${right.serviceLabel} 风险`, value: rightGaps.slice(0, 2).map(shortTopic).join(" · ") } : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item));
  const verdictTitle = !bothComparable ? "评分暂不可比较" : leader ? `${leader.serviceLabel} 总分领先${bothFailed ? "，但双方都未合格" : ""}` : dsDelta === 0 && qwDelta === 0 ? "两家评委总分持平" : "两家评委总分结论不一致";
  const verdictText = !bothComparable ? "双方需执行完成，且同一规则、同一评委模型的评分均有效、未截断，才展示综合结论。" : `${bothFailed ? "两家评委都判定未达到合格线。" : ""}${commonGaps.length ? `双方共同缺少：${commonGaps.slice(0, 3).map(shortTopic).join("、")}。` : "双方未提取到明确的共同缺失项。"}${split ? `${split}。` : ""}`;

  function closeExport(event: React.MouseEvent<HTMLButtonElement>) {
    event.currentTarget.closest("details")?.removeAttribute("open");
  }

  function scrollBoth(percent: number) {
    for (const ref of [leftRef, rightRef]) {
      const node = ref.current;
      if (node) node.scrollTop = (node.scrollHeight - node.clientHeight) * percent / 100;
    }
  }

  function syncReader(source: HTMLDivElement | null, target: HTMLDivElement | null) {
    if (!syncScroll || syncing.current || !source || !target) return;
    const max = source.scrollHeight - source.clientHeight;
    if (max <= 0) return;
    syncing.current = true;
    target.scrollTop = (source.scrollTop / max) * (target.scrollHeight - target.clientHeight);
    requestAnimationFrame(() => { syncing.current = false; });
  }

  return <main className={styles.page} aria-labelledby="comparison-title">
    {preview && <p className={styles.previewNote} role="note"><strong>界面预览</strong> 当前为演示数据，未接入真实对比接口；所有数字仅用于查看布局和状态。</p>}
    {notice && <p className={styles.errorNote} role="alert">{notice}</p>}
    <header className={styles.header}>
      <div>
        <h1 id="comparison-title">对比测评</h1>
        <p>{left.serviceLabel} 与 {right.serviceLabel} 的同一题目结果 · 规则「{comparison.rule.name}」v{comparison.rule.version} · {formatDate(comparison.createdAt)}</p>
      </div>
      <div className={styles.headerActions}>
        <details className={styles.exportMenu}>
          <summary>导出</summary>
          <div className={styles.exportMenuBody}>
            <button type="button" onClick={(event) => { exportComparisonFiles(comparison, { preview }); closeExport(event); }}>全部导出（3 个文件）</button>
            <button type="button" onClick={(event) => { downloadMarkdown(comparisonServiceFilename(comparison, left), buildServiceMarkdown(comparison, left)); closeExport(event); }}>{left.serviceLabel}：问题 / 回答 / 评分</button>
            <button type="button" onClick={(event) => { downloadMarkdown(comparisonServiceFilename(comparison, right), buildServiceMarkdown(comparison, right)); closeExport(event); }}>{right.serviceLabel}：问题 / 回答 / 评分</button>
            <button type="button" onClick={(event) => { downloadMarkdown(comparisonOverviewFilename(comparison), buildComparisonMarkdown(comparison, { preview })); closeExport(event); }}>对比内容：结论 / 逐项核对 / 差异</button>
            <p>浏览器可能要求允许多文件下载；也可逐项导出。</p>
          </div>
        </details>
        <BackLink href={backHref}>{backLabel}</BackLink>
      </div>
    </header>

    <div className={styles.question}><span>题目</span><p>{comparison.question}</p></div>

    <div className={styles.toolbar}>
      <div className={styles.toolbarTop}>
        <Tabs
          items={[{ value: "matrix", label: "逐项核对" }, { value: "answers", label: "回答原文" }]}
          value={tab}
          onChange={(value) => setTab(value as ViewTab)}
          ariaLabel="对比测评视图"
          idBase="comparison-view"
          className={styles.toolbarTabs}
        />
        <div className={styles.controls}>
          {tab === "matrix" ? <>
            <div className={styles.judgeToggle} role="group" aria-label="切换评委">
              {judgeKeys.map((key) => <button key={key} type="button" className={styles.judgeButton} aria-pressed={judgeKey === key} onClick={() => setJudgeKey(key)}>{judgeLabels[key]}</button>)}
            </div>
            <label className={styles.diffOnly}><input type="checkbox" checked={diffOnly} onChange={(event) => setDiffOnly(event.target.checked)} /> 只看差异</label>
          </> : <span className={styles.syncHint}>两栏默认同步滚动</span>}
        </div>
      </div>
      <div className={styles.serviceSummary}>
        <ServiceSummaryBlock run={left} />
        <span className={styles.vs}>VS</span>
        <ServiceSummaryBlock run={right} />
      </div>
    </div>

    {tab === "matrix" ? <div id="comparison-view-panel-matrix" role="tabpanel" aria-labelledby="comparison-view-tab-matrix">
      <section className={styles.verdict}>
        <div className={styles.verdictText}><span className={styles.eyebrow}>结论</span><h2>{verdictTitle}</h2><p>{verdictText}</p></div>
        <div className={styles.chips}>{chips.map((chip) => <div key={`${chip.label}-${chip.value}`} className={styles.chip}><span>{chip.label}</span><b>{chip.value}</b></div>)}</div>
      </section>

      <section className={styles.matrixSection} aria-labelledby="comparison-matrix-title">
        <div className={styles.matrixHeader}>
          <div><h2 id="comparison-matrix-title">逐项核对</h2><p>点击要求行查看两边说明；切换评委可对比两家模型的判断差异。</p></div>
          <span className={styles.sectionNote}>{diffOnly ? `已隐藏 ${sameCount} 项无差异` : `${sameCount} 项无差异`}</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className="sr-only">两家服务逐项评分对比</caption>
            <thead><tr><th>评分项</th><th>{left.serviceLabel}</th><th>{right.serviceLabel}</th><th className={styles.judgeCell}>判断</th></tr></thead>
            <tbody>
              <GroupRow>任务与结论</GroupRow>
              <tr className={styles.totalRow}>
                <th>总分</th>
                <td><b>{formatScore(totalOf(left.scores[judgeKey])) || "无评分"}</b></td>
                <td><b>{formatScore(totalOf(right.scores[judgeKey])) || "无评分"}</b></td>
                <td className={styles.judgeCell}>{comparable ? <b className={deltaClass((totalOf(right.scores[judgeKey]) as number) - (totalOf(left.scores[judgeKey]) as number))}>{formatDelta((totalOf(right.scores[judgeKey]) as number) - (totalOf(left.scores[judgeKey]) as number))}</b> : <span className={styles.na}>不可比</span>}</td>
              </tr>
              <tr><th>任务完成度</th><td>{taskLabels[left.scores[judgeKey].quality?.taskCompletion?.status || ""] || "无法确认"}</td><td>{taskLabels[right.scores[judgeKey].quality?.taskCompletion?.status || ""] || "无法确认"}</td><td className={styles.judgeCell}>{!comparable ? "不可比" : serviceIssueLabel(left, judgeKey) === serviceIssueLabel(right, judgeKey) ? "持平" : "有差异"}</td></tr>
              <tr><th>内容判定</th><td>{qualificationLabels[left.scores[judgeKey].quality?.qualification?.status || ""] || "无法判断"}</td><td>{qualificationLabels[right.scores[judgeKey].quality?.qualification?.status || ""] || "无法判断"}</td><td className={styles.judgeCell}>{!comparable ? "不可比" : left.scores[judgeKey].quality?.qualification?.status === right.scores[judgeKey].quality?.qualification?.status ? "持平" : "有差异"}</td></tr>
              <GroupRow>题目要求</GroupRow>
              {visibleRows.length ? visibleRows.map((row) => <tr key={row.key} className={`${styles.requirementRow}${selected?.key === row.key ? ` ${styles.selectedRow}` : ""}`} onClick={() => setSelectedKey(row.key)}>
                <th>{row.label}</th>
                <td><StatusChip status={row.left?.status} />{row.left?.note && <span className={styles.cellNote}>{row.left.note}</span>}</td>
                <td><StatusChip status={row.right?.status} />{row.right?.note && <span className={styles.cellNote}>{row.right.note}</span>}</td>
                <td className={styles.judgeCell}>{row.winner}</td>
              </tr>) : <tr><td colSpan={4} className={styles.emptyCell}>当前筛选下没有差异项。</td></tr>}
              <GroupRow>评分维度</GroupRow>
              {dimensions.filter((row) => !diffOnly || !row.same).map((row) => <tr key={row.id} className={styles.dimensionRow}>
                <th>{row.label}</th>
                <td>{row.left === null ? "—" : `${row.left} / 100`}</td>
                <td>{row.right === null ? "—" : `${row.right} / 100`}</td>
                <td className={styles.judgeCell}>{row.delta === null ? <span className={styles.na}>不可比</span> : <b className={deltaClass(row.delta)}>{formatDelta(row.delta)}</b>}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
        {selected && <div className={styles.detail}>
          <div><h4>选中的要求</h4><p>{selected.label}</p></div>
          <div><h4>{left.serviceLabel}</h4><StatusChip status={selected.left?.status} /><p>{selected.left?.note || "该评委未提取此项。"}</p>{selected.left?.evidence && <blockquote>{selected.left.evidence.slice(0, 220)}</blockquote>}</div>
          <div><h4>{right.serviceLabel}</h4><StatusChip status={selected.right?.status} /><p>{selected.right?.note || "该评委未提取此项。"}</p>{selected.right?.evidence && <blockquote>{selected.right.evidence.slice(0, 220)}</blockquote>}</div>
        </div>}
      </section>

      <section className={styles.findings}>
        <Finding title="共同缺失" items={commonGaps.slice(0, 3).map(shortTopic)} />
        <Finding title={`${right.serviceLabel} 风险`} items={rightGaps.slice(0, 3).map(shortTopic)} />
        <Finding title={`${left.serviceLabel} 问题`} items={leftGaps.slice(0, 3).map(shortTopic)} />
      </section>

      <details className={styles.gapsPanel}>
        <summary>查看双方扣分原因与改进建议 <span>DeepSeek / 千问</span></summary>
        {judgeKeys.map((key) => <div key={key} className={styles.gapsJudge}><h3>{judgeLabels[key]}</h3><div className={styles.gapsGrid}><GapBlock run={left} judgeKey={key} /><GapBlock run={right} judgeKey={key} /></div></div>)}
      </details>
    </div> : <div id="comparison-view-panel-answers" role="tabpanel" aria-labelledby="comparison-view-tab-answers" className={styles.answersTab}>
      <div className={styles.answersToolbar}>
        <div className={styles.anchors}>{["摘要", "依据", "工艺", "风险"].map((label, index) => <button key={label} type="button" className={styles.anchorButton} onClick={() => scrollBoth([0, 32, 62, 88][index])}>{label}</button>)}</div>
        <label className={styles.syncToggle}><input type="checkbox" checked={syncScroll} onChange={(event) => setSyncScroll(event.target.checked)} /> 同步滚动</label>
      </div>
      <div className={styles.readerGrid}>
        {[left, right].map((run, index) => <article key={run.runId} className={styles.readerCol}>
          <div className={styles.readerHead}>
            <div><strong>{run.serviceLabel}</strong><span>{executionLabels[run.executionStatus] || "状态未知"} · {formatElapsed(run.elapsedMs)}</span></div>
            <span className={styles.readerScores}>DS {scoreShort(run.scores.deepSeekScore)} · QW {scoreShort(run.scores.qwenScore)}</span>
          </div>
          {run.error && <p className={styles.readerError}>{run.error}</p>}
          {run.scoreError && <p className={styles.readerError}>{run.scoreError}</p>}
          {(run.scores[judgeKey].quality?.gaps || []).length > 0 && <p className={styles.readerMark}>主要扣分：{(run.scores[judgeKey].quality?.gaps || []).slice(0, 2).join("；")}</p>}
          <div
            ref={index === 0 ? leftRef : rightRef}
            className={`${styles.readerBody} run-answer`}
            onScroll={() => index === 0 ? syncReader(leftRef.current, rightRef.current) : syncReader(rightRef.current, leftRef.current)}
            tabIndex={0}
            role="region"
            aria-label={`${run.serviceLabel} 的回答`}
          >
            {run.answer ? (run.run ? <ConversationAnswer content={run.answer} run={run.run} streaming={run.executionStatus === "running"} /> : <AnswerMarkdown content={run.answer} />) : <p className={styles.readerEmpty}>没有可显示的回答。</p>}
          </div>
        </article>)}
      </div>
    </div>}

    <p className={styles.caveat}>模型评分不等于独立事实核验；百分制只表示回答质量，不代表科学真实性。分差只在两边都可比较时展示。</p>
  </main>;
}
