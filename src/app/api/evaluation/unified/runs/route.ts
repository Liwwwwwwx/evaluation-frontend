import { NextRequest, NextResponse } from "next/server";
import { proxyUnified } from "@/lib/unified-evaluation-proxy";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const origin = params.get("origin");
  if (origin && !["manual", "automation", "legacy"].includes(origin)) return NextResponse.json({ ok: false, error: "运行来源无效" }, { status: 400 });
  const page = Number(params.get("page"));
  const pageSize = Number(params.get("pageSize"));
  const q = (params.get("q") || "").trim().slice(0, 100);
  const domain = (params.get("domain") || "").trim();
  const from = (params.get("from") || "").trim();
  const to = (params.get("to") || "").trim();
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if ((domain && domain !== "unclassified" && !/^[a-z0-9-]{1,64}$/.test(domain)) || (from && !datePattern.test(from)) || (to && !datePattern.test(to)) || (from && to && from > to)) return NextResponse.json({ ok: false, error: "运行筛选参数无效" }, { status: 400 });
  const query = new URLSearchParams({ page: String(Number.isInteger(page) && page > 0 ? Math.min(page, 100000) : 1), pageSize: String(Number.isInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : 20) });
  if (origin) query.set("origin", origin);
  if (q) query.set("q", q);
  if (domain) query.set("domain", domain);
  if (from) query.set("from", from);
  if (to) query.set("to", to);
  return proxyUnified(request, `/api/evaluation/unified/runs?${query}`);
}

export async function POST(request: NextRequest) {
  return proxyUnified(request, "/api/evaluation/unified/runs");
}
