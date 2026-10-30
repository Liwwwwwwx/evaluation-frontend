import { NextRequest, NextResponse } from "next/server";
import { backendOrigin } from "@/lib/evaluation-auth-proxy";

export async function proxyUnified(request: NextRequest, path: string) {
  const session = request.cookies.get("evaluation_session")?.value;
  if (!session) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const host = request.headers.get("host");
  const origin = host ? `${request.nextUrl.protocol}//${host}` : "";
  const headers = new Headers({ Accept: path.endsWith("/events") ? "text/event-stream" : "application/json", Cookie: `evaluation_session=${session}` });
  let body: string | undefined;
  if (request.method === "POST") {
    if (!origin || request.headers.get("origin") !== origin || request.headers.get("sec-fetch-site") === "cross-site") return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
    const key = request.headers.get("Idempotency-Key") || "";
    if (!/^[\x21-\x7e]{1,128}$/.test(key)) return NextResponse.json({ error: "幂等键无效" }, { status: 400 });
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return NextResponse.json({ error: "请求格式无效" }, { status: 415 });
    body = await request.text();
    if (Buffer.byteLength(body) > 16 * 1024) return NextResponse.json({ error: "请求内容过大" }, { status: 413 });
    headers.set("Origin", origin); headers.set("Content-Type", "application/json"); headers.set("Idempotency-Key", key);
  }
  try {
    const upstream = await fetch(new URL(path, backendOrigin()), { method: request.method, headers, body, cache: "no-store", redirect: "error", signal: request.signal });
    return new Response(upstream.body, { status: upstream.status, headers: { "Content-Type": upstream.headers.get("content-type") || "application/json", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
  } catch { return NextResponse.json({ error: "无法连接独立测评服务，请稍后重试。" }, { status: 503 }); }
}
