export type ScoringUsage = {
  evaluations: number; calls: number;
  inputTokens: number | null; outputTokens: number | null; totalTokens: number | null;
  estimatedCny: number | null; missingUsage: number; missingCost: number;
};

const currency = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2, maximumFractionDigits: 6 });

export function formatScoringCost(usage?: ScoringUsage | null, expectedRuns?: number) {
  if (!usage) return "未记录";
  if (usage.estimatedCny === null) return "待确认";
  const cost = usage.estimatedCny > 0 && usage.estimatedCny < 0.000001 ? "< ¥0.000001" : currency.format(usage.estimatedCny);
  return usage.missingCost || (expectedRuns != null && usage.evaluations < expectedRuns) ? cost + "（部分）" : cost;
}

export function formatScoringTokens(usage?: ScoringUsage | null) {
  if (!usage) return "未记录";
  if (usage.totalTokens === null) return "待确认";
  return usage.totalTokens.toLocaleString("zh-CN") + (usage.missingUsage ? "（部分）" : "");
}
