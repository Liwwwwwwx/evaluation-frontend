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

function LegacyScores({ scores, run }: { scores: unknown; run?: unknown }) {
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

function stringList(value: unknown) { return Array.isArray(value) ? value.filter(v => typeof v === "string") as string[] : []; }
function TaskCompletion({ value }: { value: unknown }) {
  const task = object(value); if (!task) return null;
  return <div className="score-task"><strong>任务完成度 · {taskStates[text(task.status)] || "无法确认"}</strong><p className="run-score-note">{task.qualified === true ? "要求清单已满足（模型判断）" : "尚不能认定完整任务合格"}</p><details><summary>查看逐项依据</summary><ul className="run-list">{(Array.isArray(task.requirements) ? task.requirements : []).map((v, i) => { const row = object(v); return row ? <li key={i}><strong>{text(row.id)} · {requirementStates[text(row.status)] || "无法确认"}{row.critical === true ? " · 关键要求" : ""}</strong><p>{text(row.requirement)}</p>{text(row.evidence) && <blockquote>{text(row.evidence)}</blockquote>}{text(row.note) && <p>{text(row.note)}</p>}</li> : null; })}</ul></details></div>;
}
function Judge({ value, name }: { value: unknown; name: string }) {
  const item = object(value); const quality = object(item?.quality); const ready = item?.status === "ready" && quality?.version === "evaluation-v1";
  const total = quality?.total; const score = typeof total === "number" && Number.isFinite(total) && total >= 0 && total <= 100 ? total : null;
  const dimensions = object(quality?.dimensions);
  return <ResultBlock title={name} status={ready && score !== null ? `${score} / 100` : states[text(item?.status)] || "无评分"}>
    {text(item?.model) && <p className="run-score-note">{text(item?.model)} · {text(item?.evaluatedAt) && new Date(text(item?.evaluatedAt)).toLocaleString("zh-CN")}</p>}
    {ready && <>
      {object(quality?.source)?.truncated === true && <p className="run-score-note">输入不完整 · 分数仅供参考</p>}
      {dimensions && <dl className="score-dimensions">{Object.entries(dimensions).map(([key, v]) => { const d = object(v); return d ? <div key={key}><dt>{text(d.label)}</dt><dd>{d.applicable === false ? "不适用" : typeof d.score === "number" ? `${d.score} / 100 · 权重 ${Math.round(Number(d.weight) * 100)}%` : "缺少评分"}</dd><dd className="run-score-note">{text(d.note)}</dd>{text(d.evidence) && <dd><blockquote>{text(d.evidence)}</blockquote></dd>}</div> : null; })}</dl>}
      <p className="run-score-note">{text(quality?.comment)}</p>
      <TaskCompletion value={quality?.taskCompletion} />
      {[["亮点", quality?.highlights], ["不足", quality?.gaps], ["改进建议", quality?.suggestions]].map(([label, list]) => stringList(list).length > 0 && <div key={String(label)}><strong>{String(label)}</strong><ul className="run-list">{stringList(list).map((v,i) => <li key={i}>{v}</li>)}</ul></div>)}
      <details><summary>评分局限与覆盖范围</summary><ul className="run-list">{stringList(quality?.limitations).map((v,i) => <li key={i}>{v}</li>)}</ul><p className="run-score-note">正文 {Number(object(quality?.source)?.answerChars || 0)} 字符；结构化材料 {Number(object(quality?.source)?.structuredChars || 0)} 字符。未独立核验科学真实性。</p></details>
    </>}
    {text(item?.error) && <p className="run-score-note">{text(item?.error)}</p>}
  </ResultBlock>;
}
function FormatCheck({ value }: { value: unknown }) {
  const markdown = object(value); if (!markdown) return null;
  const issues = Array.isArray(markdown.issues) ? markdown.issues : [];
  return <ResultBlock title="Markdown 机检" status={checkStates[text(markdown.status)] || "状态未知"}><p className="run-score-note">原文检查 · {markdown.coverage === "partial" ? "覆盖不完整" : "完整文本"} · 未检查远程链接可用性</p>{issues.length ? <details><summary>查看 {issues.length} 项问题与建议</summary><ul className="run-list">{issues.map((v,i) => { const issue = object(v); return issue ? <li key={i}><strong>{issue.severity === "error" ? "错误" : "提示"} · 第 {Number(issue.line || 1)} 行</strong><p>{text(issue.detail)}</p>{text(issue.snippet) && <code className="score-snippet">{text(issue.snippet)}</code>}<p>{text(issue.suggestion)}</p></li> : null; })}</ul></details> : <p className="run-score-note">当前规则未发现问题；不代表内容正确。显示层修复不影响原文检查。</p>}</ResultBlock>;
}
export function UnifiedScores({ scores, run }: { scores: unknown; run?: unknown }) {
  const current = object(run); const scoring = object(current?.scoring);
  const items = object(scores); const isNew = scoring?.version === "evaluation-v1" || object(object(items?.deepSeekScore)?.quality)?.version === "evaluation-v1" || object(object(items?.qwenScore)?.quality)?.version === "evaluation-v1";
  if (!isNew) return <LegacyScores scores={scores} run={run} />;
  const rubric = object(scoring?.rubric); const history = Array.isArray(scoring?.history) ? scoring.history : [];
  return <><p className="run-score-note">可读性 40% · 专业性 40% · 图文辅助 20%。图文不适用时其余维度各占 50%；两家模型独立评分，不取平均。</p>
    <FormatCheck value={current?.markdownSyntax} />
    {rubric && <details className="score-rubric"><summary>统一题目要求清单</summary><p className="run-score-note">{text(rubric.model)} 提取 · {text(rubric.visualAidsReason)}</p><ul className="run-list">{(Array.isArray(rubric.requirements) ? rubric.requirements : []).map((v,i) => { const row = object(v); return row ? <li key={i}>{text(row.id)}{row.critical === true ? " · 关键要求" : ""}：{text(row.requirement)}</li> : null; })}</ul></details>}
    <Judge name="DeepSeek" value={items?.deepSeekScore} /><Judge name="千问" value={items?.qwenScore} />
    <p className="run-score-note">评分规则 {text(scoring?.version)} · 本轮 {text(scoring?.attemptId)}</p>
    {history.length > 0 && <details className="score-history"><summary>历史评分（{history.length} 轮）</summary>{history.map((v,i) => { const row = object(v); const previous = object(row?.scores); return row ? <details key={i}><summary>第 {i + 1} 轮 · {text(row.startedAt)}</summary><FormatCheck value={row.markdownSyntax} /><Judge name="DeepSeek" value={previous?.deepSeekScore} /><Judge name="千问" value={previous?.qwenScore} /></details> : null; })}</details>}
  </>;
}
