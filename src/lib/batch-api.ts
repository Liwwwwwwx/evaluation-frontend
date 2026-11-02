import type { BatchComparison, BatchDetail, BatchSummary, RunBrief } from "@/lib/batch-types";

const BASE = "/api/evaluation/unified/batches";

type QueryValue = string | number | undefined | null;

function query(params: Record<string, QueryValue>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  return search.toString();
}

async function read<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof value.error === "string" ? value.error : value.error?.message || value.error?.code || "批次数据读取失败。";
    throw new Error(message);
  }
  return value as T;
}

export async function fetchBatchList(params: { source?: string; state?: string; from?: string; to?: string; page: number; pageSize: number }, signal?: AbortSignal) {
  const queryString = query(params);
  return read<{ items: BatchSummary[]; total: number; page: number; pageSize: number; storageReady: boolean }>(`${BASE}${queryString ? `?${queryString}` : ""}`, signal);
}

export async function fetchBatchDetail(batchId: string, signal?: AbortSignal) {
  return read<BatchDetail>(`${BASE}/${encodeURIComponent(batchId)}`, signal);
}

export async function fetchBatchRuns(batchId: string, params: { serviceKey?: string; status?: string; execution?: string; sort?: string; page: number; pageSize: number }, signal?: AbortSignal) {
  const queryString = query(params);
  return read<{ batchId: string; items: RunBrief[]; total: number; page: number; pageSize: number }>(`${BASE}/${encodeURIComponent(batchId)}/runs${queryString ? `?${queryString}` : ""}`, signal);
}

export async function fetchBatchComparison(batchId: string, against = "previous", signal?: AbortSignal) {
  const queryString = query({ against });
  return read<BatchComparison>(`${BASE}/${encodeURIComponent(batchId)}/comparison${queryString ? `?${queryString}` : ""}`, signal);
}
