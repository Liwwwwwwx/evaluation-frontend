"use client";

import { useState } from "react";
import { CandidateResults, ProcessStages } from "@/components/candidate-results";
import { ResultArtifacts } from "@/components/result-artifacts";
import { DataDisclosure, ResultContext } from "@/components/structured-value";
import { materialContext, record, records, resultCandidates, scalar, text, type DataRecord } from "@/lib/structured-results";

function Requirements({ result }: { result: DataRecord | null }) {
  const [limit, setLimit] = useState(12);
  const assessment = record(result?.requirement_assessment); const rows = records(assessment?.requirements);
  if (!rows.length) return null;
  const labels: Record<string, string> = { compiled: "已纳入计划", adopted: "已采纳", compared: "已比较", unverified: "未验证", missing: "缺失", not_computed: "未计算", failed: "失败", partial: "部分", verified: "服务已核验" };
  return <section className="run-service-section"><h3>要求落实情况 · {rows.length} 项</h3><p className="run-score-note">这是服务对要求的解释与核验记录；已纳入计划或已采纳不等于已执行或已实验验证。</p><div className="run-table-wrap"><table><thead><tr><th>原始要求</th><th>处理状态</th><th>核验状态</th><th>说明与答复</th></tr></thead><tbody>{rows.slice(0, limit).map((row, index) => <tr key={`${text(row.id)}-${index}`}><td>{text(row.quote) || text(row.name) || text(row.id) || "未提供"}</td><td>{labels[text(row.status)] || text(row.status) || "未提供"}</td><td>{labels[text(row.verification)] || text(row.verification) || "未提供"}</td><td>{text(row.answer) || "未提供"}</td></tr>)}</tbody></table></div>{rows.length > limit && <button type="button" className="secondary-button" onClick={() => setLimit(value => value + 24)}>显示更多要求</button>}<DataDisclosure title="完整要求与证据" value={assessment} /></section>;
}

export function StructuredOutcomes({ details, runId }: { details: DataRecord; runId: string }) {
  const snapshot = record(details.snapshot); const result = record(snapshot?.data) || record(details.result);
  const frames = records(details.protocolFrames); const stages = frames.filter(frame => frame.stage_id);
  const candidates = resultCandidates(result, frames);
  const files = Array.isArray(details.artifacts) ? details.artifacts : [];
  const progress = Array.isArray(details.progress) ? details.progress : [];
  const initial = records(result?.initial_candidates); const nearest = records(result?.nearest_candidates);
  const hasData = result || frames.length || progress.length || files.length;
  const context = materialContext(result);
  return <>{hasData ? <>
    {Object.keys(context).length > 0 && <ResultContext value={context} />}
    <Requirements result={result} />
    <ProcessStages stages={stages} frames={frames} candidates={candidates} result={result} />
    <CandidateResults candidates={candidates} />
    {initial.length > 0 && <details className="run-service-section"><summary>初始候选 · {initial.length} 项</summary><CandidateResults title="初始候选" candidates={resultCandidates({ candidates: initial }, [])} /></details>}
    {nearest.length > 0 && <CandidateResults title="近似候选" candidates={resultCandidates({ candidates: nearest }, [])} />}
    <ResultArtifacts files={files} runId={runId} />
    {progress.length > 0 && <DataDisclosure title={`全部进度记录 · ${progress.length} 条`} value={progress} />}
  </> : null}
    <DataDisclosure title={`查看完整结构化结果${frames.length ? `（${frames.length}个协议帧）` : ""}`} value={details} />
    {snapshot?.ok === false && <p className="run-score-note">{text(snapshot.error) || "任务快照未提供"}</p>}
    {text(details.artifactError) && <p className="run-score-note" role="status">{text(details.artifactError)}</p>}
    {details.truncated === true && <p className="run-score-note">部分结构化帧超过保存上限，当前记录不完整。</p>}
    {result && Object.hasOwn(result, "message") && <p className="run-score-note">{scalar(result.message)}</p>}
  </>;
}
