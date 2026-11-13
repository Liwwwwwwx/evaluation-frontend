import { NextRequest, NextResponse } from "next/server";
import { adminOrigin, localCookie, upstreamCookie } from "@/lib/auth-proxy";
import { isSameOrigin } from "@/lib/evaluation-proxy";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false, error: "请求来源无效" }, { status: 403 });
  const session = request.cookies.get(localCookie)?.value;
  if (!session) return NextResponse.json({ ok: false, error: "请先登录" }, { status: 401 });
  let data: unknown;
  try { data = await request.json(); } catch { return NextResponse.json({ ok: false, error: "请求格式不正确" }, { status: 400 }); }
  const value = data && typeof data === "object" ? data as Record<string, unknown> : {};
  const serviceKey = typeof value.serviceKey === "string" ? value.serviceKey : "";
  const question = typeof value.question === "string" ? value.question.trim() : "";
  if (!['alpha-rsi', 'literature', 'literature-aircraft'].includes(serviceKey) || question.length < 8 || question.length > 500) {
    return NextResponse.json({ ok: false, error: "服务或题目不符合要求" }, { status: 400 });
  }
  try {
    const origin = adminOrigin();
    const upstream = await fetch(new URL("/api/admin/team-services/evaluations/unified/stream", origin), {
      method: "POST", headers: { Origin: origin, Cookie: `${upstreamCookie}=${session}`, "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify({ serviceKey, question,
        ...(typeof value.questionId === "string" && value.questionId.length <= 200 ? { questionId: value.questionId } : {}),
        ...(typeof value.datasetVersion === "string" && value.datasetVersion.length <= 200 ? { datasetVersion: value.datasetVersion } : {}),
        ...(value.sourceType === "fixed" || value.sourceType === "random" ? { sourceType: value.sourceType } : {}),
      }), cache: "no-store", signal: request.signal,
    });
    return new Response(upstream.body, { status: upstream.status, headers: { "Content-Type": upstream.headers.get("content-type") || "application/json", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
  } catch { return NextResponse.json({ ok: false, error: "无法连接评测服务，请稍后重试。" }, { status: 503 }); }
}
