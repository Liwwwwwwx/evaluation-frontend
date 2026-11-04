type RecordValue = Record<string, unknown>;
function object(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : null;
}
function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function stringList(value: unknown) { return Array.isArray(value) ? value.filter(v => typeof v === "string") as string[] : []; }
const scoreLabels: Record<string, string> = { deepSeekScore: "DeepSeek", qwenScore: "Qwen", quality: "质量解读" };
const states: Record<string, string> = { pending: "评分中", ready: "已完成", failed: "评分失败", unavailable: "未配置", absent: "无评分", skipped: "不适用" };
const taskStates: Record<string, string> = { completed: "已完成", partial: "部分完成", clarification: "请求补充信息", failed: "未完成", unclear: "无法确认" };
const requirementStates: Record<string, string> = { met: "已满足", partial: "部分满足", missing: "缺失", unclear: "无法确认" };
const checkStates: Record<string, string> = { passed: "通过", observe: "有提示", failed: "未通过", not_evaluable: "无法评估", consistent: "一致", issue: "有疑点", unclear: "无法判断", not_applicable: "不适用" };
const understandingStates: Record<string, string> = { on_target: "贴合题面", partial: "部分贴合", off_target: "偏离题面", unclear: "无法判断" };
const qualificationStates: Record<string, string> = { qualified: "合格", not_qualified: "未达标", unclear: "无法判断" };

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

function FindingList({ label, items }: { label: string; items: string[] }) {
  return <div className="score-findings"><strong>{label}</strong><ul>{items.map((item, index) => <li key={index}>{item}</li>)}</ul></div>;
}

function ScoringCriteria({ scoring, scores }: { scoring: RecordValue | null; scores: RecordValue | null }) {
  const rubric = object(scoring?.rubric); const rule = object(scoring?.ruleSnapshot); const config = object(rule?.config);
  const judges = [["DeepSeek", object(scores?.deepSeekScore)], ["千问", object(scores?.qwenScore)]] as const;
  const assessments = judges.map(([name, item]) => ({ name, item, requirements: Array.isArray(object(object(item?.quality)?.taskCompletion)?.requirements) ? object(object(item?.quality)?.taskCompletion)?.requirements as unknown[] : [] }));
  const stored = Array.isArray(rubric?.requirements) ? rubric.requirements.map(object).filter((item): item is RecordValue => !!item && !!text(item.requirement)) : [];
  const recovered = assessments.flatMap(judge => judge.requirements.map(object).filter((item): item is RecordValue => !!item && !!text(item.requirement)));
  const seen = new Set<string>();
  const requirements = (stored.length ? stored : recovered).filter(item => { const key = text(item.id) || text(item.requirement); if (seen.has(key)) return false; seen.add(key); return true; });
  const weights = object(config?.weights);
  const hasRule = !!rule && (!!text(rule.name) || !!config);
  const pending = judges.some(([, item]) => item?.status === "pending");
  return <details className="score-criteria">
    <summary>查看本次评判标准</summary>
    <div className="score-criteria-content">
      {hasRule && <div><strong>本轮评分规则</strong>{text(rule?.name) && <p>{text(rule?.name)}{rule?.id === "builtin-v1" ? " · 内置规则" : typeof rule?.version === "number" ? ` · 版本 ${rule.version}` : ""}</p>}
        {weights && <p>原始权重：{[["可读性", weights.readability], ["专业性", weights.professionalism], ["图文辅助", weights.visualAids]].filter(([, value]) => typeof value === "number" && Number.isFinite(value)).map(([label, value]) => `${label} ${value}%`).join(" · ")}。图文不适用时，其余维度按比例分配。</p>}
        {typeof config?.passScore === "number" && Number.isFinite(config.passScore) && <p>合格线 {config.passScore} 分；关键要求未满足、交付不完整或启用的格式门槛未通过，也可能未达标。</p>}
        {text(config?.contentInstructions) && <p>内容评分：{text(config?.contentInstructions)}</p>}{text(config?.completionInstructions) && <p>交付标准：{text(config?.completionInstructions)}</p>}
      </div>}
      {requirements.length > 0 ? <div><strong>本题要求</strong>{!stored.length && <p>根据本轮已保存的评委结果展示，可能不完整。</p>}
        <ul>{requirements.map((requirement, index) => <li key={text(requirement.id) || index}><span>{text(requirement.requirement)}</span>{requirement.critical === true && <span>（关键要求）</span>}
          {assessments.filter(judge => judge.item?.status === "ready").map(judge => { const result = judge.requirements.map(object).find(item => item && (text(requirement.id) ? item.id === requirement.id : item.requirement === requirement.requirement)); return <p key={judge.name}>{judge.name}：{result ? requirementStates[text(result.status)] || "状态未知" : "未列出"}{text(result?.note) && ` — ${text(result?.note)}`}</p>; })}
        </li>)}</ul>
      </div> : <p>{pending ? "本题要求尚在生成。" : "本次记录未保存题目要求，无法展示。"}</p>}
      {typeof rubric?.visualAidsApplicable === "boolean" && <p>图文辅助：{rubric.visualAidsApplicable ? "适用" : "不适用"}{text(rubric.visualAidsReason) && ` — ${text(rubric.visualAidsReason)}`}</p>}
      <p>题目要求由模型提取，评委判断未做独立科学核验。</p>
    </div>
  </details>;
}

