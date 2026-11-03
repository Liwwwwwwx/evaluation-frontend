import { readUnifiedStream } from "@/lib/unified-stream";
import { watchUnifiedRun, type UnifiedRunSnapshot } from "@/lib/unified-run-poll";

// 查看已有运行也使用实时事件；连接失败时沿用有界重试的只读轮询。
export function watchLiveUnifiedRun(runId: string, {
  onData, onError, request = fetch, maxReconnects = 3,
}: {
  onData: (data: UnifiedRunSnapshot) => void;
  onError: (message: string, retrying: boolean) => void;
  request?: typeof fetch; maxReconnects?: number;
}) {
  let stopped = false;
  let current: UnifiedRunSnapshot;
  let stopPolling = () => {};
  let controller: AbortController | undefined;
  let attempts = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  const active = (status: string) => ["queued", "running", "scoring"].includes(status);
  const update = (data: UnifiedRunSnapshot) => { if (!stopped) { current = data; onData(data); } };
  const poll = (reconnect = false) => {
    if (!stopped) stopPolling = watchUnifiedRun(runId, { onData: data => {
      update(data);
      if (!stopped && reconnect && active(data.status) && data.recoveryState !== "snapshot_only" && attempts <= maxReconnects) {
        stopPolling();
        reconnectTimer = setTimeout(() => { if (!stopped) void subscribe(); }, 1000 * 2 ** (attempts - 1));
      }
    }, onError, request });
  };

  async function subscribe() {
    attempts++;
    let reconnectAllowed = true;
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 15000);
    let ended = false;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const touchIdle = () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => controller?.abort(), 60000); };
    try {
      const response = await request(`/api/evaluation/unified/runs/${encodeURIComponent(runId)}/events`, { cache: "no-store", signal: controller.signal });
      clearTimeout(timeout);
      if (stopped) return;
      if (!response.ok) { reconnectAllowed = ![400, 401, 403, 404].includes(response.status); throw new Error(`实时订阅失败（${response.status}）`); }
      touchIdle();
      await readUnifiedStream(response, ({ event, data }) => {
        if (stopped || (typeof data.runId === "string" && data.runId !== runId)) return;
        if (event === "snapshot") {
          if (data.runId !== runId || typeof data.answer !== "string" || typeof data.status !== "string") throw new Error("实时快照格式异常");
          // 订阅快照替换旧正文，避免将快照与后续增量重复拼接。
          update({ ...current, ...data } as UnifiedRunSnapshot);
          if (data.live === false) ended = true;
        } else if (event === "text" && typeof data.delta === "string") {
          update({ ...current, answer: current.answer + data.delta });
        } else if (event === "execution") {
          update({ ...current, status: "running", executionStatus: "running" });
        } else if (event === "state") {
          update({ ...current, run: data.run ?? current.run, canReply: typeof data.canReply === "boolean" ? data.canReply : current.canReply });
        } else if (event === "run") {
          const failed = data.status === "error";
          update({ ...current, run: data, status: failed ? "error" : "scoring", executionStatus: failed ? "failed" : "succeeded" });
        } else if (event === "score") {
          update({ ...current, scores: data.scores ?? current.scores, scoringStatus: typeof data.scoringStatus === "string" ? data.scoringStatus : current.scoringStatus, scoreError: typeof data.scoreError === "string" ? data.scoreError : null });
        } else if (event === "done") {
          ended = true;
          update({ ...current, status: typeof data.status === "string" ? data.status : current.status,
            executionStatus: typeof data.executionStatus === "string" ? data.executionStatus : current.executionStatus,
            scoringStatus: typeof data.scoringStatus === "string" ? data.scoringStatus : current.scoringStatus, canEnd: false });
        } else if (event === "error") {
          ended = true;
          if (data.code === "UNIFIED_EVAL_ENDED") {
            update({ ...current, status: "cancelled", executionStatus: "cancelled", canEnd: false, canReply: false });
            return;
          }
          const persistenceError = data.code === "UNIFIED_EVAL_PERSISTENCE_FAILED";
          update({ ...current, status: persistenceError ? current.status : "error", canEnd: false, persistenceError });
          onError(typeof data.message === "string" ? data.message : "运行读取失败。", true);
        }
      }, { onActivity: touchIdle });
      if (!stopped && !ended) onError("实时连接中断，正在读取原运行。", true);
    } catch (error) {
      if (!stopped) onError(error instanceof Error ? error.message : "实时连接不可用，正在读取原运行。", true);
    } finally {
      clearTimeout(timeout);
      clearTimeout(idleTimer);
      controller?.abort();
      // 完成后再读一次，补齐重评权限等仅在详情接口返回的字段。
      if (!stopped) poll(!ended && reconnectAllowed && attempts <= maxReconnects);
    }
  }

  stopPolling = watchUnifiedRun(runId, {
    onData: data => {
      update(data);
      if (!stopped && active(data.status) && data.recoveryState !== "snapshot_only") {
        stopPolling();
        void subscribe();
      }
    },
    onError, request,
  });
  return () => { stopped = true; clearTimeout(reconnectTimer); stopPolling(); controller?.abort(); };
}
