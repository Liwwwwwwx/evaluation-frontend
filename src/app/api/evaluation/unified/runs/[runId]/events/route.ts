import { NextRequest, NextResponse } from "next/server";
import { adminOrigin, localCookie, upstreamCookie } from "@/lib/auth-proxy";

export async function GET(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(runId)) return NextResponse.json({ ok: false, error: "运行 ID 不正确" }, { status: 400 });
  const session = request.cookies.get(localCookie)?.value;
  if (!session) return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 });
  try {
    const origin = adminOrigin();
    const upstream = await fetch(new URL(`/api/admin/team-services/evaluations/unified/runs/${encodeURIComponent(runId)}/events`, origin), {
      headers: { Origin: origin, Cookie: `${upstreamCookie}=${session}`, Accept: "text/event-stream" }, cache: "no-store", signal: request.signal,
    });
    return new Response(upstream.body, { status: upstream.status, headers: { "Content-Type": upstream.headers.get("content-type") || "application/json", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
  } catch { return NextResponse.json({ ok: false, error: "无法连接评测服务" }, { status: 503 }); }
}