function JudgeCard({ value, name }: { value: unknown; name: string }) {
  const item = object(value); const quality = object(item?.quality); const ready = item?.status === "ready" && quality?.version === "evaluation-v1";
  const total = quality?.total; const score = typeof total === "number" && Number.isFinite(total) && total >= 0 && total <= 100 ? total : null;
  const dimensions = object(quality?.dimensions);
  const task = object(quality?.taskCompletion);
  const qualification = object(quality?.qualification);
  const gaps = stringList(quality?.gaps); const suggestions = stringList(quality?.suggestions);
  const truncated = object(quality?.source)?.truncated === true;
  const state = states[text(item?.status)] || "无评分";
  const failures: string[] = [];
  if (qualification?.status === "not_qualified") {
    if (score !== null && typeof qualification.passScore === "number" && score < qualification.passScore) failures.push(`总分低于合格线 ${qualification.passScore} 分。`);
    for (const value of Array.isArray(task?.requirements) ? task.requirements : []) {
      const requirement = object(value);
      if (requirement?.critical === true && ["missing", "partial"].includes(text(requirement.status)) && text(requirement.requirement)) failures.push(`关键要求${requirement.status === "partial" ? "部分满足" : "缺失"}：${text(requirement.requirement)}`);
    }
    if (["partial", "failed"].includes(text(task?.status))) failures.push(`任务完成度为${taskStates[text(task?.status)]}。`);
    if (qualification.markdownGate === true && quality?.markdownStatus === "failed") failures.push("已启用的 Markdown 门槛未通过。");
  }
  return <article className="score-card">
    <div className="score-card-head"><strong className="score-card-name">{name}</strong><span className="score-card-state">{ready && score !== null ? (truncated ? "参考分" : "评分完成") : state}</span></div>
    {ready && score !== null && <div className="score-number"><strong>{score}</strong><span> / 100</span></div>}
    {ready && score === null && <p className="run-score-note">评分结果缺少有效的总分。</p>}
    {ready && task && <p className="score-card-task">任务完成度 · {taskStates[text(task.status)] || "无法确认"}</p>}
    {ready && qualification && <p className="score-card-task">内容判定 · {qualificationStates[text(qualification.status)] || "无法判断"}{typeof qualification.passScore === "number" && Number.isFinite(qualification.passScore) ? ` · 合格线 ${Number(qualification.passScore)} 分` : ""}</p>}
    {ready && qualification?.status === "not_qualified" && <div className="score-qualification"><strong>未达标原因</strong>{failures.length ? <ul>{failures.map((reason, index) => <li key={index}>{reason}</li>)}</ul> : <p>当前记录未保存可明确展示的触发原因，请核对本次评判标准与评委结果。</p>}</div>}
    {ready && dimensions && <div className="score-visual">{Object.entries(dimensions).map(([key, v]) => { const d = object(v); if (!d) return null; const applicable = d.applicable !== false; const dimScore = typeof d.score === "number" && Number.isFinite(d.score) ? d.score : null; const weight = typeof d.weight === "number" && Number.isFinite(d.weight) ? Math.round(Number(d.weight) * 100) : null; return <div className="score-visual-row" key={key}><span className="score-visual-label">{text(d.label) || key}{weight !== null ? ` · ${weight}%` : ""}</span><span className="score-visual-value">{!applicable ? "不适用" : dimScore !== null ? `${dimScore} / 100` : "缺少评分"}</span>{applicable && dimScore !== null && <span className="score-visual-bar" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, dimScore))}%` }} /></span>}{applicable && text(d.note) && <span className="score-visual-note">{text(d.note)}</span>}</div>; })}</div>}
    {ready && gaps.length > 0 && <FindingList label="扣分原因" items={gaps} />}
    {ready && suggestions.length > 0 && <FindingList label="改进建议" items={suggestions} />}
    {ready && text(quality?.comment) && <p className="score-comment"><strong>总评：</strong>{text(quality?.comment)}</p>}
    {truncated && <p className="run-score-note">输入不完整 · 分数仅供参考</p>}
    {text(item?.error) && <p className="run-score-note">{text(item?.error)}</p>}
  </article>;
}

export function UnifiedScores({ scores, run, executionStatus }: { scores: unknown; run?: unknown; executionStatus?: string }) {
  if (["queued", "running"].includes(executionStatus || "")) return <p className="run-score-note">回答生成完成后自动评分。</p>;
  const scoring = object(object(run)?.scoring);
  const items = object(scores); const isNew = scoring?.version === "evaluation-v1" || object(object(items?.deepSeekScore)?.quality)?.version === "evaluation-v1" || object(object(items?.qwenScore)?.quality)?.version === "evaluation-v1";
  if (!isNew) return <LegacyScores scores={scores} run={run} />;
  return <div className="score-board">
    <p className="score-intro">两家模型独立评分，不取平均；百分制只表示回答质量，不代表科学真实性。</p>
    <ScoringCriteria scoring={scoring} scores={items} />
    <div className="score-cards"><JudgeCard name="DeepSeek" value={items?.deepSeekScore} /><JudgeCard name="千问" value={items?.qwenScore} /></div>
  </div>;
}
