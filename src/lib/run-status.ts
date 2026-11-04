const labels: Record<string, string> = { queued: "排队中", paused: "已暂停", running: "运行中", scoring: "评分中", done: "已结束", cancelled: "已结束", error: "失败" };

export function isTerminalRun(status?: string) {
  return ["done", "error", "cancelled", "paused"].includes(status || "");
}

export function isUncertainRun(status?: string, recoveryState?: string) {
  return recoveryState === "snapshot_only" && ["queued", "running", "scoring"].includes(status || "");
}

export function runStatusLabel(status?: string, recoveryState?: string) {
  return isUncertainRun(status, recoveryState) ? "状态待确认" : labels[status || ""] || "状态未知";
}
