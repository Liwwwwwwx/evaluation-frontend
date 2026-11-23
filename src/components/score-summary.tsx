type Score = { status?: string; total?: number | null; taskStatus?: string | null; qualification?: string | null; provisional?: boolean };
export type ScoreSummaryValue = Record<string, Score>;
const tasks: Record<string,string> = { completed: "完成", partial: "部分完成", failed: "未完成", unclear: "无法确认" };
const states: Record<string,string> = { pending: "评分中", failed: "评分失败", ready: "查看评分详情", unavailable: "未配置", absent: "无评分", skipped: "不适用" };
const qualifications: Record<string,string> = { qualified: "合格", not_qualified: "未达标", unclear: "无法判断" };
export function ScoreSummary({ scores }: { scores?: ScoreSummaryValue | null }) {
  if (!scores || (!scores.deepSeekScore && !scores.qwenScore)) return <span className="run-score-note">未评分</span>;
  return <span className="score-summary">{[["DeepSeek","deepSeekScore"],["千问","qwenScore"]].map(([name,key]) => { const item = scores[key]; return <span key={key}>{name}：{item?.status === "ready" && typeof item.total === "number" && Number.isFinite(item.total) && item.total >= 0 && item.total <= 100 ? `${item.total} / 100${item.provisional ? "（参考）" : ""}` : states[item?.status || ""] || (item?.status ? "状态未知" : "未评分")}{item?.status === "ready" && item.taskStatus && tasks[item.taskStatus] ? ` · ${tasks[item.taskStatus]}` : ""}{item?.status === "ready" && item.qualification && qualifications[item.qualification] ? ` · ${qualifications[item.qualification]}` : ""}</span>; })}</span>;
}
