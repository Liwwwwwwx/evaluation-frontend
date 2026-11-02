import { NextRequest, NextResponse } from "next/server";
import { proxyUnified } from "@/lib/unified-evaluation-proxy";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const source = params.get("source") || "all";
  const state = params.get("state") || "";
  const page = Number(params.get("page") || 1);
  const pageSize = Number(params.get("pageSize") || 20);
  if (!["all", "trial", "mission"].includes(source)) return NextResponse.json({ error: "批次来源无效" }, { status: 400 });
  if (state && !["preparing", "dispatching", "running", "done", "partial", "failed"].includes(state)) return NextResponse.json({ error: "批次状态无效" }, { status: 400 });
  if (!Number.isInteger(page) || page < 1 || page > 100000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) return NextResponse.json({ error: "分页参数无效" }, { status: 400 });
  const query = new URLSearchParams({ source, page: String(page), pageSize: String(pageSize) });
  for (const key of ["state", "from", "to"]) { const value = params.get(key); if (value) query.set(key, value); }
  return proxyUnified(request, `/api/evaluation/unified/batches?${query}`);
}
