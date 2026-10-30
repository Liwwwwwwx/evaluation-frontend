type RecordValue = Record<string, unknown>;
function object(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
}
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
const scoreLabels: Record<string, string> = { deepSeekScore: "DeepSeek", qwenScore: "Qwen", quality: "质量解读" };
const states: Record<string, string> = { pending: "评分中", ready: "已完成", failed: "评分失败", unavailable: "未配置", absent: "无评分", skipped: "不适用" };
const taskStates: Record<string, string> = { completed: "已完成", partial: "部分完成", clarification: "请求补充信息", failed: "未完成", unclear: "无法确认" };
const requirementStates: Record<string, string> = { met: "已满足", partial: "部分满足", missing: "缺失", unclear: "无法确认" };
const checkStates: Record<string, string> = { passed: "通过", observe: "有提示", failed: "未通过", not_evaluable: "无法评估", consistent: "一致", issue: "有疑点", unclear: "无法判断", not_applicable: "不适用" };
const understandingStates: Record<string, string> = { on_target: "贴合题面", partial: "部分贴合", off_target: "偏离题面", unclear: "无法判断" };

function ResultBlock({ title, status, children }: { title: string; status: string; children?: React.ReactNode }) {
  return <div className="run-score"><div className="run-score-head"><strong>{title}</strong><span className="run-score-value">{status}</span></div>{children}</div>;
}

export function UnifiedScores({ scores, run }: { scores: unknown; run?: unknown }) {
  const items = object(scores);
  const markdown = object(object(run)?.markdownSyntax);
  const deepSeek = object(items?.deepSeekScore);
  const quality = object(deepSeek?.quality);
  const task = object(quality?.taskCompletion);
  const scientific = object(quality?.scientificReview);
  const issues = Array.isArray(markdown?.issues) ? markdown.issues : [];
  const requirements = Array.isArray(task?.requirements) ? task.requirements : [];
  const checks = Array.isArray(scientific?.checks) ? scientific.checks : [];
  const limitations = Array.isArray(scientific?.limitations) ? scientific.limitations : [];
  return <>
    {markdown && <ResultBlock title="Markdown 机检" status={checkStates[text(markdown.status)] || "状态未知"}>
      {issues.length ? <ul className="run-list">{issues.map((value, index) => { const issue = object(value); return issue ? <li key={index}>{text(issue.id)}{issue.id && issue.detail ? " · " : ""}{text(issue.detail)}</li> : null; })}</ul> : <p className="run-score-note">机检仅覆盖已有规则。</p>}
    </ResultBlock>}
    {task && <ResultBlock title="任务完成情况" status={taskStates[text(task.status)] || "状态未知"}>
      {text(task.reason) && <p className="run-score-note">{text(task.reason)}</p>}
      {requirements.length > 0 && <ul className="run-list">{requirements.map((value, index) => { const item = object(value); return item ? <li key={index}>[{requirementStates[text(item.status)] || "状态未知"}] {text(item.requirement)}{text(item.evidence) && ` — ${text(item.evidence)}`}</li> : null; })}</ul>}
      <p className="run-score-note">要求清单由模型提取，尚未做独立外部验证。</p>
    </ResultBlock>}
    {!items ? <p className="run-score-note">等待评分结果。</p> : Object.entries(items).map(([key, value]) => {
      const item = object(value); if (!item) return null;
      const itemQuality = object(item.quality); const clarity = object(itemQuality?.clarity); const understanding = object(itemQuality?.understanding);
      const raw = clarity?.score; const validScore = typeof raw === "number" && Number.isFinite(raw) && raw >= 1 && raw <= 5;
      const scaled = validScore ? Math.round((raw / 5) * 1000) / 10 : null;
      const dimensions = object(clarity?.dimensions);
      const status = text(item.status); const ready = status === "ready";
      return <ResultBlock key={key} title={scoreLabels[key] || key} status={ready && scaled !== null ? `${scaled} / 100` : states[status] || "状态未知"}>
        {ready && scaled !== null && <p className="run-score-note">可理解度 · 原分 {String(raw)} / 5，按满分比例换算{understanding && ` · ${understandingStates[text(understanding.status)] || "无法判断"}`}</p>}
        {ready && dimensions && <details><summary className="run-score-note">查看评分维度</summary><ul className="run-list">{Object.entries(dimensions).map(([dimensionKey, value]) => {
          const dimension = object(value); const score = dimension?.score;
          return dimension && typeof score === "number" && Number.isFinite(score) && score >= 1 && score <= 5
            ? <li key={dimensionKey}>{text(dimension.label) || dimensionKey} · {Math.round((score / 5) * 1000) / 10} / 100（原分 {score} / 5）{text(dimension.note) && ` — ${text(dimension.note)}`}</li> : null;
        })}</ul></details>}
        {ready && !validScore && <p className="run-score-note">评分结果缺少有效的可理解度分数。</p>}
        {text(understanding?.note) && <p className="run-score-note">{text(understanding?.note)}</p>}
        {text(itemQuality?.summary) && <p className="run-score-note">{text(itemQuality?.summary)}</p>}
        {object(itemQuality?.source)?.truncated === true && <p className="run-score-note">回答已截断，评分只针对前段内容。</p>}
        {text(item.error) && <p className="run-score-note">{text(item.error)}</p>}
      </ResultBlock>;
    })}
    {scientific && <ResultBlock title="科学检查与局限" status={scientific.status === "ready" ? "已列出" : "不完整"}>
      {checks.length > 0 && <ul className="run-list">{checks.map((value, index) => { const item = object(value); return item ? <li key={index}>{checkStates[text(item.status)] || "状态未知"} · {text(item.item)}{text(item.evidence) && ` — ${text(item.evidence)}`}</li> : null; })}</ul>}
      {limitations.length > 0 && <ul className="run-list">{limitations.map((value, index) => typeof value === "string" ? <li key={index}>{value}</li> : null)}</ul>}
      <p className="run-score-note">以上检查未做独立核验，不代表已确认正确或错误。</p>
    </ResultBlock>}
  </>;
}
