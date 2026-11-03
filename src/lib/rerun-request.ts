import { createRequestKey } from "@/lib/request-key";

type StorageAccess = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function requestRerun(runId: string, { storage = sessionStorage, request = fetch }: { storage?: StorageAccess; request?: typeof fetch } = {}) {
  const storageKey = `evaluation-rerun:${runId}`;
  const raw = storage.getItem(storageKey);
  let pending: { key: string; runId?: string } | null = null;
  if (raw) {
    try {
      pending = JSON.parse(raw);
      if (!pending || typeof pending.key !== "string" || !/^[\x21-\x7e]{1,128}$/.test(pending.key) || (pending.runId !== undefined && (typeof pending.runId !== "string" || !uuid.test(pending.runId)))) throw Error();
    } catch { throw new Error("无法读取上次重跑请求，请先核对运行记录。"); }
  }
  if (pending?.runId) return pending.runId;
  const key = pending?.key || createRequestKey();
  storage.setItem(storageKey, JSON.stringify({ key }));
  const response = await request(`/api/evaluation/unified/runs/${encodeURIComponent(runId)}/rerun`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: "{}" });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (!pending && ([400,401,403,404,409,413,415,429].includes(response.status) || (response.status === 503 && data?.error?.code === "EVALUATION_WRITE_DISABLED"))) storage.removeItem(storageKey);
    throw new Error(typeof data?.error === "string" ? data.error : data?.error?.message || "提交结果尚未确认，请使用原请求重试。");
  }
  if (typeof data?.runId !== "string" || !uuid.test(data.runId)) throw new Error("未收到新运行 ID，请使用原请求重试。");
  try { storage.setItem(storageKey, JSON.stringify({ key, runId: data.runId })); } catch { /* 服务端已确认创建，仍应进入新运行。 */ }
  return data.runId as string;
}
