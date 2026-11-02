import { createRequestKey } from "@/lib/request-key";
export type PhaseRule = { serviceKey: string; phaseKey: string; label: string; warningSeconds: number; criticalSeconds: number };
export type RuleConfig = {
  weights: { readability: number; professionalism: number; visualAids: number };
  passScore: number; markdownGate: boolean;
  contentInstructions: string; completionInstructions: string; experienceInstructions: string;
  efficiencyRules: PhaseRule[];
};
export type RuleSnapshot = { id: string; version: number; name: string; config: RuleConfig; publishedAt?: string | null };
export type ScoringRule = RuleSnapshot & { revision: number; status: "draft" | "published" | "archived"; changeNote: string; updatedBy: string; createdBy: string; publishedBy?: string | null; updatedAt: string };
export type RuleFormValue = { name: string; changeNote: string; config: RuleConfig };
export type RuleCatalog = { items: ScoringRule[]; active: RuleSnapshot; template: RuleSnapshot; stateRevision: number; storageReady: boolean; canWrite: boolean; message?: string; events?: { ruleId: string; action: string; actor: string; createdAt: string }[] };
export const dimensionNames = { readability: "可读性", professionalism: "专业性", visualAids: "图文辅助" } as const;
export const stateNames = { draft: "草稿", published: "已发布", archived: "已归档" };
export function validateRuleForm(value: RuleFormValue) {
  if (!value.name.trim() || value.name.trim().length > 100) return "规则名称需要1–100个字符。";
  if (value.changeNote.trim().length > 1000) return "变更说明最多1000个字符。";
  const c = value.config;
  if (Object.values(c.weights).some(v => !Number.isInteger(v) || v < 0 || v > 100) || Object.values(c.weights).reduce((a,b) => a+b,0) !== 100 || c.weights.readability + c.weights.professionalism === 0) return "权重需为0–100的整数，合计100%，且可读性与专业性合计大于0。";
  if (!Number.isFinite(c.passScore) || c.passScore < 0 || c.passScore > 100) return "合格线需在0–100之间。";
  for (const [label,text] of [["内容评分说明",c.contentInstructions],["任务交付说明",c.completionInstructions],["交付体验说明",c.experienceInstructions]]) if (!text.trim() || text.trim().length > 6000) return `${label}需要1–6000个字符。`;
  if (c.efficiencyRules.length > 20) return "最多配置20项阶段阈值。";
  const seen = new Set<string>();
  for (const r of c.efficiencyRules) {
    if (!/^(?:\*|[a-z][a-z0-9-]{0,59})$/.test(r.serviceKey) || !/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(r.phaseKey) || !r.label.trim() || r.label.trim().length > 80) return "请填写有效的阶段名称、服务标识和阶段标识。";
    const key = `${r.serviceKey}/${r.phaseKey}`; if (seen.has(key)) return "同一服务和阶段的阈值不能重复。"; seen.add(key);
    if (!Number.isInteger(r.warningSeconds) || !Number.isInteger(r.criticalSeconds) || r.warningSeconds < 1 || r.criticalSeconds <= r.warningSeconds || r.criticalSeconds > 86400) return "阶段阈值需满足：提醒大于0，严重大于提醒且不超过86400秒。";
  }
  return "";
}
export function ruleDocument(rule: RuleSnapshot, options: {draft?:boolean} = {}) {
  const c = rule.config;
  return `# ${rule.name}\n\n规则版本：${options.draft ? "草稿（未发布）" : rule.id === "builtin-v1" ? "内置" : `v${rule.version}`}\n\n## 内容评分\n\n${Object.entries(dimensionNames).map(([k,label]) => `- ${label}：${c.weights[k as keyof typeof dimensionNames]}%`).join("\n")}\n\n图文不适用时，对其余适用维度按比例归一化。合格线 ${c.passScore} 分；两家评委独立评分。\n\n${c.contentInstructions}\n\n## 任务交付\n\n${c.completionInstructions}\n\n## 交付体验\n\n${c.experienceInstructions}\n\n## 阶段效率\n\n${c.efficiencyRules.length ? c.efficiencyRules.map(r => `- ${r.label}（${r.serviceKey} / ${r.phaseKey}）：${r.warningSeconds}秒提醒，${r.criticalSeconds}秒严重异常。`).join("\n") : "未设置阶段阈值。"}\n\n仅使用实际采集的阶段证据；缺少阶段时间时无法评估。\n\n## Markdown\n\n原文机检${c.markdownGate ? "纳入合格门槛" : "独立展示，不纳入合格门槛"}。模型评分不等于独立科学核验。\n`;
}
export async function requestRules<T>(url: string, body?: unknown, key?: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...(body === undefined ? {} : { method: "POST",headers: { "Content-Type":"application/json","Idempotency-Key":key || createRequestKey() },body:JSON.stringify(body) }) });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(typeof data?.error === "string" ? data.error : data?.error?.message || (response.status === 403 ? "没有规则维护权限。" : `请求失败（${response.status}）`));
  return data as T;
}
