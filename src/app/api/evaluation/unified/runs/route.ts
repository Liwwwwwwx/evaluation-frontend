import { NextRequest, NextResponse } from "next/server";
import { proxyEvaluation } from "@/lib/evaluation-proxy";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const origin = params.get("origin");
  if (origin && !["manual", "automation", "legacy"].includes(origin)) return NextResponse.json({ ok: false, error: "运行来源无效" }, { status: 400 });
  const page = Number(params.get("page"));
  const pageSize = Number(params.get("pageSize"));
  const query = new URLSearchParams({ page: String(Number.isInteger(page) && page > 0 ? Math.min(page, 100000) : 1), pageSize: String(Number.isInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : 20) });
  if (origin) query.set("origin", origin);
  return proxyEvaluation(request, `/api/admin/team-services/evaluations/unified/runs?${query}`);
}

export async function POST(request: NextRequest) {
  const { adminOrigin, localCookie, upstreamCookie } = await import("@/lib/auth-proxy");
  const { isSameOrigin } = await import("@/lib/evaluation-proxy");
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false, error: "请求来源无效" }, { status: 403 });
  const session = request.cookies.get(localCookie)?.value;
  if (!session) return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 });
  const key = request.headers.get("Idempotency-Key") || "";
  if (!/^[\x21-\x7e]{1,128}$/.test(key)) return NextResponse.json({ ok: false, error: "幂等键无效" }, { status: 400 });
  try {
    const body = await request.json();
    const origin = adminOrigin();
    const upstream = await fetch(new URL("/api/admin/team-services/evaluations/unified/runs", origin), {
      method: "POST", headers: { Origin: origin, Cookie: `${upstreamCookie}=${session}`, "Content-Type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify(body), cache: "no-store", signal: request.signal,
    });
    return new Response(upstream.body, { status: upstream.status, headers: { "Content-Type": upstream.headers.get("content-type") || "application/json", "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ ok: false, error: "无法连接评测服务，请稍后重试。" }, { status: 503 }); }
}
