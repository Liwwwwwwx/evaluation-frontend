"use client";

import { useState } from "react";
import { boolState, compositionSummary, record, scalar, text, type DataRecord, type ResultCandidate, type ResultMetric } from "@/lib/structured-results";
import { DataDisclosure, StructuredValue } from "@/components/structured-value";

function MetricValue({ metric }: { metric?: ResultMetric }) {
  if (!metric) return <>未提供</>;
  return <span title={`${String(metric.value ?? "未提供")}${metric.source ? ` · 来源：${metric.source}` : ""}`}>{scalar(metric.value)}{metric.value != null && metric.unit ? ` ${metric.unit}` : ""}</span>;
}

export function CandidateResults({ candidates, title = "候选结果" }: { candidates: ResultCandidate[]; title?: string }) {
  const [query, setQuery] = useState(""); const [page, setPage] = useState(0); const [selectedId, setSelectedId] = useState("");
  const filtered = candidates.filter(row => `${row.id} ${row.formula} ${text(row.raw.name)}`.toLowerCase().includes(query.toLowerCase()));
  const pages = Math.max(1, Math.ceil(filtered.length / 10)); const active = Math.min(page, pages - 1);
  const columns = new Map<string, ResultMetric>(); for (const row of candidates) for (const metric of row.metrics) if (!columns.has(metric.key)) columns.set(metric.key, metric);
  const selected = candidates.filter(row => row.id === selectedId); const candidate = selected.length === 1 ? selected[0] : null;
  if (!candidates.length) return null;
  const hasComposition = candidates.some(row => row.composition); const hasCrystal = candidates.some(row => row.kind === "crystal"); const hasProcess = candidates.some(row => row.kind === "process");
  return <section className="run-service-section candidate-results" aria-label={title}>
    <div className="structured-section-head"><h3>{title} · {candidates.length} 项</h3>{candidates.length > 10 && <label className="structured-search"><span className="sr-only">搜索{title}编号或化学式</span><input value={query} placeholder="编号或化学式" onChange={event => { setQuery(event.target.value); setPage(0); }} /></label>}</div>
    <p className="run-score-note">数值、排序和检查结论来自被测服务；不代表实验验证。选择编号查看完整条件与依据。</p>
    <div className="run-table-wrap structured-candidate-table"><table><thead><tr><th scope="col">候选编号</th><th scope="col" className="structured-numeric">排序</th>{hasCrystal && <><th scope="col">化学式</th><th scope="col">结构检查</th><th scope="col">结构优化</th></>}{hasComposition && <th scope="col">组成（非零组分）</th>}{hasProcess && <th scope="col">工艺检查</th>}{[...columns].map(([key, metric]) => <th key={key} scope="col" className="structured-numeric">{metric.label}</th>)}</tr></thead><tbody>{filtered.slice(active * 10, (active + 1) * 10).map((row, index) => <tr key={`${row.id}-${index}`} aria-selected={row.id === selectedId}>
      <th scope="row"><button type="button" className="structured-row-link" onClick={() => setSelectedId(row.id)} aria-label={`查看候选 ${row.id}`}>{row.id}</button></th><td className="structured-numeric">{scalar(row.rank)}</td>
      {hasCrystal && <><td>{row.formula || "未提供"}</td><td>{boolState(row.valid, "服务判定有效", "服务判定无效")}</td><td>{boolState(row.converged, "已收敛", "未收敛")}</td></>}
      {hasComposition && <td className="structured-composition">{compositionSummary(row)}{row.basis && <small>{row.basis}</small>}</td>}
      {hasProcess && <td>窗口：{boolState(row.raw.window_pass, "通过", "未通过")}<br />规则：{boolState(row.raw.rules_pass, "通过", "未通过")}</td>}
      {[...columns.keys()].map(key => <td key={key} className="structured-numeric"><MetricValue metric={row.metrics.find(item => item.key === key)} /></td>)}
    </tr>)}</tbody></table></div>
    {!filtered.length && <p className="run-score-note">没有匹配的候选。</p>}
    {pages > 1 && <div className="structured-pager"><span>共{filtered.length}项 · 第{active + 1}/{pages}页</span><button type="button" className="secondary-button" disabled={!active} onClick={() => setPage(active - 1)}>上一页</button><button type="button" className="secondary-button" disabled={active + 1 >= pages} onClick={() => setPage(active + 1)}>下一页</button></div>}
    {selected.length > 1 && <p className="run-score-note" role="status">编号{selectedId}存在多条记录，未按位置合并；请在完整数据中分别查看。</p>}
    {candidate && <div className="structured-candidate-detail" role="region" aria-label={`候选 ${candidate.id} 详情`}><div className="structured-section-head"><h4>{candidate.id}{candidate.formula && ` · ${candidate.formula}`}</h4><button type="button" className="secondary-button" onClick={() => setSelectedId("")}>收起详情</button></div>
      {candidate.warning && <p className="run-score-note">{candidate.warning}</p>}
      {candidate.composition && <><h4>完整组成{candidate.basis && ` · ${candidate.basis}`}</h4><StructuredValue value={candidate.composition} /></>}
      {candidate.metrics.length > 0 && <><h4>性能与来源</h4><div className="run-table-wrap"><table><thead><tr><th>指标</th><th>数值</th><th>来源</th></tr></thead><tbody>{candidate.metrics.map(metric => <tr key={metric.key}><td>{metric.label}</td><td><MetricValue metric={metric} /></td><td>{metric.source || "未提供"}</td></tr>)}</tbody></table></div></>}
      {candidate.validation && <DataDisclosure title="结构检查、优化与验证证据" value={candidate.validation} initialOpen />}
      <DataDisclosure title="完整候选数据" value={candidate.entry} />
    </div>}
  </section>;
}

