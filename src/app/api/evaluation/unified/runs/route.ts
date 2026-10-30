import { NextRequest, NextResponse } from "next/server";
import { proxyUnified } from "@/lib/unified-evaluation-proxy";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const origin = params.get("origin");
  if (origin && !["manual", "automation", "legacy"].includes(origin)) return NextResponse.json({ ok: false, error: "运行来源无效" }, { status: 400 });
  const page = Number(params.get("page"));
  const pageSize = Number(params.get("pageSize"));
  const query = new URLSearchParams({ page: String(Number.isInteger(page) && page > 0 ? Math.min(page, 100000) : 1), pageSize: String(Number.isInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : 20) });
  if (origin) query.set("origin", origin);
  return proxyUnified(request, `/api/evaluation/unified/runs?${query}`);
}

export async function POST(request: NextRequest) {
  return proxyUnified(request, "/api/evaluation/unified/runs");
}
