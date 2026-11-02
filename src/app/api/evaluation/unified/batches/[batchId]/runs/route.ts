import { NextRequest, NextResponse } from "next/server";
import { proxyUnified } from "@/lib/unified-evaluation-proxy";

export async function GET(request: NextRequest, { params }: { params: Promise<{ batchId: string }> }) {
  const { batchId } = await params;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(batchId)) return NextResponse.json({ error: "批次 ID 无效" }, { status: 400 });
  const paramsSearch = request.nextUrl.searchParams;
  const page = Number(paramsSearch.get("page") || 1);
  const pageSize = Number(paramsSearch.get("pageSize") || 20);
  if (!Number.isInteger(page) || page < 1 || page > 100000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) return NextResponse.json({ error: "分页参数无效" }, { status: 400 });
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  for (const key of ["serviceKey", "status", "execution", "sort"]) { const value = paramsSearch.get(key); if (value) query.set(key, value); }
  return proxyUnified(request, `/api/evaluation/unified/batches/${encodeURIComponent(batchId)}/runs?${query}`);
}
