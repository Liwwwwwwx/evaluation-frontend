export type UnifiedRunSnapshot = {
  runId: string; serviceKey: string; question: string; status: string; answer: string;
  executionStatus?: string; scoringStatus?: string; answerTruncated: boolean;
  run: unknown; scores: unknown; scoreError: string | null; error: string | null;
  recoveryState?: string; canReply?: boolean; canEnd?: boolean; canRescore?: boolean; canRerun?: boolean; persistenceError?: boolean;
  origin: string; questionId: string | null; datasetVersion: string | null;
  startedAt?: string | null; finishedAt?: string | null;
};

// 只读取已有运行。串行轮询、有限重试，并丢弃取消后的迟到响应。
export function watchUnifiedRun(runId: string, {
  onData, onError, request = fetch, intervalMs = 5000, retryDelayMs = 1000,
}: {
  onData: (data: UnifiedRunSnapshot) => void;
  onError: (message: string, retrying: boolean) => void;
  request?: typeof fetch; intervalMs?: number; retryDelayMs?: number;
}) {
  let stopped = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  const load = async () => {
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 15000);
    let retryable = true;
    try {
      const response = await request(`/api/evaluation/unified/runs/${encodeURIComponent(runId)}`, { cache: "no-store", signal: controller.signal });
      retryable = response.status >= 500 || [408, 429].includes(response.status);
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : typeof data?.error?.message === "string" ? data.error.message : `请求失败（${response.status}）`);
      retryable = true;
      if (!data || data.runId !== runId || typeof data.status !== "string" || typeof data.answer !== "string") throw new Error("运行数据格式异常，请重试。");
      if (stopped) return;
      failures = 0;
      onData(data as UnifiedRunSnapshot);
      if (!stopped && ["queued", "running", "scoring"].includes(data.status)) timer = setTimeout(() => void load(), intervalMs);
    } catch (error) {
      if (stopped) return;
      const retrying = retryable && ++failures <= 3;
      onError(error instanceof Error ? error.message : "读取运行失败。", retrying);
      if (!stopped && retrying) timer = setTimeout(() => void load(), retryDelayMs * 2 ** (failures - 1));
    } finally { clearTimeout(timeout); }
  };
  void load();
  return () => { stopped = true; clearTimeout(timer); controller?.abort(); };
}
