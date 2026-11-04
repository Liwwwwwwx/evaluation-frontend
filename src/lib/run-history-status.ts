export type HistoryStatus = { status: string; recoveryState?: string; sequence: number };

// 历史请求发出后若收到实时状态，迟到的旧列表不能覆盖该状态。
export function mergeHistoryStatuses<T extends { id: string; status: string; recoveryState?: string }>(items: T[], updates: Map<string, HistoryStatus>, requestSequence: number): T[] {
  return items.map(item => {
    const update = updates.get(item.id);
    return update && update.sequence > requestSequence ? { ...item, status: update.status, recoveryState: update.recoveryState } : item;
  });
}
