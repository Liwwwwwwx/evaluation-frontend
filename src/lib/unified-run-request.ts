type StorageAccess = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const pendingKey = "evaluation-unified-pending";

export async function createUnifiedRun(body: string, { storage = sessionStorage, request = fetch }: { storage?: StorageAccess; request?: typeof fetch } = {}): Promise<string> {
  const stored = storage.getItem(pendingKey);
  let pending: { key: string; body: string } | null = null;
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (!parsed || typeof parsed.key !== "string" || !/^[\x21-\x7e]{1,128}$/.test(parsed.key) || typeof parsed.body !== "string") throw Error();
      pending = parsed;
    } catch { throw new Error("上次请求状态无法读取，请先核对运行记录。"); }
  }
  if (pending && pending.body !== body) throw new Error("上次提交结果尚未确认，请使用原题和原服务重试，或先核对运行记录。");
  const key = pending?.key || crypto.randomUUID();
  storage.setItem(pendingKey, JSON.stringify({ key, body }));
  const response = await request("/api/evaluation/unified/runs", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    // 仅首次请求明确拒绝时解除。旧请求可能已创建，不能因重试时权限/限流变化丢掉幂等键。
    const rejected = [400, 401, 403, 404, 409, 413, 415, 429].includes(response.status)
      || (response.status === 503 && data?.error?.code === "EVALUATION_WRITE_DISABLED");
    if (!pending && rejected) storage.removeItem(pendingKey);
    throw new Error(typeof data?.error === "string" ? data.error : typeof data?.error?.message === "string" ? data.error.message : `请求失败（${response.status}）`);
  }
  if (typeof data?.runId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(data.runId)) throw new Error("未收到运行 ID，请使用原题重试以确认状态。");
  return data.runId;
}
