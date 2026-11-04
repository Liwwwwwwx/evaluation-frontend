export type EvaluationService = { key: string; label: string; enabled: boolean };

// 新建测评只使用独立后端支持的服务；历史记录仍保留各自的服务名称。
export const evaluationServiceCatalog: EvaluationService[] = [
  { key: "mission-material", label: "Mission 主服务", enabled: false },
  { key: "alpha-rsi", label: "ALPHA 材料 RSI（1110）", enabled: false },
  { key: "alloy", label: "合金材料", enabled: false },
  { key: "literature", label: "文献检索", enabled: false },
  { key: "literature-aircraft", label: "航空文献", enabled: false },
  { key: "synthesis", label: "合成制备", enabled: false },
  { key: "new-material", label: "新材料", enabled: false },
];

export function isEvaluationService(key: string) {
  return evaluationServiceCatalog.some(item => item.key === key);
}

export function availableEvaluationServices(items: unknown): EvaluationService[] {
  return evaluationServiceCatalog.map(item => ({ ...item, enabled: Array.isArray(items)
    && items.some(value => value && value.key === item.key && value.enabled === true) }));
}

export function preferredEvaluationService(services: EvaluationService[], current: string) {
  return services.find(item => item.key === current && item.enabled)?.key
    || services.find(item => item.key === "mission-material" && item.enabled)?.key
    || services.find(item => item.key === "literature" && item.enabled)?.key
    || services.find(item => item.enabled)?.key || current;
}
