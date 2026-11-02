import type { ScoreSummaryValue } from "@/components/score-summary";

const stateNames: Record<string, string> = { pending: "评分中", failed: "评分失败", unavailable: "未配置", absent: "无评分", skipped: "不适用" };
const taskNames: Record<string, string> = { partial: "部分完成", failed: "未完成", unclear: "无法确认" };

function itemText(item: ScoreSummaryValue[string] | undefined) {
  if (!item) return "—";
  if (item.status === "ready") return typeof item.total === "number" && Number.isFinite(item.total) && item.total >= 0 && item.total <= 100 ? `${item.total}${item.provisional ? "*" : ""}` : "数据异常";
  return stateNames[item.status || ""] || (item.status ? "状态未知" : "未评分");
}

function itemDetail(item: ScoreSummaryValue[string] | undefined) {
  if (!item) return "无评分";
  if (item.status === "ready" && typeof item.total === "number" && Number.isFinite(item.total) && item.total >= 0 && item.total <= 100) return `${item.total} / 100${item.provisional ? "（参考）" : ""}`;
  return itemText(item);
}

export function ScoreInline({ scores }: { scores?: ScoreSummaryValue | null }) {
  const deepSeek = scores?.deepSeekScore;
  const qwen = scores?.qwenScore;
  const items = [deepSeek, qwen].filter((item): item is NonNullable<typeof item> => Boolean(item));
  const task = [deepSeek?.taskStatus, qwen?.taskStatus].find((value) => value && value in taskNames);
  const full = `DeepSeek ${itemDetail(deepSeek)} · 千问 ${itemDetail(qwen)}${task ? ` · ${taskNames[task!]}` : ""}`;
  if (!items.length) return <span className="score-inline" title={full}><span>未评分</span></span>;
  if (items.every((item) => item.status === "skipped")) return <span className="score-inline" title={full}><span>不适用</span></span>;
  if (items.every((item) => item.status === "pending")) return <span className="score-inline" title={full}><span>评分中</span></span>;
  return <span className="score-inline" title={full}>
    <span>DS {itemText(deepSeek)}</span>
    <span>QW {itemText(qwen)}</span>
    {task && <span className="score-inline-task">{taskNames[task]}</span>}
  </span>;
}