export function ProcessStages({ stages, frames, candidates, result }: { stages: DataRecord[]; frames: DataRecord[]; candidates: ResultCandidate[]; result: DataRecord | null }) {
  const [stageId, setStageId] = useState(""); const [pointId, setPointId] = useState("");
  if (!stages.length) return null;
  const stage = stages.find(value => text(value.stage_id) === stageId) || stages[stages.length - 1];
  const visual = record(stage.visual); const mode = text(visual?.mode);
  const numericList = (value: unknown) => Array.isArray(value) ? value.filter((id): id is number => typeof id === "number") : [];
  const finalIds = numericList(visual?.selected_candidate_ids); const topIds = numericList(visual?.top_ranked_candidate_ids);
  const points = candidates.filter(row => typeof row.raw.laser_power_W === "number" && typeof row.raw.scan_speed_mm_s === "number").slice(0, 1000);
  const xs = points.map(row => row.raw.laser_power_W as number); const ys = points.map(row => row.raw.scan_speed_mm_s as number);
  const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const scale = (value: number, min: number, max: number, length: number) => max > min ? (value - min) / (max - min) * length : length / 2;
  const pointState = (row: ResultCandidate) => {
    if (mode === "converge_top8_to_abc") return row.numericId != null && finalIds.includes(row.numericId) ? "selected" : "muted";
    if (mode === "top_ranked") return row.numericId != null && topIds.includes(row.numericId) ? "selected" : "muted";
    if (["engineering_filter", "cluster", "recipe_scored"].includes(mode) && row.raw.rules_pass === false) return "rejected";
    if (["window_filter", "engineering_filter", "cluster", "recipe_scored"].includes(mode) && row.raw.window_pass === false) return "rejected";
    return "retained";
  };
  const recommendationFrame = [...frames].reverse().find(frame => Array.isArray(frame.recommendations));
  const recommendations = Array.isArray(recommendationFrame?.recommendations) ? recommendationFrame.recommendations.map(record).filter((row): row is DataRecord => !!row) : [];
  const handoff = record(record(result?.handoff_to_am)?.process_diffusion_handoff); const selectedPlans = record(handoff?.selected_candidates);
  const matchedPoints = candidates.filter(row => row.id === pointId);
  const point = matchedPoints.length === 1 ? matchedPoints[0] : null;
  return <section className="run-service-section process-stage-results" aria-label="工艺阶段"><div className="structured-section-head"><h3>工艺阶段</h3>{stageId && <button type="button" className="secondary-button" onClick={() => setStageId("")}>跟随最新阶段</button>}</div>
    <div className="structured-stage-buttons" role="group" aria-label="选择工艺阶段">{stages.map((value, index) => <button type="button" key={`${text(value.stage_id)}-${index}`} aria-pressed={value === stage} onClick={() => setStageId(text(value.stage_id))}>{text(value.stage_index) || index + 1} · {text(value.title) || text(value.stage_id)}</button>)}</div>
    <p>{text(stage.title) || text(stage.stage_id)} · 输入{scalar(stage.input_count)} → 输出{scalar(stage.output_count)}</p>
    {text(record(stage.evidence)?.headline) && <h4>{text(record(stage.evidence)?.headline)}</h4>}
    {(text(record(stage.evidence)?.text) || text(stage.summary)) && <p className="run-score-note">{text(record(stage.evidence)?.text) || text(stage.summary)}</p>}
    {points.length > 0 && mode !== "empty" && <><div className="structured-scatter" aria-label="候选功率与扫描速度分布"><svg viewBox="0 0 640 300" role="group" aria-label="候选点图；横轴激光功率W，纵轴扫描速度mm每秒"><path d="M56 20V252H616" className="scatter-axis" /><text x="56" y="278">{scalar(minX)} W</text><text x="525" y="278">{scalar(maxX)} W</text><text x="4" y="24">{scalar(maxY)}</text><text x="4" y="250">{scalar(minY)}</text>{points.map((row, index) => {
      const x = 64 + scale(row.raw.laser_power_W as number, minX, maxX, 536); const y = 242 - scale(row.raw.scan_speed_mm_s as number, minY, maxY, 208);
      return <g key={`${row.id}-${index}`} role="button" tabIndex={0} aria-label={`查看点 ${row.id}`} onClick={() => setPointId(row.id)} onKeyDown={event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); setPointId(row.id); } }} className={`scatter-point ${pointState(row)}`}><title>{row.id} · {scalar(row.raw.laser_power_W)} W · {scalar(row.raw.scan_speed_mm_s)} mm/s</title><circle cx={x} cy={y} r={pointState(row) === "selected" ? 7 : 5} />{pointState(row) === "rejected" && <path d={`M${x - 4} ${y - 4}l8 8m0 -8l-8 8`} />}</g>;
    })}</svg></div><p className="run-score-note">横轴：激光功率（W）；纵轴：扫描速度（mm/s）。大圆点：阶段入选；叉号：窗口或规则未通过；淡点：未进入当前阶段展示集合。分类仅按服务返回标记。</p>{point && <p role="status">{point.id} · 功率{scalar(point.raw.laser_power_W)} W · 扫描速度{scalar(point.raw.scan_speed_mm_s)} mm/s · 基础分{scalar(point.raw.base_score)}</p>}</>}
    <DataDisclosure title="当前阶段完整数据" value={stage} />
    {recommendations.length > 0 && <div className="process-recommendations"><h4>A / B / C 推荐方案</h4><p className="run-score-note">评分为服务原值，不换算为百分制或实验准确率。</p>{recommendations.map((recommendation, index) => {
      const key = text(recommendation.key); const linked = candidates.filter(row => typeof recommendation.candidate_id === "number" && row.numericId === recommendation.candidate_id); const plan = selectedPlans?.[key];
      return <section key={`${key}-${index}`} className="process-plan"><h4>{key || index + 1} · {text(recommendation.name) || "推荐方案"}</h4><p>服务编号：{scalar(recommendation.candidate_id)}{linked.length === 1 && ` · ${linked[0].id}`} · 服务评分：{scalar(recommendation.score)}</p>{text(recommendation.reason) && <p>{text(recommendation.reason)}</p>}{!!plan && typeof plan === "object" && <DataDisclosure title={`${key}方案工序、参数窗口及检查`} value={plan} initialOpen />}<DataDisclosure title="推荐原始记录" value={recommendation} /></section>;
    })}</div>}
  </section>;
}
